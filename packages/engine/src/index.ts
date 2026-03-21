/**
 * index.ts — YokeBot Engine entry point
 *
 * Wires everything together and exposes an HTTP API for the dashboard.
 * This is the single process that orchestrates all agents.
 */

import 'dotenv/config'
import crypto from 'node:crypto'
import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { homedir } from 'os'
import { join } from 'path'
import { createDb } from './db/index.ts'
import { createAgent, listAgents, getAgent, updateAgent, deleteAgent, setAgentStatus } from './agent.ts'
import { runReactLoop, buildAgentSystemPrompt } from './runtime.ts'
import { startScheduler, stopScheduler, drainScheduler, scheduleAgent, unscheduleAgent, respondToMention, initSchedulerState, triggerAgentNow } from './scheduler.ts'
import { createApproval, listPendingApprovals, resolveApproval, countPendingApprovals } from './approval.ts'
import { createTask, listTasks, getTask, updateTask, deleteTask, unblockTask } from './tasks.ts'
import { createTag, listTags, updateTag, deleteTag, tagResource, untagResource, bulkSetResourceTags } from './tags.ts'
import { createChannel, getChannel, listChannels, getDmChannel, getTaskThread, getTeamChannel, sendMessage, getChannelMessages, getThreadReplies, getMessagesByTaskId, processMentions, searchMessages, addChatSseClient, broadcastChatEvent, markChannelRead, getUnreadCounts, markTaskRead, getUnreadTaskIds } from './chat.ts'
import { initWorkspace, listFiles, readFile, readBinaryFile, writeFile, writeBinaryFile, renameFile, deleteFile, getFilesByTask, markFileRead, getUnreadFileIds, getFileByPath, type WorkspaceConfig } from './workspace.ts'
// Note: WorkspaceConfig kept for backward compat — workspace is now DB-backed
import { loadSkillsFromDir, getAgentSkills, installSkill, uninstallSkill } from './skills.ts'
import { logActivity, listActivity, countActivity } from './activity.ts'
import { detectOllama, setFallbackConfig, setHostedResolver, resolveModelConfig, getAvailableModels, upsertProvider, listStoredProviders, PROVIDERS, chatCompletion, type ChatMessage as LlmMessage } from './model.ts'
import { createSorTable, listSorTables, addSorColumn, listSorColumns, addSorRow, listSorRows, updateSorRow, deleteSorRow, getSorPermissions, setSorPermission, getSorTable, importCsvAsTable } from './sor.ts'
import { createTeam, listTeams, getTeam, getUserTeams, addMember, removeMember, getTeamMembers, updateMemberRole, updateMemberDisplayName, deleteTeam, getTeamAgentIds, findUserByEmail } from './teams.ts'
import { authMiddleware, setApiKeyDb } from './auth-middleware.ts'
import { createApiKey, listApiKeys, revokeApiKey, regenerateApiKey, deleteApiKey, hasScope } from './api-keys.ts'
import { createTeamMiddleware, requireRole } from './team-middleware.ts'
import { listNotifications, countUnread, markRead, markAllRead, listPreferences, setPreference, notifyTeam, listAlertPreferences, setBulkAlertPreferences } from './notifications.ts'
import { createGoal, getGoal, listGoals, updateGoal, deleteGoal, linkTask, unlinkTask, getGoalTasks, type GoalStatus } from './goals.ts'
import { createKpiGoal, getKpiGoal, listKpiGoals, updateKpiGoal, deleteKpiGoal, type KpiGoalStatus } from './kpi-goals.ts'
import { validate, CreateAgentSchema, UpdateAgentSchema, ChatWithAgentSchema, CreateTaskSchema, UpdateTaskSchema, CreateChannelSchema, SendChatMessageSchema, CreateApprovalSchema, ResolveApprovalSchema, CreateSorTableSchema, UpdateSorPermissionSchema, WriteFileSchema, UpdateProviderSchema, InstallSkillSchema, CreateTeamSchema, UpdateTeamSchema, AddMemberSchema, UpdateRoleSchema, SetCredentialSchema, UploadKbDocumentSchema, SearchKbSchema, CreateWorkflowSchema, UpdateWorkflowSchema, CaptureWorkflowSchema, AddWorkflowStepSchema, UpdateWorkflowStepSchema, ReorderWorkflowStepsSchema, CreateTagSchema, UpdateTagSchema, TagResourceSchema, BulkSetTagsSchema, CreateApiKeySchema, CreateVideoProjectSchema, UpdateVideoProjectSchema, AddVideoSceneSchema, UpdateVideoSceneSchema, ReorderVideoScenesSchema, AddVideoAssetSchema, UpdateVideoAssetSchema, ApplyTranscriptEditsSchema, UpdateTranscriptionSchema, CreateBrowserSessionSchema, BrowserInteractSchema, BrowserNavigateSchema, SaveBrowserToVaultSchema } from './validation.ts'
import { createWorkflow, getWorkflow, listWorkflows, updateWorkflow, deleteWorkflow, addStep, updateStep, deleteStep, listSteps, reorderSteps, startRun, getRun, listRuns, cancelRun, listRunSteps, captureWorkflow, findWorkflowsByTableTrigger } from './workflows.ts'
import { createVideoProject, getVideoProject, listVideoProjects, updateVideoProject, deleteVideoProject, addScene, getScene, listScenes, updateScene, deleteScene, reorderScenes, addAsset, getAsset, listAssets, updateAsset, deleteAsset, transcribeAsset } from './video-projects.ts'
import { advanceWorkflow, onTaskCompleted, approveWorkflowStep } from './workflow-executor.ts'
import { uploadDocument, listDocuments, getDocument, deleteDocument, getDocumentChunks, searchKb } from './knowledge-base.ts'
import { listCredentials, setCredential, deleteCredential } from './credentials.ts'
import {
  createVaultSession, listVaultSessions, revokeVaultSession, deleteVaultSession,
  getVaultLogs, logVaultEvent,
} from './session-vault.ts'
import {
  startRecording, sendInteraction, captureScreenshot, finishRecording,
  cancelRecording, hasActiveRecording, getRecordingSession,
  type InteractionAction,
} from './vault-browser.ts'
import {
  createBrowserSession, interactWithSession, getSessionScreenshot,
  navigateSession, saveSessionToVault, closeBrowserSession as closeBrowserSess,
  listActiveSessions, getSessionInfo, setSessionController,
  type InteractionAction as BrowserInteractionAction,
} from './browser-sessions.ts'
import { captureAgentScreenshot, setBrowserBroadcast } from './browser.ts'
import { installBrowserStreamHandler, setBrowserStreamTeamCheck } from './browser-stream.ts'
import { listServices } from './services.ts'
import { listTemplates, getTemplate } from './templates.ts'
import { listMcpServers, addMcpServer, removeMcpServer, connectMcpServer } from './mcp-client.ts'
import { addCredits, getSubscription } from './billing.ts'
import { generateSpeech } from './cloud/tts.ts'

const PORT = Number(process.env.PORT ?? process.env.YOKEBOT_PORT ?? 3001)
const DATA_DIR = process.env.YOKEBOT_DATA_DIR ?? join(homedir(), '.yokebot')
const WORKSPACE_DIR = process.env.YOKEBOT_WORKSPACE_DIR ?? join(DATA_DIR, 'workspace')
const SKILLS_DIR = process.env.YOKEBOT_SKILLS_DIR ?? join(process.cwd(), '..', '..', 'skills')

/** Fire any workflows triggered by a table row event */
async function fireTableWorkflows(
  db: import('./db/types.ts').Db,
  teamId: string,
  tableId: string,
  triggerType: 'row_added' | 'row_updated',
  rowData: Record<string, unknown>,
) {
  const workflows = await findWorkflowsByTableTrigger(db, teamId, tableId, triggerType)
  if (workflows.length === 0) return

  // Look up table name for context
  const table = await getSorTable(db, tableId)
  const tableName = table?.name ?? tableId

  for (const wf of workflows) {
    // Don't fire if there's already an active run for this workflow
    const activeRuns = await listRuns(db, { workflowId: wf.id, status: 'running' as const })
    const pausedRuns = await listRuns(db, { workflowId: wf.id, status: 'paused' as const })
    if (activeRuns.length > 0 || pausedRuns.length > 0) continue

    const run = await startRun(db, teamId, wf.id, 'table_trigger', { tableName, row: rowData, triggerType })
    await advanceWorkflow(db, run.id)
  }
}

async function main() {
  // Initialize database (async — picks SQLite or Postgres based on DATABASE_URL)
  const db = await createDb({ dataDir: DATA_DIR })

  // Inject DB into auth middleware for API key validation
  setApiKeyDb(db)

  // Register hosted mode routing if enabled (reads API keys from env vars instead of DB)
  if (process.env.YOKEBOT_HOSTED_MODE === 'true') {
    try {
      // Dynamic import from /ee — plain JS, outside engine rootDir
      const eePath = '../../../ee/hosted-routing.js'
      const ee = await import(/* @vite-ignore */ eePath) as { hostedResolveModelConfig: typeof resolveModelConfig }
      setHostedResolver(ee.hostedResolveModelConfig)
      console.log('[engine] Hosted mode enabled — using env var routing')
    } catch (err) {
      console.error('[engine] Failed to load hosted routing module:', (err as Error).message)
    }
  }

  // Initialize workspace
  const workspaceConfig: WorkspaceConfig = { rootDir: WORKSPACE_DIR }
  initWorkspace(workspaceConfig)

  // Create Express app
  const app = express()

  // Trust proxy — Railway uses 1 reverse proxy layer (X-Forwarded-For)
  app.set('trust proxy', 1)

  // Security headers — relax cross-origin policies for dashboard ↔ engine
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: false,
    contentSecurityPolicy: false, // CSP not useful for a JSON API
    frameguard: false, // We handle X-Frame-Options per-route (proxy needs iframe embedding)
  }))

  // CORS — restrict to known origins in production
  const CORS_ORIGINS = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((s) => s.trim())
    : ['http://localhost:5173', 'http://localhost:3000']
  app.use(cors({
    origin: (origin, callback) => {
      // Allow server-to-server requests (no Origin header) — e.g. API key calls from scripts/CI
      if (!origin) return callback(null, true)
      if (CORS_ORIGINS.includes(origin)) return callback(null, true)
      callback(new Error('Not allowed by CORS'))
    },
    credentials: true,
  }))

  // Stripe webhook needs raw body for signature verification — must come BEFORE express.json()
  app.use('/api/billing/webhook', express.raw({ type: 'application/json' }))

  // Body size limit
  app.use(express.json({ limit: '1mb' }))

  // Rate limit tiers for API key requests (per key, per minute)
  const API_KEY_RATE_LIMITS: Record<string, number> = {
    none: 20, team: 60, business: 200, enterprise: 600,
  }
  const API_KEY_CHAT_LIMITS: Record<string, number> = {
    none: 5, team: 20, business: 50, enterprise: 100,
  }

  /** Look up the subscription tier for an API key's team */
  async function getApiKeyTier(req: Request): Promise<string> {
    if (!req.apiKey) return 'none'
    try {
      const sub = await getSubscription(db, req.apiKey.teamId)
      return sub?.tier ?? 'none'
    } catch { return 'none' }
  }

  // Rate limiting — general (per user/team, generous for dashboard polling)
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: async (req) => {
      // API key requests get tighter per-minute limits (converted to 15-min window)
      if (req.apiKey) {
        const tier = await getApiKeyTier(req)
        return (API_KEY_RATE_LIMITS[tier] ?? 20) * 15
      }
      return 5000 // JWT/dashboard
    },
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
    keyGenerator: (req) => {
      // API key requests rate-limit per key ID
      if (req.apiKey) return `apikey:${req.apiKey.id}`
      return req.headers['x-team-id'] as string ?? ipKeyGenerator(req.ip ?? '0.0.0.0')
    },
    skip: (req) => req.path === '/health' || req.path === '/api/config',
  }))

  // Stricter rate limit for chat completions (LLM calls are expensive)
  const chatLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: async (req) => {
      if (req.apiKey) {
        const tier = await getApiKeyTier(req)
        return API_KEY_CHAT_LIMITS[tier] ?? 5
      }
      return 10 // JWT/dashboard
    },
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Chat rate limit exceeded, please wait' },
    keyGenerator: (req) => {
      if (req.apiKey) return `apikey:chat:${req.apiKey.id}`
      return ipKeyGenerator(req.ip ?? '0.0.0.0')
    },
  })

  // Request timing (log slow requests)
  app.use((req, res, next) => {
    const start = Date.now()
    res.on('finish', () => {
      const ms = Date.now() - start
      if (ms > 200 || req.path.includes('/detail')) {
        console.log(`[perf] ${req.method} ${req.path} → ${res.statusCode} in ${ms}ms`)
      }
    })
    next()
  })

  // ===== Published app routing (*.yokebot.app + custom domains) =====
  // This MUST be before auth middleware — published apps are public-facing.
  app.use(async (req, res, next) => {
    const host = req.hostname

    try {
      const { getPublishedAppBySubdomain, getPublishedAppByCustomDomain, serveStaticFile } = await import('./publish.ts')
      let publishedApp = null

      // Check if this is a *.yokebot.app subdomain
      if (host?.endsWith('.yokebot.app')) {
        const subdomain = host.replace('.yokebot.app', '')
        if (!subdomain || subdomain.includes('.')) return next()
        publishedApp = await getPublishedAppBySubdomain(db, subdomain)
      }
      // Check if this is a custom domain
      else if (host && !host.includes('yokebot.com') && !host.includes('localhost')) {
        publishedApp = await getPublishedAppByCustomDomain(db, host)
      }

      if (!publishedApp) return next()

      if (publishedApp.hostingType === 'static' || publishedApp.hostingType === 'custom-domain') {
        const result = await serveStaticFile(publishedApp, req.path)
        res.status(result.status).set('Content-Type', result.contentType)
        if (result.body) {
          res.set('Cache-Control', 'public, max-age=3600')
          res.send(result.body)
        } else {
          res.send('Not found')
        }
      } else if (publishedApp.hostingType === 'dynamic' && publishedApp.railwayServiceId) {
        // Dynamic apps have their custom domain pointed directly at Railway
        // This fallback handles the case where DNS isn't fully propagated
        if (publishedApp.publishedUrl) {
          res.redirect(307, publishedApp.publishedUrl)
        } else {
          res.status(503).send('App is being deployed...')
        }
      } else {
        res.status(503).send('App is not available')
      }
    } catch (err) {
      console.error(`[publish] Routing error for ${host}:`, (err as Error).message)
      return next() // Fall through to normal API routing on error
    }
  })

  // ===== Sandbox Preview Proxy (unauthenticated — uses proxy token) =====
  // Uses http-proxy-middleware for proper HTTP + WebSocket (Vite HMR) proxying.
  // This MUST be before auth middleware — iframe can't send JWT headers.
  // Security: requires a short-lived proxy token generated by an authenticated endpoint.
  const proxyTokenStore = new Map<string, { teamId: string; signedUrl: string; expires: number }>()

  // Resolve a proxy token from URL param, cookie, or Referer header
  const resolveProxyToken = (req: { params?: Record<string, unknown>; headers: Record<string, string | string[] | undefined> }) => {
    // 1. Token in URL path (e.g. /api/sandbox/proxy/TOKEN/...)
    const urlToken = req.params?.token as string | undefined
    if (urlToken) {
      const entry = proxyTokenStore.get(urlToken)
      if (entry && Date.now() <= entry.expires) return { token: urlToken, entry }
    }
    // 2. Token in cookie (works in new tab, may fail in cross-origin iframe)
    const cookieHeader = (req.headers.cookie as string) ?? ''
    const cookieToken = cookieHeader.split(';').map(c => c.trim()).find(c => c.startsWith('spt='))?.slice(4)
    if (cookieToken) {
      const entry = proxyTokenStore.get(cookieToken)
      if (entry && Date.now() <= entry.expires) return { token: cookieToken, entry }
    }
    // 3. Token from Referer header (iframe fallback — browser sends referer on subresource loads)
    const referer = (req.headers.referer as string) ?? ''
    const refMatch = referer.match(/\/api\/sandbox\/proxy\/(spt_[^/]+)/)
    if (refMatch) {
      const refToken = refMatch[1]
      const entry = proxyTokenStore.get(refToken)
      if (entry && Date.now() <= entry.expires) return { token: refToken, entry }
    }
    return null
  }

  // Create the proxy middleware using http-proxy-middleware
  const { createProxyMiddleware } = await import('http-proxy-middleware')

  const sandboxProxy = createProxyMiddleware({
    // Dynamic target per-request based on proxy token
    router: (req) => {
      const resolved = resolveProxyToken(req as unknown as Request)
      if (!resolved) return 'http://localhost:1' // will fail, handled below
      const base = new URL(resolved.entry.signedUrl)
      return base.origin
    },
    changeOrigin: true,
    ws: true,
    // Inject Daytona signed URL params into every proxied request
    on: {
      proxyReq: (proxyReq, req) => {
        const resolved = resolveProxyToken(req as unknown as Request)
        if (resolved) {
          proxyReq.setHeader('X-Daytona-Skip-Preview-Warning', 'true')
          const base = new URL(resolved.entry.signedUrl)
          const signedParams = base.searchParams.toString()
          if (signedParams) {
            const sep = proxyReq.path.includes('?') ? '&' : '?'
            proxyReq.path += sep + signedParams
          }
        }
      },
      // selfHandleResponse: pipe all responses manually, inject cookie into HTML
      proxyRes: (proxyRes: import('http').IncomingMessage, req: import('http').IncomingMessage, res: import('http').ServerResponse) => {
        const contentType = (proxyRes.headers['content-type'] as string) ?? ''

        const resolved = resolveProxyToken(req as unknown as Request)
        if (!contentType.includes('text/html') || !resolved) {
          // Non-HTML or no token: copy status + headers and pipe through
          res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers)
          proxyRes.pipe(res)
          return
        }

        // HTML response: buffer, inject cookie script + editor bridge, then send
        const chunks: Buffer[] = []
        proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk))
        proxyRes.on('end', () => {
          let html = Buffer.concat(chunks).toString()
          html = html.replace('<head>', `<head>\n<script>document.cookie="spt=${resolved.token};path=/;max-age=14400;SameSite=Lax";</script>`)
          // Inject visual editor bridge script before </body>
          html = html.replace('</body>', `<script src="/api/sandbox/yokebot-editor.js"></script>\n</body>`)
          // Copy headers but fix content-length since we modified the body
          const headers = { ...proxyRes.headers }
          delete headers['content-length']
          res.writeHead(proxyRes.statusCode ?? 200, headers)
          res.end(html)
        })
      },
      error: (err: Error, _req: import('http').IncomingMessage, res: unknown) => {
        console.error('[sandbox-proxy] Error:', err.message)
        const sRes = res as import('http').ServerResponse | undefined
        if (sRes && typeof sRes.writeHead === 'function' && !sRes.headersSent) {
          sRes.writeHead(502)
          sRes.end(JSON.stringify({ error: `Proxy error: ${err.message}` }))
        }
      },
    },
    selfHandleResponse: true, // needed for HTML injection in proxyRes
  } as Parameters<typeof createProxyMiddleware>[0])

  // Route 1: Explicit proxy path /api/sandbox/proxy/TOKEN/...
  app.all('/api/sandbox/proxy/:token/*path', (req, res, next) => {
    const resolved = resolveProxyToken(req)
    if (!resolved) return res.status(401).json({ error: 'Proxy token expired or invalid. Refresh the preview.' })
    // Rewrite URL to strip proxy prefix — the target sees just the subpath
    const rawPath = req.params.path
    const subPath = Array.isArray(rawPath) ? rawPath.join('/') : (rawPath || '')
    req.url = '/' + subPath
    sandboxProxy(req, res, next)
  })
  app.all('/api/sandbox/proxy/:token', (req, res, next) => {
    const resolved = resolveProxyToken(req)
    if (!resolved) return res.status(401).json({ error: 'Proxy token expired or invalid. Refresh the preview.' })
    req.url = '/'
    sandboxProxy(req, res, next)
  })

  // Route 2: Catch-all for ANY non-API request with a valid spt cookie.
  // Vite JS imports use absolute paths (/src/main.tsx, /@vite/client, /node_modules/.vite/deps/react.js)
  // and public assets (/vite.svg, /images/logo.png) also need proxying.
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/') || req.path === '/health') return next()
    const resolved = resolveProxyToken(req)
    if (!resolved) return next()
    sandboxProxy(req, res, next)
  })

  // Serve yokebot-editor.js (unauthenticated — loaded inside proxied iframe)
  app.get('/api/sandbox/yokebot-editor.js', async (_req, res) => {
    try {
      const { readFileSync } = await import('node:fs')
      const { fileURLToPath } = await import('node:url')
      const { dirname, join: pathJoin } = await import('node:path')
      const __filename = fileURLToPath(import.meta.url)
      const __dirname = dirname(__filename)
      let scriptPath = pathJoin(__dirname, 'yokebot-editor.js')
      try { readFileSync(scriptPath); } catch { scriptPath = pathJoin(__dirname, '..', 'src', 'yokebot-editor.js') }
      const js = readFileSync(scriptPath, 'utf-8')
      res.setHeader('Content-Type', 'application/javascript')
      res.setHeader('Cache-Control', 'public, max-age=60')
      res.send(js)
    } catch (err) {
      res.status(500).send(`// yokebot-editor.js load error: ${(err as Error).message}`)
    }
  })

  // Auth
  app.use(authMiddleware)

  // Team context — resolves X-Team-Id header, verifies membership
  app.use(createTeamMiddleware(db))

  // Billing gate — only active in hosted mode (requires active subscription)
  const { createBillingMiddleware } = await import('./billing-middleware.ts')
  app.use(createBillingMiddleware(db))

  // Billing API routes (checkout, webhook, status)
  const { registerBillingRoutes } = await import('./billing-routes.ts')
  registerBillingRoutes(app, db)

  // ===== API Key Management (admin only) =====

  app.post('/api/api-keys', async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireRole(req, res, 'admin')
      if (res.headersSent) return
      const { name, scopes, expiresAt } = validate(CreateApiKeySchema, req.body)
      const scopeStr = scopes?.join(',') ?? '*'
      const key = await createApiKey(db, req.user!.activeTeamId!, req.user!.id, name, scopeStr, expiresAt)
      res.status(201).json(key)
    } catch (err) { next(err) }
  })

  app.get('/api/api-keys', async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireRole(req, res, 'admin')
      if (res.headersSent) return
      const keys = await listApiKeys(db, req.user!.activeTeamId!)
      res.json(keys)
    } catch (err) { next(err) }
  })

  app.delete('/api/api-keys/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireRole(req, res, 'admin')
      if (res.headersSent) return
      const id = req.params.id as string
      const ok = await deleteApiKey(db, id, req.user!.activeTeamId!)
      if (!ok) { res.status(404).json({ error: 'API key not found' }); return }
      res.json({ ok: true })
    } catch (err) { next(err) }
  })

  app.post('/api/api-keys/:id/revoke', async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireRole(req, res, 'admin')
      if (res.headersSent) return
      const id = req.params.id as string
      const ok = await revokeApiKey(db, id, req.user!.activeTeamId!)
      if (!ok) { res.status(404).json({ error: 'API key not found or already revoked' }); return }
      res.json({ ok: true })
    } catch (err) { next(err) }
  })

  app.post('/api/api-keys/:id/regenerate', async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireRole(req, res, 'admin')
      if (res.headersSent) return
      const id = req.params.id as string
      const newKey = await regenerateApiKey(db, id, req.user!.activeTeamId!, req.user!.id)
      if (!newKey) { res.status(404).json({ error: 'API key not found' }); return }
      res.json(newKey)
    } catch (err) { next(err) }
  })

  // ===== Scope enforcement for API key requests =====
  // Maps URL path prefixes → required scopes (read for GET, write for mutations)
  const SCOPE_MAP: Array<{ prefix: string; readScope: string; writeScope: string }> = [
    { prefix: '/api/agents', readScope: 'agents:read', writeScope: 'agents:write' },
    { prefix: '/api/tasks', readScope: 'tasks:read', writeScope: 'tasks:write' },
    { prefix: '/api/chat', readScope: 'chat:read', writeScope: 'chat:write' },
    { prefix: '/api/data', readScope: 'data:read', writeScope: 'data:write' },
    { prefix: '/api/sor', readScope: 'data:read', writeScope: 'data:write' },
    { prefix: '/api/files', readScope: 'files:read', writeScope: 'files:write' },
    { prefix: '/api/workspace', readScope: 'files:read', writeScope: 'files:write' },
    { prefix: '/api/kb', readScope: 'kb:read', writeScope: 'kb:write' },
    { prefix: '/api/knowledge-base', readScope: 'kb:read', writeScope: 'kb:write' },
  ]

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!req.apiKey) { next(); return }
    const match = SCOPE_MAP.find((s) => req.path.startsWith(s.prefix))
    if (!match) { next(); return }
    const isRead = req.method === 'GET' || req.method === 'HEAD'
    const required = isRead ? match.readScope : match.writeScope
    if (hasScope(req.apiKey.scopes, required)) { next(); return }
    res.status(403).json({ error: `API key missing required scope: ${required}` })
  })

  // ===== Ownership verification helper =====
  // Prevents IDOR: verifies an object belongs to the requesting user's team
  // Uses pre-defined queries to avoid SQL injection via table name interpolation
  const OWNERSHIP_QUERIES: Record<string, string> = {
    agents: 'SELECT team_id FROM agents WHERE id = $1',
    tasks: 'SELECT team_id FROM tasks WHERE id = $1',
    goals: 'SELECT team_id FROM goals WHERE id = $1',
    kpi_goals: 'SELECT team_id FROM kpi_goals WHERE id = $1',
    approvals: 'SELECT team_id FROM approvals WHERE id = $1',
    chat_channels: 'SELECT team_id FROM chat_channels WHERE id = $1',
    sor_tables: 'SELECT team_id FROM sor_tables WHERE id = $1',
    kb_documents: 'SELECT team_id FROM kb_documents WHERE id = $1',
    workflows: 'SELECT team_id FROM workflows WHERE id = $1',
    workflow_runs: 'SELECT team_id FROM workflow_runs WHERE id = $1',
    video_projects: 'SELECT team_id FROM video_projects WHERE id = $1',
  }
  async function verifyOwnership(table: string, id: string, teamId: string): Promise<boolean> {
    const query = OWNERSHIP_QUERIES[table]
    if (!query) throw new Error(`verifyOwnership: unknown table "${table}"`)
    const row = await db.queryOne<{ team_id: string }>(query, [id])
    return row !== null && row.team_id === teamId
  }

  // ===== Health =====

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: '0.0.1' })
  })

  // ===== Server-Sent Events (SSE) — real-time updates per user =====

  const sseClients = new Map<string, Set<Response>>() // userId → SSE connections

  function broadcastToUser(userId: string, event: string, data: unknown): void {
    const clients = sseClients.get(userId)
    if (!clients) return
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    for (const res of clients) {
      try { res.write(frame) } catch { /* client gone */ }
    }
  }

  function broadcastToTeam(teamId: string, event: string, data: unknown): void {
    // For team-wide broadcasts, we need to look up members.
    // We cache connected user → teamId associations from their SSE connections.
    for (const [userId, clients] of sseClients) {
      if (clients.size === 0) continue
      // Each client stores its teamId on the response object
      for (const res of clients) {
        if ((res as Response & { _sseTeamId?: string })._sseTeamId === teamId) {
          const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
          try { res.write(frame) } catch { /* client gone */ }
        }
      }
    }
  }

  app.get('/api/events', async (req, res) => {
    const userId = req.user!.id
    const teamId = req.user!.activeTeamId!

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`)

    // Tag this response with the team ID for team-wide broadcasts
    ;(res as Response & { _sseTeamId?: string })._sseTeamId = teamId

    if (!sseClients.has(userId)) sseClients.set(userId, new Set())
    sseClients.get(userId)!.add(res)

    // Send initial state snapshot
    try {
      const [notifCount, unreadCounts, approvalCnt, billingStatus] = await Promise.all([
        countUnread(db, userId),
        getUnreadCounts(db, userId, teamId),
        countPendingApprovals(db, teamId),
        (async () => {
          const { getSubscription, getCreditBalance } = await import('./billing.ts')
          const sub = await getSubscription(db, teamId)
          const credits = await getCreditBalance(db, teamId)
          return { credits, tier: sub?.tier ?? 'none' }
        })(),
      ])

      res.write(`event: notification_count\ndata: ${JSON.stringify({ count: notifCount })}\n\n`)
      res.write(`event: unread_counts\ndata: ${JSON.stringify(unreadCounts)}\n\n`)
      res.write(`event: approval_count\ndata: ${JSON.stringify({ count: approvalCnt })}\n\n`)
      res.write(`event: credits\ndata: ${JSON.stringify(billingStatus)}\n\n`)
    } catch (err) {
      console.error('[sse] Failed to send initial state:', err)
    }

    // Keep-alive every 30s
    const keepAlive = setInterval(() => {
      try { res.write(': keepalive\n\n') } catch { clearInterval(keepAlive) }
    }, 30_000)

    req.on('close', () => {
      clearInterval(keepAlive)
      sseClients.get(userId)?.delete(res)
      if (sseClients.get(userId)?.size === 0) sseClients.delete(userId)
    })
  })

  // ===== Internal broadcast endpoint for worker process =====
  // The worker process (worker.ts) runs heartbeat sprints in a separate Node process.
  // It doesn't have SSE connections, so it POSTs events here for relay to clients.
  const INTERNAL_SECRET = process.env.INTERNAL_BROADCAST_SECRET || 'yokebot-internal-broadcast'
  app.post('/internal/broadcast', (req, res) => {
    if (req.headers['x-internal-secret'] !== INTERNAL_SECRET) {
      res.status(403).json({ error: 'forbidden' })
      return
    }
    const { event, teamId, data } = req.body as { event: string; teamId: string; data: unknown }
    if (!event || !teamId) {
      res.status(400).json({ error: 'missing event or teamId' })
      return
    }
    broadcastToTeam(teamId, event, data)
    res.status(204).end()
  })

  // ===== Wire broadcast hooks into modules =====
  // This lets sendMessage() and createNotification() push real-time SSE events
  // without needing direct access to the SSE client map.
  {
    const { setNewMessageBroadcast, setAgentTypingBroadcast, setAgentProgressBroadcast, setFileWrittenBroadcast } = await import('./chat.ts')
    setNewMessageBroadcast((teamId, channelId, messageId) => {
      broadcastToTeam(teamId, 'new_message', { channelId, messageId })
    })
    setAgentTypingBroadcast((teamId, data) => {
      broadcastToTeam(teamId, 'agent_typing', data)
    })
    setAgentProgressBroadcast((teamId, data) => {
      broadcastToTeam(teamId, 'agent_progress', data)
    })
    setFileWrittenBroadcast((teamId, path) => {
      broadcastToTeam(teamId, 'file_written', { path })
    })

    const { setNotificationBroadcast } = await import('./notifications.ts')
    setNotificationBroadcast((userId, count) => {
      broadcastToUser(userId, 'notification_count', { count })
    })

    const { setCreditBroadcast } = await import('./billing.ts')
    setCreditBroadcast((teamId, credits) => {
      broadcastToTeam(teamId, 'credits', { credits })
    })

    // Wire browser broadcast so MCP browser tool calls push screenshots to viewers
    setBrowserBroadcast((teamId, event, data) => {
      broadcastToTeam(teamId, event, data)
    })

    // Wire sandbox broadcast so preview URLs auto-open in dashboard
    const { setSandboxBroadcast } = await import('./sandbox.ts')
    setSandboxBroadcast((teamId, url) => {
      broadcastToTeam(teamId, 'sandbox_preview', { url })
    })

    // Wire publish broadcast so dashboard updates when apps are published
    const { setPublishBroadcast } = await import('./publish.ts')
    setPublishBroadcast((teamId, app) => {
      broadcastToTeam(teamId, 'app_published', app)
    })

    // Wire skill warning broadcast for Layer 2 failure detection
    const { setSkillWarningBroadcast } = await import('./skill-runs.ts')
    setSkillWarningBroadcast((teamId, data) => {
      broadcastToTeam(teamId, 'skill_warning', data)
    })
  }

  // ===== Ollama Detection =====

  app.get('/api/ollama', async (_req, res) => {
    const result = await detectOllama()
    res.json(result)
  })

  // ===== Agents =====

  app.get('/api/agents', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    res.json(await listAgents(db, teamId))
  })

  // Bulk pause/resume all agents for a team
  app.post('/api/agents/bulk-status', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    const { status } = req.body as { status: string }
    if (status !== 'running' && status !== 'paused') return res.status(400).json({ error: 'status must be "running" or "paused"' })
    const agents = await listAgents(db, teamId)
    const targetAgents = agents.filter(a => status === 'running' ? a.status === 'paused' : a.status === 'running')
    for (const agent of targetAgents) {
      await setAgentStatus(db, agent.id, status)
      if (status === 'running') {
        scheduleAgent(db, agent)
      } else {
        unscheduleAgent(agent.id)
      }
    }
    await logActivity(db, status === 'running' ? 'agents_resumed' : 'agents_paused', null, `All agents ${status === 'running' ? 'resumed' : 'paused'} (${targetAgents.length})`, undefined, teamId)
    res.json({ updated: targetAgents.length, status })
  })

  app.get('/api/agents/:id', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('agents', req.params.id, teamId)) return res.status(404).json({ error: 'Agent not found' })
    const agent = await getAgent(db, req.params.id)
    if (!agent) return res.status(404).json({ error: 'Agent not found' })
    res.json(agent)
  })

  app.post('/api/agents', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    const body = validate(CreateAgentSchema, req.body)

    // Block hosted-only templates in self-hosted mode
    const templateId = (req.body as Record<string, unknown>).templateId as string | undefined
    if (templateId) {
      const tmpl = getTemplate(templateId)
      if (tmpl?.hostedOnly && process.env.YOKEBOT_HOSTED_MODE !== 'true') {
        return res.status(403).json({ error: 'This agent is only available on YokeBot Cloud.' })
      }
    }

    // Sanity cap at 100 agents to prevent abuse (credits are the real throttle)
    if (process.env.YOKEBOT_HOSTED_MODE === 'true') {
      const existing = await listAgents(db, teamId)
      if (existing.length >= 100) {
        return res.status(403).json({ error: 'Maximum 100 agents per team. Contact support if you need more.' })
      }
    }

    // Resolve model config from modelId (or explicit endpoint/name, or default to deepseek-v3.2)
    const resolvedModelId = body.modelId || 'deepseek-v3.2'
    let modelConfig = body.modelEndpoint && body.modelName
      ? { endpoint: body.modelEndpoint, model: body.modelName }
      : await resolveModelConfig(db, resolvedModelId)
    if (!modelConfig) {
      modelConfig = { endpoint: 'ollama', model: 'llama3.2' }
    }

    const agent = await createAgent(db, teamId, {
      name: body.name,
      department: body.department,
      systemPrompt: body.systemPrompt,
      modelId: resolvedModelId,
      modelConfig,
      proactive: body.proactive,
      heartbeatSeconds: body.heartbeatSeconds,
      templateId,
    })

    // Auto-start the agent so it's immediately available
    await setAgentStatus(db, agent.id, 'running')
    scheduleAgent(db, { ...agent, status: 'running' })

    await logActivity(db, 'agent_created', agent.id, `Agent "${agent.name}" created`, undefined, teamId)
    broadcastToTeam(teamId, 'agent_status', { agentId: agent.id, status: 'running' })
    res.status(201).json({ ...agent, status: 'running' })
  })

  app.patch('/api/agents/:id', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('agents', req.params.id, teamId)) return res.status(404).json({ error: 'Agent not found' })
    const body = validate(UpdateAgentSchema, req.body)
    const agent = await updateAgent(db, req.params.id, body as Record<string, unknown>)
    if (!agent) return res.status(404).json({ error: 'Agent not found' })
    res.json(agent)
  })

  app.delete('/api/agents/:id', async (req, res) => {
    if (!requireRole(req, res, 'admin')) return
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('agents', req.params.id, teamId)) return res.status(404).json({ error: 'Agent not found' })
    const agent = await getAgent(db, req.params.id)
    await logActivity(db, 'agent_deleted', req.params.id, `Agent "${agent?.name ?? req.params.id}" deleted`, undefined, teamId)
    await deleteAgent(db, req.params.id)
    unscheduleAgent(req.params.id)
    res.status(204).end()
  })

  // Start/stop agent
  app.post('/api/agents/:id/start', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('agents', req.params.id, teamId)) return res.status(404).json({ error: 'Agent not found' })
    const agent = await getAgent(db, req.params.id)
    if (!agent) return res.status(404).json({ error: 'Agent not found' })

    // Enforce heartbeat and active hours in hosted mode
    if (req.subscription) {
      if (agent.heartbeatSeconds < req.subscription.minHeartbeatSeconds) {
        return res.status(403).json({
          error: `Your ${req.subscription.tier} plan minimum heartbeat is ${req.subscription.minHeartbeatSeconds / 60} minutes.`,
          code: 'HEARTBEAT_LIMIT',
        })
      }
      if (agent.activeHoursStart < req.subscription.activeHoursStart || agent.activeHoursEnd > req.subscription.activeHoursEnd) {
        return res.status(403).json({
          error: `Your ${req.subscription.tier} plan allows active hours ${req.subscription.activeHoursStart}:00-${req.subscription.activeHoursEnd}:00.`,
          code: 'ACTIVE_HOURS_LIMIT',
        })
      }
    }

    await setAgentStatus(db, agent.id, 'running')
    scheduleAgent(db, { ...agent, status: 'running' })
    await logActivity(db, 'agent_started', agent.id, `Agent "${agent.name}" started`, undefined, teamId)
    broadcastToTeam(teamId, 'agent_status', { agentId: agent.id, status: 'running' })
    res.json({ ...agent, status: 'running' })
  })

  app.post('/api/agents/:id/stop', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('agents', req.params.id, teamId)) return res.status(404).json({ error: 'Agent not found' })
    const agent = await getAgent(db, req.params.id)
    if (!agent) return res.status(404).json({ error: 'Agent not found' })
    await setAgentStatus(db, agent.id, 'stopped')
    unscheduleAgent(agent.id)
    await logActivity(db, 'agent_stopped', agent.id, `Agent "${agent.name}" stopped`, undefined, teamId)
    broadcastToTeam(teamId, 'agent_status', { agentId: agent.id, status: 'stopped' })
    res.json({ ...agent, status: 'stopped' })
  })

  // ===== Chat with Agent (ReAct loop) =====

  app.post('/api/agents/:id/chat', chatLimiter, async (req: Request, res: Response) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('agents', req.params.id as string, teamId)) return res.status(404).json({ error: 'Agent not found' })
    const agent = await getAgent(db, req.params.id as string)
    if (!agent) return res.status(404).json({ error: 'Agent not found' })

    const body = validate(ChatWithAgentSchema, req.body)

    // Store user message in DM channel
    const dmChannel = await getDmChannel(db, agent.id, teamId)

    // AdvisorBot daily usage limit (50 messages/day per team)
    if (agent.templateId === 'advisor-bot') {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const countResult = await db.queryOne<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM chat_messages WHERE channel_id = $1 AND team_id = $2 AND created_at > $3`,
        [dmChannel.id, teamId, todayStart.toISOString()],
      )
      if (countResult && countResult.cnt >= 50) {
        return res.json({
          response: "You've reached AdvisorBot's daily limit of 50 messages. Your other agents are still available, and AdvisorBot resets tomorrow!",
          iterations: 0,
          toolCalls: [],
        })
      }
    }

    await sendMessage(db, dmChannel.id, 'human', 'user', body.message, undefined, teamId)

    const tzRow = await db.queryOne<{ timezone: string | null }>(
      'SELECT timezone FROM team_profiles WHERE team_id = $1', [teamId],
    )
    const chatBalance = process.env.YOKEBOT_HOSTED_MODE === 'true'
      ? await (await import('./billing.ts')).getCreditBalance(db, teamId)
      : null
    const brandKitRow = await db.queryOne<Record<string, unknown>>(
      'SELECT * FROM brand_kits WHERE team_id = $1',
      [teamId],
    )
    const chatBrandKit = brandKitRow ? {
      primaryColor: brandKitRow.primary_color as string,
      secondaryColor: brandKitRow.secondary_color as string,
      accentColor: brandKitRow.accent_color as string,
      backgroundColor: brandKitRow.background_color as string,
      surfaceColor: brandKitRow.surface_color as string,
      textColor: brandKitRow.text_color as string,
      headingFont: brandKitRow.heading_font as string,
      bodyFont: brandKitRow.body_font as string,
      baseFontSize: brandKitRow.base_font_size as string,
      headingStyle: brandKitRow.heading_style as string,
      borderRadius: brandKitRow.border_radius as string,
      spacingScale: brandKitRow.spacing_scale as string,
      buttonStyle: brandKitRow.button_style as string,
      cardStyle: brandKitRow.card_style as string,
    } : null
    const systemPrompt = buildAgentSystemPrompt(agent.name, agent.systemPrompt, tzRow?.timezone, chatBalance, chatBrandKit)

    try {
      const modelConfig = await resolveModelConfig(db, agent.modelId || agent.modelEndpoint)
      // AdvisorBot is always free — skip credit deduction
      const fileWrittenCb = (tid: string, path: string) => broadcastToTeam(tid, 'file_written', { path })
      const runtimeConfig = agent.templateId === 'advisor-bot'
        ? { maxIterations: 10, skipCredits: true, onFileWritten: fileWrittenCb }
        : { maxIterations: 10, onFileWritten: fileWrittenCb }
      const result = await runReactLoop(
        db,
        agent.id,
        teamId,
        body.message,
        modelConfig,
        systemPrompt,
        workspaceConfig,
        SKILLS_DIR,
        runtimeConfig,
        agent.modelId || undefined,
        dmChannel.id,
      )

      // Store agent response in DM channel (skip iteration-limit fallback messages)
      if (result.response && !result.response.includes('unable to complete the task within the iteration limit')) {
        await sendMessage(db, dmChannel.id, 'agent', agent.id, result.response, undefined, teamId)
      }

      res.json(result)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      res.status(502).json({ error: `Model unavailable: ${errorMsg}` })
    }
  })

  // ===== Approvals =====

  app.get('/api/approvals', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    res.json(await listPendingApprovals(db, teamId))
  })

  app.get('/api/approvals/count', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    res.json({ count: await countPendingApprovals(db, teamId) })
  })

  app.post('/api/approvals', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const body = validate(CreateApprovalSchema, req.body)
    const approval = await createApproval(db, teamId, body.agentId, body.actionType, body.actionDetail, body.riskLevel, body.taskId)
    // Notify team about new approval
    void notifyTeam(db, teamId, 'approval_needed', `Approval needed: ${body.actionType}`, body.actionDetail.slice(0, 200), '/approvals')
    // SSE: broadcast updated approval count to all team members
    const newApprovalCount = await countPendingApprovals(db, teamId)
    broadcastToTeam(teamId, 'approval_count', { count: newApprovalCount })
    res.status(201).json(approval)
  })

  app.post('/api/approvals/:id/resolve', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('approvals', req.params.id, teamId)) return res.status(404).json({ error: 'Approval not found' })
    const { status } = validate(ResolveApprovalSchema, req.body)
    const approval = await resolveApproval(db, req.params.id, status)
    if (!approval) return res.status(404).json({ error: 'Approval not found' })
    await logActivity(db, 'approval_resolved', approval.agentId, `Approval ${status}: ${approval.actionType} — ${approval.actionDetail.slice(0, 100)}`, { approvalId: approval.id, status }, teamId)
    // Notify team about resolution
    void notifyTeam(db, teamId, 'system',
      `Approval ${status}: ${approval.actionType}`,
      approval.actionDetail.slice(0, 200),
      approval.taskId ? `/tasks/${approval.taskId}` : '/approvals')
    // SSE: broadcast updated approval count
    const resolvedApprovalCount = await countPendingApprovals(db, teamId)
    broadcastToTeam(teamId, 'approval_count', { count: resolvedApprovalCount })
    // Immediately wake the agent so it picks up the unblocked task without waiting for next heartbeat
    void triggerAgentNow(db, approval.agentId, teamId)
    res.json(approval)
  })

  // ===== Tags =====

  app.get('/api/tags', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    res.json(await listTags(db, teamId))
  })

  app.post('/api/tags', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    const body = validate(CreateTagSchema, req.body)
    const tag = await createTag(db, teamId, body.name, body.color)
    res.status(201).json(tag)
  })

  app.patch('/api/tags/:id', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const body = validate(UpdateTagSchema, req.body)
    const tag = await updateTag(db, req.params.id, body)
    if (!tag) return res.status(404).json({ error: 'Tag not found' })
    res.json(tag)
  })

  app.delete('/api/tags/:id', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    await deleteTag(db, req.params.id)
    res.status(204).end()
  })

  app.post('/api/tags/resource', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    const body = validate(TagResourceSchema, req.body)
    await tagResource(db, teamId, body.tagId, body.resourceType, body.resourceId)
    res.status(201).json({ ok: true })
  })

  app.delete('/api/tags/resource', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const body = validate(TagResourceSchema, req.body)
    await untagResource(db, body.tagId, body.resourceType, body.resourceId)
    res.status(204).end()
  })

  app.put('/api/tags/resource/bulk', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    const body = validate(BulkSetTagsSchema, req.body)
    await bulkSetResourceTags(db, teamId, body.tagIds, body.resourceType, body.resourceId)
    res.json({ ok: true })
  })

  // ===== Tasks (Mission Control) =====

  app.get('/api/tasks', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const filters: Record<string, unknown> = { teamId }
    if (req.query.status) filters.status = req.query.status
    if (req.query.agentId) filters.agentId = req.query.agentId
    if (req.query.assignedUserId) filters.assignedUserId = req.query.assignedUserId
    if (req.query.parentId === 'null') filters.parentId = null
    else if (req.query.parentId) filters.parentId = req.query.parentId
    if (req.query.tags) filters.tags = req.query.tags
    if (req.query.type) filters.type = req.query.type
    res.json(await listTasks(db, filters as Parameters<typeof listTasks>[1]))
  })

  app.get('/api/tasks/:id', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('tasks', req.params.id, teamId)) return res.status(404).json({ error: 'Task not found' })
    const task = await getTask(db, req.params.id)
    if (!task) return res.status(404).json({ error: 'Task not found' })
    res.json(task)
  })

  // Combined task detail — returns task + team chat messages tagged with this task + linked files
  // Skips verifyOwnership (team middleware already verified membership, getTask checks team via query)
  app.get('/api/tasks/:id/detail', async (req, res) => {
    const t0 = Date.now()
    const teamId = req.user!.activeTeamId!
    const userId = req.user!.id
    const taskId = req.params.id
    const [task, files, taskMessages] = await Promise.all([
      getTask(db, taskId),
      getFilesByTask(db, teamId, taskId),
      getMessagesByTaskId(db, teamId, taskId, 100),
    ])
    const t1 = Date.now()
    if (!task || task.teamId !== teamId) return res.status(404).json({ error: 'Task not found' })
    // Fire-and-forget: mark task as read
    markTaskRead(db, userId, taskId).catch(() => {})
    // Resolve sandbox preview URL if this task has a linked project
    let previewUrl: string | null = null
    if (task.sandboxProjectId) {
      try {
        const { getSandboxProject } = await import('./sandbox.ts')
        const project = await getSandboxProject(db, task.sandboxProjectId)
        previewUrl = project?.previewUrl ?? null
      } catch { /* best-effort */ }
    }
    const t2 = Date.now()
    console.log(`[perf:detail] total=${t2-t0}ms`)
    res.json({ task, channelId: '', messages: taskMessages, files, previewUrl })
  })

  app.post('/api/tasks', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    const body = validate(CreateTaskSchema, req.body)

    // Verify assignedUserId is a member of this team (prevent cross-team assignment)
    if (body.assignedUserId) {
      const { getMember } = await import('./teams.ts')
      const member = await getMember(db, teamId, body.assignedUserId)
      if (!member) return res.status(400).json({ error: 'Assigned user is not a member of this team' })
    }

    const task = await createTask(db, teamId, body.title, body)
    res.status(201).json(task)
  })

  app.patch('/api/tasks/:id', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('tasks', req.params.id, teamId)) return res.status(404).json({ error: 'Task not found' })
    const body = validate(UpdateTaskSchema, req.body)

    // Verify assignedUserId is a member of this team (prevent cross-team assignment)
    if (body.assignedUserId) {
      const { getMember } = await import('./teams.ts')
      const member = await getMember(db, teamId, body.assignedUserId)
      if (!member) return res.status(400).json({ error: 'Assigned user is not a member of this team' })
    }

    // When unblocking (status changes FROM blocked to something else), clear blocked fields
    const existing = await getTask(db, req.params.id)
    if (existing?.status === 'blocked' && body.status && body.status !== 'blocked') {
      await unblockTask(db, req.params.id, body.status as 'todo' | 'backlog' | 'in_progress' | 'review' | 'done')
      const task = await getTask(db, req.params.id)
      if (task?.status === 'done') {
        void onTaskCompleted(db, task.id).catch((err) => console.error('[workflows] onTaskCompleted error:', err))
      }
      return res.json(task)
    }

    // When setting TO blocked, require blockedReason
    if (body.status === 'blocked' && !(body as Record<string, unknown>).blockedReason) {
      return res.status(400).json({ error: 'blockedReason is required when setting status to blocked' })
    }

    const task = await updateTask(db, req.params.id, body as Record<string, unknown>)
    if (!task) return res.status(404).json({ error: 'Task not found' })
    // Workflow step chaining: if task is done, advance linked workflow
    if (task.status === 'done') {
      void onTaskCompleted(db, task.id).catch((err) => console.error('[workflows] onTaskCompleted error:', err))
      // Auto-unblock parent task when a clarification task is completed
      if (task.type === 'clarification' && task.parentTaskId) {
        try {
          const parentTask = await getTask(db, task.parentTaskId)
          if (parentTask && parentTask.status === 'blocked' && parentTask.blockedReason === 'needs_input') {
            await unblockTask(db, task.parentTaskId, 'todo')
            // Trigger immediate sprint on the parent task's agent
            if (parentTask.assignedAgentId) {
              void triggerAgentNow(db, parentTask.assignedAgentId, teamId)
            }
            console.log(`[tasks] Clarification completed — unblocked parent task "${parentTask.title}" and triggered agent`)
          }
        } catch (err) { console.error('[tasks] Failed to auto-unblock parent:', err) }
      }
    }
    res.json(task)
  })

  app.post('/api/tasks/:id/retry', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('tasks', req.params.id, teamId)) return res.status(404).json({ error: 'Task not found' })
    const existing = await getTask(db, req.params.id)
    await unblockTask(db, req.params.id, 'todo')
    const task = await getTask(db, req.params.id)
    // Trigger immediate sprint instead of waiting for next heartbeat
    if (existing?.assignedAgentId) {
      void triggerAgentNow(db, existing.assignedAgentId, teamId)
    }
    res.json(task)
  })

  app.post('/api/tasks/:id/unblock', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('tasks', req.params.id, teamId)) return res.status(404).json({ error: 'Task not found' })
    const existing = await getTask(db, req.params.id)
    // If task had a linked approval, resolve it as approved
    if (existing?.blockedApprovalId) {
      await resolveApproval(db, existing.blockedApprovalId, 'approved')
    } else {
      // resolveApproval already calls unblockTask, so only call directly if no approval
      await unblockTask(db, req.params.id, 'todo')
    }
    const task = await getTask(db, req.params.id)
    // Trigger immediate sprint instead of waiting for next heartbeat
    if (existing?.assignedAgentId) {
      void triggerAgentNow(db, existing.assignedAgentId, teamId)
    }
    res.json(task)
  })

  app.delete('/api/tasks/:id', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('tasks', req.params.id, teamId)) return res.status(404).json({ error: 'Task not found' })
    await deleteTask(db, req.params.id)
    res.status(204).end()
  })

  // Bulk archive completed tasks — moves all 'done' tasks to 'archived' status
  app.post('/api/tasks/archive-completed', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    // Count first, then update
    const rows = await db.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM tasks WHERE team_id = $1 AND status = 'done'",
      [teamId],
    )
    const count = rows[0]?.count ?? 0
    if (count > 0) {
      await db.run(
        "UPDATE tasks SET status = 'archived', updated_at = NOW() WHERE team_id = $1 AND status = 'done'",
        [teamId],
      )
    }
    res.json({ archived: count })
  })

  // ---- Task Attachments & Header Images ----

  const ALLOWED_FILE_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'application/pdf',
    'text/plain', 'text/csv', 'text/markdown',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/json', 'application/zip',
  ])

  const uploadLimiter = rateLimit({ windowMs: 60_000, max: 20, keyGenerator: (req) => req.user?.activeTeamId ?? ipKeyGenerator(req.ip ?? '0.0.0.0') })

  app.post('/api/tasks/:id/attachments', uploadLimiter, express.json({ limit: '15mb' }), async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    const taskId = req.params.id as string
    if (!await verifyOwnership('tasks', taskId, teamId)) return res.status(404).json({ error: 'Task not found' })

    const { fileName, fileType, fileSize, contentBase64 } = req.body as {
      fileName?: string; fileType?: string; fileSize?: number; contentBase64?: string
    }
    if (!fileName || !fileType || !contentBase64) return res.status(400).json({ error: 'fileName, fileType, and contentBase64 are required' })
    if (!ALLOWED_FILE_TYPES.has(fileType)) return res.status(400).json({ error: `File type "${fileType}" not allowed` })
    if ((fileSize ?? 0) > 10 * 1024 * 1024) return res.status(400).json({ error: 'File size exceeds 10MB limit' })

    if (process.env.YOKEBOT_HOSTED_MODE === 'true') {
      try {
        const storagePath = './cloud/storage.js'
        const { uploadTaskFile } = await import(/* @vite-ignore */ storagePath)
        const key = await uploadTaskFile(contentBase64, teamId, taskId, fileName, fileType)
        const url = `/api/files/${key}`

        // Append to task's attachments array
        const task = await getTask(db, taskId)
        if (!task) return res.status(404).json({ error: 'Task not found' })
        const attachments = [...task.attachments, { name: fileName, url, type: fileType, size: fileSize ?? 0 }]
        await updateTask(db, taskId, { attachments: JSON.stringify(attachments) })
        res.json({ url, attachments })
      } catch (err) {
        console.error('[tasks] Attachment upload error:', err)
        res.status(500).json({ error: 'Failed to upload attachment' })
      }
    } else {
      res.status(501).json({ error: 'File uploads require hosted mode' })
    }
  })

  app.delete('/api/tasks/:id/attachments/:index', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    const taskId = req.params.id as string
    if (!await verifyOwnership('tasks', taskId, teamId)) return res.status(404).json({ error: 'Task not found' })

    const task = await getTask(db, taskId)
    if (!task) return res.status(404).json({ error: 'Task not found' })
    const idx = parseInt(req.params.index as string, 10)
    if (isNaN(idx) || idx < 0 || idx >= task.attachments.length) return res.status(400).json({ error: 'Invalid attachment index' })

    const attachments = task.attachments.filter((_, i) => i !== idx)
    await updateTask(db, taskId, { attachments: JSON.stringify(attachments) })
    res.json({ attachments })
  })

  app.post('/api/tasks/:id/header-image', uploadLimiter, express.json({ limit: '15mb' }), async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    const taskId = req.params.id as string
    if (!await verifyOwnership('tasks', taskId, teamId)) return res.status(404).json({ error: 'Task not found' })

    const { fileName, fileType, contentBase64 } = req.body as {
      fileName?: string; fileType?: string; contentBase64?: string
    }
    if (!fileName || !fileType || !contentBase64) return res.status(400).json({ error: 'fileName, fileType, and contentBase64 are required' })
    if (!fileType.startsWith('image/')) return res.status(400).json({ error: 'Header image must be an image file' })

    if (process.env.YOKEBOT_HOSTED_MODE === 'true') {
      try {
        const storagePath = './cloud/storage.js'
        const { uploadTaskFile } = await import(/* @vite-ignore */ storagePath)
        const key = await uploadTaskFile(contentBase64, teamId, taskId, fileName, fileType)
        const url = `/api/files/${key}`
        await updateTask(db, taskId, { headerImage: url })
        res.json({ url })
      } catch (err) {
        console.error('[tasks] Header image upload error:', err)
        res.status(500).json({ error: 'Failed to upload header image' })
      }
    } else {
      res.status(501).json({ error: 'File uploads require hosted mode' })
    }
  })

  app.delete('/api/tasks/:id/header-image', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    const taskId = req.params.id as string
    if (!await verifyOwnership('tasks', taskId, teamId)) return res.status(404).json({ error: 'Task not found' })
    await updateTask(db, taskId, { headerImage: null })
    res.status(204).end()
  })

  // Serve task files from R2 (proxied through engine for auth)
  app.get('/api/files/*key', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const keyParam = (req.params as Record<string, unknown>).key
    const fileKey = Array.isArray(keyParam) ? keyParam.join('/') : String(keyParam)

    // Multi-tenant security: validate teamId in key matches requesting user's team
    const keyParts = fileKey.split('/')
    if (keyParts.length < 3 || keyParts[0] !== 'tasks' || keyParts[1] !== teamId) {
      return res.status(403).json({ error: 'Access denied' })
    }

    if (process.env.YOKEBOT_HOSTED_MODE !== 'true') return res.status(501).json({ error: 'File serving requires hosted mode' })
    try {
      const storagePath = './cloud/storage.js'
      const { getTaskFile } = await import(/* @vite-ignore */ storagePath)
      const result = await getTaskFile(fileKey)
      if (!result) return res.status(404).json({ error: 'File not found' })

      res.setHeader('Content-Type', result.contentType)
      if (result.contentLength) res.setHeader('Content-Length', result.contentLength)
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      result.stream.pipe(res)
    } catch (err) {
      console.error('[files] Serve error:', err)
      res.status(500).json({ error: 'Failed to serve file' })
    }
  })

  // ===== Chat =====

  app.get('/api/chat/channels', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    res.json(await listChannels(db, teamId))
  })

  app.post('/api/chat/channels', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    const { name, type } = validate(CreateChannelSchema, req.body)
    const channel = await createChannel(db, teamId, name, type)
    res.status(201).json(channel)
  })

  app.patch('/api/chat/channels/:channelId', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('chat_channels', req.params.channelId, teamId)) return res.status(404).json({ error: 'Channel not found' })
    const { name } = req.body as { name?: string }
    if (!name || typeof name !== 'string' || name.trim().length === 0) return res.status(400).json({ error: 'Name is required' })
    await db.run('UPDATE chat_channels SET name = $1 WHERE id = $2 AND team_id = $3', [name.trim(), req.params.channelId, teamId])
    const channel = await getChannel(db, req.params.channelId)
    res.json(channel)
  })

  app.delete('/api/chat/channels/:channelId', async (req, res) => {
    if (!requireRole(req, res, 'admin')) return
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('chat_channels', req.params.channelId, teamId)) { res.status(404).json({ error: 'Channel not found' }); return }
    const channel = await getChannel(db, req.params.channelId)
    if (!channel) { res.status(404).json({ error: 'Channel not found' }); return }
    if (channel.type !== 'group') { res.status(400).json({ error: 'Cannot delete DM or task thread channels' }); return }
    await db.run('DELETE FROM chat_messages WHERE channel_id = $1 AND team_id = $2', [req.params.channelId, teamId])
    await db.run('DELETE FROM chat_channels WHERE id = $1 AND team_id = $2', [req.params.channelId, teamId])
    res.json({ deleted: true })
  })

  app.get('/api/chat/dm/:agentId', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const channel = await getDmChannel(db, req.params.agentId, teamId)
    res.json(channel)
  })

  app.get('/api/chat/task/:taskId', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const channel = await getTaskThread(db, req.params.taskId, teamId)
    res.json(channel)
  })

  // Unread counts for all channels
  app.get('/api/chat/unread', async (req, res) => {
    const userId = req.user!.id
    const teamId = req.user!.activeTeamId!
    const counts = await getUnreadCounts(db, userId, teamId)
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0)
    res.json({ counts, total })
  })

  // Mark channel as read
  app.post('/api/chat/channels/:channelId/read', async (req, res) => {
    const userId = req.user!.id
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('chat_channels', req.params.channelId, teamId)) return res.status(404).json({ error: 'Channel not found' })
    await markChannelRead(db, userId, req.params.channelId)
    res.json({ ok: true })
  })

  app.get('/api/chat/channels/:channelId/messages', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('chat_channels', req.params.channelId, teamId)) return res.status(404).json({ error: 'Channel not found' })
    const limit = Number(req.query.limit ?? 50)
    const before = req.query.before ? Number(req.query.before) : undefined
    const includeThreads = req.query.includeThreads === 'true'
    res.json(await getChannelMessages(db, req.params.channelId, limit, before, includeThreads))
  })

  app.post('/api/chat/channels/:channelId/messages', chatLimiter, async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const channelId = req.params.channelId as string
    if (!await verifyOwnership('chat_channels', channelId, teamId)) return res.status(404).json({ error: 'Channel not found' })
    const { senderType, senderId, content, taskId, parentMessageId } = validate(SendChatMessageSchema, req.body)
    const msg = await sendMessage(db, channelId, senderType, senderId, content, taskId, teamId, undefined, undefined, undefined, parentMessageId)
    // sendMessage() now broadcasts new_message SSE automatically via the hook
    // Fire-and-forget mention processing (notifications + agent wake)
    processMentions(db, teamId, channelId, msg).catch((err) =>
      console.error('[chat] Mention processing error:', err),
    )
    // Instant agent reply — when a human messages, trigger the right agent immediately
    if (senderType === 'human') {
      const channel = await getChannel(db, channelId)

      // Helper: fire-and-forget reply from a specific agent
      const triggerAgentReply = (agent: { id: string; name: string; iconName: string | null; iconColor: string | null }) => {
        ;(async () => {
          try {
            broadcastChatEvent(channelId, {
              type: 'typing', channelId,
              agentId: agent.id, agentName: agent.name,
              agentIcon: agent.iconName ?? 'smart_toy',
              agentColor: agent.iconColor ?? '#0F4D26',
            })
            await respondToMention(db, agent.id, teamId, channelId, { senderId, content, parentMessageId })
            broadcastChatEvent(channelId, {
              type: 'stop_typing', channelId, agentId: agent.id,
            })
          } catch (err) {
            console.error(`[chat] Auto-reply error for agent ${agent.id}:`, err)
          }
        })()
      }

      if (channel?.type === 'dm' && channel.name.startsWith('dm:')) {
        // DM — reply from the DM's agent
        const agentId = channel.name.slice(3)
        const agent = await getAgent(db, agentId)
        if (agent && (agent.status === 'running' || agent.status === 'idle' || agent.status === 'paused')) triggerAgentReply(agent)
      } else if (channel?.type === 'group' && !content.match(/@\[[^\]]+\]\((agent|everyone):/)) {
        // Group channel, no @agent or @everyone mention — pick the most relevant agent
        ;(async () => {
          try {
            const agents = await listAgents(db, teamId)
            const available = agents.filter(a => a.status === 'running' || a.status === 'idle' || a.status === 'paused')
            if (available.length === 0) return

            // If only one agent, just use that one
            if (available.length === 1) {
              triggerAgentReply(available[0])
              return
            }

            // Quick LLM call to pick the best agent
            const agentList = available.map((a, i) => `${i + 1}. ${a.name} — ${a.department ?? 'general'}`).join('\n')
            const routerModel = await resolveModelConfig(db, 'qwen-3.5-9b')
            const result = await chatCompletion(routerModel, [
              { role: 'system', content: 'You are a routing assistant. Given a user message and a list of agents, reply with ONLY the number of the most relevant agent. Nothing else.' },
              { role: 'user', content: `Agents:\n${agentList}\n\nMessage: "${content.slice(0, 300)}"\n\nWhich agent number should respond?` },
            ] as LlmMessage[])

            const pick = parseInt(result.content?.trim() ?? '', 10)
            const chosenAgent = pick >= 1 && pick <= available.length ? available[pick - 1] : available[0]
            triggerAgentReply(chosenAgent)
          } catch (err) {
            console.error('[chat] Group auto-reply routing error:', err)
          }
        })()
      }
    }
    res.status(201).json(msg)
  })

  // Chat SSE — typing indicators + real-time events
  app.get('/api/chat/channels/:channelId/events', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('chat_channels', req.params.channelId, teamId)) return res.status(404).json({ error: 'Channel not found' })
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    res.write('data: {"type":"connected"}\n\n')
    addChatSseClient(req.params.channelId, res)
    req.on('close', () => res.end())
  })

  // Mention autocomplete data — returns agents, users, and KB documents for the @ dropdown
  app.get('/api/chat/mentions', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const [agents, members, documents] = await Promise.all([
      listAgents(db, teamId),
      getTeamMembers(db, teamId),
      listDocuments(db, teamId),
    ])
    res.json({
      agents: agents.map((a) => ({ id: a.id, name: a.name, iconName: a.iconName, iconColor: a.iconColor, status: a.status })),
      users: members.map((m) => ({ userId: m.userId, email: m.email, displayName: m.displayName ?? m.email.split('@')[0] })),
      documents: documents.map((d) => ({ id: d.id, title: d.title, fileType: d.fileType })),
    })
  })

  // ===== Chat Search =====

  app.get('/api/chat/search', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const q = (req.query.q as string ?? '').trim()
    if (!q || q.length < 2) return res.json([])
    const limit = Math.min(Number(req.query.limit) || 20, 50)
    const results = await searchMessages(db, teamId, q, limit)
    res.json(results)
  })

  // ===== Thread Replies =====

  app.get('/api/chat/messages/:messageId/replies', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const limit = Math.min(Number(req.query.limit) || 100, 200)
    const replies = await getThreadReplies(db, Number(req.params.messageId), teamId, limit)
    res.json(replies)
  })

  // ===== Team Channel =====

  app.get('/api/chat/team', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const channel = await getTeamChannel(db, teamId)
    res.json(channel)
  })

  // ===== Workspace Read Tracking =====

  app.post('/api/workspace/file/read', async (req, res) => {
    const userId = req.user!.id
    const teamId = req.user!.activeTeamId!
    const { path } = req.body as { path: string }
    if (!path) return res.status(400).json({ error: 'path is required' })
    const file = await getFileByPath(db, teamId, path)
    if (!file) return res.status(404).json({ error: 'File not found' })
    await markFileRead(db, userId, file.id)
    res.json({ ok: true })
  })

  app.get('/api/workspace/unread', async (req, res) => {
    const userId = req.user!.id
    const teamId = req.user!.activeTeamId!
    const fileIds = await getUnreadFileIds(db, userId, teamId)
    res.json({ fileIds })
  })

  app.get('/api/workspace/files-by-task/:taskId', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const files = await getFilesByTask(db, teamId, req.params.taskId)
    res.json(files)
  })

  // ===== Task Read Tracking =====

  app.post('/api/tasks/:taskId/read', async (req, res) => {
    const userId = req.user!.id
    await markTaskRead(db, userId, req.params.taskId)
    res.json({ ok: true })
  })

  app.get('/api/tasks/unread', async (req, res) => {
    const userId = req.user!.id
    const teamId = req.user!.activeTeamId!
    const taskIds = await getUnreadTaskIds(db, userId, teamId)
    res.json({ taskIds })
  })

  // ===== Emoji Reactions =====

  // Toggle a reaction (add if not exists, remove if exists)
  app.post('/api/chat/messages/:messageId/reactions', async (req, res) => {
    const userId = req.user!.id
    const teamId = req.user!.activeTeamId!
    const messageId = Number(req.params.messageId)
    const { emoji } = req.body as { emoji: string }
    if (!emoji || typeof emoji !== 'string' || emoji.length > 16) return res.status(400).json({ error: 'emoji required (max 16 chars)' })

    // Verify message belongs to a channel owned by this team
    const msg = await db.queryOne<{ id: number }>(
      `SELECT m.id FROM chat_messages m JOIN chat_channels c ON m.channel_id = c.id WHERE m.id = $1 AND c.team_id = $2`,
      [messageId, teamId],
    )
    if (!msg) return res.status(404).json({ error: 'Message not found' })

    // Check if reaction already exists
    const existing = await db.queryOne<{ id: number }>(
      'SELECT id FROM chat_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3',
      [messageId, userId, emoji],
    )

    if (existing) {
      // Remove the reaction
      await db.run('DELETE FROM chat_reactions WHERE id = $1', [existing.id])
      res.json({ action: 'removed', emoji })
    } else {
      // Add the reaction
      await db.run(
        'INSERT INTO chat_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)',
        [messageId, userId, emoji],
      )
      res.json({ action: 'added', emoji })
    }
  })

  // Get reactions for a message
  app.get('/api/chat/messages/:messageId/reactions', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const messageId = Number(req.params.messageId)

    // Verify message belongs to this team
    const msg = await db.queryOne<{ id: number }>(
      `SELECT m.id FROM chat_messages m JOIN chat_channels c ON m.channel_id = c.id WHERE m.id = $1 AND c.team_id = $2`,
      [messageId, teamId],
    )
    if (!msg) return res.status(404).json({ error: 'Message not found' })

    const reactions = await db.query<{ emoji: string; user_id: string; created_at: string }>(
      'SELECT emoji, user_id, created_at FROM chat_reactions WHERE message_id = $1 ORDER BY created_at',
      [messageId],
    )
    // Group by emoji
    const grouped: Record<string, string[]> = {}
    for (const r of reactions) {
      if (!grouped[r.emoji]) grouped[r.emoji] = []
      grouped[r.emoji].push(r.user_id)
    }
    res.json(grouped)
  })

  // ===== Workspace =====

  app.get('/api/workspace/files', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const dir = (req.query.dir as string) ?? ''
    const recursive = req.query.recursive === 'true'
    res.json(await listFiles(db, teamId, dir, recursive))
  })

  app.get('/api/workspace/file', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const path = req.query.path as string
    if (!path) return res.status(400).json({ error: 'path is required' })
    const file = await readFile(db, teamId, path)
    if (!file) return res.status(404).json({ error: 'File not found' })
    // Resolve author: agent UUID → agent name
    let authorName = file.createdBy ?? ''
    let authorType = 'human'
    if (authorName) {
      const agent = await getAgent(db, authorName)
      if (agent) {
        authorName = agent.name
        authorType = 'agent'
      }
    }
    // Resolve linked task
    let task: { id: string; title: string } | null = null
    if (file.taskId) {
      const t = await getTask(db, file.taskId)
      if (t) task = { id: t.id, title: t.title }
    }
    // For binary files (images, PDFs), return base64-encoded content
    const ext = path.split('.').pop()?.toLowerCase() ?? ''
    const BINARY_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'pdf'])
    if (BINARY_EXTS.has(ext)) {
      const binaryContent = await readBinaryFile(db, teamId, path)
      if (binaryContent) {
        return res.json({ path, content: binaryContent.toString('base64'), binary: true, createdBy: authorName, authorType, task })
      }
    }
    res.json({ path, content: file.content, createdBy: authorName, authorType, task })
  })

  app.put('/api/workspace/file', async (req, res) => {
    if (!requireRole(req, res, 'admin')) return
    const teamId = req.user!.activeTeamId!
    const { path, content, agentId } = validate(WriteFileSchema, req.body)
    // CSV files auto-import as SOR data tables instead of workspace files
    if (path.toLowerCase().endsWith('.csv')) {
      const tableName = path.split('/').pop()!.replace(/\.csv$/i, '')
      const tableId = await importCsvAsTable(db, teamId, tableName, content)
      if (!tableId) return res.status(400).json({ error: 'Failed to parse CSV — check that it has a header row' })
      return res.json({ success: true, importedAsTable: true, tableId })
    }
    const result = await writeFile(db, teamId, path, content, agentId)
    if (!result.success) return res.status(423).json({ error: result.error })
    broadcastToTeam(teamId, 'file_written', { path })
    res.json({ success: true })
  })

  // Upload binary file to workspace (base64-encoded)
  app.post('/api/workspace/file/upload', async (req, res) => {
    if (!requireRole(req, res, 'admin')) return
    const teamId = req.user!.activeTeamId!
    const { path: filePath, base64, mimeType, fileName } = req.body as {
      path?: string; base64?: string; mimeType?: string; fileName?: string
    }
    if (!base64 || !fileName) return res.status(400).json({ error: 'base64 and fileName are required' })
    const targetPath = filePath ? `${filePath.replace(/\/+$/, '')}/${fileName}` : fileName
    const buffer = Buffer.from(base64, 'base64')
    const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10MB
    if (buffer.length > MAX_UPLOAD_BYTES) {
      return res.status(413).json({ error: `File too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB exceeds 10MB limit` })
    }
    try {
      // CSV uploads auto-import as SOR data tables
      if (targetPath.toLowerCase().endsWith('.csv') || mimeType === 'text/csv') {
        const csvContent = buffer.toString('utf-8')
        const tableName = (fileName ?? targetPath).replace(/\.csv$/i, '').split('/').pop()!
        const tableId = await importCsvAsTable(db, teamId, tableName, csvContent)
        if (!tableId) return res.status(400).json({ error: 'Failed to parse CSV — check that it has a header row' })
        return res.json({ success: true, path: targetPath, size: buffer.length, importedAsTable: true, tableId })
      }
      await writeBinaryFile(db, teamId, targetPath, buffer, mimeType ?? 'application/octet-stream', req.user?.id ?? '')
      broadcastToTeam(teamId, 'file_written', { path: targetPath })
      res.json({ success: true, path: targetPath, size: buffer.length })
    } catch (err) {
      res.status(400).json({ error: (err as Error).message })
    }
  })

  app.patch('/api/workspace/file', async (req, res) => {
    if (!requireRole(req, res, 'admin')) return
    const teamId = req.user!.activeTeamId!
    const { path, newPath } = req.body as { path?: string; newPath?: string }
    if (!path || !newPath) return res.status(400).json({ error: 'path and newPath are required' })
    const result = await renameFile(db, teamId, path, newPath)
    if (!result.success) return res.status(result.error === 'File not found.' ? 404 : 409).json({ error: result.error })
    res.json({ success: true })
  })

  app.delete('/api/workspace/file', async (req, res) => {
    if (!requireRole(req, res, 'admin')) return
    const teamId = req.user!.activeTeamId!
    const path = req.query.path as string
    if (!path) return res.status(400).json({ error: 'path is required' })
    const result = await deleteFile(db, teamId, path)
    if (!result.success) return res.status(404).json({ error: result.error })
    res.json({ success: true })
  })

  // ===== Knowledge Base =====

  app.post('/api/kb/documents', express.json({ limit: '15mb' }), async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    try {
      const teamId = req.user!.activeTeamId!
      const { fileName, fileType, content, title } = validate(UploadKbDocumentSchema, req.body)

      // Decode base64 to check actual file size
      const buffer = Buffer.from(content, 'base64')
      if (buffer.length > 10 * 1024 * 1024) {
        return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' })
      }

      const doc = await uploadDocument(db, teamId, {
        title,
        fileName,
        fileType,
        fileSize: buffer.length,
        contentBase64: content,
      })
      broadcastToTeam(teamId, 'kb_update', { documentId: doc.id, status: doc.status })
      res.status(201).json(doc)
    } catch (err) {
      const status = (err as Error & { status?: number }).status ?? 500
      res.status(status).json({ error: (err as Error).message })
    }
  })

  app.get('/api/kb/documents', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const docs = await listDocuments(db, teamId)
    res.json(docs)
  })

  app.get('/api/kb/documents/:id', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const doc = await getDocument(db, req.params.id, teamId)
    if (!doc) return res.status(404).json({ error: 'Document not found' })
    res.json(doc)
  })

  app.delete('/api/kb/documents/:id', async (req, res) => {
    if (!requireRole(req, res, 'admin')) return
    const teamId = req.user!.activeTeamId!
    const owns = await verifyOwnership('kb_documents', req.params.id, teamId)
    if (!owns) return res.status(404).json({ error: 'Document not found' })
    await deleteDocument(db, req.params.id, teamId)
    res.json({ success: true })
  })

  app.post('/api/kb/search', async (req, res) => {
    try {
      const teamId = req.user!.activeTeamId!
      const { query, topK, documentIds } = validate(SearchKbSchema, req.body)
      const results = await searchKb(db, teamId, query, topK ?? 5, documentIds)
      res.json(results)
    } catch (err) {
      const status = (err as Error & { status?: number }).status ?? 500
      res.status(status).json({ error: (err as Error).message })
    }
  })

  app.get('/api/kb/documents/:id/chunks', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const doc = await getDocument(db, req.params.id, teamId)
    if (!doc) return res.status(404).json({ error: 'Document not found' })
    const chunks = await getDocumentChunks(db, req.params.id, teamId)
    res.json({ chunks })
  })

  // ===== Source of Record =====

  app.get('/api/sor/tables', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const tables = await listSorTables(db, teamId)
    const result = []
    for (const t of tables) {
      const rows = await listSorRows(db, t.id)
      const columns = await listSorColumns(db, t.id)
      result.push({ ...t, rowCount: rows.length, columns })
    }
    res.json(result)
  })

  app.post('/api/sor/tables', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    const { name, columns } = validate(CreateSorTableSchema, req.body)
    const table = await createSorTable(db, teamId, name)
    if (columns) {
      for (const col of columns) await addSorColumn(db, table.id, col.name, col.colType)
    }
    res.status(201).json({ ...table, columns: await listSorColumns(db, table.id) })
  })

  // Add column to existing table
  app.post('/api/sor/tables/:id/columns', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('sor_tables', req.params.id, teamId)) return res.status(404).json({ error: 'Table not found' })
    const { name, colType } = req.body as { name: string; colType?: string }
    if (!name || typeof name !== 'string' || name.trim().length === 0) return res.status(400).json({ error: 'Column name is required' })
    const col = await addSorColumn(db, req.params.id, name.trim(), colType)
    res.status(201).json(col)
  })

  app.get('/api/sor/tables/:id/rows', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('sor_tables', req.params.id, teamId)) return res.status(404).json({ error: 'Table not found' })
    res.json(await listSorRows(db, req.params.id))
  })

  app.post('/api/sor/tables/:id/rows', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('sor_tables', req.params.id, teamId)) return res.status(404).json({ error: 'Table not found' })
    const row = await addSorRow(db, req.params.id, req.body as Record<string, unknown>)
    res.status(201).json(row)

    // Fire row_added workflows (async, don't block response)
    fireTableWorkflows(db, teamId, req.params.id, 'row_added', row.data).catch(() => {})
  })

  app.patch('/api/sor/tables/:tableId/rows/:rowId', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('sor_tables', req.params.tableId, teamId)) return res.status(404).json({ error: 'Table not found' })
    // Verify row belongs to this table
    const rowCheck = await db.queryOne<{ id: string }>('SELECT id FROM sor_rows WHERE id = $1 AND table_id = $2', [req.params.rowId, req.params.tableId])
    if (!rowCheck) return res.status(404).json({ error: 'Row not found' })
    const row = await updateSorRow(db, req.params.rowId, req.body as Record<string, unknown>)
    if (!row) return res.status(404).json({ error: 'Row not found' })
    res.json(row)

    // Fire row_updated workflows (async, don't block response)
    fireTableWorkflows(db, teamId, req.params.tableId, 'row_updated', row.data).catch(() => {})
  })

  app.delete('/api/sor/tables/:tableId/rows/:rowId', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('sor_tables', req.params.tableId, teamId)) return res.status(404).json({ error: 'Table not found' })
    // Verify row belongs to this table
    const rowCheck = await db.queryOne<{ id: string }>('SELECT id FROM sor_rows WHERE id = $1 AND table_id = $2', [req.params.rowId, req.params.tableId])
    if (!rowCheck) return res.status(404).json({ error: 'Row not found' })
    await deleteSorRow(db, req.params.rowId)
    res.status(204).end()
  })

  app.get('/api/sor/tables/:id/permissions', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('sor_tables', req.params.id, teamId)) return res.status(404).json({ error: 'Table not found' })
    res.json(await getSorPermissions(db, req.params.id))
  })

  app.patch('/api/sor/tables/:id/permissions', async (req, res) => {
    if (!requireRole(req, res, 'admin')) return
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('sor_tables', req.params.id, teamId)) return res.status(404).json({ error: 'Table not found' })
    const { agentId, canRead, canWrite } = validate(UpdateSorPermissionSchema, req.body)
    await setSorPermission(db, agentId, req.params.id, canRead, canWrite)
    res.json(await getSorPermissions(db, req.params.id))
  })

  // ===== Model Providers =====

  app.get('/api/models', async (_req, res) => {
    const models = await getAvailableModels(db)
    res.json(models)
  })

  app.get('/api/models/providers', async (_req, res) => {
    const stored = await listStoredProviders(db)
    const result = PROVIDERS.map((p) => {
      const s = stored.find((sp) => sp.id === p.id)
      return {
        id: p.id,
        name: p.name,
        endpoint: p.endpoint,
        requiresKey: p.requiresKey,
        enabled: s?.enabled ?? !p.requiresKey,
        hasKey: s ? s.apiKey.length > 0 : false,
      }
    })
    res.json(result)
  })

  app.patch('/api/models/providers/:id', async (req, res) => {
    if (!requireRole(req, res, 'admin')) return
    const provider = PROVIDERS.find((p) => p.id === req.params.id)
    if (!provider) return res.status(404).json({ error: 'Unknown provider' })
    const { apiKey, enabled } = validate(UpdateProviderSchema, req.body)
    const stored = (await listStoredProviders(db)).find((s) => s.id === req.params.id)
    await upsertProvider(db, req.params.id, apiKey ?? stored?.apiKey ?? '', enabled ?? stored?.enabled ?? false)
    res.json({ id: req.params.id, enabled: enabled ?? stored?.enabled ?? false, hasKey: (apiKey ?? stored?.apiKey ?? '').length > 0 })
  })

  // ===== Activity Log =====

  app.get('/api/activity', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const filters: { agentId?: string; eventType?: string; limit?: number; before?: number; teamId?: string } = { teamId }
    if (req.query.agentId) filters.agentId = req.query.agentId as string
    if (req.query.eventType) filters.eventType = req.query.eventType as string
    if (req.query.limit) filters.limit = Number(req.query.limit)
    if (req.query.before) filters.before = Number(req.query.before)
    res.json(await listActivity(db, filters))
  })

  app.get('/api/activity/count', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const agentId = req.query.agentId as string | undefined
    res.json({ count: await countActivity(db, agentId, teamId) })
  })

  // ===== Skills =====

  app.get('/api/skills', (_req, res) => {
    const skills = loadSkillsFromDir(SKILLS_DIR)
    res.json(skills.map((s) => ({ metadata: s.metadata })))
  })

  // Per-agent skill install/uninstall
  app.get('/api/agents/:id/skills', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('agents', req.params.id, teamId))) return res.status(404).json({ error: 'Agent not found' })
    res.json(await getAgentSkills(db, req.params.id))
  })

  app.post('/api/agents/:id/skills', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('agents', req.params.id, teamId))) return res.status(404).json({ error: 'Agent not found' })
    const { skillName } = validate(InstallSkillSchema, req.body)
    await installSkill(db, req.params.id, skillName)
    res.status(201).json({ agentId: req.params.id, skillName, installed: true })
  })

  app.delete('/api/agents/:id/skills/:skillName', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('agents', req.params.id, teamId))) return res.status(404).json({ error: 'Agent not found' })
    await uninstallSkill(db, req.params.id, req.params.skillName)
    res.status(204).end()
  })

  // ===== MCP Servers (self-hosted only) =====
  // SECURITY: MCP is fully blocked in hosted mode. Self-hosted only.
  // All routes require admin role. Server names and commands are validated.

  const MCP_BLOCKED = process.env.YOKEBOT_HOSTED_MODE === 'true'
  const MAX_MCP_SERVERS_PER_AGENT = 10
  const MCP_SERVER_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_-]{0,49}$/
  // Block shell metacharacters and dangerous commands in stdio commands
  const MCP_COMMAND_BLOCKLIST = /[;&|`$(){}!<>\\]|rm\s|sudo|chmod|chown|kill|shutdown|reboot|mkfs|dd\s|curl.*\|.*sh|wget.*\|.*sh/i

  app.get('/api/agents/:id/mcp-servers', async (req, res) => {
    if (MCP_BLOCKED) return res.status(403).json({ error: 'MCP servers are not available in hosted mode' })
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('agents', req.params.id, teamId))) return res.status(404).json({ error: 'Agent not found' })
    const servers = await listMcpServers(db, req.params.id)
    // Strip env vars from response (may contain secrets)
    res.json(servers.map((s) => ({ ...s, envVars: s.envVars ? '[configured]' : undefined })))
  })

  app.post('/api/agents/:id/mcp-servers', async (req, res) => {
    if (MCP_BLOCKED) return res.status(403).json({ error: 'MCP servers are not available in hosted mode' })
    if (!requireRole(req, res, 'admin')) return
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('agents', req.params.id, teamId))) return res.status(404).json({ error: 'Agent not found' })

    const { serverName, transportType, command, args, url, envVars } = req.body as Record<string, string>

    // Validate required fields
    if (!serverName || !transportType) return res.status(400).json({ error: 'serverName and transportType are required' })

    // Validate server name format (alphanumeric + hyphens/underscores, max 50 chars)
    if (!MCP_SERVER_NAME_REGEX.test(serverName)) {
      return res.status(400).json({ error: 'Invalid server name. Use letters, numbers, hyphens, and underscores (max 50 chars).' })
    }

    // Validate transport type
    if (transportType !== 'stdio' && transportType !== 'http') {
      return res.status(400).json({ error: 'transportType must be "stdio" or "http"' })
    }

    // Validate stdio-specific fields
    if (transportType === 'stdio') {
      if (!command || typeof command !== 'string' || command.trim().length === 0) {
        return res.status(400).json({ error: 'command is required for stdio transport' })
      }
      // Block shell metacharacters and dangerous commands
      if (MCP_COMMAND_BLOCKLIST.test(command)) {
        return res.status(400).json({ error: 'Command contains blocked characters or patterns. Use simple executable names (e.g., "npx", "node").' })
      }
      // Validate args is valid JSON array if provided
      if (args) {
        try {
          const parsed = JSON.parse(args)
          if (!Array.isArray(parsed)) return res.status(400).json({ error: 'args must be a JSON array of strings' })
          // Block shell metacharacters in individual args
          for (const arg of parsed) {
            if (typeof arg !== 'string') return res.status(400).json({ error: 'Each arg must be a string' })
            if (MCP_COMMAND_BLOCKLIST.test(arg)) return res.status(400).json({ error: 'Args contain blocked characters' })
          }
        } catch {
          return res.status(400).json({ error: 'args must be valid JSON' })
        }
      }
    }

    // Validate HTTP-specific fields
    if (transportType === 'http') {
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'url is required for http transport' })
      }
      // Validate URL format and block localhost/internal networks in hosted mode
      try {
        const parsed = new URL(url)
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          return res.status(400).json({ error: 'URL must use http or https protocol' })
        }
      } catch {
        return res.status(400).json({ error: 'Invalid URL format' })
      }
    }

    // Validate env vars JSON if provided
    if (envVars) {
      try {
        const parsed = JSON.parse(envVars)
        if (typeof parsed !== 'object' || Array.isArray(parsed)) return res.status(400).json({ error: 'envVars must be a JSON object' })
        // Block PATH and other dangerous env vars
        const blockedEnvVars = ['PATH', 'LD_PRELOAD', 'LD_LIBRARY_PATH', 'DYLD_INSERT_LIBRARIES', 'DYLD_LIBRARY_PATH']
        for (const key of Object.keys(parsed)) {
          if (blockedEnvVars.includes(key.toUpperCase())) {
            return res.status(400).json({ error: `Environment variable "${key}" is not allowed` })
          }
        }
      } catch {
        return res.status(400).json({ error: 'envVars must be valid JSON' })
      }
    }

    // Enforce max servers per agent
    const existing = await listMcpServers(db, req.params.id)
    if (existing.length >= MAX_MCP_SERVERS_PER_AGENT) {
      return res.status(400).json({ error: `Maximum ${MAX_MCP_SERVERS_PER_AGENT} MCP servers per agent` })
    }

    const config = await addMcpServer(db, {
      agentId: req.params.id, serverName, transportType: transportType as 'stdio' | 'http',
      command, args, url, envVars,
    })
    await logActivity(db, 'mcp_server_added', req.params.id, `MCP server "${serverName}" added (${transportType})`, undefined, teamId)
    res.status(201).json({ ...config, envVars: config.envVars ? '[configured]' : undefined })
  })

  app.delete('/api/agents/:id/mcp-servers/:name', async (req, res) => {
    if (MCP_BLOCKED) return res.status(403).json({ error: 'MCP servers are not available in hosted mode' })
    if (!requireRole(req, res, 'admin')) return
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('agents', req.params.id, teamId))) return res.status(404).json({ error: 'Agent not found' })
    // Validate server name param
    if (!MCP_SERVER_NAME_REGEX.test(req.params.name)) return res.status(400).json({ error: 'Invalid server name' })
    await removeMcpServer(db, req.params.id, req.params.name)
    await logActivity(db, 'mcp_server_removed', req.params.id, `MCP server "${req.params.name}" removed`, undefined, teamId)
    res.status(204).end()
  })

  app.post('/api/agents/:id/mcp-servers/:name/test', async (req, res) => {
    if (MCP_BLOCKED) return res.status(403).json({ error: 'MCP servers are not available in hosted mode' })
    if (!requireRole(req, res, 'admin')) return
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('agents', req.params.id, teamId))) return res.status(404).json({ error: 'Agent not found' })
    if (!MCP_SERVER_NAME_REGEX.test(req.params.name)) return res.status(400).json({ error: 'Invalid server name' })
    const servers = await listMcpServers(db, req.params.id)
    const server = servers.find((s) => s.serverName === req.params.name)
    if (!server) return res.status(404).json({ error: 'MCP server not found' })
    try {
      const tools = await connectMcpServer(server)
      res.json({ status: 'connected', toolCount: tools.length, tools: tools.map((t) => t.function.name) })
    } catch (err) {
      // Don't leak internal error details
      const message = (err as Error).message
      const safeMessage = message.includes('ENOENT') ? 'Command not found. Make sure the MCP server is installed.'
        : message.includes('timed out') ? 'Connection timed out.'
        : message.includes('ECONNREFUSED') ? 'Connection refused. Check the server URL.'
        : 'Failed to connect to MCP server.'
      res.status(400).json({ status: 'error', error: safeMessage })
    }
  })

  // ===== Credentials (BYOK) =====
  // SECURITY: Only admins can write/delete. Values are encrypted at rest.
  // List endpoint returns hasValue booleans only, never actual values.
  // serviceId is validated against the known service registry.

  app.get('/api/credentials', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    // Returns only { serviceId, credentialType, hasValue, updatedAt } — never the actual encrypted values
    const creds = await listCredentials(db, teamId)
    res.json(creds)
  })

  app.put('/api/credentials', async (req, res) => {
    if (!requireRole(req, res, 'admin')) return
    const teamId = req.user!.activeTeamId!
    const { serviceId, value, credentialType } = validate(SetCredentialSchema, req.body)

    // Validate serviceId exists in the service registry
    const { getService } = await import('./services.ts')
    if (!getService(serviceId)) {
      return res.status(400).json({ error: `Unknown service: "${serviceId}". Check /api/services for available services.` })
    }

    // Credential values are encrypted before storage (AES-256-GCM when YOKEBOT_ENCRYPTION_KEY is set)
    await setCredential(db, teamId, serviceId, value, credentialType)
    await logActivity(db, 'credential_updated', null, `Credential updated for service "${serviceId}"`, undefined, teamId)
    // Never return the value back
    res.json({ serviceId, hasValue: true })
  })

  app.delete('/api/credentials/:serviceId', async (req, res) => {
    if (!requireRole(req, res, 'admin')) return
    const teamId = req.user!.activeTeamId!
    // Validate serviceId format (same regex as SetCredentialSchema)
    if (!/^[a-z][a-z0-9-]{0,49}$/.test(req.params.serviceId)) {
      return res.status(400).json({ error: 'Invalid service ID format' })
    }
    const deleted = await deleteCredential(db, teamId, req.params.serviceId)
    if (!deleted) return res.status(404).json({ error: 'Credential not found' })
    await logActivity(db, 'credential_deleted', null, `Credential removed for service "${req.params.serviceId}"`, undefined, teamId)
    res.status(204).end()
  })

  // ===== Session Vault =====
  // SECURITY: Admin-only for write operations. Encrypted state never returned to client.

  app.get('/api/vault/sessions', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const sessions = await listVaultSessions(db, teamId)
    res.json(sessions)
  })

  app.post('/api/vault/sessions/:id/revoke', async (req, res) => {
    if (!requireRole(req, res, 'admin')) return
    const teamId = req.user!.activeTeamId!
    const revoked = await revokeVaultSession(db, req.params.id, teamId)
    if (!revoked) return res.status(404).json({ error: 'Session not found' })
    await logVaultEvent(db, req.params.id, teamId, 'revoked', undefined, req.user!.id)
    await logActivity(db, 'vault_session_revoked', null, `Vault session revoked`, undefined, teamId)
    res.json({ success: true })
  })

  app.delete('/api/vault/sessions/:id', async (req, res) => {
    if (!requireRole(req, res, 'admin')) return
    const teamId = req.user!.activeTeamId!
    const deleted = await deleteVaultSession(db, req.params.id, teamId)
    if (!deleted) return res.status(404).json({ error: 'Session not found' })
    await logActivity(db, 'vault_session_deleted', null, `Vault session deleted`, undefined, teamId)
    res.status(204).end()
  })

  app.get('/api/vault/sessions/:id/logs', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const logs = await getVaultLogs(db, req.params.id, teamId)
    res.json(logs)
  })

  // ---- Recording flow ----

  app.post('/api/vault/record/start', async (req, res) => {
    if (!requireRole(req, res, 'admin')) return
    const teamId = req.user!.activeTeamId!
    const { targetUrl, label } = req.body as { targetUrl: string; label: string }
    if (!targetUrl || !label) return res.status(400).json({ error: 'targetUrl and label are required' })

    if (hasActiveRecording(teamId)) {
      return res.status(409).json({ error: 'A recording is already in progress for this team' })
    }

    try {
      const recordingId = crypto.randomUUID()
      const result = await startRecording(recordingId, teamId, req.user!.id!, targetUrl)
      res.json({ recordingId, screenshot: result.screenshot, url: result.url })
    } catch (err) {
      res.status(400).json({ error: (err as Error).message })
    }
  })

  app.post('/api/vault/record/:id/interact', async (req, res) => {
    if (!requireRole(req, res, 'admin')) return
    const session = getRecordingSession(req.params.id)
    if (!session) return res.status(404).json({ error: 'Recording session not found' })
    if (session.teamId !== req.user!.activeTeamId!) return res.status(403).json({ error: 'Forbidden' })

    try {
      const action = req.body as InteractionAction
      const result = await sendInteraction(req.params.id, action)
      res.json(result)
    } catch (err) {
      res.status(400).json({ error: (err as Error).message })
    }
  })

  app.get('/api/vault/record/:id/stream', async (req, res) => {
    if (!requireRole(req, res, 'admin')) return
    const session = getRecordingSession(req.params.id)
    if (!session) return res.status(404).json({ error: 'Recording session not found' })
    if (session.teamId !== req.user!.activeTeamId!) return res.status(403).json({ error: 'Forbidden' })

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    let closed = false
    req.on('close', () => { closed = true })

    const MAX_STREAM_DURATION = 60 * 60 * 1000 // 1 hour
    const MAX_STREAM_BYTES = 50 * 1024 * 1024   // 50MB
    const startTime = Date.now()
    let bytesWritten = 0

    // Stream screenshots at ~2fps with timeout + size cap
    const sendScreenshot = async () => {
      while (!closed) {
        if (Date.now() - startTime > MAX_STREAM_DURATION) { res.write('event: timeout\ndata: {}\n\n'); break }
        if (bytesWritten > MAX_STREAM_BYTES) { res.write('event: size_limit\ndata: {}\n\n'); break }
        try {
          const active = getRecordingSession(req.params.id)
          if (!active) { res.write('event: closed\ndata: {}\n\n'); break }
          const result = await captureScreenshot(req.params.id)
          const chunk = `data: ${JSON.stringify(result)}\n\n`
          bytesWritten += chunk.length
          res.write(chunk)
        } catch {
          break
        }
        await new Promise((r) => setTimeout(r, 500))
      }
      if (!closed) res.end()
    }
    sendScreenshot()
  })

  app.post('/api/vault/record/:id/finish', async (req, res) => {
    if (!requireRole(req, res, 'admin')) return
    const session = getRecordingSession(req.params.id)
    if (!session) return res.status(404).json({ error: 'Recording session not found' })
    if (session.teamId !== req.user!.activeTeamId!) return res.status(403).json({ error: 'Forbidden' })

    try {
      const { label } = req.body as { label?: string }
      const result = await finishRecording(req.params.id)
      const vaultSession = await createVaultSession(
        db, session.teamId, label || result.domain, result.domain, result.storageState, session.userId,
      )
      await logVaultEvent(db, vaultSession.id, session.teamId, 'recorded', undefined, session.userId)
      await logActivity(db, 'vault_session_recorded', null, `Vault session recorded for ${result.domain}`, undefined, session.teamId)
      res.json({ session: vaultSession })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  app.post('/api/vault/record/:id/cancel', async (req, res) => {
    const session = getRecordingSession(req.params.id)
    if (!session) return res.status(404).json({ error: 'Recording session not found' })
    if (session.teamId !== req.user!.activeTeamId!) return res.status(403).json({ error: 'Forbidden' })

    await cancelRecording(req.params.id)
    res.json({ success: true })
  })

  // ===== Browser Sessions (workspace browser panel) =====

  app.post('/api/browser-sessions', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    const body = validate(CreateBrowserSessionSchema, req.body ?? {})
    try {
      const result = await createBrowserSession(teamId, req.user!.id, {
        vaultSessionId: body.vaultSessionId,
        startUrl: body.startUrl,
        db,
      })
      res.status(201).json(result)
    } catch (err) {
      const msg = (err as Error).message || 'Failed to create browser session — Playwright/Chromium may not be available on this server.'
      res.status(400).json({ error: msg })
    }
  })

  app.get('/api/browser-sessions', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    res.json(listActiveSessions(teamId))
  })

  app.get('/api/browser-sessions/:id/screenshot', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    const session = getSessionInfo(req.params.id)
    if (!session) return res.status(404).json({ error: 'Browser session not found' })
    if (session.teamId !== teamId) return res.status(403).json({ error: 'Forbidden' })
    try {
      const result = await getSessionScreenshot(req.params.id)
      res.json(result)
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  app.post('/api/browser-sessions/:id/interact', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    const session = getSessionInfo(req.params.id)
    if (!session) return res.status(404).json({ error: 'Browser session not found' })
    if (session.teamId !== teamId) return res.status(403).json({ error: 'Forbidden' })
    const action = validate(BrowserInteractSchema, req.body)
    try {
      const result = await interactWithSession(req.params.id, action as BrowserInteractionAction)
      res.json(result)
    } catch (err) {
      res.status(400).json({ error: (err as Error).message })
    }
  })

  app.post('/api/browser-sessions/:id/navigate', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    const session = getSessionInfo(req.params.id)
    if (!session) return res.status(404).json({ error: 'Browser session not found' })
    if (session.teamId !== teamId) return res.status(403).json({ error: 'Forbidden' })
    const body = validate(BrowserNavigateSchema, req.body)
    try {
      const result = await navigateSession(req.params.id, body.url)
      res.json(result)
    } catch (err) {
      res.status(400).json({ error: (err as Error).message })
    }
  })

  app.post('/api/browser-sessions/:id/close', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    const session = getSessionInfo(req.params.id)
    if (!session) return res.status(404).json({ error: 'Browser session not found' })
    if (session.teamId !== teamId) return res.status(403).json({ error: 'Forbidden' })
    await closeBrowserSess(req.params.id)
    res.json({ success: true })
  })

  app.post('/api/browser-sessions/:id/save-to-vault', async (req, res) => {
    if (!requireRole(req, res, 'admin')) return
    const teamId = req.user!.activeTeamId!
    const session = getSessionInfo(req.params.id)
    if (!session) return res.status(404).json({ error: 'Browser session not found' })
    if (session.teamId !== teamId) return res.status(403).json({ error: 'Forbidden' })
    const body = validate(SaveBrowserToVaultSchema, req.body)
    try {
      const result = await saveSessionToVault(req.params.id, db, teamId, body.label)
      await logActivity(db, 'vault_session_saved', null, `Saved browser session as "${body.label}"`, undefined, teamId)
      res.json(result)
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  app.get('/api/agents/:id/browser/screenshot', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const agent = await getAgent(db, req.params.id)
    if (!agent) return res.status(404).json({ error: 'Agent not found' })
    // Verify agent belongs to this team
    const teamAgentIds = await getTeamAgentIds(db, teamId)
    if (!teamAgentIds.includes(agent.id)) return res.status(403).json({ error: 'Forbidden' })
    try {
      const result = await captureAgentScreenshot(agent.id)
      if (!result) return res.status(404).json({ error: 'Agent has no active browser session' })
      res.json(result)
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // ===== Brand Kit =====

  app.get('/api/teams/:id/brand-kit', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    if (req.params.id !== teamId) return res.status(403).json({ error: 'Forbidden' })
    const row = await db.queryOne<Record<string, unknown>>(
      'SELECT * FROM brand_kits WHERE team_id = $1',
      [teamId],
    )
    if (!row) {
      // Return defaults (no row yet)
      return res.json({
        teamId,
        primaryColor: '#3b82f6', secondaryColor: '#10b981', accentColor: '#f59e0b',
        backgroundColor: '#ffffff', surfaceColor: '#f8fafc', textColor: '#1e293b',
        headingFont: 'Inter', bodyFont: 'Inter', baseFontSize: '16px',
        headingStyle: 'bold', borderRadius: '8px', spacingScale: 'comfortable',
        buttonStyle: 'rounded', cardStyle: 'elevated', preset: null,
      })
    }
    res.json({
      teamId: row.team_id,
      primaryColor: row.primary_color,
      secondaryColor: row.secondary_color,
      accentColor: row.accent_color,
      backgroundColor: row.background_color,
      surfaceColor: row.surface_color,
      textColor: row.text_color,
      headingFont: row.heading_font,
      bodyFont: row.body_font,
      baseFontSize: row.base_font_size,
      headingStyle: row.heading_style,
      borderRadius: row.border_radius,
      spacingScale: row.spacing_scale,
      buttonStyle: row.button_style,
      cardStyle: row.card_style,
      preset: row.preset,
    })
  })

  app.put('/api/teams/:id/brand-kit', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    if (req.params.id !== teamId) return res.status(403).json({ error: 'Forbidden' })
    const kit = req.body as Record<string, string | null>

    // Upsert
    if (db.driver === 'postgres') {
      await db.run(`
        INSERT INTO brand_kits (id, team_id, primary_color, secondary_color, accent_color, background_color, surface_color, text_color, heading_font, body_font, base_font_size, heading_style, border_radius, spacing_scale, button_style, card_style, preset, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
        ON CONFLICT (team_id) DO UPDATE SET
          primary_color = EXCLUDED.primary_color,
          secondary_color = EXCLUDED.secondary_color,
          accent_color = EXCLUDED.accent_color,
          background_color = EXCLUDED.background_color,
          surface_color = EXCLUDED.surface_color,
          text_color = EXCLUDED.text_color,
          heading_font = EXCLUDED.heading_font,
          body_font = EXCLUDED.body_font,
          base_font_size = EXCLUDED.base_font_size,
          heading_style = EXCLUDED.heading_style,
          border_radius = EXCLUDED.border_radius,
          spacing_scale = EXCLUDED.spacing_scale,
          button_style = EXCLUDED.button_style,
          card_style = EXCLUDED.card_style,
          preset = EXCLUDED.preset,
          updated_at = NOW()
      `, [
        `bk_${teamId}`, teamId,
        kit.primaryColor ?? '#3b82f6', kit.secondaryColor ?? '#10b981', kit.accentColor ?? '#f59e0b',
        kit.backgroundColor ?? '#ffffff', kit.surfaceColor ?? '#f8fafc', kit.textColor ?? '#1e293b',
        kit.headingFont ?? 'Inter', kit.bodyFont ?? 'Inter', kit.baseFontSize ?? '16px',
        kit.headingStyle ?? 'bold', kit.borderRadius ?? '8px', kit.spacingScale ?? 'comfortable',
        kit.buttonStyle ?? 'rounded', kit.cardStyle ?? 'elevated', kit.preset ?? null,
      ])
    } else {
      await db.run(`
        INSERT OR REPLACE INTO brand_kits (id, team_id, primary_color, secondary_color, accent_color, background_color, surface_color, text_color, heading_font, body_font, base_font_size, heading_style, border_radius, spacing_scale, button_style, card_style, preset, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, datetime('now'), datetime('now'))
      `, [
        `bk_${teamId}`, teamId,
        kit.primaryColor ?? '#3b82f6', kit.secondaryColor ?? '#10b981', kit.accentColor ?? '#f59e0b',
        kit.backgroundColor ?? '#ffffff', kit.surfaceColor ?? '#f8fafc', kit.textColor ?? '#1e293b',
        kit.headingFont ?? 'Inter', kit.bodyFont ?? 'Inter', kit.baseFontSize ?? '16px',
        kit.headingStyle ?? 'bold', kit.borderRadius ?? '8px', kit.spacingScale ?? 'comfortable',
        kit.buttonStyle ?? 'rounded', kit.cardStyle ?? 'elevated', kit.preset ?? null,
      ])
    }

    res.json({ ok: true })
  })

  // ===== Sandbox (Daytona app-building) =====

  app.get('/api/sandbox/status', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const { getSandboxStatus } = await import('./sandbox.ts')
    const status = await getSandboxStatus(db, teamId)
    res.json(status ?? { status: 'none', previewUrl: null, createdAt: null, lastActivity: null })
  })

  app.post('/api/sandbox/start', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    try {
      const { getOrCreateSandbox } = await import('./sandbox.ts')
      const session = await getOrCreateSandbox(db, teamId)
      res.json({ status: 'running', sandboxId: session.sandbox.id })
    } catch (err) {
      console.error('[sandbox] Start error:', (err as Error).message)
      res.status(500).json({ error: (err as Error).message })
    }
  })

  app.post('/api/sandbox/stop', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    try {
      const { stopSandbox } = await import('./sandbox.ts')
      await stopSandbox(db, teamId)
      res.json({ status: 'stopped' })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  app.get('/api/sandbox/preview', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const port = Number(req.query.port) || 5173
    try {
      const { getPreviewUrl } = await import('./sandbox.ts')
      const url = await getPreviewUrl(db, teamId, port)
      res.json({ url, port })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  app.get('/api/sandbox/files', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const dir = (req.query.dir as string) ?? '/'
    try {
      const { sandboxListFiles } = await import('./sandbox.ts')
      const files = await sandboxListFiles(db, teamId, dir)
      res.json(files)
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  app.get('/api/sandbox/files/*path', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    // Extract file path from wildcard — everything after /api/sandbox/files/
    const filePath = '/' + (req.params.path || '')
    try {
      const { sandboxReadFile } = await import('./sandbox.ts')
      const content = await sandboxReadFile(db, teamId, filePath)
      res.json({ path: filePath, content })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // ===== Sandbox Preview Proxy =====
  // Proxies the Daytona preview through our domain to avoid cross-origin interstitial pages.
  // Dashboard iframe loads /api/sandbox/proxy/* instead of the Daytona URL directly.

  // Authenticated endpoint: generate a proxy token for iframe use
  app.get('/api/sandbox/proxy-token', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const port = Number(req.query.port) || 5173
    try {
      const { getPreviewUrl } = await import('./sandbox.ts')
      const signedUrl = await getPreviewUrl(db, teamId, port)
      // Generate a random token valid for 4 hours
      const token = `spt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
      proxyTokenStore.set(token, { teamId, signedUrl, expires: Date.now() + 4 * 3600_000 })
      // Clean up expired tokens periodically
      for (const [k, v] of proxyTokenStore) {
        if (Date.now() > v.expires) proxyTokenStore.delete(k)
      }
      res.json({ token, proxyUrl: `/api/sandbox/proxy/${token}/` })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // Start a specific project's dev server (called when human opens preview)
  app.post('/api/sandbox/projects/:id/start-server', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    try {
      const { startProjectDevServer } = await import('./sandbox.ts')
      const result = await startProjectDevServer(db, teamId, req.params.id)
      res.json(result)
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // ===== Visual Editor: apply-style + import =====

  const sandboxEditLimiter = rateLimit({ windowMs: 60_000, max: 60, keyGenerator: (req) => req.user?.activeTeamId ?? ipKeyGenerator(req.ip ?? '0.0.0.0') })

  // Persist visual style edits to sandbox source files
  app.post('/api/sandbox/apply-style', sandboxEditLimiter, async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    const { sourceFile, sourceLine, changes } = req.body as {
      sourceFile: string
      sourceLine: number
      changes: Array<{ property: string; value: string; tailwindClass: string }>
    }
    if (!sourceFile || !sourceLine || !changes?.length) {
      return res.status(400).json({ error: 'sourceFile, sourceLine, and changes are required' })
    }
    try {
      const { sandboxReadFile, sandboxWriteFile } = await import('./sandbox.ts')
      const { applyClassReplacement } = await import('./tailwind-edit.ts')

      // Normalize source path — Vite _debugSource gives paths like /home/daytona/app/src/App.tsx
      // or relative like src/App.tsx
      let filePath = sourceFile
      if (!filePath.startsWith('/')) filePath = `/home/daytona/app/${filePath}`

      // Prevent path traversal — resolved path must stay inside /home/daytona/app/
      const { resolve: pathResolve } = await import('node:path')
      const resolved = pathResolve(filePath)
      if (!resolved.startsWith('/home/daytona/app/')) {
        return res.status(400).json({ error: 'Invalid source file path' })
      }
      filePath = resolved

      let content = await sandboxReadFile(db, teamId, filePath)

      for (const change of changes) {
        const modified = applyClassReplacement(content, sourceLine, change.tailwindClass, change.property)
        if (modified) content = modified
      }

      await sandboxWriteFile(db, teamId, filePath, content)
      res.json({ ok: true })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // Persist inline text edits to sandbox source files
  app.post('/api/sandbox/apply-text', sandboxEditLimiter, async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    const { sourceFile, sourceLine, oldText, newText } = req.body as {
      sourceFile: string
      sourceLine: number
      oldText?: string
      newText: string
    }
    if (!sourceFile || !sourceLine || newText == null) {
      return res.status(400).json({ error: 'sourceFile, sourceLine, and newText are required' })
    }
    try {
      const { sandboxReadFile, sandboxWriteFile } = await import('./sandbox.ts')

      let filePath = sourceFile
      if (!filePath.startsWith('/')) filePath = `/home/daytona/app/${filePath}`

      // Prevent path traversal — resolved path must stay inside /home/daytona/app/
      const { resolve: pathResolve } = await import('node:path')
      const resolved = pathResolve(filePath)
      if (!resolved.startsWith('/home/daytona/app/')) {
        return res.status(400).json({ error: 'Invalid source file path' })
      }
      filePath = resolved

      const content = await sandboxReadFile(db, teamId, filePath)
      const lines = content.split('\n')
      const targetIdx = sourceLine - 1
      let replaced = false

      // Strategy 1: If we have oldText, search for it near the source line
      if (oldText && oldText.trim()) {
        const oldTrimmed = oldText.trim()
        const searchStart = Math.max(0, targetIdx - 5)
        const searchEnd = Math.min(lines.length, targetIdx + 6)

        // Try line-by-line first (handles most JSX text content)
        for (let i = searchStart; i < searchEnd; i++) {
          const line = lines[i]
          if (line.includes(oldTrimmed)) {
            lines[i] = line.replace(oldTrimmed, newText.trim())
            replaced = true
            break
          }
        }

        // If not found line-by-line, try as a multi-line block
        if (!replaced) {
          const searchBlock = lines.slice(searchStart, searchEnd).join('\n')
          if (searchBlock.includes(oldTrimmed)) {
            const newBlock = searchBlock.replace(oldTrimmed, newText.trim())
            const newBlockLines = newBlock.split('\n')
            lines.splice(searchStart, searchEnd - searchStart, ...newBlockLines)
            replaced = true
          }
        }
      }

      // Strategy 2: Regex fallback — find >text< near target line
      if (!replaced) {
        const searchStart = Math.max(0, targetIdx - 3)
        const searchEnd = Math.min(lines.length, targetIdx + 4)
        for (let i = searchStart; i < searchEnd; i++) {
          const line = lines[i]
          const textMatch = line.match(/(>[^<]+)</)
          if (textMatch) {
            const existingText = textMatch[1].slice(1).trim()
            if (existingText.length > 0) {
              lines[i] = line.replace(textMatch[1], '>' + newText.trim())
              replaced = true
              break
            }
          }
        }
      }

      if (replaced) {
        await sandboxWriteFile(db, teamId, filePath, lines.join('\n'))
      }

      res.json({ ok: true, replaced })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // Import an external project (GitHub/GitLab URL) into sandbox
  app.post('/api/sandbox/import', sandboxEditLimiter, async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    const { url: repoUrl } = req.body as { url: string }
    if (!repoUrl) return res.status(400).json({ error: 'url is required' })
    try {
      const { importProject } = await import('./sandbox.ts')
      const result = await importProject(db, teamId, repoUrl)
      res.json(result)
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // ===== Sandbox Projects =====

  app.get('/api/sandbox/projects', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    try {
      const { listSandboxProjects } = await import('./sandbox.ts')
      const projects = await listSandboxProjects(db, teamId)
      res.json(projects)
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  app.post('/api/sandbox/projects', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    const { name, framework } = req.body as { name: string; framework?: string }
    if (!name) return res.status(400).json({ error: 'name is required' })
    try {
      const { createSandboxProject } = await import('./sandbox.ts')
      const project = await createSandboxProject(db, teamId, name, { framework })
      res.status(201).json(project)
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  app.get('/api/sandbox/projects/:id', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    try {
      const { getSandboxProject } = await import('./sandbox.ts')
      const project = await getSandboxProject(db, req.params.id)
      if (!project) return res.status(404).json({ error: 'Project not found' })
      if (project.teamId !== teamId) return res.status(403).json({ error: 'Forbidden' })
      res.json(project)
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  app.get('/api/sandbox/projects/:id/files', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    try {
      const { getSandboxProject, sandboxListFiles } = await import('./sandbox.ts')
      const project = await getSandboxProject(db, req.params.id)
      if (!project) return res.status(404).json({ error: 'Project not found' })
      if (project.teamId !== teamId) return res.status(403).json({ error: 'Forbidden' })
      const dir = (req.query.dir as string) || project.directory
      const files = await sandboxListFiles(db, teamId, dir)
      res.json(files)
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // ===== Publishing (static R2 + dynamic Railway) =====

  app.get('/api/publish', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    try {
      const { listPublishedApps } = await import('./publish.ts')
      const apps = await listPublishedApps(db, teamId)
      res.json(apps)
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  app.get('/api/publish/:id', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    try {
      const { getPublishedApp } = await import('./publish.ts')
      const app = await getPublishedApp(db, req.params.id)
      if (!app) return res.status(404).json({ error: 'App not found' })
      if (app.teamId !== teamId) return res.status(403).json({ error: 'Forbidden' })
      res.json(app)
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  app.post('/api/publish', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const { appName, displayName, subdomain, hostingType, customDomain } = req.body as {
      appName: string; displayName: string; subdomain: string
      hostingType: 'static' | 'custom-domain' | 'dynamic'; customDomain?: string
    }

    if (!appName || !displayName || !subdomain) {
      return res.status(400).json({ error: 'appName, displayName, and subdomain are required' })
    }
    if ((hostingType === 'custom-domain' || hostingType === 'dynamic') && !customDomain) {
      return res.status(400).json({ error: 'customDomain is required for paid hosting' })
    }

    try {
      const { publishStatic, publishCustomDomain, publishDynamic } = await import('./publish.ts')
      const opts = { appName, displayName, subdomain, customDomain: customDomain!, createdBy: req.user!.id }

      let app
      if (hostingType === 'dynamic') {
        app = await publishDynamic(db, teamId, opts)
      } else if (hostingType === 'custom-domain') {
        app = await publishCustomDomain(db, teamId, opts)
      } else {
        app = await publishStatic(db, teamId, { appName, displayName, subdomain, createdBy: req.user!.id })
      }

      await logActivity(db, 'app_published', null, `Published ${hostingType} app: ${displayName} (${subdomain}.yokebot.app)`, undefined, teamId)
      res.json(app)
    } catch (err) {
      console.error('[publish] Publish error:', (err as Error).message)
      res.status(500).json({ error: (err as Error).message })
    }
  })

  app.delete('/api/publish/:id', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    try {
      const { unpublishApp, getPublishedApp } = await import('./publish.ts')
      const app = await getPublishedApp(db, req.params.id)
      if (!app) return res.status(404).json({ error: 'App not found' })
      if (app.teamId !== teamId) return res.status(403).json({ error: 'Forbidden' })

      // Remove Stripe addon if paid hosting
      if (app.hostingType === 'dynamic' || app.hostingType === 'custom-domain') {
        try {
          const { getSubscription } = await import('./billing.ts')
          const sub = await getSubscription(db, teamId)
          const priceId = app.hostingType === 'dynamic'
            ? process.env.STRIPE_APP_HOSTING_PRICE_ID
            : process.env.STRIPE_CUSTOM_DOMAIN_PRICE_ID
          if (sub?.stripeSubscriptionId && priceId) {
            const eePath = '../../../ee/stripe-billing.js'
            const ee = await import(eePath) as {
              removeHostingFromSubscription: (subscriptionId: string, priceId: string) => Promise<void>
            }
            await ee.removeHostingFromSubscription(sub.stripeSubscriptionId, priceId)
          }
        } catch (err) {
          console.error('[publish] Failed to remove Stripe hosting addon:', (err as Error).message)
        }
      }

      await unpublishApp(db, teamId, req.params.id)
      await logActivity(db, 'app_unpublished', null, `Unpublished app: ${app.displayName}`, undefined, teamId)
      res.json({ deleted: true })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  app.post('/api/publish/:id/upgrade', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    try {
      const { upgradeToFullStack } = await import('./publish.ts')
      const app = await upgradeToFullStack(db, teamId, req.params.id)
      await logActivity(db, 'app_upgraded', null, `Upgraded app to full-stack: ${app.displayName}`, undefined, teamId)
      res.json(app)
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // ===== Skill Health & Versioning =====

  // Layer 1: Skill run history
  app.get('/api/teams/:id/skill-runs', async (req, res) => {
    const teamId = req.params.id
    try {
      const { listSkillRuns } = await import('./skill-runs.ts')
      const runs = await listSkillRuns(db, teamId, {
        skillName: req.query.skill as string | undefined,
        agentId: req.query.agent as string | undefined,
        status: req.query.status as 'success' | 'failure' | 'timeout' | undefined,
        limit: Number(req.query.limit) || 50,
        offset: Number(req.query.offset) || 0,
      })
      res.json(runs)
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  app.get('/api/teams/:id/skill-runs/stats', async (req, res) => {
    const teamId = req.params.id
    try {
      const { getSkillRunStats } = await import('./skill-runs.ts')
      res.json(await getSkillRunStats(db, teamId))
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  app.post('/api/teams/:id/skill-runs/:runId/feedback', async (req, res) => {
    const { feedback } = req.body as { feedback: 'positive' | 'negative' }
    if (!feedback || !['positive', 'negative'].includes(feedback)) {
      res.status(400).json({ error: 'feedback must be "positive" or "negative"' }); return
    }
    try {
      const { submitRunFeedback } = await import('./skill-runs.ts')
      await submitRunFeedback(db, req.params.runId, feedback)
      res.json({ ok: true })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // Layer 2: Skill warnings
  app.get('/api/teams/:id/skill-warnings', async (req, res) => {
    const teamId = req.params.id
    try {
      const { getFailingSkills } = await import('./skill-runs.ts')
      res.json(await getFailingSkills(db, teamId))
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // Layer 3: Skill versions
  app.get('/api/teams/:id/skill-versions/:skillName', async (req, res) => {
    const teamId = req.params.id
    try {
      const { listSkillVersions } = await import('./skill-versions.ts')
      res.json(await listSkillVersions(db, teamId, req.params.skillName))
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  app.post('/api/teams/:id/skill-versions/:skillName/rollback', async (req, res) => {
    const teamId = req.params.id
    const { version } = req.body as { version: number }
    if (!version) { res.status(400).json({ error: 'version is required' }); return }
    try {
      const { rollbackSkillVersion } = await import('./skill-versions.ts')
      const result = await rollbackSkillVersion(db, teamId, req.params.skillName, version)
      if (!result) { res.status(404).json({ error: 'Version not found' }); return }
      res.json(result)
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // Layer 3: Skill improvement proposals
  app.get('/api/teams/:id/skill-proposals', async (req, res) => {
    const teamId = req.params.id
    try {
      const { listProposals } = await import('./skill-versions.ts')
      const status = req.query.status as 'pending' | 'approved' | 'rejected' | 'applied' | undefined
      res.json(await listProposals(db, teamId, status))
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  app.post('/api/teams/:id/skill-proposals/:proposalId/review', async (req, res) => {
    const userId = req.user!.id
    const { approved } = req.body as { approved: boolean }
    if (typeof approved !== 'boolean') { res.status(400).json({ error: 'approved must be a boolean' }); return }
    try {
      const { reviewProposal } = await import('./skill-versions.ts')
      const result = await reviewProposal(db, req.params.proposalId, approved, userId)
      res.json({ ok: true, newVersion: result })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // ===== Services (available integrations) =====

  app.get('/api/services', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const hostedMode = process.env.YOKEBOT_HOSTED_MODE === 'true'
    const services = listServices().filter((s) => !hostedMode || !s.selfHostedOnly)
    const creds = await listCredentials(db, teamId)
    const credMap = new Map(creds.map((c) => [c.serviceId, c]))
    res.json(services.map((s) => ({
      ...s,
      connected: credMap.has(s.id),
      updatedAt: credMap.get(s.id)?.updatedAt ?? null,
    })))
  })

  // ===== Templates =====

  app.get('/api/templates', (_req, res) => {
    res.json(listTemplates())
  })

  // ===== Teams =====

  app.get('/api/teams', async (req, res) => {
    if (req.user?.id) {
      res.json(await getUserTeams(db, req.user.id))
    } else {
      res.json(await listTeams(db))
    }
  })

  app.post('/api/teams', async (req, res) => {
    const { name } = validate(CreateTeamSchema, req.body)

    // Paid-only team creation: first team is free (auto-created during onboarding).
    // Additional teams require an active paid subscription on any existing team.
    if (req.user?.id) {
      const existingTeams = await getUserTeams(db, req.user.id)
      if (existingTeams.length >= 1) {
        // Check if user has at least one team with an active paid subscription
        let hasPaidSub = false
        for (const t of existingTeams) {
          const sub = await getSubscription(db, t.id)
          if (sub && (sub.status === 'active' || sub.status === 'past_due') && sub.tier !== 'none') {
            hasPaidSub = true
            break
          }
        }
        if (!hasPaidSub) {
          return res.status(403).json({ error: 'An active paid subscription is required to create additional teams. Upgrade at Settings → Billing.' })
        }
      }
    }

    const team = await createTeam(db, name)
    // Auto-add creator as admin
    if (req.user?.id) {
      await addMember(db, team.id, req.user.id, req.user.email, 'admin')
    }

    // Claim orphaned data for pre-teams users (team_id = '' or NULL)
    const orphanTables = ['agents', 'tasks', 'chat_channels', 'chat_messages', 'approvals', 'sor_tables', 'activity_log']
    for (const table of orphanTables) {
      await db.run(`UPDATE ${table} SET team_id = $1 WHERE team_id = '' OR team_id IS NULL`, [team.id])
    }

    // Essential setup — must complete before response
    try {
      await createChannel(db, team.id, 'general', 'group')
    } catch (err) {
      console.error('[engine] Failed to create #general channel:', (err as Error).message)
    }

    // Grant starter credits synchronously (needed for onboarding)
    if (process.env.YOKEBOT_HOSTED_MODE === 'true' && req.user?.id) {
      const userTeams = await getUserTeams(db, req.user.id)
      if (userTeams.length === 1) {
        await addCredits(db, team.id, 1250, 'starter_credits', 'Welcome bonus: 1,250 starter credits')
        console.log(`[engine] Granted 1,250 starter credits to team ${team.id}`)
      }
    }

    await logActivity(db, 'team_created', null, `Team "${name}" created`, undefined, team.id)

    // Return immediately — heavy setup runs in background
    res.status(201).json(team)

    // ---- Background setup (non-blocking) ----
    const teamId = team.id
    const userId = req.user?.id
    const userEmail = req.user?.email

    // AdvisorBot deploy
    if (process.env.YOKEBOT_HOSTED_MODE === 'true') {
      ;(async () => {
        try {
          const advisorTemplate = getTemplate('advisor-bot')
          if (advisorTemplate) {
            const modelConfig = await resolveModelConfig(db, advisorTemplate.recommendedModel)
            if (modelConfig) {
              const advisorAgent = await createAgent(db, teamId, {
                name: advisorTemplate.name,
                department: advisorTemplate.department,
                iconName: advisorTemplate.icon,
                iconColor: advisorTemplate.iconColor,
                systemPrompt: advisorTemplate.systemPrompt,
                modelId: advisorTemplate.recommendedModel,
                modelConfig,
                heartbeatSeconds: 3600,
                templateId: 'advisor-bot',
              })
              await installSkill(db, advisorAgent.id, 'advisor-tools')
              await setAgentStatus(db, advisorAgent.id, 'running')
              scheduleAgent(db, { ...advisorAgent, status: 'running' })
              await logActivity(db, 'agent_created', advisorAgent.id, `AdvisorBot auto-deployed for new team`, undefined, teamId)
            }
          }
        } catch (err) {
          console.error('[engine] Background: Failed to auto-deploy AdvisorBot:', (err as Error).message)
        }
      })()

      // Welcome email + drip series
      if (userEmail && userId) {
        ;(async () => {
          try {
            const { sendWelcomeEmail, generateUnsubscribeUrl } = await import('./email.ts')
            const unsubUrl = generateUnsubscribeUrl(userId, teamId)
            await sendWelcomeEmail(userEmail, unsubUrl)
            console.log(`[engine] Welcome email sent to ${userEmail}`)
          } catch (err) {
            console.error('[engine] Background: Failed to send welcome email:', (err as Error).message)
          }
          try {
            const { enrollUser } = await import('./onboarding-drip.ts')
            await enrollUser(db, userId, teamId, userEmail)
          } catch (err) {
            console.error('[engine] Background: Failed to enroll in drip series:', (err as Error).message)
          }
        })()
      }
    }

    // Seed workflow templates
    ;(async () => {
      try {
        const { seedVideoProductionWorkflow } = await import('./video-workflow-seed.ts')
        await seedVideoProductionWorkflow(db, teamId)
      } catch (err) {
        console.error('[engine] Background: Failed to seed Video Production workflow:', (err as Error).message)
      }
      try {
        const { seedRapidImageAdsWorkflow } = await import('./ad-workflow-seed.ts')
        await seedRapidImageAdsWorkflow(db, teamId)
      } catch (err) {
        console.error('[engine] Background: Failed to seed Rapid Image Ads workflow:', (err as Error).message)
      }
      try {
        const { seedSalesCrmWorkflow } = await import('./crm-workflow-seed.ts')
        await seedSalesCrmWorkflow(db, teamId)
      } catch (err) {
        console.error('[engine] Background: Failed to seed Sales CRM workflow:', (err as Error).message)
      }
    })()
  })

  app.delete('/api/teams/:id', async (req, res) => {
    const team = await getTeam(db, req.params.id)
    if (!team) return res.status(404).json({ error: 'Team not found' })
    // Only admin members can delete a team
    const members = await getTeamMembers(db, req.params.id)
    const caller = members.find((m) => m.userId === req.user!.id)
    if (!caller || caller.role !== 'admin') return res.status(403).json({ error: 'Only team admins can delete a team' })
    // Unschedule all agents before deleting to prevent orphaned heartbeats
    const agentIds = await getTeamAgentIds(db, req.params.id)
    for (const agentId of agentIds) {
      unscheduleAgent(agentId)
    }
    await deleteTeam(db, req.params.id)
    res.status(204).end()
  })

  app.patch('/api/teams/:id', async (req, res) => {
    const team = await getTeam(db, req.params.id)
    if (!team) return res.status(404).json({ error: 'Team not found' })
    const members = await getTeamMembers(db, req.params.id)
    const caller = members.find((m) => m.userId === req.user!.id)
    if (!caller || caller.role !== 'admin') return res.status(403).json({ error: 'Only team admins can update team settings' })
    const { name } = validate(UpdateTeamSchema, req.body)
    await db.run('UPDATE teams SET name = $1 WHERE id = $2', [name, req.params.id])
    res.json({ success: true, name })
  })

  app.get('/api/teams/:id/members', async (req, res) => {
    const team = await getTeam(db, req.params.id)
    if (!team) return res.status(404).json({ error: 'Team not found' })
    // Must be a member of the team to view its members
    const members = await getTeamMembers(db, team.id)
    const caller = members.find((m) => m.userId === req.user!.id)
    if (!caller) return res.status(403).json({ error: 'Not a member of this team' })
    res.json(members)
  })

  app.post('/api/teams/:id/members', async (req, res) => {
    const team = await getTeam(db, req.params.id)
    if (!team) return res.status(404).json({ error: 'Team not found' })
    // Only admin members can add new members
    const members = await getTeamMembers(db, req.params.id)
    const caller = members.find((m) => m.userId === req.user!.id)
    if (!caller || caller.role !== 'admin') return res.status(403).json({ error: 'Only team admins can add members' })
    // Sanity cap at 25 team members
    if (members.length >= 25) {
      return res.status(403).json({ error: 'Maximum 25 team members. Contact support if you need more.' })
    }
    const { userId, email, role } = validate(AddMemberSchema, req.body)
    // Look up the real userId if the caller passed email as userId (invite flow)
    let resolvedUserId = userId
    if (userId === email) {
      const existingId = await findUserByEmail(db, email)
      if (existingId) {
        resolvedUserId = existingId
      }
      // If not found, keep email as userId — it's a pending invite
      // When the user signs up with this email, auth middleware + team creation will resolve it
    }
    const member = await addMember(db, team.id, resolvedUserId, email, role)
    await logActivity(db, 'member_added', null, `${email} added to team "${team.name}"`, undefined, team.id)

    // Send invite email (non-blocking, don't fail the request if email fails)
    import('./email.ts').then(({ sendInviteEmail }) =>
      sendInviteEmail(email, team.name, req.user!.email).catch(err =>
        console.error('[teams] Failed to send invite email:', err)
      )
    )

    res.status(201).json(member)
  })

  app.patch('/api/teams/:id/members/:userId', async (req, res) => {
    // Only admin members can change roles
    const members = await getTeamMembers(db, req.params.id)
    const caller = members.find((m) => m.userId === req.user!.id)
    if (!caller || caller.role !== 'admin') return res.status(403).json({ error: 'Only team admins can change roles' })
    const { role } = validate(UpdateRoleSchema, req.body)
    const member = await updateMemberRole(db, req.params.id, req.params.userId, role)
    if (!member) return res.status(404).json({ error: 'Member not found' })
    res.json(member)
  })

  app.delete('/api/teams/:id/members/:userId', async (req, res) => {
    // Admins can remove anyone; members can remove themselves
    const members = await getTeamMembers(db, req.params.id)
    const caller = members.find((m) => m.userId === req.user!.id)
    if (!caller) return res.status(403).json({ error: 'Not a member of this team' })
    const isRemovingSelf = req.params.userId === req.user!.id
    if (!isRemovingSelf && caller.role !== 'admin') return res.status(403).json({ error: 'Only admins can remove other members' })
    await removeMember(db, req.params.id, req.params.userId)
    res.status(204).end()
  })

  // ===== Team Profile (onboarding context) =====

  app.get('/api/teams/:id/profile', async (req, res) => {
    const team = await getTeam(db, req.params.id)
    if (!team) return res.status(404).json({ error: 'Team not found' })
    const members = await getTeamMembers(db, req.params.id)
    const caller = members.find((m) => m.userId === req.user!.id)
    if (!caller) return res.status(403).json({ error: 'Not a member of this team' })

    // Self-hosted users are always "onboarded" (no guided flow)
    if (process.env.YOKEBOT_HOSTED_MODE !== 'true') {
      return res.json({ teamId: req.params.id, companyName: null, companyUrl: null, industry: null, companySize: null, businessSummary: null, targetMarket: null, primaryGoal: null, onboardedAt: 'self-hosted' })
    }

    const profile = await db.queryOne<Record<string, unknown>>(
      'SELECT * FROM team_profiles WHERE team_id = $1', [req.params.id],
    )
    if (!profile) {
      return res.json({ teamId: req.params.id, companyName: null, companyUrl: null, industry: null, companySize: null, businessSummary: null, targetMarket: null, primaryGoal: null, onboardedAt: null, timezone: null, planModeDefault: true })
    }
    res.json({
      teamId: profile.team_id,
      companyName: profile.company_name,
      companyUrl: profile.company_url,
      industry: profile.industry,
      companySize: profile.company_size,
      businessSummary: profile.business_summary,
      targetMarket: profile.target_market,
      primaryGoal: profile.primary_goal,
      onboardedAt: profile.onboarded_at,
      timezone: profile.timezone ?? null,
      planModeDefault: profile.plan_mode_default == null ? true : profile.plan_mode_default === true || profile.plan_mode_default === 1,
    })
  })

  app.put('/api/teams/:id/profile', async (req, res) => {
    const team = await getTeam(db, req.params.id)
    if (!team) return res.status(404).json({ error: 'Team not found' })
    const members = await getTeamMembers(db, req.params.id)
    const caller = members.find((m) => m.userId === req.user!.id)
    if (!caller) return res.status(403).json({ error: 'Not a member of this team' })

    const body = req.body as Record<string, unknown>
    // Coerce undefined to null — Postgres driver rejects undefined values
    const companyName = (body.companyName as string) ?? null
    const companyUrl = (body.companyUrl as string) ?? null
    const industry = (body.industry as string) ?? null
    const companySize = (body.companySize as string) ?? null
    const businessSummary = (body.businessSummary as string) ?? null
    const targetMarket = (body.targetMarket as string) ?? null
    const primaryGoal = (body.primaryGoal as string) ?? null
    const onboardedAt = body.onboardedAt ?? null
    const additionalContext = body.additionalContext ?? null
    const timezone = body.timezone ?? null
    const planModeDefault = body.planModeDefault !== undefined ? (body.planModeDefault ? 1 : 0) : null

    const existing = await db.queryOne<Record<string, unknown>>(
      'SELECT * FROM team_profiles WHERE team_id = $1', [req.params.id],
    )

    if (existing) {
      await db.run(
        `UPDATE team_profiles SET
          company_name = COALESCE($1, company_name),
          company_url = COALESCE($2, company_url),
          industry = COALESCE($3, industry),
          company_size = COALESCE($4, company_size),
          business_summary = COALESCE($5, business_summary),
          target_market = COALESCE($6, target_market),
          primary_goal = COALESCE($7, primary_goal),
          onboarded_at = COALESCE($8, onboarded_at),
          additional_context = COALESCE($9, additional_context),
          timezone = COALESCE($10, timezone),
          plan_mode_default = COALESCE($11, plan_mode_default),
          updated_at = ${db.now()}
        WHERE team_id = $12`,
        [companyName, companyUrl, industry, companySize, businessSummary, targetMarket, primaryGoal, onboardedAt, additionalContext, timezone, planModeDefault, req.params.id],
      )
    } else {
      await db.run(
        `INSERT INTO team_profiles (team_id, company_name, company_url, industry, company_size, business_summary, target_market, primary_goal, onboarded_at, additional_context, timezone, plan_mode_default)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [req.params.id, companyName, companyUrl, industry, companySize, businessSummary, targetMarket, primaryGoal, onboardedAt, additionalContext, timezone, planModeDefault ?? 1],
      )
    }
    res.json({ success: true })
  })

  // ===== Team Logo (upload / serve / remove) =====

  app.post('/api/teams/:id/logo', uploadLimiter, express.json({ limit: '3mb' }), async (req: Request, res: Response) => {
    const teamId = req.params.id as string
    const team = await getTeam(db, teamId)
    if (!team) return res.status(404).json({ error: 'Team not found' })
    if (!requireRole(req, res, 'admin')) return

    const { contentBase64, contentType } = req.body as { contentBase64?: string; contentType?: string }
    if (!contentBase64 || !contentType) return res.status(400).json({ error: 'contentBase64 and contentType are required' })
    if (!['image/png', 'image/jpeg'].includes(contentType)) return res.status(400).json({ error: 'Only PNG and JPEG images are supported' })

    try {
      const storagePath = './cloud/storage.js'
      const { uploadTeamLogo } = await import(/* @vite-ignore */ storagePath)
      await uploadTeamLogo(contentBase64, teamId, contentType)
      res.json({ success: true })
    } catch (err) {
      console.error('[team-logo] Upload error:', err)
      res.status(500).json({ error: 'Failed to upload logo' })
    }
  })

  app.get('/api/teams/:id/logo', async (req, res) => {
    const teamId = req.params.id as string
    try {
      const storagePath = './cloud/storage.js'
      const { getTeamLogo } = await import(/* @vite-ignore */ storagePath)
      const result = await getTeamLogo(teamId)
      if (!result) return res.status(404).json({ error: 'No logo found' })
      res.setHeader('Content-Type', result.contentType)
      res.setHeader('Content-Length', result.contentLength)
      res.setHeader('Cache-Control', 'public, max-age=3600')
      result.stream.pipe(res)
    } catch {
      res.status(404).json({ error: 'No logo found' })
    }
  })

  app.delete('/api/teams/:id/logo', async (req: Request, res: Response) => {
    const teamId = req.params.id as string
    const team = await getTeam(db, teamId)
    if (!team) return res.status(404).json({ error: 'Team not found' })
    if (!requireRole(req, res, 'admin')) return
    // Logo will just 404 on GET after this — no need to delete from R2
    res.json({ success: true })
  })

  // ===== Website Scan (Tavily + LLM, hosted only, platform cost) =====

  app.post('/api/teams/:id/scan-website', async (req, res) => {
    if (process.env.YOKEBOT_HOSTED_MODE !== 'true') {
      return res.status(403).json({ error: 'Website scanning is only available on YokeBot Cloud' })
    }

    const team = await getTeam(db, req.params.id)
    if (!team) return res.status(404).json({ error: 'Team not found' })
    const members = await getTeamMembers(db, req.params.id)
    const caller = members.find((m) => m.userId === req.user!.id)
    if (!caller) return res.status(403).json({ error: 'Not a member of this team' })

    const { url } = req.body as { url?: string }
    if (!url) return res.status(400).json({ error: 'URL is required' })

    const tavilyKey = process.env.TAVILY_API_KEY
    if (!tavilyKey) {
      console.error('[scan] TAVILY_API_KEY not configured')
      return res.json({ companyName: null, industry: null, businessSummary: null, targetMarket: null })
    }

    try {
      // Step 1: Extract content via Tavily
      const tavilyRes = await fetch('https://api.tavily.com/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tavilyKey}` },
        body: JSON.stringify({ urls: [url], extract_depth: 'basic', format: 'text' }),
      })
      if (!tavilyRes.ok) {
        console.error(`[scan] Tavily error: ${tavilyRes.status}`)
        return res.json({ companyName: null, industry: null, businessSummary: null, targetMarket: null })
      }
      const tavilyData = await tavilyRes.json() as { results?: Array<{ raw_content?: string }> }
      const pageContent = tavilyData.results?.[0]?.raw_content
      if (!pageContent) {
        return res.json({ companyName: null, industry: null, businessSummary: null, targetMarket: null })
      }

      // Truncate to ~6K chars to keep LLM cost low
      const truncated = pageContent.length > 6000 ? pageContent.slice(0, 6000) : pageContent

      // Step 2: LLM analysis via DeepSeek V3.2
      const modelConfig = await resolveModelConfig(db, 'deepseek-v3.2')
      if (!modelConfig) {
        console.error('[scan] Could not resolve deepseek-v3.2 model config')
        return res.json({ companyName: null, industry: null, businessSummary: null, targetMarket: null })
      }

      const llmMessages = [
        {
          role: 'system' as const,
          content: `You are a business analyst. Extract structured business information from website content. Respond ONLY with valid JSON, no other text.`,
        },
        {
          role: 'user' as const,
          content: `Analyze this website content and extract the following fields. If a field cannot be determined, use null.

Return JSON with these fields (in this exact order):
{
  "companyName": "The company/brand name",
  "industry": "One of: Technology, E-commerce, SaaS, Agency, Healthcare, Finance, Education, Real Estate, Hospitality, Manufacturing, Professional Services, Other",
  "problemSolved": "What problem does this company solve? (1-2 sentences)",
  "solution": "How does the company solve it? Their core product/service (1-2 sentences)",
  "targetMarket": "Who is their ideal customer? Demographics, business type, etc. (1-2 sentences)",
  "geographicFocus": "Where do they operate? Local, regional, national, global? (brief)",
  "productsServices": "Key products or services offered (comma-separated list)",
  "pricePoints": "Pricing info if available — free tier, starting price, enterprise, etc. (brief, or null)",
  "uniqueDifferentiators": "What makes them different from competitors? (1-2 sentences)",
  "buyingMotivations": "Why would customers choose them? Key value props (1-2 sentences)",
  "primaryGoal": "The #1 thing this business probably wants to accomplish, stated simply and plainly like a human would say it (e.g. 'Grow the user base', 'Get more customers', 'Increase monthly revenue'). No corporate jargon or marketing speak — just the obvious core goal.",
  "secondaryGoals": "2 additional simple goals, comma-separated, written the way the business owner would say them (e.g. 'Grow the Discord community, Sell more premium subscriptions'). Keep it plain and specific to what this business actually does."
}

Website content:
${truncated}`,
        },
      ]

      const completion = await chatCompletion(modelConfig, llmMessages)
      const raw = (completion.content ?? '').trim()

      // Parse JSON from LLM response (handle markdown code fences)
      const jsonStr = raw.startsWith('{') ? raw : (raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
      const parsed = JSON.parse(jsonStr) as Record<string, string | null>

      // Best-effort: try to fetch the site's favicon and set as team logo
      void (async () => {
        try {
          const parsedUrl = new URL(url)
          const origin = parsedUrl.origin

          // Try common favicon locations (prefer larger icons)
          const candidates = [
            `${origin}/apple-touch-icon.png`,
            `${origin}/apple-touch-icon-precomposed.png`,
            `${origin}/favicon-192x192.png`,
            `${origin}/android-chrome-192x192.png`,
            `${origin}/favicon-96x96.png`,
            `${origin}/favicon-32x32.png`,
            `${origin}/favicon.png`,
            `${origin}/favicon.ico`,
          ]

          for (const faviconUrl of candidates) {
            try {
              const faviconRes = await fetch(faviconUrl, { redirect: 'follow' })
              if (!faviconRes.ok) continue
              const ct = faviconRes.headers.get('content-type') ?? ''
              if (!ct.includes('image/png') && !ct.includes('image/jpeg')) continue
              const buf = Buffer.from(await faviconRes.arrayBuffer())
              // Skip tiny favicons (< 2KB is likely 16x16 or corrupt)
              if (buf.length < 2048) continue

              const storagePath = './cloud/storage.js'
              const { uploadTeamLogo } = await import(/* @vite-ignore */ storagePath)
              await uploadTeamLogo(buf.toString('base64'), req.params.id, ct.includes('png') ? 'image/png' : 'image/jpeg')
              console.log(`[scan] Auto-set team logo from favicon: ${faviconUrl} (${buf.length} bytes)`)
              break
            } catch { continue }
          }
        } catch (e) {
          console.log('[scan] Favicon extraction skipped:', (e as Error).message)
        }
      })()

      res.json({
        companyName: parsed.companyName ?? null,
        industry: parsed.industry ?? null,
        problemSolved: parsed.problemSolved ?? null,
        solution: parsed.solution ?? null,
        targetMarket: parsed.targetMarket ?? null,
        geographicFocus: parsed.geographicFocus ?? null,
        productsServices: parsed.productsServices ?? null,
        pricePoints: parsed.pricePoints ?? null,
        uniqueDifferentiators: parsed.uniqueDifferentiators ?? null,
        buyingMotivations: parsed.buyingMotivations ?? null,
        primaryGoal: parsed.primaryGoal ?? null,
        secondaryGoals: parsed.secondaryGoals ?? null,
      })
    } catch (err) {
      console.error('[scan] Website scan error:', (err as Error).message)
      res.json({ companyName: null, industry: null, businessSummary: null, targetMarket: null })
    }
  })

  // ===== AdvisorBot Narration (onboarding voice guidance) =====

  const ADVISOR_NARRATION_SCRIPTS: Record<number, string> = {
    1: `Hey {firstName}! Welcome to YokeBot. I'm AdvisorBot, your strategic advisor and personal guide to building your AI workforce. Tell me a bit about your business and your top goal, and I'll set up the perfect team for you. Fill in your details below and hit Continue.`,
    2: `Nice work, {firstName}! While you check out what YokeBot can do, I'm setting up your team of AI agents in the background. Each one is specialized for a different job. You'll manage them from the Shared Workspace, where you can assign tasks, review their work, and chat with any agent just like messaging a coworker. Click through these slides and your team will be ready when you're done.`,
    3: `And just like that, your team is live, {firstName}! Your AI agents are deployed and ready to work. You can find them in the Agents tab, chat with them anytime, or assign them tasks from the workspace. If you ever need help, I'm always here. Welcome to the future of work. Let's make some magic happen!`,
  }

  const ADVISOR_VOICE_ID = 'a167e0f3-df7e-4d52-a9c3-f949145efdab' // Blake - Helpful Agent

  app.post('/api/teams/:id/advisor-narration', async (req, res) => {
    if (process.env.YOKEBOT_HOSTED_MODE !== 'true') {
      return res.status(403).json({ error: 'Only available in hosted mode' })
    }
    const team = await getTeam(db, req.params.id)
    if (!team) return res.status(404).json({ error: 'Team not found' })
    const members = await getTeamMembers(db, req.params.id)
    const caller = members.find((m) => m.userId === req.user!.id)
    if (!caller) return res.status(403).json({ error: 'Not a member of this team' })

    const { step, firstName } = req.body as { step: number; firstName: string }
    if (!step || step < 1 || step > 3 || !firstName) {
      return res.status(400).json({ error: 'step (1-3) and firstName are required' })
    }

    const template = ADVISOR_NARRATION_SCRIPTS[step]
    const text = template.replace(/\{firstName\}/g, firstName)

    // Persist narration as a chat message in AdvisorBot's DM thread (searchable history)
    const persistNarration = async () => {
      try {
        const agents = await listAgents(db, req.params.id)
        const advisor = agents.find((a) => a.templateId === 'advisor-bot')
        if (advisor) {
          const dmChannel = await getDmChannel(db, advisor.id, req.params.id)
          await sendMessage(db, dmChannel.id, 'agent', advisor.id, text, undefined, req.params.id)
        }
      } catch (e) {
        console.error('[narration] Failed to persist chat message:', (e as Error).message)
      }
    }

    try {
      const tts = await generateSpeech({
        voiceId: ADVISOR_VOICE_ID,
        text,
        speed: 'normal',
        emotion: ['positivity:high', 'curiosity'],
      })
      // Fire-and-forget — don't block the response on DB write
      persistNarration()
      res.json({
        text,
        audioBase64: tts.audioBase64,
        audioDurationMs: tts.durationMs,
      })
    } catch (err) {
      console.error('[narration] TTS error:', (err as Error).message)
      persistNarration()
      // Return text-only fallback so onboarding isn't blocked
      res.json({ text, audioBase64: '', audioDurationMs: 0 })
    }
  })

  // ===== Setup AdvisorBot (idempotent, hosted only) =====

  app.post('/api/teams/:id/setup-advisor', async (req, res) => {
    if (process.env.YOKEBOT_HOSTED_MODE !== 'true') {
      return res.status(403).json({ error: 'AdvisorBot is only available on YokeBot Cloud.' })
    }
    const team = await getTeam(db, req.params.id)
    if (!team) return res.status(404).json({ error: 'Team not found' })
    const members = await getTeamMembers(db, req.params.id)
    const caller = members.find((m) => m.userId === req.user!.id)
    if (!caller) return res.status(403).json({ error: 'Not a member of this team' })

    // Check if AdvisorBot already deployed
    const agents = await listAgents(db, req.params.id)
    const existing = agents.find((a) => a.templateId === 'advisor-bot')
    if (existing) return res.json({ agentId: existing.id, alreadyExists: true })

    const template = getTemplate('advisor-bot')
    if (!template) return res.status(500).json({ error: 'AdvisorBot template not found' })

    const modelConfig = await resolveModelConfig(db, template.recommendedModel)
    if (!modelConfig) return res.status(500).json({ error: 'Could not resolve AdvisorBot model' })

    const agent = await createAgent(db, req.params.id, {
      name: template.name,
      department: template.department,
      iconName: template.icon,
      iconColor: template.iconColor,
      systemPrompt: template.systemPrompt,
      modelId: template.recommendedModel,
      modelConfig,
      heartbeatSeconds: 3600,
      templateId: 'advisor-bot',
    })
    await installSkill(db, agent.id, 'advisor-tools')
    await setAgentStatus(db, agent.id, 'running')
    scheduleAgent(db, { ...agent, status: 'running' })
    await logActivity(db, 'agent_created', agent.id, `AdvisorBot deployed via setup`, undefined, req.params.id)

    res.status(201).json({ agentId: agent.id, alreadyExists: false })
  })

  // ===== Auto-deploy agents based on industry + goal (onboarding) =====

  app.post('/api/teams/:id/auto-deploy-agents', async (req, res) => {
    if (process.env.YOKEBOT_HOSTED_MODE !== 'true') {
      return res.status(403).json({ error: 'Only available in hosted mode' })
    }
    const team = await getTeam(db, req.params.id)
    if (!team) return res.status(404).json({ error: 'Team not found' })
    const members = await getTeamMembers(db, req.params.id)
    const caller = members.find((m) => m.userId === req.user!.id)
    if (!caller) return res.status(403).json({ error: 'Not a member of this team' })

    const { industry, goal } = req.body as { industry?: string; goal?: string }

    // Score templates against industry + goal keywords (no LLM call)
    const allTemplates = listTemplates({ includeHostedOnly: true })
    const candidates = allTemplates.filter(t => t.id !== 'advisor-bot' && t.id !== 'team-lead' && !t.isFree)
    const query = [industry ?? '', goal ?? ''].join(' ').toLowerCase()
    const words = query.split(/\s+/).filter(w => w.length > 2)

    const scored = candidates.map(t => {
      const haystack = [t.name, t.title, t.department, t.description, ...(t.commonTasks ?? [])].join(' ').toLowerCase()
      let score = 0
      for (const w of words) {
        if (haystack.includes(w)) score += 1
      }
      // Boost by department relevance
      const dept = (t.department ?? '').toLowerCase()
      if (query.includes('sales') && dept === 'sales') score += 3
      if (query.includes('marketing') && dept === 'marketing') score += 3
      if (query.includes('content') && (dept === 'marketing' || dept === 'content')) score += 3
      if (query.includes('support') && dept === 'support') score += 3
      if (query.includes('finance') && dept === 'finance') score += 3
      if (query.includes('hr') && dept === 'hr') score += 3
      if (query.includes('legal') && dept === 'legal') score += 3
      if (query.includes('engineering') && dept === 'engineering') score += 3
      if (query.includes('seo') && t.id === 'seo-bot') score += 5
      if (query.includes('social') && t.id === 'social-bot') score += 5
      if (query.includes('email') && t.id === 'email-bot') score += 5
      if (query.includes('lead') && t.id === 'prospector-bot') score += 5
      if (query.includes('prospect') && t.id === 'prospector-bot') score += 5
      if (query.includes('reputation') && t.id === 'reputation-bot') score += 5
      if (query.includes('build') && t.id === 'builder-bot') score += 5
      if (query.includes('app') && t.id === 'builder-bot') score += 5
      return { template: t, score }
    })

    scored.sort((a, b) => b.score - a.score)

    // Pick top 3 (ensure variety — max 1 per department)
    const picked: typeof candidates = []
    const usedDepts = new Set<string>()
    for (const { template } of scored) {
      if (picked.length >= 3) break
      const dept = template.department ?? 'other'
      if (usedDepts.has(dept)) continue
      usedDepts.add(dept)
      picked.push(template)
    }
    // If we don't have 3 yet (e.g. generic query), fill with popular defaults
    const fallbacks = ['content-bot', 'prospector-bot', 'reputation-bot', 'social-bot']
    for (const fbId of fallbacks) {
      if (picked.length >= 3) break
      if (picked.some(p => p.id === fbId)) continue
      const fb = allTemplates.find(t => t.id === fbId)
      if (fb) picked.push(fb)
    }

    // Deploy each agent (skip if already exists)
    const existing = await listAgents(db, req.params.id)
    const deployed: Array<{ id: string; name: string; templateId: string; icon: string; iconColor: string; department: string }> = []

    for (const tmpl of picked) {
      if (existing.some(a => a.templateId === tmpl.id)) {
        const ex = existing.find(a => a.templateId === tmpl.id)!
        deployed.push({ id: ex.id, name: ex.name, templateId: tmpl.id, icon: tmpl.icon, iconColor: tmpl.iconColor, department: tmpl.department })
        continue
      }
      try {
        const mc = await resolveModelConfig(db, tmpl.recommendedModel)
        if (!mc) continue
        const agent = await createAgent(db, req.params.id, {
          name: tmpl.name,
          department: tmpl.department,
          iconName: tmpl.icon,
          iconColor: tmpl.iconColor,
          systemPrompt: tmpl.systemPrompt,
          modelId: tmpl.recommendedModel,
          modelConfig: mc,
          heartbeatSeconds: 3600,
          templateId: tmpl.id,
        })
        // Install default skills
        for (const skillName of tmpl.defaultSkills) {
          await installSkill(db, agent.id, skillName).catch(() => {})
        }
        await setAgentStatus(db, agent.id, 'running')
        scheduleAgent(db, { ...agent, status: 'running' })
        await logActivity(db, 'agent_created', agent.id, `${tmpl.name} auto-deployed during onboarding`, undefined, req.params.id)
        deployed.push({ id: agent.id, name: tmpl.name, templateId: tmpl.id, icon: tmpl.icon, iconColor: tmpl.iconColor, department: tmpl.department })
      } catch (err) {
        console.error(`[onboarding] Failed to deploy ${tmpl.name}:`, (err as Error).message)
      }
    }

    res.json({ agents: deployed })
  })

  // ===== Meetings (hosted-only — real-time meet-and-greet) =====

  app.post('/api/teams/:id/meetings/meet-and-greet', async (req, res) => {
    if (process.env.YOKEBOT_HOSTED_MODE !== 'true') {
      return res.status(403).json({ error: 'Meetings are only available in hosted mode' })
    }
    if (!requireRole(req, res, 'admin')) return

    try {
      const cloudPath = './cloud/orchestrator.js'
      const { startMeetAndGreet } = await import(/* @vite-ignore */ cloudPath)
      const teamId = req.user!.activeTeamId!

      // ── Meeting frequency limits (per tier) ──
      if (req.subscription) {
        const tier = req.subscription.tier
        // Starter Crew ($29): 1/week, Growth Crew ($59) & Power Crew ($149): 1/day
        const { windowHours, limitLabel, upgradeCta } = tier === 'team'
          ? { windowHours: 168, limitLabel: '1 meeting per week', upgradeCta: 'Upgrade to Growth Crew for daily meetings.' }
          : { windowHours: 24, limitLabel: '1 meeting per day', upgradeCta: '' }

        const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString()
        const recent = await db.queryOne<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt FROM team_meetings WHERE team_id = $1 AND created_at > $2`,
          [teamId, since],
        )
        if (recent && parseInt(recent.cnt, 10) >= 1) {
          const msg = `Your ${req.subscription.tier === 'team' ? 'Starter Crew' : req.subscription.tier === 'business' ? 'Growth Crew' : 'Power Crew'} plan includes ${limitLabel}.${upgradeCta ? ' ' + upgradeCta : ''}`
          return res.status(429).json({ error: msg })
        }
      }

      // Find all deployed agents for this team
      const agents = await listAgents(db, teamId)
      if (agents.length === 0) {
        return res.status(400).json({ error: 'No agents deployed on this team' })
      }

      // Find AdvisorBot
      const advisor = agents.find(a => a.templateId === 'advisor-bot')
      if (!advisor) {
        return res.status(400).json({ error: 'AdvisorBot not found — deploy AdvisorBot first' })
      }

      // Get company name from team_profiles
      const profile = await db.queryOne<Record<string, unknown>>(
        'SELECT company_name FROM team_profiles WHERE team_id = $1', [teamId],
      )

      const { meetingId } = await startMeetAndGreet(db, {
        teamId,
        type: 'meet_and_greet',
        title: 'Meet & Greet',
        agentIds: agents.map(a => a.id),
        advisorAgentId: advisor.id,
        companyName: (profile?.company_name as string) ?? undefined,
      })

      res.json({ meetingId })
    } catch (err) {
      console.error('[meetings] Failed to start meet-and-greet:', err)
      res.status(500).json({ error: 'Failed to start meeting' })
    }
  })

  app.get('/api/teams/:id/meetings/:meetingId/stream', async (req, res) => {
    if (process.env.YOKEBOT_HOSTED_MODE !== 'true') {
      return res.status(403).json({ error: 'Meetings are only available in hosted mode' })
    }
    // Verify the authenticated user belongs to this team
    if (req.user?.activeTeamId !== req.params.id) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    try {
      const cloudPath2 = './cloud/orchestrator.js'
      const { addSseClient, getMeeting } = await import(/* @vite-ignore */ cloudPath2)

      // Verify meeting exists and belongs to this team
      const meeting = getMeeting(req.params.meetingId)
      if (!meeting || meeting.config.teamId !== req.params.id) {
        return res.status(404).json({ error: 'Meeting not found' })
      }

      // Set up SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      })
      res.flushHeaders()

      addSseClient(req.params.meetingId, res)

      // Keepalive ping every 15s to prevent proxy timeout
      const keepalive = setInterval(() => {
        try { res.write(':ping\n\n') } catch { clearInterval(keepalive) }
      }, 15_000)

      req.on('close', () => clearInterval(keepalive))
    } catch (err) {
      console.error('[meetings] SSE stream error:', err)
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to connect to meeting stream' })
      }
    }
  })

  app.post('/api/teams/:id/meetings/:meetingId/message', async (req, res) => {
    if (process.env.YOKEBOT_HOSTED_MODE !== 'true') {
      return res.status(403).json({ error: 'Meetings are only available in hosted mode' })
    }
    if (req.user?.activeTeamId !== req.params.id) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const { content } = req.body as { content?: string }
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Message content is required' })
    }

    try {
      const cloudPath3 = './cloud/orchestrator.js'
      const { injectHumanMessage, getMeeting } = await import(/* @vite-ignore */ cloudPath3)

      // Verify meeting belongs to this team
      const meeting = getMeeting(req.params.meetingId)
      if (!meeting || meeting.config.teamId !== req.params.id) {
        return res.status(404).json({ error: 'Meeting not found' })
      }

      const queued = injectHumanMessage(req.params.meetingId, content.trim())
      if (!queued) {
        return res.status(400).json({ error: 'Meeting is not active' })
      }

      res.json({ queued: true })
    } catch (err) {
      console.error('[meetings] Message injection error:', err)
      res.status(500).json({ error: 'Failed to send message' })
    }
  })

  // Voice message (push-to-talk STT → inject as human message)
  app.post('/api/teams/:id/meetings/:meetingId/voice', async (req, res) => {
    if (process.env.YOKEBOT_HOSTED_MODE !== 'true') {
      return res.status(403).json({ error: 'Meetings are only available in hosted mode' })
    }
    if (req.user?.activeTeamId !== req.params.id) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    try {
      const cloudPath4 = './cloud/orchestrator.js'
      const { injectHumanMessage, getMeeting } = await import(/* @vite-ignore */ cloudPath4)

      const meeting = getMeeting(req.params.meetingId)
      if (!meeting || meeting.config.teamId !== req.params.id) {
        return res.status(404).json({ error: 'Meeting not found' })
      }

      // Read raw audio from request body
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(Buffer.from(chunk))
      const audioBuffer = Buffer.concat(chunks)
      if (audioBuffer.length === 0) {
        return res.status(400).json({ error: 'No audio data received' })
      }

      // Transcribe via DeepInfra Voxtral
      const apiKey = process.env.DEEPINFRA_API_KEY
      if (!apiKey) {
        return res.status(500).json({ error: 'STT provider not configured' })
      }

      const formData = new FormData()
      formData.append('file', new Blob([audioBuffer], { type: 'audio/webm' }), 'voice.webm')
      formData.append('model', 'mistralai/Voxtral-Mini-4B-Realtime-2602')
      formData.append('response_format', 'json')

      const sttRes = await fetch('https://api.deepinfra.com/v1/openai/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: formData,
      })

      if (!sttRes.ok) {
        const errText = await sttRes.text()
        console.error('[meetings] STT error:', sttRes.status, errText)
        return res.status(502).json({ error: 'Transcription failed' })
      }

      const sttData = await sttRes.json() as { text?: string }
      const text = sttData.text?.trim()
      if (!text) {
        return res.json({ text: '', queued: false })
      }

      const queued = injectHumanMessage(req.params.meetingId, text)
      res.json({ text, queued })
    } catch (err) {
      console.error('[meetings] Voice transcription error:', err)
      res.status(500).json({ error: 'Failed to process voice message' })
    }
  })

  // Raise hand (human wants to interrupt agent queue)
  app.post('/api/teams/:id/meetings/:meetingId/raise-hand', async (req, res) => {
    if (process.env.YOKEBOT_HOSTED_MODE !== 'true') {
      return res.status(403).json({ error: 'Meetings are only available in hosted mode' })
    }
    if (req.user?.activeTeamId !== req.params.id) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    try {
      const cloudPath5 = './cloud/orchestrator.js'
      const { raiseHand, getMeeting } = await import(/* @vite-ignore */ cloudPath5)

      const meeting = getMeeting(req.params.meetingId)
      if (!meeting || meeting.config.teamId !== req.params.id) {
        return res.status(404).json({ error: 'Meeting not found' })
      }

      const ok = raiseHand(req.params.meetingId)
      res.json({ raised: ok })
    } catch (err) {
      console.error('[meetings] Raise hand error:', err)
      res.status(500).json({ error: 'Failed to raise hand' })
    }
  })

  // List meetings for a team
  app.get('/api/teams/:id/meetings', async (req, res) => {
    try {
      const teamId = req.user!.activeTeamId!
      const rows = await db.query<Record<string, unknown>>(
        `SELECT id, team_id, channel_id, type, title, status, summary, action_items, started_at, ended_at, created_at
         FROM team_meetings WHERE team_id = $1 ORDER BY created_at DESC`, [teamId],
      )
      const meetings = rows.map(r => ({
        id: r.id as string,
        teamId: r.team_id as string,
        channelId: r.channel_id as string,
        type: r.type as string,
        title: r.title as string,
        status: r.status as string,
        summary: (r.summary as string) ?? null,
        actionItems: r.action_items ? (typeof r.action_items === 'string' ? JSON.parse(r.action_items as string) : r.action_items) : null,
        startedAt: (r.started_at as string) ?? null,
        endedAt: (r.ended_at as string) ?? null,
        createdAt: r.created_at as string,
      }))
      res.json(meetings)
    } catch (err) {
      console.error('[meetings] List error:', err)
      res.status(500).json({ error: 'Failed to list meetings' })
    }
  })

  // Get meeting detail (metadata + participant agents)
  app.get('/api/teams/:id/meetings/:meetingId', async (req, res) => {
    try {
      const teamId = req.user!.activeTeamId!
      const row = await db.queryOne<Record<string, unknown>>(
        `SELECT id, team_id, channel_id, type, title, status, summary, action_items, started_at, ended_at, created_at
         FROM team_meetings WHERE id = $1 AND team_id = $2`, [req.params.meetingId, teamId],
      )
      if (!row) return res.status(404).json({ error: 'Meeting not found' })

      // Get participant agents from meeting messages
      const agentRows = await db.query<Record<string, unknown>>(
        `SELECT DISTINCT m.sender_id, a.name, a.icon_name, a.icon_color, a.department, a.template_id
         FROM chat_messages m
         LEFT JOIN agents a ON a.id = m.sender_id
         WHERE m.channel_id = $1 AND m.sender_type = 'agent'`, [row.channel_id as string],
      )

      res.json({
        id: row.id as string,
        teamId: row.team_id as string,
        channelId: row.channel_id as string,
        type: row.type as string,
        title: row.title as string,
        status: row.status as string,
        summary: (row.summary as string) ?? null,
        actionItems: row.action_items ? (typeof row.action_items === 'string' ? JSON.parse(row.action_items as string) : row.action_items) : null,
        startedAt: (row.started_at as string) ?? null,
        endedAt: (row.ended_at as string) ?? null,
        createdAt: row.created_at as string,
        agents: agentRows.map(a => ({
          id: a.sender_id as string,
          name: (a.name as string) ?? 'Unknown Agent',
          iconName: (a.icon_name as string) ?? 'smart_toy',
          iconColor: (a.icon_color as string) ?? '#0F4D26',
        })),
      })
    } catch (err) {
      console.error('[meetings] Detail error:', err)
      res.status(500).json({ error: 'Failed to get meeting' })
    }
  })

  // Serve meeting audio from R2 (proxied through engine for auth)
  app.get('/api/audio/*key', async (req, res) => {
    if (process.env.YOKEBOT_HOSTED_MODE !== 'true') {
      return res.status(403).json({ error: 'Not available' })
    }
    try {
      const storagePath = './cloud/storage.js'
      const { getMeetingAudio } = await import(/* @vite-ignore */ storagePath)
      const keyParam = (req.params as Record<string, unknown>).key
      const audioKey = Array.isArray(keyParam) ? keyParam.join('/') : String(keyParam)

      // Audio keys are structured as meetings/{teamId}/... — verify team access
      const keyParts = audioKey.split('/')
      if (keyParts[0] === 'meetings' && keyParts[1]) {
        const audioTeamId = keyParts[1]
        const membership = await db.queryOne<{ team_id: string }>(
          'SELECT team_id FROM team_members WHERE team_id = $1 AND user_id = $2',
          [audioTeamId, req.user!.id],
        )
        if (!membership) return res.status(403).json({ error: 'Access denied' })
      }

      const result = await getMeetingAudio(audioKey)
      if (!result) return res.status(404).json({ error: 'Audio not found' })

      res.setHeader('Content-Type', result.contentType)
      if (result.contentLength) res.setHeader('Content-Length', result.contentLength)
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      result.stream.pipe(res)
    } catch (err) {
      console.error('[audio] Serve error:', err)
      res.status(500).json({ error: 'Failed to serve audio' })
    }
  })

  // ===== Contact Form (public, rate limited) =====

  const contactLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 3, keyGenerator: (req) => ipKeyGenerator(req.ip ?? '0.0.0.0') })

  app.post('/api/contact', contactLimiter, async (req: Request, res: Response) => {
    try {
      const { name, email, message } = req.body as { name?: string; email?: string; message?: string }
      if (!name?.trim() || !email?.trim() || !message?.trim()) {
        res.status(400).json({ error: 'Name, email, and message are required' })
        return
      }
      // Basic email format check
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: 'Invalid email address' })
        return
      }

      const id = (await import('crypto')).randomUUID()
      await db.run(
        'INSERT INTO contact_submissions (id, name, email, message) VALUES ($1, $2, $3, $4)',
        [id, name.trim(), email.trim(), message.trim()],
      )

      // Send notification email
      try {
        const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        const { sendEmail } = await import('./email.ts')
        await sendEmail({
          to: 'james@yokebot.com',
          subject: `[YokeBot Contact] ${name.trim()}`,
          html: `<p><strong>From:</strong> ${esc(name.trim())} &lt;${esc(email.trim())}&gt;</p><p><strong>Message:</strong></p><p>${esc(message.trim()).replace(/\n/g, '<br>')}</p>`,
          replyTo: email.trim(),
        })
      } catch (emailErr) {
        console.error('[contact] Failed to send notification email:', emailErr instanceof Error ? emailErr.message : emailErr)
      }

      res.json({ ok: true })
    } catch (err) {
      console.error('[contact] Error:', err)
      res.status(500).json({ error: 'Failed to submit' })
    }
  })

  // ===== Unsubscribe (public — works from email without login) =====

  app.get('/api/unsubscribe', async (req: Request, res: Response) => {
    const token = req.query.token as string | undefined
    if (!token) {
      res.status(400).send('Missing token')
      return
    }

    try {
      // Token format: base64url(userId:teamId:hmac)
      const decoded = Buffer.from(token, 'base64url').toString()
      const parts = decoded.split(':')
      if (parts.length < 2) {
        res.status(400).send('Invalid token')
        return
      }
      const [userId, teamId, tokenHmac] = parts

      // Verify HMAC if a signing secret is available (new tokens are signed)
      const hmacSecret = process.env.YOKEBOT_ENCRYPTION_KEY || process.env.SUPABASE_JWT_SECRET
      if (hmacSecret && tokenHmac) {
        const crypto = await import('node:crypto')
        const expectedHmac = crypto.createHmac('sha256', hmacSecret).update(`${userId}:${teamId}`).digest('hex').slice(0, 16)
        if (tokenHmac !== expectedHmac) {
          res.status(400).send('Invalid token')
          return
        }
      }

      if (!userId || !teamId) {
        res.status(400).send('Invalid token')
        return
      }

      await setPreference(db, userId, teamId, { emailEnabled: false })
      console.log(`[engine] User ${userId} unsubscribed from email notifications for team ${teamId}`)

      res.setHeader('Content-Type', 'text/html')
      res.send(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed</title></head>
<body style="margin:0;padding:40px 20px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:center;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;">
    <h1 style="font-size:20px;color:#1a1a1a;margin:0 0 12px;">You've been unsubscribed</h1>
    <p style="font-size:14px;color:#666;line-height:1.5;margin:0;">
      You will no longer receive YokeBot email notifications for this team.
      You can re-enable emails anytime in <a href="https://yokebot.com/settings/notifications" style="color:#1a3a2a;">Settings</a>.
    </p>
  </div>
</body>
</html>`)
    } catch {
      res.status(400).send('Invalid token')
    }
  })

  // ===== Config (public — returns platform mode info) =====

  app.get('/api/config', (_req, res) => {
    res.json({ hostedMode: process.env.YOKEBOT_HOSTED_MODE === 'true' })
  })

  // ===== User Profile (update Supabase user metadata) =====

  app.patch('/api/user/profile', async (req: Request, res: Response) => {
    const supabaseUrl = process.env.SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      res.status(500).json({ error: 'Supabase admin credentials not configured' })
      return
    }

    const userId = req.user!.id
    const { iconName, iconColor, displayName } = req.body as { iconName?: string; iconColor?: string; displayName?: string }

    try {
      // First, fetch existing user metadata so we don't overwrite other fields
      const getRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
        },
      })
      if (!getRes.ok) {
        const err = await getRes.json().catch(() => ({ msg: getRes.statusText }))
        res.status(500).json({ error: (err as Record<string, string>).msg ?? 'Failed to fetch user' })
        return
      }
      const existing = await getRes.json() as { user_metadata?: Record<string, unknown> }
      const existingMeta = existing.user_metadata ?? {}

      // Merge new fields into existing metadata
      const updatedMeta: Record<string, unknown> = { ...existingMeta }
      if (iconName !== undefined) updatedMeta.icon_name = iconName
      if (iconColor !== undefined) updatedMeta.icon_color = iconColor
      if (displayName !== undefined) updatedMeta.full_name = displayName

      const updateRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user_metadata: updatedMeta }),
      })
      if (!updateRes.ok) {
        const err = await updateRes.json().catch(() => ({ msg: updateRes.statusText }))
        res.status(500).json({ error: (err as Record<string, string>).msg ?? 'Failed to update user' })
        return
      }

      // Sync display name to team_members for all teams this user belongs to
      if (displayName !== undefined) {
        const teams = await getUserTeams(db, userId)
        for (const team of teams) {
          await updateMemberDisplayName(db, team.id, userId, displayName)
        }
      }

      res.json({ success: true })
    } catch (err) {
      console.error('[user/profile] Error updating metadata:', err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // ===== Notifications (cross-team, uses user_id) =====

  app.get('/api/notifications', async (req, res) => {
    const userId = req.user!.id
    const teamId = req.query.teamId as string | undefined
    const limit = req.query.limit ? Number(req.query.limit) : undefined
    const before = req.query.before as string | undefined
    res.json(await listNotifications(db, userId, { limit, before, teamId }))
  })

  app.get('/api/notifications/count', async (req, res) => {
    const userId = req.user!.id
    res.json({ count: await countUnread(db, userId) })
  })

  app.post('/api/notifications/:id/read', async (req, res) => {
    await markRead(db, req.params.id, req.user!.id)
    const unread = await countUnread(db, req.user!.id)
    broadcastToUser(req.user!.id, 'notification_count', { count: unread })
    res.json({ success: true })
  })

  app.post('/api/notifications/read-all', async (req, res) => {
    const teamId = req.query.teamId as string | undefined
    await markAllRead(db, req.user!.id, teamId)
    const unread = await countUnread(db, req.user!.id)
    broadcastToUser(req.user!.id, 'notification_count', { count: unread })
    res.json({ success: true })
  })

  app.get('/api/notifications/preferences', async (req, res) => {
    res.json(await listPreferences(db, req.user!.id))
  })

  app.patch('/api/notifications/preferences', async (req, res) => {
    const { teamId, inAppEnabled, emailEnabled, muted } = req.body as {
      teamId: string; inAppEnabled?: boolean; emailEnabled?: boolean; muted?: boolean
    }
    if (!teamId) return res.status(400).json({ error: 'teamId is required' })
    const pref = await setPreference(db, req.user!.id, teamId, { inAppEnabled, emailEnabled, muted })
    res.json(pref)
  })

  // Per-category alert preferences
  app.get('/api/notifications/alerts', async (req, res) => {
    const teamId = req.user!.activeTeamId ?? ''
    res.json(await listAlertPreferences(db, req.user!.id, teamId))
  })

  app.put('/api/notifications/alerts', async (req, res) => {
    const teamId = req.user!.activeTeamId ?? ''
    const { alerts } = req.body as { alerts: Array<{ category: string; inApp: boolean; email: boolean; slack: boolean; telegram: boolean }> }
    if (!alerts || !Array.isArray(alerts)) return res.status(400).json({ error: 'alerts array is required' })
    const result = await setBulkAlertPreferences(db, req.user!.id, teamId, alerts)
    res.json(result)
  })

  // ===== Goals =====

  app.get('/api/goals', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const status = req.query.status as GoalStatus | undefined
    res.json(await listGoals(db, teamId, status))
  })

  app.post('/api/goals', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    const { title, description, targetDate } = req.body as { title: string; description?: string; targetDate?: string }
    if (!title) return res.status(400).json({ error: 'title is required' })
    const goal = await createGoal(db, teamId, title, { description, targetDate, createdBy: req.user!.id })
    await logActivity(db, 'goal_created', null, `Goal created: "${title}"`, undefined, teamId)
    res.status(201).json(goal)
  })

  app.get('/api/goals/:id', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('goals', req.params.id, teamId))) return res.status(404).json({ error: 'Goal not found' })
    const goal = await getGoal(db, req.params.id)
    if (!goal) return res.status(404).json({ error: 'Goal not found' })
    const taskIds = await getGoalTasks(db, goal.id)
    res.json({ ...goal, taskIds })
  })

  app.patch('/api/goals/:id', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('goals', req.params.id, teamId))) return res.status(404).json({ error: 'Goal not found' })
    const { title, description, status, targetDate } = req.body as { title?: string; description?: string; status?: GoalStatus; targetDate?: string | null }
    const goal = await updateGoal(db, req.params.id, { title, description, status, targetDate })
    if (!goal) return res.status(404).json({ error: 'Goal not found' })
    res.json(goal)
  })

  app.delete('/api/goals/:id', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('goals', req.params.id, teamId))) return res.status(404).json({ error: 'Goal not found' })
    await deleteGoal(db, req.params.id)
    res.json({ deleted: true })
  })

  app.post('/api/goals/:id/tasks', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('goals', req.params.id, teamId))) return res.status(404).json({ error: 'Goal not found' })
    const { taskId } = req.body as { taskId: string }
    if (!taskId) return res.status(400).json({ error: 'taskId is required' })
    await linkTask(db, req.params.id, taskId)
    res.json({ linked: true })
  })

  app.delete('/api/goals/:id/tasks/:taskId', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('goals', req.params.id, teamId))) return res.status(404).json({ error: 'Goal not found' })
    await unlinkTask(db, req.params.id, req.params.taskId)
    res.json({ unlinked: true })
  })

  // ===== KPI Goals (measurable milestones) =====

  app.get('/api/kpi-goals', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const status = req.query.status as KpiGoalStatus | undefined
    res.json(await listKpiGoals(db, teamId, status))
  })

  app.post('/api/kpi-goals', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    const { title, metricName, targetValue, unit, currentValue, deadline } = req.body as {
      title: string; metricName: string; targetValue: number; unit?: string; currentValue?: number; deadline?: string
    }
    if (!title || !metricName || targetValue === undefined) {
      return res.status(400).json({ error: 'title, metricName, and targetValue are required' })
    }
    const goal = await createKpiGoal(db, teamId, title, metricName, targetValue, {
      unit, currentValue, deadline, createdBy: req.user!.id,
    })
    await logActivity(db, 'kpi_goal_created', null, `Goal created: "${title}"`, undefined, teamId)
    res.status(201).json(goal)
  })

  app.get('/api/kpi-goals/:id', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('kpi_goals', req.params.id, teamId))) return res.status(404).json({ error: 'Goal not found' })
    const goal = await getKpiGoal(db, req.params.id)
    if (!goal) return res.status(404).json({ error: 'Goal not found' })
    res.json(goal)
  })

  app.patch('/api/kpi-goals/:id', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('kpi_goals', req.params.id, teamId))) return res.status(404).json({ error: 'Goal not found' })
    const updates = req.body as Record<string, unknown>
    const goal = await updateKpiGoal(db, req.params.id, updates)
    if (!goal) return res.status(404).json({ error: 'Goal not found' })
    res.json(goal)
  })

  app.delete('/api/kpi-goals/:id', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('kpi_goals', req.params.id, teamId))) return res.status(404).json({ error: 'Goal not found' })
    await deleteKpiGoal(db, req.params.id)
    res.json({ deleted: true })
  })

  // ===== Workflows =====

  app.get('/api/workflows', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const status = req.query.status as 'active' | 'archived' | undefined
    res.json(await listWorkflows(db, teamId, status))
  })

  app.post('/api/workflows', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    const body = validate(CreateWorkflowSchema, req.body)
    const workflow = await createWorkflow(db, teamId, body.name, {
      description: body.description,
      goalId: body.goalId,
      triggerType: body.triggerType,
      scheduleCron: body.scheduleCron,
      triggerTableId: body.triggerTableId,
      createdBy: req.user!.id,
    })
    // Create steps if provided inline
    if (body.steps) {
      for (let i = 0; i < body.steps.length; i++) {
        const s = body.steps[i]
        await addStep(db, workflow.id, s.title, {
          description: s.description,
          assignedAgentId: s.assignedAgentId,
          gate: s.gate,
          timeoutMinutes: s.timeoutMinutes,
          config: s.config,
          stepOrder: i,
        })
      }
    }
    await logActivity(db, 'workflow_created', null, `Workflow "${workflow.name}" created (${body.steps?.length ?? 0} steps)`, undefined, teamId)
    res.status(201).json(workflow)
  })

  app.get('/api/workflows/:id', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('workflows', req.params.id, teamId))) return res.status(404).json({ error: 'Workflow not found' })
    const workflow = await getWorkflow(db, req.params.id)
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' })
    const steps = await listSteps(db, workflow.id)
    res.json({ ...workflow, steps })
  })

  app.patch('/api/workflows/:id', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('workflows', req.params.id, teamId))) return res.status(404).json({ error: 'Workflow not found' })
    const body = validate(UpdateWorkflowSchema, req.body)
    const workflow = await updateWorkflow(db, req.params.id, body as Record<string, unknown>)
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' })
    await logActivity(db, 'workflow_updated', null, `Workflow "${workflow.name}" updated`, undefined, teamId)
    res.json(workflow)
  })

  app.delete('/api/workflows/:id', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('workflows', req.params.id, teamId))) return res.status(404).json({ error: 'Workflow not found' })
    const wfToDelete = await getWorkflow(db, req.params.id)
    await deleteWorkflow(db, req.params.id)
    await logActivity(db, 'workflow_deleted', null, `Workflow "${wfToDelete?.name ?? req.params.id}" deleted`, undefined, teamId)
    res.status(204).end()
  })

  // ---- Workflow Steps ----

  app.post('/api/workflows/:id/steps', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('workflows', req.params.id, teamId))) return res.status(404).json({ error: 'Workflow not found' })
    const body = validate(AddWorkflowStepSchema, req.body)
    // Validate assignedAgentId belongs to this team
    if (body.assignedAgentId) {
      const { getAgent } = await import('./agent.ts')
      const agent = await getAgent(db, body.assignedAgentId as string)
      if (!agent || agent.teamId !== teamId) return res.status(400).json({ error: 'Assigned agent not found or not on this team' })
    }
    const step = await addStep(db, req.params.id, body.title, body)
    res.status(201).json(step)
  })

  app.patch('/api/workflows/:id/steps/:stepId', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('workflows', req.params.id, teamId))) return res.status(404).json({ error: 'Workflow not found' })
    const body = validate(UpdateWorkflowStepSchema, req.body)
    // Validate assignedAgentId belongs to this team
    if (body.assignedAgentId) {
      const { getAgent } = await import('./agent.ts')
      const agent = await getAgent(db, body.assignedAgentId as string)
      if (!agent || agent.teamId !== teamId) return res.status(400).json({ error: 'Assigned agent not found or not on this team' })
    }
    const step = await updateStep(db, req.params.stepId, body as Record<string, unknown>)
    if (!step) return res.status(404).json({ error: 'Step not found' })
    res.json(step)
  })

  app.delete('/api/workflows/:id/steps/:stepId', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('workflows', req.params.id, teamId))) return res.status(404).json({ error: 'Workflow not found' })
    await deleteStep(db, req.params.stepId)
    res.status(204).end()
  })

  app.put('/api/workflows/:id/steps/reorder', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('workflows', req.params.id, teamId))) return res.status(404).json({ error: 'Workflow not found' })
    const body = validate(ReorderWorkflowStepsSchema, req.body)
    await reorderSteps(db, req.params.id, body.stepIds)
    res.json({ reordered: true })
  })

  // ---- Workflow Runs ----

  app.post('/api/workflows/:id/run', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('workflows', req.params.id, teamId))) return res.status(404).json({ error: 'Workflow not found' })
    const wfForRun = await getWorkflow(db, req.params.id)
    const runContext = req.body && typeof req.body === 'object' ? req.body.context : undefined
    const run = await startRun(db, teamId, req.params.id, req.user!.id, runContext)
    await logActivity(db, 'workflow_run_started', null, `Workflow "${wfForRun?.name ?? req.params.id}" run started`, undefined, teamId)
    // Kick off the first step
    void advanceWorkflow(db, run.id).catch((err) => console.error('[workflows] advanceWorkflow error:', err))
    res.status(201).json(run)
  })

  app.get('/api/workflow-runs', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const workflowId = req.query.workflowId as string | undefined
    const status = req.query.status as string | undefined
    res.json(await listRuns(db, { teamId, workflowId, status: status as 'running' | 'paused' | 'completed' | 'failed' | 'canceled' | undefined }))
  })

  app.get('/api/workflow-runs/:id', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('workflow_runs', req.params.id, teamId))) return res.status(404).json({ error: 'Run not found' })
    const run = await getRun(db, req.params.id)
    if (!run) return res.status(404).json({ error: 'Run not found' })
    const runSteps = await listRunSteps(db, run.id)
    res.json({ ...run, steps: runSteps })
  })

  app.post('/api/workflow-runs/:id/cancel', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('workflow_runs', req.params.id, teamId))) return res.status(404).json({ error: 'Run not found' })
    const run = await cancelRun(db, req.params.id)
    if (!run) return res.status(404).json({ error: 'Run not found' })
    const wfForCancel = await getWorkflow(db, run.workflowId)
    await logActivity(db, 'workflow_run_canceled', null, `Workflow "${wfForCancel?.name ?? run.workflowId}" run canceled`, undefined, teamId)
    res.json(run)
  })

  app.post('/api/workflow-run-steps/:id/approve', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    // Verify step belongs to a workflow run owned by this team
    const step = await db.queryOne<{ id: string }>(
      `SELECT s.id FROM workflow_run_steps s JOIN workflow_runs r ON s.run_id = r.id JOIN workflows w ON r.workflow_id = w.id WHERE s.id = $1 AND w.team_id = $2`,
      [req.params.id, teamId],
    )
    if (!step) return res.status(404).json({ error: 'Step not found' })
    await approveWorkflowStep(db, req.params.id)
    await logActivity(db, 'workflow_step_approved', null, `Workflow step approved`, undefined, teamId)
    res.json({ approved: true })
  })

  // ---- Workflow Capture ----

  app.post('/api/workflows/capture', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    const body = validate(CaptureWorkflowSchema, req.body)
    const workflow = await captureWorkflow(db, teamId, body.name, body.taskIds)
    res.status(201).json(workflow)
  })

  // ===== Video Projects =====

  app.get('/api/video-projects', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const status = req.query.status as 'draft' | 'in_progress' | 'completed' | 'archived' | undefined
    res.json(await listVideoProjects(db, teamId, status))
  })

  app.post('/api/video-projects', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    const body = validate(CreateVideoProjectSchema, req.body)
    const project = await createVideoProject(db, teamId, body.name, {
      description: body.description,
      workflowRunId: body.workflowRunId,
      settings: body.settings,
      createdBy: req.user!.id,
    })
    await logActivity(db, 'video_project_created', null, `Video project "${project.name}" created`, undefined, teamId)
    res.status(201).json(project)
  })

  app.get('/api/video-projects/:id', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('video_projects', req.params.id, teamId))) return res.status(404).json({ error: 'Video project not found' })
    const project = await getVideoProject(db, req.params.id)
    if (!project) return res.status(404).json({ error: 'Video project not found' })
    const scenes = await listScenes(db, project.id)
    const assets = await listAssets(db, project.id)
    res.json({ ...project, scenes, assets })
  })

  app.patch('/api/video-projects/:id', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('video_projects', req.params.id, teamId))) return res.status(404).json({ error: 'Video project not found' })
    const body = validate(UpdateVideoProjectSchema, req.body)
    const project = await updateVideoProject(db, req.params.id, body as Record<string, unknown>)
    if (!project) return res.status(404).json({ error: 'Video project not found' })
    await logActivity(db, 'video_project_updated', null, `Video project "${project.name}" updated`, undefined, teamId)
    res.json(project)
  })

  app.delete('/api/video-projects/:id', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('video_projects', req.params.id, teamId))) return res.status(404).json({ error: 'Video project not found' })
    const projectToDelete = await getVideoProject(db, req.params.id)
    await deleteVideoProject(db, req.params.id)
    await logActivity(db, 'video_project_deleted', null, `Video project "${projectToDelete?.name ?? req.params.id}" deleted`, undefined, teamId)
    res.status(204).end()
  })

  // ---- Video Scenes ----

  app.post('/api/video-projects/:id/scenes', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('video_projects', req.params.id, teamId))) return res.status(404).json({ error: 'Video project not found' })
    const body = validate(AddVideoSceneSchema, req.body)
    const scene = await addScene(db, req.params.id, body.title, body)
    res.status(201).json(scene)
  })

  app.patch('/api/video-projects/:id/scenes/:sceneId', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('video_projects', req.params.id, teamId))) return res.status(404).json({ error: 'Video project not found' })
    const body = validate(UpdateVideoSceneSchema, req.body)
    const scene = await updateScene(db, req.params.sceneId, body as Record<string, unknown>)
    if (!scene) return res.status(404).json({ error: 'Scene not found' })
    res.json(scene)
  })

  app.delete('/api/video-projects/:id/scenes/:sceneId', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('video_projects', req.params.id, teamId))) return res.status(404).json({ error: 'Video project not found' })
    await deleteScene(db, req.params.sceneId)
    res.status(204).end()
  })

  app.put('/api/video-projects/:id/scenes/reorder', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('video_projects', req.params.id, teamId))) return res.status(404).json({ error: 'Video project not found' })
    const body = validate(ReorderVideoScenesSchema, req.body)
    await reorderScenes(db, req.params.id, body.sceneIds)
    res.json({ reordered: true })
  })

  // ---- Video Assets ----

  app.post('/api/video-projects/:id/assets', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('video_projects', req.params.id, teamId))) return res.status(404).json({ error: 'Video project not found' })
    const body = validate(AddVideoAssetSchema, req.body)
    const asset = await addAsset(db, req.params.id, body.type, body.filePath, body)
    res.status(201).json(asset)
  })

  app.patch('/api/video-projects/:id/assets/:assetId', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('video_projects', req.params.id, teamId))) return res.status(404).json({ error: 'Video project not found' })
    const body = validate(UpdateVideoAssetSchema, req.body)
    const asset = await updateAsset(db, req.params.assetId, body as Record<string, unknown>)
    if (!asset) return res.status(404).json({ error: 'Asset not found' })
    res.json(asset)
  })

  app.delete('/api/video-projects/:id/assets/:assetId', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('video_projects', req.params.id, teamId))) return res.status(404).json({ error: 'Video project not found' })
    await deleteAsset(db, req.params.assetId)
    res.status(204).end()
  })

  // ---- Video Transcription ----

  app.post('/api/video-projects/:id/assets/:assetId/transcribe', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('video_projects', req.params.id, teamId))) return res.status(404).json({ error: 'Video project not found' })
    const asset = await getAsset(db, req.params.assetId)
    if (!asset || asset.projectId !== req.params.id) return res.status(404).json({ error: 'Asset not found' })
    if (!['audio', 'voiceover'].includes(asset.type)) return res.status(400).json({ error: 'Only audio/voiceover assets can be transcribed' })

    // Read the audio file from workspace
    const audioBuffer = await readBinaryFile(db, teamId, asset.filePath)
    if (!audioBuffer) return res.status(404).json({ error: 'Audio file not found in workspace' })

    try {
      const updated = await transcribeAsset(db, req.params.assetId, audioBuffer, asset.filename || 'audio.mp3')
      if (!updated) return res.status(404).json({ error: 'Asset not found' })
      await logActivity(db, 'asset_transcribed', null, `Transcribed asset "${asset.filename || asset.filePath}"`, undefined, teamId)
      res.json(updated)
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  app.patch('/api/video-projects/:id/assets/:assetId/transcription', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('video_projects', req.params.id, teamId))) return res.status(404).json({ error: 'Video project not found' })
    const asset = await getAsset(db, req.params.assetId)
    if (!asset || asset.projectId !== req.params.id) return res.status(404).json({ error: 'Asset not found' })

    const body = validate(UpdateTranscriptionSchema, req.body)

    // Merge updates into existing transcription metadata
    let meta: Record<string, unknown> = {}
    try { meta = JSON.parse(asset.metadata) } catch { /* */ }
    const transcription = (meta.transcription ?? {}) as Record<string, unknown>

    if (body.segments) transcription.segments = body.segments
    if (body.words) transcription.words = body.words
    if (body.deletedRanges) transcription.deletedRanges = body.deletedRanges
    meta.transcription = transcription

    const updated = await updateAsset(db, req.params.assetId, { metadata: JSON.stringify(meta) })
    if (!updated) return res.status(404).json({ error: 'Asset not found' })
    res.json(updated)
  })

  app.post('/api/video-projects/:id/assets/:assetId/apply-edits', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('video_projects', req.params.id, teamId))) return res.status(404).json({ error: 'Video project not found' })
    const asset = await getAsset(db, req.params.assetId)
    if (!asset || asset.projectId !== req.params.id) return res.status(404).json({ error: 'Asset not found' })

    const body = validate(ApplyTranscriptEditsSchema, req.body)

    // Read original audio file
    const audioBuffer = await readBinaryFile(db, teamId, asset.filePath)
    if (!audioBuffer) return res.status(404).json({ error: 'Audio file not found in workspace' })

    try {
      const { applyTranscriptEdits } = await import('./video-render.ts')
      const result = await applyTranscriptEdits(audioBuffer, body.edits, asset.durationMs ?? 0)

      // Save working copy to workspace
      const workingFilename = `edited_${asset.filename || 'audio'}_${Date.now()}.mp3`
      const workingPath = `media/working/${workingFilename}`
      await writeBinaryFile(db, teamId, workingPath, result.buffer, 'audio/mpeg', req.user!.id)

      // Update asset metadata with edit history
      let meta: Record<string, unknown> = {}
      try { meta = JSON.parse(asset.metadata) } catch { /* */ }
      meta.originalPath = meta.originalPath ?? asset.filePath
      meta.editHistory = [...((meta.editHistory as unknown[]) ?? []), { edits: body.edits, appliedAt: new Date().toISOString() }]

      const updated = await updateAsset(db, req.params.assetId, {
        metadata: JSON.stringify(meta),
        durationMs: result.durationMs,
      })

      await logActivity(db, 'asset_edited', null, `Applied ${body.edits.length} transcript edit(s) to "${asset.filename || asset.filePath}"`, undefined, teamId)
      res.json({ ...updated, workingPath })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // ===== Global Error Handler =====

  app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status ?? 500
    const message = status < 500 ? err.message : 'Internal server error'
    if (status >= 500) console.error('[engine] Unhandled error:', err)
    res.status(status).json({ error: message })
  })

  // ===== Start server =====

  const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'
  const server = app.listen(PORT, HOST, () => {
    console.log(`
  ╔═══════════════════════════════════════╗
  ║         YokeBot Engine v0.0.1         ║
  ║    http://localhost:${PORT}              ║
  ╚═══════════════════════════════════════╝

  Data:      ${DATA_DIR}
  Workspace: ${WORKSPACE_DIR}
  Skills:    ${SKILLS_DIR}
  Database:  ${process.env.DATABASE_URL ? 'Postgres' : 'SQLite'}
  `)

    // Configure model fallback from env vars
    if (process.env.YOKEBOT_FALLBACK_ENDPOINT) {
      setFallbackConfig({
        endpoint: process.env.YOKEBOT_FALLBACK_ENDPOINT,
        model: process.env.YOKEBOT_FALLBACK_MODEL ?? 'deepseek-chat',
        apiKey: process.env.YOKEBOT_FALLBACK_API_KEY,
      })
      console.log(`  Fallback:  ${process.env.YOKEBOT_FALLBACK_ENDPOINT}`)
    }

    // Heartbeat timers run in the separate worker process (worker.ts).
    // But the API server still needs workspace/skills state for respondToMention.
    initSchedulerState(workspaceConfig, SKILLS_DIR)
  })

  // CDP Screencast WebSocket proxy for browser sessions
  setBrowserStreamTeamCheck(async (userId: string, teamId: string) => {
    const members = await getTeamMembers(db, teamId)
    return members.some(m => m.userId === userId)
  })
  installBrowserStreamHandler(server)

  // WebSocket upgrade handler for Vite HMR through the sandbox proxy
  server.on('upgrade', (req, socket, head) => {
    const cookieHeader = req.headers.cookie ?? ''
    const cookieToken = cookieHeader.split(';').map((c: string) => c.trim()).find((c: string) => c.startsWith('spt='))?.slice(4)
    if (cookieToken && proxyTokenStore.has(cookieToken)) {
      const entry = proxyTokenStore.get(cookieToken)!
      if (Date.now() <= entry.expires) {
        sandboxProxy.upgrade!(req, socket as import('net').Socket, head)
        return
      }
    }
    // Not a sandbox WebSocket — ignore (other upgrade handlers can take over)
  })

  // Graceful shutdown — drain in-flight sprints before exiting
  process.on('SIGINT', async () => {
    console.log('\n[engine] SIGINT — draining sprints...')
    await drainScheduler(280_000)
    await db.close()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    console.log('[engine] SIGTERM — draining sprints...')
    await drainScheduler(280_000)
    await db.close()
    process.exit(0)
  })
}

// Prevent crash-loop on unhandled errors — log and stay alive
process.on('uncaughtException', (err) => {
  console.error('[engine] UNCAUGHT EXCEPTION (process staying alive):', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[engine] UNHANDLED REJECTION (process staying alive):', reason)
})

// Boot
main().catch((err) => {
  console.error('[engine] Fatal startup error:', err)
  process.exit(1)
})

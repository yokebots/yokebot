/**
 * index.ts — YokeBot Engine entry point
 *
 * Wires everything together and exposes an HTTP API for the dashboard.
 * This is the single process that orchestrates all agents.
 */

import 'dotenv/config'
import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { homedir } from 'os'
import { join } from 'path'
import { createDb } from './db/index.ts'
import { createAgent, listAgents, getAgent, updateAgent, deleteAgent, setAgentStatus } from './agent.ts'
import { runReactLoop, buildAgentSystemPrompt } from './runtime.ts'
import { startScheduler, stopScheduler, scheduleAgent, unscheduleAgent } from './scheduler.ts'
import { createApproval, listPendingApprovals, resolveApproval, countPendingApprovals } from './approval.ts'
import { createTask, listTasks, getTask, updateTask, deleteTask } from './tasks.ts'
import { createChannel, getChannel, listChannels, getDmChannel, getTaskThread, sendMessage, getChannelMessages, processMentions } from './chat.ts'
import { initWorkspace, listFiles, readFile, writeFile, type WorkspaceConfig } from './workspace.ts'
import { loadSkillsFromDir, getAgentSkills, installSkill, uninstallSkill } from './skills.ts'
import { logActivity, listActivity, countActivity } from './activity.ts'
import { detectOllama, setFallbackConfig, setHostedResolver, resolveModelConfig, getAvailableModels, upsertProvider, listStoredProviders, PROVIDERS, chatCompletion } from './model.ts'
import { createSorTable, listSorTables, addSorColumn, listSorColumns, addSorRow, listSorRows, updateSorRow, deleteSorRow, getSorPermissions, setSorPermission, getSorTable } from './sor.ts'
import { createTeam, listTeams, getTeam, getUserTeams, addMember, removeMember, getTeamMembers, updateMemberRole, deleteTeam, findUserByEmail } from './teams.ts'
import { authMiddleware } from './auth-middleware.ts'
import { createTeamMiddleware, requireRole } from './team-middleware.ts'
import { listNotifications, countUnread, markRead, markAllRead, listPreferences, setPreference, notifyTeam, listAlertPreferences, setBulkAlertPreferences } from './notifications.ts'
import { createGoal, getGoal, listGoals, updateGoal, deleteGoal, linkTask, unlinkTask, getGoalTasks, type GoalStatus } from './goals.ts'
import { createKpiGoal, getKpiGoal, listKpiGoals, updateKpiGoal, deleteKpiGoal, type KpiGoalStatus } from './kpi-goals.ts'
import { validate, CreateAgentSchema, UpdateAgentSchema, ChatWithAgentSchema, CreateTaskSchema, UpdateTaskSchema, CreateChannelSchema, SendChatMessageSchema, CreateApprovalSchema, ResolveApprovalSchema, CreateSorTableSchema, UpdateSorPermissionSchema, WriteFileSchema, UpdateProviderSchema, InstallSkillSchema, CreateTeamSchema, AddMemberSchema, UpdateRoleSchema, SetCredentialSchema, UploadKbDocumentSchema, SearchKbSchema } from './validation.ts'
import { uploadDocument, listDocuments, getDocument, deleteDocument, getDocumentChunks, searchKb } from './knowledge-base.ts'
import { listCredentials, setCredential, deleteCredential } from './credentials.ts'
import { listServices } from './services.ts'
import { listTemplates, getTemplate } from './templates.ts'
import { listMcpServers, addMcpServer, removeMcpServer, connectMcpServer } from './mcp-client.ts'
import { addCredits } from './billing.ts'

const PORT = Number(process.env.PORT ?? process.env.YOKEBOT_PORT ?? 3001)
const DATA_DIR = process.env.YOKEBOT_DATA_DIR ?? join(homedir(), '.yokebot')
const WORKSPACE_DIR = process.env.YOKEBOT_WORKSPACE_DIR ?? join(DATA_DIR, 'workspace')
const SKILLS_DIR = process.env.YOKEBOT_SKILLS_DIR ?? join(process.cwd(), '..', '..', 'skills')

async function main() {
  // Initialize database (async — picks SQLite or Postgres based on DATABASE_URL)
  const db = await createDb({ dataDir: DATA_DIR })

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

  // Security headers
  app.use(helmet())

  // CORS — restrict to known origins in production
  const CORS_ORIGINS = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((s) => s.trim())
    : ['http://localhost:5173', 'http://localhost:3000']
  app.use(cors({ origin: CORS_ORIGINS, credentials: true }))

  // Stripe webhook needs raw body for signature verification — must come BEFORE express.json()
  app.use('/api/billing/webhook', express.raw({ type: 'application/json' }))

  // Body size limit
  app.use(express.json({ limit: '1mb' }))

  // Rate limiting — general (per IP, generous for dashboard usage)
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
    skip: (req) => req.path === '/health' || req.path === '/api/config',
  }))

  // Stricter rate limit for chat completions (LLM calls are expensive)
  const chatLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Chat rate limit exceeded, please wait' },
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

  // ===== Ownership verification helper =====
  // Prevents IDOR: verifies an object belongs to the requesting user's team
  const OWNERSHIP_TABLES = new Set(['agents', 'tasks', 'goals', 'kpi_goals', 'approvals', 'chat_channels', 'sor_tables', 'kb_documents'])
  async function verifyOwnership(table: string, id: string, teamId: string): Promise<boolean> {
    if (!OWNERSHIP_TABLES.has(table)) throw new Error(`verifyOwnership: unknown table "${table}"`)
    const row = await db.queryOne<{ team_id: string }>(`SELECT team_id FROM ${table} WHERE id = $1`, [id])
    return row !== null && row.team_id === teamId
  }

  // ===== Health =====

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: '0.0.1' })
  })

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

  app.get('/api/agents/:id', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('agents', req.params.id, teamId)) return res.status(404).json({ error: 'Agent not found' })
    const agent = await getAgent(db, req.params.id)
    if (!agent) return res.status(404).json({ error: 'Agent not found' })
    res.json(agent)
  })

  app.post('/api/agents', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const body = validate(CreateAgentSchema, req.body)

    // Check if template is free (exempt from agent limits)
    const templateId = (req.body as Record<string, unknown>).templateId as string | undefined
    let isTemplFree = false
    if (templateId) {
      const tmpl = getTemplate(templateId)
      if (tmpl?.isFree) isTemplFree = true

      // Block hosted-only templates in self-hosted mode
      if (tmpl?.hostedOnly && process.env.YOKEBOT_HOSTED_MODE !== 'true') {
        return res.status(403).json({ error: 'This agent is only available on YokeBot Cloud.' })
      }
    }

    // Enforce agent count limit in hosted mode (free templates exempt)
    if (req.subscription && !isTemplFree) {
      const existing = await listAgents(db, teamId)
      // Count only non-free agents
      const paidAgentCount = existing.filter((a) => a.templateId !== 'advisor-bot').length
      if (paidAgentCount >= req.subscription.maxAgents) {
        return res.status(403).json({
          error: `Your ${req.subscription.tier} plan allows ${req.subscription.maxAgents} agent(s). Upgrade to add more.`,
          code: 'AGENT_LIMIT_REACHED',
        })
      }
    }

    const agent = await createAgent(db, teamId, {
      name: body.name,
      department: body.department,
      systemPrompt: body.systemPrompt,
      modelId: body.modelId,
      modelConfig: {
        endpoint: body.modelEndpoint ?? 'ollama',
        model: body.modelName ?? 'llama3.2',
      },
      proactive: body.proactive,
      heartbeatSeconds: body.heartbeatSeconds,
      templateId,
    })

    await logActivity(db, 'agent_created', agent.id, `Agent "${agent.name}" created`, undefined, teamId)
    res.status(201).json(agent)
  })

  app.patch('/api/agents/:id', async (req, res) => {
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
    res.json({ ...agent, status: 'running' })
  })

  app.post('/api/agents/:id/stop', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('agents', req.params.id, teamId)) return res.status(404).json({ error: 'Agent not found' })
    const agent = await getAgent(db, req.params.id)
    if (!agent) return res.status(404).json({ error: 'Agent not found' })
    await setAgentStatus(db, agent.id, 'stopped')
    unscheduleAgent(agent.id)
    await logActivity(db, 'agent_stopped', agent.id, `Agent "${agent.name}" stopped`, undefined, teamId)
    res.json({ ...agent, status: 'stopped' })
  })

  // ===== Chat with Agent (ReAct loop) =====

  app.post('/api/agents/:id/chat', chatLimiter, async (req: Request, res: Response) => {
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

    const systemPrompt = buildAgentSystemPrompt(agent.name, agent.systemPrompt)

    try {
      const modelConfig = await resolveModelConfig(db, agent.modelId || agent.modelEndpoint)
      // AdvisorBot is always free — skip credit deduction
      const runtimeConfig = agent.templateId === 'advisor-bot'
        ? { maxIterations: 10, skipCredits: true }
        : undefined
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
      )

      // Store agent response in DM channel
      if (result.response) {
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
    const approval = await createApproval(db, teamId, body.agentId, body.actionType, body.actionDetail, body.riskLevel)
    // Notify team about new approval
    void notifyTeam(db, teamId, 'approval_needed', `Approval needed: ${body.actionType}`, body.actionDetail.slice(0, 200), '/approvals')
    res.status(201).json(approval)
  })

  app.post('/api/approvals/:id/resolve', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('approvals', req.params.id, teamId)) return res.status(404).json({ error: 'Approval not found' })
    const { status } = validate(ResolveApprovalSchema, req.body)
    const approval = await resolveApproval(db, req.params.id, status)
    if (!approval) return res.status(404).json({ error: 'Approval not found' })
    await logActivity(db, 'approval_resolved', approval.agentId, `Approval ${status}: ${approval.actionType} — ${approval.actionDetail.slice(0, 100)}`, { approvalId: approval.id, status }, teamId)
    res.json(approval)
  })

  // ===== Tasks (Mission Control) =====

  app.get('/api/tasks', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const filters: Record<string, unknown> = { teamId }
    if (req.query.status) filters.status = req.query.status
    if (req.query.agentId) filters.agentId = req.query.agentId
    if (req.query.parentId === 'null') filters.parentId = null
    else if (req.query.parentId) filters.parentId = req.query.parentId
    res.json(await listTasks(db, filters as Parameters<typeof listTasks>[1]))
  })

  app.get('/api/tasks/:id', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('tasks', req.params.id, teamId)) return res.status(404).json({ error: 'Task not found' })
    const task = await getTask(db, req.params.id)
    if (!task) return res.status(404).json({ error: 'Task not found' })
    res.json(task)
  })

  app.post('/api/tasks', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const body = validate(CreateTaskSchema, req.body)
    const task = await createTask(db, teamId, body.title, body)
    res.status(201).json(task)
  })

  app.patch('/api/tasks/:id', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('tasks', req.params.id, teamId)) return res.status(404).json({ error: 'Task not found' })
    const body = validate(UpdateTaskSchema, req.body)
    const task = await updateTask(db, req.params.id, body as Record<string, unknown>)
    if (!task) return res.status(404).json({ error: 'Task not found' })
    res.json(task)
  })

  app.delete('/api/tasks/:id', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('tasks', req.params.id, teamId)) return res.status(404).json({ error: 'Task not found' })
    await deleteTask(db, req.params.id)
    res.status(204).end()
  })

  // ===== Chat =====

  app.get('/api/chat/channels', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    res.json(await listChannels(db, teamId))
  })

  app.post('/api/chat/channels', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const { name, type } = validate(CreateChannelSchema, req.body)
    const channel = await createChannel(db, teamId, name, type)
    res.status(201).json(channel)
  })

  app.delete('/api/chat/channels/:channelId', async (req, res) => {
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

  app.get('/api/chat/channels/:channelId/messages', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('chat_channels', req.params.channelId, teamId)) return res.status(404).json({ error: 'Channel not found' })
    const limit = Number(req.query.limit ?? 50)
    const before = req.query.before ? Number(req.query.before) : undefined
    res.json(await getChannelMessages(db, req.params.channelId, limit, before))
  })

  app.post('/api/chat/channels/:channelId/messages', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('chat_channels', req.params.channelId, teamId)) return res.status(404).json({ error: 'Channel not found' })
    const { senderType, senderId, content, taskId } = validate(SendChatMessageSchema, req.body)
    const msg = await sendMessage(db, req.params.channelId, senderType, senderId, content, taskId, teamId)
    // Fire-and-forget mention processing (notifications + agent wake)
    processMentions(db, teamId, req.params.channelId, msg).catch((err) =>
      console.error('[chat] Mention processing error:', err),
    )
    res.status(201).json(msg)
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
      users: members.map((m) => ({ userId: m.userId, email: m.email })),
      documents: documents.map((d) => ({ id: d.id, title: d.title, fileType: d.fileType })),
    })
  })

  // ===== Workspace =====

  app.get('/api/workspace/files', (req, res) => {
    const dir = (req.query.dir as string) ?? ''
    res.json(listFiles(workspaceConfig, dir))
  })

  app.get('/api/workspace/file', (req, res) => {
    const path = req.query.path as string
    if (!path) return res.status(400).json({ error: 'path is required' })
    const content = readFile(workspaceConfig, path)
    if (content === null) return res.status(404).json({ error: 'File not found' })
    res.json({ path, content })
  })

  app.put('/api/workspace/file', (req, res) => {
    const { path, content, agentId } = validate(WriteFileSchema, req.body)
    const result = writeFile(workspaceConfig, path, content, agentId)
    if (!result.success) return res.status(423).json({ error: result.error })
    res.json({ success: true })
  })

  // ===== Knowledge Base =====

  app.post('/api/kb/documents', express.json({ limit: '15mb' }), async (req, res) => {
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
    const teamId = req.user!.activeTeamId!
    const { name, columns } = validate(CreateSorTableSchema, req.body)
    const table = await createSorTable(db, teamId, name)
    if (columns) {
      for (const col of columns) await addSorColumn(db, table.id, col.name, col.colType)
    }
    res.status(201).json({ ...table, columns: await listSorColumns(db, table.id) })
  })

  app.get('/api/sor/tables/:id/rows', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('sor_tables', req.params.id, teamId)) return res.status(404).json({ error: 'Table not found' })
    res.json(await listSorRows(db, req.params.id))
  })

  app.post('/api/sor/tables/:id/rows', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('sor_tables', req.params.id, teamId)) return res.status(404).json({ error: 'Table not found' })
    const row = await addSorRow(db, req.params.id, req.body as Record<string, unknown>)
    res.status(201).json(row)
  })

  app.patch('/api/sor/tables/:tableId/rows/:rowId', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('sor_tables', req.params.tableId, teamId)) return res.status(404).json({ error: 'Table not found' })
    const row = await updateSorRow(db, req.params.rowId, req.body as Record<string, unknown>)
    if (!row) return res.status(404).json({ error: 'Row not found' })
    res.json(row)
  })

  app.delete('/api/sor/tables/:tableId/rows/:rowId', async (req, res) => {
    if (!requireRole(req, res, 'member')) return
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('sor_tables', req.params.tableId, teamId)) return res.status(404).json({ error: 'Table not found' })
    await deleteSorRow(db, req.params.rowId)
    res.status(204).end()
  })

  app.get('/api/sor/tables/:id/permissions', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    if (!await verifyOwnership('sor_tables', req.params.id, teamId)) return res.status(404).json({ error: 'Table not found' })
    res.json(await getSorPermissions(db, req.params.id))
  })

  app.patch('/api/sor/tables/:id/permissions', async (req, res) => {
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
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('agents', req.params.id, teamId))) return res.status(404).json({ error: 'Agent not found' })
    const { skillName } = validate(InstallSkillSchema, req.body)
    await installSkill(db, req.params.id, skillName)
    res.status(201).json({ agentId: req.params.id, skillName, installed: true })
  })

  app.delete('/api/agents/:id/skills/:skillName', async (req, res) => {
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

  // ===== Services (available integrations) =====

  app.get('/api/services', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const services = listServices()
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

    // Auto-deploy AdvisorBot in hosted mode
    if (process.env.YOKEBOT_HOSTED_MODE === 'true') {
      try {
        const advisorTemplate = getTemplate('advisor-bot')
        if (advisorTemplate) {
          const modelConfig = await resolveModelConfig(db, advisorTemplate.recommendedModel)
          if (modelConfig) {
            const advisorAgent = await createAgent(db, team.id, {
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
            await logActivity(db, 'agent_created', advisorAgent.id, `AdvisorBot auto-deployed for new team`, undefined, team.id)
          }
        }
      } catch (err) {
        console.error('[engine] Failed to auto-deploy AdvisorBot:', (err as Error).message)
      }

      // Grant 1,250 starter credits for the user's first team only
      if (req.user?.id) {
        const userTeams = await getUserTeams(db, req.user.id)
        if (userTeams.length === 1) {
          await addCredits(db, team.id, 1250, 'starter_credits', 'Welcome bonus: 1,250 starter credits')
          console.log(`[engine] Granted 1,250 starter credits to team ${team.id}`)
        }
      }
    }

    await logActivity(db, 'team_created', null, `Team "${name}" created`)
    res.status(201).json(team)
  })

  app.delete('/api/teams/:id', async (req, res) => {
    const team = await getTeam(db, req.params.id)
    if (!team) return res.status(404).json({ error: 'Team not found' })
    // Only admin members can delete a team
    const members = await getTeamMembers(db, req.params.id)
    const caller = members.find((m) => m.userId === req.user!.id)
    if (!caller || caller.role !== 'admin') return res.status(403).json({ error: 'Only team admins can delete a team' })
    await deleteTeam(db, req.params.id)
    res.status(204).end()
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
    await logActivity(db, 'member_added', null, `${email} added to team "${team.name}"`)
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
      return res.json({ teamId: req.params.id, companyName: null, companyUrl: null, industry: null, companySize: null, businessSummary: null, targetMarket: null, primaryGoal: null, onboardedAt: null })
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
    })
  })

  app.put('/api/teams/:id/profile', async (req, res) => {
    const team = await getTeam(db, req.params.id)
    if (!team) return res.status(404).json({ error: 'Team not found' })
    const members = await getTeamMembers(db, req.params.id)
    const caller = members.find((m) => m.userId === req.user!.id)
    if (!caller) return res.status(403).json({ error: 'Not a member of this team' })

    const body = req.body as Record<string, string | null | undefined>
    // Coerce undefined to null — Postgres driver rejects undefined values
    const companyName = body.companyName ?? null
    const companyUrl = body.companyUrl ?? null
    const industry = body.industry ?? null
    const companySize = body.companySize ?? null
    const businessSummary = body.businessSummary ?? null
    const targetMarket = body.targetMarket ?? null
    const primaryGoal = body.primaryGoal ?? null
    const onboardedAt = body.onboardedAt ?? null

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
          updated_at = ${db.now()}
        WHERE team_id = $9`,
        [companyName, companyUrl, industry, companySize, businessSummary, targetMarket, primaryGoal, onboardedAt, req.params.id],
      )
    } else {
      await db.run(
        `INSERT INTO team_profiles (team_id, company_name, company_url, industry, company_size, business_summary, target_market, primary_goal, onboarded_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [req.params.id, companyName, companyUrl, industry, companySize, businessSummary, targetMarket, primaryGoal, onboardedAt],
      )
    }
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
    await logActivity(db, 'agent_created', agent.id, `AdvisorBot deployed via setup`, undefined, req.params.id)

    res.status(201).json({ agentId: agent.id, alreadyExists: false })
  })

  // ===== Meetings (hosted-only — real-time meet-and-greet) =====

  app.post('/api/teams/:id/meetings/meet-and-greet', async (req, res) => {
    if (process.env.YOKEBOT_HOSTED_MODE !== 'true') {
      return res.status(403).json({ error: 'Meetings are only available in hosted mode' })
    }
    if (!requireRole(req, res, 'admin')) return

    try {
      const cloudPath = './cloud/orchestrator.ts'
      const { startMeetAndGreet } = await import(/* @vite-ignore */ cloudPath)
      const teamId = req.user!.activeTeamId!

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

    try {
      const cloudPath2 = './cloud/orchestrator.ts'
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

    const { content } = req.body as { content?: string }
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Message content is required' })
    }

    try {
      const cloudPath3 = './cloud/orchestrator.ts'
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

    try {
      const cloudPath4 = './cloud/orchestrator.ts'
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

    try {
      const cloudPath5 = './cloud/orchestrator.ts'
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

  // ===== Config (public — returns platform mode info) =====

  app.get('/api/config', (_req, res) => {
    res.json({ hostedMode: process.env.YOKEBOT_HOSTED_MODE === 'true' })
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
    res.json({ success: true })
  })

  app.post('/api/notifications/read-all', async (req, res) => {
    const teamId = req.query.teamId as string | undefined
    await markAllRead(db, req.user!.id, teamId)
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
    const teamId = req.user!.activeTeamId!
    if (!(await verifyOwnership('goals', req.params.id, teamId))) return res.status(404).json({ error: 'Goal not found' })
    const { taskId } = req.body as { taskId: string }
    if (!taskId) return res.status(400).json({ error: 'taskId is required' })
    await linkTask(db, req.params.id, taskId)
    res.json({ linked: true })
  })

  app.delete('/api/goals/:id/tasks/:taskId', async (req, res) => {
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

  // ===== Global Error Handler =====

  app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status ?? 500
    const message = status < 500 ? err.message : 'Internal server error'
    if (status >= 500) console.error('[engine] Unhandled error:', err)
    res.status(status).json({ error: message })
  })

  // ===== Start server =====

  app.listen(PORT, () => {
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

    // Start the scheduler for running agents
    void startScheduler(db, workspaceConfig, SKILLS_DIR)
  })

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n[engine] Shutting down...')
    stopScheduler()
    await db.close()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    stopScheduler()
    await db.close()
    process.exit(0)
  })
}

// Boot
main().catch((err) => {
  console.error('[engine] Fatal startup error:', err)
  process.exit(1)
})

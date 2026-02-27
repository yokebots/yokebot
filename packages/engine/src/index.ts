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
import { runReactLoop } from './runtime.ts'
import { startScheduler, stopScheduler, scheduleAgent, unscheduleAgent } from './scheduler.ts'
import { createApproval, listPendingApprovals, resolveApproval, countPendingApprovals } from './approval.ts'
import { createTask, listTasks, getTask, updateTask, deleteTask } from './tasks.ts'
import { createChannel, listChannels, getDmChannel, getTaskThread, sendMessage, getChannelMessages } from './chat.ts'
import { initWorkspace, listFiles, readFile, writeFile, type WorkspaceConfig } from './workspace.ts'
import { loadSkillsFromDir, getAgentSkills, installSkill, uninstallSkill } from './skills.ts'
import { logActivity, listActivity, countActivity } from './activity.ts'
import { detectOllama, setFallbackConfig, setHostedResolver, resolveModelConfig, getAvailableModels, upsertProvider, listStoredProviders, PROVIDERS } from './model.ts'
import { createSorTable, listSorTables, addSorColumn, listSorColumns, addSorRow, listSorRows, updateSorRow, deleteSorRow, getSorPermissions, setSorPermission, getSorTable } from './sor.ts'
import { createTeam, listTeams, getTeam, getUserTeams, addMember, removeMember, getTeamMembers, updateMemberRole, deleteTeam } from './teams.ts'
import { authMiddleware } from './auth-middleware.ts'
import { createTeamMiddleware, requireRole } from './team-middleware.ts'
import { listNotifications, countUnread, markRead, markAllRead, listPreferences, setPreference, notifyTeam } from './notifications.ts'
import { validate, CreateAgentSchema, UpdateAgentSchema, ChatWithAgentSchema, CreateTaskSchema, UpdateTaskSchema, CreateChannelSchema, SendChatMessageSchema, CreateApprovalSchema, ResolveApprovalSchema, CreateSorTableSchema, UpdateSorPermissionSchema, WriteFileSchema, UpdateProviderSchema, InstallSkillSchema, CreateTeamSchema, AddMemberSchema, UpdateRoleSchema } from './validation.ts'

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

  // Rate limiting — general
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
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
    const agent = await getAgent(db, req.params.id)
    if (!agent) return res.status(404).json({ error: 'Agent not found' })
    res.json(agent)
  })

  app.post('/api/agents', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const body = validate(CreateAgentSchema, req.body)

    // Enforce agent count limit in hosted mode
    if (req.subscription) {
      const existing = await listAgents(db, teamId)
      if (existing.length >= req.subscription.maxAgents) {
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
    })

    await logActivity(db, 'agent_created', agent.id, `Agent "${agent.name}" created`, undefined, teamId)
    res.status(201).json(agent)
  })

  app.patch('/api/agents/:id', async (req, res) => {
    const body = validate(UpdateAgentSchema, req.body)
    const agent = await updateAgent(db, req.params.id, body as Record<string, unknown>)
    if (!agent) return res.status(404).json({ error: 'Agent not found' })
    res.json(agent)
  })

  app.delete('/api/agents/:id', async (req, res) => {
    if (!requireRole(req, res, 'admin')) return
    const teamId = req.user!.activeTeamId!
    const agent = await getAgent(db, req.params.id)
    await logActivity(db, 'agent_deleted', req.params.id, `Agent "${agent?.name ?? req.params.id}" deleted`, undefined, teamId)
    await deleteAgent(db, req.params.id)
    unscheduleAgent(req.params.id)
    res.status(204).end()
  })

  // Start/stop agent
  app.post('/api/agents/:id/start', async (req, res) => {
    const teamId = req.user!.activeTeamId!
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
    const agent = await getAgent(db, req.params.id as string)
    if (!agent) return res.status(404).json({ error: 'Agent not found' })

    const body = validate(ChatWithAgentSchema, req.body)

    // Store user message in DM channel
    const dmChannel = await getDmChannel(db, agent.id, teamId)
    await sendMessage(db, dmChannel.id, 'human', 'user', body.message, undefined, teamId)

    const systemPrompt = agent.systemPrompt ?? `You are ${agent.name}, an AI agent. Be helpful and concise.`

    try {
      const modelConfig = await resolveModelConfig(db, agent.modelId || agent.modelEndpoint)
      const result = await runReactLoop(
        db,
        agent.id,
        teamId,
        body.message,
        modelConfig,
        systemPrompt,
        workspaceConfig,
        SKILLS_DIR,
        undefined,
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
    const body = validate(UpdateTaskSchema, req.body)
    const task = await updateTask(db, req.params.id, body as Record<string, unknown>)
    if (!task) return res.status(404).json({ error: 'Task not found' })
    res.json(task)
  })

  app.delete('/api/tasks/:id', async (req, res) => {
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
    const limit = Number(req.query.limit ?? 50)
    const before = req.query.before ? Number(req.query.before) : undefined
    res.json(await getChannelMessages(db, req.params.channelId, limit, before))
  })

  app.post('/api/chat/channels/:channelId/messages', async (req, res) => {
    const teamId = req.user!.activeTeamId!
    const { senderType, senderId, content, taskId } = validate(SendChatMessageSchema, req.body)
    const msg = await sendMessage(db, req.params.channelId, senderType, senderId, content, taskId, teamId)
    res.status(201).json(msg)
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
    const table = await getSorTable(db, req.params.id)
    if (!table) return res.status(404).json({ error: 'Table not found' })
    res.json(await listSorRows(db, table.id))
  })

  app.post('/api/sor/tables/:id/rows', async (req, res) => {
    const table = await getSorTable(db, req.params.id)
    if (!table) return res.status(404).json({ error: 'Table not found' })
    const row = await addSorRow(db, table.id, req.body as Record<string, unknown>)
    res.status(201).json(row)
  })

  app.patch('/api/sor/tables/:tableId/rows/:rowId', async (req, res) => {
    const row = await updateSorRow(db, req.params.rowId, req.body as Record<string, unknown>)
    if (!row) return res.status(404).json({ error: 'Row not found' })
    res.json(row)
  })

  app.delete('/api/sor/tables/:tableId/rows/:rowId', async (req, res) => {
    await deleteSorRow(db, req.params.rowId)
    res.status(204).end()
  })

  app.get('/api/sor/tables/:id/permissions', async (req, res) => {
    res.json(await getSorPermissions(db, req.params.id))
  })

  app.patch('/api/sor/tables/:id/permissions', async (req, res) => {
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
    res.json(skills.map((s) => ({ metadata: s.metadata, filePath: s.filePath })))
  })

  // Per-agent skill install/uninstall
  app.get('/api/agents/:id/skills', async (req, res) => {
    const agent = await getAgent(db, req.params.id)
    if (!agent) return res.status(404).json({ error: 'Agent not found' })
    res.json(await getAgentSkills(db, agent.id))
  })

  app.post('/api/agents/:id/skills', async (req, res) => {
    const agent = await getAgent(db, req.params.id)
    if (!agent) return res.status(404).json({ error: 'Agent not found' })
    const { skillName } = validate(InstallSkillSchema, req.body)
    await installSkill(db, agent.id, skillName)
    res.status(201).json({ agentId: agent.id, skillName, installed: true })
  })

  app.delete('/api/agents/:id/skills/:skillName', async (req, res) => {
    const agent = await getAgent(db, req.params.id)
    if (!agent) return res.status(404).json({ error: 'Agent not found' })
    await uninstallSkill(db, agent.id, req.params.skillName)
    res.status(204).end()
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
    await logActivity(db, 'team_created', null, `Team "${name}" created`)
    res.status(201).json(team)
  })

  app.delete('/api/teams/:id', async (req, res) => {
    // Team routes are exempt from team middleware, so check membership directly
    const team = await getTeam(db, req.params.id)
    if (!team) return res.status(404).json({ error: 'Team not found' })
    await deleteTeam(db, req.params.id)
    res.status(204).end()
  })

  app.get('/api/teams/:id/members', async (req, res) => {
    const team = await getTeam(db, req.params.id)
    if (!team) return res.status(404).json({ error: 'Team not found' })
    res.json(await getTeamMembers(db, team.id))
  })

  app.post('/api/teams/:id/members', async (req, res) => {
    const team = await getTeam(db, req.params.id)
    if (!team) return res.status(404).json({ error: 'Team not found' })
    const { userId, email, role } = validate(AddMemberSchema, req.body)
    const member = await addMember(db, team.id, userId, email, role)
    await logActivity(db, 'member_added', null, `${email} added to team "${team.name}"`)
    res.status(201).json(member)
  })

  app.patch('/api/teams/:id/members/:userId', async (req, res) => {
    const { role } = validate(UpdateRoleSchema, req.body)
    const member = await updateMemberRole(db, req.params.id, req.params.userId, role)
    if (!member) return res.status(404).json({ error: 'Member not found' })
    res.json(member)
  })

  app.delete('/api/teams/:id/members/:userId', async (req, res) => {
    await removeMember(db, req.params.id, req.params.userId)
    res.status(204).end()
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

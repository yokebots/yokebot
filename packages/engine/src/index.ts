/**
 * index.ts — YokeBot Engine entry point
 *
 * Wires everything together and exposes an HTTP API for the dashboard.
 * This is the single process that orchestrates all agents.
 */

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { homedir } from 'os'
import { join } from 'path'
import { createDb } from './state.ts'
import { createAgent, listAgents, getAgent, updateAgent, deleteAgent, setAgentStatus } from './agent.ts'
import { runReactLoop } from './runtime.ts'
import { startScheduler, stopScheduler, scheduleAgent, unscheduleAgent } from './scheduler.ts'
import { createApproval, listPendingApprovals, resolveApproval, countPendingApprovals } from './approval.ts'
import { createTask, listTasks, getTask, updateTask, deleteTask } from './tasks.ts'
import { createChannel, listChannels, getDmChannel, getTaskThread, sendMessage, getChannelMessages } from './chat.ts'
import { initWorkspace, listFiles, readFile, writeFile, type WorkspaceConfig } from './workspace.ts'
import { loadSkillsFromDir, getAgentSkills, installSkill, uninstallSkill } from './skills.ts'
import { logActivity, listActivity, countActivity } from './activity.ts'
import { detectOllama, setFallbackConfig, resolveModelConfig, getAvailableModels, upsertProvider, listStoredProviders, PROVIDERS } from './model.ts'
import { createSorTable, listSorTables, addSorColumn, listSorColumns, addSorRow, listSorRows, updateSorRow, deleteSorRow, getSorPermissions, setSorPermission, getSorTable } from './sor.ts'
import { createTeam, listTeams, getTeam, getUserTeams, addMember, removeMember, getTeamMembers, updateMemberRole, deleteTeam } from './teams.ts'
import { authMiddleware } from './auth-middleware.ts'

const PORT = Number(process.env.YOKEBOT_PORT ?? 3001)
const DATA_DIR = process.env.YOKEBOT_DATA_DIR ?? join(homedir(), '.yokebot')
const WORKSPACE_DIR = process.env.YOKEBOT_WORKSPACE_DIR ?? join(DATA_DIR, 'workspace')
const SKILLS_DIR = process.env.YOKEBOT_SKILLS_DIR ?? join(process.cwd(), '..', '..', 'skills')

// Initialize database
const db = createDb({ dataDir: DATA_DIR })

// Initialize workspace
const workspaceConfig: WorkspaceConfig = { rootDir: WORKSPACE_DIR }
initWorkspace(workspaceConfig)

// Create Express app
const app = express()
app.use(cors())
app.use(express.json())
app.use(authMiddleware)

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

app.get('/api/agents', (_req, res) => {
  res.json(listAgents(db))
})

app.get('/api/agents/:id', (req, res) => {
  const agent = getAgent(db, req.params.id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  res.json(agent)
})

app.post('/api/agents', (req, res) => {
  const body = req.body as {
    name: string
    department?: string
    systemPrompt?: string
    modelEndpoint?: string
    modelName?: string
    proactive?: boolean
    heartbeatSeconds?: number
  }

  const agent = createAgent(db, {
    name: body.name,
    department: body.department,
    systemPrompt: body.systemPrompt,
    modelConfig: {
      endpoint: body.modelEndpoint ?? 'ollama',
      model: body.modelName ?? 'llama3.2',
    },
    proactive: body.proactive,
    heartbeatSeconds: body.heartbeatSeconds,
  })

  logActivity(db, 'agent_created', agent.id, `Agent "${agent.name}" created`)
  res.status(201).json(agent)
})

app.patch('/api/agents/:id', (req, res) => {
  const agent = updateAgent(db, req.params.id, req.body as Record<string, unknown>)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  res.json(agent)
})

app.delete('/api/agents/:id', (req, res) => {
  const agent = getAgent(db, req.params.id)
  logActivity(db, 'agent_deleted', req.params.id, `Agent "${agent?.name ?? req.params.id}" deleted`)
  deleteAgent(db, req.params.id)
  unscheduleAgent(req.params.id)
  res.status(204).end()
})

// Start/stop agent
app.post('/api/agents/:id/start', (req, res) => {
  const agent = getAgent(db, req.params.id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  setAgentStatus(db, agent.id, 'running')
  scheduleAgent(db, { ...agent, status: 'running' })
  logActivity(db, 'agent_started', agent.id, `Agent "${agent.name}" started`)
  res.json({ ...agent, status: 'running' })
})

app.post('/api/agents/:id/stop', (req, res) => {
  const agent = getAgent(db, req.params.id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  setAgentStatus(db, agent.id, 'stopped')
  unscheduleAgent(agent.id)
  logActivity(db, 'agent_stopped', agent.id, `Agent "${agent.name}" stopped`)
  res.json({ ...agent, status: 'stopped' })
})

// ===== Chat with Agent (ReAct loop) =====

app.post('/api/agents/:id/chat', async (req, res) => {
  const agent = getAgent(db, req.params.id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })

  const { message } = req.body as { message: string }
  if (!message) return res.status(400).json({ error: 'Message is required' })

  // Store user message in DM channel
  const dmChannel = getDmChannel(db, agent.id)
  sendMessage(db, dmChannel.id, 'human', 'user', message)

  const systemPrompt = agent.systemPrompt ?? `You are ${agent.name}, an AI agent. Be helpful and concise.`

  try {
    const result = await runReactLoop(
      db,
      agent.id,
      message,
      resolveModelConfig(db, agent.modelEndpoint, agent.modelName),
      systemPrompt,
      workspaceConfig,
      SKILLS_DIR,
    )

    // Store agent response in DM channel
    if (result.response) {
      sendMessage(db, dmChannel.id, 'agent', agent.id, result.response)
    }

    res.json(result)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(502).json({ error: `Model unavailable: ${errorMsg}` })
  }
})

// ===== Approvals =====

app.get('/api/approvals', (_req, res) => {
  res.json(listPendingApprovals(db))
})

app.get('/api/approvals/count', (_req, res) => {
  res.json({ count: countPendingApprovals(db) })
})

app.post('/api/approvals', (req, res) => {
  const body = req.body as { agentId: string; actionType: string; actionDetail: string; riskLevel: string }
  const approval = createApproval(db, body.agentId, body.actionType, body.actionDetail, body.riskLevel as 'low' | 'medium' | 'high' | 'critical')
  res.status(201).json(approval)
})

app.post('/api/approvals/:id/resolve', (req, res) => {
  const { status } = req.body as { status: 'approved' | 'rejected' }
  const approval = resolveApproval(db, req.params.id, status)
  if (!approval) return res.status(404).json({ error: 'Approval not found' })
  logActivity(db, 'approval_resolved', approval.agentId, `Approval ${status}: ${approval.actionType} — ${approval.actionDetail.slice(0, 100)}`, { approvalId: approval.id, status })
  res.json(approval)
})

// ===== Tasks (Mission Control) =====

app.get('/api/tasks', (req, res) => {
  const filters: Record<string, unknown> = {}
  if (req.query.status) filters.status = req.query.status
  if (req.query.agentId) filters.agentId = req.query.agentId
  if (req.query.parentId === 'null') filters.parentId = null
  else if (req.query.parentId) filters.parentId = req.query.parentId
  res.json(listTasks(db, filters as Parameters<typeof listTasks>[1]))
})

app.get('/api/tasks/:id', (req, res) => {
  const task = getTask(db, req.params.id)
  if (!task) return res.status(404).json({ error: 'Task not found' })
  res.json(task)
})

app.post('/api/tasks', (req, res) => {
  const body = req.body as { title: string; description?: string; priority?: string; assignedAgentId?: string; parentTaskId?: string; deadline?: string }
  const task = createTask(db, body.title, body)
  res.status(201).json(task)
})

app.patch('/api/tasks/:id', (req, res) => {
  const task = updateTask(db, req.params.id, req.body as Record<string, unknown>)
  if (!task) return res.status(404).json({ error: 'Task not found' })
  res.json(task)
})

app.delete('/api/tasks/:id', (req, res) => {
  deleteTask(db, req.params.id)
  res.status(204).end()
})

// ===== Chat =====

app.get('/api/chat/channels', (_req, res) => {
  res.json(listChannels(db))
})

app.post('/api/chat/channels', (req, res) => {
  const { name, type } = req.body as { name: string; type: string }
  const channel = createChannel(db, name, type as 'dm' | 'group' | 'task_thread')
  res.status(201).json(channel)
})

app.get('/api/chat/dm/:agentId', (req, res) => {
  const channel = getDmChannel(db, req.params.agentId)
  res.json(channel)
})

app.get('/api/chat/task/:taskId', (req, res) => {
  const channel = getTaskThread(db, req.params.taskId)
  res.json(channel)
})

app.get('/api/chat/channels/:channelId/messages', (req, res) => {
  const limit = Number(req.query.limit ?? 50)
  const before = req.query.before ? Number(req.query.before) : undefined
  res.json(getChannelMessages(db, req.params.channelId, limit, before))
})

app.post('/api/chat/channels/:channelId/messages', (req, res) => {
  const { senderType, senderId, content, taskId } = req.body as { senderType: string; senderId: string; content: string; taskId?: string }
  const msg = sendMessage(db, req.params.channelId, senderType as 'human' | 'agent' | 'system', senderId, content, taskId)
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
  const { path, content, agentId } = req.body as { path: string; content: string; agentId: string }
  const result = writeFile(workspaceConfig, path, content, agentId)
  if (!result.success) return res.status(423).json({ error: result.error })
  res.json({ success: true })
})

// ===== Source of Record =====

app.get('/api/sor/tables', (_req, res) => {
  const tables = listSorTables(db)
  // Include row counts
  const result = tables.map((t) => ({ ...t, rowCount: listSorRows(db, t.id).length, columns: listSorColumns(db, t.id) }))
  res.json(result)
})

app.post('/api/sor/tables', (req, res) => {
  const { name, columns } = req.body as { name: string; columns?: Array<{ name: string; colType?: string }> }
  const table = createSorTable(db, name)
  if (columns) {
    for (const col of columns) addSorColumn(db, table.id, col.name, col.colType)
  }
  res.status(201).json({ ...table, columns: listSorColumns(db, table.id) })
})

app.get('/api/sor/tables/:id/rows', (req, res) => {
  const table = getSorTable(db, req.params.id)
  if (!table) return res.status(404).json({ error: 'Table not found' })
  res.json(listSorRows(db, table.id))
})

app.post('/api/sor/tables/:id/rows', (req, res) => {
  const table = getSorTable(db, req.params.id)
  if (!table) return res.status(404).json({ error: 'Table not found' })
  const row = addSorRow(db, table.id, req.body as Record<string, unknown>)
  res.status(201).json(row)
})

app.patch('/api/sor/tables/:tableId/rows/:rowId', (req, res) => {
  const row = updateSorRow(db, req.params.rowId, req.body as Record<string, unknown>)
  if (!row) return res.status(404).json({ error: 'Row not found' })
  res.json(row)
})

app.delete('/api/sor/tables/:tableId/rows/:rowId', (req, res) => {
  deleteSorRow(db, req.params.rowId)
  res.status(204).end()
})

app.get('/api/sor/tables/:id/permissions', (req, res) => {
  res.json(getSorPermissions(db, req.params.id))
})

app.patch('/api/sor/tables/:id/permissions', (req, res) => {
  const { agentId, canRead, canWrite } = req.body as { agentId: string; canRead: boolean; canWrite: boolean }
  setSorPermission(db, agentId, req.params.id, canRead, canWrite)
  res.json(getSorPermissions(db, req.params.id))
})

// ===== Model Providers =====

app.get('/api/models', async (_req, res) => {
  const models = await getAvailableModels(db)
  res.json(models)
})

app.get('/api/models/providers', (_req, res) => {
  const stored = listStoredProviders(db)
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

app.patch('/api/models/providers/:id', (req, res) => {
  const provider = PROVIDERS.find((p) => p.id === req.params.id)
  if (!provider) return res.status(404).json({ error: 'Unknown provider' })
  const { apiKey, enabled } = req.body as { apiKey?: string; enabled?: boolean }
  const stored = listStoredProviders(db).find((s) => s.id === req.params.id)
  upsertProvider(db, req.params.id, apiKey ?? stored?.apiKey ?? '', enabled ?? stored?.enabled ?? false)
  res.json({ id: req.params.id, enabled: enabled ?? stored?.enabled ?? false, hasKey: (apiKey ?? stored?.apiKey ?? '').length > 0 })
})

// ===== Skills =====

// ===== Activity Log =====

app.get('/api/activity', (req, res) => {
  const filters: { agentId?: string; eventType?: string; limit?: number; before?: number } = {}
  if (req.query.agentId) filters.agentId = req.query.agentId as string
  if (req.query.eventType) filters.eventType = req.query.eventType as string
  if (req.query.limit) filters.limit = Number(req.query.limit)
  if (req.query.before) filters.before = Number(req.query.before)
  res.json(listActivity(db, filters))
})

app.get('/api/activity/count', (req, res) => {
  const agentId = req.query.agentId as string | undefined
  res.json({ count: countActivity(db, agentId) })
})

// ===== Skills =====

app.get('/api/skills', (_req, res) => {
  const skills = loadSkillsFromDir(SKILLS_DIR)
  res.json(skills.map((s) => ({ metadata: s.metadata, filePath: s.filePath })))
})

// Per-agent skill install/uninstall
app.get('/api/agents/:id/skills', (req, res) => {
  const agent = getAgent(db, req.params.id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  res.json(getAgentSkills(db, agent.id))
})

app.post('/api/agents/:id/skills', (req, res) => {
  const agent = getAgent(db, req.params.id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  const { skillName } = req.body as { skillName: string }
  if (!skillName) return res.status(400).json({ error: 'skillName is required' })
  installSkill(db, agent.id, skillName)
  res.status(201).json({ agentId: agent.id, skillName, installed: true })
})

app.delete('/api/agents/:id/skills/:skillName', (req, res) => {
  const agent = getAgent(db, req.params.id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  uninstallSkill(db, agent.id, req.params.skillName)
  res.status(204).end()
})

// ===== Teams =====

app.get('/api/teams', (req, res) => {
  if (req.user?.id) {
    res.json(getUserTeams(db, req.user.id))
  } else {
    res.json(listTeams(db))
  }
})

app.post('/api/teams', (req, res) => {
  const { name } = req.body as { name: string }
  if (!name) return res.status(400).json({ error: 'name is required' })
  const team = createTeam(db, name)
  // Auto-add creator as admin
  if (req.user?.id) {
    addMember(db, team.id, req.user.id, req.user.email, 'admin')
  }
  logActivity(db, 'team_created', null, `Team "${name}" created`)
  res.status(201).json(team)
})

app.delete('/api/teams/:id', (req, res) => {
  const team = getTeam(db, req.params.id)
  if (!team) return res.status(404).json({ error: 'Team not found' })
  deleteTeam(db, req.params.id)
  res.status(204).end()
})

app.get('/api/teams/:id/members', (req, res) => {
  const team = getTeam(db, req.params.id)
  if (!team) return res.status(404).json({ error: 'Team not found' })
  res.json(getTeamMembers(db, team.id))
})

app.post('/api/teams/:id/members', (req, res) => {
  const team = getTeam(db, req.params.id)
  if (!team) return res.status(404).json({ error: 'Team not found' })
  const { userId, email, role } = req.body as { userId: string; email: string; role?: string }
  if (!userId || !email) return res.status(400).json({ error: 'userId and email are required' })
  const member = addMember(db, team.id, userId, email, role)
  logActivity(db, 'member_added', null, `${email} added to team "${team.name}"`)
  res.status(201).json(member)
})

app.patch('/api/teams/:id/members/:userId', (req, res) => {
  const { role } = req.body as { role: string }
  if (!role) return res.status(400).json({ error: 'role is required' })
  const member = updateMemberRole(db, req.params.id, req.params.userId, role)
  if (!member) return res.status(404).json({ error: 'Member not found' })
  res.json(member)
})

app.delete('/api/teams/:id/members/:userId', (req, res) => {
  removeMember(db, req.params.id, req.params.userId)
  res.status(204).end()
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
  startScheduler(db, workspaceConfig, SKILLS_DIR)
})

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[engine] Shutting down...')
  stopScheduler()
  db.close()
  process.exit(0)
})

process.on('SIGTERM', () => {
  stopScheduler()
  db.close()
  process.exit(0)
})

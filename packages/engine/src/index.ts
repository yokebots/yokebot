/**
 * index.ts — YokeBot Engine entry point
 *
 * Wires everything together and exposes an HTTP API for the dashboard.
 * This is the single process that orchestrates all agents.
 */

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
import { loadSkillsFromDir } from './skills.ts'
import { detectOllama } from './model.ts'

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
      endpoint: body.modelEndpoint ?? 'http://localhost:11434/v1',
      model: body.modelName ?? 'llama3.2',
    },
    proactive: body.proactive,
    heartbeatSeconds: body.heartbeatSeconds,
  })

  res.status(201).json(agent)
})

app.patch('/api/agents/:id', (req, res) => {
  const agent = updateAgent(db, req.params.id, req.body as Record<string, unknown>)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  res.json(agent)
})

app.delete('/api/agents/:id', (req, res) => {
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
  res.json({ ...agent, status: 'running' })
})

app.post('/api/agents/:id/stop', (req, res) => {
  const agent = getAgent(db, req.params.id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  setAgentStatus(db, agent.id, 'stopped')
  unscheduleAgent(agent.id)
  res.json({ ...agent, status: 'stopped' })
})

// ===== Chat with Agent (ReAct loop) =====

app.post('/api/agents/:id/chat', async (req, res) => {
  const agent = getAgent(db, req.params.id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })

  const { message } = req.body as { message: string }
  if (!message) return res.status(400).json({ error: 'Message is required' })

  const systemPrompt = agent.systemPrompt ?? `You are ${agent.name}, an AI agent. Be helpful and concise.`

  const result = await runReactLoop(
    db,
    agent.id,
    message,
    { endpoint: agent.modelEndpoint, model: agent.modelName },
    systemPrompt,
  )

  res.json(result)
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

// ===== Skills =====

app.get('/api/skills', (_req, res) => {
  const skills = loadSkillsFromDir(SKILLS_DIR)
  res.json(skills.map((s) => ({ metadata: s.metadata, filePath: s.filePath })))
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

  // Start the scheduler for running agents
  startScheduler(db)
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

/**
 * agent.ts — Agent lifecycle: create, start, pause, stop, destroy
 */

import type { Db } from './db/types.ts'
import { randomUUID } from 'crypto'
import type { ModelConfig } from './model.ts'

export interface AgentConfig {
  name: string
  department?: string
  iconName?: string
  iconColor?: string
  systemPrompt?: string
  modelId?: string
  modelConfig: ModelConfig
  proactive?: boolean
  heartbeatSeconds?: number
  activeHoursStart?: number
  activeHoursEnd?: number
  templateId?: string
}

export type AgentStatus = 'running' | 'paused' | 'stopped' | 'error'

export interface Agent {
  id: string
  teamId: string
  name: string
  status: AgentStatus
  department: string | null
  iconName: string | null
  iconColor: string | null
  modelId: string
  modelEndpoint: string
  modelName: string
  systemPrompt: string | null
  proactive: boolean
  heartbeatSeconds: number
  activeHoursStart: number
  activeHoursEnd: number
  templateId: string | null
  createdAt: string
  updatedAt: string
}

// ---- CRUD ----

export async function createAgent(db: Db, teamId: string, config: AgentConfig): Promise<Agent> {
  const id = randomUUID()
  const now = new Date().toISOString()

  await db.run(
    `INSERT INTO agents (id, team_id, name, department, icon_name, icon_color,
      model_id, model_endpoint, model_name, system_prompt, proactive,
      heartbeat_seconds, active_hours_start, active_hours_end, template_id,
      created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      id, teamId, config.name, config.department ?? null, config.iconName ?? null, config.iconColor ?? null,
      config.modelId ?? null, config.modelConfig.endpoint, config.modelConfig.model,
      config.systemPrompt ?? null, config.proactive ? 1 : 0, config.heartbeatSeconds ?? 3600,
      config.activeHoursStart ?? 9, config.activeHoursEnd ?? 17, config.templateId ?? null, now, now,
    ],
  )

  return (await getAgent(db, id))!
}

export async function getAgent(db: Db, id: string): Promise<Agent | null> {
  const row = await db.queryOne<Record<string, unknown>>('SELECT * FROM agents WHERE id = $1', [id])
  if (!row) return null
  return rowToAgent(row)
}

export async function listAgents(db: Db, teamId?: string): Promise<Agent[]> {
  if (teamId) {
    const rows = await db.query<Record<string, unknown>>('SELECT * FROM agents WHERE team_id = $1 ORDER BY created_at DESC', [teamId])
    return rows.map(rowToAgent)
  }
  const rows = await db.query<Record<string, unknown>>('SELECT * FROM agents ORDER BY created_at DESC')
  return rows.map(rowToAgent)
}

export async function updateAgent(
  db: Db,
  id: string,
  updates: Partial<Pick<AgentConfig, 'name' | 'department' | 'systemPrompt' | 'proactive' | 'heartbeatSeconds'>> & { modelId?: string; modelEndpoint?: string; modelName?: string },
): Promise<Agent | null> {
  const fields: string[] = []
  const values: unknown[] = []
  let paramIdx = 1

  if (updates.name !== undefined) { fields.push(`name = $${paramIdx++}`); values.push(updates.name) }
  if (updates.department !== undefined) { fields.push(`department = $${paramIdx++}`); values.push(updates.department) }
  if (updates.systemPrompt !== undefined) { fields.push(`system_prompt = $${paramIdx++}`); values.push(updates.systemPrompt) }
  if (updates.proactive !== undefined) { fields.push(`proactive = $${paramIdx++}`); values.push(updates.proactive ? 1 : 0) }
  if (updates.heartbeatSeconds !== undefined) { fields.push(`heartbeat_seconds = $${paramIdx++}`); values.push(updates.heartbeatSeconds) }
  if (updates.modelId !== undefined) { fields.push(`model_id = $${paramIdx++}`); values.push(updates.modelId) }
  if (updates.modelEndpoint !== undefined) { fields.push(`model_endpoint = $${paramIdx++}`); values.push(updates.modelEndpoint) }
  if (updates.modelName !== undefined) { fields.push(`model_name = $${paramIdx++}`); values.push(updates.modelName) }

  if (fields.length === 0) return getAgent(db, id)

  fields.push(`updated_at = ${db.now()}`)
  values.push(id)

  await db.run(`UPDATE agents SET ${fields.join(', ')} WHERE id = $${paramIdx}`, values)
  return getAgent(db, id)
}

export async function setAgentStatus(db: Db, id: string, status: AgentStatus): Promise<void> {
  await db.run(`UPDATE agents SET status = $1, updated_at = ${db.now()} WHERE id = $2`, [status, id])
}

export async function deleteAgent(db: Db, id: string): Promise<void> {
  await db.run('DELETE FROM agents WHERE id = $1', [id])
}

// ---- Conversation history ----

export async function addMessage(db: Db, agentId: string, role: string, content: string, teamId = ''): Promise<void> {
  await db.run(
    'INSERT INTO messages (team_id, agent_id, role, content) VALUES ($1, $2, $3, $4)',
    [teamId, agentId, role, content],
  )
}

export async function getMessages(db: Db, agentId: string, limit = 50): Promise<Array<{ role: string; content: string; created_at: string }>> {
  const rows = await db.query<{ role: string; content: string; created_at: string }>(
    'SELECT role, content, created_at FROM messages WHERE agent_id = $1 ORDER BY created_at DESC LIMIT $2',
    [agentId, limit],
  )
  return rows.reverse()
}

// ---- Helpers ----

function rowToAgent(row: Record<string, unknown>): Agent {
  return {
    id: row.id as string,
    teamId: (row.team_id as string) ?? '',
    name: row.name as string,
    status: row.status as AgentStatus,
    department: row.department as string | null,
    iconName: row.icon_name as string | null,
    iconColor: row.icon_color as string | null,
    modelId: (row.model_id as string) ?? '',
    modelEndpoint: row.model_endpoint as string,
    modelName: row.model_name as string,
    systemPrompt: row.system_prompt as string | null,
    proactive: row.proactive === 1,
    heartbeatSeconds: row.heartbeat_seconds as number,
    activeHoursStart: row.active_hours_start as number,
    activeHoursEnd: row.active_hours_end as number,
    templateId: (row.template_id as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

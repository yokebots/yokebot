/**
 * agent.ts — Agent lifecycle: create, start, pause, stop, destroy
 *
 * An agent is a persistent AI worker with a name, role, model config,
 * system prompt, and skills. Agents run in the ReAct loop (runtime.ts)
 * and are orchestrated by the scheduler (scheduler.ts).
 */

import type Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import type { ModelConfig } from './model.ts'

export interface AgentConfig {
  name: string
  department?: string
  iconName?: string
  iconColor?: string
  systemPrompt?: string
  modelConfig: ModelConfig
  proactive?: boolean
  heartbeatSeconds?: number
  activeHoursStart?: number
  activeHoursEnd?: number
}

export type AgentStatus = 'running' | 'paused' | 'stopped' | 'error'

export interface Agent {
  id: string
  name: string
  status: AgentStatus
  department: string | null
  iconName: string | null
  iconColor: string | null
  modelEndpoint: string
  modelName: string
  systemPrompt: string | null
  proactive: boolean
  heartbeatSeconds: number
  activeHoursStart: number
  activeHoursEnd: number
  createdAt: string
  updatedAt: string
}

// ---- CRUD ----

export function createAgent(db: Database.Database, config: AgentConfig): Agent {
  const id = randomUUID()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO agents (id, name, department, icon_name, icon_color,
      model_endpoint, model_name, system_prompt, proactive,
      heartbeat_seconds, active_hours_start, active_hours_end,
      created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    config.name,
    config.department ?? null,
    config.iconName ?? null,
    config.iconColor ?? null,
    config.modelConfig.endpoint,
    config.modelConfig.model,
    config.systemPrompt ?? null,
    config.proactive ? 1 : 0,
    config.heartbeatSeconds ?? 3600,
    config.activeHoursStart ?? 9,
    config.activeHoursEnd ?? 17,
    now,
    now,
  )

  return getAgent(db, id)!
}

export function getAgent(db: Database.Database, id: string): Agent | null {
  const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!row) return null
  return rowToAgent(row)
}

export function listAgents(db: Database.Database): Agent[] {
  const rows = db.prepare('SELECT * FROM agents ORDER BY created_at DESC').all() as Record<string, unknown>[]
  return rows.map(rowToAgent)
}

export function updateAgent(
  db: Database.Database,
  id: string,
  updates: Partial<Pick<AgentConfig, 'name' | 'department' | 'systemPrompt' | 'proactive' | 'heartbeatSeconds'>> & { modelEndpoint?: string; modelName?: string },
): Agent | null {
  const fields: string[] = []
  const values: unknown[] = []

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
  if (updates.department !== undefined) { fields.push('department = ?'); values.push(updates.department) }
  if (updates.systemPrompt !== undefined) { fields.push('system_prompt = ?'); values.push(updates.systemPrompt) }
  if (updates.proactive !== undefined) { fields.push('proactive = ?'); values.push(updates.proactive ? 1 : 0) }
  if (updates.heartbeatSeconds !== undefined) { fields.push('heartbeat_seconds = ?'); values.push(updates.heartbeatSeconds) }
  if (updates.modelEndpoint !== undefined) { fields.push('model_endpoint = ?'); values.push(updates.modelEndpoint) }
  if (updates.modelName !== undefined) { fields.push('model_name = ?'); values.push(updates.modelName) }

  if (fields.length === 0) return getAgent(db, id)

  fields.push("updated_at = datetime('now')")
  values.push(id)

  db.prepare(`UPDATE agents SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  return getAgent(db, id)
}

export function setAgentStatus(db: Database.Database, id: string, status: AgentStatus): void {
  db.prepare("UPDATE agents SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id)
}

export function deleteAgent(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM agents WHERE id = ?').run(id)
}

// ---- Conversation history ----

export function addMessage(
  db: Database.Database,
  agentId: string,
  role: string,
  content: string,
): void {
  db.prepare(
    'INSERT INTO messages (agent_id, role, content) VALUES (?, ?, ?)',
  ).run(agentId, role, content)
}

export function getMessages(
  db: Database.Database,
  agentId: string,
  limit = 50,
): Array<{ role: string; content: string; created_at: string }> {
  return db.prepare(
    'SELECT role, content, created_at FROM messages WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?',
  ).all(agentId, limit).reverse() as Array<{ role: string; content: string; created_at: string }>
}

// ---- Helpers ----

function rowToAgent(row: Record<string, unknown>): Agent {
  return {
    id: row.id as string,
    name: row.name as string,
    status: row.status as AgentStatus,
    department: row.department as string | null,
    iconName: row.icon_name as string | null,
    iconColor: row.icon_color as string | null,
    modelEndpoint: row.model_endpoint as string,
    modelName: row.model_name as string,
    systemPrompt: row.system_prompt as string | null,
    proactive: row.proactive === 1,
    heartbeatSeconds: row.heartbeat_seconds as number,
    activeHoursStart: row.active_hours_start as number,
    activeHoursEnd: row.active_hours_end as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

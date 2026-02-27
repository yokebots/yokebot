/**
 * activity.ts — Activity / audit log
 *
 * Persists a timeline of events: agent lifecycle, tool executions,
 * task changes, approval decisions, and proactive heartbeats.
 */

import type { Db } from './db/types.ts'

export interface ActivityEntry {
  id: number
  eventType: string
  agentId: string | null
  description: string
  details: string | null
  createdAt: string
}

export async function logActivity(
  db: Db,
  eventType: string,
  agentId: string | null,
  description: string,
  details?: Record<string, unknown>,
  teamId = '',
): Promise<void> {
  await db.run(
    'INSERT INTO activity_log (team_id, event_type, agent_id, description, details) VALUES ($1, $2, $3, $4, $5)',
    [teamId, eventType, agentId, description, details ? JSON.stringify(details) : null],
  )
}

export async function listActivity(
  db: Db,
  filters?: { agentId?: string; eventType?: string; limit?: number; before?: number; teamId?: string },
): Promise<ActivityEntry[]> {
  const clauses: string[] = []
  const params: unknown[] = []
  let paramIdx = 1

  if (filters?.teamId) { clauses.push(`team_id = $${paramIdx++}`); params.push(filters.teamId) }
  if (filters?.agentId) { clauses.push(`agent_id = $${paramIdx++}`); params.push(filters.agentId) }
  if (filters?.eventType) { clauses.push(`event_type = $${paramIdx++}`); params.push(filters.eventType) }
  if (filters?.before) { clauses.push(`id < $${paramIdx++}`); params.push(filters.before) }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const limit = filters?.limit ?? 100
  params.push(limit)

  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM activity_log ${where} ORDER BY created_at DESC, id DESC LIMIT $${paramIdx}`,
    params,
  )

  return rows.map((r) => ({
    id: r.id as number,
    eventType: r.event_type as string,
    agentId: r.agent_id as string | null,
    description: r.description as string,
    details: r.details as string | null,
    createdAt: r.created_at as string,
  }))
}

export async function countActivity(db: Db, agentId?: string, teamId?: string): Promise<number> {
  let sql = 'SELECT COUNT(*) as count FROM activity_log WHERE 1=1'
  const params: unknown[] = []
  let paramIdx = 1
  if (teamId) { sql += ` AND team_id = $${paramIdx++}`; params.push(teamId) }
  if (agentId) { sql += ` AND agent_id = $${paramIdx++}`; params.push(agentId) }
  const row = await db.queryOne<{ count: number }>(sql, params)
  return row?.count ?? 0
}

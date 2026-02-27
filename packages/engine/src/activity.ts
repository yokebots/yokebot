/**
 * activity.ts — Activity / audit log
 *
 * Persists a timeline of events: agent lifecycle, tool executions,
 * task changes, approval decisions, and proactive heartbeats.
 */

import type Database from 'better-sqlite3'

export interface ActivityEntry {
  id: number
  eventType: string
  agentId: string | null
  description: string
  details: string | null
  createdAt: string
}

export function logActivity(
  db: Database.Database,
  eventType: string,
  agentId: string | null,
  description: string,
  details?: Record<string, unknown>,
): void {
  db.prepare(
    'INSERT INTO activity_log (event_type, agent_id, description, details) VALUES (?, ?, ?, ?)',
  ).run(eventType, agentId, description, details ? JSON.stringify(details) : null)
}

export function listActivity(
  db: Database.Database,
  filters?: { agentId?: string; eventType?: string; limit?: number; before?: number },
): ActivityEntry[] {
  const clauses: string[] = []
  const params: unknown[] = []

  if (filters?.agentId) { clauses.push('agent_id = ?'); params.push(filters.agentId) }
  if (filters?.eventType) { clauses.push('event_type = ?'); params.push(filters.eventType) }
  if (filters?.before) { clauses.push('id < ?'); params.push(filters.before) }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const limit = filters?.limit ?? 100

  const rows = db.prepare(
    `SELECT * FROM activity_log ${where} ORDER BY created_at DESC, id DESC LIMIT ?`,
  ).all(...params, limit) as Array<Record<string, unknown>>

  return rows.map((r) => ({
    id: r.id as number,
    eventType: r.event_type as string,
    agentId: r.agent_id as string | null,
    description: r.description as string,
    details: r.details as string | null,
    createdAt: r.created_at as string,
  }))
}

export function countActivity(db: Database.Database, agentId?: string): number {
  if (agentId) {
    const row = db.prepare('SELECT COUNT(*) as count FROM activity_log WHERE agent_id = ?').get(agentId) as { count: number }
    return row.count
  }
  const row = db.prepare('SELECT COUNT(*) as count FROM activity_log').get() as { count: number }
  return row.count
}

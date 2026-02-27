/**
 * approval.ts — Approval queue / human-in-the-loop for risky actions
 *
 * Agents cannot take high-risk actions without human approval.
 * Actions are tagged with risk levels. High/critical actions queue
 * for review. The dashboard shows pending approvals with approve/reject.
 */

import type { Db } from './db/types.ts'
import { randomUUID } from 'crypto'

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface Approval {
  id: string
  agentId: string
  actionType: string
  actionDetail: string
  riskLevel: RiskLevel
  status: ApprovalStatus
  createdAt: string
  resolvedAt: string | null
}

export function requiresApproval(riskLevel: RiskLevel): boolean {
  return riskLevel === 'high' || riskLevel === 'critical'
}

export async function createApproval(
  db: Db,
  teamId: string,
  agentId: string,
  actionType: string,
  actionDetail: string,
  riskLevel: RiskLevel,
): Promise<Approval> {
  const id = randomUUID()
  await db.run(
    'INSERT INTO approvals (id, team_id, agent_id, action_type, action_detail, risk_level) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, teamId, agentId, actionType, actionDetail, riskLevel],
  )
  return (await getApproval(db, id))!
}

export async function getApproval(db: Db, id: string): Promise<Approval | null> {
  const row = await db.queryOne<Record<string, unknown>>('SELECT * FROM approvals WHERE id = $1', [id])
  if (!row) return null
  return rowToApproval(row)
}

export async function listPendingApprovals(db: Db, teamId?: string, agentId?: string): Promise<Approval[]> {
  let sql = 'SELECT * FROM approvals WHERE status = $1'
  const params: unknown[] = ['pending']
  let paramIdx = 2
  if (teamId) { sql += ` AND team_id = $${paramIdx++}`; params.push(teamId) }
  if (agentId) { sql += ` AND agent_id = $${paramIdx++}`; params.push(agentId) }
  sql += ' ORDER BY created_at DESC'
  const rows = await db.query<Record<string, unknown>>(sql, params)
  return rows.map(rowToApproval)
}

export async function resolveApproval(
  db: Db,
  id: string,
  status: 'approved' | 'rejected',
): Promise<Approval | null> {
  await db.run(
    `UPDATE approvals SET status = $1, resolved_at = ${db.now()} WHERE id = $2`,
    [status, id],
  )
  return getApproval(db, id)
}

export async function countPendingApprovals(db: Db, teamId?: string): Promise<number> {
  if (teamId) {
    const row = await db.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM approvals WHERE status = $1 AND team_id = $2',
      ['pending', teamId],
    )
    return row?.count ?? 0
  }
  const row = await db.queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM approvals WHERE status = $1',
    ['pending'],
  )
  return row?.count ?? 0
}

function rowToApproval(row: Record<string, unknown>): Approval {
  return {
    id: row.id as string,
    agentId: row.agent_id as string,
    actionType: row.action_type as string,
    actionDetail: row.action_detail as string,
    riskLevel: row.risk_level as RiskLevel,
    status: row.status as ApprovalStatus,
    createdAt: row.created_at as string,
    resolvedAt: row.resolved_at as string | null,
  }
}

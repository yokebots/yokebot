/**
 * approval.ts — Approval queue / human-in-the-loop for risky actions
 *
 * Agents cannot take high-risk actions without human approval.
 * Actions are tagged with risk levels. High/critical actions queue
 * for review. The dashboard shows pending approvals with approve/reject.
 */

import type Database from 'better-sqlite3'
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

/**
 * Check if an action requires approval based on its risk level.
 */
export function requiresApproval(riskLevel: RiskLevel): boolean {
  return riskLevel === 'high' || riskLevel === 'critical'
}

/**
 * Create a new approval request.
 */
export function createApproval(
  db: Database.Database,
  agentId: string,
  actionType: string,
  actionDetail: string,
  riskLevel: RiskLevel,
): Approval {
  const id = randomUUID()

  db.prepare(`
    INSERT INTO approvals (id, agent_id, action_type, action_detail, risk_level)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, agentId, actionType, actionDetail, riskLevel)

  return getApproval(db, id)!
}

/**
 * Get a single approval by ID.
 */
export function getApproval(db: Database.Database, id: string): Approval | null {
  const row = db.prepare('SELECT * FROM approvals WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!row) return null
  return rowToApproval(row)
}

/**
 * List pending approvals, optionally filtered by agent.
 */
export function listPendingApprovals(db: Database.Database, agentId?: string): Approval[] {
  if (agentId) {
    const rows = db.prepare(
      'SELECT * FROM approvals WHERE status = ? AND agent_id = ? ORDER BY created_at DESC',
    ).all('pending', agentId) as Record<string, unknown>[]
    return rows.map(rowToApproval)
  }

  const rows = db.prepare(
    'SELECT * FROM approvals WHERE status = ? ORDER BY created_at DESC',
  ).all('pending') as Record<string, unknown>[]
  return rows.map(rowToApproval)
}

/**
 * Resolve an approval (approve or reject).
 */
export function resolveApproval(
  db: Database.Database,
  id: string,
  status: 'approved' | 'rejected',
): Approval | null {
  db.prepare(`
    UPDATE approvals SET status = ?, resolved_at = datetime('now') WHERE id = ?
  `).run(status, id)

  return getApproval(db, id)
}

/**
 * Count pending approvals (for dashboard badge).
 */
export function countPendingApprovals(db: Database.Database): number {
  const row = db.prepare(
    'SELECT COUNT(*) as count FROM approvals WHERE status = ?',
  ).get('pending') as { count: number }
  return row.count
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

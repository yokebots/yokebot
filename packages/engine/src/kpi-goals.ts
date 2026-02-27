/**
 * kpi-goals.ts — KPI Goals: measurable milestones with metric tracking
 *
 * Goals are quantifiable targets like "Reach 100 customers by May 1st"
 * or "Hit $50k MRR by end of 2026". They have a metric, current value,
 * target value, and deadline. Agents use goals as priority context.
 */

import type { Db } from './db/types.ts'
import { randomUUID } from 'crypto'

export type KpiGoalStatus = 'active' | 'achieved' | 'missed' | 'paused'

export interface KpiGoal {
  id: string
  teamId: string
  title: string
  metricName: string
  currentValue: number
  targetValue: number
  unit: string
  deadline: string | null
  status: KpiGoalStatus
  createdBy: string
  createdAt: string
  updatedAt: string
}

// ---- Create ----

export async function createKpiGoal(
  db: Db,
  teamId: string,
  title: string,
  metricName: string,
  targetValue: number,
  opts?: { unit?: string; currentValue?: number; deadline?: string; createdBy?: string },
): Promise<KpiGoal> {
  const id = randomUUID()
  await db.run(
    'INSERT INTO kpi_goals (id, team_id, title, metric_name, current_value, target_value, unit, deadline, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    [id, teamId, title, metricName, opts?.currentValue ?? 0, targetValue, opts?.unit ?? '', opts?.deadline ?? null, opts?.createdBy ?? ''],
  )
  return (await getKpiGoal(db, id))!
}

// ---- Read ----

export async function getKpiGoal(db: Db, id: string): Promise<KpiGoal | null> {
  const row = await db.queryOne<Record<string, unknown>>('SELECT * FROM kpi_goals WHERE id = $1', [id])
  if (!row) return null
  return rowToKpiGoal(row)
}

export async function listKpiGoals(db: Db, teamId: string, status?: KpiGoalStatus): Promise<KpiGoal[]> {
  let sql = 'SELECT * FROM kpi_goals WHERE team_id = $1'
  const params: unknown[] = [teamId]
  if (status) {
    sql += ' AND status = $2'
    params.push(status)
  }
  sql += ' ORDER BY created_at DESC'
  const rows = await db.query<Record<string, unknown>>(sql, params)
  return rows.map(rowToKpiGoal)
}

// ---- Update ----

export async function updateKpiGoal(
  db: Db,
  id: string,
  updates: { title?: string; metricName?: string; currentValue?: number; targetValue?: number; unit?: string; deadline?: string | null; status?: KpiGoalStatus },
): Promise<KpiGoal | null> {
  const existing = await getKpiGoal(db, id)
  if (!existing) return null

  const title = updates.title ?? existing.title
  const metricName = updates.metricName ?? existing.metricName
  const currentValue = updates.currentValue ?? existing.currentValue
  const targetValue = updates.targetValue ?? existing.targetValue
  const unit = updates.unit ?? existing.unit
  const deadline = updates.deadline !== undefined ? updates.deadline : existing.deadline
  const status = updates.status ?? existing.status

  const now = db.driver === 'postgres' ? 'NOW()' : "datetime('now')"
  await db.run(
    `UPDATE kpi_goals SET title = $1, metric_name = $2, current_value = $3, target_value = $4, unit = $5, deadline = $6, status = $7, updated_at = ${now} WHERE id = $8`,
    [title, metricName, currentValue, targetValue, unit, deadline, status, id],
  )

  // Auto-achieve if current >= target
  if (currentValue >= targetValue && status === 'active') {
    await db.run(`UPDATE kpi_goals SET status = 'achieved', updated_at = ${now} WHERE id = $1`, [id])
  }

  return getKpiGoal(db, id)
}

export async function deleteKpiGoal(db: Db, id: string): Promise<void> {
  await db.run('DELETE FROM kpi_goals WHERE id = $1', [id])
}

// ---- Helpers ----

function rowToKpiGoal(row: Record<string, unknown>): KpiGoal {
  return {
    id: row.id as string,
    teamId: row.team_id as string,
    title: row.title as string,
    metricName: row.metric_name as string,
    currentValue: row.current_value as number,
    targetValue: row.target_value as number,
    unit: row.unit as string,
    deadline: row.deadline as string | null,
    status: row.status as KpiGoalStatus,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

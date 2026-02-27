/**
 * goals.ts — Goals CRUD: high-level objectives that tasks roll up into
 *
 * Goals let teams define strategic objectives (e.g., "Launch marketing campaign")
 * and link tasks to them. Progress auto-calculates from linked task completion.
 */

import type { Db } from './db/types.ts'
import { randomUUID } from 'crypto'

export type GoalStatus = 'active' | 'completed' | 'paused' | 'canceled'

export interface Goal {
  id: string
  teamId: string
  title: string
  description: string
  status: GoalStatus
  targetDate: string | null
  progress: number  // 0-100, auto-calculated from linked tasks
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface GoalWithTasks extends Goal {
  taskCount: number
  completedTaskCount: number
  taskIds: string[]
}

// ---- Create ----

export async function createGoal(
  db: Db,
  teamId: string,
  title: string,
  opts?: { description?: string; targetDate?: string; createdBy?: string },
): Promise<Goal> {
  const id = randomUUID()
  await db.run(
    'INSERT INTO goals (id, team_id, title, description, target_date, created_by) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, teamId, title, opts?.description ?? '', opts?.targetDate ?? null, opts?.createdBy ?? ''],
  )
  return (await getGoal(db, id))!
}

// ---- Read ----

export async function getGoal(db: Db, id: string): Promise<Goal | null> {
  const row = await db.queryOne<Record<string, unknown>>('SELECT * FROM goals WHERE id = $1', [id])
  if (!row) return null
  return rowToGoal(row)
}

export async function listGoals(db: Db, teamId: string, status?: GoalStatus): Promise<GoalWithTasks[]> {
  let sql = 'SELECT * FROM goals WHERE team_id = $1'
  const params: unknown[] = [teamId]
  if (status) {
    sql += ' AND status = $2'
    params.push(status)
  }
  sql += ' ORDER BY created_at DESC'

  const rows = await db.query<Record<string, unknown>>(sql, params)
  const goals: GoalWithTasks[] = []

  for (const row of rows) {
    const goal = rowToGoal(row)
    const counts = await getTaskCounts(db, goal.id)
    const taskIds = await getGoalTasks(db, goal.id)
    goals.push({ ...goal, ...counts, taskIds })
  }

  return goals
}

// ---- Update ----

export async function updateGoal(
  db: Db,
  id: string,
  updates: { title?: string; description?: string; status?: GoalStatus; targetDate?: string | null },
): Promise<Goal | null> {
  const existing = await getGoal(db, id)
  if (!existing) return null

  const title = updates.title ?? existing.title
  const description = updates.description ?? existing.description
  const status = updates.status ?? existing.status
  const targetDate = updates.targetDate !== undefined ? updates.targetDate : existing.targetDate

  const now = db.driver === 'postgres' ? 'NOW()' : "datetime('now')"
  await db.run(
    `UPDATE goals SET title = $1, description = $2, status = $3, target_date = $4, updated_at = ${now} WHERE id = $5`,
    [title, description, status, targetDate, id],
  )

  return getGoal(db, id)
}

export async function deleteGoal(db: Db, id: string): Promise<void> {
  await db.run('DELETE FROM goal_tasks WHERE goal_id = $1', [id])
  await db.run('DELETE FROM goals WHERE id = $1', [id])
}

// ---- Task linking ----

export async function linkTask(db: Db, goalId: string, taskId: string): Promise<void> {
  if (db.driver === 'postgres') {
    await db.run(
      'INSERT INTO goal_tasks (goal_id, task_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [goalId, taskId],
    )
  } else {
    await db.run(
      'INSERT OR IGNORE INTO goal_tasks (goal_id, task_id) VALUES ($1, $2)',
      [goalId, taskId],
    )
  }
  await recalcProgress(db, goalId)
}

export async function unlinkTask(db: Db, goalId: string, taskId: string): Promise<void> {
  await db.run('DELETE FROM goal_tasks WHERE goal_id = $1 AND task_id = $2', [goalId, taskId])
  await recalcProgress(db, goalId)
}

export async function getGoalTasks(db: Db, goalId: string): Promise<string[]> {
  const rows = await db.query<{ task_id: string }>('SELECT task_id FROM goal_tasks WHERE goal_id = $1', [goalId])
  return rows.map((r) => r.task_id)
}

export async function getTaskGoals(db: Db, taskId: string): Promise<Goal[]> {
  const rows = await db.query<Record<string, unknown>>(
    'SELECT g.* FROM goals g JOIN goal_tasks gt ON gt.goal_id = g.id WHERE gt.task_id = $1',
    [taskId],
  )
  return rows.map(rowToGoal)
}

// ---- Progress calculation ----

async function recalcProgress(db: Db, goalId: string): Promise<void> {
  const counts = await getTaskCounts(db, goalId)
  const progress = counts.taskCount === 0 ? 0 : Math.round((counts.completedTaskCount / counts.taskCount) * 100)
  const now = db.driver === 'postgres' ? 'NOW()' : "datetime('now')"
  await db.run(`UPDATE goals SET progress = $1, updated_at = ${now} WHERE id = $2`, [progress, goalId])
}

async function getTaskCounts(db: Db, goalId: string): Promise<{ taskCount: number; completedTaskCount: number }> {
  const total = await db.queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM goal_tasks WHERE goal_id = $1',
    [goalId],
  )
  const completed = await db.queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM goal_tasks gt JOIN tasks t ON t.id = gt.task_id WHERE gt.goal_id = $1 AND t.status = 'done'`,
    [goalId],
  )
  return { taskCount: total?.count ?? 0, completedTaskCount: completed?.count ?? 0 }
}

// ---- Helpers ----

function rowToGoal(row: Record<string, unknown>): Goal {
  return {
    id: row.id as string,
    teamId: row.team_id as string,
    title: row.title as string,
    description: row.description as string,
    status: row.status as GoalStatus,
    targetDate: row.target_date as string | null,
    progress: row.progress as number,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

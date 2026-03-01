/**
 * tasks.ts — Shared task board (Mission Control)
 */

import type { Db } from './db/types.ts'
import { randomUUID } from 'crypto'

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface TaskAttachment {
  name: string; url: string; type: string; size: number
}

export interface Task {
  id: string; title: string; description: string | null; status: TaskStatus; priority: TaskPriority
  assignedAgentId: string | null; parentTaskId: string | null; deadline: string | null
  headerImage: string | null; attachments: TaskAttachment[]
  createdAt: string; updatedAt: string
}

export async function createTask(db: Db, teamId: string, title: string, opts?: {
  description?: string; priority?: TaskPriority; assignedAgentId?: string; parentTaskId?: string; deadline?: string
}): Promise<Task> {
  const id = randomUUID()
  await db.run(
    'INSERT INTO tasks (id, team_id, title, description, priority, assigned_agent_id, parent_task_id, deadline) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
    [id, teamId, title, opts?.description ?? null, opts?.priority ?? 'medium', opts?.assignedAgentId ?? null, opts?.parentTaskId ?? null, opts?.deadline ?? null],
  )
  return (await getTask(db, id))!
}

export async function getTask(db: Db, id: string): Promise<Task | null> {
  const row = await db.queryOne<Record<string, unknown>>('SELECT * FROM tasks WHERE id = $1', [id])
  if (!row) return null
  return rowToTask(row)
}

export async function listTasks(db: Db, filters?: { status?: TaskStatus; agentId?: string; parentId?: string | null; teamId?: string }): Promise<Task[]> {
  let sql = 'SELECT * FROM tasks WHERE 1=1'
  const params: unknown[] = []
  let paramIdx = 1

  if (filters?.teamId) { sql += ` AND team_id = $${paramIdx++}`; params.push(filters.teamId) }
  if (filters?.status) { sql += ` AND status = $${paramIdx++}`; params.push(filters.status) }
  if (filters?.agentId) { sql += ` AND assigned_agent_id = $${paramIdx++}`; params.push(filters.agentId) }
  if (filters?.parentId !== undefined) {
    if (filters.parentId === null) { sql += ' AND parent_task_id IS NULL' }
    else { sql += ` AND parent_task_id = $${paramIdx++}`; params.push(filters.parentId) }
  }

  sql += " ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC"

  const rows = await db.query<Record<string, unknown>>(sql, params)
  return rows.map(rowToTask)
}

export async function updateTask(db: Db, id: string, updates: Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'assignedAgentId' | 'deadline' | 'headerImage'>> & { attachments?: string }): Promise<Task | null> {
  const fields: string[] = []
  const values: unknown[] = []
  let paramIdx = 1

  if (updates.title !== undefined) { fields.push(`title = $${paramIdx++}`); values.push(updates.title) }
  if (updates.description !== undefined) { fields.push(`description = $${paramIdx++}`); values.push(updates.description) }
  if (updates.status !== undefined) { fields.push(`status = $${paramIdx++}`); values.push(updates.status) }
  if (updates.priority !== undefined) { fields.push(`priority = $${paramIdx++}`); values.push(updates.priority) }
  if (updates.assignedAgentId !== undefined) { fields.push(`assigned_agent_id = $${paramIdx++}`); values.push(updates.assignedAgentId) }
  if (updates.deadline !== undefined) { fields.push(`deadline = $${paramIdx++}`); values.push(updates.deadline) }
  if (updates.headerImage !== undefined) { fields.push(`header_image = $${paramIdx++}`); values.push(updates.headerImage) }
  if (updates.attachments !== undefined) { fields.push(`attachments = $${paramIdx++}`); values.push(updates.attachments) }

  if (fields.length === 0) return getTask(db, id)

  fields.push(`updated_at = ${db.now()}`)
  values.push(id)

  await db.run(`UPDATE tasks SET ${fields.join(', ')} WHERE id = $${paramIdx}`, values)
  return getTask(db, id)
}

export async function deleteTask(db: Db, id: string): Promise<void> {
  await db.run('DELETE FROM tasks WHERE id = $1', [id])
}

export async function addDependency(db: Db, taskId: string, dependsOnId: string): Promise<void> {
  if (db.driver === 'postgres') {
    await db.run('INSERT INTO task_deps (task_id, depends_on) VALUES ($1, $2) ON CONFLICT DO NOTHING', [taskId, dependsOnId])
  } else {
    await db.run('INSERT OR IGNORE INTO task_deps (task_id, depends_on) VALUES ($1, $2)', [taskId, dependsOnId])
  }
}

export async function isBlocked(db: Db, taskId: string): Promise<boolean> {
  const row = await db.queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM task_deps td JOIN tasks t ON t.id = td.depends_on WHERE td.task_id = $1 AND t.status != 'done'",
    [taskId],
  )
  return (row?.count ?? 0) > 0
}

export async function getSubtasks(db: Db, parentId: string): Promise<Task[]> {
  return listTasks(db, { parentId })
}

function rowToTask(row: Record<string, unknown>): Task {
  let attachments: TaskAttachment[] = []
  try {
    const raw = row.attachments as string | null
    if (raw) attachments = JSON.parse(raw) as TaskAttachment[]
  } catch { /* invalid JSON — default to empty */ }
  return {
    id: row.id as string, title: row.title as string, description: row.description as string | null,
    status: row.status as TaskStatus, priority: row.priority as TaskPriority,
    assignedAgentId: row.assigned_agent_id as string | null, parentTaskId: row.parent_task_id as string | null,
    deadline: row.deadline as string | null, headerImage: (row.header_image as string | null) ?? null,
    attachments, createdAt: row.created_at as string, updatedAt: row.updated_at as string,
  }
}

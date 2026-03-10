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

export interface TaskTag {
  id: string; name: string; color: string
}

export interface Task {
  id: string; teamId: string; title: string; description: string | null; status: TaskStatus; priority: TaskPriority
  assignedAgentId: string | null; assignedUserId: string | null; parentTaskId: string | null; deadline: string | null
  headerImage: string | null; attachments: TaskAttachment[]
  tags: TaskTag[]
  createdAt: string; updatedAt: string
}

export async function createTask(db: Db, teamId: string, title: string, opts?: {
  description?: string; priority?: TaskPriority; assignedAgentId?: string; assignedUserId?: string; parentTaskId?: string; deadline?: string; status?: TaskStatus
}): Promise<Task> {
  const id = randomUUID()
  await db.run(
    'INSERT INTO tasks (id, team_id, title, description, status, priority, assigned_agent_id, assigned_user_id, parent_task_id, deadline) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
    [id, teamId, title, opts?.description ?? null, opts?.status ?? 'backlog', opts?.priority ?? 'medium', opts?.assignedAgentId ?? null, opts?.assignedUserId ?? null, opts?.parentTaskId ?? null, opts?.deadline ?? null],
  )
  return (await getTask(db, id))!
}

export async function getTask(db: Db, id: string): Promise<Task | null> {
  const row = await db.queryOne<Record<string, unknown>>('SELECT * FROM tasks WHERE id = $1', [id])
  if (!row) return null
  const task = rowToTask(row)
  task.tags = await getTaskTags(db, id)
  return task
}

export async function listTasks(db: Db, filters?: { status?: TaskStatus; agentId?: string; parentId?: string | null; teamId?: string; tags?: string }): Promise<Task[]> {
  const params: unknown[] = []
  let paramIdx = 1

  // If filtering by tags, use EXISTS subquery (avoids DISTINCT + ORDER BY issues in Postgres)
  const tagNames = filters?.tags ? filters.tags.split(',').map((t) => t.trim()).filter(Boolean) : []

  let sql = 'SELECT * FROM tasks t WHERE 1=1'

  if (filters?.teamId) { sql += ` AND t.team_id = $${paramIdx++}`; params.push(filters.teamId) }
  if (filters?.status) { sql += ` AND t.status = $${paramIdx++}`; params.push(filters.status) }
  if (filters?.agentId) { sql += ` AND t.assigned_agent_id = $${paramIdx++}`; params.push(filters.agentId) }
  if (filters?.parentId !== undefined) {
    if (filters.parentId === null) { sql += ' AND t.parent_task_id IS NULL' }
    else { sql += ` AND t.parent_task_id = $${paramIdx++}`; params.push(filters.parentId) }
  }
  if (tagNames.length > 0) {
    const placeholders = tagNames.map(() => `$${paramIdx++}`).join(', ')
    sql += ` AND EXISTS (SELECT 1 FROM resource_tags rt JOIN tags tg ON tg.id = rt.tag_id WHERE rt.resource_id = t.id AND rt.resource_type = 'task' AND tg.name IN (${placeholders}))`
    params.push(...tagNames)
  }

  sql += " ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, t.created_at DESC"

  const rows = await db.query<Record<string, unknown>>(sql, params)
  const tasks = rows.map(rowToTask)

  // Batch-load tags for all tasks in a single query (avoids N+1)
  if (tasks.length > 0) {
    const taskIds = tasks.map(t => t.id)
    const placeholders = taskIds.map((_, i) => `$${i + 1}`).join(', ')
    const tagRows = await db.query<Record<string, unknown>>(
      `SELECT rt.resource_id AS task_id, t.id, t.name, t.color
       FROM tags t JOIN resource_tags rt ON rt.tag_id = t.id
       WHERE rt.resource_type = 'task' AND rt.resource_id IN (${placeholders})
       ORDER BY t.name`,
      taskIds,
    )
    const tagMap = new Map<string, TaskTag[]>()
    for (const r of tagRows) {
      const tid = r.task_id as string
      if (!tagMap.has(tid)) tagMap.set(tid, [])
      tagMap.get(tid)!.push({ id: r.id as string, name: r.name as string, color: r.color as string })
    }
    for (const task of tasks) {
      task.tags = tagMap.get(task.id) ?? []
    }
  }

  return tasks
}

export async function updateTask(db: Db, id: string, updates: Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'assignedAgentId' | 'assignedUserId' | 'deadline' | 'headerImage'>> & { attachments?: string }): Promise<Task | null> {
  const fields: string[] = []
  const values: unknown[] = []
  let paramIdx = 1

  if (updates.title !== undefined) { fields.push(`title = $${paramIdx++}`); values.push(updates.title) }
  if (updates.description !== undefined) { fields.push(`description = $${paramIdx++}`); values.push(updates.description) }
  if (updates.status !== undefined) { fields.push(`status = $${paramIdx++}`); values.push(updates.status) }
  if (updates.priority !== undefined) { fields.push(`priority = $${paramIdx++}`); values.push(updates.priority) }
  if (updates.assignedAgentId !== undefined) { fields.push(`assigned_agent_id = $${paramIdx++}`); values.push(updates.assignedAgentId) }
  if (updates.assignedUserId !== undefined) { fields.push(`assigned_user_id = $${paramIdx++}`); values.push(updates.assignedUserId) }
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

async function getTaskTags(db: Db, taskId: string): Promise<TaskTag[]> {
  const rows = await db.query<Record<string, unknown>>(
    'SELECT t.id, t.name, t.color FROM tags t JOIN resource_tags rt ON rt.tag_id = t.id WHERE rt.resource_type = \'task\' AND rt.resource_id = $1 ORDER BY t.name',
    [taskId],
  )
  return rows.map((r) => ({ id: r.id as string, name: r.name as string, color: r.color as string }))
}

function rowToTask(row: Record<string, unknown>): Task {
  let attachments: TaskAttachment[] = []
  try {
    const raw = row.attachments as string | null
    if (raw) attachments = JSON.parse(raw) as TaskAttachment[]
  } catch { /* invalid JSON — default to empty */ }
  return {
    id: row.id as string, teamId: row.team_id as string, title: row.title as string, description: row.description as string | null,
    status: row.status as TaskStatus, priority: row.priority as TaskPriority,
    assignedAgentId: row.assigned_agent_id as string | null, assignedUserId: (row.assigned_user_id as string | null) ?? null, parentTaskId: row.parent_task_id as string | null,
    deadline: row.deadline as string | null, headerImage: (row.header_image as string | null) ?? null,
    attachments, tags: [], createdAt: row.created_at as string, updatedAt: row.updated_at as string,
  }
}

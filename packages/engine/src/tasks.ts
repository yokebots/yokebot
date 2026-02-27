/**
 * tasks.ts — Shared task board (Mission Control)
 *
 * Goals, tasks, subtasks, dependencies, status tracking.
 * Agents read their assigned tasks, update progress, coordinate.
 * Every task has a chat thread (handled by chat.ts).
 */

import type Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface Task {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  assignedAgentId: string | null
  parentTaskId: string | null
  deadline: string | null
  createdAt: string
  updatedAt: string
}

export function createTask(
  db: Database.Database,
  title: string,
  opts?: {
    description?: string
    priority?: TaskPriority
    assignedAgentId?: string
    parentTaskId?: string
    deadline?: string
  },
): Task {
  const id = randomUUID()

  db.prepare(`
    INSERT INTO tasks (id, title, description, priority, assigned_agent_id, parent_task_id, deadline)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    title,
    opts?.description ?? null,
    opts?.priority ?? 'medium',
    opts?.assignedAgentId ?? null,
    opts?.parentTaskId ?? null,
    opts?.deadline ?? null,
  )

  return getTask(db, id)!
}

export function getTask(db: Database.Database, id: string): Task | null {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!row) return null
  return rowToTask(row)
}

export function listTasks(
  db: Database.Database,
  filters?: { status?: TaskStatus; agentId?: string; parentId?: string | null },
): Task[] {
  let sql = 'SELECT * FROM tasks WHERE 1=1'
  const params: unknown[] = []

  if (filters?.status) {
    sql += ' AND status = ?'
    params.push(filters.status)
  }
  if (filters?.agentId) {
    sql += ' AND assigned_agent_id = ?'
    params.push(filters.agentId)
  }
  if (filters?.parentId !== undefined) {
    if (filters.parentId === null) {
      sql += ' AND parent_task_id IS NULL'
    } else {
      sql += ' AND parent_task_id = ?'
      params.push(filters.parentId)
    }
  }

  sql += ' ORDER BY CASE priority WHEN \'urgent\' THEN 0 WHEN \'high\' THEN 1 WHEN \'medium\' THEN 2 ELSE 3 END, created_at DESC'

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[]
  return rows.map(rowToTask)
}

export function updateTask(
  db: Database.Database,
  id: string,
  updates: Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'assignedAgentId' | 'deadline'>>,
): Task | null {
  const fields: string[] = []
  const values: unknown[] = []

  if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title) }
  if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description) }
  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status) }
  if (updates.priority !== undefined) { fields.push('priority = ?'); values.push(updates.priority) }
  if (updates.assignedAgentId !== undefined) { fields.push('assigned_agent_id = ?'); values.push(updates.assignedAgentId) }
  if (updates.deadline !== undefined) { fields.push('deadline = ?'); values.push(updates.deadline) }

  if (fields.length === 0) return getTask(db, id)

  fields.push("updated_at = datetime('now')")
  values.push(id)

  db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  return getTask(db, id)
}

export function deleteTask(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
}

/**
 * Add a dependency: `taskId` cannot start until `dependsOnId` is done.
 */
export function addDependency(db: Database.Database, taskId: string, dependsOnId: string): void {
  db.prepare('INSERT OR IGNORE INTO task_deps (task_id, depends_on) VALUES (?, ?)').run(taskId, dependsOnId)
}

/**
 * Check if a task is blocked by incomplete dependencies.
 */
export function isBlocked(db: Database.Database, taskId: string): boolean {
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM task_deps td
    JOIN tasks t ON t.id = td.depends_on
    WHERE td.task_id = ? AND t.status != 'done'
  `).get(taskId) as { count: number }
  return row.count > 0
}

/**
 * Get subtasks for a parent task.
 */
export function getSubtasks(db: Database.Database, parentId: string): Task[] {
  return listTasks(db, { parentId: parentId })
}

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string | null,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    assignedAgentId: row.assigned_agent_id as string | null,
    parentTaskId: row.parent_task_id as string | null,
    deadline: row.deadline as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

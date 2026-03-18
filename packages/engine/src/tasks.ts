/**
 * tasks.ts — Shared task board (Mission Control)
 */

import type { Db } from './db/types.ts'
import { randomUUID } from 'crypto'

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done' | 'archived' | 'blocked'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type BlockedReason = 'max_retries' | 'approval_pending' | 'dependency' | 'manual'

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
  blockedReason: BlockedReason | null; blockedApprovalId: string | null; blockedReasonText: string | null; scratchpad: string | null; estimatedCredits: number | null; sprintCount: number
  sandboxProjectId: string | null; shortId: number | null
  createdAt: string; updatedAt: string
}

export async function createTask(db: Db, teamId: string, title: string, opts?: {
  description?: string; priority?: TaskPriority; assignedAgentId?: string; assignedUserId?: string; parentTaskId?: string; deadline?: string; status?: TaskStatus; sandboxProjectId?: string
}): Promise<Task> {
  const id = randomUUID()
  // Generate next short_id for this team
  const shortIdRow = await db.queryOne<{ next_id: number }>('SELECT COALESCE(MAX(short_id), 0) + 1 AS next_id FROM tasks WHERE team_id = $1', [teamId])
  const shortId = shortIdRow?.next_id ?? 1
  await db.run(
    'INSERT INTO tasks (id, team_id, title, description, status, priority, assigned_agent_id, assigned_user_id, parent_task_id, deadline, sandbox_project_id, short_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
    [id, teamId, title, opts?.description ?? null, opts?.status ?? 'backlog', opts?.priority ?? 'medium', opts?.assignedAgentId ?? null, opts?.assignedUserId ?? null, opts?.parentTaskId ?? null, opts?.deadline ?? null, opts?.sandboxProjectId ?? null, shortId],
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

export async function listTasks(db: Db, filters?: { status?: TaskStatus; agentId?: string; assignedUserId?: string; parentId?: string | null; teamId?: string; tags?: string }): Promise<Task[]> {
  const params: unknown[] = []
  let paramIdx = 1

  // If filtering by tags, use EXISTS subquery (avoids DISTINCT + ORDER BY issues in Postgres)
  const tagNames = filters?.tags ? filters.tags.split(',').map((t) => t.trim()).filter(Boolean) : []

  let sql = 'SELECT * FROM tasks t WHERE 1=1'

  if (filters?.teamId) { sql += ` AND t.team_id = $${paramIdx++}`; params.push(filters.teamId) }
  if (filters?.status) { sql += ` AND t.status = $${paramIdx++}`; params.push(filters.status) }
  // Exclude archived tasks by default (unless explicitly filtering by 'archived' status)
  if (!filters?.status || filters.status !== 'archived') { sql += ` AND t.status != 'archived'` }
  if (filters?.agentId) { sql += ` AND t.assigned_agent_id = $${paramIdx++}`; params.push(filters.agentId) }
  if (filters?.assignedUserId) { sql += ` AND t.assigned_user_id = $${paramIdx++}`; params.push(filters.assignedUserId) }
  if (filters?.parentId !== undefined) {
    if (filters.parentId === null) { sql += ' AND t.parent_task_id IS NULL' }
    else { sql += ` AND t.parent_task_id = $${paramIdx++}`; params.push(filters.parentId) }
  }
  if (tagNames.length > 0) {
    const placeholders = tagNames.map(() => `$${paramIdx++}`).join(', ')
    sql += ` AND EXISTS (SELECT 1 FROM resource_tags rt JOIN tags tg ON tg.id = rt.tag_id WHERE rt.resource_id = t.id AND rt.resource_type = 'task' AND tg.name IN (${placeholders}))`
    params.push(...tagNames)
  }

  sql += " ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, t.created_at ASC"

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

export async function updateTask(db: Db, id: string, updates: Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'assignedAgentId' | 'assignedUserId' | 'deadline' | 'headerImage' | 'blockedReason' | 'scratchpad' | 'estimatedCredits' | 'sandboxProjectId'>> & { attachments?: string }): Promise<Task | null> {
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
  if (updates.blockedReason !== undefined) { fields.push(`blocked_reason = $${paramIdx++}`); values.push(updates.blockedReason) }
  if (updates.scratchpad !== undefined) { fields.push(`scratchpad = $${paramIdx++}`); values.push(updates.scratchpad) }
  if (updates.estimatedCredits !== undefined) { fields.push(`estimated_credits = $${paramIdx++}`); values.push(updates.estimatedCredits) }
  if (updates.sandboxProjectId !== undefined) { fields.push(`sandbox_project_id = $${paramIdx++}`); values.push(updates.sandboxProjectId) }

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
    attachments, tags: [],
    blockedReason: (row.blocked_reason as BlockedReason | null) ?? null,
    blockedApprovalId: (row.blocked_approval_id as string | null) ?? null,
    blockedReasonText: (row.blocked_reason_text as string | null) ?? null,
    scratchpad: (row.scratchpad as string | null) ?? null,
    estimatedCredits: (row.estimated_credits as number | null) ?? null,
    sprintCount: (row.sprint_count as number) ?? 0,
    sandboxProjectId: (row.sandbox_project_id as string | null) ?? null,
    shortId: (row.short_id as number | null) ?? null,
    createdAt: row.created_at as string, updatedAt: row.updated_at as string,
  }
}

// ---- Task Deduplication ----

const FILLER_WORDS = new Set(['a', 'an', 'the', 'to', 'for', 'of', 'in', 'on', 'and', 'or', 'is', 'it', 'my', 'our', 'this', 'that', 'with', 'me', 'we', 'be'])

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => !FILLER_WORDS.has(w)).join(' ')
}

function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1
  const lenA = a.length, lenB = b.length
  if (lenA === 0 || lenB === 0) return 0
  const matrix: number[][] = Array.from({ length: lenA + 1 }, (_, i) => [i])
  for (let j = 0; j <= lenB; j++) matrix[0][j] = j
  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      matrix[i][j] = a[i - 1] === b[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + 1)
    }
  }
  return 1 - matrix[lenA][lenB] / Math.max(lenA, lenB)
}

/** Check for duplicate tasks by fuzzy title match. Returns warning string if duplicate found, null otherwise. */
export async function checkForDuplicateTask(db: Db, teamId: string, title: string): Promise<string | null> {
  const normalized = normalizeTitle(title)
  if (!normalized) return null
  const existing = await listTasks(db, { teamId })
  const active = existing.filter(t => t.status !== 'done' && t.status !== 'archived')
  for (const task of active) {
    const sim = levenshteinSimilarity(normalized, normalizeTitle(task.title))
    if (sim > 0.85) {
      const shortRef = task.shortId ? `TASK-${task.shortId}` : task.id.slice(0, 8)
      return `Similar task exists: "${task.title}" (${shortRef}, status: ${task.status}). Use update_task to modify the existing task instead of creating a duplicate.`
    }
  }
  return null
}

/** Block a task with a specific reason, optional linked approval, and optional explanation text. */
export async function blockTask(db: Db, taskId: string, reason: BlockedReason, approvalId?: string, reasonText?: string): Promise<void> {
  const now = db.now()
  await db.run(
    `UPDATE tasks SET status = 'blocked', blocked_reason = $1, blocked_approval_id = $2, blocked_reason_text = $3, updated_at = ${now} WHERE id = $4`,
    [reason, approvalId ?? null, reasonText ?? null, taskId],
  )
}

/** Unblock a task: clear blocked fields, reset sprint_count, set target status. */
export async function unblockTask(db: Db, taskId: string, targetStatus: TaskStatus = 'todo'): Promise<void> {
  const now = db.now()
  await db.run(
    `UPDATE tasks SET status = $1, blocked_reason = NULL, blocked_approval_id = NULL, blocked_reason_text = NULL, scratchpad = NULL, sprint_count = 0, updated_at = ${now} WHERE id = $2`,
    [targetStatus, taskId],
  )
}

/**
 * workspace.ts — DB-backed file manager for workspace files + global context
 *
 * Manages the knowledge base: SOPs, strategy docs, brand guidelines,
 * agent-specific notes. All files stored in PostgreSQL so they persist
 * across Railway container restarts (ephemeral filesystem).
 *
 * Includes file-level locking to prevent collision when two agents
 * edit the same file.
 */

import type { Db } from './db/types.ts'
import { randomUUID } from 'crypto'

export interface WorkspaceConfig {
  rootDir: string  // kept for backward compat but no longer used for storage
}

export interface FileEntry {
  path: string      // relative to workspace root
  name: string
  isDirectory: boolean
  size: number
  modifiedAt: string
  createdBy?: string
  taskId?: string | null
}

/**
 * Sanitize a file path to prevent path traversal attacks.
 * Strips leading slashes and rejects ../ sequences, backslash escapes,
 * and null bytes. Throws on invalid paths.
 */
function sanitizePath(rawPath: string): string {
  const normalized = rawPath.replace(/^\/+/, '')
  if (
    normalized.includes('../') || normalized.includes('..\\') ||
    normalized === '..' || normalized.includes('\0')
  ) {
    throw new Error('Invalid file path: path traversal not allowed')
  }
  return normalized
}

// Simple in-memory file locks
const locks = new Map<string, { agentId: string; expiresAt: number }>()
const LOCK_TTL_MS = 30_000 // 30 seconds

/**
 * Initialize the workspace — no-op for DB-backed storage.
 */
export function initWorkspace(_config: WorkspaceConfig): void {
  // Nothing to do — tables created by migration
}

/**
 * List files in a directory (relative to workspace root).
 * Simulates a directory tree from flat paths stored in DB.
 */
export async function listFiles(db: Db, teamId: string, dirPath = '', recursive = false): Promise<FileEntry[]> {
  const normalizedDir = sanitizePath(dirPath.replace(/\/+$/g, ''))
  const prefix = normalizedDir ? normalizedDir + '/' : ''
  const depth = normalizedDir ? normalizedDir.split('/').length : 0

  // Get all files for this team
  const rows = await db.query<Record<string, unknown>>(
    'SELECT path, size, mime_type, updated_at, created_by, task_id FROM workspace_files WHERE team_id = $1 ORDER BY path',
    [teamId],
  )

  // Recursive mode: return all files flat (frontend builds the tree)
  if (recursive) {
    return rows.map(row => ({
      path: row.path as string,
      name: (row.path as string).split('/').pop() ?? '',
      isDirectory: false,
      size: row.size as number,
      modifiedAt: row.updated_at as string,
      createdBy: (row.created_by as string) ?? '',
      taskId: (row.task_id as string) ?? null,
    }))
  }

  // Non-recursive: direct children of the requested directory
  const seen = new Set<string>()
  const entries: FileEntry[] = []

  for (const row of rows) {
    const filePath = row.path as string

    // Must be under the requested directory
    if (prefix && !filePath.startsWith(prefix)) continue
    // Must not be the directory itself
    if (filePath === normalizedDir) continue

    const parts = filePath.split('/')
    const fileDepth = parts.length - 1 // depth of this file (0-indexed)

    if (fileDepth === depth) {
      // Direct child file
      entries.push({
        path: filePath,
        name: parts[parts.length - 1],
        isDirectory: false,
        size: row.size as number,
        modifiedAt: row.updated_at as string,
        createdBy: (row.created_by as string) ?? '',
        taskId: (row.task_id as string) ?? null,
      })
    } else if (fileDepth > depth) {
      // This file is in a subdirectory — show the subdirectory
      const dirName = parts[depth]
      const dirFullPath = parts.slice(0, depth + 1).join('/')
      if (!seen.has(dirFullPath)) {
        seen.add(dirFullPath)
        entries.push({
          path: dirFullPath,
          name: dirName,
          isDirectory: true,
          size: 0,
          modifiedAt: row.updated_at as string,
        })
      }
    }
  }

  return entries
}

/**
 * Read a file from the workspace.
 */
export async function readFile(db: Db, teamId: string, filePath: string): Promise<{ content: string; createdBy: string; taskId: string | null } | null> {
  const normalizedPath = sanitizePath(filePath)
  const row = await db.queryOne<Record<string, unknown>>(
    'SELECT content, created_by, task_id FROM workspace_files WHERE team_id = $1 AND path = $2',
    [teamId, normalizedPath],
  )
  if (!row) return null
  return { content: row.content as string, createdBy: (row.created_by as string) ?? '', taskId: (row.task_id as string) ?? null }
}

/**
 * Read binary file content from the workspace.
 */
export async function readBinaryFile(db: Db, teamId: string, filePath: string): Promise<Buffer | null> {
  const normalizedPath = sanitizePath(filePath)
  const row = await db.queryOne<Record<string, unknown>>(
    'SELECT binary_content, content FROM workspace_files WHERE team_id = $1 AND path = $2',
    [teamId, normalizedPath],
  )
  if (!row) return null
  if (row.binary_content) return row.binary_content as Buffer
  // Fallback to text content
  return Buffer.from(row.content as string, 'utf-8')
}

/**
 * Write a file to the workspace (with lock check).
 */
export async function writeFile(
  db: Db,
  teamId: string,
  filePath: string,
  content: string,
  agentId: string,
  taskId?: string,
): Promise<{ success: boolean; error?: string }> {
  // Clean expired locks
  cleanExpiredLocks()

  const normalizedPath = sanitizePath(filePath)

  const lock = locks.get(`${teamId}:${normalizedPath}`)
  if (lock && lock.agentId !== agentId) {
    return {
      success: false,
      error: `File is locked by agent ${lock.agentId}. Try again in ${Math.ceil((lock.expiresAt - Date.now()) / 1000)}s.`,
    }
  }

  const id = randomUUID()
  const size = Buffer.byteLength(content, 'utf-8')

  if (db.driver === 'postgres') {
    await db.run(
      `INSERT INTO workspace_files (id, team_id, path, content, size, created_by, task_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (team_id, path) DO UPDATE SET content = $4, size = $5, created_by = $6, task_id = COALESCE($7, workspace_files.task_id), updated_at = NOW()`,
      [id, teamId, normalizedPath, content, size, agentId, taskId ?? null],
    )
  } else {
    await db.run(
      `INSERT OR REPLACE INTO workspace_files (id, team_id, path, content, size, created_by, task_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, datetime('now'))`,
      [id, teamId, normalizedPath, content, size, agentId, taskId ?? null],
    )
  }

  return { success: true }
}

/**
 * Write binary content to the workspace (for media files).
 * If a file already exists at the path, auto-appends a numeric suffix
 * to prevent silent overwrites (e.g. image.png → image_2.png).
 */
export async function writeBinaryFile(
  db: Db,
  teamId: string,
  filePath: string,
  content: Buffer,
  mimeType: string,
  createdBy = '',
): Promise<string> {
  const normalizedPath = await deduplicatePath(db, teamId, sanitizePath(filePath))
  const id = randomUUID()

  if (db.driver === 'postgres') {
    await db.run(
      `INSERT INTO workspace_files (id, team_id, path, content, binary_content, mime_type, size, created_by, updated_at)
       VALUES ($1, $2, $3, '', $4, $5, $6, $7, NOW())`,
      [id, teamId, normalizedPath, content, mimeType, content.length, createdBy],
    )
  } else {
    await db.run(
      `INSERT INTO workspace_files (id, team_id, path, content, binary_content, mime_type, size, created_by, updated_at)
       VALUES ($1, $2, $3, '', $4, $5, $6, $7, datetime('now'))`,
      [id, teamId, normalizedPath, content, mimeType, content.length, createdBy],
    )
  }

  return normalizedPath
}

/**
 * If a file already exists at the given path, append a numeric suffix
 * before the extension to avoid overwriting. e.g. "foo.png" → "foo_2.png"
 */
async function deduplicatePath(db: Db, teamId: string, path: string): Promise<string> {
  const exists = await db.queryOne<{ id: string }>(
    'SELECT id FROM workspace_files WHERE team_id = $1 AND path = $2',
    [teamId, path],
  )
  if (!exists) return path

  const dotIdx = path.lastIndexOf('.')
  const base = dotIdx > 0 ? path.slice(0, dotIdx) : path
  const ext = dotIdx > 0 ? path.slice(dotIdx) : ''

  for (let n = 2; n <= 100; n++) {
    const candidate = `${base}_${n}${ext}`
    const taken = await db.queryOne<{ id: string }>(
      'SELECT id FROM workspace_files WHERE team_id = $1 AND path = $2',
      [teamId, candidate],
    )
    if (!taken) return candidate
  }

  // Fallback: append UUID fragment
  return `${base}_${randomUUID().slice(0, 6)}${ext}`
}

/**
 * Acquire a write lock on a file.
 */
export function acquireLock(teamId: string, filePath: string, agentId: string): boolean {
  cleanExpiredLocks()

  const key = `${teamId}:${filePath}`
  const existing = locks.get(key)
  if (existing && existing.agentId !== agentId) {
    return false // locked by another agent
  }

  locks.set(key, {
    agentId,
    expiresAt: Date.now() + LOCK_TTL_MS,
  })
  return true
}

/**
 * Release a write lock.
 */
export function releaseLock(teamId: string, filePath: string, agentId: string): void {
  const key = `${teamId}:${filePath}`
  const lock = locks.get(key)
  if (lock && lock.agentId === agentId) {
    locks.delete(key)
  }
}

/**
 * Get all currently locked files (for dashboard display).
 */
export function getActiveLocks(): Array<{ path: string; agentId: string; expiresAt: number }> {
  cleanExpiredLocks()
  return Array.from(locks.entries()).map(([key, lock]) => ({
    path: key.includes(':') ? key.split(':').slice(1).join(':') : key,
    agentId: lock.agentId,
    expiresAt: lock.expiresAt,
  }))
}

/** Get all files linked to a specific task. */
export async function getFilesByTask(db: Db, teamId: string, taskId: string): Promise<FileEntry[]> {
  const rows = await db.query<Record<string, unknown>>(
    'SELECT path, size, updated_at FROM workspace_files WHERE team_id = $1 AND task_id = $2 ORDER BY updated_at DESC',
    [teamId, taskId],
  )
  return rows.map(row => ({
    path: row.path as string,
    name: (row.path as string).split('/').pop() ?? '',
    isDirectory: false,
    size: row.size as number,
    modifiedAt: row.updated_at as string,
  }))
}

/** Mark a file as read by a user. */
export async function markFileRead(db: Db, userId: string, fileId: string): Promise<void> {
  const now = db.now()
  if (db.driver === 'postgres') {
    await db.run(
      `INSERT INTO workspace_file_reads (user_id, file_id, last_read_at) VALUES ($1, $2, ${now})
       ON CONFLICT (user_id, file_id) DO UPDATE SET last_read_at = ${now}`,
      [userId, fileId],
    )
  } else {
    await db.run(
      `INSERT OR REPLACE INTO workspace_file_reads (user_id, file_id, last_read_at) VALUES ($1, $2, datetime('now'))`,
      [userId, fileId],
    )
  }
}

/** Get paths of files updated since user last read them. */
export async function getUnreadFileIds(db: Db, userId: string, teamId: string): Promise<string[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT f.path FROM workspace_files f
     LEFT JOIN workspace_file_reads fr ON fr.file_id = f.id AND fr.user_id = $1
     WHERE f.team_id = $2 AND f.updated_at > COALESCE(fr.last_read_at, '1970-01-01')`,
    [userId, teamId],
  )
  return rows.map(r => r.path as string)
}

/** Get file metadata by path (for read tracking). */
export async function getFileByPath(db: Db, teamId: string, filePath: string): Promise<{ id: string; taskId: string | null } | null> {
  const normalizedPath = sanitizePath(filePath)
  const row = await db.queryOne<Record<string, unknown>>(
    'SELECT id, task_id FROM workspace_files WHERE team_id = $1 AND path = $2',
    [teamId, normalizedPath],
  )
  if (!row) return null
  return { id: row.id as string, taskId: (row.task_id as string) ?? null }
}

/** Rename a file or directory (update paths). */
export async function renameFile(db: Db, teamId: string, oldPath: string, newPath: string): Promise<{ success: boolean; error?: string }> {
  const normalizedOld = sanitizePath(oldPath)
  const normalizedNew = sanitizePath(newPath)

  const now = db.driver === 'postgres' ? 'NOW()' : "datetime('now')"

  // Check if it's a single file
  const source = await db.queryOne<Record<string, unknown>>(
    'SELECT id FROM workspace_files WHERE team_id = $1 AND path = $2',
    [teamId, normalizedOld],
  )

  if (source) {
    // Single file rename
    const existing = await db.queryOne<Record<string, unknown>>(
      'SELECT id FROM workspace_files WHERE team_id = $1 AND path = $2',
      [teamId, normalizedNew],
    )
    if (existing) return { success: false, error: 'A file already exists at that path.' }

    await db.run(
      `UPDATE workspace_files SET path = $1, updated_at = ${now} WHERE team_id = $2 AND path = $3`,
      [normalizedNew, teamId, normalizedOld],
    )
    return { success: true }
  }

  // Directory rename — update all files under the old directory prefix
  const prefix = normalizedOld + '/'
  const children = await db.query<Record<string, unknown>>(
    'SELECT id, path FROM workspace_files WHERE team_id = $1 AND path LIKE $2',
    [teamId, prefix + '%'],
  )

  if (children.length === 0) return { success: false, error: 'File not found.' }

  for (const child of children) {
    const childPath = child.path as string
    const updatedPath = normalizedNew + childPath.slice(normalizedOld.length)
    await db.run(
      `UPDATE workspace_files SET path = $1, updated_at = ${now} WHERE id = $2 AND team_id = $3`,
      [updatedPath, child.id, teamId],
    )
  }
  return { success: true }
}

/** Delete a file by path. */
export async function deleteFile(db: Db, teamId: string, filePath: string): Promise<{ success: boolean; error?: string }> {
  const normalizedPath = sanitizePath(filePath)

  const file = await db.queryOne<Record<string, unknown>>(
    'SELECT id FROM workspace_files WHERE team_id = $1 AND path = $2',
    [teamId, normalizedPath],
  )
  if (!file) return { success: false, error: 'File not found.' }

  await db.run(
    'DELETE FROM workspace_files WHERE team_id = $1 AND path = $2',
    [teamId, normalizedPath],
  )
  return { success: true }
}

function cleanExpiredLocks(): void {
  const now = Date.now()
  for (const [path, lock] of locks) {
    if (lock.expiresAt <= now) {
      locks.delete(path)
    }
  }
}

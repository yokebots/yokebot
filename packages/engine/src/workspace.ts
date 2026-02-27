/**
 * workspace.ts — File system manager for workspace files + global context
 *
 * Manages the knowledge base: SOPs, strategy docs, brand guidelines,
 * agent-specific notes. Includes file-level locking to prevent
 * collision when two agents edit the same file.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync, lstatSync } from 'fs'
import { join, relative, resolve, normalize } from 'path'

/**
 * Resolve a user-provided path and ensure it stays within the workspace root.
 * Prevents path traversal attacks (e.g. ../../etc/passwd).
 */
function safePath(rootDir: string, userPath: string): string {
  const normalizedRoot = normalize(resolve(rootDir))
  const resolved = normalize(resolve(rootDir, userPath))
  // Resolved path must start with the root directory
  if (!resolved.startsWith(normalizedRoot + '/') && resolved !== normalizedRoot) {
    throw new Error('Path traversal denied')
  }
  // Block null bytes (used to bypass path checks in some runtimes)
  if (userPath.includes('\0')) {
    throw new Error('Path traversal denied')
  }
  // Block symlinks that point outside workspace
  if (existsSync(resolved) && lstatSync(resolved).isSymbolicLink()) {
    throw new Error('Symlinks are not allowed in workspace')
  }
  return resolved
}

export interface WorkspaceConfig {
  rootDir: string  // e.g. ~/yokebot/workspace
}

export interface FileEntry {
  path: string      // relative to workspace root
  name: string
  isDirectory: boolean
  size: number
  modifiedAt: string
}

// Simple in-memory file locks
const locks = new Map<string, { agentId: string; expiresAt: number }>()
const LOCK_TTL_MS = 30_000 // 30 seconds

/**
 * Initialize the workspace directory structure.
 */
export function initWorkspace(config: WorkspaceConfig): void {
  const dirs = [
    config.rootDir,
    join(config.rootDir, 'global'),
    join(config.rootDir, 'global', 'sops'),
    join(config.rootDir, 'global', 'strategy'),
    join(config.rootDir, 'agents'),
  ]

  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true })
  }
}

/**
 * List files in a directory (relative to workspace root).
 */
export function listFiles(config: WorkspaceConfig, dirPath = ''): FileEntry[] {
  const fullPath = safePath(config.rootDir, dirPath)
  if (!existsSync(fullPath)) return []

  const entries = readdirSync(fullPath, { withFileTypes: true })
  return entries
    .filter((e) => !e.name.startsWith('.'))
    .map((e) => {
      const filePath = join(fullPath, e.name)
      const stats = statSync(filePath)
      return {
        path: relative(config.rootDir, filePath),
        name: e.name,
        isDirectory: e.isDirectory(),
        size: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      }
    })
}

/**
 * Read a file from the workspace.
 */
export function readFile(config: WorkspaceConfig, filePath: string): string | null {
  const fullPath = safePath(config.rootDir, filePath)
  if (!existsSync(fullPath)) return null
  return readFileSync(fullPath, 'utf-8')
}

/**
 * Write a file to the workspace (with lock check).
 */
export function writeFile(
  config: WorkspaceConfig,
  filePath: string,
  content: string,
  agentId: string,
): { success: boolean; error?: string } {
  // Clean expired locks
  cleanExpiredLocks()

  const lock = locks.get(filePath)
  if (lock && lock.agentId !== agentId) {
    return {
      success: false,
      error: `File is locked by agent ${lock.agentId}. Try again in ${Math.ceil((lock.expiresAt - Date.now()) / 1000)}s.`,
    }
  }

  const fullPath = safePath(config.rootDir, filePath)
  const dir = fullPath.substring(0, fullPath.lastIndexOf('/'))
  mkdirSync(dir, { recursive: true })
  writeFileSync(fullPath, content, 'utf-8')

  return { success: true }
}

/**
 * Acquire a write lock on a file.
 */
export function acquireLock(filePath: string, agentId: string): boolean {
  cleanExpiredLocks()

  const existing = locks.get(filePath)
  if (existing && existing.agentId !== agentId) {
    return false // locked by another agent
  }

  locks.set(filePath, {
    agentId,
    expiresAt: Date.now() + LOCK_TTL_MS,
  })
  return true
}

/**
 * Release a write lock.
 */
export function releaseLock(filePath: string, agentId: string): void {
  const lock = locks.get(filePath)
  if (lock && lock.agentId === agentId) {
    locks.delete(filePath)
  }
}

/**
 * Get all currently locked files (for dashboard display).
 */
export function getActiveLocks(): Array<{ path: string; agentId: string; expiresAt: number }> {
  cleanExpiredLocks()
  return Array.from(locks.entries()).map(([path, lock]) => ({
    path,
    agentId: lock.agentId,
    expiresAt: lock.expiresAt,
  }))
}

function cleanExpiredLocks(): void {
  const now = Date.now()
  for (const [path, lock] of locks) {
    if (lock.expiresAt <= now) {
      locks.delete(path)
    }
  }
}

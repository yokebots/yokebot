/**
 * sandbox.ts — Daytona sandbox lifecycle management
 *
 * Manages one sandbox per team for app-building capabilities.
 * Pattern follows browser.ts (session map, idle timeout, lazy creation).
 *
 * Lifecycle:
 *  - Lazy creation: sandbox created on first sandbox_* tool call
 *  - Idle timeout: 10 min → sandbox stops (state preserved)
 *  - Auto-archive: 1 hour stopped → archived to storage
 *  - Resume: wakes on next tool call (~90ms)
 *  - One sandbox per team (shared by all agents on that team)
 */

import { Daytona, type Sandbox } from '@daytonaio/sdk'
import type { Db } from './db/types.ts'

// ---- Types ----

export interface SandboxSession {
  sandbox: Sandbox
  teamId: string
  lastActivity: number
  idleTimer: ReturnType<typeof setTimeout>
  startupCommand?: string  // re-run on resume (e.g. "cd /home/daytona/app && npm run dev &")
}

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number
}

export interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number
}

// ---- Broadcast hook (set by index.ts to push SSE sandbox events) ----

let sandboxBroadcast: ((teamId: string, url: string) => void) | null = null

export function setSandboxBroadcast(fn: (teamId: string, url: string) => void): void {
  sandboxBroadcast = fn
}

// ---- Session Map ----

const sessions = new Map<string, SandboxSession>()

const IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
const AUTO_ARCHIVE_MINUTES = 120        // 2 hours after stop → archive

let daytonaClient: Daytona | null = null

function getDaytona(): Daytona {
  if (!daytonaClient) {
    daytonaClient = new Daytona({
      apiKey: process.env.DAYTONA_API_KEY,
    })
  }
  return daytonaClient
}

// ---- Idle Timer ----

// Store db reference so idle timer can update status
let _db: Db | null = null

function resetIdleTimer(session: SandboxSession): void {
  clearTimeout(session.idleTimer)
  session.lastActivity = Date.now()
  session.idleTimer = setTimeout(async () => {
    console.log(`[sandbox] Idle timeout for team ${session.teamId} — stopping sandbox`)
    try {
      await session.sandbox.stop()
      sessions.delete(session.teamId)
      // Update DB status so next access knows to resume
      if (_db) {
        await _db.run(
          `UPDATE sandbox_sessions SET status = 'stopped', last_activity = ${_db.now()} WHERE team_id = $1`,
          [session.teamId],
        )
      }
    } catch (err) {
      console.error(`[sandbox] Failed to stop idle sandbox for team ${session.teamId}:`, (err as Error).message)
    }
  }, IDLE_TIMEOUT_MS)
}

// ---- Core Functions ----

/**
 * Get or create a sandbox for the given team. Lazy creation — only creates
 * on first call. Resumes stopped sandboxes automatically.
 */
export async function getOrCreateSandbox(db: Db, teamId: string): Promise<SandboxSession> {
  // Store db reference for idle timer DB updates
  _db = db

  // Check in-memory cache first
  const existing = sessions.get(teamId)
  if (existing) {
    resetIdleTimer(existing)
    return existing
  }

  const daytona = getDaytona()

  // Check DB for existing sandbox
  const row = await db.queryOne<{ daytona_sandbox_id: string; status: string; startup_command: string | null }>(
    'SELECT daytona_sandbox_id, status, startup_command FROM sandbox_sessions WHERE team_id = $1',
    [teamId],
  )

  if (row) {
    try {
      const sandbox = await daytona.get(row.daytona_sandbox_id)

      // Resume if stopped or archived
      const wasResumed = sandbox.state === 'stopped' || sandbox.state === 'archived'
      if (wasResumed) {
        console.log(`[sandbox] Resuming ${sandbox.state} sandbox for team ${teamId}`)
        await sandbox.start()
        await sandbox.waitUntilStarted(30)
      }

      if (sandbox.state === 'started') {
        const session: SandboxSession = {
          sandbox,
          teamId,
          lastActivity: Date.now(),
          idleTimer: setTimeout(() => {}, 0),
          startupCommand: row.startup_command ?? undefined,
        }
        resetIdleTimer(session)
        sessions.set(teamId, session)

        // Re-run startup command after resume (e.g. restart dev server)
        // If it fails with a module error, auto-repair by reinstalling dependencies
        if (wasResumed && row.startup_command) {
          console.log(`[sandbox] Re-running startup command for team ${teamId}: ${row.startup_command}`)
          try {
            const startResult = await session.sandbox.process.executeCommand(row.startup_command, undefined, undefined, 15)
            const output = startResult.artifacts?.stdout ?? startResult.result ?? ''
            const isModuleError = output.includes('Cannot find module') || output.includes('MODULE_NOT_FOUND')
              || startResult.exitCode !== 0 && output.includes('node_modules')

            if (isModuleError) {
              console.log(`[sandbox] Startup failed with module error for team ${teamId}, auto-repairing...`)
              // Detect project dir from the startup command (e.g. "cd /home/daytona/app && npm run dev")
              const cdMatch = row.startup_command.match(/cd\s+(\/[^\s&]+)/)
              const projectDir = cdMatch?.[1] ?? '/home/daytona/app'
              // Nuke corrupted node_modules and reinstall
              await session.sandbox.process.executeCommand(`rm -rf ${projectDir}/node_modules`, undefined, undefined, 30)
              console.log(`[sandbox] Reinstalling dependencies in ${projectDir}...`)
              const installResult = await session.sandbox.process.executeCommand(`cd ${projectDir} && npm install`, undefined, undefined, 120)
              if (installResult.exitCode === 0) {
                console.log(`[sandbox] Dependencies reinstalled, retrying startup command...`)
                session.sandbox.process.executeCommand(row.startup_command, undefined, undefined, 10).catch(() => {})
              } else {
                console.error(`[sandbox] npm install failed for team ${teamId}`)
              }
            }
          } catch (err) {
            console.error(`[sandbox] Startup command failed for team ${teamId}:`, (err as Error).message)
          }
        }

        // Update DB status
        await db.run(
          `UPDATE sandbox_sessions SET status = 'running', last_activity = ${db.now()} WHERE team_id = $1`,
          [teamId],
        )

        return session
      }
    } catch (err) {
      console.log(`[sandbox] Could not resume sandbox for team ${teamId}, creating new:`, (err as Error).message)
      // Clean up stale DB record
      await db.run('DELETE FROM sandbox_sessions WHERE team_id = $1', [teamId])
    }
  }

  // Create new sandbox
  console.log(`[sandbox] Creating new sandbox for team ${teamId}`)
  const sandbox = await daytona.create({
    language: 'javascript',
    envVars: { NODE_ENV: 'development' },
    labels: { teamId, app: 'yokebot' },
    autoStopInterval: 10,            // 10 min idle → stop
    autoArchiveInterval: AUTO_ARCHIVE_MINUTES,
  }, { timeout: 60 })

  const previewLink = await sandbox.getSignedPreviewUrl(5173, 86400).catch(() => null)

  // Save to DB
  const sandboxId = `sb_${teamId.slice(0, 8)}_${Date.now()}`
  await db.run(
    `INSERT INTO sandbox_sessions (id, team_id, daytona_sandbox_id, status, preview_url, created_at, last_activity)
     VALUES ($1, $2, $3, 'running', $4, ${db.now()}, ${db.now()})`,
    [sandboxId, teamId, sandbox.id, previewLink?.url ?? null],
  )

  const session: SandboxSession = {
    sandbox,
    teamId,
    lastActivity: Date.now(),
    idleTimer: setTimeout(() => {}, 0),
  }
  resetIdleTimer(session)
  sessions.set(teamId, session)

  return session
}

/**
 * Check if an error indicates the sandbox needs to be resumed.
 */
function isSandboxNotStartedError(err: unknown): boolean {
  const msg = (err as Error).message ?? ''
  return msg.includes('Is the Sandbox started') || msg.includes('failed to resolve container IP') || msg.includes('ECONNREFUSED')
}

/**
 * Evict the in-memory session so getOrCreateSandbox will re-fetch and resume from DB.
 */
function evictSession(teamId: string): void {
  const session = sessions.get(teamId)
  if (session) clearTimeout(session.idleTimer)
  sessions.delete(teamId)
}

/**
 * Execute a shell command in the team's sandbox.
 * Auto-resumes the sandbox if it was stopped.
 */
export async function execCommand(db: Db, teamId: string, command: string, cwd?: string): Promise<ExecResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const session = await getOrCreateSandbox(db, teamId)
    resetIdleTimer(session)

    try {
      const result = await session.sandbox.process.executeCommand(command, cwd, undefined, 120)
      return {
        stdout: result.artifacts?.stdout ?? result.result ?? '',
        stderr: '',
        exitCode: result.exitCode,
      }
    } catch (err) {
      if (isSandboxNotStartedError(err) && attempt === 0) {
        console.log(`[sandbox] Sandbox not started for team ${teamId}, evicting and retrying...`)
        evictSession(teamId)
        continue
      }
      return {
        stdout: '',
        stderr: (err as Error).message,
        exitCode: 1,
      }
    }
  }
  return { stdout: '', stderr: 'Failed to execute command after retry', exitCode: 1 }
}

/**
 * Write a file in the team's sandbox.
 * Auto-resumes the sandbox if it was stopped.
 */
export async function sandboxWriteFile(db: Db, teamId: string, path: string, content: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const session = await getOrCreateSandbox(db, teamId)
    resetIdleTimer(session)
    try {
      await session.sandbox.fs.uploadFile(Buffer.from(content, 'utf-8'), path)
      return
    } catch (err) {
      if (isSandboxNotStartedError(err) && attempt === 0) {
        console.log(`[sandbox] Sandbox not started for team ${teamId}, evicting and retrying...`)
        evictSession(teamId)
        continue
      }
      throw err
    }
  }
}

/**
 * Read a file from the team's sandbox.
 * Auto-resumes the sandbox if it was stopped.
 */
export async function sandboxReadFile(db: Db, teamId: string, path: string): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const session = await getOrCreateSandbox(db, teamId)
    resetIdleTimer(session)
    try {
      const buffer = await session.sandbox.fs.downloadFile(path)
      return buffer.toString('utf-8')
    } catch (err) {
      if (isSandboxNotStartedError(err) && attempt === 0) {
        console.log(`[sandbox] Sandbox not started for team ${teamId}, evicting and retrying...`)
        evictSession(teamId)
        continue
      }
      throw err
    }
  }
  throw new Error('Failed to read file after retry')
}

/**
 * List files in a directory in the team's sandbox.
 * Auto-resumes the sandbox if it was stopped.
 */
export async function sandboxListFiles(db: Db, teamId: string, dir: string): Promise<FileEntry[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const session = await getOrCreateSandbox(db, teamId)
    resetIdleTimer(session)
    try {
      const files = await session.sandbox.fs.listFiles(dir || '/')
      return files.map(f => ({
        name: f.name,
        path: dir ? `${dir.replace(/\/+$/, '')}/${f.name}` : `/${f.name}`,
        isDirectory: f.isDir,
        size: f.size ?? 0,
      }))
    } catch (err) {
      if (isSandboxNotStartedError(err) && attempt === 0) {
        console.log(`[sandbox] Sandbox not started for team ${teamId}, evicting and retrying...`)
        evictSession(teamId)
        continue
      }
      throw err
    }
  }
  return []
}

/**
 * Get the public preview URL for a port in the team's sandbox.
 * Auto-resumes the sandbox if it was stopped.
 */
export async function getPreviewUrl(db: Db, teamId: string, port: number): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const session = await getOrCreateSandbox(db, teamId)
    resetIdleTimer(session)
    try {
      // Use signed URL to skip Daytona's interstitial warning page
      const signed = await session.sandbox.getSignedPreviewUrl(port, 86400)

      // Update preview URL in DB
      await db.run(
        `UPDATE sandbox_sessions SET preview_url = $1, last_activity = ${db.now()} WHERE team_id = $2`,
        [signed.url, teamId],
      )

      // Broadcast to dashboard so PreviewPanel auto-opens
      if (sandboxBroadcast) sandboxBroadcast(teamId, signed.url)

      return signed.url
    } catch (err) {
      if (isSandboxNotStartedError(err) && attempt === 0) {
        console.log(`[sandbox] Sandbox not started for team ${teamId}, evicting and retrying...`)
        evictSession(teamId)
        continue
      }
      throw err
    }
  }
  throw new Error('Failed to get preview URL after retry')
}

/**
 * Set a startup command that will be re-run whenever the sandbox resumes from stopped/archived state.
 * Typically used to restart the dev server (e.g. "cd /home/daytona/app && npm run dev &").
 */
export async function setStartupCommand(db: Db, teamId: string, command: string): Promise<void> {
  const session = sessions.get(teamId)
  if (session) session.startupCommand = command
  await db.run(
    'UPDATE sandbox_sessions SET startup_command = $1 WHERE team_id = $2',
    [command, teamId],
  )
}

/**
 * Stop the team's sandbox (preserves state for later resume).
 */
export async function stopSandbox(db: Db, teamId: string): Promise<void> {
  const session = sessions.get(teamId)
  if (session) {
    clearTimeout(session.idleTimer)
    try {
      await session.sandbox.stop()
    } catch (err) {
      console.error(`[sandbox] Failed to stop sandbox for team ${teamId}:`, (err as Error).message)
    }
    sessions.delete(teamId)
  }

  await db.run(
    `UPDATE sandbox_sessions SET status = 'stopped', last_activity = ${db.now()} WHERE team_id = $1`,
    [teamId],
  )
}

/**
 * Get sandbox status for a team (from DB, doesn't wake the sandbox).
 */
export async function getSandboxStatus(db: Db, teamId: string): Promise<{
  status: string
  previewUrl: string | null
  createdAt: string
  lastActivity: string
} | null> {
  const row = await db.queryOne<{
    status: string
    preview_url: string | null
    created_at: string
    last_activity: string
  }>(
    'SELECT status, preview_url, created_at, last_activity FROM sandbox_sessions WHERE team_id = $1',
    [teamId],
  )
  if (!row) return null
  return {
    status: row.status,
    previewUrl: row.preview_url,
    createdAt: row.created_at,
    lastActivity: row.last_activity,
  }
}

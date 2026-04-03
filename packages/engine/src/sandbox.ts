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

        // Re-run ALL project startup commands after resume (not just the last one)
        // Redirect output to /dev/null to avoid flooding Railway's 500 logs/sec limit.
        if (wasResumed) {
          try {
            const projects = await listSandboxProjects(db, teamId)
            for (const project of projects) {
              if (project.startupCommand) {
                console.log(`[sandbox] Re-starting "${project.name}" on port ${project.devPort}`)
                const silentCmd = project.startupCommand.replace(/ &$/, ' > /dev/null 2>&1 &')
                await session.sandbox.process.executeCommand(silentCmd, undefined, undefined, 15).catch(() => {})
              }
            }
          } catch (err) {
            console.error(`[sandbox] Failed to restart project servers:`, (err as Error).message)
          }
        }
        // Legacy: also run the session-level startup command if no projects started
        if (wasResumed && row.startup_command) {
          console.log(`[sandbox] Re-running session startup command for team ${teamId}: ${row.startup_command}`)
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

// ---- Framework detection for imported projects ----

interface FrameworkInfo {
  name: string
  devCommand: string
  port: number
}

function detectFrameworkFromPackageJson(pkgJson: string): FrameworkInfo {
  try {
    const pkg = JSON.parse(pkgJson)
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }

    if (deps.vite || deps['@vitejs/plugin-react']) {
      return { name: 'vite', devCommand: 'npm run dev -- --host 0.0.0.0', port: 5173 }
    }
    if (deps.next) {
      return { name: 'next', devCommand: 'npm run dev', port: 3000 }
    }
    if (deps['react-scripts']) {
      return { name: 'cra', devCommand: 'npm start', port: 3000 }
    }
    if (deps.remix || deps['@remix-run/dev']) {
      return { name: 'remix', devCommand: 'npm run dev', port: 5173 }
    }
    if (deps.astro) {
      return { name: 'astro', devCommand: 'npm run dev -- --host 0.0.0.0', port: 4321 }
    }
    if (deps.svelte || deps['@sveltejs/kit']) {
      return { name: 'svelte', devCommand: 'npm run dev -- --host 0.0.0.0', port: 5173 }
    }
    // Fallback: generic Node.js project with Vite-like defaults
    return { name: 'node', devCommand: 'npm run dev -- --host 0.0.0.0', port: 5173 }
  } catch {
    return { name: 'unknown', devCommand: 'npx serve -s . -p 3000', port: 3000 }
  }
}

// Directories to ignore from various tools
const CLEANUP_DIRS = ['.lovable', '.bolt', '.replit']
const CLEANUP_FILES = ['lovable.config.ts', 'replit.nix', '.replit']

/**
 * Import a project from a Git URL into the team's sandbox.
 * Creates a new sandbox project, clones the repo, auto-detects framework, installs deps, starts dev server.
 * Never touches other projects — each import gets its own isolated directory.
 */
export async function importProject(db: Db, teamId: string, repoUrl: string, projectName?: string): Promise<{
  status: string
  framework: string
  port: number
  previewUrl?: string
  projectId: string
  projectDir: string
}> {
  // Derive project name from repo URL if not provided
  const derivedName = projectName ?? repoUrl.replace(/\.git$/, '').split('/').pop() ?? 'imported-app'

  // Create a new sandbox project (allocates unique dir + port)
  const project = await createSandboxProject(db, teamId, derivedName)
  const PROJECT_DIR = project.directory

  // 1. Clone the repo into the project directory
  console.log(`[sandbox:${project.slug}] Importing project from ${repoUrl} for team ${teamId}`)
  const cloneResult = await execCommand(db, teamId, `git clone --depth 1 "${repoUrl}" ${PROJECT_DIR}`)
  if (cloneResult.exitCode !== 0) {
    throw new Error(`Failed to clone repository: ${cloneResult.stderr || cloneResult.stdout}`)
  }

  // 2. Clean up tool-specific files
  const cleanupCmds = [
    ...CLEANUP_DIRS.map(d => `rm -rf ${PROJECT_DIR}/${d}`),
    ...CLEANUP_FILES.map(f => `rm -f ${PROJECT_DIR}/${f}`),
    `rm -rf ${PROJECT_DIR}/.git`, // remove git history to save space
  ]
  await execCommand(db, teamId, cleanupCmds.join(' && '))

  // 3. Detect framework
  let framework: FrameworkInfo
  const pkgResult = await execCommand(db, teamId, `cat ${PROJECT_DIR}/package.json 2>/dev/null`)
  if (pkgResult.exitCode === 0 && pkgResult.stdout.trim()) {
    framework = detectFrameworkFromPackageJson(pkgResult.stdout)
  } else {
    const htmlCheck = await execCommand(db, teamId, `test -f ${PROJECT_DIR}/index.html && echo "yes" || echo "no"`)
    if (htmlCheck.stdout.trim() === 'yes') {
      framework = { name: 'static', devCommand: 'npx serve -s . -p 3000', port: 3000 }
    } else {
      const pyCheck = await execCommand(db, teamId, `test -f ${PROJECT_DIR}/requirements.txt && echo "yes" || echo "no"`)
      if (pyCheck.stdout.trim() === 'yes') {
        framework = { name: 'python', devCommand: 'python -m http.server 3000', port: 3000 }
      } else {
        framework = { name: 'unknown', devCommand: 'npx serve -s . -p 3000', port: 3000 }
      }
    }
  }

  // Override port with project's allocated port
  const devPort = project.devPort ?? framework.port
  const devCommand = framework.devCommand.replace(/\d{4}$/, String(devPort))

  console.log(`[sandbox:${project.slug}] Detected framework: ${framework.name} for team ${teamId}`)

  // 4. Install dependencies
  if (pkgResult.exitCode === 0) {
    const installResult = await execCommand(db, teamId, `cd ${PROJECT_DIR} && npm install`)
    if (installResult.exitCode !== 0) {
      await execCommand(db, teamId, `cd ${PROJECT_DIR} && rm -rf node_modules package-lock.json && npm install`)
    }
  }

  // 5. Start dev server with project-specific port
  const startCmd = `cd ${PROJECT_DIR} && ${devCommand} &`
  await execCommand(db, teamId, startCmd)

  // 6. Save project metadata
  await updateSandboxProject(db, project.id, {
    framework: framework.name,
    startupCommand: startCmd,
    devPort,
  })

  // Also update the sandbox session startup command for resume
  await setStartupCommand(db, teamId, startCmd)

  // 7. Wait and get preview URL
  await new Promise(resolve => setTimeout(resolve, 5000))
  let previewUrl: string | undefined
  try {
    previewUrl = await getPreviewUrl(db, teamId, devPort)
    await updateSandboxProject(db, project.id, { previewUrl })
  } catch {
    // Preview not ready yet — caller can get it later
  }

  return {
    status: 'imported',
    framework: framework.name,
    port: devPort,
    previewUrl,
    projectId: project.id,
    projectDir: PROJECT_DIR,
  }
}

// ---- Sandbox Project Management ----

export interface SandboxProject {
  id: string
  teamId: string
  name: string
  slug: string
  directory: string
  framework: string | null
  devPort: number | null
  startupCommand: string | null
  previewUrl: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

const PROJECTS_BASE = '/home/daytona/projects'
const DEFAULT_PROJECT_DIR = `${PROJECTS_BASE}/_default`

/** Generate a URL-safe slug from a project name. */
function generateSlug(name: string): string {
  const base = name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 30)
    .replace(/-$/, '')
  const suffix = Math.random().toString(36).slice(2, 6)
  return `${base}-${suffix}`
}

/** Create a new sandbox project. Returns the project with its directory created. */
export async function createSandboxProject(db: Db, teamId: string, name: string, opts?: {
  framework?: string; devPort?: number
}): Promise<SandboxProject> {
  const id = `sp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const slug = generateSlug(name)
  const directory = `${PROJECTS_BASE}/${slug}`

  // Assign a unique dev port — find next available starting from 5173
  let devPort = opts?.devPort ?? 5173
  if (!opts?.devPort) {
    const existing = await db.query<{ dev_port: number | null }>(
      'SELECT dev_port FROM sandbox_projects WHERE team_id = $1 AND is_active = true ORDER BY dev_port DESC LIMIT 1',
      [teamId],
    )
    if (existing.length > 0 && existing[0].dev_port) {
      devPort = existing[0].dev_port + 1
    }
  }

  await db.run(
    `INSERT INTO sandbox_projects (id, team_id, name, slug, directory, framework, dev_port, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
    [id, teamId, name, slug, directory, opts?.framework ?? null, devPort],
  )

  // Create the directory in the sandbox
  await execCommand(db, teamId, `mkdir -p ${directory}`)

  console.log(`[sandbox] Created project "${name}" → ${directory} (port ${devPort}) for team ${teamId}`)

  // Auto-create a Projects/{name}/ directory in the workspace
  try {
    const { writeFile } = await import('./workspace.ts')
    await writeFile(db, teamId, `Projects/${name}/.gitkeep`, '', 'system')
  } catch {
    // Best-effort — don't fail project creation if workspace init fails
  }

  return (await getSandboxProject(db, id))!
}

/** Get a sandbox project by ID. */
export async function getSandboxProject(db: Db, id: string): Promise<SandboxProject | null> {
  const row = await db.queryOne<Record<string, unknown>>(
    'SELECT * FROM sandbox_projects WHERE id = $1', [id],
  )
  return row ? rowToSandboxProject(row) : null
}

/** List active sandbox projects for a team. */
export async function listSandboxProjects(db: Db, teamId: string): Promise<SandboxProject[]> {
  const rows = await db.query<Record<string, unknown>>(
    'SELECT * FROM sandbox_projects WHERE team_id = $1 AND is_active = true ORDER BY created_at DESC',
    [teamId],
  )
  return rows.map(rowToSandboxProject)
}

/** Get the default project directory for backward compat. Creates _default project if needed. */
export async function getOrCreateDefaultProject(db: Db, teamId: string): Promise<SandboxProject> {
  const existing = await db.queryOne<Record<string, unknown>>(
    `SELECT * FROM sandbox_projects WHERE team_id = $1 AND slug = '_default'`, [teamId],
  )
  if (existing) return rowToSandboxProject(existing)

  const id = `sp_default_${teamId.slice(0, 8)}`
  await db.run(
    `INSERT INTO sandbox_projects (id, team_id, name, slug, directory, dev_port, is_active) VALUES ($1, $2, $3, $4, $5, $6, true)`,
    [id, teamId, 'Default Project', '_default', DEFAULT_PROJECT_DIR, 5173],
  )
  // Create directory + symlink for backward compat
  await execCommand(db, teamId, `mkdir -p ${DEFAULT_PROJECT_DIR}`)
  // Symlink /home/daytona/app → /home/daytona/projects/_default for backward compat
  await execCommand(db, teamId, `[ -L /home/daytona/app ] || [ ! -e /home/daytona/app ] && ln -sfn ${DEFAULT_PROJECT_DIR} /home/daytona/app || true`)

  return (await getSandboxProject(db, id))!
}

/** Update a sandbox project's fields. */
export async function updateSandboxProject(db: Db, id: string, updates: Partial<Pick<SandboxProject, 'framework' | 'startupCommand' | 'previewUrl' | 'devPort' | 'isActive'>>): Promise<void> {
  const fields: string[] = []
  const values: unknown[] = []
  let paramIdx = 1
  if (updates.framework !== undefined) { fields.push(`framework = $${paramIdx++}`); values.push(updates.framework) }
  if (updates.startupCommand !== undefined) { fields.push(`startup_command = $${paramIdx++}`); values.push(updates.startupCommand) }
  if (updates.previewUrl !== undefined) { fields.push(`preview_url = $${paramIdx++}`); values.push(updates.previewUrl) }
  if (updates.devPort !== undefined) { fields.push(`dev_port = $${paramIdx++}`); values.push(updates.devPort) }
  if (updates.isActive !== undefined) { fields.push(`is_active = $${paramIdx++}`); values.push(updates.isActive) }
  if (fields.length === 0) return
  fields.push(`updated_at = ${db.now()}`)
  values.push(id)
  await db.run(`UPDATE sandbox_projects SET ${fields.join(', ')} WHERE id = $${paramIdx}`, values)
}

/**
 * Start (or restart) a specific project's dev server.
 * Called when a human opens the preview or when an agent sprints on the project.
 */
export async function startProjectDevServer(db: Db, teamId: string, projectId: string): Promise<{ started: boolean; port: number }> {
  const project = await getSandboxProject(db, projectId)
  if (!project) throw new Error(`Project ${projectId} not found`)

  // Ensure sandbox is running
  await getOrCreateSandbox(db, teamId)

  const port = project.devPort ?? 5173

  // Check if dev server is already running on this port by fetching the preview URL.
  // getPreviewUrl always returns a signed Daytona URL even if nothing is listening,
  // so we must actually probe the URL to confirm the server is alive.
  try {
    const url = await getPreviewUrl(db, teamId, port)
    if (url) {
      const probe = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(4000) }).catch(() => null)
      if (probe && probe.ok) return { started: true, port } // actually running
    }
  } catch { /* not running — start it */ }

  // Use stored startup command, or generate one from project directory + port
  const startCmd = project.startupCommand
    ?? `cd ${project.directory} && npm run dev -- --host 0.0.0.0 --port ${port} &`

  // Ensure dependencies are installed before starting.
  // Redirect output to /dev/null to avoid flooding Railway's 500 logs/sec limit.
  console.log(`[sandbox] Ensuring deps for "${project.name}" in ${project.directory}`)
  const installResult = await execCommand(db, teamId, `cd ${project.directory} && npm install > /dev/null 2>&1`)
  if (installResult.exitCode !== 0) {
    console.log(`[sandbox] npm install failed, force-reinstalling deps for "${project.name}"...`)
    await execCommand(db, teamId, `cd ${project.directory} && rm -rf node_modules package-lock.json && npm install > /dev/null 2>&1`)
  }

  console.log(`[sandbox] Starting dev server for "${project.name}" on port ${port}`)
  await execCommand(db, teamId, startCmd.replace(/ &$/, ' > /dev/null 2>&1 &'))

  // Save the startup command for future use if it wasn't stored
  if (!project.startupCommand) {
    await updateSandboxProject(db, projectId, { startupCommand: startCmd })
  }

  // Wait for server to boot
  await new Promise(resolve => setTimeout(resolve, 5000))

  // Update preview URL
  try {
    const previewUrl = await getPreviewUrl(db, teamId, port)
    await updateSandboxProject(db, projectId, { previewUrl })
  } catch { /* best-effort */ }

  return { started: true, port }
}

/** Validate that a path is within the given project directory. Throws on escape. */
export function validateProjectPath(path: string, projectDir: string): string {
  const resolved = normalizeSandboxPathToProject(path, projectDir)
  if (!resolved.startsWith(projectDir + '/') && resolved !== projectDir) {
    throw new Error(`Path "${path}" is outside the active project "${projectDir}". Cannot access files outside the active project.`)
  }
  return resolved
}

/** Normalize a file path to the given project directory. */
export function normalizeSandboxPathToProject(path: string, projectDir: string): string {
  // Already within this project dir
  if (path.startsWith(projectDir + '/') || path === projectDir) return path
  // Rewrite /home/daytona/<other-name>/... to this project dir
  const m = path.match(/^\/home\/daytona\/(?:app|projects\/[^/]+|[^/]+)\/(.+)$/)
  if (m) return `${projectDir}/${m[1]}`
  // Bare /home/daytona/<anything> → project dir
  if (/^\/home\/daytona\/[^/]+$/.test(path)) return projectDir
  // Relative path → prefix with project dir
  if (!path.startsWith('/')) return `${projectDir}/${path.replace(/^\.\//, '')}`
  return path
}

/** Normalize cd commands in shell strings to the project directory. */
export function normalizeSandboxCommandToProject(command: string, projectDir: string): string {
  return command.replace(/\/home\/daytona\/(?:app|[^/\s&]+)/g, projectDir)
}

function rowToSandboxProject(row: Record<string, unknown>): SandboxProject {
  return {
    id: row.id as string,
    teamId: row.team_id as string,
    name: row.name as string,
    slug: row.slug as string,
    directory: row.directory as string,
    framework: (row.framework as string | null) ?? null,
    devPort: (row.dev_port as number | null) ?? null,
    startupCommand: (row.startup_command as string | null) ?? null,
    previewUrl: (row.preview_url as string | null) ?? null,
    isActive: row.is_active === true || row.is_active === 1,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
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

/**
 * Scaffold a minimal Vite + React + TypeScript + Tailwind v4 project.
 * Used when project source files are missing and need to be regenerated.
 */
export async function scaffoldViteProject(db: Db, teamId: string, dir: string, name: string, port: number): Promise<void> {
  // Clean up any leftover files
  await execCommand(db, teamId, `rm -rf ${dir} && mkdir -p ${dir}/src`)

  const files: Array<{ path: string; content: string }> = [
    {
      path: `${dir}/package.json`,
      content: JSON.stringify({
        name: name.toLowerCase().replace(/\s+/g, '-'),
        private: true,
        version: '0.0.0',
        type: 'module',
        scripts: {
          dev: 'vite',
          build: 'tsc -b && vite build',
          preview: 'vite preview',
        },
        dependencies: {
          react: '^19.0.0',
          'react-dom': '^19.0.0',
        },
        devDependencies: {
          '@types/react': '^19.0.0',
          '@types/react-dom': '^19.0.0',
          '@vitejs/plugin-react': '^4.4.0',
          '@tailwindcss/vite': '^4.0.0',
          tailwindcss: '^4.0.0',
          typescript: '~5.7.0',
          vite: '^6.2.0',
        },
      }, null, 2),
    },
    {
      path: `${dir}/index.html`,
      content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,
    },
    {
      path: `${dir}/vite.config.ts`,
      content: `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})`,
    },
    {
      path: `${dir}/tsconfig.json`,
      content: JSON.stringify({
        compilerOptions: {
          target: 'ES2020',
          useDefineForClassFields: true,
          lib: ['ES2020', 'DOM', 'DOM.Iterable'],
          module: 'ESNext',
          skipLibCheck: true,
          moduleResolution: 'bundler',
          allowImportingTsExtensions: true,
          isolatedModules: true,
          moduleDetection: 'force',
          noEmit: true,
          jsx: 'react-jsx',
          strict: true,
          noUnusedLocals: false,
          noUnusedParameters: false,
        },
        include: ['src'],
      }, null, 2),
    },
    {
      path: `${dir}/src/main.tsx`,
      content: `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)`,
    },
    {
      path: `${dir}/src/index.css`,
      content: `@import "tailwindcss";`,
    },
    {
      path: `${dir}/src/App.tsx`,
      content: `export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="text-center p-8 bg-white rounded-2xl shadow-xl max-w-md">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">${name}</h1>
        <p className="text-gray-600">Project scaffolded successfully. Ready for development.</p>
      </div>
    </div>
  )
}`,
    },
  ]

  for (const file of files) {
    await sandboxWriteFile(db, teamId, file.path, file.content)
  }

  // Install dependencies
  const installResult = await execCommand(db, teamId, `cd ${dir} && npm install`)
  if (installResult.exitCode !== 0) {
    console.error(`[sandbox] npm install failed during scaffold: ${installResult.stdout.slice(-300)}`)
    throw new Error('Failed to install dependencies during project scaffold')
  }

  console.log(`[sandbox] Scaffolded fresh Vite project "${name}" in ${dir}`)
}

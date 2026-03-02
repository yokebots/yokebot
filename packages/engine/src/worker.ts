/**
 * worker.ts — Standalone scheduler process
 *
 * Runs agent heartbeats, email sequences, and workflow schedules
 * in a separate process from the API server. This prevents long-running
 * LLM calls from blocking HTTP responses.
 *
 * Started alongside index.ts in the Docker container.
 */

import 'dotenv/config'
import { homedir } from 'os'
import { join } from 'path'
import { createDb } from './db/index.ts'
import { startScheduler, stopScheduler } from './scheduler.ts'
import { initWorkspace, type WorkspaceConfig } from './workspace.ts'
import { setFallbackConfig, setHostedResolver, resolveModelConfig } from './model.ts'

const DATA_DIR = process.env.YOKEBOT_DATA_DIR ?? join(homedir(), '.yokebot')
const WORKSPACE_DIR = process.env.YOKEBOT_WORKSPACE_DIR ?? join(DATA_DIR, 'workspace')
const SKILLS_DIR = process.env.YOKEBOT_SKILLS_DIR ?? join(process.cwd(), '..', '..', 'skills')

async function main() {
  console.log('[worker] Starting scheduler worker...')

  const db = await createDb({ dataDir: DATA_DIR })

  // Register hosted mode routing if enabled
  if (process.env.YOKEBOT_HOSTED_MODE === 'true') {
    try {
      const eePath = '../../../ee/hosted-routing.js'
      const ee = await import(/* @vite-ignore */ eePath) as { hostedResolveModelConfig: typeof resolveModelConfig }
      setHostedResolver(ee.hostedResolveModelConfig)
      console.log('[worker] Hosted mode enabled — using env var routing')
    } catch (err) {
      console.error('[worker] Failed to load hosted routing module:', (err as Error).message)
    }
  }

  // Initialize workspace (needed by heartbeat runtime)
  const workspaceConfig: WorkspaceConfig = { rootDir: WORKSPACE_DIR }
  initWorkspace(workspaceConfig)

  // Configure model fallback
  if (process.env.YOKEBOT_FALLBACK_ENDPOINT) {
    setFallbackConfig({
      endpoint: process.env.YOKEBOT_FALLBACK_ENDPOINT,
      model: process.env.YOKEBOT_FALLBACK_MODEL ?? 'deepseek-chat',
      apiKey: process.env.YOKEBOT_FALLBACK_API_KEY,
    })
  }

  // Start the scheduler
  await startScheduler(db, workspaceConfig, SKILLS_DIR)

  console.log(`[worker] Scheduler running. Skills: ${SKILLS_DIR}`)

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[worker] Shutting down...')
    stopScheduler()
    await db.close()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

// Prevent crash-loop
process.on('uncaughtException', (err) => {
  console.error('[worker] UNCAUGHT EXCEPTION (process staying alive):', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[worker] UNHANDLED REJECTION (process staying alive):', reason)
})

main().catch((err) => {
  console.error('[worker] Fatal startup error:', err)
  process.exit(1)
})

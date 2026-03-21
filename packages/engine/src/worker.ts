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
import { startScheduler, drainScheduler } from './scheduler.ts'
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

  // Wire broadcast callbacks to relay SSE events through the API server
  // The worker has no SSE connections — it POSTs events to the API server's internal endpoint
  {
    const API_PORT = process.env.YOKEBOT_PORT || '3001'
    const API_BASE = `http://127.0.0.1:${API_PORT}`
    const INTERNAL_SECRET = process.env.INTERNAL_BROADCAST_SECRET || 'yokebot-internal-broadcast'

    const relay = (event: string, teamId: string, data: unknown) => {
      fetch(`${API_BASE}/internal/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': INTERNAL_SECRET },
        body: JSON.stringify({ event, teamId, data }),
      }).then(res => {
        if (!res.ok) console.error(`[worker] Relay failed: ${event} → ${res.status}`)
      }).catch((err) => {
        console.error(`[worker] Relay error: ${event} →`, (err as Error).message)
      })
    }

    const { setNewMessageBroadcast, setAgentTypingBroadcast, setAgentProgressBroadcast, setFileWrittenBroadcast } = await import('./chat.ts')
    setAgentTypingBroadcast((teamId, data) => relay('agent_typing', teamId, data))
    setAgentProgressBroadcast((teamId, data) => relay('agent_progress', teamId, data))
    setNewMessageBroadcast((teamId, channelId, messageId) => relay('new_message', teamId, { channelId, messageId }))
    setFileWrittenBroadcast((teamId, path) => relay('file_written', teamId, { path }))
    console.log('[worker] Broadcast relay configured → API server')
  }

  // Start the scheduler
  await startScheduler(db, workspaceConfig, SKILLS_DIR)

  console.log(`[worker] Scheduler running. Skills: ${SKILLS_DIR}`)

  // Graceful shutdown — drain in-flight sprints before exiting
  const shutdown = async () => {
    console.log('[worker] Draining sprints...')
    await drainScheduler(280_000)
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

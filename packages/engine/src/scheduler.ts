/**
 * scheduler.ts — Heartbeat / cron system + proactive mode
 *
 * Each agent has a heartbeat interval. On each beat the scheduler
 * checks: is there work to do? For proactive agents, it also asks
 * the agent to think about what SHOULD be done.
 *
 * Heartbeats are STAGGERED so agents on the same team don't all fire
 * at once. This lets agents see each other's outputs and collaborate
 * naturally, rather than all acting on stale state simultaneously.
 */

import type { Db } from './db/types.ts'
import { listAgents, type Agent } from './agent.ts'
import { runReactLoop, buildAgentSystemPrompt } from './runtime.ts'
import { resolveModelConfig } from './model.ts'
import { getDmChannel, sendMessage } from './chat.ts'
import type { WorkspaceConfig } from './workspace.ts'
import { logActivity } from './activity.ts'
import { getSubscription, isTeamActive, getCreditBalance, getModelCreditCost } from './billing.ts'
// import { listTasks } from './tasks.ts' // Reserved for future staleness detection

const HOSTED_MODE = process.env.YOKEBOT_HOSTED_MODE === 'true'

interface SchedulerState {
  timers: Map<string, ReturnType<typeof setTimeout>>
  running: boolean
  workspaceConfig: WorkspaceConfig | null
  skillsDir: string
}

const state: SchedulerState = {
  timers: new Map(),
  running: false,
  workspaceConfig: null,
  skillsDir: '',
}

// Email sequence processing interval (check every 5 minutes)
let sequenceTimer: ReturnType<typeof setInterval> | null = null

/**
 * Start the scheduler. Registers staggered heartbeat timers for each running agent.
 */
export async function startScheduler(db: Db, workspaceConfig?: WorkspaceConfig, skillsDir?: string): Promise<void> {
  if (state.running) return
  state.running = true
  if (workspaceConfig) state.workspaceConfig = workspaceConfig
  if (skillsDir) state.skillsDir = skillsDir

  const agents = await listAgents(db)
  const running = agents.filter((a) => a.status === 'running')

  // Group by team + heartbeat interval for staggering
  const groups = new Map<string, Agent[]>()
  for (const agent of running) {
    const key = `${agent.teamId}:${agent.heartbeatSeconds}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(agent)
  }

  for (const [, group] of groups) {
    const intervalMs = group[0].heartbeatSeconds * 1000
    const staggerMs = Math.floor(intervalMs / group.length)

    group.forEach((agent, index) => {
      const offsetMs = index * staggerMs
      scheduleAgentWithOffset(db, agent, offsetMs)
    })
  }

  // Start email sequence processor (every 5 minutes)
  if (!sequenceTimer) {
    sequenceTimer = setInterval(() => {
      void processEmailSequences(db)
    }, 5 * 60 * 1000)
    // Run once on startup after a short delay
    setTimeout(() => void processEmailSequences(db), 30_000)
  }

  console.log(`[scheduler] Started with ${state.timers.size} agent(s)`)
}

/**
 * Stop the scheduler and clear all timers.
 */
export function stopScheduler(): void {
  for (const [id, timer] of state.timers) {
    clearTimeout(timer)
    state.timers.delete(id)
  }
  if (sequenceTimer) {
    clearInterval(sequenceTimer)
    sequenceTimer = null
  }
  state.running = false
  console.log('[scheduler] Stopped')
}

/**
 * Register a heartbeat timer for a specific agent.
 * Calculates a stagger offset based on other agents on the same team.
 */
export function scheduleAgent(db: Db, agent: Agent): void {
  // Clear existing timer if any
  unscheduleAgent(agent.id)

  // Calculate stagger offset relative to existing timers on the same team
  let sameTeamCount = 0
  for (const [, ] of state.timers) {
    sameTeamCount++ // approximate — the exact offset is best-effort
  }

  const intervalMs = agent.heartbeatSeconds * 1000
  const offsetMs = (sameTeamCount * Math.floor(intervalMs / (sameTeamCount + 1))) % intervalMs

  scheduleAgentWithOffset(db, agent, offsetMs)
}

/**
 * Schedule an agent with a specific initial offset delay.
 * After the initial offset, it loops on a regular interval.
 */
function scheduleAgentWithOffset(db: Db, agent: Agent, offsetMs: number): void {
  unscheduleAgent(agent.id)

  const intervalMs = agent.heartbeatSeconds * 1000

  // First heartbeat after offset delay, then repeating
  const startTimer = setTimeout(() => {
    void heartbeat(db, agent)

    // Set up recurring heartbeat
    const recurring = setInterval(() => {
      void heartbeat(db, agent)
    }, intervalMs)

    // Store the interval timer (replacing the timeout reference)
    state.timers.set(agent.id, recurring as unknown as ReturnType<typeof setTimeout>)
  }, offsetMs)

  state.timers.set(agent.id, startTimer)
  console.log(`[scheduler] Agent "${agent.name}" heartbeat every ${agent.heartbeatSeconds}s (offset: ${Math.round(offsetMs / 1000)}s)`)
}

/**
 * Immediately trigger an agent's heartbeat (bypasses normal interval).
 * Used when an agent is @mentioned in chat to wake it up instantly.
 */
export async function triggerAgentNow(db: Db, agentId: string, teamId: string): Promise<void> {
  const { getAgent } = await import('./agent.ts')
  const agent = await getAgent(db, agentId)
  if (!agent || agent.status !== 'running') return
  if (agent.teamId !== teamId) return

  // Cancel existing timer and re-schedule with zero offset (fires immediately)
  unscheduleAgent(agentId)
  scheduleAgentWithOffset(db, agent, 0)
  console.log(`[scheduler] Immediately triggered agent "${agent.name}" via @mention`)
}

/**
 * Remove the heartbeat timer for an agent.
 */
export function unscheduleAgent(agentId: string): void {
  const timer = state.timers.get(agentId)
  if (timer) {
    clearTimeout(timer)
    clearInterval(timer)
    state.timers.delete(agentId)
  }
}

// --- Future: staleness detection ---
// Uncomment buildStalenessContext() and add to heartbeat prompt when ready to test.
// See git history for the full implementation.
//
// async function buildStalenessContext(db: Db, agentId: string, teamId: string): Promise<string> {
//   const tasks = await listTasks(db, { agentId, teamId, status: 'in_progress' })
//   const now = Date.now()
//   const lines: string[] = []
//   for (const task of tasks) {
//     const hours = (now - new Date(task.updatedAt).getTime()) / (1000 * 60 * 60)
//     if (hours >= 2) {
//       lines.push(`⚠ STALE: "${task.title}" in-progress ${Math.round(hours)}h with no update.`)
//     }
//   }
//   return lines.join('\n')
// }

/**
 * Single heartbeat cycle for an agent.
 */
async function heartbeat(db: Db, agent: Agent): Promise<void> {
  // In hosted mode, skip heartbeat if team has no active subscription and no credits
  if (HOSTED_MODE) {
    const sub = await getSubscription(db, agent.teamId)
    const creditBalance = await getCreditBalance(db, agent.teamId)
    if (!isTeamActive(sub, creditBalance)) {
      console.log(`[scheduler] Skipping heartbeat for "${agent.name}" — no active subscription or credits`)
      return
    }
  }

  // Check credit balance before running heartbeat (hosted mode)
  if (HOSTED_MODE && agent.modelId) {
    const balance = await getCreditBalance(db, agent.teamId)
    const cost = await getModelCreditCost(db, agent.modelId)
    if (cost > 0 && balance < cost) {
      console.log(`[scheduler] Skipping heartbeat for "${agent.name}" — insufficient credits (${balance} < ${cost})`)
      return
    }
  }

  // Check if within active hours
  const hour = new Date().getHours()
  if (hour < agent.activeHoursStart || hour >= agent.activeHoursEnd) {
    return // Outside active hours, skip
  }

  // For proactive agents: prompt the agent to review its state
  if (agent.proactive) {
    // Resolve logical model ID → real endpoint + API key
    const modelConfig = await resolveModelConfig(db, agent.modelId || agent.modelEndpoint)

    const systemPrompt = buildAgentSystemPrompt(agent.name, agent.systemPrompt)

    const proactivePrompt = [
      'This is a scheduled check-in. Before taking any action, use the "think" tool to:',
      '1. ASSESS — Review your current tasks, goals, messages, and pending approvals.',
      '2. PRIORITIZE — Decide what is most important right now (urgent tasks first, then messages, then proactive ideas).',
      '3. PLAN — Outline the specific actions you will take this check-in and in what order.',
      'Then execute your plan step by step. Use "think" again before any complex or multi-step action.',
      'If after assessment there is genuinely nothing to do, respond with "[no-op]".',
      'If you notice pending approvals that need human attention, remind about them.',
    ].join('\n')

    if (!state.workspaceConfig) {
      console.error(`[scheduler] No workspace config available for heartbeat`)
      return
    }

    try {
      // AdvisorBot is always free — skip credit deduction
      const runtimeConfig = agent.templateId === 'advisor-bot'
        ? { maxIterations: 10, skipCredits: true }
        : undefined
      const result = await runReactLoop(db, agent.id, agent.teamId, proactivePrompt, modelConfig, systemPrompt, state.workspaceConfig, state.skillsDir, runtimeConfig, agent.modelId || undefined)
      if (result.response && !result.response.includes('[no-op]')) {
        // Route proactive messages to the agent's DM channel
        const dmChannel = await getDmChannel(db, agent.id, agent.teamId)
        await sendMessage(db, dmChannel.id, 'agent', agent.id, result.response, undefined, agent.teamId)
        await logActivity(db, 'heartbeat_proactive', agent.id, `Proactive check-in: ${result.response.slice(0, 150)}`, undefined, agent.teamId)
        console.log(`[scheduler] Proactive message from "${agent.name}" posted to DM`)
      }
    } catch (err) {
      console.error(`[scheduler] Heartbeat error for "${agent.name}":`, err)
    }
  }
}

/**
 * Process pending email sequence sends.
 */
async function processEmailSequences(db: Db): Promise<void> {
  try {
    const { processSequenceSends } = await import('./email-sequences.ts')
    const sent = await processSequenceSends(db)
    if (sent > 0) {
      console.log(`[scheduler] Processed ${sent} email sequence send(s)`)
    }
  } catch (err) {
    console.error('[scheduler] Email sequence processing error:', err instanceof Error ? err.message : err)
  }
}

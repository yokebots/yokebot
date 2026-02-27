/**
 * scheduler.ts — Heartbeat / cron system + proactive mode
 *
 * Each agent has a heartbeat interval. On each beat the scheduler
 * checks: is there work to do? For proactive agents, it also asks
 * the agent to think about what SHOULD be done.
 */

import type Database from 'better-sqlite3'
import { listAgents, type Agent } from './agent.ts'
import { runReactLoop } from './runtime.ts'
import type { ModelConfig } from './model.ts'

interface SchedulerState {
  timers: Map<string, ReturnType<typeof setInterval>>
  running: boolean
}

const state: SchedulerState = {
  timers: new Map(),
  running: false,
}

/**
 * Start the scheduler. Registers a heartbeat timer for each running agent.
 */
export function startScheduler(db: Database.Database): void {
  if (state.running) return
  state.running = true

  const agents = listAgents(db)
  for (const agent of agents) {
    if (agent.status === 'running') {
      scheduleAgent(db, agent)
    }
  }

  console.log(`[scheduler] Started with ${state.timers.size} agent(s)`)
}

/**
 * Stop the scheduler and clear all timers.
 */
export function stopScheduler(): void {
  for (const [id, timer] of state.timers) {
    clearInterval(timer)
    state.timers.delete(id)
  }
  state.running = false
  console.log('[scheduler] Stopped')
}

/**
 * Register a heartbeat timer for a specific agent.
 */
export function scheduleAgent(db: Database.Database, agent: Agent): void {
  // Clear existing timer if any
  unscheduleAgent(agent.id)

  const intervalMs = agent.heartbeatSeconds * 1000

  const timer = setInterval(() => {
    void heartbeat(db, agent)
  }, intervalMs)

  state.timers.set(agent.id, timer)
  console.log(`[scheduler] Agent "${agent.name}" heartbeat every ${agent.heartbeatSeconds}s`)
}

/**
 * Remove the heartbeat timer for an agent.
 */
export function unscheduleAgent(agentId: string): void {
  const timer = state.timers.get(agentId)
  if (timer) {
    clearInterval(timer)
    state.timers.delete(agentId)
  }
}

/**
 * Single heartbeat cycle for an agent.
 */
async function heartbeat(db: Database.Database, agent: Agent): Promise<void> {
  // Check if within active hours
  const hour = new Date().getHours()
  if (hour < agent.activeHoursStart || hour >= agent.activeHoursEnd) {
    return // Outside active hours, skip
  }

  // For proactive agents: prompt the agent to review its state
  if (agent.proactive) {
    const modelConfig: ModelConfig = {
      endpoint: agent.modelEndpoint,
      model: agent.modelName,
    }

    const systemPrompt = agent.systemPrompt ?? `You are ${agent.name}, a proactive AI agent.`
    const proactivePrompt = [
      'This is a scheduled check-in. Review your current tasks, goals, and any pending items.',
      'If there is nothing to do, simply respond with "[no-op]".',
      'If you have suggestions, reminders, or proactive ideas, share them.',
      'If you notice any pending approvals that need human attention, remind about them.',
    ].join(' ')

    try {
      const result = await runReactLoop(db, agent.id, proactivePrompt, modelConfig, systemPrompt)
      if (result.response && !result.response.includes('[no-op]')) {
        console.log(`[scheduler] Proactive message from "${agent.name}": ${result.response.slice(0, 100)}...`)
        // TODO: Route proactive messages to chat/notifications
      }
    } catch (err) {
      console.error(`[scheduler] Heartbeat error for "${agent.name}":`, err)
    }
  }
}

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
import { getDmChannel, sendMessage, listChannels, createChannel, getTeamChannel, findLatestTaskMessage, broadcastAgentStatus } from './chat.ts'
import type { WorkspaceConfig } from './workspace.ts'
import { logActivity } from './activity.ts'
import { getSubscription, isTeamActive, getCreditBalance, getModelCreditCost, getSprintBudget, deductCredits } from './billing.ts'
import { listTasks, getSubtasks, isBlocked as isTaskBlocked, blockTask, type Task } from './tasks.ts'
import { notifyTeam } from './notifications.ts'
import { getTaskThread, getChannelMessages, getMessage } from './chat.ts'

const HOSTED_MODE = process.env.YOKEBOT_HOSTED_MODE === 'true'

/**
 * Strip tool-call-like syntax from agent responses before posting to chat.
 * Weak models sometimes output [tool_name]...[/tool_name] as text instead of
 * actual function calls. This cleans it up so users see human-readable text only.
 */
function stripToolSyntax(text: string): string {
  // Remove [tag]...[/tag] blocks (update_task, respond, discord_post, draft_welcome_message, etc.)
  let cleaned = text.replace(/\[([a-z_]+)\][\s\S]*?\[\/\1\]/g, '')
  // Remove standalone [/tag] and [tag] that weren't matched as pairs
  cleaned = cleaned.replace(/\[\/?[a-z_]+\]/g, '')
  // Remove [/think] blocks that weren't caught by the chat renderer
  cleaned = cleaned.replace(/\[think\][\s\S]*?\[\/think\]/g, '')
  // Remove raw JSON tool-call arrays that weak models emit as text (e.g. [{"name":"think","parameters":{...}}])
  cleaned = cleaned.replace(/\[\s*\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"parameters"\s*:\s*\{[\s\S]*?\}\s*\}\s*\]/g, '')
  // Clean up excessive whitespace left behind
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim()
  return cleaned
}

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

/**
 * Initialize scheduler state (workspaceConfig + skillsDir) WITHOUT starting timers.
 * Call this from the API server so respondToMention/triggerAgentNow still work
 * even though heartbeats run in the separate worker process.
 */
export function initSchedulerState(workspaceConfig: WorkspaceConfig, skillsDir: string): void {
  state.workspaceConfig = workspaceConfig
  state.skillsDir = skillsDir
}

// Cache team active status to avoid hitting DB on every heartbeat (TTL: 60 seconds)
const teamActiveCache = new Map<string, { active: boolean; ts: number }>()
const TEAM_CACHE_TTL = 60_000

// Cache team timezone to avoid repeated DB lookups (TTL: 5 minutes)
const teamTimezoneCache = new Map<string, { tz: string | null; ts: number }>()
const TZ_CACHE_TTL = 300_000

// Per-team concurrency limiter — prevents one team from starving others
const MAX_CONCURRENT_PER_TEAM = 35
const activeHeartbeatsPerTeam = new Map<string, number>()

async function getTeamTimezoneCached(db: Db, teamId: string): Promise<string | null> {
  const cached = teamTimezoneCache.get(teamId)
  if (cached && Date.now() - cached.ts < TZ_CACHE_TTL) return cached.tz
  const row = await db.queryOne<{ timezone: string | null }>(
    'SELECT timezone FROM team_profiles WHERE team_id = $1', [teamId],
  )
  const tz = row?.timezone ?? null
  teamTimezoneCache.set(teamId, { tz, ts: Date.now() })
  return tz
}

async function isTeamActiveCached(db: Db, teamId: string): Promise<boolean> {
  const cached = teamActiveCache.get(teamId)
  if (cached && Date.now() - cached.ts < TEAM_CACHE_TTL) return cached.active
  const sub = await getSubscription(db, teamId)
  const balance = await getCreditBalance(db, teamId)
  const active = isTeamActive(sub, balance)
  teamActiveCache.set(teamId, { active, ts: Date.now() })
  return active
}

/** Invalidate the cache for a team (call after credit changes). */
export function invalidateTeamCache(teamId: string): void {
  teamActiveCache.delete(teamId)
}

// Email sequence processing interval (check every 5 minutes)
let sequenceTimer: ReturnType<typeof setInterval> | null = null

// Workflow schedule processing interval (check every 60 seconds)
let workflowTimer: ReturnType<typeof setInterval> | null = null
const lastWorkflowFired = new Map<string, number>()

/**
 * Start the scheduler. Registers staggered heartbeat timers for each running agent.
 */
export async function startScheduler(db: Db, workspaceConfig?: WorkspaceConfig, skillsDir?: string): Promise<void> {
  if (state.running) return
  state.running = true
  if (workspaceConfig) state.workspaceConfig = workspaceConfig
  if (skillsDir) state.skillsDir = skillsDir

  const agents = await listAgents(db)
  let running = agents.filter((a) => a.status === 'running')

  // In hosted mode, only schedule agents whose teams are active
  if (HOSTED_MODE) {
    const filtered: Agent[] = []
    for (const agent of running) {
      if (await isTeamActiveCached(db, agent.teamId)) {
        filtered.push(agent)
      }
    }
    const skipped = running.length - filtered.length
    if (skipped > 0) console.log(`[scheduler] Skipped ${skipped} agent(s) from inactive teams`)
    running = filtered
  }

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
      void processOnboardingDripEmails(db)
    }, 5 * 60 * 1000)
    // Run once on startup after a short delay
    setTimeout(() => {
      void processEmailSequences(db)
      void processOnboardingDripEmails(db)
    }, 30_000)
  }

  // Start workflow schedule processor (every 60 seconds)
  if (!workflowTimer) {
    workflowTimer = setInterval(() => {
      void processScheduledWorkflows(db)
    }, 60 * 1000)
  }

  // Periodic cache cleanup (every 5 min) — evict stale entries, unschedule inactive teams
  setInterval(() => {
    const now = Date.now()
    for (const [teamId, entry] of teamActiveCache) {
      if (now - entry.ts > TEAM_CACHE_TTL * 5) {
        teamActiveCache.delete(teamId)
      }
    }
  }, 5 * 60 * 1000)

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
  if (workflowTimer) {
    clearInterval(workflowTimer)
    workflowTimer = null
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
 * Respond to an @mention in a specific channel.
 * The agent reads recent context and replies in the same channel.
 */
export async function respondToMention(
  db: Db, agentId: string, teamId: string, channelId: string,
  triggerMessage: { senderId: string; content: string; parentMessageId?: number | null },
): Promise<void> {
  const startMs = Date.now()
  const { getAgent, setAgentStatus } = await import('./agent.ts')
  const { getChannelMessages } = await import('./chat.ts')
  const { chatCompletion } = await import('./model.ts')
  const agent = await getAgent(db, agentId)
  if (!agent) return
  if (agent.teamId !== teamId) return

  // Auto-resume paused agents on @mention — human signal means "wake up"
  if (agent.status === 'paused') {
    await setAgentStatus(db, agent.id, 'running')
    scheduleAgent(db, agent)
    console.log(`[scheduler] Auto-resumed "${agent.name}" on @mention`)
  } else if (agent.status !== 'running') {
    return
  }

  // Hard stop: no credits = no response
  if (HOSTED_MODE) {
    const balance = await getCreditBalance(db, teamId)
    if (balance <= 0) {
      console.log(`[scheduler] Skipping mention response for "${agent.name}" — zero credits (${balance})`)
      return
    }
  }

  let modelConfig
  try {
    modelConfig = await resolveModelConfig(db, agent.modelId || agent.modelEndpoint)
  } catch (err) {
    console.error(`[scheduler] Cannot resolve model for "${agent.name}":`, (err as Error).message)
    return
  }

  if (!state.workspaceConfig) return

  // ---- Phase 1: Quick acknowledgment (single LLM call, no tools) ----
  const recentMessages = await getChannelMessages(db, channelId, 10)
  const context = recentMessages
    .map((m) => `[${m.senderType === 'human' ? 'User' : m.senderId === agentId ? agent.name : 'Other'}]: ${m.content}`)
    .join('\n')

  const teamTz = await getTeamTimezoneCached(db, teamId) || 'America/New_York'
  const now = new Date()
  const today = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: teamTz })

  const ackMessages: Array<{ role: 'system' | 'user'; content: string }> = [
    {
      role: 'system',
      content: [
        `You are ${agent.name}. ${agent.systemPrompt}`,
        `Today is ${today}.`,
        `You were @mentioned. Reply immediately — be concise (under 500 characters).`,
        `If the request needs real work (creating files, generating images, searching the web, etc.), acknowledge it and say you're on it. You'll follow up when done.`,
        `If it's just a question or conversation, answer it directly.`,
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `Recent conversation in the channel:`,
        context,
        ``,
        `The user said: "${triggerMessage.content}"`,
      ].join('\n'),
    },
  ]

  let needsWork = false

  // Broadcast typing immediately so user sees the indicator
  broadcastAgentStatus(teamId, channelId, agent.id, agent.name, 'typing')

  try {
    const result = await chatCompletion(modelConfig, ackMessages)
    const reply = result.content?.trim()
    if (reply && reply.length > 0) {
      // Stop typing, post the ack message (in the same thread if the trigger was a thread reply)
      broadcastAgentStatus(teamId, channelId, agent.id, agent.name, 'idle')
      // Verify parent message belongs to the same channel before threading
      let replyParentId = triggerMessage.parentMessageId ?? undefined
      if (replyParentId) {
        const parentMsg = await getMessage(db, replyParentId)
        if (!parentMsg || parentMsg.channelId !== channelId) replyParentId = undefined
      }
      await sendMessage(db, channelId, 'agent', agent.id, reply, undefined, teamId, undefined, undefined, undefined, replyParentId)
      await logActivity(db, 'mention_response', agent.id, `Replied to @mention: ${reply.slice(0, 150)}`, undefined, teamId)

      if (HOSTED_MODE && agent.modelId) {
        const cost = await getModelCreditCost(db, agent.modelId)
        if (cost > 0) await deductCredits(db, teamId, cost, 'heartbeat_debit', `LLM: ${agent.modelId} (mention ack)`)
      }

      const elapsed = Date.now() - startMs
      console.log(`[scheduler] "${agent.name}" ack'd @mention in ${elapsed}ms`)

      // Heuristic: if the reply mentions working on it / getting on it, kick off phase 2
      const lower = reply.toLowerCase()
      needsWork = /\b(i'll|i will|let me|working on|getting on|on it|right away|get started|look into)\b/.test(lower)
    } else {
      broadcastAgentStatus(teamId, channelId, agent.id, agent.name, 'idle')
    }
  } catch (err) {
    broadcastAgentStatus(teamId, channelId, agent.id, agent.name, 'idle')
    console.error(`[scheduler] Mention ack error for "${agent.name}":`, err)
    return
  }

  // Reset sprint counts and unblock tasks on @mention — human signal means "retry"
  // Rate-limit: max 1 reset per agent per 5 minutes to prevent mention spam
  const mentionResetKey = `mention_reset:${agentId}`
  const lastReset = mentionResetCooldowns.get(mentionResetKey)
  const resetNow = Date.now()
  if (!lastReset || resetNow - lastReset > 5 * 60 * 1000) {
    mentionResetCooldowns.set(mentionResetKey, resetNow)
    try {
      await db.run(
        `UPDATE tasks SET sprint_count = 0, status = 'todo', blocked_reason = NULL, blocked_approval_id = NULL WHERE assigned_agent_id = $1 AND team_id = $2 AND status = 'blocked'`,
        [agentId, teamId],
      )
      console.log(`[scheduler] @mention reset: unblocked tasks for "${agent.name}"`)
    } catch (err) {
      console.error(`[scheduler] Failed to reset blocked tasks on @mention:`, err)
    }
  }

  // ---- Phase 2: Background work via react loop (fire-and-forget) ----
  if (needsWork) {
    // Show "working" indicator while doing the heavy lifting
    broadcastAgentStatus(teamId, channelId, agent.id, agent.name, 'working')

    const mentionBalance = HOSTED_MODE ? await getCreditBalance(db, teamId) : null
    const systemPrompt = buildAgentSystemPrompt(agent.name, agent.systemPrompt, teamTz, mentionBalance)
    const mentionWorkPrompt = [
      `A user @mentioned you in the team chat and asked:`,
      `"${triggerMessage.content}"`,
      ``,
      `You already acknowledged the request. Now do the actual work.`,
      `When you're done, use the "respond" tool to post a follow-up message with your results.`,
    ].join('\n')

    // Fire and forget — don't block the mention response
    const runtimeConfig = { maxIterations: 5 }
    runReactLoop(
      db, agent.id, teamId, mentionWorkPrompt, modelConfig, systemPrompt,
      state.workspaceConfig, state.skillsDir, runtimeConfig, agent.modelId || undefined, channelId,
    ).then(async (result) => {
      const cleanResponse = result.response ? stripToolSyntax(result.response) : null
      if (cleanResponse && cleanResponse.trim().length > 0
        && !cleanResponse.includes('[no-op]') && cleanResponse.trim() !== 'no-op') {
        // Reuse the validated replyParentId from the ack phase (same mention context)
        const followupParentId = triggerMessage.parentMessageId ?? undefined
        let safeFollowupParentId = followupParentId
        if (safeFollowupParentId) {
          const parentMsg = await getMessage(db, safeFollowupParentId)
          if (!parentMsg || parentMsg.channelId !== channelId) safeFollowupParentId = undefined
        }
        await sendMessage(db, channelId, 'agent', agent.id, cleanResponse, undefined, teamId, undefined, undefined, undefined, safeFollowupParentId)
        await logActivity(db, 'mention_followup', agent.id, `Follow-up: ${cleanResponse.slice(0, 150)}`, undefined, teamId)
        console.log(`[scheduler] "${agent.name}" posted mention follow-up`)
      }
    }).catch((err) => {
      console.error(`[scheduler] Mention work error for "${agent.name}":`, err)
    }).finally(() => {
      broadcastAgentStatus(teamId, channelId, agent.id, agent.name, 'idle')
    })
  }
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

// ---- Cheap-poll: check for new messages before running generic check-in ----

async function hasNewMessages(db: Db, teamId: string, agentId: string, sinceSec: number): Promise<boolean> {
  // Sanitize sinceSec to integer to prevent SQL injection via agent config
  const safeSinceSec = Math.max(1, Math.floor(Number(sinceSec) || 60))
  const row = await db.queryOne<{ cnt: number }>(
    db.driver === 'postgres'
      ? `SELECT COUNT(*) as cnt FROM chat_messages
         WHERE channel_id IN (
           SELECT id FROM chat_channels WHERE team_id = $1 AND (type = 'team' OR type = 'group' OR name = 'dm:' || $2)
         )
         AND sender_id != $2
         AND created_at > NOW() - INTERVAL '1 second' * $3`
      : `SELECT COUNT(*) as cnt FROM chat_messages
         WHERE channel_id IN (
           SELECT id FROM chat_channels WHERE team_id = ? AND (type = 'team' OR type = 'group' OR name = 'dm:' || ?)
         )
         AND sender_id != ?
         AND created_at > datetime('now', '-' || ? || ' seconds')`,
    db.driver === 'postgres'
      ? [teamId, agentId, safeSinceSec]
      : [teamId, agentId, agentId, safeSinceSec],
  )
  return (row?.cnt ?? 0) > 0
}

// ---- Mention reset cooldown (prevent spam-unblocking) ----
const mentionResetCooldowns = new Map<string, number>()

// ---- Task-focused sprint helpers ----

const MAX_SPRINT_ATTEMPTS = 3 // Stop retrying a task after this many failed sprints

/** Get actionable tasks assigned to this agent, sorted by priority. */
async function getAgentAssignedTasks(db: Db, agentId: string, teamId: string): Promise<Task[]> {
  const tasks = await listTasks(db, { agentId, teamId })
  const actionable: Task[] = []
  for (const task of tasks) {
    if (task.status !== 'todo' && task.status !== 'in_progress') continue
    if (await isTaskBlocked(db, task.id)) continue
    // Auto-block tasks that have been sprinted on too many times without progress
    const row = await db.queryOne<{ sprint_count: number; last_sprint_at: string | null }>(
      `SELECT sprint_count, last_sprint_at FROM tasks WHERE id = $1`, [task.id],
    )
    if ((row?.sprint_count ?? 0) >= MAX_SPRINT_ATTEMPTS) {
      await blockTask(db, task.id, 'max_retries')
      void notifyTeam(db, teamId, 'system',
        `Task blocked: ${task.title}`,
        `Agent failed after ${MAX_SPRINT_ATTEMPTS} attempts. Tap to retry or reassign.`,
        `/tasks/${task.id}`)
      console.log(`[scheduler] Auto-blocked task "${task.title}" — ${row?.sprint_count} failed sprints`)
      continue
    }
    // Exponential backoff: skip task if last sprint was too recent
    // Delay: 30s * 2^(sprint_count - 1) → 30s, 60s, 120s
    if ((row?.sprint_count ?? 0) > 0 && row?.last_sprint_at) {
      const delaySec = 30 * Math.pow(2, (row.sprint_count - 1))
      const lastSprint = new Date(row.last_sprint_at).getTime()
      const elapsed = (Date.now() - lastSprint) / 1000
      if (elapsed < delaySec) {
        console.log(`[scheduler] Task "${task.title}" backing off — ${Math.round(delaySec - elapsed)}s remaining`)
        continue
      }
    }
    actionable.push(task)
  }
  return actionable
}

/** Build a task-focused user prompt with full context (subtasks, thread). */
async function buildTaskFocusedPrompt(db: Db, task: Task, teamId: string): Promise<string> {
  const subtasks = await getSubtasks(db, task.id)
  const subtaskLines = subtasks.length > 0
    ? subtasks.map(s => `  - [${s.status}] ${s.title} (${s.id})`).join('\n')
    : '  (none)'

  // Get recent thread messages for context
  let threadContext = ''
  try {
    const thread = await getTaskThread(db, task.id, teamId)
    const messages = await getChannelMessages(db, thread.id, 5)
    if (messages.length > 0) {
      threadContext = '\n\nRecent thread messages:\n' +
        messages.map(m => `  [${m.senderType}] ${m.content.slice(0, 300)}`).join('\n')
    }
  } catch { /* no thread yet */ }

  const deadlineStr = task.deadline ? `\nDeadline: ${task.deadline}` : ''

  return [
    `You are sprinting on a task. Focus ALL your effort on making progress.`,
    ``,
    `## Current Task`,
    `Title: ${task.title}`,
    `ID: ${task.id}`,
    `Status: ${task.status}`,
    `Priority: ${task.priority}${deadlineStr}`,
    task.description ? `\nDescription:\n${task.description}` : '',
    ``,
    `## Subtasks`,
    subtaskLines,
    threadContext,
    ``,
    `## Instructions`,
    `1. If the task is "todo", set it to "in_progress" first.`,
    `2. Work through the task step by step — use your tools to make real progress.`,
    `3. When done, mark the task "done" (or "review" if it needs human review).`,
    `4. If you're blocked and need human input, use request_approval and explain why.`,
    `5. Post a brief progress update summarizing what you accomplished.`,
  ].join('\n')
}

/**
 * Pick the best group channel for an agent's message based on department match.
 * Falls back to #general or first group channel if no match found.
 */
async function pickBestChannel(db: Db, agent: { teamId: string; department: string | null; name: string }) {
  const { listChannels, createChannel } = await import('./chat.ts')
  const channels = await listChannels(db, agent.teamId)
  const groupChannels = channels.filter(c => c.type === 'group')

  if (groupChannels.length > 0 && agent.department) {
    const dept = agent.department.toLowerCase()
    // Exact match first (e.g., department "marketing" → channel "marketing")
    const exact = groupChannels.find(c => c.name === dept)
    if (exact) return exact
    // Partial match (e.g., department "Sales" → channel "sales-team")
    const partial = groupChannels.find(c => c.name.includes(dept) || dept.includes(c.name))
    if (partial) return partial
  }

  // Fall back to #general or first group channel
  const general = groupChannels.find(c => c.name === 'general')
  if (general) return general
  if (groupChannels.length > 0) return groupChannels[0]

  // No group channels at all — create #general
  return await createChannel(db, agent.teamId, 'general', 'group')
}

/**
 * Single heartbeat cycle for an agent.
 */
async function heartbeat(db: Db, agent: Agent): Promise<void> {
  // Re-check agent status from DB — if stopped/paused since scheduling, bail out
  const { getAgent } = await import('./agent.ts')
  const fresh = await getAgent(db, agent.id)
  if (!fresh || fresh.status !== 'running') {
    unscheduleAgent(agent.id)
    return
  }

  // Per-team concurrency limiter
  const teamCount = activeHeartbeatsPerTeam.get(agent.teamId) ?? 0
  if (teamCount >= MAX_CONCURRENT_PER_TEAM) {
    console.log(`[scheduler] Skipping heartbeat for "${agent.name}" — team concurrency limit (${teamCount}/${MAX_CONCURRENT_PER_TEAM})`)
    return
  }
  activeHeartbeatsPerTeam.set(agent.teamId, teamCount + 1)
  try {
    await heartbeatInner(db, agent)
  } finally {
    const current = activeHeartbeatsPerTeam.get(agent.teamId) ?? 1
    if (current <= 1) activeHeartbeatsPerTeam.delete(agent.teamId)
    else activeHeartbeatsPerTeam.set(agent.teamId, current - 1)
  }
}

async function heartbeatInner(db: Db, agent: Agent): Promise<void> {
  // In hosted mode, skip heartbeat if team has no active subscription and no credits
  if (HOSTED_MODE) {
    if (!await isTeamActiveCached(db, agent.teamId)) return

    // Hard stop: no credits = no heartbeat. Period.
    const balance = await getCreditBalance(db, agent.teamId)
    if (balance <= 0) {
      console.log(`[scheduler] Skipping heartbeat for "${agent.name}" — zero credits (${balance})`)
      return
    }
  }

  if (!state.workspaceConfig) {
    console.error(`[scheduler] No workspace config available for heartbeat`)
    return
  }

  const modelConfig = await resolveModelConfig(db, agent.modelId || agent.modelEndpoint)
  const teamTz = await getTeamTimezoneCached(db, agent.teamId)
  const heartbeatBalance = HOSTED_MODE ? await getCreditBalance(db, agent.teamId) : null
  const systemPrompt = buildAgentSystemPrompt(agent.name, agent.systemPrompt, teamTz, heartbeatBalance)
  const isAdvisor = agent.templateId === 'advisor-bot'

  // ---- Task-focused sprint mode ----
  // AdvisorBot is always generic (free check-in), all other agents try task sprints first
  if (!isAdvisor) {
    try {
      const assignedTasks = await getAgentAssignedTasks(db, agent.id, agent.teamId)
      if (assignedTasks.length === 0) {
        // Check if agent has ANY tasks (including blocked) — if so, all are blocked, skip LLM call
        const allTasks = await listTasks(db, { agentId: agent.id, teamId: agent.teamId })
        const nonDone = allTasks.filter(t => t.status !== 'done')
        if (nonDone.length > 0) {
          console.log(`[scheduler] "${agent.name}" has ${nonDone.length} task(s) but all blocked/max-sprinted — skipping heartbeat (no LLM call)`)
          return
        }
      }

      if (assignedTasks.length > 0) {
        const sprintBudget = HOSTED_MODE
          ? await getSprintBudget(db, agent.teamId)
          : 15 // self-hosted default
        let iterationsUsed = 0

        for (const task of assignedTasks) {
          const remainingBudget = sprintBudget - iterationsUsed
          if (remainingBudget < 2) break // need at least 2 iterations for meaningful work

          const taskPrompt = await buildTaskFocusedPrompt(db, task, agent.teamId)
          const runtimeConfig = {
            maxIterations: remainingBudget,
            taskFocused: true,
            currentTaskId: task.id,
          }

          const taskDmChannel = await getDmChannel(db, agent.teamId, agent.id)
          const result = await runReactLoop(
            db, agent.id, agent.teamId, taskPrompt, modelConfig, systemPrompt,
            state.workspaceConfig!, state.skillsDir, runtimeConfig, agent.modelId || undefined,
            taskDmChannel?.id,
          )
          iterationsUsed += result.iterations

          // Track sprint attempts — reset on completion, increment otherwise
          if (result.taskCompleted) {
            await db.run(`UPDATE tasks SET sprint_count = 0 WHERE id = $1`, [task.id])
          } else {
            const now = db.driver === 'postgres' ? 'NOW()' : "datetime('now')"
            await db.run(`UPDATE tasks SET sprint_count = sprint_count + 1, last_sprint_at = ${now} WHERE id = $1`, [task.id])
          }

          // Auto-set task status to 'blocked' so it won't be retried on next heartbeat
          if (result.taskBlocked) {
            // Find the most recent pending approval for this task (created by the request_approval tool)
            const latestApproval = await db.queryOne<{ id: string }>(
              `SELECT id FROM approvals WHERE agent_id = $1 AND team_id = $2 AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
              [agent.id, agent.teamId],
            )
            await blockTask(db, task.id, 'approval_pending', latestApproval?.id)
            console.log(`[scheduler] Task "${task.title}" auto-set to blocked (approval_pending) — will not retry until unblocked`)
          }

          // Clean tool-call syntax from response before posting to chat
          const cleanResponse = result.response ? stripToolSyntax(result.response) : null

          // Determine if the response is meaningful (not a no-op or JSON dump)
          const isNoOpResponse = !cleanResponse
            || cleanResponse.includes('[no-op]')
            || cleanResponse.trim() === 'no-op'
            || cleanResponse.trim().length === 0
          // Detect JSON dumps — if the response starts with ``` or { and is mostly structured data, skip it
          const looksLikeJsonDump = cleanResponse
            && (cleanResponse.trim().startsWith('{') || cleanResponse.trim().startsWith('```'))
            && cleanResponse.includes('"assessment"')

          // Post sprint result to the task thread (skip no-ops and JSON dumps)
          try {
            const thread = await getTaskThread(db, task.id, agent.teamId)
            if (!isNoOpResponse && !looksLikeJsonDump) {
              await sendMessage(db, thread.id, 'agent', agent.id, cleanResponse!, task.id, agent.teamId)
            }
          } catch { /* thread post is best-effort */ }

          const status = result.taskCompleted ? 'DONE' : result.taskBlocked ? 'BLOCKED' : 'continuing'

          // Cross-post brief summary to team channel (skip no-ops and JSON dumps)
          if (!isNoOpResponse && !looksLikeJsonDump) {
            try {
              const statusLabel = result.taskCompleted ? 'Completed' : result.taskBlocked ? 'Blocked' : 'In progress'
              const teamSummary = `@[${task.title}](task:${task.id}) — ${statusLabel} (${result.iterations} iterations)${cleanResponse ? `\n${cleanResponse}` : ''}`
              const teamChannel = await getTeamChannel(db, agent.teamId)
              const existingMsg = await findLatestTaskMessage(db, teamChannel.id, task.id)
              const parentId = existingMsg?.id ? Number(existingMsg.id) : undefined
              await sendMessage(db, teamChannel.id, 'agent', agent.id, teamSummary, task.id, agent.teamId, undefined, undefined, undefined, parentId)
            } catch { /* best-effort */ }
          }

          await logActivity(db, 'task_sprint', agent.id,
            `Sprint on "${task.title}" — ${result.iterations} iters, ${status}`,
            undefined, agent.teamId)
          console.log(`[scheduler] "${agent.name}" sprinted on "${task.title}" — ${result.iterations} iters, ${status}`)

          // If task completed, continue to next task with remaining budget
          if (result.taskCompleted) continue
          // If blocked, skip to next task
          if (result.taskBlocked) continue
          // Task not done yet — continue to next task with remaining budget
          continue
        }

        return // task sprint handled this heartbeat
      }
    } catch (err) {
      console.error(`[scheduler] Task sprint error for "${agent.name}":`, err)
      // Fall through to generic check-in
    }
  }

  // ---- Cheap-poll: skip generic check-in if no new messages (non-advisor only) ----
  if (!isAdvisor) {
    const hasMessages = await hasNewMessages(db, agent.teamId, agent.id, agent.heartbeatSeconds)
    if (!hasMessages) {
      console.log(`[scheduler] "${agent.name}" — no new messages, skipping generic check-in (no LLM call)`)
      return
    }
  }

  // ---- Generic check-in (no tasks assigned, or AdvisorBot) ----
  const genericPrompt = [
    'This is a scheduled check-in. Use the "think" tool to assess your tasks, messages, and pending work.',
    '',
    'If you have actionable work to do: execute it, then post a brief natural-language summary of what you accomplished.',
    'If there is genuinely nothing to do: respond with exactly "no-op". Do NOT post a check-in message saying nothing happened.',
    '',
    'IMPORTANT: Your response will be posted to the team chat. Write it as a short, human-readable update — NOT JSON, NOT a structured assessment, NOT your internal reasoning. Just tell the team what you did or what you need.',
  ].join('\n')

  const advisorPrompt = [
    'You are the TEAM MANAGER. This is your management check-in cycle. Follow these phases in order:',
    '',
    'PHASE 1 — AUDIT: Use list_tasks to see ALL tasks across all agents. Categorize them: stalled (no update in 24h+), overdue (past deadline), unassigned, blocked.',
    '',
    'PHASE 2 — ANALYZE: For any stalled or blocked tasks, check their task threads for context. Determine root causes (wrong agent? unclear requirements? dependency?).',
    '',
    'PHASE 3 — ACT: Take concrete management actions:',
    '- Reassign tasks to better-suited agents (use update_task)',
    '- Reprioritize based on deadlines and business impact',
    '- Break down stuck tasks into smaller subtasks (use add_subtask)',
    '- Unblock work by clarifying requirements in task threads',
    '',
    'PHASE 4 — COMMUNICATE: Post a concise management summary covering:',
    '- Tasks completed since last check-in',
    '- Currently active work and who is on it',
    '- Items needing human attention (with specific ask)',
    '- Actions you took this cycle (reassignments, reprioritizations)',
    '',
    'PHASE 5 — PLAN: Think about the next cycle. If nothing needs managing, respond with "no-op".',
    '',
    'KEY RULES:',
    '- You are a MANAGER, not a worker. NEVER do the work yourself — reassign it to the right agent.',
    '- Keep summaries actionable and brief (bullet points, not paragraphs).',
    '- Only escalate to humans when an agent genuinely cannot handle something.',
  ].join('\n')

  const proactivePrompt = isAdvisor ? advisorPrompt : genericPrompt

  try {
    const runtimeConfig = { maxIterations: isAdvisor ? 5 : 10 }
    const proactiveDmChannel = await getDmChannel(db, agent.teamId, agent.id)
    const result = await runReactLoop(db, agent.id, agent.teamId, proactivePrompt, modelConfig, systemPrompt, state.workspaceConfig, state.skillsDir, runtimeConfig, agent.modelId || undefined, proactiveDmChannel?.id)
    // Skip no-ops, iteration-limit messages, and thinking dumps — don't spam channels
    const cleanedResponse = result.response ? stripToolSyntax(result.response) : null
    const isNoOp = cleanedResponse?.includes('[no-op]') || cleanedResponse?.trim() === 'no-op' || (cleanedResponse?.trim().length ?? 0) === 0
    const isIterationLimit = cleanedResponse?.includes('unable to complete the task within the iteration limit')
      || cleanedResponse?.includes('need a bit more time')
    const isThinkingDump = cleanedResponse
      && (cleanedResponse.includes('### ASSESS') || cleanedResponse.includes('### PRIORITIZE') || cleanedResponse.includes('### PLAN'))
    if (cleanedResponse && !isNoOp && !isIterationLimit && !isThinkingDump) {
      // Route proactive messages to the best-matching group channel only (no cross-post to avoid duplicates)
      const groupChannel = await pickBestChannel(db, agent)
      await sendMessage(db, groupChannel.id, 'agent', agent.id, cleanedResponse, undefined, agent.teamId)
      await logActivity(db, 'heartbeat_proactive', agent.id, `Proactive check-in: ${cleanedResponse.slice(0, 150)}`, undefined, agent.teamId)
      console.log(`[scheduler] Proactive message from "${agent.name}" posted to #${groupChannel.name}`)
    }
  } catch (err) {
    console.error(`[scheduler] Heartbeat error for "${agent.name}":`, err)
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

/**
 * Process onboarding drip emails.
 */
async function processOnboardingDripEmails(db: Db): Promise<void> {
  try {
    const { processOnboardingDrips } = await import('./onboarding-drip.ts')
    const dripCount = await processOnboardingDrips(db)
    if (dripCount > 0) console.log(`[scheduler] Sent ${dripCount} onboarding drip email(s)`)
  } catch (err) {
    console.error('[scheduler] Onboarding drip processing error:', err instanceof Error ? err.message : err)
  }
}

/**
 * Process scheduled workflows — fires workflows whose schedule is due.
 * Uses simple pattern: daily:HH:MM or weekly:DAY:HH:MM
 */
async function processScheduledWorkflows(db: Db): Promise<void> {
  try {
    const { listWorkflows, startRun, listRuns } = await import('./workflows.ts')
    const { advanceWorkflow } = await import('./workflow-executor.ts')

    // Query all teams' scheduled workflows
    const rows = await db.query<Record<string, unknown>>(
      `SELECT * FROM workflows WHERE trigger_type = 'scheduled' AND status = 'active' AND schedule_cron IS NOT NULL`,
    )

    const now = new Date()
    const currentDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()]
    const currentHour = String(now.getHours()).padStart(2, '0')
    const currentMinute = String(now.getMinutes()).padStart(2, '0')
    const currentTime = `${currentHour}:${currentMinute}`

    for (const row of rows) {
      const wfId = row.id as string
      const teamId = row.team_id as string
      const cron = row.schedule_cron as string

      // Check if already fired this minute
      const lastFired = lastWorkflowFired.get(wfId) ?? 0
      if (now.getTime() - lastFired < 60_000) continue

      let shouldFire = false
      if (cron.startsWith('daily:')) {
        // daily:HH:MM
        const time = cron.slice(6)
        shouldFire = time === currentTime
      } else if (cron.startsWith('weekly:')) {
        // weekly:DAY:HH:MM
        const parts = cron.slice(7).split(':')
        const day = parts[0]
        const time = `${parts[1]}:${parts[2]}`
        shouldFire = day === currentDay && time === currentTime
      }

      if (!shouldFire) continue

      // Check no active run exists
      const activeRuns = await listRuns(db, { workflowId: wfId, status: 'running' })
      if (activeRuns.length > 0) continue

      // Fire the workflow
      lastWorkflowFired.set(wfId, now.getTime())
      const run = await startRun(db, teamId, wfId, 'schedule')
      void advanceWorkflow(db, run.id).catch((err) =>
        console.error(`[scheduler] Scheduled workflow advance error:`, err),
      )
      console.log(`[scheduler] Fired scheduled workflow "${row.name}" (id: ${wfId})`)
    }
  } catch (err) {
    console.error('[scheduler] Workflow schedule processing error:', err instanceof Error ? err.message : err)
  }
}

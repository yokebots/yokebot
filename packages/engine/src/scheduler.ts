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
import { runReactLoop, buildAgentSystemPrompt, getFilteredBuiltinTools, type ToolCategory } from './runtime.ts'
import { resolveModelConfig } from './model.ts'
import { getRoutingProfile, runOrchestrator, buildPhasePrompt, getMaxPhaseCreditCost, calculateActualCost, type RoutingProfile, type PhaseResult } from './routing.ts'
import { getDmChannel, sendMessage, listChannels, createChannel, getTeamChannel, findLatestTaskMessage, broadcastAgentStatus, broadcastFileWritten } from './chat.ts'
import type { WorkspaceConfig } from './workspace.ts'
import { logActivity } from './activity.ts'
import { getSubscription, isTeamActive, getCreditBalance, getModelCreditCost, getSprintBudget, deductCredits, reserveCredits, releaseCredits } from './billing.ts'
import { listTasks, getSubtasks, isBlocked as isTaskBlocked, blockTask, type Task } from './tasks.ts'
import { notifyTeam } from './notifications.ts'
import { getTaskThread, getChannelMessages, getMessage } from './chat.ts'
import { getAgentSkills } from './skills.ts'

const HOSTED_MODE = process.env.YOKEBOT_HOSTED_MODE === 'true'

/**
 * Detect which extra tool categories a task might need based on keywords
 * in its title and description. Used to boost an agent's tool set when
 * the task falls outside the template's default categories.
 */
function detectTaskCategories(title: string, description?: string | null): ToolCategory[] {
  const text = `${title} ${description ?? ''}`.toLowerCase()
  const boosts: ToolCategory[] = []
  if (/video|render|animation|remotion|clip|footage/.test(text)) boosts.push('media')
  if (/image|photo|graphic|design|logo|banner|poster/.test(text)) boosts.push('media')
  if (/browse|website|scrape|login|navigate|url|webpage/.test(text)) boosts.push('browser')
  if (/data|table|csv|spreadsheet|record|database|report/.test(text)) boosts.push('data')
  if (/workflow|automate|pipeline|sequence/.test(text)) boosts.push('workflows')
  if (/approv/.test(text)) boosts.push('approvals')
  return [...new Set(boosts)]
}

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
  // Remove <｜DSML｜...> style XML/function-call syntax that some models (DeepSeek etc.) emit as text
  cleaned = cleaned.replace(/<[｜|]DSML[｜|][^>]*>/g, '')
  // Remove generic XML-like tool call tags: <function_calls>, <invoke>, <parameter>, etc.
  cleaned = cleaned.replace(/<\/?(?:function_calls|invoke|parameter|tool_call|tool_result)[^>]*>/g, '')
  // Remove any remaining <...> tags that look like tool syntax (name="...", string="true", etc.)
  cleaned = cleaned.replace(/<[^>]*(?:name=|string=|type=)[^>]*>/g, '')
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

// ---- Graceful drain: in-flight sprint tracking ----
const inFlightSprints = new Set<string>()
let draining = false

async function markSprintStart(db: Db, agentId: string): Promise<void> {
  await db.run(
    `UPDATE agents SET sprint_started_at = ${db.now()} WHERE id = $1`,
    [agentId],
  )
}

async function markSprintEnd(db: Db, agentId: string): Promise<void> {
  await db.run('UPDATE agents SET sprint_started_at = NULL WHERE id = $1', [agentId])
}

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

  // Clear stale sprint markers (>10 min = impossible for a legit sprint)
  await db.run(
    `UPDATE agents SET sprint_started_at = NULL WHERE sprint_started_at IS NOT NULL AND sprint_started_at < ${
      db.driver === 'postgres' ? "NOW() - INTERVAL '10 minutes'" : "datetime('now', '-10 minutes')"
    }`,
  )

  // Recover orphaned sprints from previous instance crash/timeout
  const orphanedIds = new Set<string>()
  const orphaned = running.filter(a => a.sprintStartedAt != null)
  if (orphaned.length > 0) {
    console.log(`[scheduler] Recovering ${orphaned.length} orphaned sprint(s)...`)
    for (const agent of orphaned) {
      await markSprintEnd(db, agent.id)
      orphanedIds.add(agent.id)
      // Broadcast 'idle' so any connected dashboard clears stale "is working..." indicators
      try {
        const teamChannel = await getTeamChannel(db, agent.teamId)
        if (teamChannel) {
          broadcastAgentStatus(agent.teamId, teamChannel.id, agent.id, agent.name, 'idle')
        }
      } catch { /* best-effort — API server may not be ready yet */ }
      console.log(`[scheduler] Recovered "${agent.name}" (sprint started ${agent.sprintStartedAt})`)
    }
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
      const isOrphaned = orphanedIds.has(agent.id)
      const offsetMs = isOrphaned ? 0 : index * staggerMs
      scheduleAgentWithOffset(db, agent, offsetMs)
    })
  }

  // Start email sequence processor (every 5 minutes)
  if (!sequenceTimer) {
    sequenceTimer = setInterval(() => {
      void processEmailSequences(db)
      void processOnboardingDripEmails(db)
      void checkSkillHealth(db)
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
 * Gracefully drain in-flight sprints before shutdown.
 * Stops all timers (no new heartbeats), then waits for in-flight sprints to finish.
 * Times out after `timeoutMs` (default 280s) — Railway sends SIGKILL at 300s.
 */
export function drainScheduler(timeoutMs = 280_000): Promise<void> {
  draining = true

  // Stop all timers — no new heartbeats
  for (const [id, timer] of state.timers) {
    clearTimeout(timer)
    clearInterval(timer)
    state.timers.delete(id)
  }
  if (sequenceTimer) { clearInterval(sequenceTimer); sequenceTimer = null }
  if (workflowTimer) { clearInterval(workflowTimer); workflowTimer = null }
  state.running = false

  console.log(`[scheduler] Draining... ${inFlightSprints.size} sprint(s) in flight`)
  if (inFlightSprints.size === 0) return Promise.resolve()

  return new Promise<void>((resolve) => {
    const deadline = setTimeout(() => {
      console.warn(`[scheduler] Drain timeout — ${inFlightSprints.size} sprint(s) orphaned`)
      resolve()
    }, timeoutMs)

    const check = setInterval(() => {
      if (inFlightSprints.size === 0) {
        clearInterval(check)
        clearTimeout(deadline)
        console.log('[scheduler] All sprints drained')
        resolve()
      }
    }, 500)
  })
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

  // Auto-resume paused/idle agents on @mention — human signal means "wake up"
  if (agent.status === 'paused' || agent.status === 'idle') {
    await setAgentStatus(db, agent.id, 'running')
    scheduleAgent(db, agent)
    console.log(`[scheduler] Auto-resumed "${agent.name}" (was ${agent.status}) on @mention`)
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

  // Resolve the agent's primary model (used for Phase 2 work)
  let modelConfig
  try {
    modelConfig = await resolveModelConfig(db, agent.modelId || agent.modelEndpoint)
  } catch (err) {
    console.error(`[scheduler] Cannot resolve model for "${agent.name}":`, (err as Error).message)
    await sendMessage(db, channelId, 'agent', agent.id,
      `Sorry, I'm having trouble connecting to my AI model right now. I'll try again on my next check-in.`,
      undefined, teamId)
    broadcastAgentStatus(teamId, channelId, agent.id, agent.name, 'idle')
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
        `If the request needs real work (browsing websites, creating files, generating images, searching the web, etc.), acknowledge it and say you're on it. You'll follow up when done.`,
        `If it's just a question or conversation, answer it directly.`,
        `IMPORTANT: You DO have tools available including a web browser, file editor, search, and more. NEVER say you don't have access to tools or can't do something — just acknowledge and start working.`,
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

  // Auto-create a task for this mention work so it's tracked and linked
  let mentionTaskId: string | undefined
  try {
    const { createTask } = await import('./tasks.ts')
    const rawTitle = triggerMessage.content.replace(/@\[[^\]]+\]\([^)]+\)\s*/g, '').trim()
    const mentionTaskTitle = rawTitle.length > 120 ? rawTitle.slice(0, 120) + '...' : rawTitle || triggerMessage.content.slice(0, 120)
    const mentionTask = await createTask(db, teamId, mentionTaskTitle, { status: 'in_progress', assignedAgentId: agentId })
    mentionTaskId = mentionTask.id
    const { broadcastTaskEvent } = await import('./chat.ts')
    broadcastTaskEvent(teamId, 'task_created', mentionTask.id)
  } catch (err) {
    console.error(`[scheduler] Failed to auto-create task for mention:`, err)
  }

  // Broadcast typing immediately so user sees the indicator
  broadcastAgentStatus(teamId, channelId, agent.id, agent.name, 'typing')

  // Use a fast cheap model for ack (Qwen 3.5 9B), fall back to agent's model
  let ackModelConfig = modelConfig
  try {
    ackModelConfig = await resolveModelConfig(db, 'qwen-3.5-9b')
  } catch {
    // Qwen 3.5 9B not available (e.g. self-hosted without API key) — use agent's model
  }

  try {
    const result = await chatCompletion(ackModelConfig, ackMessages)
    // Strip any tool call syntax from ack (model sometimes outputs sandbox_exec(...) etc.)
    let reply = result.content?.trim() ?? ''
    reply = reply
      .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
      .replace(/<function=[^>]*>[\s\S]*?<\/function>/g, '')
      .replace(/<｜tool[▁_]call[▁_]begin｜>[\s\S]*?<｜tool[▁_]call[▁_]end｜>/g, '')
      .replace(/```(?:typescript|javascript|json)?\n[\s\S]*?```/g, '')
      .replace(/sandbox_\w+\([^)]*\)/g, '')
      .trim()
    if (reply && reply.length > 0) {
      // Stop typing, post the ack message (in the same thread if the trigger was a thread reply)
      broadcastAgentStatus(teamId, channelId, agent.id, agent.name, 'idle')
      // Verify parent message belongs to the same channel before threading
      let replyParentId = triggerMessage.parentMessageId ?? undefined
      if (replyParentId) {
        const parentMsg = await getMessage(db, replyParentId)
        if (!parentMsg || parentMsg.channelId !== channelId) replyParentId = undefined
      }
      // Include task chip in ack message if task was created
      const ackContent = mentionTaskId ? `@[${triggerMessage.content.replace(/@\[[^\]]+\]\([^)]+\)\s*/g, '').trim().slice(0, 60)}](task:${mentionTaskId})\n\n${reply}` : reply
      await sendMessage(db, channelId, 'agent', agent.id, ackContent, mentionTaskId, teamId, undefined, undefined, undefined, replyParentId, agent.modelId || undefined)
      await logActivity(db, 'mention_response', agent.id, `Replied to @mention: ${reply.slice(0, 150)}`, undefined, teamId)

      if (HOSTED_MODE && agent.modelId) {
        const cost = await getModelCreditCost(db, agent.modelId)
        if (cost > 0) await deductCredits(db, teamId, cost, 'heartbeat_debit', `LLM: ${agent.modelId} (mention ack)`)
      }

      const elapsed = Date.now() - startMs
      console.log(`[scheduler] "${agent.name}" ack'd @mention in ${elapsed}ms`)

      // Always run Phase 2 after a mention — let the agent decide if there's work to do.
      // Unused iterations are refunded via the credit reservation system.
      needsWork = true
    } else {
      broadcastAgentStatus(teamId, channelId, agent.id, agent.name, 'idle')
    }
  } catch (err) {
    broadcastAgentStatus(teamId, channelId, agent.id, agent.name, 'idle')
    console.error(`[scheduler] Mention ack error for "${agent.name}":`, err)
    // FP-10 fix: notify user instead of silent return
    await sendMessage(db, channelId, 'agent', agent.id,
      `I ran into an issue processing your message. I'll try again on my next check-in.`,
      undefined, teamId)
    return
  }

  // Reset sprint counts and unblock tasks on @mention — human signal means "retry"
  // Rate-limit: max 1 reset per agent per 5 minutes to prevent mention spam
  const mentionResetKey = `mention_reset:${teamId}:${agentId}`
  const lastReset = mentionResetCooldowns.get(mentionResetKey)
  const resetNow = Date.now()
  if (!lastReset || resetNow - lastReset > 5 * 60 * 1000) {
    mentionResetCooldowns.set(mentionResetKey, resetNow)
    try {
      await db.run(
        `UPDATE tasks SET sprint_count = 0, status = 'todo', blocked_reason = NULL, blocked_approval_id = NULL, blocked_reason_text = NULL WHERE assigned_agent_id = $1 AND team_id = $2 AND status IN ('blocked', 'backlog')`,
        [agentId, teamId],
      )
      console.log(`[scheduler] @mention reset: unblocked tasks for "${agent.name}"`)
    } catch (err) {
      console.error(`[scheduler] Failed to reset blocked tasks on @mention:`, err)
    }
  }

  // ---- Phase 2: Background work via react loop (fire-and-forget) ----
  if (needsWork && !draining) {
    // Show "working" indicator while doing the heavy lifting
    broadcastAgentStatus(teamId, channelId, agent.id, agent.name, 'working')

    const mentionBalance = HOSTED_MODE ? await getCreditBalance(db, teamId) : null
    const mentionBrandKitRow = await db.queryOne<Record<string, unknown>>(
      'SELECT * FROM brand_kits WHERE team_id = $1',
      [teamId],
    )
    const mentionBrandKit = mentionBrandKitRow ? {
      primaryColor: mentionBrandKitRow.primary_color as string,
      secondaryColor: mentionBrandKitRow.secondary_color as string,
      accentColor: mentionBrandKitRow.accent_color as string,
      backgroundColor: mentionBrandKitRow.background_color as string,
      surfaceColor: mentionBrandKitRow.surface_color as string,
      textColor: mentionBrandKitRow.text_color as string,
      headingFont: mentionBrandKitRow.heading_font as string,
      bodyFont: mentionBrandKitRow.body_font as string,
      baseFontSize: mentionBrandKitRow.base_font_size as string,
      headingStyle: mentionBrandKitRow.heading_style as string,
      borderRadius: mentionBrandKitRow.border_radius as string,
      spacingScale: mentionBrandKitRow.spacing_scale as string,
      buttonStyle: mentionBrandKitRow.button_style as string,
      cardStyle: mentionBrandKitRow.card_style as string,
    } : null
    const systemPrompt = buildAgentSystemPrompt(agent.name, agent.systemPrompt, teamTz, mentionBalance, mentionBrandKit)
    const mentionWorkPrompt = [
      `A user @mentioned you in the team chat and asked:`,
      `"${triggerMessage.content}"`,
      ``,
      `You already acknowledged the request. Now do the actual work.`,
      `When you're done, use the "respond" tool to post a follow-up message with your results.`,
    ].join('\n')

    // Reserve credits for mention work
    const mentionModelId = agent.modelId || undefined
    const mentionCost = HOSTED_MODE && mentionModelId ? await getModelCreditCost(db, mentionModelId) : 0
    let mentionReserved = 0
    let mentionIterations = 100

    if (HOSTED_MODE && mentionCost > 0) {
      const reservation = await reserveCredits(db, agent.teamId, mentionIterations, mentionCost)
      mentionReserved = reservation.reserved
      mentionIterations = reservation.iterations
      if (mentionIterations < 1) {
        console.log(`[scheduler] "${agent.name}" — insufficient credits for mention work`)
        broadcastAgentStatus(teamId, channelId, agent.id, agent.name, 'idle')
        return
      }
    }

    // Fire and forget — don't block the mention response
    // Track in-flight sprint for graceful drain
    const mentionKey = `${agentId}:mention`
    inFlightSprints.add(mentionKey)
    void markSprintStart(db, agentId)


    // Check if this agent has a routing profile for multi-phase execution
    const mentionRoutingProfile = getRoutingProfile(agent.templateId ?? '')

    // Resolve sandbox project for builder agents (same logic as heartbeat flow)
    let mentionSandboxDir: string | undefined
    let mentionSandboxId: string | undefined
    let mentionIsEdit = false
    const sandboxTemplates = new Set(['builder-bot', 'game-dev', 'full-stack-dev', 'frontend-dev', 'backend-dev'])
    if (mentionTaskId && sandboxTemplates.has(agent.templateId ?? '')) {
      try {
        const { listSandboxProjects, createSandboxProject, getSandboxProject } = await import('./sandbox.ts')
        const { getTask } = await import('./tasks.ts')
        const mentionTask = await getTask(db, mentionTaskId)
        if (mentionTask?.sandboxProjectId) {
          const project = await getSandboxProject(db, mentionTask.sandboxProjectId)
          if (project) { mentionSandboxDir = project.directory; mentionSandboxId = project.id }
        } else {
          // Check if user is asking to fix/edit an existing project
          const msg = triggerMessage.content.toLowerCase()
          const isEditRequest = /fix|edit|update|change|modify|improve|redesign|refactor|debug|repair/i.test(msg)
          const existing = await listSandboxProjects(db, teamId)

          if (isEditRequest && existing.length > 0) {
            mentionIsEdit = true
            // Match user's message against project names — pick the best match
            const msgLower = msg.toLowerCase()
            let bestMatch = existing[0]
            let bestScore = 0
            for (const proj of existing) {
              const words = proj.name.toLowerCase().split(/\s+/)
              const score = words.filter(w => w.length > 2 && msgLower.includes(w)).length
              if (score > bestScore) {
                bestScore = score
                bestMatch = proj
              }
            }

            // If multiple projects and no strong match, inject project list into ack prompt
            // so the agent asks the user to confirm which project
            if (existing.length > 1 && bestScore < 2) {
              const projectList = existing.map((p, i) => `${i + 1}. ${p.name}`).join('\n')
              ackMessages[0].content += `\n\nIMPORTANT: There are ${existing.length} sandbox projects. The user wants to edit one but didn't clearly specify which. Ask them to confirm by replying with the number:\n${projectList}\n\nDo NOT start working until the user confirms which project.`
              console.log(`[scheduler] Ambiguous project match (score: ${bestScore}) — asking user to confirm`)
              // Don't assign a project yet — wait for confirmation
            } else {
              mentionSandboxDir = bestMatch.directory
              mentionSandboxId = bestMatch.id
              await db.run('UPDATE tasks SET sandbox_project_id = $1 WHERE id = $2', [bestMatch.id, mentionTaskId])
              // Inject project name into ack so user knows which project
              ackMessages[0].content += `\n\nYou will be working on the project: "${bestMatch.name}". Mention this project name in your response so the user can confirm.`
              console.log(`[scheduler] Matched project "${bestMatch.name}" (score: ${bestScore}) for edit request`)
            }
          } else {
            // New project
            const rawTitle = triggerMessage.content.replace(/@\[[^\]]+\]\([^)]+\)\s*/g, '').trim()
            const cleanName = rawTitle.replace(/\b(scaffold|build|create|set up|implement|make|develop)\b/gi, '').trim()
            const projectName = (cleanName || rawTitle).slice(0, 30).trim() || 'New Project'
            const project = await createSandboxProject(db, teamId, projectName)
            mentionSandboxDir = project.directory
            mentionSandboxId = project.id
            await db.run('UPDATE tasks SET sandbox_project_id = $1 WHERE id = $2', [project.id, mentionTaskId])
            console.log(`[scheduler] Auto-created sandbox project "${project.name}" for mention task`)
          }
        }
      } catch (err) {
        console.error(`[scheduler] Failed to resolve sandbox project for mention:`, err)
      }
    }

    // Detect edit intent for non-sandbox agents too (universal agents editing workspace files, etc.)
    if (!mentionIsEdit) {
      const editPattern = /fix|edit|update|change|modify|improve|redesign|refactor|debug|repair|correct|tweak|adjust|revise/i
      mentionIsEdit = editPattern.test(triggerMessage.content)
    }

    const mentionPromise = mentionRoutingProfile
      ? runRoutedSprint(
          db, agent, { id: mentionTaskId ?? `mention-${Date.now()}`, title: triggerMessage.content, description: null },
          mentionRoutingProfile, systemPrompt, mentionIterations, broadcastFileWritten,
          mentionSandboxDir, mentionSandboxId, mentionIsEdit,
        ).then(r => ({ response: r.response, iterations: r.totalIterations, taskCompleted: r.taskCompleted }))
      : (() => {
          const mentionBoosts = detectTaskCategories(triggerMessage.content, '')
          const runtimeConfig = { maxIterations: mentionIterations, onFileWritten: broadcastFileWritten, skipCredits: HOSTED_MODE && mentionCost > 0, extraToolCategories: mentionBoosts.length > 0 ? mentionBoosts : undefined, currentTaskId: mentionTaskId }
          return runReactLoop(
            db, agent.id, teamId, mentionWorkPrompt, modelConfig, systemPrompt,
            state.workspaceConfig, state.skillsDir, runtimeConfig, mentionModelId, channelId,
          )
        })()

    mentionPromise.then(async (result) => {
      // Release unused reserved credits
      if (HOSTED_MODE && mentionReserved > 0) {
        const refund = (mentionIterations - result.iterations) * mentionCost
        if (refund > 0) await releaseCredits(db, agent.teamId, refund, `Mention refund: ${mentionIterations - result.iterations} unused iterations`)
      }
      // Update task status based on sprint result
      if (mentionTaskId) {
        if (result.taskCompleted) {
          await db.run(`UPDATE tasks SET status = 'done', sprint_count = sprint_count + 1 WHERE id = $1`, [mentionTaskId]).catch(() => {})
        } else {
          const now = db.driver === 'postgres' ? 'NOW()' : "datetime('now')"
          await db.run(`UPDATE tasks SET sprint_count = sprint_count + 1, last_sprint_at = ${now} WHERE id = $1`, [mentionTaskId]).catch(() => {})
        }
      }

      let cleanResponse = result.response ? stripToolSyntax(result.response) : null
      // If task completed but response sounds like it's still working, override with rich completion message
      if (result.taskCompleted && (!cleanResponse || /still working|pick it back up|next check-in|need a bit more time/i.test(cleanResponse))) {
        const rawTitle = triggerMessage.content.replace(/@\[[^\]]+\]\([^)]+\)\s*/g, '').trim()
        const taskChip = mentionTaskId ? `@[${rawTitle.slice(0, 60)}](task:${mentionTaskId})` : ''
        // Include sandbox project chip if this is a builder task
        let previewSuffix = ''
        if (mentionSandboxId) {
          try {
            const { getSandboxProject: getProj } = await import('./sandbox.ts')
            const proj = await getProj(db, mentionSandboxId)
            if (proj) previewSuffix = `\n\n**Preview:** @[${proj.name}](sandbox:${proj.id})`
          } catch { /* best-effort */ }
        }
        cleanResponse = `${taskChip} — Completed${previewSuffix}`
      }
      if (cleanResponse && cleanResponse.trim().length > 0
        && !cleanResponse.includes('[no-op]') && cleanResponse.trim() !== 'no-op') {
        // Reuse the validated replyParentId from the ack phase (same mention context)
        const followupParentId = triggerMessage.parentMessageId ?? undefined
        let safeFollowupParentId = followupParentId
        if (safeFollowupParentId) {
          const parentMsg = await getMessage(db, safeFollowupParentId)
          if (!parentMsg || parentMsg.channelId !== channelId) safeFollowupParentId = undefined
        }
        await sendMessage(db, channelId, 'agent', agent.id, cleanResponse, mentionTaskId, teamId, undefined, undefined, undefined, safeFollowupParentId, mentionModelId)
        await logActivity(db, 'mention_followup', agent.id, `Follow-up: ${cleanResponse.slice(0, 150)}`, undefined, teamId)
        console.log(`[scheduler] "${agent.name}" posted mention follow-up`)

        // Auto-open sandbox preview on completion for builder tasks
        console.log(`[scheduler] Follow-up check: taskCompleted=${result.taskCompleted}, mentionSandboxId=${mentionSandboxId ?? 'null'}`)
        if (result.taskCompleted && mentionSandboxId) {
          try {
            const { getSandboxProject: getProj } = await import('./sandbox.ts')
            const proj = await getProj(db, mentionSandboxId)
            if (proj) {
              const { broadcastSandboxPreview } = await import('./chat.ts')
              broadcastSandboxPreview(teamId, { projectId: proj.id, projectName: proj.name })
              console.log(`[scheduler] Broadcast sandbox_preview for "${proj.name}"`)
            } else {
              console.log(`[scheduler] No project found for sandbox ID ${mentionSandboxId}`)
            }
          } catch (err) {
            console.error(`[scheduler] Failed to broadcast sandbox preview:`, (err as Error).message)
          }
        }
      }
    }).catch(async (err) => {
      console.error(`[scheduler] Mention work error for "${agent.name}":`, err)
      // FP-11 fix: notify user that follow-up work failed
      try {
        await sendMessage(db, channelId, 'agent', agent.id,
          `I ran into an issue while working on that. I'll try again on my next check-in.`,
          undefined, teamId)
      } catch { /* best-effort */ }
    }).finally(() => {
      markSprintEnd(db, agentId).catch(() => {})
      inFlightSprints.delete(mentionKey)
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
    if (task.status !== 'todo' && task.status !== 'in_progress' && task.status !== 'backlog') continue
    if (await isTaskBlocked(db, task.id)) continue
    // Auto-block tasks that have been sprinted on too many times without progress
    const row = await db.queryOne<{ sprint_count: number; last_sprint_at: string | null }>(
      `SELECT sprint_count, last_sprint_at FROM tasks WHERE id = $1`, [task.id],
    )
    if ((row?.sprint_count ?? 0) >= MAX_SPRINT_ATTEMPTS) {
      // Capture the agent's last response from the task thread as the explanation
      let reasonText: string | null = null
      try {
        const thread = await getTaskThread(db, task.id, task.teamId)
        const msgs = await getChannelMessages(db, thread.id, 5)
        const agentMsg = msgs.find(m => m.senderType === 'agent')
        if (agentMsg) reasonText = agentMsg.content.slice(0, 2000)
      } catch { /* no thread — skip */ }

      // Build structured error context for the task detail page
      const errorContext = JSON.stringify({
        error: reasonText?.slice(0, 500) ?? 'Agent could not complete the task after multiple attempts',
        sprintCount: row?.sprint_count ?? MAX_SPRINT_ATTEMPTS,
        suggestion: 'Click Retry to have the agent try again, or edit the task description to provide more specific instructions.',
      })
      await blockTask(db, task.id, 'system_error', undefined, errorContext)
      const snippet = reasonText ? `\n\n"${reasonText.slice(0, 200)}${reasonText.length > 200 ? '...' : ''}"` : ''
      void notifyTeam(db, teamId, 'system',
        `Task failed: ${task.title}`,
        `Agent could not complete this task after ${MAX_SPRINT_ATTEMPTS} attempts.${snippet}\n\nClick to view error details and retry.`,
        `/tasks/${task.id}`)
      // Post failure context to team chat
      try {
        const teamChannel = await getTeamChannel(db, teamId)
        const failureSummary = `@[${task.title}](task:${task.id}) — **System Error**: Agent failed after ${MAX_SPRINT_ATTEMPTS} attempts.${snippet}\n\nClick the task to view details and retry.`
        await sendMessage(db, teamChannel.id, 'system', agentId, failureSummary, task.id, teamId)
      } catch { /* best-effort */ }
      // Notify workflow executor that the task failed (marks step + run as failed)
      try {
        const { onTaskFailed } = await import('./workflow-executor.ts')
        void onTaskFailed(db, task.id, `Agent failed after ${MAX_SPRINT_ATTEMPTS} attempts`)
      } catch { /* best-effort */ }
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

/** Build a task-focused user prompt with full context (subtasks, team chat messages for this task). */
async function buildTaskFocusedPrompt(db: Db, task: Task, teamId: string, planMode = true, templateId?: string, sandboxProjectDir?: string): Promise<string> {
  const subtasks = await getSubtasks(db, task.id)
  const subtaskLines = subtasks.length > 0
    ? subtasks.map(s => `  - [${s.status}] ${s.title} (${s.id})`).join('\n')
    : '  (none)'

  // Get recent messages about this task from team channel (not task thread)
  let threadContext = ''
  try {
    const teamChannel = await getTeamChannel(db, teamId)
    const messages = await getChannelMessages(db, teamChannel.id, 50)
    // Filter to messages tagged with this task's ID
    const taskMessages = messages.filter(m => m.taskId === task.id).slice(-5)
    if (taskMessages.length > 0) {
      threadContext = '\n\nRecent task messages:\n' +
        taskMessages.map(m => `  [${m.senderType}] ${m.content.slice(0, 300)}`).join('\n')
    }
  } catch { /* no messages yet */ }

  // Check for recently resolved approvals linked to this task
  let approvalContext = ''
  try {
    const recentApproval = await db.queryOne<Record<string, unknown>>(
      `SELECT status, action_type, action_detail, resolved_at FROM approvals WHERE task_id = $1 AND status IN ('approved', 'rejected') ORDER BY resolved_at DESC LIMIT 1`,
      [task.id],
    )
    if (recentApproval) {
      const approvalStatus = recentApproval.status as string
      const actionType = recentApproval.action_type as string
      const actionDetail = (recentApproval.action_detail as string).slice(0, 500)
      approvalContext = `\n## Approval Decision\nYour previous approval request for "${actionType}" was **${approvalStatus.toUpperCase()}**.\nOriginal request: ${actionDetail}\n${approvalStatus === 'approved' ? 'You may now proceed with the approved action.' : 'The action was rejected. Adjust your approach — consider an alternative strategy or ask for clarification.'}\n`
    }
  } catch { /* no approval found — that's fine */ }

  const deadlineStr = task.deadline ? `\nDeadline: ${task.deadline}` : ''

  const scratchpadSection = task.scratchpad
    ? `\n## Your Notes From Previous Sprints\n${task.scratchpad}\n`
    : ''

  // Builder-specific instructions: force sandbox coding, but only when the task actually asks for building
  const isBuilder = templateId === 'builder-bot'
  const taskText = `${task.title} ${task.description ?? ''}`
  const taskWantsBuild = /build|create|make|develop|implement|scaffold|redesign|rebuild|improve|clone|replicate|code|app|website|landing\s*page|prototype/i.test(taskText)
  const builderOverride = (isBuilder && taskWantsBuild) ? [
    ``,
    `## CRITICAL: You are BuilderBot — You MUST Write Code`,
    ``,
    `Your job is to BUILD a working web application, not just research. Follow this exact workflow:`,
    `1. **Browse briefly** (3-5 pages max) to understand the site's design, colors, layout, and branding`,
    `2. **Then IMMEDIATELY start coding** — call \`sandbox_setup\` to scaffold the project with ALL files in one call`,
    `3. **Self-review** — visit your preview URL with browser_navigate to check your work`,
    `4. **Iterate** — fix any issues, then respond with the preview URL`,
    `5. **When everything works, mark the task DONE** — call update_task with status "done"`,
    ``,
    `**You MUST call sandbox_setup or sandbox_write_file before responding.** If you respond without writing any code, you have FAILED the task. Research alone is NOT a deliverable — a working app is. Do NOT visit external sites (design blogs, tutorials, etc.) — you already know how to code. Focus on the TARGET site only, then BUILD.`,
    ``,
    `**DO NOT create multiple top-level tasks.** If you need to break work down, create ONE parent task and organize steps as subtasks under it. But prefer to just build the whole thing in one sprint — scaffold, write all code, install deps, start dev server, verify preview. Only create subtasks if the work genuinely spans multiple sprints.`,
    ``,
    `**PATH RULES:** All file paths in sandbox_setup, sandbox_write_file, and sandbox_write_files must be RELATIVE (e.g. "src/App.tsx", "package.json"). Do NOT use absolute paths — the system automatically resolves them to the correct project directory. Using absolute paths causes double-prefixing bugs.`,
  ] : []

  // Sandbox project context
  let projectContext = ''
  if (sandboxProjectDir) {
    projectContext = `\n## Sandbox Project\nThis task's code lives at: \`${sandboxProjectDir}\`\nAll sandbox tools operate in this directory. You CANNOT access files outside this directory.\n`
  }

  // List team projects for context
  let projectListContext = ''
  try {
    const { listSandboxProjects } = await import('./sandbox.ts')
    const projects = await listSandboxProjects(db, teamId)
    if (projects.length > 0) {
      projectListContext = `\n## Team Projects\n${projects.map(p => `- ${p.name} (${p.slug}, dir: ${p.directory}${p.previewUrl ? `, preview: ${p.previewUrl}` : ''})`).join('\n')}\n`
    }
  } catch { /* best-effort */ }

  const shortRef = task.shortId ? ` (TASK-${task.shortId})` : ''

  return [
    `You are sprinting on a task. Focus ALL your effort on making progress.`,
    ``,
    `**IMPORTANT: Ignore any previous messages claiming this task is "complete" or "done". The task status below is the source of truth. If the status is "todo" or "in_progress", the task is NOT done — you must do real work using your tools. Do NOT just summarize or research — take concrete action (write files, execute commands, build things). Producing a deliverable is more valuable than producing a plan.**`,
    ...builderOverride,
    ``,
    `## Current Task`,
    `Title: ${task.title}${shortRef}`,
    `ID: ${task.id}`,
    `Status: ${task.status}`,
    `Priority: ${task.priority}${deadlineStr}`,
    task.description ? `\nDescription:\n${task.description}` : '',
    approvalContext,
    scratchpadSection,
    projectContext,
    projectListContext,
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
    `6. Before finishing your work, use update_scratchpad to save notes about what you tried, what worked/failed, and what to do next time.`,
    `7. For complex tasks requiring many steps, break the work into subtasks using add_subtask. Each subtask gets its own fresh sprint with full context — this is more effective than trying to do everything in one long session.`,
    `8. If you created subtasks, do NOT mark the parent as "done" until all subtasks are complete. Check their status first.`,
    `9. Before creating a task, ALWAYS check if a similar one exists using list_tasks.`,
    `10. When discussing tasks in chat, reference them as @[Task Title](task:{id}) so they render as clickable links.`,
    `11. If the user's request could apply to multiple projects, STOP and ask which project they mean. List the options. Never guess — wrong project = wasted work and credits.`,
    ...(planMode ? [
      `12. **PLAN MODE is ON.** Before doing any work, estimate the total credit cost and set it on this task using update_task with estimatedCredits. Then use request_approval with a cost breakdown (e.g. "~7 iterations × 20 credits + render_video 50 credits = ~190 credits") so the human can approve before you spend credits. Do NOT proceed with expensive work until approved.`,
    ] : []),
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
  if (draining) return

  // Re-check agent status from DB — if stopped/paused since scheduling, bail out
  const { getAgent } = await import('./agent.ts')
  const fresh = await getAgent(db, agent.id)
  if (!fresh || fresh.status !== 'running') {
    unscheduleAgent(agent.id)
    return
  }

  // Prevent duplicate sprints for the same agent
  if (inFlightSprints.has(agent.id)) {
    console.log(`[scheduler] Skipping heartbeat for "${agent.name}" — sprint already in flight`)
    return
  }

  // Per-team concurrency limiter
  const teamCount = activeHeartbeatsPerTeam.get(agent.teamId) ?? 0
  if (teamCount >= MAX_CONCURRENT_PER_TEAM) {
    console.log(`[scheduler] Skipping heartbeat for "${agent.name}" — team concurrency limit (${teamCount}/${MAX_CONCURRENT_PER_TEAM})`)
    return
  }
  activeHeartbeatsPerTeam.set(agent.teamId, teamCount + 1)

  inFlightSprints.add(agent.id)
  try {
    await markSprintStart(db, agent.id)
    await heartbeatInner(db, agent)
  } finally {
    await markSprintEnd(db, agent.id).catch(() => {})
    inFlightSprints.delete(agent.id)
    const current = activeHeartbeatsPerTeam.get(agent.teamId) ?? 1
    if (current <= 1) activeHeartbeatsPerTeam.delete(agent.teamId)
    else activeHeartbeatsPerTeam.set(agent.teamId, current - 1)

  }
}

/**
 * Run a routed sprint: orchestrator plans phases, each phase runs with its own
 * model and tool set. Context flows between phases as text summaries.
 */
async function runRoutedSprint(
  db: Db,
  agent: Agent,
  task: { id: string; title: string; description: string | null },
  profile: RoutingProfile,
  systemPrompt: string,
  maxBudget: number,
  onFileWritten?: (teamId: string, path: string) => void,
  sandboxProjectDir?: string,
  sandboxProjectId?: string,
  isEdit?: boolean,
): Promise<{ totalIterations: number; response: string | null; taskCompleted: boolean; taskBlocked: boolean; phaseResults: PhaseResult[] }> {
  const teamId = agent.teamId

  // Step 1: Orchestrator decides which phases to run (~1 LLM call)
  // Pass installed skills so orchestrator can assign skills to phases that need them
  const installedSkills = (await getAgentSkills(db, agent.id)).map(s => s.skillName)
  let plan: { phases: string[]; skillOverrides?: Record<string, string[]> }
  try {
    plan = await runOrchestrator(db, profile, task.title, task.description, teamId, installedSkills.length > 0 ? installedSkills : undefined, isEdit)
  } catch (err) {
    // FP-15 fix: fall back to running all phases from the profile instead of killing the sprint
    const phases = (isEdit && profile.editPhases) ? profile.editPhases : profile.phases
    console.warn(`[routing] Orchestrator failed for "${agent.name}": ${(err as Error).message} — falling back to all ${isEdit ? 'edit' : 'build'} phases`)
    plan = { phases: phases.map(p => p.name) }
  }
  console.log(`[routing] "${agent.name}" — orchestrator planned: [${plan.phases.join(', ')}]${isEdit ? ' (edit mode)' : ''}`)

  // Step 2: Execute each phase sequentially
  const phaseResults: PhaseResult[] = []
  let totalIterations = 0
  let lastResponse: string | null = null
  let taskCompleted = false
  let taskBlocked = false

  const activePhaseDefs = (isEdit && profile.editPhases) ? profile.editPhases : profile.phases

  for (const phaseName of plan.phases) {
    const phase = activePhaseDefs.find(p => p.name === phaseName)
    if (!phase) continue

    const remainingBudget = maxBudget - totalIterations
    if (remainingBudget < 2) {
      console.log(`[routing] "${agent.name}" — budget exhausted before phase "${phaseName}" (${remainingBudget} remaining)`)
      break
    }

    const phaseMaxIters = Math.min(phase.maxIterations, remainingBudget)

    // Look up preview URL for browser phases.
    // 1. Ensure the dev server is running (it may have stopped after sandbox idle/archive)
    // 2. Generate a proxy URL through the engine — NOT the raw Daytona URL.
    //    The engine proxy adds X-Daytona-Skip-Preview-Warning to bypass the interstitial.
    //    The agent's Chromium browser doesn't add this header, so raw URLs show a warning page.
    let previewUrl: string | undefined
    if (sandboxProjectId && phase.toolCategories.includes('browser')) {
      try {
        const { getSandboxProject, getPreviewUrl, startProjectDevServer, updateSandboxProject } = await import('./sandbox.ts')
        const project = await getSandboxProject(db, sandboxProjectId)
        if (project?.devPort) {
          // Ensure dev server is running
          try {
            await startProjectDevServer(db, teamId, sandboxProjectId)
            console.log(`[routing] Dev server started/verified for "${project.name}" on port ${project.devPort}`)
          } catch (err) {
            console.log(`[routing] Dev server start failed for "${project.name}": ${(err as Error).message}`)
          }

          // Generate a proxy token and URL through the engine
          try {
            const signedUrl = await getPreviewUrl(db, teamId, project.devPort)
            await updateSandboxProject(db, sandboxProjectId, { previewUrl: signedUrl })
            // Create a proxy token so the agent browses through the engine proxy
            const token = `spt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
            const proxyTokenStore = (globalThis as Record<string, unknown>).__proxyTokenStore as Map<string, { teamId: string; signedUrl: string; expires: number }> | undefined
            if (proxyTokenStore) {
              proxyTokenStore.set(token, { teamId, signedUrl, expires: Date.now() + 4 * 3600_000 })
            }
            // Build the full proxy URL the agent should browse
            const engineUrl = process.env.RAILWAY_STATIC_URL
              ? `https://${process.env.RAILWAY_STATIC_URL}`
              : `http://localhost:${process.env.PORT || 3001}`
            previewUrl = `${engineUrl}/api/sandbox/proxy/${token}/`
            console.log(`[routing] Proxy preview URL for "${project.name}": /api/sandbox/proxy/${token}/`)
          } catch (err) {
            console.log(`[routing] Failed to generate proxy preview URL: ${(err as Error).message}`)
          }
        }
      } catch { /* best-effort */ }
    }
    const phasePrompt = buildPhasePrompt(phase, task.title, task.description, phaseResults, {
      previewUrl,
      sandboxProjectDir: sandboxProjectDir,
    })

    // Resolve this phase's model
    let phaseModelConfig: import('./model.ts').ModelConfig
    let phaseModelId = phase.modelId
    try {
      phaseModelConfig = await resolveModelConfig(db, phase.modelId)
    } catch {
      if (phase.fallbackModelId) {
        console.log(`[routing] Phase "${phaseName}" — model "${phase.modelId}" unavailable, trying fallback "${phase.fallbackModelId}"`)
        try {
          phaseModelConfig = await resolveModelConfig(db, phase.fallbackModelId)
          phaseModelId = phase.fallbackModelId
        } catch {
          // FP-14 fix: skip phase instead of killing entire sprint
          console.warn(`[routing] Phase "${phaseName}" — fallback "${phase.fallbackModelId}" also unavailable, skipping phase`)
          phaseResults.push({ phase: phaseName, summary: `Skipped: model unavailable`, iterations: 0, model: phase.modelId, success: false })
          continue
        }
      } else {
        // FP-14 fix: skip phase instead of killing entire sprint
        console.warn(`[routing] Phase "${phaseName}" — model "${phase.modelId}" unavailable, no fallback — skipping phase`)
        phaseResults.push({ phase: phaseName, summary: `Skipped: model unavailable`, iterations: 0, model: phase.modelId, success: false })
        continue
      }
    }

    // Orchestrator can override phase skillFilter (e.g. assign slack-notify to review phase)
    const phaseSkillFilter = plan.skillOverrides?.[phaseName] ?? phase.skillFilter

    const runtimeConfig = {
      maxIterations: phaseMaxIters,
      taskFocused: true,
      currentTaskId: task.id,
      onFileWritten,
      skipCredits: true, // credits reserved upfront by caller
      restrictToolCategories: phase.toolCategories,
      skillFilter: phaseSkillFilter,
      sandboxProjectDir,
      sandboxProjectId,
    }

    console.log(`[routing] Phase "${phaseName}" → ${phaseModelId} (max ${phaseMaxIters} iters, tools: [${phase.toolCategories.join(', ')}])`)

    let result = await runReactLoop(
      db, agent.id, teamId, phasePrompt, phaseModelConfig, systemPrompt,
      state.workspaceConfig!, state.skillsDir, runtimeConfig, phaseModelId,
    )

    // If phase failed and has a fallback model, retry
    const phaseFailed = result.iterations <= 1 && !result.taskCompleted && !result.response
    if (phaseFailed && phase.fallbackModelId && phase.fallbackModelId !== phaseModelId) {
      console.log(`[routing] Phase "${phaseName}" — failed with ${phaseModelId}, retrying with fallback "${phase.fallbackModelId}"`)
      const fallbackConfig = await resolveModelConfig(db, phase.fallbackModelId)
      const fallbackRuntimeConfig = { ...runtimeConfig, maxIterations: Math.min(phase.maxIterations, maxBudget - totalIterations - result.iterations) }
      const fallbackResult = await runReactLoop(
        db, agent.id, teamId, phasePrompt, fallbackConfig, systemPrompt,
        state.workspaceConfig!, state.skillsDir, fallbackRuntimeConfig, phase.fallbackModelId,
      )
      // Combine iterations from both attempts
      result = {
        ...fallbackResult,
        iterations: result.iterations + fallbackResult.iterations,
      }
      phaseModelId = phase.fallbackModelId
    }

    totalIterations += result.iterations
    lastResponse = result.response

    phaseResults.push({
      phase: phaseName,
      model: phaseModelId,
      summary: result.response ?? '(no output)',
      iterations: result.iterations,
      success: !phaseFailed || (!!result.taskCompleted),
    })

    console.log(`[routing] Phase "${phaseName}" complete — ${result.iterations} iters, model: ${phaseModelId}`)

    // Early exit if task completed or blocked
    if (result.taskCompleted) { taskCompleted = true; break }
    if (result.taskBlocked) { taskBlocked = true; break }
  }

  // Log phase summary
  const summary = phaseResults.map(r => `${r.phase}:${r.model}(${r.iterations})`).join(' → ')
  console.log(`[routing] "${agent.name}" — routed sprint complete: ${summary} (${totalIterations} total iters)`)

  // Auto-mark task completed if all phases ran and the last phase was "review" or "build"
  // (safety net — the review model should call update_task but often exits with plain text)
  if (!taskCompleted && !taskBlocked && phaseResults.length > 0) {
    const lastPhase = phaseResults[phaseResults.length - 1]
    if ((lastPhase.phase === 'review' || lastPhase.phase === 'build' || lastPhase.phase === 'deliver') && lastPhase.success) {
      console.log(`[routing] Auto-marking task completed — all phases ran, last phase "${lastPhase.phase}" succeeded`)
      taskCompleted = true
    }
  }

  // Persist task status to DB immediately (don't rely on caller's .then() which can be lost on engine restart)
  if (taskCompleted) {
    await db.run(`UPDATE tasks SET status = 'done', sprint_count = sprint_count + 1, scratchpad = NULL WHERE id = $1`, [task.id]).catch(() => {})
    console.log(`[routing] Task "${task.title.slice(0, 50)}" marked done in DB`)
  } else if (taskBlocked) {
    await db.run(`UPDATE tasks SET status = 'blocked', sprint_count = sprint_count + 1 WHERE id = $1`, [task.id]).catch(() => {})
  } else {
    const now = db.driver === 'postgres' ? 'NOW()' : "datetime('now')"
    await db.run(`UPDATE tasks SET sprint_count = sprint_count + 1, last_sprint_at = ${now} WHERE id = $1`, [task.id]).catch(() => {})
  }

  return { totalIterations, response: lastResponse, taskCompleted, taskBlocked, phaseResults }
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

  let modelConfig
  try {
    modelConfig = await resolveModelConfig(db, agent.modelId || agent.modelEndpoint)
  } catch (err) {
    // FP-8 fix: handle model resolution failure instead of crashing heartbeat
    console.error(`[scheduler] Heartbeat model resolution failed for "${agent.name}":`, (err as Error).message)
    return
  }
  const teamTz = await getTeamTimezoneCached(db, agent.teamId)
  const heartbeatBalance = HOSTED_MODE ? await getCreditBalance(db, agent.teamId) : null
  const heartbeatBrandKitRow = await db.queryOne<Record<string, unknown>>(
    'SELECT * FROM brand_kits WHERE team_id = $1',
    [agent.teamId],
  )
  const heartbeatBrandKit = heartbeatBrandKitRow ? {
    primaryColor: heartbeatBrandKitRow.primary_color as string,
    secondaryColor: heartbeatBrandKitRow.secondary_color as string,
    accentColor: heartbeatBrandKitRow.accent_color as string,
    backgroundColor: heartbeatBrandKitRow.background_color as string,
    surfaceColor: heartbeatBrandKitRow.surface_color as string,
    textColor: heartbeatBrandKitRow.text_color as string,
    headingFont: heartbeatBrandKitRow.heading_font as string,
    bodyFont: heartbeatBrandKitRow.body_font as string,
    baseFontSize: heartbeatBrandKitRow.base_font_size as string,
    headingStyle: heartbeatBrandKitRow.heading_style as string,
    borderRadius: heartbeatBrandKitRow.border_radius as string,
    spacingScale: heartbeatBrandKitRow.spacing_scale as string,
    buttonStyle: heartbeatBrandKitRow.button_style as string,
    cardStyle: heartbeatBrandKitRow.card_style as string,
  } : null
  const systemPrompt = buildAgentSystemPrompt(agent.name, agent.systemPrompt, teamTz, heartbeatBalance, heartbeatBrandKit)
  const isAdvisor = agent.templateId === 'advisor-bot'

  // ---- Task-focused sprint mode ----
  // All agents with assigned tasks do task sprints; agents with no tasks fall through to generic check-in
  // Credit reservation variables — scoped here so catch block can access them
  let reservedIterations = 0
  let reservedAmount = 0
  let costPerIteration = 0
  let iterationsUsed = 0

  // Resolve effective plan mode: agent override > team default > true
  let effectivePlanMode = true
  if (agent.planMode !== null) {
    effectivePlanMode = agent.planMode
  } else {
    const teamProfile = await db.queryOne<{ plan_mode_default: boolean | number | null }>(
      'SELECT plan_mode_default FROM team_profiles WHERE team_id = $1', [agent.teamId],
    )
    effectivePlanMode = teamProfile?.plan_mode_default == null ? true : teamProfile.plan_mode_default === true || teamProfile.plan_mode_default === 1
  }

  {
    try {
      const assignedTasks = await getAgentAssignedTasks(db, agent.id, agent.teamId)
      if (assignedTasks.length === 0) {
        // Check if agent has ANY tasks (including blocked) — if so, all are blocked, skip LLM call
        const allTasks = await listTasks(db, { agentId: agent.id, teamId: agent.teamId })
        const nonDone = allTasks.filter(t => t.status !== 'done' && t.status !== 'archived')
        if (nonDone.length > 0) {
          console.log(`[scheduler] "${agent.name}" has ${nonDone.length} task(s) but all blocked/max-sprinted — skipping heartbeat (no LLM call)`)
          return
        }
      }

      if (assignedTasks.length > 0) {
        const sprintBudget = HOSTED_MODE
          ? await getSprintBudget(db, agent.teamId)
          : 40 // self-hosted default

        // Check if this agent has a dynamic routing profile
        const routingProfile = getRoutingProfile(agent.templateId ?? '')
        const logicalModelId = agent.modelId || undefined

        // Reserve credits upfront to prevent race conditions between concurrent agents
        reservedIterations = sprintBudget
        costPerIteration = HOSTED_MODE && logicalModelId ? await getModelCreditCost(db, logicalModelId) : 0

        // For routed sprints, reserve at the most expensive phase model's cost
        if (routingProfile && HOSTED_MODE) {
          // Dry-run orchestrator to estimate phases (use fallback plan for reservation)
          const allPhaseNames = routingProfile.phases.map(p => p.name)
          const { maxCostPerIteration } = await getMaxPhaseCreditCost(db, routingProfile, { phases: allPhaseNames, reasoning: '' })
          if (maxCostPerIteration > costPerIteration) costPerIteration = maxCostPerIteration
        }

        if (HOSTED_MODE && costPerIteration > 0) {
          const reservation = await reserveCredits(db, agent.teamId, sprintBudget, costPerIteration)
          reservedIterations = reservation.iterations
          reservedAmount = reservation.reserved
          if (reservedIterations < 2) {
            console.log(`[scheduler] "${agent.name}" — insufficient credits for sprint (need ${costPerIteration * 2}, reserved ${reservedAmount})`)
            if (reservedAmount > 0) await releaseCredits(db, agent.teamId, reservedAmount, `Sprint cancelled — insufficient for 2 iterations`)
            return
          }
          console.log(`[scheduler] "${agent.name}" — reserved ${reservedAmount} credits for ${reservedIterations} iterations`)
        }

        // Broadcast 'working' status so the dashboard shows the progress panel
        const sprintTeamChannel = await getTeamChannel(db, agent.teamId)
        if (sprintTeamChannel) {
          broadcastAgentStatus(agent.teamId, sprintTeamChannel.id, agent.id, agent.name, 'working')
        }

        for (const task of assignedTasks) {
          const remainingBudget = reservedIterations - iterationsUsed
          if (remainingBudget < 2) break // need at least 2 iterations for meaningful work

          // Auto-set task status to in_progress when sprint starts
          if (task.status === 'todo' || task.status === 'backlog') {
            await db.run(`UPDATE tasks SET status = 'in_progress' WHERE id = $1`, [task.id])
          }

          // Resolve sandbox project directory from task → project link
          // If task has no project, auto-create one from the task title (for builder agents)
          let sandboxProjectDir: string | undefined
          let sandboxProjectId: string | undefined
          if (task.sandboxProjectId) {
            try {
              const { getSandboxProject } = await import('./sandbox.ts')
              const project = await getSandboxProject(db, task.sandboxProjectId)
              if (project) {
                sandboxProjectDir = project.directory
                sandboxProjectId = project.id
              }
            } catch { /* best-effort */ }
          } else {
            // Auto-create a sandbox project for tasks that involve building
            // Check if this agent has sandbox capabilities (builder-bot, game-dev, etc.)
            const sandboxTemplates = new Set(['builder-bot', 'game-dev', 'full-stack-dev', 'frontend-dev', 'backend-dev'])
            const hasSandbox = sandboxTemplates.has(agent.templateId ?? '')
            if (hasSandbox) {
              try {
                const { listSandboxProjects, createSandboxProject } = await import('./sandbox.ts')
                const existing = await listSandboxProjects(db, agent.teamId)
                if (existing.length === 0) {
                  // No projects yet — create one from task title
                  const cleanName = task.title.replace(/\b(scaffold|build|create|set up|implement|make|develop)\b/gi, '').trim()
                  const projectName = (cleanName || task.title).slice(0, 30).trim() || 'New Project'
                  const project = await createSandboxProject(db, agent.teamId, projectName)
                  sandboxProjectDir = project.directory
                  sandboxProjectId = project.id
                  await db.run(`UPDATE tasks SET sandbox_project_id = $1 WHERE id = $2`, [project.id, task.id])
                  console.log(`[scheduler] Auto-created sandbox project "${project.name}" for task "${task.title}"`)
                } else if (existing.length === 1) {
                  // Only one project — auto-link the task to it
                  sandboxProjectDir = existing[0].directory
                  sandboxProjectId = existing[0].id
                  await db.run(`UPDATE tasks SET sandbox_project_id = $1 WHERE id = $2`, [existing[0].id, task.id])
                }
                // If multiple projects exist, let the agent decide (don't auto-link)
              } catch (err) {
                console.error(`[scheduler] Auto-create project failed:`, err)
              }
            }
          }

          let result: { iterations: number; response: string | null; taskCompleted?: boolean; taskBlocked?: boolean }

          // Detect edit intent from task title + description
          const editPattern = /fix|edit|update|change|modify|improve|redesign|refactor|debug|repair|correct|tweak|adjust|revise/i
          const taskIsEdit = editPattern.test(task.title) || (task.description ? editPattern.test(task.description) : false)

          // ---- Dynamic model routing: multi-phase sprint ----
          if (routingProfile) {
            const routedResult = await runRoutedSprint(
              db, agent, task, routingProfile, systemPrompt,
              remainingBudget, broadcastFileWritten,
              sandboxProjectDir, sandboxProjectId, taskIsEdit,
            )
            result = { iterations: routedResult.totalIterations, response: routedResult.response, taskCompleted: routedResult.taskCompleted, taskBlocked: routedResult.taskBlocked }

            // Smart refund: calculate actual cost vs reserved
            if (HOSTED_MODE && reservedAmount > 0 && routedResult.phaseResults.length > 0) {
              const actualCost = await calculateActualCost(db, routedResult.phaseResults)
              const reservedForThisTask = remainingBudget * costPerIteration
              const overpayment = reservedForThisTask - actualCost
              if (overpayment > 0) {
                // We'll handle the full refund at the end; track actual cost for logging
                console.log(`[routing] "${agent.name}" — phase-accurate cost: ${actualCost} credits (reserved ${reservedForThisTask}, saving ${overpayment})`)
              }
            }
          } else {
            // ---- Standard single-model flow ----
            const taskPrompt = await buildTaskFocusedPrompt(db, task, agent.teamId, effectivePlanMode, agent.templateId ?? undefined, sandboxProjectDir)
            const taskBoosts = detectTaskCategories(task.title, task.description)
            const runtimeConfig = {
              maxIterations: remainingBudget,
              taskFocused: true,
              currentTaskId: task.id,
              onFileWritten: broadcastFileWritten,
              skipCredits: HOSTED_MODE && costPerIteration > 0, // credits already reserved
              extraToolCategories: taskBoosts.length > 0 ? taskBoosts : undefined,
              sandboxProjectDir,
              sandboxProjectId,
            }

            const taskDmChannel = await getDmChannel(db, agent.teamId, agent.id)
            result = await runReactLoop(
              db, agent.id, agent.teamId, taskPrompt, modelConfig, systemPrompt,
              state.workspaceConfig!, state.skillsDir, runtimeConfig, logicalModelId,
              taskDmChannel?.id,
            )
          }

          iterationsUsed += result.iterations

          // Track sprint attempts — reset on completion, increment otherwise
          if (result.taskCompleted) {
            await db.run(`UPDATE tasks SET status = 'done', sprint_count = 0, scratchpad = NULL WHERE id = $1`, [task.id])
          } else {
            const now = db.driver === 'postgres' ? 'NOW()' : "datetime('now')"
            await db.run(`UPDATE tasks SET sprint_count = sprint_count + 1, last_sprint_at = ${now} WHERE id = $1`, [task.id])
          }

          // Auto-set task status to 'blocked' so it won't be retried on next heartbeat
          if (result.taskBlocked) {
            // Find the most recent pending approval for this task (created by the request_approval tool)
            const latestApproval = await db.queryOne<{ id: string; action_type: string; action_detail: string; risk_level: string }>(
              `SELECT id, action_type, action_detail, risk_level FROM approvals WHERE agent_id = $1 AND team_id = $2 AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
              [agent.id, agent.teamId],
            )
            const reasonText = latestApproval
              ? `[${latestApproval.risk_level?.toUpperCase() ?? 'MEDIUM'}] ${latestApproval.action_type}: ${latestApproval.action_detail}`
              : undefined
            await blockTask(db, task.id, 'approval_pending', latestApproval?.id, reasonText)
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

          const status = result.taskCompleted ? 'DONE' : result.taskBlocked ? 'BLOCKED' : 'continuing'

          // Post sprint result to team channel (all discussion lives here now)
          // Always post for completed/blocked tasks so users see results; skip only for no-op continuing sprints
          const shouldPost = result.taskCompleted || result.taskBlocked || (!isNoOpResponse && !looksLikeJsonDump)
          if (shouldPost) {
            try {
              const statusLabel = result.taskCompleted ? 'Completed' : result.taskBlocked ? 'Blocked' : 'In progress'
              // Include preview URL for builder tasks so users can see what was built
              let previewSuffix = ''
              if (sandboxProjectId && result.taskCompleted) {
                try {
                  const { getSandboxProject } = await import('./sandbox.ts')
                  const project = await getSandboxProject(db, sandboxProjectId)
                  if (project?.previewUrl) {
                    previewSuffix = `\n\n**Preview:** [Open app](${project.previewUrl})`
                  }
                } catch { /* best-effort */ }
              }
              // Use a meaningful fallback when the model's response is empty/useless
              const responseText = (!isNoOpResponse && !looksLikeJsonDump && cleanResponse)
                ? `\n${cleanResponse}`
                : result.taskCompleted ? '\nTask completed successfully.' : result.taskBlocked ? '\nTask is blocked and needs attention.' : ''
              const teamSummary = `@[${task.title}](task:${task.id}) — ${statusLabel} (${result.iterations} iterations)${responseText}${previewSuffix}`
              const teamChannel = await getTeamChannel(db, agent.teamId)
              const existingMsg = await findLatestTaskMessage(db, teamChannel.id, task.id)
              const parentId = existingMsg?.id ? Number(existingMsg.id) : undefined
              await sendMessage(db, teamChannel.id, 'agent', agent.id, teamSummary, task.id, agent.teamId, undefined, undefined, undefined, parentId, logicalModelId)
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
          // Task not done yet — STOP here. Don't cycle to the next task.
          // The agent will pick this up on the next heartbeat with fresh context.
          // This prevents partial work across multiple tasks that wastes credits.
          break
        }

        // Pick up newly-created subtasks from this sprint (if budget allows)
        const postSprintBudget = reservedIterations - iterationsUsed
        if (postSprintBudget >= 4) {
          const freshTasks = await getAgentAssignedTasks(db, agent.id, agent.teamId)
          const newTasks = freshTasks.filter(t =>
            !assignedTasks.some(at => at.id === t.id) &&
            (t.status === 'todo' || t.status === 'in_progress')
          )
          if (newTasks.length > 0) {
            console.log(`[scheduler] "${agent.name}" — ${newTasks.length} new subtask(s), continuing with ${postSprintBudget} iterations`)
            for (const task of newTasks) {
              const remainingBudget = reservedIterations - iterationsUsed
              if (remainingBudget < 2) break

              // Auto-set subtask status to in_progress
              if (task.status === 'todo' || task.status === 'backlog') {
                await db.run(`UPDATE tasks SET status = 'in_progress' WHERE id = $1`, [task.id])
              }

              // Resolve sandbox project for subtask
              let subSandboxProjectDir: string | undefined
              let subSandboxProjectId: string | undefined
              if (task.sandboxProjectId) {
                try {
                  const { getSandboxProject } = await import('./sandbox.ts')
                  const project = await getSandboxProject(db, task.sandboxProjectId)
                  if (project) { subSandboxProjectDir = project.directory; subSandboxProjectId = project.id }
                } catch { /* best-effort */ }
              } else {
                // Inherit project from parent tasks if available
                try {
                  const { listSandboxProjects } = await import('./sandbox.ts')
                  const existing = await listSandboxProjects(db, agent.teamId)
                  if (existing.length === 1) {
                    subSandboxProjectDir = existing[0].directory
                    subSandboxProjectId = existing[0].id
                    await db.run(`UPDATE tasks SET sandbox_project_id = $1 WHERE id = $2`, [existing[0].id, task.id])
                  }
                } catch { /* best-effort */ }
              }

              let result: { iterations: number; response: string | null; taskCompleted?: boolean; taskBlocked?: boolean }

              const subEditPattern = /fix|edit|update|change|modify|improve|redesign|refactor|debug|repair|correct|tweak|adjust|revise/i
              const subTaskIsEdit = subEditPattern.test(task.title) || (task.description ? subEditPattern.test(task.description) : false)

              if (routingProfile) {
                const routedResult = await runRoutedSprint(
                  db, agent, task, routingProfile, systemPrompt,
                  remainingBudget, broadcastFileWritten,
                  subSandboxProjectDir, subSandboxProjectId, subTaskIsEdit,
                )
                result = { iterations: routedResult.totalIterations, response: routedResult.response, taskCompleted: routedResult.taskCompleted, taskBlocked: routedResult.taskBlocked }
              } else {
                const taskPrompt = await buildTaskFocusedPrompt(db, task, agent.teamId, effectivePlanMode, agent.templateId ?? undefined, subSandboxProjectDir)
                const taskBoosts = detectTaskCategories(task.title, task.description)
                const runtimeConfig = {
                  maxIterations: remainingBudget,
                  taskFocused: true,
                  currentTaskId: task.id,
                  onFileWritten: broadcastFileWritten,
                  skipCredits: HOSTED_MODE && costPerIteration > 0,
                  extraToolCategories: taskBoosts.length > 0 ? taskBoosts : undefined,
                  sandboxProjectDir: subSandboxProjectDir,
                  sandboxProjectId: subSandboxProjectId,
                }

                const taskDmChannel = await getDmChannel(db, agent.teamId, agent.id)
                result = await runReactLoop(
                  db, agent.id, agent.teamId, taskPrompt, modelConfig, systemPrompt,
                  state.workspaceConfig!, state.skillsDir, runtimeConfig, logicalModelId,
                  taskDmChannel?.id,
                )
              }

              iterationsUsed += result.iterations

              if (result.taskCompleted) {
                await db.run(`UPDATE tasks SET status = 'done', sprint_count = 0, scratchpad = NULL WHERE id = $1`, [task.id])
              } else {
                const now = db.driver === 'postgres' ? 'NOW()' : "datetime('now')"
                await db.run(`UPDATE tasks SET sprint_count = sprint_count + 1, last_sprint_at = ${now} WHERE id = $1`, [task.id])
              }

              if (result.taskBlocked) {
                const latestApproval = await db.queryOne<{ id: string; action_type: string; action_detail: string; risk_level: string }>(
                  `SELECT id, action_type, action_detail, risk_level FROM approvals WHERE agent_id = $1 AND team_id = $2 AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
                  [agent.id, agent.teamId],
                )
                const reasonText = latestApproval
                  ? `[${latestApproval.risk_level?.toUpperCase() ?? 'MEDIUM'}] ${latestApproval.action_type}: ${latestApproval.action_detail}`
                  : undefined
                await blockTask(db, task.id, 'approval_pending', latestApproval?.id, reasonText)
              }

              const cleanResponse = result.response ? stripToolSyntax(result.response) : null
              const isNoOpResponse = !cleanResponse || cleanResponse.includes('[no-op]') || cleanResponse.trim() === 'no-op' || cleanResponse.trim().length === 0
              const looksLikeJsonDump = cleanResponse && (cleanResponse.trim().startsWith('{') || cleanResponse.trim().startsWith('```')) && cleanResponse.includes('"assessment"')

              // Post sprint result to team channel (all discussion lives here now)
              const subShouldPost = result.taskCompleted || result.taskBlocked || (!isNoOpResponse && !looksLikeJsonDump)
              if (subShouldPost) {
                try {
                  const statusLabel = result.taskCompleted ? 'Completed' : result.taskBlocked ? 'Blocked' : 'In progress'
                  const subResponseText = (!isNoOpResponse && !looksLikeJsonDump && cleanResponse)
                    ? `\n${cleanResponse}`
                    : result.taskCompleted ? '\nTask completed successfully.' : result.taskBlocked ? '\nTask is blocked and needs attention.' : ''
                  const teamSummary = `@[${task.title}](task:${task.id}) — ${statusLabel} (${result.iterations} iterations)${subResponseText}`
                  const teamChannel = await getTeamChannel(db, agent.teamId)
                  const existingMsg = await findLatestTaskMessage(db, teamChannel.id, task.id)
                  const parentId = existingMsg?.id ? Number(existingMsg.id) : undefined
                  await sendMessage(db, teamChannel.id, 'agent', agent.id, teamSummary, task.id, agent.teamId, undefined, undefined, undefined, parentId, logicalModelId)
                } catch { /* best-effort */ }
              }

              await logActivity(db, 'task_sprint', agent.id,
                `Subtask sprint on "${task.title}" — ${result.iterations} iters, ${result.taskCompleted ? 'DONE' : result.taskBlocked ? 'BLOCKED' : 'continuing'}`,
                undefined, agent.teamId)
              console.log(`[scheduler] "${agent.name}" sprinted on subtask "${task.title}" — ${result.iterations} iters`)
            }
          }
        }

        // Broadcast 'idle' to clear the progress panel
        if (sprintTeamChannel) {
          broadcastAgentStatus(agent.teamId, sprintTeamChannel.id, agent.id, agent.name, 'idle')
        }

        // Release unused reserved credits
        if (HOSTED_MODE && reservedAmount > 0) {
          const unusedIterations = reservedIterations - iterationsUsed
          const refund = unusedIterations * costPerIteration
          if (refund > 0) {
            await releaseCredits(db, agent.teamId, refund, `Sprint refund: ${unusedIterations} unused iterations × ${costPerIteration} credits`)
            console.log(`[scheduler] "${agent.name}" — refunded ${refund} credits (${unusedIterations} unused iterations)`)
          }
        }

        return // task sprint handled this heartbeat
      }
    } catch (err) {
      // Clear progress panel on error
      const errTeamChannel = await getTeamChannel(db, agent.teamId).catch(() => null)
      if (errTeamChannel) {
        broadcastAgentStatus(agent.teamId, errTeamChannel.id, agent.id, agent.name, 'idle')
      }
      // Release reserved credits on error
      if (HOSTED_MODE && reservedAmount > 0) {
        const unusedIterations = reservedIterations - iterationsUsed
        const refund = unusedIterations * costPerIteration
        if (refund > 0) await releaseCredits(db, agent.teamId, refund, `Sprint error refund`).catch(() => {})
      }
      console.error(`[scheduler] Task sprint error for "${agent.name}":`, err)
      // FP-12 fix: return instead of falling through to generic check-in (wastes credits)
      return
    }
  }

  // ---- Cheap-poll: skip generic check-in if no new messages ----
  {
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
    'You are a STRATEGIC BUSINESS ADVISOR. This is your proactive check-in. Follow these phases:',
    '',
    'PHASE 1 — CHECK YOUR TASKS: Use list_tasks to see tasks assigned to you. Focus on in_progress and todo tasks that need your strategic work.',
    '',
    'PHASE 2 — DO THE WORK: For each task assigned to you, produce the deliverable yourself. Write growth plans, pricing strategies, competitive analyses, etc. Save outputs to the workspace.',
    '',
    'PHASE 3 — TEAM HEALTH CHECK: Quickly scan all tasks across the team. If anything is stalled or blocked, help unblock it — reassign if needed, or break into subtasks.',
    '',
    'PHASE 4 — COMMUNICATE: Post a brief update on what you produced and any team issues spotted.',
    '',
    'If you have no tasks and the team is healthy, respond with "no-op".',
    '',
    'KEY RULES:',
    '- Do the strategic work yourself. You are a doer, not just a delegator.',
    '- Keep communications brief — bullet points, not essays.',
    '- Only escalate to humans when agents genuinely cannot handle something.',
  ].join('\n')

  const proactivePrompt = isAdvisor ? advisorPrompt : genericPrompt

  try {
    const proactiveMax = isAdvisor ? 20 : 15
    const proactiveModelId = agent.modelId || undefined
    const proactiveCost = HOSTED_MODE && proactiveModelId ? await getModelCreditCost(db, proactiveModelId) : 0
    let proactiveReserved = 0
    let proactiveIterations = proactiveMax

    if (HOSTED_MODE && proactiveCost > 0) {
      const reservation = await reserveCredits(db, agent.teamId, proactiveMax, proactiveCost)
      proactiveReserved = reservation.reserved
      proactiveIterations = reservation.iterations
      if (proactiveIterations < 1) {
        console.log(`[scheduler] "${agent.name}" — insufficient credits for proactive check-in`)
        return
      }
    }

    const runtimeConfig = { maxIterations: proactiveIterations, onFileWritten: broadcastFileWritten, skipCredits: HOSTED_MODE && proactiveCost > 0 }
    const proactiveDmChannel = await getDmChannel(db, agent.teamId, agent.id)
    const heartbeatStart = new Date()
    const result = await runReactLoop(db, agent.id, agent.teamId, proactivePrompt, modelConfig, systemPrompt, state.workspaceConfig, state.skillsDir, runtimeConfig, proactiveModelId, proactiveDmChannel?.id)

    // Release unused reserved credits
    if (HOSTED_MODE && proactiveReserved > 0) {
      const refund = (proactiveIterations - result.iterations) * proactiveCost
      if (refund > 0) await releaseCredits(db, agent.teamId, refund, `Proactive refund: ${proactiveIterations - result.iterations} unused iterations`)
    }
    // Skip no-ops, iteration-limit messages, and thinking dumps — don't spam channels
    const cleanedResponse = result.response ? stripToolSyntax(result.response) : null
    const isNoOp = cleanedResponse?.includes('[no-op]') || cleanedResponse?.trim() === 'no-op' || (cleanedResponse?.trim().length ?? 0) === 0

    // Mark noop heartbeat messages so they're excluded from compaction and search
    if (isNoOp) {
      try {
        const { markNoopMessages } = await import('./memory.ts')
        await markNoopMessages(db, agent.id, agent.teamId, heartbeatStart)
      } catch { /* best-effort */ }
    }
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
 * Respects team timezone from team_profiles (defaults to UTC).
 */
async function processScheduledWorkflows(db: Db): Promise<void> {
  try {
    const { listWorkflows, startRun, listRuns } = await import('./workflows.ts')
    const { advanceWorkflow } = await import('./workflow-executor.ts')

    // Query all teams' scheduled workflows
    const rows = await db.query<Record<string, unknown>>(
      `SELECT * FROM workflows WHERE trigger_type = 'scheduled' AND status = 'active' AND schedule_cron IS NOT NULL`,
    )

    // Cache team timezones to avoid repeated queries within this tick
    const teamTimezones = new Map<string, string>()

    for (const row of rows) {
      const wfId = row.id as string
      const teamId = row.team_id as string
      const cron = row.schedule_cron as string

      // Look up team timezone (cached per tick)
      if (!teamTimezones.has(teamId)) {
        const tzRow = await db.queryOne<{ timezone: string | null }>(
          'SELECT timezone FROM team_profiles WHERE team_id = $1', [teamId],
        )
        teamTimezones.set(teamId, tzRow?.timezone ?? 'UTC')
      }
      const tz = teamTimezones.get(teamId)!

      // Get current time in team's timezone
      const now = new Date()
      let currentDay: string
      let currentTime: string
      try {
        // Use Intl to convert server time to team's local time
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          weekday: 'long',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).formatToParts(now)
        currentDay = parts.find(p => p.type === 'weekday')?.value?.toLowerCase() ?? ''
        const hour = parts.find(p => p.type === 'hour')?.value ?? '00'
        const minute = parts.find(p => p.type === 'minute')?.value ?? '00'
        currentTime = `${hour}:${minute}`
      } catch {
        // Invalid timezone — fall back to UTC
        currentDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getUTCDay()]
        currentTime = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`
      }

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

// ---- Layer 2: Skill health check (runs every 5 min) ----

const lastSkillCheckTs = new Map<string, number>()
const SKILL_CHECK_INTERVAL = 15 * 60 * 1000 // at most once per 15 min per team

async function checkSkillHealth(db: Db): Promise<void> {
  try {
    const { getFailingSkills, broadcastSkillWarning } = await import('./skill-runs.ts')

    // Get all active teams
    const teams = await db.query<Record<string, unknown>>(
      `SELECT DISTINCT team_id FROM agents WHERE status = 'running'`,
    )

    const now = Date.now()
    for (const row of teams) {
      const teamId = row.team_id as string
      const lastCheck = lastSkillCheckTs.get(teamId) ?? 0
      if (now - lastCheck < SKILL_CHECK_INTERVAL) continue

      lastSkillCheckTs.set(teamId, now)
      const failing = await getFailingSkills(db, teamId)
      if (failing.length > 0) {
        // Broadcast via SSE
        broadcastSkillWarning(teamId, failing)

        // Push persistent notification for each failing skill
        for (const skill of failing) {
          await notifyTeam(
            db, teamId, 'system',
            `Skill "${skill.skillName}" is underperforming`,
            `${skill.recentFailures}/${skill.recentRuns} recent runs failed. ${skill.recentErrors[0] ?? ''}`,
          )
        }
        console.log(`[scheduler] Skill health warning for team ${teamId}: ${failing.map((s) => s.skillName).join(', ')}`)
      }
    }
  } catch (err) {
    console.error('[scheduler] Skill health check error:', err instanceof Error ? err.message : err)
  }
}

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
import { getDmChannel, sendMessage, listChannels, createChannel } from './chat.ts'
import type { WorkspaceConfig } from './workspace.ts'
import { logActivity } from './activity.ts'
import { getSubscription, isTeamActive, getCreditBalance, getModelCreditCost, getSprintBudget } from './billing.ts'
import { listTasks, getSubtasks, isBlocked as isTaskBlocked, type Task } from './tasks.ts'
import { getTaskThread, getChannelMessages } from './chat.ts'

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

// Concurrency limiter — prevents flooding DB + LLM providers
const MAX_CONCURRENT_HEARTBEATS = 5
let activeHeartbeats = 0

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
    }, 5 * 60 * 1000)
    // Run once on startup after a short delay
    setTimeout(() => void processEmailSequences(db), 30_000)
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
  triggerMessage: { senderId: string; content: string },
): Promise<void> {
  const { getAgent } = await import('./agent.ts')
  const { getChannelMessages } = await import('./chat.ts')
  const { listDocuments } = await import('./knowledge-base.ts')
  const agent = await getAgent(db, agentId)
  if (!agent || agent.status !== 'running') return
  if (agent.teamId !== teamId) return

  // Check credits in hosted mode
  if (HOSTED_MODE && agent.modelId) {
    const balance = await getCreditBalance(db, teamId)
    const cost = await getModelCreditCost(db, agent.modelId)
    if (cost > 0 && balance < cost) {
      console.log(`[scheduler] Skipping mention response for "${agent.name}" — insufficient credits`)
      return
    }
  }

  if (!state.workspaceConfig) return

  let modelConfig
  try {
    modelConfig = await resolveModelConfig(db, agent.modelId || agent.modelEndpoint)
  } catch (err) {
    console.error(`[scheduler] Cannot resolve model for "${agent.name}":`, (err as Error).message)
    return
  }
  const teamTz = await getTeamTimezoneCached(db, teamId)
  const systemPrompt = buildAgentSystemPrompt(agent.name, agent.systemPrompt, teamTz)

  // Get recent channel messages for context
  const recentMessages = await getChannelMessages(db, channelId, 15)
  const context = recentMessages
    .map((m) => `[${m.senderType === 'human' ? 'User' : m.senderId === agentId ? agent.name : 'Other'}]: ${m.content}`)
    .join('\n')

  // Get KB documents so agent can reference them with @mentions
  let kbContext = ''
  try {
    const docs = await listDocuments(db, teamId)
    if (docs.length > 0) {
      kbContext = `\n\nKnowledge base documents available (you can reference them using @[title](file:id) syntax):\n` +
        docs.map((d) => `- @[${d.title}](file:${d.id}) (${d.fileType})`).join('\n')
    }
  } catch { /* no docs */ }

  const mentionPrompt = [
    `You were @mentioned in a group channel. Here is the recent conversation:`,
    context,
    ``,
    `The user said: "${triggerMessage.content}"`,
    ``,
    `Respond naturally to the conversation. Be helpful, concise, and on-topic.`,
    `If asked a question, answer it. If given a task, acknowledge it and take action.`,
    ...(kbContext ? [`When referencing knowledge base documents, use the @[title](file:id) mention syntax.`] : []),
    `Keep your response under 500 characters unless a detailed answer is needed.`,
    `IMPORTANT: Never invent or fabricate file references. Only reference documents that are explicitly listed below.`,
    kbContext,
  ].join('\n')

  try {
    const runtimeConfig = agent.templateId === 'advisor-bot'
      ? { maxIterations: 10, skipCredits: true }
      : undefined
    const result = await runReactLoop(
      db, agent.id, teamId, mentionPrompt, modelConfig, systemPrompt,
      state.workspaceConfig, state.skillsDir, runtimeConfig, agent.modelId || undefined,
    )
    if (result.response && !result.response.includes('[no-op]')) {
      // Reply in the SAME channel where the mention happened
      await sendMessage(db, channelId, 'agent', agent.id, result.response, undefined, teamId)
      await logActivity(db, 'mention_response', agent.id, `Replied to @mention: ${result.response.slice(0, 150)}`, undefined, teamId)
      console.log(`[scheduler] "${agent.name}" replied to @mention in channel ${channelId}`)
    }
  } catch (err) {
    console.error(`[scheduler] Mention response error for "${agent.name}":`, err)
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

// ---- Task-focused sprint helpers ----

/** Get actionable tasks assigned to this agent, sorted by priority. */
async function getAgentAssignedTasks(db: Db, agentId: string, teamId: string): Promise<Task[]> {
  const tasks = await listTasks(db, { agentId, teamId })
  const actionable: Task[] = []
  for (const task of tasks) {
    if (task.status !== 'todo' && task.status !== 'in_progress') continue
    if (await isTaskBlocked(db, task.id)) continue
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
  // Concurrency limiter — skip this cycle if too many heartbeats are running
  if (activeHeartbeats >= MAX_CONCURRENT_HEARTBEATS) {
    console.log(`[scheduler] Skipping heartbeat for "${agent.name}" — concurrency limit (${activeHeartbeats}/${MAX_CONCURRENT_HEARTBEATS})`)
    return
  }
  activeHeartbeats++
  try {
    await heartbeatInner(db, agent)
  } finally {
    activeHeartbeats--
  }
}

async function heartbeatInner(db: Db, agent: Agent): Promise<void> {
  // In hosted mode, skip heartbeat if team has no active subscription and no credits
  if (HOSTED_MODE) {
    if (!await isTeamActiveCached(db, agent.teamId)) return

    // Check credit balance before running heartbeat
    if (agent.modelId) {
      const balance = await getCreditBalance(db, agent.teamId)
      const cost = await getModelCreditCost(db, agent.modelId)
      if (cost > 0 && balance < cost) {
        console.log(`[scheduler] Skipping heartbeat for "${agent.name}" — insufficient credits (${balance} < ${cost})`)
        return
      }
    }
  }

  if (!state.workspaceConfig) {
    console.error(`[scheduler] No workspace config available for heartbeat`)
    return
  }

  const modelConfig = await resolveModelConfig(db, agent.modelId || agent.modelEndpoint)
  const teamTz = await getTeamTimezoneCached(db, agent.teamId)
  const systemPrompt = buildAgentSystemPrompt(agent.name, agent.systemPrompt, teamTz)
  const isAdvisor = agent.templateId === 'advisor-bot'

  // ---- Task-focused sprint mode ----
  // AdvisorBot is always generic (free check-in), all other agents try task sprints first
  if (!isAdvisor) {
    try {
      const assignedTasks = await getAgentAssignedTasks(db, agent.id, agent.teamId)
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

          const result = await runReactLoop(
            db, agent.id, agent.teamId, taskPrompt, modelConfig, systemPrompt,
            state.workspaceConfig!, state.skillsDir, runtimeConfig, agent.modelId || undefined,
          )
          iterationsUsed += result.iterations

          // Post sprint result to the task thread
          try {
            const thread = await getTaskThread(db, task.id, agent.teamId)
            if (result.response && !result.response.includes('[no-op]')) {
              await sendMessage(db, thread.id, 'agent', agent.id, result.response, task.id, agent.teamId)
            }
          } catch { /* thread post is best-effort */ }

          const status = result.taskCompleted ? 'DONE' : result.taskBlocked ? 'BLOCKED' : 'continuing'
          await logActivity(db, 'task_sprint', agent.id,
            `Sprint on "${task.title}" — ${result.iterations} iters, ${status}`,
            undefined, agent.teamId)
          console.log(`[scheduler] "${agent.name}" sprinted on "${task.title}" — ${result.iterations} iters, ${status}`)

          // If task completed, continue to next task with remaining budget
          if (result.taskCompleted) continue
          // If blocked, skip to next task
          if (result.taskBlocked) continue
          // Otherwise (budget used but task not done) — break, resume next heartbeat
          break
        }

        return // task sprint handled this heartbeat
      }
    } catch (err) {
      console.error(`[scheduler] Task sprint error for "${agent.name}":`, err)
      // Fall through to generic check-in
    }
  }

  // ---- Generic check-in (no tasks assigned, or AdvisorBot) ----
  const proactivePrompt = [
    'This is a scheduled check-in. Before taking any action, use the "think" tool to:',
    '1. ASSESS — Review your current tasks, goals, messages, and pending approvals.',
    '2. PRIORITIZE — Decide what is most important right now (urgent tasks first, then messages, then proactive ideas).',
    '3. PLAN — Outline the specific actions you will take this check-in and in what order.',
    'Then execute your plan step by step. Use "think" again before any complex or multi-step action.',
    'If after assessment there is genuinely nothing to do, respond with "[no-op]".',
    'If you notice pending approvals that need human attention, remind about them.',
  ].join('\n')

  try {
    const runtimeConfig = isAdvisor
      ? { maxIterations: 10, skipCredits: true }
      : { maxIterations: 5 }
    const result = await runReactLoop(db, agent.id, agent.teamId, proactivePrompt, modelConfig, systemPrompt, state.workspaceConfig, state.skillsDir, runtimeConfig, agent.modelId || undefined)
    // Skip no-ops and iteration-limit fallback messages — don't spam channels
    const isNoOp = result.response?.includes('[no-op]')
    const isIterationLimit = result.response?.includes('unable to complete the task within the iteration limit')
    if (result.response && !isNoOp && !isIterationLimit) {
      // Route proactive messages to the best-matching group channel
      const groupChannel = await pickBestChannel(db, agent)
      await sendMessage(db, groupChannel.id, 'agent', agent.id, result.response, undefined, agent.teamId)
      await logActivity(db, 'heartbeat_proactive', agent.id, `Proactive check-in: ${result.response.slice(0, 150)}`, undefined, agent.teamId)
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

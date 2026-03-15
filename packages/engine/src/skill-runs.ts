/**
 * skill-runs.ts — Skill execution logging and failure detection
 *
 * Layer 1: Logs every skill tool execution with outcome data.
 * Layer 2: Detects failure patterns and surfaces warnings.
 */

import type { Db } from './db/types.ts'
import { randomUUID } from 'crypto'

// ---- Types ----

export type SkillRunStatus = 'success' | 'failure' | 'timeout'

export interface SkillRun {
  id: string
  teamId: string
  agentId: string
  skillName: string
  toolName: string
  status: SkillRunStatus
  errorMessage: string | null
  durationMs: number
  userFeedback: string | null
  argsPreview: string | null
  createdAt: string
}

export interface SkillHealthStats {
  skillName: string
  totalRuns: number
  successes: number
  failures: number
  timeouts: number
  successRate: number
  avgDurationMs: number
  lastRunAt: string | null
}

export interface FailingSkill {
  skillName: string
  recentFailures: number
  recentRuns: number
  failureRate: number
  recentErrors: string[]
}

// ---- Layer 1: Execution Logging ----

/** Log a skill tool execution. */
export async function logSkillRun(
  db: Db,
  teamId: string,
  agentId: string,
  skillName: string,
  toolName: string,
  status: SkillRunStatus,
  errorMessage?: string,
  durationMs = 0,
  argsPreview?: string,
): Promise<void> {
  const id = randomUUID()
  if (db.driver === 'postgres') {
    await db.run(
      `INSERT INTO skill_runs (id, team_id, agent_id, skill_name, tool_name, status, error_message, duration_ms, args_preview, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [id, teamId, agentId, skillName, toolName, status, errorMessage ?? null, durationMs, argsPreview?.slice(0, 500) ?? null],
    )
  } else {
    await db.run(
      `INSERT INTO skill_runs (id, team_id, agent_id, skill_name, tool_name, status, error_message, duration_ms, args_preview)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, teamId, agentId, skillName, toolName, status, errorMessage ?? null, durationMs, argsPreview?.slice(0, 500) ?? null],
    )
  }
}

/** List recent skill runs for a team (paginated). */
export async function listSkillRuns(
  db: Db,
  teamId: string,
  filters?: { skillName?: string; agentId?: string; status?: SkillRunStatus; limit?: number; offset?: number },
): Promise<SkillRun[]> {
  if (!teamId) return []
  const limit = Math.min(filters?.limit ?? 50, 200)
  const offset = filters?.offset ?? 0

  const conditions = ['team_id = $1']
  const params: unknown[] = [teamId]
  let idx = 2

  if (filters?.skillName) {
    conditions.push(`skill_name = $${idx}`)
    params.push(filters.skillName)
    idx++
  }
  if (filters?.agentId) {
    conditions.push(`agent_id = $${idx}`)
    params.push(filters.agentId)
    idx++
  }
  if (filters?.status) {
    conditions.push(`status = $${idx}`)
    params.push(filters.status)
    idx++
  }

  params.push(limit, offset)
  const where = conditions.join(' AND ')

  const rows = await db.query<Record<string, unknown>>(
    `SELECT id, team_id, agent_id, skill_name, tool_name, status, error_message, duration_ms, user_feedback, args_preview, created_at
     FROM skill_runs WHERE ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
    params,
  )

  return rows.map(mapSkillRun)
}

/** Aggregated stats per skill for a team. */
export async function getSkillRunStats(db: Db, teamId: string): Promise<SkillHealthStats[]> {
  if (!teamId) return []
  const rows = await db.query<Record<string, unknown>>(
    `SELECT skill_name,
            COUNT(*) as total_runs,
            SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successes,
            SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) as failures,
            SUM(CASE WHEN status = 'timeout' THEN 1 ELSE 0 END) as timeouts,
            AVG(duration_ms) as avg_duration,
            MAX(created_at) as last_run
     FROM skill_runs WHERE team_id = $1
     GROUP BY skill_name ORDER BY total_runs DESC`,
    [teamId],
  )

  return rows.map((r) => ({
    skillName: r.skill_name as string,
    totalRuns: Number(r.total_runs),
    successes: Number(r.successes),
    failures: Number(r.failures),
    timeouts: Number(r.timeouts),
    successRate: Number(r.total_runs) > 0 ? Number(r.successes) / Number(r.total_runs) : 1,
    avgDurationMs: Math.round(Number(r.avg_duration) || 0),
    lastRunAt: (r.last_run as string) ?? null,
  }))
}

/** Submit user feedback on a skill run. */
export async function submitRunFeedback(db: Db, runId: string, feedback: 'positive' | 'negative'): Promise<void> {
  await db.run('UPDATE skill_runs SET user_feedback = $1 WHERE id = $2', [feedback, runId])
}

// ---- Layer 2: Failure Detection ----

/**
 * Detect skills that are failing frequently.
 * Returns skills with >= failThreshold failures in their last windowSize runs.
 */
export async function getFailingSkills(
  db: Db,
  teamId: string,
  windowSize = 10,
  failThreshold = 3,
): Promise<FailingSkill[]> {
  if (!teamId) return []

  // Get distinct skill names that have had any failures recently
  const skills = await db.query<Record<string, unknown>>(
    `SELECT DISTINCT skill_name FROM skill_runs
     WHERE team_id = $1 AND status != 'success'
     AND created_at > ${db.driver === 'postgres' ? "NOW() - INTERVAL '24 hours'" : "datetime('now', '-24 hours')"}`,
    [teamId],
  )

  const failing: FailingSkill[] = []

  for (const row of skills) {
    const skillName = row.skill_name as string

    // Get last N runs for this skill
    const recentRuns = await db.query<Record<string, unknown>>(
      `SELECT status, error_message FROM skill_runs
       WHERE team_id = $1 AND skill_name = $2
       ORDER BY created_at DESC LIMIT $3`,
      [teamId, skillName, windowSize],
    )

    const failures = recentRuns.filter((r) => r.status !== 'success').length
    if (failures >= failThreshold) {
      const recentErrors = recentRuns
        .filter((r) => r.error_message)
        .map((r) => (r.error_message as string).slice(0, 200))
        .slice(0, 3) // top 3 unique-ish errors

      failing.push({
        skillName,
        recentFailures: failures,
        recentRuns: recentRuns.length,
        failureRate: failures / recentRuns.length,
        recentErrors,
      })
    }
  }

  return failing
}

/**
 * Get failure history for a specific skill (used by Layer 3 AI suggestions).
 * Returns recent errors with context for the AI to analyze.
 */
export async function getSkillFailureHistory(
  db: Db,
  teamId: string,
  skillName: string,
  limit = 20,
): Promise<Array<{ id: string; toolName: string; errorMessage: string; argsPreview: string | null; createdAt: string }>> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT id, tool_name, error_message, args_preview, created_at
     FROM skill_runs
     WHERE team_id = $1 AND skill_name = $2 AND status != 'success' AND error_message IS NOT NULL
     ORDER BY created_at DESC LIMIT $3`,
    [teamId, skillName, limit],
  )

  return rows.map((r) => ({
    id: r.id as string,
    toolName: r.tool_name as string,
    errorMessage: r.error_message as string,
    argsPreview: (r.args_preview as string) ?? null,
    createdAt: r.created_at as string,
  }))
}

// ---- Broadcast hook (Layer 2) ----

let skillWarningBroadcast: ((teamId: string, data: FailingSkill[]) => void) | null = null

export function setSkillWarningBroadcast(fn: (teamId: string, data: FailingSkill[]) => void): void {
  skillWarningBroadcast = fn
}

export function broadcastSkillWarning(teamId: string, data: FailingSkill[]): void {
  skillWarningBroadcast?.(teamId, data)
}

// ---- Helpers ----

function mapSkillRun(r: Record<string, unknown>): SkillRun {
  return {
    id: r.id as string,
    teamId: r.team_id as string,
    agentId: r.agent_id as string,
    skillName: r.skill_name as string,
    toolName: r.tool_name as string,
    status: r.status as SkillRunStatus,
    errorMessage: (r.error_message as string) ?? null,
    durationMs: Number(r.duration_ms) || 0,
    userFeedback: (r.user_feedback as string) ?? null,
    argsPreview: (r.args_preview as string) ?? null,
    createdAt: r.created_at as string,
  }
}

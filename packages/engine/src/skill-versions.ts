/**
 * skill-versions.ts — Skill versioning and improvement proposals
 *
 * Layer 3: Tracks skill instruction versions, manages AI-suggested
 * improvements, and supports rollback. All amendments require human approval.
 */

import type { Db } from './db/types.ts'
import { randomUUID } from 'crypto'

// ---- Types ----

export type VersionSource = 'manual' | 'ai_suggested' | 'rollback'
export type VersionStatus = 'active' | 'pending' | 'rejected' | 'rolled_back'
export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'applied'

export interface SkillVersion {
  id: string
  teamId: string
  skillName: string
  version: number
  content: string
  diffFromPrevious: string | null
  changeDescription: string | null
  source: VersionSource
  suggestedByAgentId: string | null
  approvedByUserId: string | null
  status: VersionStatus
  createdAt: string
}

export interface SkillProposal {
  id: string
  teamId: string
  skillName: string
  agentId: string
  proposedContent: string
  reasoning: string
  failureRunIds: string[]
  status: ProposalStatus
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
}

// ---- Version Management ----

/**
 * Snapshot the current skill content as version 1 if no versions exist yet.
 * Called lazily on first access.
 */
export async function ensureInitialVersion(
  db: Db,
  teamId: string,
  skillName: string,
  currentContent: string,
): Promise<void> {
  const existing = await db.query<Record<string, unknown>>(
    'SELECT id FROM skill_versions WHERE team_id = $1 AND skill_name = $2 LIMIT 1',
    [teamId, skillName],
  )
  if (existing.length > 0) return

  const id = randomUUID()
  if (db.driver === 'postgres') {
    await db.run(
      `INSERT INTO skill_versions (id, team_id, skill_name, version, content, change_description, source, status, created_at)
       VALUES ($1, $2, $3, 1, $4, 'Initial version', 'manual', 'active', NOW())`,
      [id, teamId, skillName, currentContent],
    )
  } else {
    await db.run(
      `INSERT INTO skill_versions (id, team_id, skill_name, version, content, change_description, source, status)
       VALUES (?, ?, ?, 1, ?, 'Initial version', 'manual', 'active')`,
      [id, teamId, skillName, currentContent],
    )
  }
}

/** Get the current active version of a skill. */
export async function getActiveVersion(db: Db, teamId: string, skillName: string): Promise<SkillVersion | null> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM skill_versions
     WHERE team_id = $1 AND skill_name = $2 AND status = 'active'
     ORDER BY version DESC LIMIT 1`,
    [teamId, skillName],
  )
  return rows.length > 0 ? mapVersion(rows[0]) : null
}

/** List all versions of a skill (newest first). */
export async function listSkillVersions(db: Db, teamId: string, skillName: string): Promise<SkillVersion[]> {
  if (!teamId) return []
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM skill_versions
     WHERE team_id = $1 AND skill_name = $2
     ORDER BY version DESC`,
    [teamId, skillName],
  )
  return rows.map(mapVersion)
}

/**
 * Create a new skill version. Marks previous active version as 'rolled_back'.
 * Computes a simple line diff from the previous version.
 */
export async function createSkillVersion(
  db: Db,
  teamId: string,
  skillName: string,
  content: string,
  changeDescription: string,
  source: VersionSource,
  suggestedByAgentId?: string,
  approvedByUserId?: string,
): Promise<SkillVersion> {
  // Get current max version
  const maxRow = await db.query<Record<string, unknown>>(
    'SELECT MAX(version) as max_v, content as prev_content FROM skill_versions WHERE team_id = $1 AND skill_name = $2 AND status = $3',
    [teamId, skillName, 'active'],
  )
  const nextVersion = (Number(maxRow[0]?.max_v) || 0) + 1
  const prevContent = (maxRow[0]?.prev_content as string) ?? ''
  const diff = computeLineDiff(prevContent, content)

  // Mark previous active version
  await db.run(
    `UPDATE skill_versions SET status = 'rolled_back' WHERE team_id = $1 AND skill_name = $2 AND status = 'active'`,
    [teamId, skillName],
  )

  const id = randomUUID()
  if (db.driver === 'postgres') {
    await db.run(
      `INSERT INTO skill_versions (id, team_id, skill_name, version, content, diff_from_previous, change_description, source, suggested_by_agent_id, approved_by_user_id, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', NOW())`,
      [id, teamId, skillName, nextVersion, content, diff, changeDescription, source, suggestedByAgentId ?? null, approvedByUserId ?? null],
    )
  } else {
    await db.run(
      `INSERT INTO skill_versions (id, team_id, skill_name, version, content, diff_from_previous, change_description, source, suggested_by_agent_id, approved_by_user_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [id, teamId, skillName, nextVersion, content, diff, changeDescription, source, suggestedByAgentId ?? null, approvedByUserId ?? null],
    )
  }

  return {
    id,
    teamId,
    skillName,
    version: nextVersion,
    content,
    diffFromPrevious: diff,
    changeDescription,
    source,
    suggestedByAgentId: suggestedByAgentId ?? null,
    approvedByUserId: approvedByUserId ?? null,
    status: 'active',
    createdAt: new Date().toISOString(),
  }
}

/** Rollback a skill to a specific version number. */
export async function rollbackSkillVersion(
  db: Db,
  teamId: string,
  skillName: string,
  targetVersion: number,
): Promise<SkillVersion | null> {
  const rows = await db.query<Record<string, unknown>>(
    'SELECT content FROM skill_versions WHERE team_id = $1 AND skill_name = $2 AND version = $3',
    [teamId, skillName, targetVersion],
  )
  if (rows.length === 0) return null

  const content = rows[0].content as string
  return createSkillVersion(db, teamId, skillName, content, `Rolled back to version ${targetVersion}`, 'rollback')
}

// ---- Proposal Management ----

/** Create an improvement proposal (from an agent). Rate limited: 1 pending per skill per team. */
export async function createProposal(
  db: Db,
  teamId: string,
  skillName: string,
  agentId: string,
  proposedContent: string,
  reasoning: string,
  failureRunIds: string[],
): Promise<SkillProposal | null> {
  // Rate limit: only 1 pending proposal per skill per team
  const existing = await db.query<Record<string, unknown>>(
    `SELECT id FROM skill_improvement_proposals
     WHERE team_id = $1 AND skill_name = $2 AND status = 'pending'`,
    [teamId, skillName],
  )
  if (existing.length > 0) return null // already has a pending proposal

  const id = randomUUID()
  if (db.driver === 'postgres') {
    await db.run(
      `INSERT INTO skill_improvement_proposals (id, team_id, skill_name, agent_id, proposed_content, reasoning, failure_run_ids, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW())`,
      [id, teamId, skillName, agentId, proposedContent, reasoning, JSON.stringify(failureRunIds)],
    )
  } else {
    await db.run(
      `INSERT INTO skill_improvement_proposals (id, team_id, skill_name, agent_id, proposed_content, reasoning, failure_run_ids, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [id, teamId, skillName, agentId, proposedContent, reasoning, JSON.stringify(failureRunIds)],
    )
  }

  return {
    id, teamId, skillName, agentId, proposedContent, reasoning, failureRunIds,
    status: 'pending', reviewedBy: null, reviewedAt: null, createdAt: new Date().toISOString(),
  }
}

/** List proposals for a team. */
export async function listProposals(
  db: Db,
  teamId: string,
  status?: ProposalStatus,
): Promise<SkillProposal[]> {
  if (!teamId) return []
  const rows = status
    ? await db.query<Record<string, unknown>>(
        'SELECT * FROM skill_improvement_proposals WHERE team_id = $1 AND status = $2 ORDER BY created_at DESC',
        [teamId, status],
      )
    : await db.query<Record<string, unknown>>(
        'SELECT * FROM skill_improvement_proposals WHERE team_id = $1 ORDER BY created_at DESC',
        [teamId],
      )
  return rows.map(mapProposal)
}

/** Get a single proposal by ID. */
export async function getProposal(db: Db, proposalId: string): Promise<SkillProposal | null> {
  const rows = await db.query<Record<string, unknown>>(
    'SELECT * FROM skill_improvement_proposals WHERE id = $1',
    [proposalId],
  )
  return rows.length > 0 ? mapProposal(rows[0]) : null
}

/**
 * Review (approve or reject) a proposal.
 * If approved, creates a new skill version with the proposed content.
 */
export async function reviewProposal(
  db: Db,
  proposalId: string,
  approved: boolean,
  reviewerUserId: string,
): Promise<SkillVersion | null> {
  const proposal = await getProposal(db, proposalId)
  if (!proposal || proposal.status !== 'pending') return null

  const now = db.driver === 'postgres' ? 'NOW()' : "datetime('now')"
  await db.run(
    `UPDATE skill_improvement_proposals SET status = $1, reviewed_by = $2, reviewed_at = ${now} WHERE id = $3`,
    [approved ? 'approved' : 'rejected', reviewerUserId, proposalId],
  )

  if (!approved) return null

  // Apply the proposal: create a new active version
  const version = await createSkillVersion(
    db,
    proposal.teamId,
    proposal.skillName,
    proposal.proposedContent,
    `AI-suggested improvement: ${proposal.reasoning.slice(0, 100)}`,
    'ai_suggested',
    proposal.agentId,
    reviewerUserId,
  )

  // Mark proposal as applied
  await db.run(
    `UPDATE skill_improvement_proposals SET status = 'applied' WHERE id = $1`,
    [proposalId],
  )

  return version
}

// ---- Simple line diff ----

function computeLineDiff(oldText: string, newText: string): string {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const diff: string[] = []

  const maxLen = Math.max(oldLines.length, newLines.length)
  for (let i = 0; i < maxLen; i++) {
    const oldLine = oldLines[i]
    const newLine = newLines[i]
    if (oldLine === newLine) {
      diff.push(` ${oldLine ?? ''}`)
    } else {
      if (oldLine !== undefined) diff.push(`-${oldLine}`)
      if (newLine !== undefined) diff.push(`+${newLine}`)
    }
  }

  return diff.join('\n')
}

// ---- Mappers ----

function mapVersion(r: Record<string, unknown>): SkillVersion {
  return {
    id: r.id as string,
    teamId: r.team_id as string,
    skillName: r.skill_name as string,
    version: Number(r.version),
    content: r.content as string,
    diffFromPrevious: (r.diff_from_previous as string) ?? null,
    changeDescription: (r.change_description as string) ?? null,
    source: r.source as VersionSource,
    suggestedByAgentId: (r.suggested_by_agent_id as string) ?? null,
    approvedByUserId: (r.approved_by_user_id as string) ?? null,
    status: r.status as VersionStatus,
    createdAt: r.created_at as string,
  }
}

function mapProposal(r: Record<string, unknown>): SkillProposal {
  let failureRunIds: string[] = []
  try { failureRunIds = JSON.parse((r.failure_run_ids as string) ?? '[]') } catch { /* ignore */ }
  return {
    id: r.id as string,
    teamId: r.team_id as string,
    skillName: r.skill_name as string,
    agentId: r.agent_id as string,
    proposedContent: r.proposed_content as string,
    reasoning: r.reasoning as string,
    failureRunIds,
    status: r.status as ProposalStatus,
    reviewedBy: (r.reviewed_by as string) ?? null,
    reviewedAt: (r.reviewed_at as string) ?? null,
    createdAt: r.created_at as string,
  }
}

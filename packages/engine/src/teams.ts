/**
 * teams.ts — Team management CRUD
 */

import type { Db } from './db/types.ts'
import { randomUUID } from 'crypto'

export interface Team { id: string; name: string; createdAt: string }
export interface TeamMember { teamId: string; userId: string; email: string; role: string; joinedAt: string; displayName: string | null }

export async function createTeam(db: Db, name: string): Promise<Team> {
  const id = randomUUID()
  await db.run('INSERT INTO teams (id, name) VALUES ($1, $2)', [id, name])
  return (await getTeam(db, id))!
}

export async function getTeam(db: Db, id: string): Promise<Team | null> {
  const row = await db.queryOne<Record<string, unknown>>('SELECT * FROM teams WHERE id = $1', [id])
  if (!row) return null
  return { id: row.id as string, name: row.name as string, createdAt: row.created_at as string }
}

export async function listTeams(db: Db): Promise<Team[]> {
  const rows = await db.query<Record<string, unknown>>('SELECT * FROM teams ORDER BY created_at DESC')
  return rows.map((r) => ({ id: r.id as string, name: r.name as string, createdAt: r.created_at as string }))
}

export async function getUserTeams(db: Db, userId: string): Promise<Array<Team & { role: string }>> {
  const rows = await db.query<Record<string, unknown>>(
    'SELECT t.*, tm.role FROM teams t JOIN team_members tm ON tm.team_id = t.id WHERE tm.user_id = $1 ORDER BY t.created_at DESC',
    [userId],
  )
  return rows.map((r) => ({ id: r.id as string, name: r.name as string, createdAt: r.created_at as string, role: r.role as string }))
}

export async function addMember(db: Db, teamId: string, userId: string, email: string, role = 'member', displayName?: string): Promise<TeamMember> {
  const name = displayName ?? email.split('@')[0]
  if (db.driver === 'postgres') {
    await db.run(
      'INSERT INTO team_members (team_id, user_id, email, role, display_name) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (team_id, user_id) DO UPDATE SET email = excluded.email, role = excluded.role, display_name = COALESCE(excluded.display_name, team_members.display_name)',
      [teamId, userId, email, role, name],
    )
  } else {
    await db.run(
      'INSERT OR REPLACE INTO team_members (team_id, user_id, email, role, display_name) VALUES ($1, $2, $3, $4, $5)',
      [teamId, userId, email, role, name],
    )
  }
  return (await getMember(db, teamId, userId))!
}

export async function updateMemberDisplayName(db: Db, teamId: string, userId: string, displayName: string): Promise<void> {
  await db.run('UPDATE team_members SET display_name = $1 WHERE team_id = $2 AND user_id = $3', [displayName, teamId, userId])
}

export async function removeMember(db: Db, teamId: string, userId: string): Promise<void> {
  await db.run('DELETE FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, userId])
}

export async function getTeamMembers(db: Db, teamId: string): Promise<TeamMember[]> {
  const rows = await db.query<Record<string, unknown>>(
    'SELECT * FROM team_members WHERE team_id = $1 ORDER BY joined_at ASC',
    [teamId],
  )
  return rows.map(rowToMember)
}

export async function getMember(db: Db, teamId: string, userId: string): Promise<TeamMember | null> {
  const row = await db.queryOne<Record<string, unknown>>(
    'SELECT * FROM team_members WHERE team_id = $1 AND user_id = $2',
    [teamId, userId],
  )
  if (!row) return null
  return rowToMember(row)
}

export async function updateMemberRole(db: Db, teamId: string, userId: string, role: string): Promise<TeamMember | null> {
  await db.run('UPDATE team_members SET role = $1 WHERE team_id = $2 AND user_id = $3', [role, teamId, userId])
  return getMember(db, teamId, userId)
}

export async function deleteTeam(db: Db, id: string): Promise<void> {
  // Cascade-delete all team data to prevent orphaned records
  // Order matters: delete leaf tables first, then parents
  await db.run('DELETE FROM resource_tags WHERE team_id = $1', [id])
  await db.run('DELETE FROM tags WHERE team_id = $1', [id])
  await db.run('DELETE FROM credit_transactions WHERE team_id = $1', [id])
  await db.run('DELETE FROM team_credits WHERE team_id = $1', [id])
  await db.run('DELETE FROM tasks WHERE team_id = $1', [id])
  await db.run('DELETE FROM agents WHERE team_id = $1', [id])
  await db.run('DELETE FROM team_members WHERE team_id = $1', [id])
  await db.run('DELETE FROM teams WHERE id = $1', [id])
}

/** Get all agent IDs for a team (used for scheduler cleanup). */
export async function getTeamAgentIds(db: Db, teamId: string): Promise<string[]> {
  const rows = await db.query<{ id: string }>('SELECT id FROM agents WHERE team_id = $1', [teamId])
  return rows.map((r) => r.id)
}

/** Look up any existing user by email across all teams. Returns userId if found. */
export async function findUserByEmail(db: Db, email: string): Promise<string | null> {
  const row = await db.queryOne<Record<string, unknown>>(
    'SELECT user_id FROM team_members WHERE email = $1 LIMIT 1',
    [email],
  )
  return row ? (row.user_id as string) : null
}

function rowToMember(row: Record<string, unknown>): TeamMember {
  return { teamId: row.team_id as string, userId: row.user_id as string, email: row.email as string, role: row.role as string, joinedAt: row.joined_at as string, displayName: (row.display_name as string | null) ?? null }
}

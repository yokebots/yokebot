/**
 * teams.ts — Team management CRUD
 */

import type { Db } from './db/types.ts'
import { randomUUID } from 'crypto'

export interface Team { id: string; name: string; createdAt: string }
export interface TeamMember { teamId: string; userId: string; email: string; role: string; joinedAt: string }

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

export async function addMember(db: Db, teamId: string, userId: string, email: string, role = 'member'): Promise<TeamMember> {
  if (db.driver === 'postgres') {
    await db.run(
      'INSERT INTO team_members (team_id, user_id, email, role) VALUES ($1, $2, $3, $4) ON CONFLICT (team_id, user_id) DO UPDATE SET email = excluded.email, role = excluded.role',
      [teamId, userId, email, role],
    )
  } else {
    await db.run(
      'INSERT OR REPLACE INTO team_members (team_id, user_id, email, role) VALUES ($1, $2, $3, $4)',
      [teamId, userId, email, role],
    )
  }
  return (await getMember(db, teamId, userId))!
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
  await db.run('DELETE FROM teams WHERE id = $1', [id])
}

function rowToMember(row: Record<string, unknown>): TeamMember {
  return { teamId: row.team_id as string, userId: row.user_id as string, email: row.email as string, role: row.role as string, joinedAt: row.joined_at as string }
}

/**
 * teams.ts — Team management CRUD
 *
 * Handles team creation, membership, and role management.
 */

import type Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

export interface Team {
  id: string
  name: string
  createdAt: string
}

export interface TeamMember {
  teamId: string
  userId: string
  email: string
  role: string
  joinedAt: string
}

export function createTeam(db: Database.Database, name: string): Team {
  const id = randomUUID()
  db.prepare('INSERT INTO teams (id, name) VALUES (?, ?)').run(id, name)
  return getTeam(db, id)!
}

export function getTeam(db: Database.Database, id: string): Team | null {
  const row = db.prepare('SELECT * FROM teams WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!row) return null
  return { id: row.id as string, name: row.name as string, createdAt: row.created_at as string }
}

export function listTeams(db: Database.Database): Team[] {
  const rows = db.prepare('SELECT * FROM teams ORDER BY created_at DESC').all() as Record<string, unknown>[]
  return rows.map((r) => ({ id: r.id as string, name: r.name as string, createdAt: r.created_at as string }))
}

export function getUserTeams(db: Database.Database, userId: string): Array<Team & { role: string }> {
  const rows = db.prepare(`
    SELECT t.*, tm.role FROM teams t
    JOIN team_members tm ON tm.team_id = t.id
    WHERE tm.user_id = ?
    ORDER BY t.created_at DESC
  `).all(userId) as Record<string, unknown>[]
  return rows.map((r) => ({
    id: r.id as string, name: r.name as string, createdAt: r.created_at as string, role: r.role as string,
  }))
}

export function addMember(db: Database.Database, teamId: string, userId: string, email: string, role = 'member'): TeamMember {
  db.prepare('INSERT OR REPLACE INTO team_members (team_id, user_id, email, role) VALUES (?, ?, ?, ?)').run(teamId, userId, email, role)
  return getMember(db, teamId, userId)!
}

export function removeMember(db: Database.Database, teamId: string, userId: string): void {
  db.prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?').run(teamId, userId)
}

export function getTeamMembers(db: Database.Database, teamId: string): TeamMember[] {
  const rows = db.prepare('SELECT * FROM team_members WHERE team_id = ? ORDER BY joined_at ASC').all(teamId) as Record<string, unknown>[]
  return rows.map((r) => ({
    teamId: r.team_id as string, userId: r.user_id as string, email: r.email as string,
    role: r.role as string, joinedAt: r.joined_at as string,
  }))
}

export function getMember(db: Database.Database, teamId: string, userId: string): TeamMember | null {
  const row = db.prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?').get(teamId, userId) as Record<string, unknown> | undefined
  if (!row) return null
  return {
    teamId: row.team_id as string, userId: row.user_id as string, email: row.email as string,
    role: row.role as string, joinedAt: row.joined_at as string,
  }
}

export function updateMemberRole(db: Database.Database, teamId: string, userId: string, role: string): TeamMember | null {
  db.prepare('UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?').run(role, teamId, userId)
  return getMember(db, teamId, userId)
}

export function deleteTeam(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM teams WHERE id = ?').run(id)
}

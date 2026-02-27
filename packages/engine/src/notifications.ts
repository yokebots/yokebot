/**
 * notifications.ts — Unified notification system
 *
 * Notifications span across ALL teams for a given user (like Discord).
 * Each notification belongs to a team but the feed aggregates all.
 * Per-team mute settings let users silence noisy teams.
 */

import type { Db } from './db/types.ts'
import { randomUUID } from 'crypto'

export type NotificationType = 'approval_needed' | 'task_assigned' | 'agent_message' | 'mention' | 'system'

export interface Notification {
  id: string
  teamId: string
  userId: string
  type: NotificationType
  title: string
  body: string
  link: string | null
  read: boolean
  emailed: boolean
  createdAt: string
}

export interface NotificationPreference {
  userId: string
  teamId: string
  inAppEnabled: boolean
  emailEnabled: boolean
  muted: boolean
}

// ---- Create ----

export async function createNotification(
  db: Db,
  teamId: string,
  userId: string,
  type: NotificationType,
  title: string,
  body = '',
  link?: string,
): Promise<Notification> {
  const id = randomUUID()
  await db.run(
    'INSERT INTO notifications (id, team_id, user_id, type, title, body, link) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [id, teamId, userId, type, title, body, link ?? null],
  )
  return (await getNotification(db, id))!
}

/**
 * Notify all members of a team (respects mute settings).
 * Returns the list of notifications created.
 */
export async function notifyTeam(
  db: Db,
  teamId: string,
  type: NotificationType,
  title: string,
  body = '',
  link?: string,
  excludeUserId?: string,
): Promise<Notification[]> {
  // Get all team members
  const members = await db.query<{ user_id: string }>(
    'SELECT user_id FROM team_members WHERE team_id = $1',
    [teamId],
  )

  const notifications: Notification[] = []
  for (const member of members) {
    if (member.user_id === excludeUserId) continue

    // Check if user has muted this team
    const pref = await getPreference(db, member.user_id, teamId)
    if (pref?.muted || pref?.inAppEnabled === false) continue

    const notif = await createNotification(db, teamId, member.user_id, type, title, body, link)
    notifications.push(notif)
  }

  return notifications
}

// ---- Read ----

export async function getNotification(db: Db, id: string): Promise<Notification | null> {
  const row = await db.queryOne<Record<string, unknown>>('SELECT * FROM notifications WHERE id = $1', [id])
  if (!row) return null
  return rowToNotification(row)
}

/**
 * List notifications for a user — across ALL teams (unified feed).
 */
export async function listNotifications(
  db: Db,
  userId: string,
  opts?: { limit?: number; before?: string; teamId?: string },
): Promise<Notification[]> {
  let sql = 'SELECT * FROM notifications WHERE user_id = $1'
  const params: unknown[] = [userId]
  let paramIdx = 2

  if (opts?.teamId) { sql += ` AND team_id = $${paramIdx++}`; params.push(opts.teamId) }
  if (opts?.before) { sql += ` AND created_at < $${paramIdx++}`; params.push(opts.before) }

  sql += ` ORDER BY created_at DESC LIMIT $${paramIdx}`
  params.push(opts?.limit ?? 50)

  const rows = await db.query<Record<string, unknown>>(sql, params)
  return rows.map(rowToNotification)
}

export async function countUnread(db: Db, userId: string): Promise<number> {
  const row = await db.queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND read = 0',
    [userId],
  )
  return row?.count ?? 0
}

// ---- Update ----

export async function markRead(db: Db, id: string, userId: string): Promise<void> {
  await db.run('UPDATE notifications SET read = 1 WHERE id = $1 AND user_id = $2', [id, userId])
}

export async function markAllRead(db: Db, userId: string, teamId?: string): Promise<void> {
  if (teamId) {
    await db.run('UPDATE notifications SET read = 1 WHERE user_id = $1 AND team_id = $2 AND read = 0', [userId, teamId])
  } else {
    await db.run('UPDATE notifications SET read = 1 WHERE user_id = $1 AND read = 0', [userId])
  }
}

// ---- Preferences ----

export async function getPreference(db: Db, userId: string, teamId: string): Promise<NotificationPreference | null> {
  const row = await db.queryOne<Record<string, unknown>>(
    'SELECT * FROM notification_preferences WHERE user_id = $1 AND team_id = $2',
    [userId, teamId],
  )
  if (!row) return null
  return {
    userId: row.user_id as string,
    teamId: row.team_id as string,
    inAppEnabled: (row.in_app_enabled as number) === 1,
    emailEnabled: (row.email_enabled as number) === 1,
    muted: (row.muted as number) === 1,
  }
}

export async function listPreferences(db: Db, userId: string): Promise<NotificationPreference[]> {
  const rows = await db.query<Record<string, unknown>>(
    'SELECT * FROM notification_preferences WHERE user_id = $1',
    [userId],
  )
  return rows.map((row) => ({
    userId: row.user_id as string,
    teamId: row.team_id as string,
    inAppEnabled: (row.in_app_enabled as number) === 1,
    emailEnabled: (row.email_enabled as number) === 1,
    muted: (row.muted as number) === 1,
  }))
}

export async function setPreference(
  db: Db,
  userId: string,
  teamId: string,
  updates: { inAppEnabled?: boolean; emailEnabled?: boolean; muted?: boolean },
): Promise<NotificationPreference> {
  const existing = await getPreference(db, userId, teamId)
  const inApp = updates.inAppEnabled ?? existing?.inAppEnabled ?? true
  const email = updates.emailEnabled ?? existing?.emailEnabled ?? true
  const muted = updates.muted ?? existing?.muted ?? false

  if (db.driver === 'postgres') {
    await db.run(
      `INSERT INTO notification_preferences (user_id, team_id, in_app_enabled, email_enabled, muted)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, team_id) DO UPDATE SET in_app_enabled = $3, email_enabled = $4, muted = $5`,
      [userId, teamId, inApp ? 1 : 0, email ? 1 : 0, muted ? 1 : 0],
    )
  } else {
    await db.run(
      `INSERT OR REPLACE INTO notification_preferences (user_id, team_id, in_app_enabled, email_enabled, muted)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, teamId, inApp ? 1 : 0, email ? 1 : 0, muted ? 1 : 0],
    )
  }

  return { userId, teamId, inAppEnabled: inApp, emailEnabled: email, muted }
}

// ---- Helpers ----

function rowToNotification(row: Record<string, unknown>): Notification {
  return {
    id: row.id as string,
    teamId: row.team_id as string,
    userId: row.user_id as string,
    type: row.type as NotificationType,
    title: row.title as string,
    body: row.body as string,
    link: row.link as string | null,
    read: (row.read as number) === 1,
    emailed: (row.emailed as number) === 1,
    createdAt: row.created_at as string,
  }
}

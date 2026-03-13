/**
 * session-vault.ts — Encrypted browser session storage per team
 *
 * Stores authenticated browser state (cookies, localStorage, session tokens)
 * captured via Playwright's storageState(). Encrypted with the same
 * AES-256-GCM scheme as credentials.ts.
 */

import crypto from 'node:crypto'
import type { Db } from './db/types.ts'
import { encryptValue, decryptValue } from './credentials.ts'

// ---- Types ----

export interface VaultSessionInfo {
  id: string
  teamId: string
  serviceLabel: string
  domain: string
  status: string
  recordedBy: string
  recordedAt: string
  lastUsedAt: string | null
  lastVerifiedAt: string | null
  useCount: number
  createdAt: string
  updatedAt: string
}

export interface VaultLogEntry {
  id: string
  sessionId: string
  teamId: string
  eventType: string
  agentId: string | null
  userId: string | null
  details: string | null
  createdAt: string
}

// ---- Helpers ----

function generateId(): string {
  return crypto.randomUUID()
}

function p(db: Db, index: number): string {
  return db.driver === 'postgres' ? `$${index}` : '?'
}

function now(db: Db): string {
  return db.driver === 'postgres' ? 'NOW()' : "datetime('now')"
}

// ---- Public API ----

/** Create a new vault session with encrypted storageState. */
export async function createVaultSession(
  db: Db,
  teamId: string,
  label: string,
  domain: string,
  storageState: string,
  recordedBy: string,
): Promise<VaultSessionInfo> {
  const id = generateId()
  const encrypted = encryptValue(storageState)

  await db.run(
    `INSERT INTO session_vault (id, team_id, service_label, domain, encrypted_state, status, recorded_by, recorded_at, created_at, updated_at)
     VALUES (${p(db, 1)}, ${p(db, 2)}, ${p(db, 3)}, ${p(db, 4)}, ${p(db, 5)}, 'active', ${p(db, 6)}, ${now(db)}, ${now(db)}, ${now(db)})`,
    [id, teamId, label, domain, encrypted, recordedBy],
  )

  return {
    id,
    teamId,
    serviceLabel: label,
    domain,
    status: 'active',
    recordedBy,
    recordedAt: new Date().toISOString(),
    lastUsedAt: null,
    lastVerifiedAt: null,
    useCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

/** List all vault sessions for a team (metadata only — never the encrypted state). */
export async function listVaultSessions(db: Db, teamId: string): Promise<VaultSessionInfo[]> {
  const rows = await db.query<{
    id: string
    team_id: string
    service_label: string
    domain: string
    status: string
    recorded_by: string
    recorded_at: string
    last_used_at: string | null
    last_verified_at: string | null
    use_count: number
    created_at: string
    updated_at: string
  }>(
    `SELECT id, team_id, service_label, domain, status, recorded_by, recorded_at,
            last_used_at, last_verified_at, use_count, created_at, updated_at
     FROM session_vault WHERE team_id = ${p(db, 1)} ORDER BY created_at DESC`,
    [teamId],
  )

  return rows.map((r) => ({
    id: r.id,
    teamId: r.team_id,
    serviceLabel: r.service_label,
    domain: r.domain,
    status: r.status,
    recordedBy: r.recorded_by,
    recordedAt: r.recorded_at,
    lastUsedAt: r.last_used_at,
    lastVerifiedAt: r.last_verified_at,
    useCount: r.use_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))
}

/** Get decrypted storageState for a session. Server-side only. */
export async function getVaultSession(
  db: Db,
  sessionId: string,
  teamId: string,
): Promise<{ info: VaultSessionInfo; storageState: string } | null> {
  const row = await db.queryOne<{
    id: string
    team_id: string
    service_label: string
    domain: string
    encrypted_state: string
    status: string
    recorded_by: string
    recorded_at: string
    last_used_at: string | null
    last_verified_at: string | null
    use_count: number
    created_at: string
    updated_at: string
  }>(
    `SELECT * FROM session_vault WHERE id = ${p(db, 1)} AND team_id = ${p(db, 2)}`,
    [sessionId, teamId],
  )

  if (!row) return null

  return {
    info: {
      id: row.id,
      teamId: row.team_id,
      serviceLabel: row.service_label,
      domain: row.domain,
      status: row.status,
      recordedBy: row.recorded_by,
      recordedAt: row.recorded_at,
      lastUsedAt: row.last_used_at,
      lastVerifiedAt: row.last_verified_at,
      useCount: row.use_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    storageState: decryptValue(row.encrypted_state),
  }
}

/** Find an active session by domain for a team. */
export async function findVaultSessionByDomain(
  db: Db,
  teamId: string,
  domain: string,
): Promise<{ info: VaultSessionInfo; storageState: string } | null> {
  const row = await db.queryOne<{
    id: string
    team_id: string
    service_label: string
    domain: string
    encrypted_state: string
    status: string
    recorded_by: string
    recorded_at: string
    last_used_at: string | null
    last_verified_at: string | null
    use_count: number
    created_at: string
    updated_at: string
  }>(
    `SELECT * FROM session_vault WHERE team_id = ${p(db, 1)} AND domain = ${p(db, 2)} AND status = 'active'
     ORDER BY created_at DESC LIMIT 1`,
    [teamId, domain],
  )

  if (!row) return null

  return {
    info: {
      id: row.id,
      teamId: row.team_id,
      serviceLabel: row.service_label,
      domain: row.domain,
      status: row.status,
      recordedBy: row.recorded_by,
      recordedAt: row.recorded_at,
      lastUsedAt: row.last_used_at,
      lastVerifiedAt: row.last_verified_at,
      useCount: row.use_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    storageState: decryptValue(row.encrypted_state),
  }
}

/** Soft-revoke a session (keeps record, marks inactive). */
export async function revokeVaultSession(db: Db, sessionId: string, teamId: string): Promise<boolean> {
  const existing = await db.queryOne(
    `SELECT 1 FROM session_vault WHERE id = ${p(db, 1)} AND team_id = ${p(db, 2)}`,
    [sessionId, teamId],
  )
  if (!existing) return false

  await db.run(
    `UPDATE session_vault SET status = 'revoked', updated_at = ${now(db)} WHERE id = ${p(db, 1)} AND team_id = ${p(db, 2)}`,
    [sessionId, teamId],
  )
  return true
}

/** Hard-delete a session and its logs. */
export async function deleteVaultSession(db: Db, sessionId: string, teamId: string): Promise<boolean> {
  const existing = await db.queryOne(
    `SELECT 1 FROM session_vault WHERE id = ${p(db, 1)} AND team_id = ${p(db, 2)}`,
    [sessionId, teamId],
  )
  if (!existing) return false

  await db.run(
    `DELETE FROM session_vault WHERE id = ${p(db, 1)} AND team_id = ${p(db, 2)}`,
    [sessionId, teamId],
  )
  return true
}

/** Mark a session as expired. */
export async function expireVaultSession(db: Db, sessionId: string, teamId: string): Promise<boolean> {
  const existing = await db.queryOne(
    `SELECT 1 FROM session_vault WHERE id = ${p(db, 1)} AND team_id = ${p(db, 2)}`,
    [sessionId, teamId],
  )
  if (!existing) return false

  await db.run(
    `UPDATE session_vault SET status = 'expired', updated_at = ${now(db)} WHERE id = ${p(db, 1)} AND team_id = ${p(db, 2)}`,
    [sessionId, teamId],
  )
  return true
}

/** Bump last_used_at and use_count after an agent uses the session. */
export async function updateSessionUsage(db: Db, sessionId: string): Promise<void> {
  await db.run(
    `UPDATE session_vault SET last_used_at = ${now(db)}, use_count = use_count + 1, updated_at = ${now(db)} WHERE id = ${p(db, 1)}`,
    [sessionId],
  )
}

/** Sanitize details to avoid logging sensitive info (URLs, tokens, error messages). */
function sanitizeLogDetails(details?: string): string | null {
  if (!details) return null
  // Strip URLs, API keys, tokens, and other sensitive patterns
  return details
    .replace(/https?:\/\/[^\s]+/gi, '[url]')
    .replace(/Bearer\s+\S+/gi, '[token]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]')
    .slice(0, 200) // Cap length
}

/** Write an audit log entry. */
export async function logVaultEvent(
  db: Db,
  sessionId: string,
  teamId: string,
  eventType: string,
  agentId?: string,
  userId?: string,
  details?: string,
): Promise<void> {
  const id = generateId()
  const safeDetails = sanitizeLogDetails(details)
  await db.run(
    `INSERT INTO session_vault_log (id, session_id, team_id, event_type, agent_id, user_id, details, created_at)
     VALUES (${p(db, 1)}, ${p(db, 2)}, ${p(db, 3)}, ${p(db, 4)}, ${p(db, 5)}, ${p(db, 6)}, ${p(db, 7)}, ${now(db)})`,
    [id, sessionId, teamId, eventType, agentId ?? null, userId ?? null, safeDetails],
  )
}

/** Get audit log for a session. */
export async function getVaultLogs(db: Db, sessionId: string, teamId: string): Promise<VaultLogEntry[]> {
  const rows = await db.query<{
    id: string
    session_id: string
    team_id: string
    event_type: string
    agent_id: string | null
    user_id: string | null
    details: string | null
    created_at: string
  }>(
    `SELECT id, session_id, team_id, event_type, agent_id, user_id, details, created_at
     FROM session_vault_log WHERE session_id = ${p(db, 1)} AND team_id = ${p(db, 2)}
     ORDER BY created_at DESC`,
    [sessionId, teamId],
  )

  return rows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    teamId: r.team_id,
    eventType: r.event_type,
    agentId: r.agent_id,
    userId: r.user_id,
    details: r.details,
    createdAt: r.created_at,
  }))
}

/**
 * api-keys.ts — CRUD and validation for API keys
 *
 * API keys allow programmatic access to the engine (CI/CD, scripts, mobile apps).
 * Keys are stored as SHA-256 hashes — the plaintext is returned only once at creation.
 */

import crypto from 'node:crypto'
import type { Db } from './db/types.ts'

const API_KEY_PREFIX = 'yk_live_'

export interface ApiKey {
  id: string
  teamId: string
  createdBy: string
  name: string
  keyPrefix: string
  scopes: string
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
}

export interface ApiKeyRow {
  id: string
  team_id: string
  created_by: string
  name: string
  key_prefix: string
  key_hash: string
  scopes: string
  last_used_at: string | null
  expires_at: string | null
  revoked_at: string | null
  created_at: string
}

function rowToApiKey(row: ApiKeyRow): ApiKey {
  return {
    id: row.id,
    teamId: row.team_id,
    createdBy: row.created_by,
    name: row.name,
    keyPrefix: row.key_prefix,
    scopes: row.scopes,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  }
}

/** Generate a new API key: `yk_live_` + 32 random bytes as base64url */
function generateKey(): string {
  const body = crypto.randomBytes(32).toString('base64url')
  return `${API_KEY_PREFIX}${body}`
}

/** SHA-256 hash of a plaintext key */
function hashKey(plaintext: string): string {
  return crypto.createHash('sha256').update(plaintext).digest('hex')
}

/** Extract the display prefix (first 8 chars after yk_live_) */
function extractPrefix(plaintext: string): string {
  return plaintext.slice(API_KEY_PREFIX.length, API_KEY_PREFIX.length + 8)
}

/** Create a new API key. Returns the key metadata + plaintext (shown only once). */
export async function createApiKey(
  db: Db,
  teamId: string,
  createdBy: string,
  name: string,
  scopes: string = '*',
  expiresAt?: string,
): Promise<ApiKey & { plaintext: string }> {
  const id = crypto.randomUUID()
  const plaintext = generateKey()
  const keyHash = hashKey(plaintext)
  const keyPrefix = extractPrefix(plaintext)

  await db.run(
    `INSERT INTO api_keys (id, team_id, created_by, name, key_prefix, key_hash, scopes, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, teamId, createdBy, name, keyPrefix, keyHash, scopes, expiresAt ?? null],
  )

  const row = await db.queryOne<ApiKeyRow>(`SELECT * FROM api_keys WHERE id = $1`, [id])
  return { ...rowToApiKey(row!), plaintext }
}

/** List all API keys for a team (no secrets). */
export async function listApiKeys(db: Db, teamId: string): Promise<ApiKey[]> {
  const rows = await db.query<ApiKeyRow>(
    `SELECT * FROM api_keys WHERE team_id = $1 ORDER BY created_at DESC`,
    [teamId],
  )
  return rows.map(rowToApiKey)
}

/** Validate an API key. Returns the key record if valid, null otherwise. */
export async function validateApiKey(db: Db, plaintext: string): Promise<ApiKey | null> {
  const keyHash = hashKey(plaintext)
  const row = await db.queryOne<ApiKeyRow>(
    `SELECT * FROM api_keys WHERE key_hash = $1`,
    [keyHash],
  )
  if (!row) return null

  // Check if revoked
  if (row.revoked_at) return null

  // Check if expired
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null

  // Update last_used_at (fire and forget)
  void db.run(`UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`, [row.id])

  return rowToApiKey(row)
}

/** Soft-revoke an API key (keeps audit trail). */
export async function revokeApiKey(db: Db, id: string, teamId: string): Promise<boolean> {
  // Check key exists and is not already revoked
  const existing = await db.queryOne<ApiKeyRow>(
    `SELECT id FROM api_keys WHERE id = $1 AND team_id = $2 AND revoked_at IS NULL`,
    [id, teamId],
  )
  if (!existing) return false
  await db.run(
    `UPDATE api_keys SET revoked_at = NOW() WHERE id = $1`,
    [id],
  )
  return true
}

/** Regenerate: revoke the old key and create a new one with the same name/scopes. */
export async function regenerateApiKey(
  db: Db,
  id: string,
  teamId: string,
  createdBy: string,
): Promise<(ApiKey & { plaintext: string }) | null> {
  const old = await db.queryOne<ApiKeyRow>(
    `SELECT * FROM api_keys WHERE id = $1 AND team_id = $2`,
    [id, teamId],
  )
  if (!old) return null

  // Revoke old key
  await db.run(`UPDATE api_keys SET revoked_at = NOW() WHERE id = $1`, [id])

  // Create new key with same name and scopes
  return createApiKey(db, teamId, createdBy, old.name, old.scopes, old.expires_at ?? undefined)
}

/** Hard-delete an API key. */
export async function deleteApiKey(db: Db, id: string, teamId: string): Promise<boolean> {
  const existing = await db.queryOne<ApiKeyRow>(
    `SELECT id FROM api_keys WHERE id = $1 AND team_id = $2`,
    [id, teamId],
  )
  if (!existing) return false
  await db.run(`DELETE FROM api_keys WHERE id = $1`, [id])
  return true
}

/** Check if a set of scopes permits a given operation. */
export function hasScope(keyScopes: string, required: string): boolean {
  if (keyScopes === '*') return true
  const scopes = keyScopes.split(',').map((s) => s.trim())
  return scopes.includes(required)
}

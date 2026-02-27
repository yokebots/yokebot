/**
 * credentials.ts — Encrypted BYOK credential storage per team
 *
 * Stores third-party API keys (SendGrid, Brave, Twilio, etc.) encrypted
 * with AES-256-GCM using YOKEBOT_ENCRYPTION_KEY. Self-hosted users without
 * an encryption key get plaintext storage with a console warning.
 */

import crypto from 'node:crypto'
import type { Db } from './db/types.ts'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16

let encryptionKey: Buffer | null = null
let warnedPlaintext = false

function getKey(): Buffer | null {
  if (encryptionKey) return encryptionKey
  const raw = process.env.YOKEBOT_ENCRYPTION_KEY
  if (!raw) {
    if (!warnedPlaintext) {
      console.warn('[credentials] YOKEBOT_ENCRYPTION_KEY not set — credentials stored as plaintext. Set a 32-byte hex key for production.')
      warnedPlaintext = true
    }
    return null
  }
  encryptionKey = Buffer.from(raw, 'hex')
  if (encryptionKey.length !== 32) {
    throw new Error('YOKEBOT_ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters)')
  }
  return encryptionKey
}

function encrypt(plaintext: string): string {
  const key = getKey()
  if (!key) return `plain:${plaintext}`

  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: enc:<iv>:<tag>:<ciphertext> all base64
  return `enc:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`
}

function decrypt(stored: string): string {
  if (stored.startsWith('plain:')) return stored.slice(6)

  const key = getKey()
  if (!key) throw new Error('Cannot decrypt — YOKEBOT_ENCRYPTION_KEY not set')

  const parts = stored.split(':')
  if (parts.length !== 4 || parts[0] !== 'enc') {
    throw new Error('Invalid encrypted credential format')
  }
  const iv = Buffer.from(parts[1], 'base64')
  const tag = Buffer.from(parts[2], 'base64')
  const ciphertext = Buffer.from(parts[3], 'base64')

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(ciphertext) + decipher.final('utf8')
}

// ---- Public API ----

export interface CredentialInfo {
  serviceId: string
  credentialType: string
  hasValue: boolean
  updatedAt: string
}

/** List all credentials for a team (never exposes actual values). */
export async function listCredentials(db: Db, teamId: string): Promise<CredentialInfo[]> {
  const rows = await db.all<{ service_id: string; credential_type: string; updated_at: string }>(
    `SELECT service_id, credential_type, updated_at FROM team_credentials WHERE team_id = ?`,
    [teamId],
  )
  return rows.map((r) => ({
    serviceId: r.service_id,
    credentialType: r.credential_type,
    hasValue: true,
    updatedAt: r.updated_at,
  }))
}

/** Get a single decrypted credential value. Returns null if not set. */
export async function getCredential(db: Db, teamId: string, serviceId: string): Promise<string | null> {
  const row = await db.get<{ encrypted_value: string }>(
    `SELECT encrypted_value FROM team_credentials WHERE team_id = ? AND service_id = ?`,
    [teamId, serviceId],
  )
  if (!row) return null
  return decrypt(row.encrypted_value)
}

/** Batch-fetch multiple decrypted credentials. Returns a map of serviceId → value. */
export async function getCredentials(
  db: Db,
  teamId: string,
  serviceIds: string[],
): Promise<Record<string, string>> {
  if (serviceIds.length === 0) return {}
  const placeholders = serviceIds.map(() => '?').join(',')
  const rows = await db.all<{ service_id: string; encrypted_value: string }>(
    `SELECT service_id, encrypted_value FROM team_credentials WHERE team_id = ? AND service_id IN (${placeholders})`,
    [teamId, ...serviceIds],
  )
  const result: Record<string, string> = {}
  for (const row of rows) {
    result[row.service_id] = decrypt(row.encrypted_value)
  }
  return result
}

/** Upsert a credential (encrypts before storing). */
export async function setCredential(
  db: Db,
  teamId: string,
  serviceId: string,
  value: string,
  credentialType = 'api_key',
): Promise<void> {
  const encrypted = encrypt(value)
  if (db.driver === 'postgres') {
    await db.run(
      `INSERT INTO team_credentials (team_id, service_id, credential_type, encrypted_value, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (team_id, service_id) DO UPDATE SET
         encrypted_value = EXCLUDED.encrypted_value,
         credential_type = EXCLUDED.credential_type,
         updated_at = NOW()`,
      [teamId, serviceId, credentialType, encrypted],
    )
  } else {
    await db.run(
      `INSERT INTO team_credentials (team_id, service_id, credential_type, encrypted_value, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT (team_id, service_id) DO UPDATE SET
         encrypted_value = excluded.encrypted_value,
         credential_type = excluded.credential_type,
         updated_at = datetime('now')`,
      [teamId, serviceId, credentialType, encrypted],
    )
  }
}

/** Delete a credential. */
export async function deleteCredential(db: Db, teamId: string, serviceId: string): Promise<boolean> {
  const result = await db.run(
    `DELETE FROM team_credentials WHERE team_id = ? AND service_id = ?`,
    [teamId, serviceId],
  )
  return (result.changes ?? 0) > 0
}

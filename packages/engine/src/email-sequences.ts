/**
 * email-sequences.ts — Drip campaign / email sequence engine
 *
 * Agents can create sequences (name + steps with delay, subject, body),
 * enroll/unenroll contacts, and a scheduler tick advances pending sends.
 */

import type { Db } from './db/types.ts'
import { randomUUID } from 'crypto'
import { Resend } from 'resend'
import { getCredential } from './credentials.ts'

export interface SequenceStep {
  delayDays: number
  subject: string
  body: string
}

export interface EmailSequence {
  id: string
  teamId: string
  name: string
  fromEmail: string
  steps: SequenceStep[]
  status: 'active' | 'paused'
  createdAt: string
}

export interface SequenceEnrollment {
  id: string
  sequenceId: string
  teamId: string
  contactEmail: string
  contactName: string
  currentStep: number
  nextSendAt: string | null
  status: 'active' | 'completed' | 'unenrolled'
  createdAt: string
}

// --- Sequence CRUD ---

export async function createSequence(
  db: Db,
  teamId: string,
  name: string,
  fromEmail: string,
  steps: SequenceStep[],
): Promise<EmailSequence> {
  const id = randomUUID()
  const now = new Date().toISOString()
  await db.run(
    `INSERT INTO email_sequences (id, team_id, name, from_email, steps, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, teamId, name, fromEmail, JSON.stringify(steps), 'active', now],
  )
  return { id, teamId, name, fromEmail, steps, status: 'active', createdAt: now }
}

export async function listSequences(db: Db, teamId: string): Promise<EmailSequence[]> {
  const rows = await db.query<{
    id: string; team_id: string; name: string; from_email: string;
    steps: string; status: string; created_at: string
  }>(
    'SELECT * FROM email_sequences WHERE team_id = $1 ORDER BY created_at DESC',
    [teamId],
  )
  return rows.map((r) => ({
    id: r.id,
    teamId: r.team_id,
    name: r.name,
    fromEmail: r.from_email,
    steps: JSON.parse(r.steps) as SequenceStep[],
    status: r.status as 'active' | 'paused',
    createdAt: r.created_at,
  }))
}

export async function getSequence(db: Db, id: string, teamId: string): Promise<EmailSequence | null> {
  const row = await db.queryOne<{
    id: string; team_id: string; name: string; from_email: string;
    steps: string; status: string; created_at: string
  }>(
    'SELECT * FROM email_sequences WHERE id = $1 AND team_id = $2',
    [id, teamId],
  )
  if (!row) return null
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    fromEmail: row.from_email,
    steps: JSON.parse(row.steps) as SequenceStep[],
    status: row.status as 'active' | 'paused',
    createdAt: row.created_at,
  }
}

export async function deleteSequence(db: Db, id: string, teamId: string): Promise<void> {
  await db.run('DELETE FROM email_sequences WHERE id = $1 AND team_id = $2', [id, teamId])
}

// --- Enrollment ---

export async function enrollContact(
  db: Db,
  sequenceId: string,
  teamId: string,
  contactEmail: string,
  contactName: string,
): Promise<SequenceEnrollment> {
  const seq = await getSequence(db, sequenceId, teamId)
  if (!seq) throw new Error('Sequence not found')
  if (seq.steps.length === 0) throw new Error('Sequence has no steps')

  const id = randomUUID()
  const now = new Date()
  const firstDelay = seq.steps[0].delayDays
  const nextSendAt = new Date(now.getTime() + firstDelay * 24 * 60 * 60 * 1000).toISOString()

  await db.run(
    `INSERT INTO email_sequence_enrollments (id, sequence_id, team_id, contact_email, contact_name, current_step, next_send_at, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, sequenceId, teamId, contactEmail, contactName, 0, nextSendAt, 'active', now.toISOString()],
  )

  return {
    id, sequenceId, teamId, contactEmail, contactName,
    currentStep: 0, nextSendAt, status: 'active', createdAt: now.toISOString(),
  }
}

export async function unenrollContact(db: Db, enrollmentId: string, teamId: string): Promise<void> {
  await db.run(
    `UPDATE email_sequence_enrollments SET status = 'unenrolled', next_send_at = NULL
     WHERE id = $1 AND team_id = $2`,
    [enrollmentId, teamId],
  )
}

// --- Scheduler tick: process pending sends ---

/**
 * Resolve a Resend API key for a team:
 * 1. Team's own key from team_credentials (BYOK)
 * 2. Native platform key in hosted mode (RESEND_API_KEY env var)
 * 3. Env fallback in self-hosted mode
 */
async function resolveResendKey(db: Db, teamId: string): Promise<string | null> {
  // 1. BYOK — team's own Resend key
  const teamKey = await getCredential(db, teamId, 'resend')
  if (teamKey) return teamKey

  // 2. Hosted mode — native platform key
  if (process.env.YOKEBOT_HOSTED_MODE === 'true') {
    return process.env.RESEND_API_KEY || null
  }

  // 3. Self-hosted — env fallback
  return process.env.RESEND_API_KEY || null
}

export async function processSequenceSends(db: Db): Promise<number> {
  const now = new Date().toISOString()

  const pending = await db.query<{
    id: string; sequence_id: string; team_id: string; contact_email: string;
    contact_name: string; current_step: number
  }>(
    `SELECT id, sequence_id, team_id, contact_email, contact_name, current_step
     FROM email_sequence_enrollments
     WHERE status = 'active' AND next_send_at <= $1`,
    [now],
  )

  // Cache resolved Resend clients per team to avoid redundant lookups
  const resendClients = new Map<string, Resend>()

  let sent = 0
  for (const enrollment of pending) {
    try {
      const seq = await getSequence(db, enrollment.sequence_id, enrollment.team_id)
      if (!seq || seq.status !== 'active') {
        // Sequence deleted or paused — unenroll
        await db.run(
          `UPDATE email_sequence_enrollments SET status = 'unenrolled', next_send_at = NULL WHERE id = $1`,
          [enrollment.id],
        )
        continue
      }

      const step = seq.steps[enrollment.current_step]
      if (!step) continue

      // Resolve Resend client for this team
      let resend = resendClients.get(enrollment.team_id)
      if (!resend) {
        const apiKey = await resolveResendKey(db, enrollment.team_id)
        if (!apiKey) {
          console.error(`[email-sequences] No Resend API key for team ${enrollment.team_id} — skipping enrollment ${enrollment.id}`)
          continue
        }
        resend = new Resend(apiKey)
        resendClients.set(enrollment.team_id, resend)
      }

      // Send the email using the team's Resend client
      const { error } = await resend.emails.send({
        from: seq.fromEmail || 'YokeBot <noreply@mail.yokebot.com>',
        to: [enrollment.contact_email],
        subject: step.subject.replace('{{name}}', enrollment.contact_name),
        html: step.body.replace('{{name}}', enrollment.contact_name),
      })
      if (error) throw new Error(`Resend error: ${error.message}`)

      const nextStep = enrollment.current_step + 1
      if (nextStep >= seq.steps.length) {
        // Sequence complete
        await db.run(
          `UPDATE email_sequence_enrollments SET status = 'completed', current_step = $1, next_send_at = NULL WHERE id = $2`,
          [nextStep, enrollment.id],
        )
      } else {
        // Advance to next step
        const nextDelay = seq.steps[nextStep].delayDays
        const nextSendAt = new Date(Date.now() + nextDelay * 24 * 60 * 60 * 1000).toISOString()
        await db.run(
          `UPDATE email_sequence_enrollments SET current_step = $1, next_send_at = $2 WHERE id = $3`,
          [nextStep, nextSendAt, enrollment.id],
        )
      }
      sent++
    } catch (err) {
      console.error(`[email-sequences] Failed to send for enrollment ${enrollment.id}:`, err instanceof Error ? err.message : err)
    }
  }

  return sent
}

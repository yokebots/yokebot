/**
 * email.ts — Resend email integration
 *
 * Provides a simple sendEmail function using Resend.
 * Default sender: YokeBot <noreply@mail.yokebot.com>
 */

import { Resend } from 'resend'

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? ''
const DEFAULT_FROM = 'YokeBot <noreply@mail.yokebot.com>'

let client: Resend | null = null

function getClient(): Resend {
  if (!client) {
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured')
    client = new Resend(RESEND_API_KEY)
  }
  return client
}

export interface SendEmailOptions {
  to: string | string[]
  subject: string
  html: string
  from?: string
  replyTo?: string
  unsubscribeUrl?: string
}

export async function sendEmail(opts: SendEmailOptions): Promise<{ id: string }> {
  const resend = getClient()

  const headers: Record<string, string> = {}
  if (opts.unsubscribeUrl) {
    headers['List-Unsubscribe'] = `<${opts.unsubscribeUrl}>`
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'
  }

  const { data, error } = await resend.emails.send({
    from: opts.from ?? DEFAULT_FROM,
    to: Array.isArray(opts.to) ? opts.to : [opts.to],
    subject: opts.subject,
    html: opts.html,
    replyTo: opts.replyTo,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  })

  if (error) throw new Error(`Resend error: ${error.message}`)
  return { id: data?.id ?? '' }
}

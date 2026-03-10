/**
 * email.ts — Resend email integration
 *
 * Provides a simple sendEmail function using Resend.
 * Default sender: YokeBot Team <team@mail.yokebot.com>
 */

import { Resend } from 'resend'

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? ''
const DEFAULT_FROM = 'YokeBot Team <team@mail.yokebot.com>'

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

// ---- Notification email helper ----

export function generateUnsubscribeUrl(userId: string, teamId: string): string {
  const token = Buffer.from(`${userId}:${teamId}`).toString('base64url')
  const baseUrl = process.env.ENGINE_BASE_URL ?? 'https://engine.yokebot.com'
  return `${baseUrl}/api/unsubscribe?token=${token}`
}

export interface NotificationEmailOpts {
  to: string
  title: string
  body: string
  link: string | null
  unsubscribeUrl: string
}

export async function sendNotificationEmail(opts: NotificationEmailOpts): Promise<{ id: string }> {
  const dashboardUrl = process.env.DASHBOARD_URL ?? 'https://yokebot.com'
  const viewUrl = opts.link
    ? (opts.link.startsWith('http') ? opts.link : `${dashboardUrl}${opts.link}`)
    : dashboardUrl

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#1a3a2a;padding:20px 24px;">
          <span style="color:#ffffff;font-size:18px;font-weight:700;">YokeBot</span>
        </td></tr>
        <tr><td style="padding:24px;">
          <h2 style="margin:0 0 12px;font-size:16px;color:#1a1a1a;">${escapeHtml(opts.title)}</h2>
          <p style="margin:0 0 20px;font-size:14px;color:#4a4a4a;line-height:1.5;">${escapeHtml(opts.body)}</p>
          <a href="${viewUrl}" style="display:inline-block;background:#1a3a2a;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">View in Dashboard</a>
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #e5e5e5;">
          <p style="margin:0;font-size:12px;color:#999999;">
            <a href="${opts.unsubscribeUrl}" style="color:#999999;">Unsubscribe</a> from YokeBot email notifications.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  return sendEmail({
    to: opts.to,
    subject: opts.title,
    html,
    unsubscribeUrl: opts.unsubscribeUrl,
  })
}

// ---- Welcome email ----

export async function sendWelcomeEmail(to: string, unsubscribeUrl: string): Promise<{ id: string }> {
  const dashboardUrl = process.env.DASHBOARD_URL ?? 'https://yokebot.com'

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#1a3a2a;padding:20px 24px;">
          <span style="color:#ffffff;font-size:18px;font-weight:700;">YokeBot</span>
        </td></tr>
        <tr><td style="padding:24px;">
          <h2 style="margin:0 0 16px;font-size:20px;color:#1a1a1a;">Welcome to YokeBot — Your AI Team is Ready!</h2>
          <p style="margin:0 0 16px;font-size:14px;color:#4a4a4a;line-height:1.6;">Your team has been created and your AI agents are standing by. Here's how to get started:</p>
          <ol style="margin:0 0 20px;padding-left:20px;font-size:14px;color:#4a4a4a;line-height:1.8;">
            <li><strong>Deploy agents</strong> — Browse 40+ pre-built agents and add them to your team</li>
            <li><strong>Set business context</strong> — Tell your agents about your company in Settings</li>
            <li><strong>Chat with your crew</strong> — Mention agents in chat to get work done</li>
          </ol>
          <a href="${dashboardUrl}" style="display:inline-block;background:#1a3a2a;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">Open Dashboard</a>
          <p style="margin:16px 0 0;font-size:13px;color:#888888;">
            Need help? Check out our <a href="https://docs.yokebot.com" style="color:#1a3a2a;">documentation</a>.
          </p>
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #e5e5e5;">
          <p style="margin:0;font-size:12px;color:#999999;">
            <a href="${unsubscribeUrl}" style="color:#999999;">Unsubscribe</a> from YokeBot email notifications.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  return sendEmail({
    to,
    subject: 'Welcome to YokeBot — Your AI Team is Ready!',
    html,
    unsubscribeUrl,
  })
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

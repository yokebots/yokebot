/**
 * onboarding-drip.ts — Drip email series for onboarding + paid upgrades
 *
 * Two series:
 *   - activation (5 emails over 7 days after sign-up)
 *   - paid (5 emails over 8 days after Stripe upgrade)
 *
 * The scheduler calls processOnboardingDrips() every 5 minutes.
 */

import type { Db } from './db/types.ts'
import { sendEmail, generateUnsubscribeUrl } from './email.ts'
import { randomUUID } from 'crypto'

// ---------------------------------------------------------------------------
// Drip definitions
// ---------------------------------------------------------------------------

interface DripStep {
  delayDays: number
  subject: string | ((tierName: string) => string)
  ctaLink: string
  ctaLabel: string
  bodyHtml: string | ((tierName: string) => string)
}

const ACTIVATION_STEPS: DripStep[] = [
  // Step 1: sent at +1 day (step=1 means "waiting to send step index 0")
  {
    delayDays: 1,
    subject: 'Set up your business context (your agents will thank you)',
    ctaLink: '/settings',
    ctaLabel: 'Open Settings',
    bodyHtml: `<p style="margin:0 0 16px;font-size:14px;color:#4a4a4a;line-height:1.6;">Your AI agents work best when they understand your business. Head to <strong>Settings &gt; Business Context</strong> and tell them about your company, industry, and goals.</p>
<p style="margin:0 0 16px;font-size:14px;color:#4a4a4a;line-height:1.6;">Think of it like onboarding a new employee &mdash; the more context you give, the better the output.</p>`,
  },
  // Step 2: sent at +3 days
  {
    delayDays: 3,
    subject: 'Assign your agents tasks, to keep them busy',
    ctaLink: '/tasks',
    ctaLabel: 'View Tasks',
    bodyHtml: `<p style="margin:0 0 16px;font-size:14px;color:#4a4a4a;line-height:1.6;">Your agents don't just chat &mdash; they can work on real tasks autonomously. Create a task, assign it to an agent, and watch them sprint through it on their next heartbeat.</p>
<p style="margin:0 0 16px;font-size:14px;color:#4a4a4a;line-height:1.6;">Try something small first: <em>"Draft a welcome email for new customers"</em> or <em>"Research competitors in our space."</em></p>`,
  },
  // Step 3: sent at +5 days
  {
    delayDays: 5,
    subject: 'Did you know your agents can work together?',
    ctaLink: '/workspace',
    ctaLabel: 'Open Workspace',
    bodyHtml: `<p style="margin:0 0 16px;font-size:14px;color:#4a4a4a;line-height:1.6;">YokeBot agents collaborate in shared channels, just like a real team. @mention an agent in chat and they'll jump in with context from the conversation.</p>
<p style="margin:0 0 16px;font-size:14px;color:#4a4a4a;line-height:1.6;">Try mentioning multiple agents in the same channel &mdash; they'll build on each other's work.</p>`,
  },
  // Step 4: sent at +7 days
  {
    delayDays: 7,
    subject: "Your free credits won't last forever",
    ctaLink: '/billing',
    ctaLabel: 'View Billing',
    bodyHtml: `<p style="margin:0 0 16px;font-size:14px;color:#4a4a4a;line-height:1.6;">You started with 1,250 free credits. Once they run out, your agents pause until you upgrade or buy a credit pack.</p>
<p style="margin:0 0 16px;font-size:14px;color:#4a4a4a;line-height:1.6;">Plans start at $29/month and include up to 50,000 credits, 3 agents running 24/7, and 30-minute heartbeats. Check out the options on the Billing page.</p>`,
  },
]

const PAID_STEPS: DripStep[] = [
  // Step 0: sent immediately on flip
  {
    delayDays: 0,
    subject: (tier) => `Welcome to ${tier}! Here's what you just unlocked`,
    ctaLink: '/billing',
    ctaLabel: 'View Your Plan',
    bodyHtml: (tier) => `<p style="margin:0 0 16px;font-size:14px;color:#4a4a4a;line-height:1.6;">You're now on the <strong>${tier}</strong> plan. Your agents just got a serious upgrade &mdash; faster heartbeats, more concurrent agents, and a monthly credit allocation.</p>
<p style="margin:0 0 16px;font-size:14px;color:#4a4a4a;line-height:1.6;">All your agents are now running 24/7. Head to the dashboard to see them in action.</p>`,
  },
  // Step 1: sent at +2 days
  {
    delayDays: 2,
    subject: (tier) => `Getting the most out of your ${tier} plan`,
    ctaLink: '/docs/agents/heartbeat',
    ctaLabel: 'Read the Guide',
    bodyHtml: (tier) => `<p style="margin:0 0 16px;font-size:14px;color:#4a4a4a;line-height:1.6;">Now that you're on <strong>${tier}</strong>, your agents can heartbeat more frequently. A faster heartbeat means quicker responses, faster task completion, and more proactive updates.</p>
<p style="margin:0 0 16px;font-size:14px;color:#4a4a4a;line-height:1.6;">Tune each agent's heartbeat interval in their settings to match the urgency of their work.</p>`,
  },
  // Step 2: sent at +4 days
  {
    delayDays: 4,
    subject: 'Upload documents to supercharge your agents',
    ctaLink: '/docs/knowledge-base',
    ctaLabel: 'Learn About Knowledge Base',
    bodyHtml: `<p style="margin:0 0 16px;font-size:14px;color:#4a4a4a;line-height:1.6;">Your agents can reference your company's documents, SOPs, and data. Upload files to the Knowledge Base and your agents will use them as context when working on tasks.</p>
<p style="margin:0 0 16px;font-size:14px;color:#4a4a4a;line-height:1.6;">PDFs, text files, spreadsheets &mdash; anything your team references regularly.</p>`,
  },
  // Step 3: sent at +6 days
  {
    delayDays: 6,
    subject: 'Keep humans in the loop with approval workflows',
    ctaLink: '/docs/tasks/workflows',
    ctaLabel: 'Explore Workflows',
    bodyHtml: `<p style="margin:0 0 16px;font-size:14px;color:#4a4a4a;line-height:1.6;">Not every decision should be automated. Workflows let you add approval gates so agents pause and wait for human sign-off before taking high-risk actions.</p>
<p style="margin:0 0 16px;font-size:14px;color:#4a4a4a;line-height:1.6;">Set up a workflow to review agent outputs before they go live &mdash; it's the best of both worlds.</p>`,
  },
  // Step 4: sent at +8 days
  {
    delayDays: 8,
    subject: 'Track what your agents are doing in the activity feed',
    ctaLink: '/activity',
    ctaLabel: 'View Activity',
    bodyHtml: `<p style="margin:0 0 16px;font-size:14px;color:#4a4a4a;line-height:1.6;">Every heartbeat, task sprint, and tool call is logged in your Activity Feed. Use it to audit agent behavior, spot patterns, and understand how your team is performing.</p>
<p style="margin:0 0 16px;font-size:14px;color:#4a4a4a;line-height:1.6;">Bookmark the Activity page &mdash; it's the quickest way to see what happened while you were away.</p>`,
  },
]

// ---------------------------------------------------------------------------
// HTML template
// ---------------------------------------------------------------------------

function buildDripHtml(
  subject: string,
  bodyHtml: string,
  ctaLink: string,
  ctaLabel: string,
  unsubscribeUrl: string,
): string {
  const dashboardUrl = process.env.DASHBOARD_URL ?? 'https://yokebot.com'
  const fullCtaUrl = ctaLink.startsWith('http') ? ctaLink : `${dashboardUrl}${ctaLink}`

  return `
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
          <h2 style="margin:0 0 16px;font-size:18px;color:#1a1a1a;">${escapeHtml(subject)}</h2>
          ${bodyHtml}
          <a href="${fullCtaUrl}" style="display:inline-block;background:#1a3a2a;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">${escapeHtml(ctaLabel)}</a>
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #e5e5e5;">
          <p style="margin:0;font-size:12px;color:#999999;">
            <a href="${unsubscribeUrl}" style="color:#999999;">Unsubscribe</a> from YokeBot emails.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enroll a user in the activation drip series.
 * Called after the welcome email is sent on team creation.
 * Uses INSERT ON CONFLICT DO NOTHING so it's safe to call multiple times.
 */
export async function enrollUser(db: Db, userId: string, teamId: string, email: string): Promise<void> {
  const id = randomUUID()
  // Step=1 means the next email to send is activation step index 0 (day 1)
  // next_send_at = NOW() + 1 day
  if (db.driver === 'postgres') {
    await db.run(
      `INSERT INTO onboarding_drips (id, user_id, team_id, email, series, step, next_send_at, status)
       VALUES ($1, $2, $3, $4, 'activation', 1, NOW() + INTERVAL '1 day', 'active')
       ON CONFLICT (user_id, team_id) DO NOTHING`,
      [id, userId, teamId, email],
    )
  } else {
    await db.run(
      `INSERT OR IGNORE INTO onboarding_drips (id, user_id, team_id, email, series, step, next_send_at, status)
       VALUES ($1, $2, $3, $4, 'activation', 1, datetime('now', '+1 day'), 'active')`,
      [id, userId, teamId, email],
    )
  }
}

/**
 * Flip all drip enrollments for a team to the paid series.
 * Called after upsertSubscription() on Stripe upgrade.
 */
export async function flipToPaidSeries(db: Db, teamId: string, tierName: string): Promise<void> {
  if (db.driver === 'postgres') {
    await db.run(
      `UPDATE onboarding_drips
       SET series = 'paid', step = 0, tier_name = $1, next_send_at = NOW(), status = 'active'
       WHERE team_id = $2`,
      [tierName, teamId],
    )
  } else {
    await db.run(
      `UPDATE onboarding_drips
       SET series = 'paid', step = 0, tier_name = $1, next_send_at = datetime('now'), status = 'active'
       WHERE team_id = $2`,
      [tierName, teamId],
    )
  }
}

/**
 * Process all due drip emails. Called by the scheduler every 5 minutes.
 * Returns the number of emails sent.
 */
export async function processOnboardingDrips(db: Db): Promise<number> {
  // Query rows that are due
  const nowCondition = db.driver === 'postgres' ? 'NOW()' : "datetime('now')"
  const rows = await db.query<{
    id: string
    user_id: string
    team_id: string
    email: string
    series: string
    tier_name: string | null
    step: number
  }>(
    `SELECT id, user_id, team_id, email, series, tier_name, step
     FROM onboarding_drips
     WHERE status = 'active' AND next_send_at <= ${nowCondition}`,
  )

  let sent = 0

  for (const row of rows) {
    try {
      // Check emailEnabled preference — respect unsubscribes
      const pref = await db.queryOne<{ email_enabled: number }>(
        `SELECT email_enabled FROM notification_preferences WHERE user_id = $1 AND team_id = $2`,
        [row.user_id, row.team_id],
      )
      if (pref && pref.email_enabled === 0) {
        // User unsubscribed — mark drip as paused
        await db.run(`UPDATE onboarding_drips SET status = 'paused' WHERE id = $1`, [row.id])
        continue
      }

      const steps = row.series === 'paid' ? PAID_STEPS : ACTIVATION_STEPS
      const stepIndex = row.step - (row.series === 'paid' ? 0 : 1) // activation starts at step=1 → index 0
      if (stepIndex < 0 || stepIndex >= steps.length) {
        // Series complete
        await db.run(`UPDATE onboarding_drips SET status = 'completed' WHERE id = $1`, [row.id])
        continue
      }

      const step = steps[stepIndex]
      const tierName = row.tier_name ?? 'your plan'
      const subject = typeof step.subject === 'function' ? step.subject(tierName) : step.subject
      const bodyHtml = typeof step.bodyHtml === 'function' ? step.bodyHtml(tierName) : step.bodyHtml

      const unsubscribeUrl = generateUnsubscribeUrl(row.user_id, row.team_id)
      const html = buildDripHtml(subject, bodyHtml, step.ctaLink, step.ctaLabel, unsubscribeUrl)

      await sendEmail({
        to: row.email,
        subject,
        html,
        unsubscribeUrl,
      })

      sent++

      // Advance to next step
      const nextStep = row.step + 1
      const nextStepIndex = nextStep - (row.series === 'paid' ? 0 : 1)
      if (nextStepIndex >= steps.length) {
        // Series complete after this send
        await db.run(`UPDATE onboarding_drips SET step = $1, status = 'completed' WHERE id = $2`, [nextStep, row.id])
      } else {
        // Schedule next email
        const nextDelay = steps[nextStepIndex].delayDays
        const currentDelay = step.delayDays
        const daysDiff = nextDelay - currentDelay
        if (db.driver === 'postgres') {
          await db.run(
            `UPDATE onboarding_drips SET step = $1, next_send_at = NOW() + INTERVAL '${daysDiff} days' WHERE id = $2`,
            [nextStep, row.id],
          )
        } else {
          await db.run(
            `UPDATE onboarding_drips SET step = $1, next_send_at = datetime('now', '+${daysDiff} days') WHERE id = $2`,
            [nextStep, row.id],
          )
        }
      }

      console.log(`[drip] Sent ${row.series} step ${row.step} to ${row.email}`)
    } catch (err) {
      console.error(`[drip] Failed to send ${row.series} step ${row.step} to ${row.email}:`, (err as Error).message)
    }
  }

  return sent
}

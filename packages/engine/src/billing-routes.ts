/**
 * billing-routes.ts — Billing API endpoints
 *
 * Subscription management, credit purchase, and Stripe webhook handler.
 * Only registered in hosted mode (YOKEBOT_HOSTED_MODE=true).
 */

import type { Express, Request, Response } from 'express'
import type { Db } from './db/types.ts'
import {
  getSubscription, upsertSubscription, getCreditBalance,
  addCredits, listCreditTransactions, listModelCreditCosts,
  resetMonthlyCredits,
  type SubscriptionTier,
} from './billing.ts'

const HOSTED_MODE = process.env.YOKEBOT_HOSTED_MODE === 'true'

// Tier config — maps tier name to subscription limits
const TIER_CONFIG: Record<string, {
  maxAgents: number; minHeartbeat: number
  hoursStart: number; hoursEnd: number
  monthlyCredits: number; includedCredits: number
}> = {
  team:       { maxAgents: 2,  minHeartbeat: 1800, hoursStart: 6,  hoursEnd: 22, monthlyCredits: 50000,  includedCredits: 50000 },
  business:   { maxAgents: 5,  minHeartbeat: 900,  hoursStart: 0,  hoursEnd: 24, monthlyCredits: 150000, includedCredits: 150000 },
  enterprise: { maxAgents: 15, minHeartbeat: 300,  hoursStart: 0,  hoursEnd: 24, monthlyCredits: 500000, includedCredits: 500000 },
}

// Map Stripe Price IDs → tier names
function priceTierMap(): Record<string, string> {
  return {
    [process.env.STRIPE_PRICE_TEAM ?? '']: 'team',
    [process.env.STRIPE_PRICE_BUSINESS ?? '']: 'business',
    [process.env.STRIPE_PRICE_ENTERPRISE ?? '']: 'enterprise',
  }
}

// Map Stripe Price IDs → credit pack amounts
function priceCreditMap(): Record<string, number> {
  return {
    [process.env.STRIPE_PRICE_CREDITS_20K ?? '']: 20000,
    [process.env.STRIPE_PRICE_CREDITS_55K ?? '']: 55000,
    [process.env.STRIPE_PRICE_CREDITS_120K ?? '']: 120000,
    [process.env.STRIPE_PRICE_CREDITS_260K ?? '']: 260000,
  }
}

export function registerBillingRoutes(app: Express, db: Db): void {
  if (!HOSTED_MODE) return

  // ---- GET /api/billing/status ----
  app.get('/api/billing/status', async (req: Request, res: Response) => {
    const teamId = req.user?.activeTeamId
    if (!teamId) { res.status(400).json({ error: 'Team context required' }); return }

    const sub = await getSubscription(db, teamId)
    const credits = await getCreditBalance(db, teamId)

    res.json({
      subscription: sub ? {
        tier: sub.tier,
        status: sub.status,
        maxAgents: sub.maxAgents,
        minHeartbeatSeconds: sub.minHeartbeatSeconds,
        activeHoursStart: sub.activeHoursStart,
        activeHoursEnd: sub.activeHoursEnd,
        monthlyCredits: sub.monthlyCredits,
        includedCredits: sub.includedCredits,
        creditsResetAt: sub.creditsResetAt,
        currentPeriodEnd: sub.currentPeriodEnd,
      } : null,
      credits,
    })
  })

  // ---- GET /api/billing/models ----
  app.get('/api/billing/models', async (_req: Request, res: Response) => {
    const models = await listModelCreditCosts(db)
    res.json(models)
  })

  // ---- GET /api/billing/transactions ----
  app.get('/api/billing/transactions', async (req: Request, res: Response) => {
    const teamId = req.user?.activeTeamId
    if (!teamId) { res.status(400).json({ error: 'Team context required' }); return }
    const limit = Math.min(Number(req.query.limit ?? 50), 200)
    res.json(await listCreditTransactions(db, teamId, limit))
  })

  // ---- POST /api/billing/checkout/subscription ----
  app.post('/api/billing/checkout/subscription', async (req: Request, res: Response) => {
    const teamId = req.user?.activeTeamId
    if (!teamId) { res.status(400).json({ error: 'Team context required' }); return }

    const { priceId } = req.body as { priceId: string }
    if (!priceId) { res.status(400).json({ error: 'priceId is required' }); return }

    try {
      const eePath = '../../../ee/stripe-billing.js'
      const ee = await import(eePath) as {
        createSubscriptionCheckout: (teamId: string, userId: string, email: string, priceId: string, successUrl: string, cancelUrl: string) => Promise<{ url: string; customerId: string }>
      }
      const dashboardUrl = process.env.DASHBOARD_URL ?? 'https://yokebot.com'
      const result = await ee.createSubscriptionCheckout(
        teamId, req.user!.id, req.user!.email, priceId,
        `${dashboardUrl}/settings/billing?success=true`,
        `${dashboardUrl}/settings/billing?canceled=true`,
      )
      await upsertSubscription(db, teamId, { stripeCustomerId: result.customerId })
      res.json({ url: result.url })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // ---- POST /api/billing/checkout/credits ----
  app.post('/api/billing/checkout/credits', async (req: Request, res: Response) => {
    const teamId = req.user?.activeTeamId
    if (!teamId) { res.status(400).json({ error: 'Team context required' }); return }

    const { priceId } = req.body as { priceId: string }
    if (!priceId) { res.status(400).json({ error: 'priceId is required' }); return }

    try {
      const eePath = '../../../ee/stripe-billing.js'
      const ee = await import(eePath) as {
        createCreditPackCheckout: (teamId: string, userId: string, email: string, priceId: string, successUrl: string, cancelUrl: string) => Promise<{ url: string; customerId: string }>
      }
      const dashboardUrl = process.env.DASHBOARD_URL ?? 'https://yokebot.com'
      const result = await ee.createCreditPackCheckout(
        teamId, req.user!.id, req.user!.email, priceId,
        `${dashboardUrl}/settings/billing?credits=purchased`,
        `${dashboardUrl}/settings/billing?canceled=true`,
      )
      res.json({ url: result.url })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // ---- POST /api/billing/portal ----
  app.post('/api/billing/portal', async (req: Request, res: Response) => {
    const teamId = req.user?.activeTeamId
    if (!teamId) { res.status(400).json({ error: 'Team context required' }); return }

    const sub = await getSubscription(db, teamId)
    if (!sub?.stripeCustomerId) { res.status(400).json({ error: 'No billing account found' }); return }

    try {
      const eePath = '../../../ee/stripe-billing.js'
      const ee = await import(eePath) as {
        createPortalSession: (customerId: string, returnUrl: string) => Promise<{ url: string }>
      }
      const dashboardUrl = process.env.DASHBOARD_URL ?? 'https://yokebot.com'
      const result = await ee.createPortalSession(sub.stripeCustomerId, `${dashboardUrl}/settings/billing`)
      res.json({ url: result.url })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // ---- POST /api/billing/webhook ----
  app.post('/api/billing/webhook', async (req: Request, res: Response) => {
    const signature = req.headers['stripe-signature'] as string
    if (!signature) { res.status(400).json({ error: 'Missing stripe-signature header' }); return }

    try {
      const eePath = '../../../ee/stripe-billing.js'
      const ee = await import(eePath) as {
        constructWebhookEvent: (payload: Buffer, signature: string) => { type: string; data: { object: Record<string, unknown> } }
        getStripeSubscription: (id: string) => Promise<Record<string, unknown>>
        listCheckoutLineItems: (id: string) => Promise<{ data: Array<{ price?: { id?: string } }> }>
      }

      const event = ee.constructWebhookEvent(req.body as Buffer, signature)

      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          const subscription = event.data.object as Record<string, unknown>
          const teamId = (subscription.metadata as Record<string, string>)?.yokebot_team_id
          if (!teamId) break

          const items = subscription.items as { data: Array<{ price?: { id?: string } }> }
          const priceId = items?.data?.[0]?.price?.id
          const tierName = priceTierMap()[priceId ?? '']
          const tierConfig = TIER_CONFIG[tierName ?? '']

          if (tierConfig) {
            const status = subscription.status as string
            const periodEnd = new Date((subscription.current_period_end as number) * 1000).toISOString()
            await upsertSubscription(db, teamId, {
              stripeCustomerId: subscription.customer as string,
              stripeSubscriptionId: subscription.id as string,
              tier: tierName as SubscriptionTier,
              status: status === 'active' ? 'active' : status === 'past_due' ? 'past_due' : 'inactive',
              maxAgents: tierConfig.maxAgents,
              minHeartbeatSeconds: tierConfig.minHeartbeat,
              activeHoursStart: tierConfig.hoursStart,
              activeHoursEnd: tierConfig.hoursEnd,
              monthlyCredits: tierConfig.monthlyCredits,
              includedCredits: tierConfig.includedCredits,
              creditsResetAt: periodEnd,
              currentPeriodEnd: periodEnd,
            })
          }
          break
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Record<string, unknown>
          const teamId = (subscription.metadata as Record<string, string>)?.yokebot_team_id
          if (!teamId) break
          await upsertSubscription(db, teamId, {
            status: 'canceled', tier: 'none', maxAgents: 0,
            minHeartbeatSeconds: 3600, activeHoursStart: 9, activeHoursEnd: 17,
            monthlyCredits: 0, includedCredits: 0,
          })
          break
        }

        case 'invoice.paid': {
          const invoice = event.data.object as Record<string, unknown>
          const billingReason = invoice.billing_reason as string
          if (billingReason === 'subscription_create' || billingReason === 'subscription_cycle') {
            const subId = invoice.subscription as string
            if (!subId) break
            const stripeSub = await ee.getStripeSubscription(subId) as Record<string, unknown>
            const teamId = (stripeSub.metadata as Record<string, string>)?.yokebot_team_id
            if (!teamId) break
            const items = stripeSub.items as { data: Array<{ price?: { id?: string } }> }
            const priceId = items?.data?.[0]?.price?.id
            const tierName = priceTierMap()[priceId ?? '']
            const tierConfig = TIER_CONFIG[tierName ?? '']
            if (tierConfig && tierConfig.includedCredits > 0) {
              // Monthly reset: included credits are use-it-or-lose-it
              await resetMonthlyCredits(db, teamId, tierConfig.includedCredits)
            }
          }
          break
        }

        case 'checkout.session.completed': {
          const session = event.data.object as Record<string, unknown>
          const metadata = session.metadata as Record<string, string>
          if (session.mode === 'payment' && metadata?.type === 'credit_pack') {
            const teamId = metadata?.yokebot_team_id
            if (!teamId) break
            const lineItems = await ee.listCheckoutLineItems(session.id as string)
            const priceId = lineItems.data[0]?.price?.id
            const creditAmount = priceCreditMap()[priceId ?? '']
            if (creditAmount) {
              await addCredits(db, teamId, creditAmount, 'credit_pack',
                `Credit pack: +${creditAmount.toLocaleString()} credits`,
                session.payment_intent as string)
            }
          }
          break
        }
      }

      res.json({ received: true })
    } catch (err) {
      console.error('[billing] Webhook error:', err)
      res.status(400).json({ error: (err as Error).message })
    }
  })
}

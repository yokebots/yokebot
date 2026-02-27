/**
 * billing-middleware.ts — Subscription gate for hosted mode
 *
 * Only active when YOKEBOT_HOSTED_MODE=true. Requires an active
 * subscription for all non-exempt API routes. Self-hosted users
 * are completely unaffected.
 */

import type { Request, Response, NextFunction } from 'express'
import type { Db } from './db/types.ts'
import { getSubscription, isSubscriptionActive, type TeamSubscription } from './billing.ts'

const HOSTED_MODE = process.env.YOKEBOT_HOSTED_MODE === 'true'

// Admin emails that bypass billing gates (comma-separated env var)
const ADMIN_EMAILS = (process.env.YOKEBOT_ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)

// Paths exempt from billing checks
const BILLING_EXEMPT_PATHS = [
  '/health',
  '/api/ollama',
  '/api/teams',
  '/api/notifications',
  '/api/billing',
  '/api/models',
]

// Extend Express Request to include subscription
declare global {
  namespace Express {
    interface Request {
      subscription?: TeamSubscription
    }
  }
}

export function createBillingMiddleware(db: Db) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Self-hosted: skip all billing
    if (!HOSTED_MODE) { next(); return }

    // Exempt paths
    if (BILLING_EXEMPT_PATHS.some((p) => req.path === p || req.path.startsWith(p + '/'))) {
      next()
      return
    }

    // Admin bypass — admin users skip all billing checks
    const userEmail = req.user?.email?.toLowerCase()
    if (userEmail && ADMIN_EMAILS.includes(userEmail)) {
      next()
      return
    }

    const teamId = req.user?.activeTeamId
    if (!teamId) { next(); return }

    const sub = await getSubscription(db, teamId)

    if (!isSubscriptionActive(sub)) {
      res.status(402).json({
        error: 'Active subscription required',
        code: 'SUBSCRIPTION_REQUIRED',
        upgradeUrl: '/settings/billing',
      })
      return
    }

    // Attach subscription to request for downstream route handlers
    req.subscription = sub!

    next()
  }
}

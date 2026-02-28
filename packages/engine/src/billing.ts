/**
 * billing.ts — Subscription and credit management
 *
 * Pure data access layer for billing tables. No Stripe SDK here —
 * Stripe integration lives in /ee/stripe-billing.js.
 */

import type { Db } from './db/types.ts'
import { randomUUID } from 'crypto'

// ---- Types ----

export type SubscriptionTier = 'none' | 'team' | 'business' | 'enterprise'
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'inactive'
export type CreditTransactionType = 'subscription_renewal' | 'credit_pack' | 'starter_credits' | 'media_debit' | 'heartbeat_debit' | 'skill_debit' | 'credit_reset' | 'adjustment'

export interface TeamSubscription {
  teamId: string
  stripeCustomerId: string
  stripeSubscriptionId: string | null
  tier: SubscriptionTier
  status: SubscriptionStatus
  maxAgents: number
  minHeartbeatSeconds: number
  activeHoursStart: number
  activeHoursEnd: number
  monthlyCredits: number
  includedCredits: number
  creditsResetAt: string | null
  currentPeriodEnd: string | null
  createdAt: string
  updatedAt: string
}

export interface ModelCreditCost {
  modelId: string
  creditsPerUse: number
  modelType: string
  starIntelligence: number
  starPower: number
  starSpeed: number
  description: string
  tagline: string
  pros: string[]
  cons: string[]
  releaseDate: string | null
  popularity: number
}

export interface CreditTransaction {
  id: string
  teamId: string
  amount: number
  balanceAfter: number
  type: CreditTransactionType
  description: string
  stripePaymentIntentId: string | null
  createdAt: string
}

// ---- Subscriptions ----

export async function getSubscription(db: Db, teamId: string): Promise<TeamSubscription | null> {
  const row = await db.queryOne<Record<string, unknown>>(
    'SELECT * FROM team_subscriptions WHERE team_id = $1',
    [teamId],
  )
  if (!row) return null
  return rowToSubscription(row)
}

export async function upsertSubscription(db: Db, teamId: string, data: Partial<TeamSubscription>): Promise<void> {
  const existing = await getSubscription(db, teamId)

  if (existing) {
    const sets: string[] = []
    const params: unknown[] = []
    let idx = 1

    if (data.stripeCustomerId !== undefined) { sets.push(`stripe_customer_id = $${idx++}`); params.push(data.stripeCustomerId) }
    if (data.stripeSubscriptionId !== undefined) { sets.push(`stripe_subscription_id = $${idx++}`); params.push(data.stripeSubscriptionId) }
    if (data.tier !== undefined) { sets.push(`tier = $${idx++}`); params.push(data.tier) }
    if (data.status !== undefined) { sets.push(`status = $${idx++}`); params.push(data.status) }
    if (data.maxAgents !== undefined) { sets.push(`max_agents = $${idx++}`); params.push(data.maxAgents) }
    if (data.minHeartbeatSeconds !== undefined) { sets.push(`min_heartbeat_seconds = $${idx++}`); params.push(data.minHeartbeatSeconds) }
    if (data.activeHoursStart !== undefined) { sets.push(`active_hours_start = $${idx++}`); params.push(data.activeHoursStart) }
    if (data.activeHoursEnd !== undefined) { sets.push(`active_hours_end = $${idx++}`); params.push(data.activeHoursEnd) }
    if (data.monthlyCredits !== undefined) { sets.push(`monthly_credits = $${idx++}`); params.push(data.monthlyCredits) }
    if (data.includedCredits !== undefined) { sets.push(`included_credits = $${idx++}`); params.push(data.includedCredits) }
    if (data.creditsResetAt !== undefined) { sets.push(`credits_reset_at = $${idx++}`); params.push(data.creditsResetAt) }
    if (data.currentPeriodEnd !== undefined) { sets.push(`current_period_end = $${idx++}`); params.push(data.currentPeriodEnd) }

    sets.push(`updated_at = ${db.now()}`)
    params.push(teamId)

    await db.run(`UPDATE team_subscriptions SET ${sets.join(', ')} WHERE team_id = $${idx}`, params)
  } else {
    await db.run(
      `INSERT INTO team_subscriptions (team_id, stripe_customer_id, stripe_subscription_id, tier, status, max_agents, min_heartbeat_seconds, active_hours_start, active_hours_end, monthly_credits, included_credits, credits_reset_at, current_period_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        teamId,
        data.stripeCustomerId ?? '',
        data.stripeSubscriptionId ?? null,
        data.tier ?? 'none',
        data.status ?? 'inactive',
        data.maxAgents ?? 0,
        data.minHeartbeatSeconds ?? 3600,
        data.activeHoursStart ?? 9,
        data.activeHoursEnd ?? 17,
        data.monthlyCredits ?? 0,
        data.includedCredits ?? 0,
        data.creditsResetAt ?? null,
        data.currentPeriodEnd ?? null,
      ],
    )
  }
}

export function isSubscriptionActive(sub: TeamSubscription | null): boolean {
  return sub?.status === 'active' || sub?.status === 'past_due'
}

/** Team can use the platform if they have an active subscription OR have credits. */
export function isTeamActive(sub: TeamSubscription | null, creditBalance: number): boolean {
  return isSubscriptionActive(sub) || creditBalance > 0
}

// ---- Credits ----

export async function getCreditBalance(db: Db, teamId: string): Promise<number> {
  const row = await db.queryOne<{ balance: number }>('SELECT balance FROM team_credits WHERE team_id = $1', [teamId])
  return row?.balance ?? 0
}

export async function addCredits(
  db: Db, teamId: string, amount: number, type: CreditTransactionType,
  description: string, stripePaymentIntentId?: string,
): Promise<number> {
  // Ensure credits row exists
  const existing = await db.queryOne<{ balance: number }>('SELECT balance FROM team_credits WHERE team_id = $1', [teamId])
  if (!existing) {
    await db.run('INSERT INTO team_credits (team_id, balance, purchased_balance) VALUES ($1, $2, $3)', [teamId, 0, 0])
  }

  // Atomic add
  await db.run(
    `UPDATE team_credits SET balance = balance + $1, updated_at = ${db.now()} WHERE team_id = $2`,
    [amount, teamId],
  )

  // Credit packs also increase purchased_balance (these carry over month-to-month)
  if (type === 'credit_pack') {
    await db.run(
      `UPDATE team_credits SET purchased_balance = purchased_balance + $1 WHERE team_id = $2`,
      [amount, teamId],
    )
  }

  const newBalance = await getCreditBalance(db, teamId)

  // Record transaction
  await db.run(
    'INSERT INTO credit_transactions (id, team_id, amount, balance_after, type, description, stripe_payment_intent_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [randomUUID(), teamId, amount, newBalance, type, description, stripePaymentIntentId ?? null],
  )

  return newBalance
}

export async function deductCredits(
  db: Db, teamId: string, amount: number,
  type: CreditTransactionType, description: string,
): Promise<{ success: boolean; balance: number }> {
  // Atomic deduct — only succeeds if balance is sufficient
  await db.run(
    `UPDATE team_credits SET balance = balance - $1, updated_at = ${db.now()} WHERE team_id = $2 AND balance >= $1`,
    [amount, teamId],
  )

  const row = await db.queryOne<{ balance: number; purchased_balance: number }>(
    'SELECT balance, purchased_balance FROM team_credits WHERE team_id = $1', [teamId],
  )
  if (!row || row.balance < 0) {
    return { success: false, balance: row?.balance ?? 0 }
  }

  // Base credits are consumed first, purchased credits consumed last.
  // If balance dips below purchased_balance, it means base is exhausted
  // and we're now spending purchased credits.
  if (row.balance < row.purchased_balance) {
    await db.run(
      `UPDATE team_credits SET purchased_balance = $1 WHERE team_id = $2`,
      [Math.max(0, row.balance), teamId],
    )
  }

  // Record the debit transaction
  await db.run(
    'INSERT INTO credit_transactions (id, team_id, amount, balance_after, type, description) VALUES ($1, $2, $3, $4, $5, $6)',
    [randomUUID(), teamId, -amount, row.balance, type, description],
  )

  return { success: true, balance: row.balance }
}

export async function listCreditTransactions(db: Db, teamId: string, limit = 50): Promise<CreditTransaction[]> {
  const rows = await db.query<Record<string, unknown>>(
    'SELECT * FROM credit_transactions WHERE team_id = $1 ORDER BY created_at DESC LIMIT $2',
    [teamId, limit],
  )
  return rows.map(rowToTransaction)
}

// ---- Row mappers ----

function rowToSubscription(row: Record<string, unknown>): TeamSubscription {
  return {
    teamId: row.team_id as string,
    stripeCustomerId: row.stripe_customer_id as string,
    stripeSubscriptionId: row.stripe_subscription_id as string | null,
    tier: row.tier as SubscriptionTier,
    status: row.status as SubscriptionStatus,
    maxAgents: row.max_agents as number,
    minHeartbeatSeconds: row.min_heartbeat_seconds as number,
    activeHoursStart: row.active_hours_start as number,
    activeHoursEnd: row.active_hours_end as number,
    monthlyCredits: row.monthly_credits as number,
    includedCredits: (row.included_credits as number) ?? 0,
    creditsResetAt: row.credits_reset_at as string | null,
    currentPeriodEnd: row.current_period_end as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

function rowToTransaction(row: Record<string, unknown>): CreditTransaction {
  return {
    id: row.id as string,
    teamId: row.team_id as string,
    amount: row.amount as number,
    balanceAfter: row.balance_after as number,
    type: row.type as CreditTransactionType,
    description: row.description as string,
    stripePaymentIntentId: row.stripe_payment_intent_id as string | null,
    createdAt: row.created_at as string,
  }
}

// ---- Model & Skill Credit Costs ----

export async function getModelCreditCost(db: Db, modelId: string): Promise<number> {
  const row = await db.queryOne<{ credits_per_use: number }>(
    'SELECT credits_per_use FROM model_credit_costs WHERE model_id = $1',
    [modelId],
  )
  return row?.credits_per_use ?? 0
}

export async function getSkillCreditCost(db: Db, skillName: string): Promise<number> {
  const row = await db.queryOne<{ credits_per_use: number }>(
    'SELECT credits_per_use FROM skill_credit_costs WHERE skill_name = $1',
    [skillName],
  )
  return row?.credits_per_use ?? 0
}

export async function listModelCreditCosts(db: Db): Promise<ModelCreditCost[]> {
  const rows = await db.query<Record<string, unknown>>(
    'SELECT * FROM model_credit_costs ORDER BY credits_per_use ASC, popularity DESC',
  )
  return rows.map(rowToModelCreditCost)
}

export async function resetMonthlyCredits(db: Db, teamId: string, amount: number): Promise<void> {
  // Monthly reset: base included credits are use-it-or-lose-it,
  // but purchased credit pack credits carry over indefinitely.

  // Ensure credits row exists
  const existing = await db.queryOne<{ balance: number; purchased_balance: number }>(
    'SELECT balance, purchased_balance FROM team_credits WHERE team_id = $1', [teamId],
  )
  if (!existing) {
    await db.run('INSERT INTO team_credits (team_id, balance, purchased_balance) VALUES ($1, $2, $3)', [teamId, 0, 0])
  }

  const purchasedBalance = existing?.purchased_balance ?? 0
  const currentBalance = existing?.balance ?? 0

  // New balance = fresh included credits + any remaining purchased credits
  const newBalance = amount + purchasedBalance

  await db.run(
    `UPDATE team_credits SET balance = $1, updated_at = ${db.now()} WHERE team_id = $2`,
    [newBalance, teamId],
  )

  // Record the reset transaction
  const diff = newBalance - currentBalance
  await db.run(
    'INSERT INTO credit_transactions (id, team_id, amount, balance_after, type, description) VALUES ($1, $2, $3, $4, $5, $6)',
    [randomUUID(), teamId, diff, newBalance, 'credit_reset',
      `Monthly reset: ${amount.toLocaleString()} included + ${purchasedBalance.toLocaleString()} purchased carried over`],
  )
}

function rowToModelCreditCost(row: Record<string, unknown>): ModelCreditCost {
  return {
    modelId: row.model_id as string,
    creditsPerUse: row.credits_per_use as number,
    modelType: row.model_type as string,
    starIntelligence: row.star_intelligence as number,
    starPower: row.star_power as number,
    starSpeed: row.star_speed as number,
    description: row.description as string,
    tagline: row.tagline as string,
    pros: JSON.parse((row.pros as string) || '[]'),
    cons: JSON.parse((row.cons as string) || '[]'),
    releaseDate: row.release_date as string | null,
    popularity: row.popularity as number,
  }
}

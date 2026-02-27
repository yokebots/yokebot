import { useState, useEffect } from 'react'
import * as engine from '@/lib/engine'
import type { BillingStatus, CreditTransaction } from '@/lib/engine'
import { PLANS, CREDIT_PACKS } from '@/lib/pricing-data'

const TIER_LABELS: Record<string, string> = {
  team: 'Starter Crew',
  business: 'Growth Crew',
  enterprise: 'Power Crew',
  none: 'No Plan',
}

const TIER_COLORS: Record<string, string> = {
  team: 'bg-blue-50 text-blue-700',
  business: 'bg-purple-50 text-purple-700',
  enterprise: 'bg-amber-50 text-amber-700',
  none: 'bg-gray-100 text-gray-600',
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: 'bg-green-50 text-green-700' },
  past_due: { label: 'Past Due', color: 'bg-red-50 text-red-700' },
  canceled: { label: 'Canceled', color: 'bg-gray-100 text-gray-600' },
  inactive: { label: 'Inactive', color: 'bg-gray-100 text-gray-600' },
}

const TXN_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  subscription_renewal: { label: 'Renewal', color: 'bg-green-50 text-green-700' },
  credit_pack: { label: 'Pack', color: 'bg-blue-50 text-blue-700' },
  heartbeat_debit: { label: 'LLM', color: 'bg-orange-50 text-orange-700' },
  media_debit: { label: 'Media', color: 'bg-purple-50 text-purple-700' },
  skill_debit: { label: 'Skill', color: 'bg-cyan-50 text-cyan-700' },
  credit_reset: { label: 'Reset', color: 'bg-gray-100 text-gray-600' },
  adjustment: { label: 'Adjustment', color: 'bg-gray-100 text-gray-600' },
}


export function BillingPage() {
  const [billing, setBilling] = useState<BillingStatus | null>(null)
  const [transactions, setTransactions] = useState<CreditTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)

  useEffect(() => {
    loadBilling()
  }, [])

  const loadBilling = async () => {
    try {
      const [status, txns] = await Promise.all([
        engine.getBillingStatus(),
        engine.getCreditTransactions(30),
      ])
      setBilling(status)
      setTransactions(txns)
    } catch {
      // offline or self-hosted
    }
    setLoading(false)
  }

  const handleSubscribe = async (envKey: string) => {
    const priceId = import.meta.env[envKey]
    if (!priceId) return
    setCheckoutLoading(envKey)
    try {
      const { url } = await engine.createSubscriptionCheckout(priceId)
      window.location.href = url
    } catch {
      setCheckoutLoading(null)
    }
  }

  const handleBuyCredits = async (envKey: string) => {
    const priceId = import.meta.env[envKey]
    if (!priceId) return
    setCheckoutLoading(envKey)
    try {
      const { url } = await engine.createCreditPackCheckout(priceId)
      window.location.href = url
    } catch {
      setCheckoutLoading(null)
    }
  }

  const handleManageSubscription = async () => {
    try {
      const { url } = await engine.createBillingPortal()
      window.location.href = url
    } catch { /* no billing account */ }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-forest-green border-t-transparent" />
      </div>
    )
  }

  const sub = billing?.subscription
  const credits = billing?.credits ?? 0
  const currentTier = sub?.tier ?? 'none'
  const isActive = sub?.status === 'active' || sub?.status === 'past_due'

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-text-main">Billing</h1>
        <p className="text-sm text-text-muted">Manage your subscription and universal credits. Credits cover all usage: LLM, media, and skills.</p>
      </div>

      {/* Current Status */}
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Subscription Card */}
        <div className="rounded-lg border border-border-subtle bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-text-muted uppercase tracking-wider">Current Plan</h3>
            {sub && (
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_LABELS[sub.status]?.color ?? 'bg-gray-100 text-gray-600'}`}>
                {STATUS_LABELS[sub.status]?.label ?? sub.status}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className={`rounded-lg px-3 py-1.5 text-sm font-bold ${TIER_COLORS[currentTier] ?? 'bg-gray-100 text-gray-600'}`}>
              {TIER_LABELS[currentTier] ?? currentTier}
            </span>
            {sub?.currentPeriodEnd && (
              <span className="text-xs text-text-muted">
                Renews {new Date(sub.currentPeriodEnd).toLocaleDateString()}
              </span>
            )}
          </div>
          {isActive && (
            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border-subtle pt-4">
              <div className="text-center">
                <p className="text-lg font-bold text-text-main">{sub!.maxAgents}</p>
                <p className="text-[10px] text-text-muted uppercase">Team Members</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-text-main">{Math.round(sub!.minHeartbeatSeconds / 60)}m</p>
                <p className="text-[10px] text-text-muted uppercase">Check-in</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-text-main">
                  {sub!.activeHoursStart === 0 && sub!.activeHoursEnd === 24 ? '24/7' : `${sub!.activeHoursEnd - sub!.activeHoursStart}hr/day`}
                </p>
                <p className="text-[10px] text-text-muted uppercase">Work Schedule</p>
              </div>
            </div>
          )}
          {isActive && (
            <button
              onClick={handleManageSubscription}
              className="mt-4 w-full rounded-lg border border-border-subtle px-3 py-2 text-sm font-medium text-text-secondary hover:bg-light-surface-alt"
            >
              Manage Subscription
            </button>
          )}
        </div>

        {/* Credits Card */}
        <div className="rounded-lg border border-border-subtle bg-white p-5">
          <h3 className="mb-3 text-sm font-bold text-text-muted uppercase tracking-wider">Universal Credits</h3>
          <div className="flex items-baseline gap-2">
            <span className="material-symbols-outlined text-accent-gold text-[24px]">bolt</span>
            <span className="font-mono text-3xl font-bold text-text-main">{credits.toLocaleString()}</span>
            <span className="text-sm text-text-muted">credits</span>
          </div>
          <div className="mt-3 text-xs text-text-muted space-y-1">
            <p>Credits cover all usage: LLM heartbeats, media generation, and skill execution.</p>
            {sub?.includedCredits ? (
              <p>{sub.includedCredits.toLocaleString()} included monthly (use-it-or-lose-it){sub.creditsResetAt ? ` — resets ${new Date(sub.creditsResetAt).toLocaleDateString()}` : ''}</p>
            ) : null}
            <p className="text-[11px] italic">Purchased credit packs never expire.</p>
          </div>
        </div>
      </div>

      {/* Plans */}
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-bold text-text-main">Plans</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {PLANS.map((plan) => {
            const isCurrent = currentTier === plan.tier && isActive
            return (
              <div
                key={plan.tier}
                className={`relative rounded-lg border bg-white p-5 ${
                  isCurrent ? 'border-forest-green ring-1 ring-forest-green' : plan.popular ? 'border-purple-300 ring-1 ring-purple-200' : 'border-border-subtle'
                }`}
              >
                {plan.popular && !isCurrent && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-purple-600 px-3 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                    Popular
                  </div>
                )}
                <h3 className="text-lg font-bold text-text-main">{plan.name}</h3>
                <p className="mt-0.5 text-xs text-text-muted">{plan.subtitle}</p>
                <div className="mt-2 mb-4">
                  <span className="text-2xl font-bold text-text-main">{plan.price}</span>
                  <span className="text-sm text-text-muted">{plan.period}</span>
                </div>
                <ul className="mb-3 space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-text-secondary">
                      <span className="material-symbols-outlined text-forest-green text-[16px] mt-0.5">check</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mb-5 group relative inline-flex items-center gap-1 cursor-help">
                  <span className="material-symbols-outlined text-accent-gold text-[14px]">schedule</span>
                  <span className="text-[12px] font-bold text-accent-gold-dim">{plan.workHours}</span>
                  <span className="material-symbols-outlined text-[12px] text-text-muted">info</span>
                  <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block z-10 w-56 rounded-lg border border-border-subtle bg-white p-2 text-[11px] text-text-muted shadow-lg">
                    {plan.workHoursTooltip}
                  </div>
                </div>
                {isCurrent ? (
                  <div className="rounded-lg bg-forest-green/5 px-3 py-2 text-center text-sm font-medium text-forest-green">
                    Current Plan
                  </div>
                ) : (
                  <button
                    onClick={() => handleSubscribe(plan.envKey)}
                    disabled={checkoutLoading === plan.envKey}
                    className="w-full rounded-lg bg-forest-green px-3 py-2 text-sm font-medium text-white hover:bg-forest-green/90 disabled:opacity-50"
                  >
                    {checkoutLoading === plan.envKey ? 'Redirecting...' : isActive ? 'Switch Plan' : 'Subscribe'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Credit Packs */}
      <div className="mb-8">
        <h2 className="mb-2 text-lg font-bold text-text-main">Credit Packs</h2>
        <p className="mb-4 text-xs text-text-muted">Purchased credits never expire and stack on top of your monthly included credits.</p>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {CREDIT_PACKS.map((pack) => (
            <div key={pack.amount} className="rounded-lg border border-border-subtle bg-white p-4">
              <div className="mb-1 flex items-center gap-2">
                <span className="material-symbols-outlined text-accent-gold text-[18px]">bolt</span>
                <span className="text-lg font-bold text-text-main">{pack.amount.toLocaleString()}</span>
              </div>
              <p className="mb-1 text-xl font-bold text-text-main">{pack.price}</p>
              <p className="mb-3 text-[10px] text-text-muted">{pack.perCredit}/credit</p>
              <button
                onClick={() => handleBuyCredits(pack.envKey)}
                disabled={checkoutLoading === pack.envKey}
                className="w-full rounded-lg border border-forest-green px-3 py-2 text-sm font-medium text-forest-green hover:bg-forest-green/5 disabled:opacity-50"
              >
                {checkoutLoading === pack.envKey ? 'Redirecting...' : 'Buy'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Transactions */}
      {transactions.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-bold text-text-main">Recent Transactions</h2>
          <div className="overflow-hidden rounded-lg border border-border-subtle bg-white">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border-subtle bg-light-surface-alt/50">
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-muted">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-muted">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-muted">Description</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-text-muted">Amount</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-text-muted">Balance</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const typeInfo = TXN_TYPE_LABELS[tx.type] ?? { label: tx.type, color: 'bg-gray-100 text-gray-600' }
                  return (
                    <tr key={tx.id} className="border-b border-border-subtle last:border-0">
                      <td className="px-4 py-3 text-sm text-text-muted whitespace-nowrap">
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${typeInfo.color}`}>
                          {typeInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{tx.description}</td>
                      <td className={`px-4 py-3 text-right text-sm font-mono font-bold ${tx.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {tx.amount >= 0 ? '+' : ''}{tx.amount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono text-text-muted">{tx.balanceAfter.toLocaleString()}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

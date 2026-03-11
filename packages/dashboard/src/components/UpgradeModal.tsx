import { useState } from 'react'
import { PLANS } from '@/lib/pricing-data'
import * as engine from '@/lib/engine'

interface Props {
  isOpen: boolean
  onClose: () => void
  title?: string
  message?: string
  currentTier?: string
}

export function UpgradeModal({ isOpen, onClose, title, message, currentTier }: Props) {
  const [loading, setLoading] = useState<string | null>(null)

  if (!isOpen) return null

  // Show plans higher than current tier (or all if free/none)
  const tierOrder = ['none', 'team', 'business', 'enterprise']
  const currentIdx = tierOrder.indexOf(currentTier ?? 'none')
  const availablePlans = PLANS.filter((p) => tierOrder.indexOf(p.tier) > currentIdx)

  const handleSubscribe = async (plan: typeof PLANS[0]) => {
    const priceId = (import.meta.env as Record<string, string>)[plan.envKey]
    if (!priceId) return
    setLoading(plan.tier)
    try {
      const { url } = await engine.createSubscriptionCheckout(priceId)
      if (url) {
        try {
          const parsed = new URL(url)
          if (parsed.protocol === 'https:' && parsed.hostname.endsWith('stripe.com')) {
            window.location.href = url
          }
        } catch { /* invalid URL */ }
      }
    } catch {
      setLoading(null)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-2xl mx-4 rounded-2xl border border-border-subtle bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100">
              <span className="material-symbols-outlined text-amber-600 text-xl">rocket_launch</span>
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-text-main">
                {title ?? 'Upgrade Your Plan'}
              </h2>
              {message && <p className="text-sm text-text-muted">{message}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-main">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {availablePlans.length === 0 ? (
          <div className="rounded-lg border border-border-subtle bg-gray-50 p-4 text-center">
            <p className="text-sm text-text-secondary">You're on the highest plan available.</p>
            <p className="mt-1 text-xs text-text-muted">Contact us for custom enterprise needs.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {availablePlans.map((plan) => (
              <div
                key={plan.tier}
                className={`rounded-xl border p-4 transition-colors ${
                  plan.popular
                    ? 'border-forest-green bg-forest-green/5'
                    : 'border-border-subtle hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-text-main">{plan.name}</span>
                      {plan.popular && (
                        <span className="rounded-full bg-forest-green px-2 py-0.5 text-[10px] font-bold text-white">
                          Most Popular
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-text-muted">{plan.subtitle}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {plan.features.map((f) => (
                        <span key={f} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-text-secondary">
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right ml-4 shrink-0">
                    <div className="text-2xl font-bold text-text-main">{plan.price}</div>
                    <div className="text-xs text-text-muted">{plan.period}</div>
                    <button
                      onClick={() => handleSubscribe(plan)}
                      disabled={loading !== null}
                      className="mt-2 rounded-lg bg-forest-green px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-forest-green/90 disabled:opacity-50"
                    >
                      {loading === plan.tier ? 'Redirecting...' : currentTier && currentTier !== 'none' ? 'Upgrade' : 'Subscribe'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 text-center">
          <a href="/settings/billing" className="text-xs text-forest-green hover:underline">
            View full pricing details
          </a>
        </div>
      </div>
    </div>
  )
}

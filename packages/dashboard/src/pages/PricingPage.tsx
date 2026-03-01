import { useState } from 'react'
import { useNavigate } from 'react-router'
import { MarketingLayout } from '@/layouts/MarketingLayout'
import { PLANS, CREDIT_PACKS } from '@/lib/pricing-data'

const pricingFaq = [
  {
    q: 'What are universal credits?',
    a: 'Universal credits are a single currency that covers all platform usage — LLM heartbeats, media generation (images, video, 3D), and skill execution (web search, email, etc.). Your subscription includes monthly credits, and you can purchase additional credit packs anytime.',
  },
  {
    q: 'What are heartbeats?',
    a: 'A heartbeat is a scheduled check-in where your agent reviews tasks, messages, and goals, then takes autonomous action. The heartbeat interval determines how frequently your agents check in — from every 5 minutes (Power Crew) to every 30 minutes (Starter Crew).',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. You can cancel your subscription at any time from the Billing page. Your plan remains active until the end of the current billing period. No long-term contracts or cancellation fees.',
  },
  {
    q: 'Do credits expire?',
    a: 'Monthly included credits reset each billing cycle (use-it-or-lose-it). However, purchased credit packs never expire — they stack on top of your monthly credits and carry over indefinitely.',
  },
  {
    q: 'Is there a free tier?',
    a: 'Every new account gets 500 free credits to explore the platform. After that, choose a plan that fits your needs. You can also self-host YokeBot for free forever with your own API keys.',
  },
]

export function PricingPage() {
  const navigate = useNavigate()
  const goToLogin = () => navigate('/login')
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  return (
    <MarketingLayout>
      {/* Plans Hero */}
      <section className="relative bg-white px-6 pt-20 pb-16 xl:px-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16 text-center">
            <h1 className="mb-4 font-display text-4xl font-bold text-text-main md:text-5xl">Build Your Team</h1>
            <p className="mx-auto max-w-xl text-lg text-text-muted">Start with a couple of part-timers and scale to a full 24/7 workforce. Onboard new team members in minutes, not weeks.</p>
          </div>
          <div className="grid items-center gap-8 md:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.tier}
                className={`pricing-card-hover group relative flex flex-col rounded-xl border bg-white p-8 transition-all duration-300 ${
                  plan.popular
                    ? 'z-10 scale-105 border-accent-gold/50 shadow-2xl shadow-accent-gold/10'
                    : 'border-border-subtle hover:border-forest-green/30'
                }`}
                style={plan.popular
                  ? { boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03), 0 25px 50px -12px rgba(212, 160, 23, 0.15)' }
                  : { boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)' }
                }
              >
                {plan.popular && (
                  <div className="absolute right-0 top-0 rounded-bl-lg rounded-tr-lg bg-accent-gold px-3 py-1 text-xs font-bold text-white">POPULAR</div>
                )}
                <h3 className="mb-1 font-display text-xl font-bold text-text-main">{plan.name}</h3>
                <p className="mb-4 text-xs text-text-muted">{plan.subtitle}</p>
                <div className="mb-6 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-text-main">{plan.price}</span>
                  <span className="text-text-muted">{plan.period}</span>
                </div>
                <ul className="mb-4 flex-1 space-y-4">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-3 text-sm text-text-main">
                      <span className="material-symbols-outlined text-lg text-accent-gold-dim">check</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="group/tip relative mb-6 inline-flex items-center gap-1 cursor-help">
                  <span className="material-symbols-outlined text-accent-gold text-[14px]">schedule</span>
                  <span className="text-[12px] font-bold text-accent-gold-dim">{plan.workHours}</span>
                  <span className="material-symbols-outlined text-[12px] text-text-muted">info</span>
                  <div className="absolute bottom-full left-0 mb-1 hidden group-hover/tip:block z-10 w-56 rounded-lg border border-border-subtle bg-white p-2 text-[11px] text-text-muted shadow-lg">
                    {plan.workHoursTooltip}
                  </div>
                </div>
                <button
                  onClick={goToLogin}
                  className={plan.popular
                    ? 'primary-btn w-full rounded-lg bg-forest-green py-3 font-bold text-white shadow-lg shadow-forest-green/20 transition-colors hover:bg-forest-green-hover'
                    : 'w-full rounded-lg border border-gray-300 bg-gray-50 py-3 font-bold text-text-main transition-colors hover:border-accent-gold hover:bg-white hover:text-accent-gold-dim'
                  }
                >
                  Get Started
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Credit Packs */}
      <section className="border-t border-gray-200 bg-light-bg px-6 py-20 xl:px-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 text-center">
            <h2 className="mb-2 font-display text-3xl font-bold text-text-main">Credit Packs</h2>
            <p className="mx-auto max-w-xl text-text-muted">Need more credits? Purchased packs never expire and stack on top of your monthly included credits.</p>
          </div>
          <div className="mx-auto grid max-w-3xl grid-cols-2 gap-4 md:grid-cols-4">
            {CREDIT_PACKS.map((pack) => (
              <div key={pack.amount} className="rounded-lg border border-border-subtle bg-white p-4">
                <div className="mb-1 flex items-center gap-2">
                  <span className="material-symbols-outlined text-accent-gold text-[18px]">bolt</span>
                  <span className="text-lg font-bold text-text-main">{pack.amount.toLocaleString()}</span>
                </div>
                <p className="mb-1 text-xl font-bold text-text-main">{pack.price}</p>
                <p className="mb-3 text-[10px] text-text-muted">{pack.perCredit}/credit</p>
                <button
                  onClick={goToLogin}
                  className="w-full rounded-lg border border-forest-green px-3 py-2 text-sm font-medium text-forest-green hover:bg-forest-green/5"
                >
                  Get Started
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing FAQ */}
      <section className="border-t border-gray-200 bg-white px-6 py-20 xl:px-24">
        <div className="mx-auto max-w-3xl">
          <div className="mb-12 text-center">
            <h2 className="mb-4 font-display text-3xl font-bold text-text-main">Pricing FAQ</h2>
          </div>
          <div className="space-y-3">
            {pricingFaq.map((item, idx) => (
              <div key={idx} className="rounded-lg border border-border-subtle bg-white overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="flex w-full items-center justify-between px-6 py-4 text-left"
                >
                  <span className="text-sm font-bold text-text-main">{item.q}</span>
                  <span className={`material-symbols-outlined text-text-muted transition-transform ${openFaq === idx ? 'rotate-180' : ''}`}>
                    expand_more
                  </span>
                </button>
                {openFaq === idx && (
                  <div className="border-t border-border-subtle px-6 py-4">
                    <p className="text-sm leading-relaxed text-text-muted">{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </MarketingLayout>
  )
}

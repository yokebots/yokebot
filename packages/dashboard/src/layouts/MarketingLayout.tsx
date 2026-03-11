import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { FeaturesMegaMenu } from '@/components/FeaturesMegaMenu'

export function MarketingLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const goToLogin = () => navigate('/login')
  const [mobileNav, setMobileNav] = useState(false)

  return (
    <div className="relative min-h-screen flex flex-col overflow-x-hidden bg-white text-text-main font-body selection:bg-accent-gold/30 selection:text-forest-green">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="group cursor-pointer" onClick={() => navigate('/')}>
            <img src="/logo-full-color.png" alt="YokeBot" className="h-12 object-contain transition-all duration-300 group-hover:opacity-80" />
          </div>
          <nav className="hidden items-center gap-8 md:flex">
            <FeaturesMegaMenu />
            <a className="text-base font-medium text-text-muted hover:text-forest-green transition-colors" href="/pricing">Pricing</a>
            <a className="text-base font-medium text-text-muted hover:text-forest-green transition-colors" href="/docs">Docs</a>
            <a className="text-base font-medium text-text-muted hover:text-forest-green transition-colors" href="/contact">Contact</a>
          </nav>
          <div className="flex items-center gap-4">
            <button onClick={goToLogin} className="hidden text-sm font-bold text-text-main hover:text-forest-green transition-colors sm:block">
              Log In
            </button>
            <button onClick={goToLogin} className="hidden sm:inline-flex rounded-lg border border-transparent bg-forest-green px-5 py-2.5 text-sm font-bold text-white shadow-lg hover:shadow-forest-green/20 hover:bg-forest-green-hover">
              Start Free
            </button>
            <button onClick={() => setMobileNav(!mobileNav)} className="md:hidden rounded-lg p-1.5 text-text-muted hover:bg-light-surface-alt hover:text-text-main transition-colors">
              <span className="material-symbols-outlined text-[24px]">{mobileNav ? 'close' : 'menu'}</span>
            </button>
          </div>
        </div>
        {mobileNav && (
          <div className="md:hidden border-t border-border-subtle bg-white/95 backdrop-blur-md px-6 py-4 space-y-3">
            {[
              { label: 'Features', href: '/#features' },
              { label: 'Pricing', href: '/pricing' },
              { label: 'Docs', href: '/docs' },
              { label: 'Contact', href: '/contact' },
            ].map((item) => (
              <a key={item.label} href={item.href} onClick={() => setMobileNav(false)} className="block text-base font-medium text-text-muted hover:text-forest-green transition-colors">{item.label}</a>
            ))}
            <div className="pt-3 border-t border-border-subtle flex flex-col gap-2">
              <button onClick={goToLogin} className="text-sm font-bold text-text-main hover:text-forest-green transition-colors text-left">Log In</button>
              <button onClick={goToLogin} className="rounded-lg bg-forest-green px-5 py-2.5 text-sm font-bold text-white text-center">Start Free</button>
            </div>
          </div>
        )}
      </header>

      <main className="relative z-10 flex-grow flex flex-col">
        {children}
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-gray-200 bg-white px-6 pb-12 pt-16 xl:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 grid gap-12 md:grid-cols-4">
            <div>
              <div className="mb-4 flex items-center gap-2">
                <img src="/logo-full-color.png" alt="YokeBot" className="h-8 object-contain" />
              </div>
              <p className="text-sm leading-relaxed text-text-muted">The heavy-duty AI workforce platform for entrepreneurs who mean business.</p>
            </div>
            {[
              { title: 'Product', links: [
                { label: 'Features', href: '/#features' },
                { label: 'Pricing', href: '/pricing' },
                { label: 'Documentation', href: '/docs' },
                { label: 'API Reference', href: '/docs/api-reference' },
              ]},
              { title: 'Company', links: [
                { label: 'Contact Us', href: '/contact' },
                { label: 'Discord', href: 'https://discord.gg/kqfFr87KqV', external: true },
                { label: 'X (Twitter)', href: 'https://x.com/yokebots', external: true },
                { label: 'GitHub', href: 'https://github.com/yokebots/yokebot', external: true },
              ]},
              { title: 'Get Started', links: [
                { label: 'Start Now Free', href: '/login' },
                { label: 'Log In', href: '/login' },
                { label: 'Self-Host Guide', href: '/docs/self-hosting' },
              ]},
            ].map((col) => (
              <div key={col.title}>
                <h4 className="mb-4 font-bold text-text-main">{col.title}</h4>
                <ul className="space-y-2 text-sm text-text-muted">
                  {col.links.map((link) => (
                    <li key={link.label}><a className="transition-colors hover:text-forest-green" href={link.href} {...('external' in link ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{link.label}</a></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-200 pt-8">
            <p className="font-mono text-xs text-text-muted opacity-80">&copy; 2026 YokeBot Inc. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

/** Reusable dark hero section for feature pages */
export function FeatureHero({
  badge,
  title,
  titleAccent,
  description,
  primaryCta,
  secondaryCta,
  children,
}: {
  badge?: string
  title: string
  titleAccent?: string
  description: string
  primaryCta: { label: string; onClick: () => void }
  secondaryCta?: { label: string; onClick: () => void }
  children?: ReactNode
}) {
  return (
    <section className="relative px-6 pb-24 pt-20 xl:px-24 bg-gray-950 overflow-hidden">
      <div
        className="absolute inset-0 z-0 pointer-events-none opacity-20"
        style={{ backgroundImage: 'radial-gradient(#4B5563 1px, transparent 1px)', backgroundSize: '32px 32px' }}
      />
      <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2">
        <div>
          {badge && (
            <span className="mb-4 inline-block rounded-full border border-green-500/30 bg-green-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-green-400">
              {badge}
            </span>
          )}
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-white md:text-5xl lg:text-6xl">
            {title}
            {titleAccent && <><br /><span className="text-green-400">{titleAccent}</span></>}
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-gray-400">{description}</p>
          <div className="mt-8 flex flex-wrap gap-4">
            <button
              onClick={primaryCta.onClick}
              className="inline-flex items-center gap-2 rounded-xl bg-forest-green px-6 py-3.5 text-base font-bold text-white shadow-lg hover:bg-forest-green-hover transition-colors"
            >
              {primaryCta.label}
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </button>
            {secondaryCta && (
              <button
                onClick={secondaryCta.onClick}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-600 px-6 py-3.5 text-base font-medium text-gray-300 hover:border-gray-400 hover:text-white transition-colors"
              >
                {secondaryCta.label}
              </button>
            )}
          </div>
        </div>
        {children && <div className="hidden lg:block">{children}</div>}
      </div>
    </section>
  )
}

/** Reusable CTA banner at bottom of feature pages */
export function FeatureCta({
  title,
  description,
}: {
  title: string
  description: string
}) {
  const navigate = useNavigate()
  return (
    <section className="relative px-6 py-24 xl:px-12 bg-gray-950">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl">{title}</h2>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-gray-400">{description}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <button
            onClick={() => navigate('/login')}
            className="inline-flex items-center gap-2 rounded-xl bg-forest-green px-8 py-4 text-lg font-bold text-white shadow-lg hover:bg-forest-green-hover transition-colors"
          >
            Get Started for Free
            <span className="material-symbols-outlined text-[22px]">arrow_forward</span>
          </button>
          <button
            onClick={() => navigate('/#contact')}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-600 px-8 py-4 text-lg font-medium text-gray-300 hover:border-gray-400 hover:text-white transition-colors"
          >
            Contact Sales
          </button>
        </div>
        <p className="mt-4 text-sm text-gray-500">No credit card required. 1,250 free credits to start.</p>
      </div>
    </section>
  )
}

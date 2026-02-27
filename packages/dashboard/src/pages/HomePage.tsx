import { useAuth } from '@/lib/auth'
import { ParticleConstellation } from '@/components/ParticleConstellation'

const agentCards = [
  { icon: 'person_search', bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-100', hoverBg: 'group-hover:bg-blue-600', name: 'Lead Gen Specialist', role: 'Outreach & Qualify', action: 'Analyzing 50 leads...', actionIcon: 'sync', spin: true },
  { icon: 'support_agent', bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100', hoverBg: 'group-hover:bg-amber-500', name: '24/7 Support Ox', role: 'Customer Success', action: 'Ticket #4092 closed', actionIcon: 'check_circle', actionColor: 'text-green-600' },
  { icon: 'campaign', bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-100', hoverBg: 'group-hover:bg-purple-600', name: 'Social Strategist', role: 'Content & Engagement', action: 'Drafting LinkedIn post...', actionIcon: 'edit_note' },
  { icon: 'query_stats', bg: 'bg-teal-50', text: 'text-teal-600', border: 'border-teal-100', hoverBg: 'group-hover:bg-teal-600', name: 'Market Researcher', role: 'Data & Insights', action: 'Scraping competitor pricing', actionIcon: 'download' },
  { icon: 'mail', bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-100', hoverBg: 'group-hover:bg-rose-600', name: 'Email Assistant', role: 'Inbox Management', action: 'Sorting priority inbox...', actionIcon: 'mark_email_read', hidden: 'hidden lg:flex' },
  { icon: 'code', bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-100', hoverBg: 'group-hover:bg-indigo-600', name: 'Code Reviewer', role: 'DevOps & QA', action: 'Scanning pull request #88', actionIcon: 'bug_report', hidden: 'hidden lg:flex' },
]

const modelCards = [
  { icon: 'hub', color: 'purple', tag: 'Orchestrator', name: 'Minimax 2.5', desc: 'Highly efficient context management for complex multi-agent workflows.', speed: 'Fast', speedColor: 'text-green-600', cost: '$$', costColor: 'text-green-600' },
  { icon: 'terminal', color: 'blue', tag: 'Coding', name: 'Kimi 2.5', desc: 'Exceptional code generation capabilities at a fraction of the enterprise cost.', speed: 'Very Fast', speedColor: 'text-green-600', cost: '$', costColor: 'text-green-600' },
  { icon: 'movie', color: 'rose', tag: 'Video Gen', name: 'Kling 3.0', desc: 'Create high-fidelity video assets for marketing and social campaigns instantly.', speed: 'Standard', speedColor: 'text-yellow-600', cost: '$$$', costColor: 'text-red-600' },
  { icon: 'image', color: 'amber', tag: 'Image Gen', name: 'Nano Banana Pro', desc: 'Photorealistic image generation optimized for brand consistency and speed.', speed: 'Fast', speedColor: 'text-green-600', cost: '$$', costColor: 'text-green-600' },
]

export function HomePage() {
  const { signInWithGoogle, signInWithGitHub } = useAuth()

  return (
    <div className="relative min-h-screen flex flex-col overflow-x-hidden bg-white text-text-main font-body selection:bg-accent-gold/30 selection:text-forest-green">
      {/* Dot grid background */}
      <div
        className="fixed inset-0 z-0 pointer-events-none opacity-40"
        style={{ backgroundImage: 'radial-gradient(#E5E7EB 1px, transparent 1px)', backgroundSize: '32px 32px' }}
      />

      {/* Header */}
      <header className="sticky top-0 z-50 w-full glass-panel">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 xl:px-12">
          <div className="flex cursor-pointer items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-forest-green text-white shadow-md transition-all duration-300 group-hover:bg-forest-green-hover">
              <span className="text-2xl">🐂</span>
            </div>
            <span className="font-display text-xl font-bold tracking-tight text-text-main">YokeBot</span>
          </div>
          <nav className="hidden items-center gap-8 md:flex">
            <a className="text-sm font-medium text-text-muted hover:text-forest-green transition-colors" href="#features">Features</a>
            <a className="text-sm font-medium text-text-muted hover:text-forest-green transition-colors" href="#models">Integrations</a>
            <a className="text-sm font-medium text-text-muted hover:text-forest-green transition-colors" href="#pricing">Pricing</a>
          </nav>
          <div className="flex items-center gap-4">
            <button onClick={signInWithGitHub} className="hidden text-sm font-bold text-text-main hover:text-forest-green transition-colors sm:block">
              Log In
            </button>
            <button onClick={signInWithGitHub} className="primary-btn rounded-lg border border-transparent bg-forest-green px-5 py-2.5 text-sm font-bold text-white shadow-lg hover:shadow-forest-green/20 hover:bg-forest-green-hover">
              Start Free
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-grow flex flex-col">
        {/* Hero */}
        <section className="relative px-6 pb-32 pt-20 xl:px-24 2xl:px-48">
          <ParticleConstellation />
          <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-2">
            <div className="flex max-w-2xl flex-col gap-8">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border-subtle bg-light-surface-alt px-3 py-1 shadow-sm">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-forest-green opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-forest-green" />
                </span>
                <span className="font-mono text-xs font-medium uppercase tracking-wider text-forest-green">Ox-Strength AI</span>
              </div>
              <div className="space-y-4">
                <h1 className="font-display text-6xl font-bold leading-[0.9] tracking-tight text-text-main md:text-8xl">
                  GET <br />
                  <span className="bg-gradient-to-r from-forest-green via-green-600 to-accent-gold-dim bg-clip-text text-transparent">YOKED.</span>
                </h1>
                <p className="max-w-lg border-l-4 border-accent-gold py-2 pl-6 text-lg leading-relaxed text-text-muted md:text-xl">
                  Build an automated workforce that pulls its weight. <br />The AI agent platform for serious entrepreneurs.
                </p>
              </div>
              <div className="flex flex-col gap-4 pt-4 sm:flex-row">
                <button onClick={signInWithGitHub} className="primary-btn group flex h-14 items-center justify-center gap-2 rounded-lg bg-forest-green px-8 font-display text-lg font-bold text-white shadow-xl shadow-forest-green/15 hover:bg-forest-green-hover">
                  Start Free
                  <span className="material-symbols-outlined text-white transition-transform group-hover:translate-x-1">arrow_forward</span>
                </button>
                <button className="flex h-14 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-8 font-display text-lg font-medium text-text-main shadow-sm transition-all hover:scale-105 hover:border-forest-green hover:text-forest-green hover:shadow-md">
                  Watch Demo
                  <span className="material-symbols-outlined">play_circle</span>
                </button>
              </div>
              <div className="flex items-center gap-6 pt-4 text-sm text-text-muted">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg text-accent-gold">check_circle</span>
                  <span>No Credit Card</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg text-accent-gold">check_circle</span>
                  <span>Enterprise Security</span>
                </div>
              </div>
            </div>

            {/* Agent cards grid */}
            <div className="relative w-full">
              <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-tr from-forest-green/5 to-accent-gold/10 blur-[80px]" />
              <div className="relative z-10 grid grid-cols-2 gap-4">
                {agentCards.map((card) => (
                  <div key={card.name} className={`agent-card group flex cursor-default flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 transition-all duration-300 ${card.hidden ?? ''}`}>
                    <div className="flex items-center justify-between">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-lg border ${card.bg} ${card.text} ${card.border} ${card.hoverBg} group-hover:text-white transition-colors`}>
                        <span className="material-symbols-outlined">{card.icon}</span>
                      </div>
                      <div className="flex items-center gap-1.5 rounded-full border border-green-100 bg-green-50 px-2 py-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500 live-indicator-pulse" />
                        <span className="font-mono text-[10px] font-bold uppercase tracking-wide text-green-700">LIVE</span>
                      </div>
                    </div>
                    <div>
                      <h3 className="font-display text-base font-bold leading-tight text-gray-900">{card.name}</h3>
                      <p className="mt-1 text-xs text-gray-500">{card.role}</p>
                    </div>
                    <div className="mt-auto border-t border-gray-100 pt-3">
                      <div className="flex items-center gap-2 rounded bg-gray-50 px-2 py-1.5 font-mono text-xs text-gray-600">
                        <span className={`material-symbols-outlined text-[14px] ${card.spin ? 'animate-spin' : ''} ${card.actionColor ?? ''}`}>{card.actionIcon}</span>
                        <span className="truncate">{card.action}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Features strip */}
        <section id="features" className="border-t border-gray-200 bg-light-bg">
          <div className="mx-auto max-w-7xl px-6 py-12 xl:px-24 2xl:px-48">
            <div className="grid gap-8 md:grid-cols-3">
              {[
                { icon: 'precision_manufacturing', color: 'text-accent-gold-dim', title: 'Heavy Lifting', desc: 'Offload the grind. Our agents handle 1000s of tasks simultaneously without breaking a sweat.' },
                { icon: 'bolt', color: 'text-forest-green', title: 'Instant Deployment', desc: 'No complex coding. Select a template, connect your data, and set your workforce loose.' },
                { icon: 'monitoring', color: 'text-blue-600', title: 'ROI Tracking', desc: 'Monitor performance in real-time. See exactly how much time and money your bots are saving.' },
              ].map((f) => (
                <div key={f.title} className="flex items-start gap-4">
                  <div className={`rounded-lg border border-gray-200 bg-white p-3 shadow-sm ${f.color}`}>
                    <span className="material-symbols-outlined !text-3xl">{f.icon}</span>
                  </div>
                  <div>
                    <h3 className="mb-1 font-display text-lg font-bold text-text-main">{f.title}</h3>
                    <p className="text-sm leading-relaxed text-text-muted">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Model ticker */}
        <section id="models" className="relative overflow-hidden border-y border-gray-200 bg-white py-16">
          <div className="organic-shader" />
          <div className="relative z-10 mx-auto mb-10 max-w-7xl px-6 text-center">
            <div className="mb-3 inline-flex items-center gap-2">
              <span className="rounded-full border border-green-100 bg-green-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-forest-green">Multi-Model Support</span>
            </div>
            <h2 className="mb-4 font-display text-3xl font-bold text-text-main md:text-4xl">The Engine Behind Your Workforce</h2>
            <p className="mx-auto max-w-2xl text-lg text-text-muted">
              Don't get locked in. Switch between the world's most powerful models to optimize for cost, speed, or specialized performance.
            </p>
          </div>
          <div className="ticker-mask relative z-10 mx-auto w-full max-w-[1920px] overflow-hidden">
            <div className="flex w-fit animate-ticker hover:[animation-play-state:paused]">
              {[...modelCards, ...modelCards].map((card, i) => (
                <div key={`${card.name}-${i}`} className="agent-card group mx-3 w-80 flex-shrink-0 cursor-default rounded-xl border border-border-subtle bg-light-surface-alt p-5 transition-all duration-300">
                  <div className="mb-3 flex items-start justify-between">
                    <div className="rounded-lg border border-gray-100 bg-white p-2 shadow-sm transition-shadow group-hover:shadow-md">
                      <span className={`material-symbols-outlined text-${card.color}-600`}>{card.icon}</span>
                    </div>
                    <span className={`rounded border border-${card.color}-100 bg-${card.color}-50 px-2 py-1 font-mono text-xs font-bold text-${card.color}-700`}>{card.tag}</span>
                  </div>
                  <h3 className="font-display text-lg font-bold text-text-main">{card.name}</h3>
                  <p className="mt-2 text-sm text-text-muted">{card.desc}</p>
                  <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-3 text-xs font-medium text-text-muted">
                    <span>Speed: <span className={card.speedColor}>{card.speed}</span></span>
                    <span>Cost: <span className={card.costColor}>{card.cost}</span></span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Choose Your Path */}
        <section className="relative bg-light-bg px-6 py-20 xl:px-24 2xl:px-48">
          <div className="mx-auto max-w-7xl">
            <div className="mb-12 text-center">
              <h2 className="mb-4 font-display text-3xl font-bold text-text-main md:text-5xl">Choose Your Path</h2>
              <p className="mx-auto max-w-xl text-text-muted">Whether you need instant scalability or full data sovereignty, we've got you covered.</p>
            </div>
            <div className="mx-auto mb-16 grid max-w-5xl gap-8 md:grid-cols-2">
              {/* Cloud */}
              <div className="border-glow group relative overflow-hidden rounded-xl border border-border-subtle bg-light-surface-alt p-8 transition-all duration-300 hover:shadow-lg">
                <div className="pointer-events-none absolute right-0 top-0 p-6 opacity-5 transition-opacity group-hover:opacity-10">
                  <span className="material-symbols-outlined text-9xl text-forest-green">cloud</span>
                </div>
                <div className="relative z-10 flex h-full flex-col">
                  <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-lg border border-gray-200 bg-white text-forest-green shadow-sm">
                    <span className="material-symbols-outlined text-3xl">cloud</span>
                  </div>
                  <h3 className="mb-3 font-display text-2xl font-bold text-text-main">YokeBot Cloud</h3>
                  <p className="mb-8 flex-grow text-text-muted">The fastest way to scale. Hosted by us, managed for you. Get instant access to powerful AI agents without infrastructure headaches.</p>
                  <button onClick={signInWithGitHub} className="primary-btn flex w-full items-center justify-center gap-2 rounded-lg bg-forest-green py-3.5 font-bold text-white shadow-md transition-all hover:bg-forest-green-hover hover:shadow-lg">
                    Start Free
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </button>
                </div>
              </div>
              {/* Open Source */}
              <div className="border-glow group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-8 opacity-80 transition-all duration-300 hover:border-gray-300 hover:opacity-100 hover:shadow-lg">
                <div className="pointer-events-none absolute right-0 top-0 p-6 opacity-5 transition-opacity group-hover:opacity-10">
                  <span className="material-symbols-outlined text-9xl text-gray-400">code</span>
                </div>
                <div className="relative z-10 flex h-full flex-col">
                  <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-text-muted shadow-sm">
                    <svg className="h-8 w-8 fill-current" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" /></svg>
                  </div>
                  <h3 className="mb-3 font-display text-2xl font-bold text-text-muted">YokeBot Open Source</h3>
                  <p className="mb-8 flex-grow text-gray-500">Self-host on your own hardware. Full privacy, full control, forever free. Contribute to the core engine powering the future of work.</p>
                  <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-transparent bg-gray-200 py-3.5 font-bold text-gray-600 transition-all hover:scale-105 hover:bg-gray-300">
                    View on GitHub
                    <span className="material-symbols-outlined text-sm">open_in_new</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Why Business Owners */}
            <div className="mx-auto max-w-5xl border-t border-gray-200 pt-16">
              <div className="mb-12 text-center">
                <h2 className="mb-4 font-display text-3xl font-bold text-text-main md:text-4xl">Why Business Owners Choose YokeBot</h2>
                <p className="mx-auto max-w-xl text-lg text-text-muted">Work smarter, not harder. Reclaim your time and focus on growth.</p>
              </div>
              <div className="grid gap-10 md:grid-cols-3">
                {[
                  { icon: 'savings', bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-100', title: 'Reduce Overhead', desc: 'Slash operational costs by automating repetitive tasks. Replace expensive outsourcing with efficient, tireless AI agents.' },
                  { icon: 'rocket_launch', bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-100', title: 'Scale Effortlessly', desc: 'Grow your business without growing your headcount. Add capacity instantly with a click, handling spikes in demand with ease.' },
                  { icon: 'shield_lock', bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100', title: 'Total Data Privacy', desc: 'Keep your proprietary data secure. With self-hosted options and strict access controls, your business secrets stay yours.' },
                ].map((item) => (
                  <div key={item.title} className="rounded-2xl border border-gray-100 bg-white p-8 shadow-xl shadow-gray-200/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-gray-200/80">
                    <div className={`mb-6 flex h-16 w-16 items-center justify-center rounded-xl border shadow-sm ${item.bg} ${item.text} ${item.border}`}>
                      <span className="material-symbols-outlined text-3xl">{item.icon}</span>
                    </div>
                    <h3 className="mb-3 font-display text-xl font-bold text-text-main">{item.title}</h3>
                    <p className="leading-relaxed text-text-muted">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="relative bg-white px-6 py-24 xl:px-24 2xl:px-48">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
          <div className="mx-auto max-w-7xl">
            <div className="mb-16 text-center">
              <h2 className="mb-4 font-display text-3xl font-bold text-text-main md:text-5xl">Pricing that Scales</h2>
              <p className="mx-auto max-w-xl text-text-muted">Start small and grow your workforce as your revenue grows.</p>
            </div>
            <div className="grid items-center gap-8 md:grid-cols-3">
              {/* Hobby */}
              <div className="pricing-card-hover group relative flex flex-col rounded-xl border border-border-subtle bg-white p-8 transition-all duration-300 hover:border-forest-green/30" style={{ boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)' }}>
                <h3 className="mb-2 font-display text-xl font-bold text-text-main">Hobby</h3>
                <div className="mb-6 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-text-main">$12</span>
                  <span className="text-text-muted">/mo</span>
                </div>
                <p className="mb-8 text-sm text-text-muted">Perfect for testing the waters with a single agent.</p>
                <ul className="mb-8 flex-1 space-y-4">
                  {['1 Active Agent', '1hr Heartbeat', '8hr Active Shift', '150 Creative Credits'].map((f) => (
                    <li key={f} className="flex items-center gap-3 text-sm text-text-main">
                      <span className="material-symbols-outlined text-lg text-accent-gold-dim">check</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <button onClick={signInWithGitHub} className="w-full rounded-lg border border-gray-300 bg-gray-50 py-3 font-bold text-text-main transition-colors hover:border-accent-gold hover:bg-white hover:text-accent-gold-dim">Get Started</button>
              </div>
              {/* Starter — popular */}
              <div className="pricing-card-hover relative z-10 flex scale-105 flex-col rounded-xl border border-accent-gold/50 bg-white p-8 shadow-2xl shadow-accent-gold/10" style={{ boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03), 0 25px 50px -12px rgba(212, 160, 23, 0.15)' }}>
                <div className="absolute right-0 top-0 rounded-bl-lg rounded-tr-lg bg-accent-gold px-3 py-1 text-xs font-bold text-white">POPULAR</div>
                <h3 className="mb-2 font-display text-xl font-bold text-text-main">Starter</h3>
                <div className="mb-6 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-text-main">$39</span>
                  <span className="text-text-muted">/mo</span>
                </div>
                <p className="mb-8 text-sm text-text-muted">For entrepreneurs ready to automate operations.</p>
                <ul className="mb-8 flex-1 space-y-4">
                  {['3 Active Agents', '30min Heartbeat', '16hr/day Active', '750 Creative Credits'].map((f) => (
                    <li key={f} className="flex items-center gap-3 text-sm text-text-main">
                      <span className="material-symbols-outlined text-lg text-accent-gold-dim">check</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <button onClick={signInWithGitHub} className="primary-btn w-full rounded-lg bg-forest-green py-3 font-bold text-white shadow-lg shadow-forest-green/20 transition-colors hover:bg-forest-green-hover">Get Starter</button>
              </div>
              {/* Growth */}
              <div className="pricing-card-hover group relative flex flex-col rounded-xl border border-border-subtle bg-white p-8 transition-all duration-300 hover:border-forest-green/30" style={{ boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)' }}>
                <h3 className="mb-2 font-display text-xl font-bold text-text-main">Growth</h3>
                <div className="mb-6 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-text-main">$99</span>
                  <span className="text-text-muted">/mo</span>
                </div>
                <p className="mb-8 text-sm text-text-muted">Full operational autonomy with 24/7 agent uptime.</p>
                <ul className="mb-8 flex-1 space-y-4">
                  {['10 Active Agents', '15min Heartbeat', '24/7 Always On', '2,000 Creative Credits'].map((f) => (
                    <li key={f} className="flex items-center gap-3 text-sm text-text-main">
                      <span className="material-symbols-outlined text-lg text-accent-gold-dim">check</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <button onClick={signInWithGitHub} className="w-full rounded-lg border border-gray-300 bg-gray-50 py-3 font-bold text-text-main transition-colors hover:border-accent-gold hover:bg-white hover:text-accent-gold-dim">Get Growth</button>
              </div>
            </div>
          </div>
        </section>

        {/* Testimonial */}
        <section className="overflow-hidden border-t border-gray-200 bg-light-bg px-6 py-24 xl:px-24 2xl:px-48">
          <div className="relative mx-auto max-w-4xl text-center">
            <span className="pointer-events-none absolute -left-10 -top-10 -z-10 select-none font-display text-[120px] leading-none text-gray-200 opacity-60">"</span>
            <h2 className="relative z-10 mb-8 font-display text-2xl font-bold leading-tight text-text-main md:text-3xl">
              "YokeBot pulls more weight than my entire previous outsourcing team combined. It runs 24/7, doesn't complain, and costs a fraction of the price."
            </h2>
            <div className="flex items-center justify-center gap-4">
              <div className="relative h-14 w-14 overflow-hidden rounded-full border-2 border-forest-green bg-gray-100 shadow-lg">
                <div className="flex h-full w-full items-center justify-center bg-forest-green/10 font-display text-lg font-bold text-forest-green">MR</div>
              </div>
              <div className="text-left">
                <div className="font-display text-lg font-bold text-text-main">Marcus R.</div>
                <div className="font-mono text-xs font-bold uppercase tracking-wide text-accent-gold-dim">FOUNDER, TECHFLOW AUTOMATION</div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white px-6 pb-12 pt-16 xl:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 grid gap-12 md:grid-cols-4">
            <div>
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-forest-green text-white shadow-md">
                  <span className="text-lg">🐂</span>
                </div>
                <span className="font-display text-xl font-bold text-text-main">YokeBot</span>
              </div>
              <p className="text-sm leading-relaxed text-text-muted">The heavy-duty AI workforce platform for entrepreneurs who mean business.</p>
            </div>
            {[
              { title: 'Product', links: ['Agents', 'Workflows', 'Integrations', 'Pricing'] },
              { title: 'Resources', links: ['Documentation', 'API Reference', 'Community', 'Blog'] },
              { title: 'Company', links: ['About', 'Careers', 'Legal', 'Contact'] },
            ].map((col) => (
              <div key={col.title}>
                <h4 className="mb-4 font-bold text-text-main">{col.title}</h4>
                <ul className="space-y-2 text-sm text-text-muted">
                  {col.links.map((link) => (
                    <li key={link}><a className="transition-colors hover:text-forest-green" href="#">{link}</a></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="flex flex-col items-center justify-between gap-4 border-t border-gray-200 pt-8 md:flex-row">
            <p className="font-mono text-xs text-text-muted opacity-80">© 2026 YokeBot Inc. All rights reserved.</p>
            <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-forest-green shadow-[0_0_8px_rgba(15,77,38,0.3)]" />
              <span className="font-mono text-xs font-bold uppercase tracking-wide text-forest-green">Systems Nominal</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

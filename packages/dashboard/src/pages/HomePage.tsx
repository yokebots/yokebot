import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ParticleConstellation } from '@/components/ParticleConstellation'
import { FeaturesMegaMenu } from '@/components/FeaturesMegaMenu'

const agentCards = [
  { icon: 'person_search', bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-100', hoverBg: 'group-hover:bg-blue-600', name: 'Lead Gen Specialist', role: 'Outreach & Qualify', action: 'Analyzing 50 leads...', actionIcon: 'sync', spin: true },
  { icon: 'support_agent', bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100', hoverBg: 'group-hover:bg-amber-500', name: '24/7 Support Ox', role: 'Customer Success', action: 'Ticket #4092 closed', actionIcon: 'check_circle', actionColor: 'text-green-600' },
  { icon: 'campaign', bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-100', hoverBg: 'group-hover:bg-purple-600', name: 'Social Strategist', role: 'Content & Engagement', action: 'Drafting LinkedIn post...', actionIcon: 'edit_note' },
  { icon: 'query_stats', bg: 'bg-teal-50', text: 'text-teal-600', border: 'border-teal-100', hoverBg: 'group-hover:bg-teal-600', name: 'Market Researcher', role: 'Data & Insights', action: 'Scraping competitor pricing', actionIcon: 'download' },
  { icon: 'mail', bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-100', hoverBg: 'group-hover:bg-rose-600', name: 'Email Assistant', role: 'Inbox Management', action: 'Sorting priority inbox...', actionIcon: 'mark_email_read', hidden: 'hidden lg:flex' },
  { icon: 'code', bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-100', hoverBg: 'group-hover:bg-indigo-600', name: 'Code Reviewer', role: 'DevOps & QA', action: 'Scanning pull request #88', actionIcon: 'bug_report', hidden: 'hidden lg:flex' },
]

const modelCards = [
  { icon: 'psychology', color: 'purple', tag: 'Frontier', name: 'DeepSeek V3.2', desc: 'Gold-medal reasoning at budget price. Dual chat+reasoning in one model.', stars: { i: 5, p: 4, s: 5 }, credits: 8 },
  { icon: 'hub', color: 'blue', tag: 'Orchestrator', name: 'MiniMax M2.5', desc: 'Excellent task breakdown and workflow orchestration with 1M context.', stars: { i: 4, p: 4, s: 3 }, credits: 25 },
  { icon: 'terminal', color: 'indigo', tag: 'Coding', name: 'Devstral 2 123B', desc: 'Senior-level code architecture. Beats Claude 3.5 on SWE-bench.', stars: { i: 5, p: 4, s: 3 }, credits: 40 },
  { icon: 'bolt', color: 'amber', tag: 'Budget', name: 'Gemma 3 27B', desc: 'Blazing fast for simple repetitive tasks at rock-bottom cost.', stars: { i: 2, p: 2, s: 5 }, credits: 5 },
  { icon: 'smart_toy', color: 'teal', tag: 'Frontier', name: 'GLM-5', desc: '200K context, MIT license, near-Opus benchmarks. Research powerhouse.', stars: { i: 5, p: 5, s: 3 }, credits: 40 },
  { icon: 'speed', color: 'rose', tag: 'Fast', name: 'Grok 4 Fast', desc: 'Speed demon for real-time high-volume tasks from xAI.', stars: { i: 4, p: 3, s: 5 }, credits: 15 },
  { icon: 'movie', color: 'rose', tag: 'Video Gen', name: 'Kling 3.0', desc: 'Create high-fidelity 4K 60fps video assets for marketing and social.', stars: { i: 0, p: 4, s: 2 }, credits: 1500 },
  { icon: 'image', color: 'amber', tag: 'Image Gen', name: 'Nano Banana Pro', desc: 'Premium photorealistic image generation, up to 4K resolution.', stars: { i: 0, p: 5, s: 3 }, credits: 200 },
]

function StarRow({ stars }: { stars: { i: number; p: number; s: number } }) {
  const renderStars = (n: number) => [1, 2, 3, 4, 5].map((i) => (
    <span key={i} className={`text-[9px] ${i <= n ? 'text-amber-400' : 'text-gray-300'}`}>&#9733;</span>
  ))
  return (
    <div className="flex gap-3 text-[10px]">
      {stars.i > 0 && <span className="flex items-center gap-0.5"><span className="text-gray-400 mr-0.5">I</span>{renderStars(stars.i)}</span>}
      {stars.p > 0 && <span className="flex items-center gap-0.5"><span className="text-gray-400 mr-0.5">P</span>{renderStars(stars.p)}</span>}
      {stars.s > 0 && <span className="flex items-center gap-0.5"><span className="text-gray-400 mr-0.5">S</span>{renderStars(stars.s)}</span>}
    </div>
  )
}

const faqItems = [
  { q: 'What is YokeBot?', a: 'YokeBot is an AI agent workforce platform. You create agents, assign them tasks and goals, and they work autonomously on a heartbeat schedule — checking in, taking actions, and reporting back. Think of it as hiring tireless AI employees.' },
  { q: 'What are credits?', a: 'Universal credits cover all usage on the platform: LLM heartbeats, media generation (images, video, 3D), and skill execution (web search, email, etc.). Your subscription includes monthly credits, and you can buy additional credit packs that never expire.' },
  { q: 'Can I self-host?', a: 'Yes! YokeBot is open-source (AGPLv3). You can self-host on your own hardware with your own API keys for free forever. The cloud version adds managed hosting, billing, and team features.' },
  { q: 'What models are available?', a: 'We offer 12+ models ranging from budget (Gemma 3 at 5 credits/heartbeat) to frontier (Qwen 3.5 at 75 credits/heartbeat), plus image, video, and 3D generation models. Each model has star ratings for Intelligence, Power, and Speed to help you choose.' },
  { q: 'How do agents work?', a: 'Each agent runs on a check-in cycle. Every check-in (configurable from 5 min to 1 hour), the agent reviews its tasks, goals, and messages, then takes autonomous action using its assigned tools and skills. You set their work schedule — part-time, full-time, or always-on — and they operate within that window, just like a real team member.' },
  { q: 'Is my data safe?', a: 'Absolutely. With the self-hosted option, no data ever leaves your servers. On the cloud version, all data is encrypted in transit and at rest, and we never train on your data.' },
  { q: 'Can I bring my own API keys?', a: 'Yes! BYOK (Bring Your Own Key) skills cost 0 credits — you pay your provider directly. Self-hosted users always use their own keys for everything.' },
]

export function HomePage() {
  const navigate = useNavigate()
  const goToLogin = () => navigate('/login')
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [mobileNav, setMobileNav] = useState(false)

  return (
    <div className="relative min-h-screen flex flex-col overflow-x-hidden bg-white text-text-main font-body selection:bg-accent-gold/30 selection:text-forest-green">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full glass-panel">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 xl:px-12">
          <div className="flex cursor-pointer items-center gap-3 group">
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
            <button onClick={goToLogin} className="primary-btn hidden sm:inline-flex rounded-lg border border-transparent bg-forest-green px-5 py-2.5 text-sm font-bold text-white shadow-lg hover:shadow-forest-green/20 hover:bg-forest-green-hover">
              Start Free
            </button>
            {/* Mobile hamburger */}
            <button onClick={() => setMobileNav(!mobileNav)} className="md:hidden rounded-lg p-1.5 text-text-muted hover:bg-light-surface-alt hover:text-text-main transition-colors">
              <span className="material-symbols-outlined text-[24px]">{mobileNav ? 'close' : 'menu'}</span>
            </button>
          </div>
        </div>
        {/* Mobile nav dropdown */}
        {mobileNav && (
          <div className="md:hidden border-t border-border-subtle bg-white/95 backdrop-blur-md px-6 py-4 space-y-3">
            {[
              { label: 'Features', href: '#features' },
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
        {/* Hero — dark background */}
        <section className="relative px-6 pb-32 pt-20 xl:px-24 2xl:px-48 bg-gray-950">
          <ParticleConstellation />
          <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-2">
            <div className="flex max-w-2xl flex-col gap-8">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 shadow-sm">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
                </span>
                <span className="font-mono text-xs font-medium uppercase tracking-wider text-green-400">24/7 Team Members</span>
              </div>
              <div className="space-y-4">
                <h1 className="font-display text-6xl font-bold leading-[0.9] tracking-tight text-white md:text-7xl lg:text-8xl">
                  Build Your <br />
                  <span className="bg-gradient-to-r from-forest-green via-green-400 to-accent-gold bg-clip-text text-transparent">AI Workforce</span>
                </h1>
                <p className="max-w-lg border-l-4 border-accent-gold py-2 pl-6 text-lg leading-relaxed text-gray-400 md:text-xl">
                  Deploy a team of AI agents who work together to scale your business. Your new specialists plan ahead, collaborate &amp; fully execute on their own.
                </p>
              </div>
              <div className="flex flex-col gap-4 pt-4 sm:flex-row">
                <button onClick={goToLogin} className="primary-btn group flex h-14 items-center justify-center gap-2 rounded-lg bg-forest-green px-8 font-display text-lg font-bold text-white shadow-xl shadow-forest-green/15 hover:bg-forest-green-hover">
                  Start Free
                  <span className="material-symbols-outlined text-white transition-transform group-hover:translate-x-1">arrow_forward</span>
                </button>
                <button className="flex h-14 items-center justify-center gap-2 rounded-lg border border-gray-600 bg-gray-900 px-8 font-display text-lg font-medium text-gray-300 shadow-sm transition-all hover:scale-105 hover:border-forest-green hover:text-forest-green hover:shadow-md">
                  Watch Demo
                  <span className="material-symbols-outlined">play_circle</span>
                </button>
              </div>
              <div className="flex items-center gap-6 pt-4 text-sm text-gray-400">
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
              <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-tr from-forest-green/10 to-accent-gold/10 blur-[80px]" />
              <div className="relative z-10 grid grid-cols-2 gap-4">
                {agentCards.map((card) => (
                  <div key={card.name} className={`agent-card group flex cursor-default flex-col gap-3 rounded-xl border border-gray-700 bg-gray-900/80 p-4 transition-all duration-300 ${card.hidden ?? ''}`}>
                    <div className="flex items-center justify-between">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-lg border ${card.bg} ${card.text} ${card.border} ${card.hoverBg} group-hover:text-white transition-colors`}>
                        <span className="material-symbols-outlined">{card.icon}</span>
                      </div>
                      <div className="flex items-center gap-1.5 rounded-full border border-green-800 bg-green-900/50 px-2 py-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500 live-indicator-pulse" />
                        <span className="font-mono text-[10px] font-bold uppercase tracking-wide text-green-400">LIVE</span>
                      </div>
                    </div>
                    <div>
                      <h3 className="font-display text-base font-bold leading-tight text-white">{card.name}</h3>
                      <p className="mt-1 text-xs text-gray-400">{card.role}</p>
                    </div>
                    <div className="mt-auto border-t border-gray-700 pt-3">
                      <div className="flex items-center gap-2 rounded bg-gray-800 px-2 py-1.5 font-mono text-xs text-gray-300">
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

        {/* Dot grid for remaining sections */}
        <div
          className="fixed inset-0 z-0 pointer-events-none opacity-40"
          style={{ backgroundImage: 'radial-gradient(#E5E7EB 1px, transparent 1px)', backgroundSize: '32px 32px' }}
        />

        {/* Features strip */}
        <section id="features" className="relative z-10 border-t border-gray-200 bg-light-bg">
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
        <section id="models" className="relative z-10 overflow-hidden border-y border-gray-200 bg-white py-16">
          <div className="organic-shader" />
          <div className="relative z-10 mx-auto mb-10 max-w-7xl px-6 text-center">
            <div className="mb-3 inline-flex items-center gap-2">
              <span className="rounded-full border border-green-100 bg-green-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-forest-green">12+ Models</span>
            </div>
            <h2 className="mb-4 font-display text-3xl font-bold text-text-main md:text-4xl">The Engine Behind Your Workforce</h2>
            <p className="mx-auto max-w-2xl text-lg text-text-muted">
              Don't get locked in. Switch between budget and frontier models to optimize for cost, speed, or intelligence.
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
                  <div className="mt-3 border-t border-gray-200 pt-3">
                    <StarRow stars={card.stars} />
                    <p className="mt-1 text-[11px] text-text-muted">{card.credits} credits/use</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Choose Your Path */}
        <section className="relative z-10 bg-light-bg px-6 py-20 xl:px-24 2xl:px-48">
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
                  <p className="mb-2 text-sm font-medium text-forest-green">From $29/mo</p>
                  <p className="mb-8 flex-grow text-text-muted">The fastest way to scale. Hosted by us, managed for you. Universal credits cover all usage — LLM, media, and skills.</p>
                  <button onClick={goToLogin} className="primary-btn flex w-full items-center justify-center gap-2 rounded-lg bg-forest-green py-3.5 font-bold text-white shadow-md transition-all hover:bg-forest-green-hover hover:shadow-lg">
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
                  <p className="mb-2 text-sm font-medium text-text-muted">Free forever</p>
                  <p className="mb-8 flex-grow text-gray-500">Self-host on your own hardware. Full privacy, full control, bring your own API keys. Contribute to the core engine powering the future of work.</p>
                  <a href="https://github.com/yokebots/yokebot" target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-center gap-2 rounded-lg border border-transparent bg-gray-200 py-3.5 font-bold text-gray-600 transition-all hover:scale-105 hover:bg-gray-300">
                    View on GitHub
                    <span className="material-symbols-outlined text-sm">open_in_new</span>
                  </a>
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
        <section id="pricing" className="relative z-10 bg-white px-6 py-24 xl:px-24 2xl:px-48">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
          <div className="mx-auto max-w-7xl">
            <div className="mb-16 text-center">
              <h2 className="mb-4 font-display text-3xl font-bold text-text-main md:text-5xl">Build Your Team</h2>
              <p className="mx-auto max-w-xl text-text-muted">Start with a couple of part-timers and scale to a full 24/7 workforce. Onboard new team members in minutes, not weeks.</p>
            </div>
            <div className="grid items-center gap-8 md:grid-cols-3">
              {/* Team */}
              <div className="pricing-card-hover group relative flex flex-col rounded-xl border border-border-subtle bg-white p-8 transition-all duration-300 hover:border-forest-green/30" style={{ boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)' }}>
                <h3 className="mb-1 font-display text-xl font-bold text-text-main">Starter Crew</h3>
                <p className="mb-4 text-xs text-text-muted">Hire your first part-time team members</p>
                <div className="mb-6 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-text-main">$29</span>
                  <span className="text-text-muted">/mo</span>
                </div>
                <ul className="mb-4 flex-1 space-y-4">
                  {['3 Agent Team Members', '30-Min Heartbeat Interval', 'Part-Time Availability', '50,000 Universal Credits/Mo'].map((f) => (
                    <li key={f} className="flex items-center gap-3 text-sm text-text-main">
                      <span className="material-symbols-outlined text-lg text-accent-gold-dim">check</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="group/tip relative mb-6 inline-flex items-center gap-1 cursor-help">
                  <span className="material-symbols-outlined text-accent-gold text-[14px]">schedule</span>
                  <span className="text-[12px] font-bold text-accent-gold-dim">Avg 64 work hrs/week</span>
                  <span className="material-symbols-outlined text-[12px] text-text-muted">info</span>
                  <div className="absolute bottom-full left-0 mb-1 hidden group-hover/tip:block z-10 w-56 rounded-lg border border-border-subtle bg-white p-2 text-[11px] text-text-muted shadow-lg">
                    Based on 2 agents working 16 hrs/day at 30-min heartbeats
                  </div>
                </div>
                <button onClick={goToLogin} className="w-full rounded-lg border border-gray-300 bg-gray-50 py-3 font-bold text-text-main transition-colors hover:border-accent-gold hover:bg-white hover:text-accent-gold-dim">Start Onboarding</button>
              </div>
              {/* Business — popular */}
              <div className="pricing-card-hover relative z-10 flex scale-105 flex-col rounded-xl border border-accent-gold/50 bg-white p-8 shadow-2xl shadow-accent-gold/10" style={{ boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03), 0 25px 50px -12px rgba(212, 160, 23, 0.15)' }}>
                <div className="absolute right-0 top-0 rounded-bl-lg rounded-tr-lg bg-accent-gold px-3 py-1 text-xs font-bold text-white">POPULAR</div>
                <h3 className="mb-1 font-display text-xl font-bold text-text-main">Growth Crew</h3>
                <p className="mb-4 text-xs text-text-muted">A full-time team that never calls in sick</p>
                <div className="mb-6 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-text-main">$59</span>
                  <span className="text-text-muted">/mo</span>
                </div>
                <ul className="mb-4 flex-1 space-y-4">
                  {['9 Agent Team Members', '15-Min Heartbeat Interval', 'Full-Time Availability', '150,000 Universal Credits/Mo'].map((f) => (
                    <li key={f} className="flex items-center gap-3 text-sm text-text-main">
                      <span className="material-symbols-outlined text-lg text-accent-gold-dim">check</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="group/tip relative mb-6 inline-flex items-center gap-1 cursor-help">
                  <span className="material-symbols-outlined text-accent-gold text-[14px]">schedule</span>
                  <span className="text-[12px] font-bold text-accent-gold-dim">Avg 840 work hrs/week</span>
                  <span className="material-symbols-outlined text-[12px] text-text-muted">info</span>
                  <div className="absolute bottom-full left-0 mb-1 hidden group-hover/tip:block z-10 w-56 rounded-lg border border-border-subtle bg-white p-2 text-[11px] text-text-muted shadow-lg">
                    Based on 5 agents working 24/7 at 15-min heartbeats
                  </div>
                </div>
                <button onClick={goToLogin} className="primary-btn w-full rounded-lg bg-forest-green py-3 font-bold text-white shadow-lg shadow-forest-green/20 transition-colors hover:bg-forest-green-hover">Start Onboarding</button>
              </div>
              {/* Enterprise */}
              <div className="pricing-card-hover group relative flex flex-col rounded-xl border border-border-subtle bg-white p-8 transition-all duration-300 hover:border-forest-green/30" style={{ boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)' }}>
                <h3 className="mb-1 font-display text-xl font-bold text-text-main">Power Crew</h3>
                <p className="mb-4 text-xs text-text-muted">An always-on workforce that never sleeps</p>
                <div className="mb-6 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-text-main">$149</span>
                  <span className="text-text-muted">/mo</span>
                </div>
                <ul className="mb-4 flex-1 space-y-4">
                  {['30 Agent Team Members', '5-Min Heartbeat Interval', '24/7 Always Available', '500,000 Universal Credits/Mo'].map((f) => (
                    <li key={f} className="flex items-center gap-3 text-sm text-text-main">
                      <span className="material-symbols-outlined text-lg text-accent-gold-dim">check</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="group/tip relative mb-6 inline-flex items-center gap-1 cursor-help">
                  <span className="material-symbols-outlined text-accent-gold text-[14px]">schedule</span>
                  <span className="text-[12px] font-bold text-accent-gold-dim">Avg 2,520 work hrs/week</span>
                  <span className="material-symbols-outlined text-[12px] text-text-muted">info</span>
                  <div className="absolute bottom-full left-0 mb-1 hidden group-hover/tip:block z-10 w-56 rounded-lg border border-border-subtle bg-white p-2 text-[11px] text-text-muted shadow-lg">
                    Based on 15 agents working 24/7 at 5-min heartbeats
                  </div>
                </div>
                <button onClick={goToLogin} className="w-full rounded-lg border border-gray-300 bg-gray-50 py-3 font-bold text-text-main transition-colors hover:border-accent-gold hover:bg-white hover:text-accent-gold-dim">Start Onboarding</button>
              </div>
            </div>
          </div>
        </section>

        {/* Testimonial */}
        <section className="relative z-10 overflow-hidden border-t border-gray-200 bg-light-bg px-6 py-24 xl:px-24 2xl:px-48">
          <div className="relative mx-auto max-w-4xl text-center">
            <span className="pointer-events-none absolute -left-10 -top-10 -z-10 select-none font-display text-[120px] leading-none text-gray-200 opacity-60">"</span>
            <h2 className="relative z-10 mb-8 font-display text-2xl font-bold leading-tight text-text-main md:text-3xl">
              "Humans scope their vision. AdvisorBot runs point on OPS. Agent Specialists collab with each other in Team Chat and Task Manager. They create &amp; assign tasks, conduct meetings if needed, set deadlines, and accomplish goals 24/7."
            </h2>
            <div className="flex items-center justify-center gap-4">
              <div className="relative h-14 w-14 overflow-hidden rounded-full border-2 border-forest-green bg-gray-100 shadow-lg">
                <div className="flex h-full w-full items-center justify-center bg-forest-green/10 font-display text-lg font-bold text-forest-green">JW</div>
              </div>
              <div className="text-left">
                <div className="font-display text-lg font-bold text-text-main">James Wolf</div>
                <div className="font-mono text-xs font-bold uppercase tracking-wide text-accent-gold-dim">FOUNDER @ YOKEBOT</div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="relative z-10 bg-white px-6 py-24 xl:px-24 2xl:px-48">
          <div className="mx-auto max-w-3xl">
            <div className="mb-12 text-center">
              <h2 className="mb-4 font-display text-3xl font-bold text-text-main md:text-4xl">Frequently Asked Questions</h2>
              <p className="text-text-muted">Everything you need to know about YokeBot.</p>
            </div>
            <div className="space-y-3">
              {faqItems.map((item, idx) => (
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

        {/* CTA Section */}
        <section className="relative px-6 py-24 xl:px-12 bg-forest-green">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="font-display text-4xl font-bold tracking-tight text-white md:text-5xl">
              Meet Your New Team Members
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-white/80">
              Deploy an entire AI workforce in under 5 minutes. No credit card required — just results.
            </p>
            <div className="mt-8">
              <button
                onClick={goToLogin}
                className="inline-flex items-center gap-2 rounded-xl bg-accent-gold px-8 py-4 text-lg font-bold text-white shadow-lg hover:bg-accent-gold-dim transition-colors"
              >
                Start Free
                <span className="material-symbols-outlined text-[22px]">arrow_forward</span>
              </button>
            </div>
            <p className="mt-4 text-sm text-white/60">
              Every new hosted account at yokebot.com gets 1,250 credits free to start.
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer id="contact" className="relative z-10 border-t border-gray-200 bg-white px-6 pb-12 pt-16 xl:px-12">
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
                { label: 'Features', href: '#features' },
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

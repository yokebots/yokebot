import { useNavigate } from 'react-router'
import { MarketingLayout, FeatureCta } from '@/layouts/MarketingLayout'

const features = [
  { slug: 'agents', icon: 'smart_toy', title: 'AI Agents', desc: 'Deploy intelligent digital workers that learn, adapt, and execute tasks autonomously.' },
  { slug: 'tasks', icon: 'task_alt', title: 'Task Management', desc: 'Orchestrate your digital workforce with timelines, approvals, and priority management.' },
  { slug: 'team-chat', icon: 'forum', title: 'Team Chat', desc: 'Human-AI collaboration perfected. Real-time messaging with context that never gets lost.' },
  { slug: 'goals', icon: 'flag', title: 'Goals & KPIs', desc: 'Set the destination and let your agents find the way. Strategic alignment on autopilot.' },
  { slug: 'workspace', icon: 'folder_open', title: 'Workspace', desc: 'Your shared brain. Data tables, documents, and knowledge — all connected and searchable.' },
  { slug: 'meetings', icon: 'groups', title: 'Meetings', desc: 'Real-time voice collaboration with your AI team. Push-to-talk, raise your hand, and hear agents think.' },
]

export function FeaturesIndexPage() {
  const navigate = useNavigate()

  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="relative px-6 pb-20 pt-20 xl:px-24 bg-gray-950">
        <div
          className="absolute inset-0 z-0 pointer-events-none opacity-20"
          style={{ backgroundImage: 'radial-gradient(#4B5563 1px, transparent 1px)', backgroundSize: '32px 32px' }}
        />
        <div className="relative z-10 mx-auto max-w-4xl text-center">
          <span className="mb-4 inline-block rounded-full border border-green-500/30 bg-green-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-green-400">
            Platform Features
          </span>
          <h1 className="font-display text-4xl font-bold tracking-tight text-white md:text-5xl lg:text-6xl">
            Everything You Need to<br /><span className="text-green-400">Run an AI Workforce</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-400">
            From agent deployment to goal tracking, YokeBot gives you the full stack to hire, manage, and scale AI workers across your entire business.
          </p>
        </div>
      </section>

      {/* Feature Cards Grid */}
      <section className="px-6 py-24 xl:px-12">
        <div className="mx-auto max-w-6xl grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <button
              key={f.slug}
              onClick={() => navigate(`/features/${f.slug}`)}
              className="group text-left rounded-2xl border border-border-subtle bg-white p-8 shadow-sm hover:shadow-md hover:border-forest-green/30 transition-all"
            >
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-forest-green/10 text-forest-green group-hover:bg-forest-green group-hover:text-white transition-colors">
                <span className="material-symbols-outlined text-[28px]">{f.icon}</span>
              </div>
              <h3 className="text-xl font-bold text-text-main">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{f.desc}</p>
              <div className="mt-4 flex items-center gap-1 text-sm font-medium text-forest-green">
                Learn more
                <span className="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform">arrow_forward</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <FeatureCta
        title="Meet Your New Team Members"
        description="Deploy an entire AI workforce in under 5 minutes. No credit card required — just results."
      />
    </MarketingLayout>
  )
}

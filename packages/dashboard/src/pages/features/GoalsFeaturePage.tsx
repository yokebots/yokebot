import { useNavigate } from 'react-router'
import { MarketingLayout, FeatureHero, FeatureCta } from '@/layouts/MarketingLayout'

export function GoalsFeaturePage() {
  const navigate = useNavigate()
  const goToLogin = () => navigate('/login')

  return (
    <MarketingLayout>
      <FeatureHero
        badge="Automated Planning"
        title="Set the Destination."
        titleAccent="Your Agents Find the Way."
        description="Define your KPI targets and watch as your autonomous agents create and execute action plans to meet them. Strategic alignment has never been this effortless."
        primaryCta={{ label: 'Start Setting Goals', onClick: goToLogin }}
        secondaryCta={{ label: 'View Hierarchy Demo', onClick: () => {} }}
      >
        {/* Hero right — goal cards */}
        <div className="space-y-3">
          {[
            { icon: 'flag', title: 'Target Goal', value: '$2.5M Q3 Revenue', color: 'green' },
            { icon: 'smart_toy', title: 'Agent Alpha: Outreach Campaign', status: 'Running', color: 'blue' },
            { icon: 'smart_toy', title: 'Agent Beta: Lead Scoring', status: 'Complete', color: 'amber' },
            { icon: 'smart_toy', title: 'Agent Gamma: OKR Scheduling', status: 'Queued', color: 'purple' },
          ].map((card, i) => (
            <div key={i} className="flex items-center gap-4 rounded-xl border border-gray-700 bg-gray-800/60 backdrop-blur-sm px-5 py-3">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-${card.color}-500/20`}>
                <span className={`material-symbols-outlined text-[18px] text-${card.color}-400`}>{card.icon}</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">{card.title}</p>
                <p className="text-xs text-gray-400">{card.value || card.status}</p>
              </div>
            </div>
          ))}
        </div>
      </FeatureHero>

      {/* Performance at a Glance */}
      <section className="px-6 py-24 xl:px-12">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <span className="text-xs font-bold uppercase tracking-wider text-forest-green">Live Metrics</span>
            <h2 className="mt-3 font-display text-3xl font-bold text-text-main md:text-4xl">Performance at a Glance</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { icon: 'payments', label: 'Monthly Revenue', value: '$124,500', change: '+14% vs last month', changeColor: 'text-green-600', sparkColor: 'bg-green-500' },
              { icon: 'sentiment_satisfied', label: 'Customer Satisfaction', value: '4.8/5.0', change: '+0.3 pts', changeColor: 'text-green-600', sparkColor: 'bg-blue-500' },
              { icon: 'group_add', label: 'New Leads', value: '1,240', change: '+220 this week', changeColor: 'text-green-600', sparkColor: 'bg-amber-500' },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-2xl border border-border-subtle bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-[20px] text-text-muted">{kpi.icon}</span>
                  <span className="text-sm font-medium text-text-muted">{kpi.label}</span>
                </div>
                <p className="text-3xl font-bold text-text-main">{kpi.value}</p>
                <p className={`mt-1 text-sm font-medium ${kpi.changeColor}`}>{kpi.change}</p>
                <div className="mt-4 flex gap-1 items-end h-8">
                  {[40, 55, 45, 60, 50, 70, 65, 80, 75, 90].map((h, i) => (
                    <div key={i} className={`flex-1 rounded-sm ${kpi.sparkColor} opacity-60`} style={{ height: `${h}%` }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Goal-to-Task Hierarchy */}
      <section className="px-6 py-24 xl:px-12 bg-gray-50">
        <div className="mx-auto max-w-6xl grid gap-16 lg:grid-cols-2 items-center">
          <div>
            <h2 className="font-display text-3xl font-bold text-text-main md:text-4xl">Goal-to-Task Hierarchy</h2>
            <p className="mt-4 text-lg text-text-secondary">
              Visualize how high-level strategic goals decompose into specific, actionable steps assigned to your AI workforce. Ensure every action aligns with your vision.
            </p>
            <div className="mt-8 space-y-6">
              {[
                { icon: 'star', level: 'Strategic Goal', desc: 'High-level business objectives and revenue milestones.' },
                { icon: 'account_tree', level: 'Tactical Plan', desc: 'Agent-executable tasks broken into key milestones.' },
                { icon: 'bolt', level: 'Execution', desc: 'Individual tasks are executed autonomously by agents.' },
              ].map((item) => (
                <div key={item.level} className="flex gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest-green/10 text-forest-green">
                    <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-text-main">{item.level}</h3>
                    <p className="mt-1 text-sm text-text-muted">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Hierarchy visual */}
          <div className="space-y-4">
            <div className="rounded-xl border border-border-subtle bg-white p-5 shadow-sm">
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">Strategic</span>
              <p className="mt-2 font-bold text-text-main">Increase Market Share by 15%</p>
            </div>
            <div className="ml-8 grid gap-3 md:grid-cols-2">
              {[
                { label: 'Launch Product X', tag: 'Tactical', color: 'blue' },
                { label: 'Expand Sales Team', tag: 'Tactical', color: 'blue' },
              ].map((t) => (
                <div key={t.label} className="rounded-xl border border-border-subtle bg-white p-4 shadow-sm">
                  <span className={`rounded-full bg-${t.color}-100 px-3 py-1 text-xs font-bold text-${t.color}-700`}>{t.tag}</span>
                  <p className="mt-2 text-sm font-semibold text-text-main">{t.label}</p>
                </div>
              ))}
            </div>
            <div className="ml-16 grid gap-3 md:grid-cols-3">
              {['Market Research', 'Competitor Scanning', 'A/B Testing'].map((t) => (
                <div key={t} className="rounded-lg border border-border-subtle bg-gray-50 p-3 text-center">
                  <span className="text-xs font-medium text-text-muted">{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Strategic Milestones */}
      <section className="px-6 py-24 xl:px-12">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between mb-12">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-forest-green">Roadmap</span>
              <h2 className="mt-2 font-display text-3xl font-bold text-text-main">Strategic Milestones</h2>
            </div>
            <button className="text-sm font-medium text-forest-green hover:underline">View Full Timeline &rarr;</button>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { title: 'Q1 Roadmap', tag: 'Strategic', progress: 75, tasks: ['Product Dev', 'QA Testing', 'Deployment'] },
              { title: 'Product Launch', tag: 'Tactical', progress: 45, tasks: ['Marketing Assets', 'Press Release', 'Launch Planning'] },
              { title: 'Market Expansion', tag: 'Strategic', progress: 12, tasks: ['Region Analysis', 'Partner Outreach', 'Localization'] },
            ].map((milestone) => (
              <div key={milestone.title} className="rounded-2xl border border-border-subtle bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-text-main">{milestone.title}</h3>
                  <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-700">{milestone.tag}</span>
                </div>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-3xl font-bold text-text-main">{milestone.progress}%</span>
                  <span className="text-sm text-text-muted">done</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 mb-4">
                  <div className="h-2 rounded-full bg-forest-green" style={{ width: `${milestone.progress}%` }} />
                </div>
                <div className="space-y-2">
                  {milestone.tasks.map((task) => (
                    <div key={task} className="flex items-center gap-2 text-sm text-text-muted">
                      <span className="material-symbols-outlined text-[14px]">radio_button_unchecked</span>
                      {task}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team Velocity Score */}
      <section className="px-6 py-24 xl:px-12 bg-gray-50">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-2xl border border-border-subtle bg-white p-10 shadow-lg flex flex-col md:flex-row items-center gap-10">
            <div className="flex-1">
              <h2 className="font-display text-2xl font-bold text-text-main">Team Velocity Score</h2>
              <p className="mt-2 text-text-secondary">
                Your autonomous workforce is performing above benchmarks this week. Agent throughput, task completion rate, and goal alignment are all trending positive.
              </p>
            </div>
            <div className="text-center">
              <div className="relative flex h-32 w-32 items-center justify-center rounded-full border-8 border-forest-green">
                <span className="text-4xl font-bold text-text-main">94</span>
                <span className="absolute -bottom-1 text-xs text-text-muted">/100</span>
              </div>
              <p className="mt-3 text-sm font-bold text-green-600">Excellent</p>
              <p className="text-xs text-text-muted">Last 7 days</p>
            </div>
          </div>
        </div>
      </section>

      <FeatureCta
        title="Set It. Forget It. Achieve It."
        description="Define your targets once. Your agents break them into tasks, execute, and track progress automatically."
      />
    </MarketingLayout>
  )
}

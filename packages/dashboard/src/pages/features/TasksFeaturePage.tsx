import { useNavigate } from 'react-router'
import { MarketingLayout, FeatureHero, FeatureCta } from '@/layouts/MarketingLayout'

export function TasksFeaturePage() {
  const navigate = useNavigate()
  const goToLogin = () => navigate('/login')

  return (
    <MarketingLayout>
      <FeatureHero
        badge="Tasks & Workflow"
        title="Orchestrate Your"
        titleAccent="Digital Workforce"
        description="Move beyond simple to-do lists. Visualize complex workflows where AI agents and humans collaborate seamlessly via a unified Kanban board."
        primaryCta={{ label: 'Start Free Trial', onClick: goToLogin }}
        secondaryCta={{ label: 'Watch Demo', onClick: () => {} }}
      />

      {/* Master Your Timeline */}
      <section className="px-6 py-24 xl:px-12">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="font-display text-3xl font-bold text-text-main md:text-4xl">Master Your Timeline</h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-text-secondary">
              Stay ahead of deadlines with our interactive timeline view that visualizes agent task schedules and human milestones in a unified scrolling grid.
            </p>
          </div>

          {/* Timeline mockup */}
          <div className="rounded-2xl border border-border-subtle bg-white shadow-xl overflow-hidden">
            <div className="border-b border-border-subtle bg-gray-50 px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-text-main">October 2025</h3>
              <div className="flex gap-2">
                <button className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-medium text-text-muted">&larr;</button>
                <button className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-medium text-text-muted">&rarr;</button>
              </div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-7 gap-2 text-center text-xs font-medium text-text-muted mb-4">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: 35 }, (_, i) => {
                  const day = i - 2
                  const hasEvent = [3, 7, 12, 15, 21, 28].includes(day)
                  return (
                    <div key={i} className={`rounded-lg p-2 text-center text-sm ${day < 1 || day > 31 ? 'text-gray-300' : hasEvent ? 'bg-forest-green/10 text-forest-green font-bold' : 'text-text-secondary hover:bg-gray-50'}`}>
                      {day >= 1 && day <= 31 ? day : ''}
                      {hasEvent && <div className="mt-1 h-1 w-1 mx-auto rounded-full bg-forest-green" />}
                    </div>
                  )
                })}
              </div>
            </div>
            {/* Timeline events sidebar */}
            <div className="border-t border-border-subtle p-6 space-y-3">
              {[
                { icon: 'check_circle', color: 'text-green-600', title: 'Updated Timeline', desc: 'ResearchBot completed market analysis', time: '2h ago' },
                { icon: 'priority_high', color: 'text-amber-600', title: 'Deadline Approaching', desc: 'Q4 content calendar due in 3 days', time: '5h ago' },
              ].map((event, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className={`material-symbols-outlined text-[20px] ${event.color}`}>{event.icon}</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-text-main">{event.title}</p>
                    <p className="text-xs text-text-muted">{event.desc}</p>
                  </div>
                  <span className="text-xs text-text-muted">{event.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Deep Dive into Every Task */}
      <section className="px-6 py-24 xl:px-12 bg-gray-50">
        <div className="mx-auto max-w-6xl grid gap-16 lg:grid-cols-2 items-center">
          <div>
            <h2 className="font-display text-3xl font-bold text-text-main md:text-4xl">Deep Dive into Every Task</h2>
            <p className="mt-4 text-lg text-text-secondary">
              Experience total visibility. Every task layer includes rich markdown support, real-time status updates, and automated agent collaboration logging.
            </p>
            <div className="mt-8 space-y-4">
              {[
                { icon: 'stacks', label: 'Full Markdown Support' },
                { icon: 'live_tv', label: 'Live Agent Chat Integration' },
                { icon: 'timeline', label: 'Complete Audit Log' },
              ].map((f) => (
                <div key={f.label} className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[20px] text-forest-green">{f.icon}</span>
                  <span className="text-sm font-medium text-text-main">{f.label}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Task detail mockup */}
          <div className="rounded-2xl border border-border-subtle bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-text-main">Refactor Auth Service</h3>
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">In Progress</span>
            </div>
            <div className="space-y-3 text-sm">
              {[
                { done: true, label: 'Need to migrate the legacy authentication module' },
                { done: true, label: 'Review current JWT implementation' },
                { done: false, label: 'Implement refresh token rotation' },
                { done: false, label: 'Run integration tests' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className={`material-symbols-outlined text-[18px] ${item.done ? 'text-green-500' : 'text-gray-300'}`}>
                    {item.done ? 'check_box' : 'check_box_outline_blank'}
                  </span>
                  <span className={item.done ? 'text-text-muted line-through' : 'text-text-main'}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Approvals Made Simple */}
      <section className="px-6 py-24 xl:px-12">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="font-display text-3xl font-bold text-text-main md:text-4xl">Approvals Made Simple</h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-text-secondary">
              Stay firmly in the loop. Review agent analysis and decide with a single click.
            </p>
          </div>
          <div className="mx-auto max-w-2xl rounded-2xl border border-border-subtle bg-white p-8 shadow-lg">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-[20px] text-amber-500">warning</span>
              <span className="text-sm font-bold text-amber-600">Pending Approval Request</span>
            </div>
            <h3 className="text-lg font-bold text-text-main mb-2">Blog Post Draft: "The Future of AI"</h3>
            <p className="text-sm text-text-muted mb-6">
              ContentBot has synthesized market research, brand voice guidelines, and trending topics to produce a comprehensive 2,400 word article ready for review and publication.
            </p>
            <div className="flex gap-3">
              <button className="rounded-lg bg-forest-green px-6 py-2.5 text-sm font-bold text-white">Approve & Publish</button>
              <button className="rounded-lg border border-border-subtle px-6 py-2.5 text-sm font-medium text-text-secondary">Request Edits</button>
              <button className="rounded-lg border border-red-200 px-6 py-2.5 text-sm font-medium text-red-600">Reject</button>
            </div>
          </div>
        </div>
      </section>

      {/* Priority Management */}
      <section className="px-6 py-24 xl:px-12 bg-gray-50">
        <div className="mx-auto max-w-6xl grid gap-16 lg:grid-cols-2 items-center">
          <div>
            <h2 className="font-display text-3xl font-bold text-text-main md:text-4xl">Priority Management</h2>
            <p className="mt-4 text-lg text-text-secondary">
              Ensure the most critical tasks get attention first. Our dynamic priority system helps you rise from the noise with color-coded badges and intelligent sorting.
            </p>
            <div className="mt-8 space-y-3">
              {[
                { icon: 'check_circle', label: 'Critical issues bubble to the top automatically' },
                { icon: 'check_circle', label: 'Customizable priority rules per team or project' },
                { icon: 'check_circle', label: 'Visual indicators in all list views' },
              ].map((f) => (
                <div key={f.label} className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[20px] text-forest-green">{f.icon}</span>
                  <span className="text-sm text-text-secondary">{f.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            {[
              { priority: 'Urgent', color: 'red', title: 'Server outage recovery', agent: 'DevOpsBot' },
              { priority: 'High', color: 'amber', title: 'Client proposal deadline', agent: 'SalesBot' },
              { priority: 'Medium', color: 'blue', title: 'Weekly analytics report', agent: 'AnalystBot' },
              { priority: 'Low', color: 'gray', title: 'Documentation update', agent: 'ContentBot' },
            ].map((task) => (
              <div key={task.title} className="flex items-center gap-4 rounded-xl border border-border-subtle bg-white px-5 py-4 shadow-sm">
                <span className={`rounded-full bg-${task.color}-100 px-3 py-1 text-xs font-bold text-${task.color}-700`}>{task.priority}</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-text-main">{task.title}</p>
                  <p className="text-xs text-text-muted">{task.agent}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <FeatureCta
        title="Put Your Workflows on Autopilot"
        description="Assign tasks to AI agents the same way you would to a human. They plan, execute, and report back."
      />
    </MarketingLayout>
  )
}

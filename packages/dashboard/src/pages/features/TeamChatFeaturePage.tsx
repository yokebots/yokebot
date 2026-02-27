import { useNavigate } from 'react-router'
import { MarketingLayout, FeatureHero, FeatureCta } from '@/layouts/MarketingLayout'

export function TeamChatFeaturePage() {
  const navigate = useNavigate()
  const goToLogin = () => navigate('/login')

  return (
    <MarketingLayout>
      <FeatureHero
        badge="Team Communication"
        title="Human-AI Collaboration,"
        titleAccent="Perfected"
        description="Experience a chat interface where your team and AI agents work side-by-side. Every conversation is an immutable history of productivity that builds your organizational intelligence."
        primaryCta={{ label: 'Start for Free', onClick: goToLogin }}
        secondaryCta={{ label: 'View Demo', onClick: () => {} }}
      >
        {/* Chat preview */}
        <div className="rounded-2xl border border-gray-700 bg-gray-800/60 backdrop-blur-sm p-4 space-y-3">
          {[
            { name: 'AI Agent', icon: 'smart_toy', msg: 'I\'ve generated the Q4 forecast based on the latest CRM data.', isAgent: true },
            { name: 'You', icon: 'person', msg: 'Can you also pull competitor pricing?', isAgent: false },
            { name: 'AI Agent', icon: 'smart_toy', msg: 'On it. I\'ll cross-reference with our market intelligence tool.', isAgent: true },
          ].map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.isAgent ? '' : 'justify-end'}`}>
              {m.isAgent && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-500/20">
                  <span className="material-symbols-outlined text-[16px] text-green-400">{m.icon}</span>
                </div>
              )}
              <div className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${m.isAgent ? 'bg-gray-700 text-gray-200' : 'bg-green-600 text-white'}`}>
                {m.msg}
              </div>
            </div>
          ))}
        </div>
      </FeatureHero>

      {/* The Heartbeat of Your Company */}
      <section className="px-6 py-24 xl:px-12">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <span className="text-xs font-bold uppercase tracking-wider text-forest-green">The Command Center</span>
            <h2 className="mt-3 font-display text-3xl font-bold text-text-main md:text-4xl">The Heartbeat of Your Company</h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-text-secondary">
              Stay on the pulse of your organization. View the activity of your entire company in a single, high-density feed that combines human chat and AI actions into one powerful stream.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              { icon: 'bolt', title: 'Real-time Updates', desc: 'Instant notifications for critical updates across all channels and agent activity.' },
              { icon: 'merge_type', title: 'Unified Stream', desc: 'All activity — chat, tasks, approvals — in one consolidated, searchable feed.' },
              { icon: 'hub', title: 'Context Rich', desc: 'Click through to related tasks, knowledge documents, and agent activity logs.' },
            ].map((card) => (
              <div key={card.title} className="rounded-2xl border border-border-subtle bg-white p-8 shadow-sm text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-forest-green/10 text-forest-green">
                  <span className="material-symbols-outlined text-[28px]">{card.icon}</span>
                </div>
                <h3 className="text-lg font-bold text-text-main">{card.title}</h3>
                <p className="mt-2 text-sm text-text-muted">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Never Lose Context Again */}
      <section className="px-6 py-24 xl:px-12 bg-gray-50">
        <div className="mx-auto max-w-6xl grid gap-16 lg:grid-cols-2 items-center">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-forest-green">Message Threading</span>
            <h2 className="mt-3 font-display text-3xl font-bold text-text-main md:text-4xl">Never Lose Context Again</h2>
            <p className="mt-4 text-lg text-text-secondary">
              Conversations in YokeBot are tied directly to Tasks and Goals. This ensures that every message has a purpose and a place, eliminating the chaos of unstructured chat.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-4">
              {[
                { icon: 'anchor', label: 'Contextual Anchors', desc: 'Each thread links to its source task or goal.' },
                { icon: 'account_tree', label: 'Smart Threads', desc: 'Related messages automatically group together.' },
                { icon: 'archive', label: 'Auto-Archiving', desc: 'Completed threads archive cleanly.' },
                { icon: 'history', label: 'Message Log', desc: 'Full audit trail of every conversation.' },
              ].map((f) => (
                <div key={f.label}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="material-symbols-outlined text-[18px] text-forest-green">{f.icon}</span>
                    <span className="text-sm font-bold text-text-main">{f.label}</span>
                  </div>
                  <p className="text-xs text-text-muted">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
          {/* Thread preview */}
          <div className="rounded-2xl border border-border-subtle bg-white shadow-lg overflow-hidden">
            <div className="border-b border-border-subtle bg-gray-50 px-5 py-3">
              <p className="text-sm font-bold text-text-main">Q4 Marketing Strategy</p>
              <p className="text-xs text-text-muted">3 agents + 2 humans in thread</p>
            </div>
            <div className="p-5 space-y-4">
              {[
                { name: 'ResearchBot', msg: 'I\'ve completed the competitor analysis. 15 companies surveyed across 6 metrics.', time: '2:30 PM' },
                { name: 'Sarah', msg: 'Great, can you summarize the top 3 differentiators?', time: '2:32 PM' },
                { name: 'ResearchBot', msg: '1. We\'re 40% more affordable 2. Only platform with autonomous agents 3. Open-source transparency', time: '2:33 PM' },
              ].map((m, i) => (
                <div key={i} className="flex gap-3">
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${m.name === 'Sarah' ? 'bg-purple-100' : 'bg-forest-green/10'}`}>
                    <span className={`material-symbols-outlined text-[14px] ${m.name === 'Sarah' ? 'text-purple-600' : 'text-forest-green'}`}>
                      {m.name === 'Sarah' ? 'person' : 'smart_toy'}
                    </span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-text-main">{m.name}</span>
                      <span className="text-xs text-text-muted">{m.time}</span>
                    </div>
                    <p className="text-sm text-text-secondary mt-0.5">{m.msg}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Secure Messaging + Universal Search */}
      <section className="px-6 py-24 xl:px-12 bg-gray-950">
        <div className="mx-auto max-w-6xl grid gap-12 md:grid-cols-2">
          <div className="rounded-2xl border border-gray-700 bg-gray-800/60 p-8">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/20">
              <span className="material-symbols-outlined text-[24px] text-green-400">lock</span>
            </div>
            <h3 className="text-xl font-bold text-white">Secure Messaging</h3>
            <p className="mt-3 text-sm leading-relaxed text-gray-400">
              Your Team SmartBoard is private and secure. Enterprise-grade encryption ensures that your proprietary data, conversations, and AI interactions remain protected.
            </p>
            <div className="mt-6 space-y-3">
              {[
                { icon: 'encrypted', label: 'End-to-End Encryption', desc: 'All messages encrypted with AES-256.' },
                { icon: 'storage', label: 'Data Sovereignty', desc: 'Self-host option for complete data control.' },
              ].map((f) => (
                <div key={f.label} className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-[18px] text-green-400 mt-0.5">{f.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-white">{f.label}</p>
                    <p className="text-xs text-gray-500">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-gray-700 bg-gray-800/60 p-8">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/20">
              <span className="material-symbols-outlined text-[24px] text-blue-400">search</span>
            </div>
            <h3 className="text-xl font-bold text-white">Universal Search</h3>
            <p className="mt-3 text-sm leading-relaxed text-gray-400">
              Find specific messages, files shared in threads, or AI-generated summaries using our organization's knowledge graph for truly intelligent search.
            </p>
            <div className="mt-6 space-y-3">
              {[
                { icon: 'chat', label: 'Thread Search', desc: 'Filter by channel, agent, or date range.' },
                { icon: 'travel_explore', label: 'Semantic Search', desc: 'Search by meaning, not just keywords.' },
              ].map((f) => (
                <div key={f.label} className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-[18px] text-blue-400 mt-0.5">{f.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-white">{f.label}</p>
                    <p className="text-xs text-gray-500">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <FeatureCta
        title="Where Humans and AI Get Work Done"
        description="Every message between humans and agents is searchable, contextual, and never forgotten."
      />
    </MarketingLayout>
  )
}

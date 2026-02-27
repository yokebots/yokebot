import { useNavigate } from 'react-router'
import { MarketingLayout, FeatureHero, FeatureCta } from '@/layouts/MarketingLayout'

export function AgentsFeaturePage() {
  const navigate = useNavigate()
  const goToLogin = () => navigate('/login')

  return (
    <MarketingLayout>
      <FeatureHero
        badge="AI Agent Platform"
        title="Deploy Intelligent"
        titleAccent="Digital Workers"
        description="YokeBot Agents aren't just chatbots. They are autonomous decision engines capable of planning, executing, and refining complex workflows 24/7."
        primaryCta={{ label: 'Build First Agent', onClick: goToLogin }}
        secondaryCta={{ label: 'Watch the demo', onClick: () => {} }}
      >
        {/* Hero right side — agent cards preview */}
        <div className="relative space-y-3">
          {[
            { icon: 'person_search', name: 'Data Analyst', status: 'Analyzing Q3 reports...', color: 'blue' },
            { icon: 'support_agent', name: 'Outreach Lead', status: 'Sending follow-ups...', color: 'amber' },
            { icon: 'campaign', name: 'Brand Manager', status: 'Reviewing social copy', color: 'purple' },
          ].map((agent) => (
            <div key={agent.name} className="flex items-center gap-4 rounded-xl border border-gray-700 bg-gray-800/60 backdrop-blur-sm px-5 py-4">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-${agent.color}-500/20`}>
                <span className={`material-symbols-outlined text-[22px] text-${agent.color}-400`}>{agent.icon}</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">{agent.name}</p>
                <p className="text-xs text-gray-400">{agent.status}</p>
              </div>
              <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            </div>
          ))}
        </div>
      </FeatureHero>

      {/* Create Agents in Minutes */}
      <section className="px-6 py-24 xl:px-12">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <span className="text-xs font-bold uppercase tracking-wider text-forest-green">Intuitive Builder</span>
            <h2 className="mt-3 font-display text-3xl font-bold text-text-main md:text-4xl">Create Agents in Minutes</h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-text-secondary">
              Our intuitive builder lets you define personality, knowledge base, and permissions without writing a single line of code.
            </p>
          </div>

          {/* Agent builder mockup */}
          <div className="mx-auto max-w-4xl rounded-2xl border border-border-subtle bg-white shadow-xl overflow-hidden">
            <div className="border-b border-border-subtle bg-gray-50 px-6 py-4">
              <h3 className="text-lg font-bold text-text-main">Agent Identity</h3>
            </div>
            <div className="p-6 grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                {[
                  { label: 'Agent Name', value: 'Sales Development Rep', icon: 'badge' },
                  { label: 'Department', value: 'Sales & Revenue', icon: 'business' },
                  { label: 'Model', value: 'DeepSeek V3.2 (8 credits)', icon: 'psychology' },
                ].map((field) => (
                  <div key={field.label}>
                    <label className="text-xs font-medium text-text-muted uppercase tracking-wider">{field.label}</label>
                    <div className="mt-1 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                      <span className="material-symbols-outlined text-[18px] text-text-muted">{field.icon}</span>
                      <span className="text-sm text-text-main">{field.value}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <label className="text-xs font-medium text-text-muted uppercase tracking-wider">System Prompt</label>
                <div className="mt-1 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-text-secondary leading-relaxed h-[160px]">
                  You are a Sales Development Rep specializing in outbound prospecting. You research leads, craft personalized outreach messages, and qualify prospects before handing off to the closing team...
                </div>
                <div className="mt-4 flex gap-2">
                  <button className="rounded-lg bg-forest-green px-4 py-2 text-sm font-bold text-white">Test in Playground</button>
                  <button className="rounded-lg border border-border-subtle px-4 py-2 text-sm font-medium text-text-secondary">Save Draft</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* From Trigger to Resolution */}
      <section className="px-6 py-24 xl:px-12 bg-gray-50">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-16 lg:grid-cols-2 items-center">
            <div>
              <h2 className="font-display text-3xl font-bold text-text-main md:text-4xl">From Trigger to Resolution</h2>
              <p className="mt-4 text-lg text-text-secondary">
                Every agent follows a powerful Think-Plan-Act loop. Observe the status log as your agent steps through its reasoning infrastructure.
              </p>
              <div className="mt-10 space-y-8">
                {[
                  { step: 1, icon: 'sensors', title: 'Trigger & Perception', desc: 'Agent detects a new inbound email or message and kicks off a processing pipeline.' },
                  { step: 2, icon: 'psychology', title: 'Reasoning Engine', desc: 'The LLM plans its response by weighing all available context and tools.' },
                  { step: 3, icon: 'visibility', title: 'Root Observation', desc: 'Every step is observable and logged for transparency and compliance.' },
                  { step: 4, icon: 'school', title: 'Negotiation & Learning', desc: 'The agent is reinforced until the interaction is triaged for future learning.' },
                ].map((item) => (
                  <div key={item.step} className="flex gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest-green/10 text-forest-green">
                      <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                    </div>
                    <div>
                      <h3 className="font-bold text-text-main">{item.title}</h3>
                      <p className="mt-1 text-sm text-text-muted">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Right side — reasoning steps visual */}
            <div className="rounded-2xl border border-border-subtle bg-white p-6 shadow-lg">
              <div className="space-y-4">
                {[
                  { icon: 'mail', color: 'blue', label: 'New email received', detail: 'From: sarah@acme.com — Partnership inquiry', time: '10:23 AM' },
                  { icon: 'psychology', color: 'purple', label: 'Analyzing context', detail: 'Cross-referencing CRM data + email history...', time: '10:23 AM' },
                  { icon: 'edit_note', color: 'amber', label: 'Drafting response', detail: 'Personalized reply with meeting link', time: '10:24 AM' },
                  { icon: 'check_circle', color: 'green', label: 'Awaiting approval', detail: 'Human review required (medium risk)', time: '10:24 AM' },
                ].map((step, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-${step.color}-100`}>
                      <span className={`material-symbols-outlined text-[16px] text-${step.color}-600`}>{step.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-text-main">{step.label}</p>
                        <span className="text-xs text-text-muted">{step.time}</span>
                      </div>
                      <p className="text-xs text-text-muted mt-0.5">{step.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Team Roster */}
      <section className="px-6 py-24 xl:px-12">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between mb-12">
            <h2 className="font-display text-3xl font-bold text-text-main">Team Roster</h2>
            <button onClick={goToLogin} className="text-sm font-medium text-forest-green hover:underline">View Performance &rarr;</button>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { icon: 'support_agent', color: '#E53E3E', name: 'Support Sentinel', role: 'Customer Success', status: 'Resolving 3 tickets' },
              { icon: 'person_search', color: '#3182CE', name: 'LeadFinder', role: 'Sales Development', status: 'Qualifying 12 leads' },
              { icon: 'cleaning_services', color: '#38A169', name: 'Data Cleaner', role: 'Data Operations', status: 'Processing 500 records' },
            ].map((agent) => (
              <div key={agent.name} className="rounded-2xl border border-border-subtle bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ backgroundColor: `${agent.color}15`, color: agent.color }}>
                    <span className="material-symbols-outlined text-[24px]">{agent.icon}</span>
                  </div>
                  <div>
                    <p className="font-bold text-text-main">{agent.name}</p>
                    <p className="text-xs text-text-muted">{agent.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <span className="h-2 w-2 rounded-full bg-green-400" />
                  {agent.status}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Toolset Integration */}
      <section className="px-6 py-24 xl:px-12 bg-gray-50">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display text-3xl font-bold text-text-main text-center mb-4">Powerful Toolset Integration</h2>
          <p className="text-center text-lg text-text-secondary mb-12">Give your agents superpowers. Connect them to your existing stack with secure, managed integrations.</p>
          <div className="grid gap-6 md:grid-cols-2">
            {[
              { icon: 'person_search', title: 'Lead Enrichment', desc: 'Automatically pull data from LinkedIn, Clearbit, and dozens of sources to build rich lead profiles and prioritize outreach.', color: 'blue' },
              { icon: 'code', title: 'Code Interpreter', desc: 'Sandbox environments for Python workflows and data processing. Run scripts, analyze CSVs, and automate reporting.', color: 'indigo' },
            ].map((tool) => (
              <div key={tool.title} className="rounded-2xl border border-border-subtle bg-white p-8 shadow-sm">
                <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-${tool.color}-100`}>
                  <span className={`material-symbols-outlined text-[24px] text-${tool.color}-600`}>{tool.icon}</span>
                </div>
                <h3 className="text-xl font-bold text-text-main">{tool.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">{tool.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <FeatureCta
        title="Your Remote Agent Workforce"
        description="Build your first agent in minutes. No code required — just define a role, pick a model, and deploy."
      />
    </MarketingLayout>
  )
}

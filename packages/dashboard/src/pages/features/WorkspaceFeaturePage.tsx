import { useNavigate } from 'react-router'
import { MarketingLayout, FeatureHero, FeatureCta } from '@/layouts/MarketingLayout'

export function WorkspaceFeaturePage() {
  const navigate = useNavigate()
  const goToLogin = () => navigate('/login')

  return (
    <MarketingLayout>
      <FeatureHero
        badge="YokeBot Workspace"
        title="Flow of Information:"
        titleAccent="The Shared Brain"
        description="Watch raw data transform into actionable intelligence. YokeBot agents utilize a unified technique to process, understand, and act on your information seamlessly."
        primaryCta={{ label: 'Start Free Trial', onClick: goToLogin }}
        secondaryCta={{ label: 'View Demo', onClick: () => {} }}
      >
        {/* Hero right — data flow visual */}
        <div className="space-y-3">
          {[
            { icon: 'table_chart', label: 'Raw Data', desc: 'CRM exports, spreadsheets, CSVs' },
            { icon: 'psychology', label: 'Intelligence Layer', desc: 'AI agents process and enrich' },
            { icon: 'insights', label: 'Actionable Insights', desc: 'Ready for decisions and automation' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-4 rounded-xl border border-gray-700 bg-gray-800/60 backdrop-blur-sm px-5 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/20">
                <span className="material-symbols-outlined text-[20px] text-green-400">{item.icon}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{item.label}</p>
                <p className="text-xs text-gray-400">{item.desc}</p>
              </div>
              {i < 2 && <span className="material-symbols-outlined text-[16px] text-gray-500 ml-auto">arrow_downward</span>}
            </div>
          ))}
        </div>
      </FeatureHero>

      {/* Spreadsheet Intelligence */}
      <section className="px-6 py-24 xl:px-12">
        <div className="mx-auto max-w-6xl grid gap-16 lg:grid-cols-2 items-center">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-forest-green">Dynamic Databases</span>
            <h2 className="mt-3 font-display text-3xl font-bold text-text-main md:text-4xl">Spreadsheet Intelligence</h2>
            <p className="mt-4 text-lg text-text-secondary">
              Go beyond static spreadsheets. Agents automatically populate rows with CRM enrichment, market data, and more, keeping your records perpetually up to date without manual entry.
            </p>
            <div className="mt-8 space-y-4">
              {[
                { icon: 'auto_fix_high', label: 'Auto-Enrichment', desc: 'Agents automatically fill in missing data from connected sources.' },
                { icon: 'sync', label: 'Live Sync', desc: 'Real-time updates as agents process new information.' },
              ].map((f) => (
                <div key={f.label} className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-[20px] text-forest-green mt-0.5">{f.icon}</span>
                  <div>
                    <p className="text-sm font-bold text-text-main">{f.label}</p>
                    <p className="text-xs text-text-muted">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={goToLogin} className="mt-6 text-sm font-medium text-forest-green hover:underline">
              Learn about Data Tables &rarr;
            </button>
          </div>
          {/* Table mockup */}
          <div className="rounded-2xl border border-border-subtle bg-white shadow-lg overflow-hidden">
            <div className="border-b border-border-subtle bg-gray-50 px-5 py-3">
              <p className="text-sm font-bold text-text-main">Lead Pipeline</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle bg-gray-50">
                    <th className="px-4 py-2 text-left font-medium text-text-muted">Name</th>
                    <th className="px-4 py-2 text-left font-medium text-text-muted">Company</th>
                    <th className="px-4 py-2 text-left font-medium text-text-muted">Score</th>
                    <th className="px-4 py-2 text-left font-medium text-text-muted">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { name: 'Alex Chen', company: 'TechCorp', score: 92, status: 'Hot' },
                    { name: 'Maria Santos', company: 'GrowthCo', score: 78, status: 'Warm' },
                    { name: 'Jake Miller', company: 'StartupX', score: 65, status: 'New' },
                    { name: 'Priya Patel', company: 'ScaleUp', score: 88, status: 'Hot' },
                  ].map((row) => (
                    <tr key={row.name} className="border-b border-border-subtle last:border-0">
                      <td className="px-4 py-3 font-medium text-text-main">{row.name}</td>
                      <td className="px-4 py-3 text-text-muted">{row.company}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 rounded-full bg-gray-100">
                            <div className="h-1.5 rounded-full bg-forest-green" style={{ width: `${row.score}%` }} />
                          </div>
                          <span className="text-xs text-text-muted">{row.score}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          row.status === 'Hot' ? 'bg-red-100 text-red-700' :
                          row.status === 'Warm' ? 'bg-amber-100 text-amber-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>{row.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Document Understanding */}
      <section className="px-6 py-24 xl:px-12 bg-gray-50">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <span className="text-xs font-bold uppercase tracking-wider text-forest-green">Content Extraction</span>
            <h2 className="mt-3 font-display text-3xl font-bold text-text-main md:text-4xl">Document Understanding</h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-text-secondary">
              Upload PDFs, Markdown, or Docs. YokeBot agents process and contextualize your business content, enabling key insights to immediately flow across your workflow.
            </p>
          </div>
          <div className="mx-auto max-w-2xl rounded-2xl border border-dashed border-forest-green/40 bg-forest-green/5 p-10 text-center">
            <span className="material-symbols-outlined text-[48px] text-forest-green/50">upload_file</span>
            <p className="mt-4 font-bold text-text-main">Drop your documents here</p>
            <p className="mt-1 text-sm text-text-muted">PDF, Markdown, TXT, DOCX — up to 50MB</p>
            <button onClick={goToLogin} className="mt-6 rounded-lg bg-forest-green px-6 py-2.5 text-sm font-bold text-white">
              Try Knowledge Base
            </button>
          </div>
        </div>
      </section>

      {/* Secure Access Control */}
      <section className="px-6 py-24 xl:px-12">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display text-3xl font-bold text-text-main text-center mb-4">Secure Access Control</h2>
          <p className="text-center text-lg text-text-secondary mb-12">
            Granular permissions ensure agents only access what they need. Manage your workspace with enterprise-grade security protocols.
          </p>
          <div className="grid gap-6 md:grid-cols-3 mb-12">
            {[
              { icon: 'admin_panel_settings', title: 'Role-Based Access', desc: 'Define strict rules for every agent. Read-only or full access per data table.' },
              { icon: 'lock', title: 'Encrypted Data', desc: 'AES-256 encryption for all workspace data. Your data never leaves your control.' },
              { icon: 'history', title: 'Audit Logs', desc: 'Track every action on every record. Complete transparency for compliance.' },
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

          {/* Permission Matrix */}
          <div className="mx-auto max-w-3xl rounded-2xl border border-border-subtle bg-white shadow-lg overflow-hidden">
            <div className="border-b border-border-subtle bg-gray-50 px-5 py-3">
              <p className="text-sm font-bold text-text-main">Agent Permission Matrix</p>
              <p className="text-xs text-text-muted">Role-level breakdown of data access agent interaction level</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle">
                    <th className="px-4 py-3 text-left font-medium text-text-muted">Agent</th>
                    <th className="px-4 py-3 text-center font-medium text-text-muted">Leads</th>
                    <th className="px-4 py-3 text-center font-medium text-text-muted">Financials</th>
                    <th className="px-4 py-3 text-center font-medium text-text-muted">Documents</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { agent: 'SalesBot', leads: 'full', financials: 'read', documents: 'read' },
                    { agent: 'FinanceBot', leads: 'none', financials: 'full', documents: 'full' },
                    { agent: 'ResearchBot', leads: 'read', financials: 'none', documents: 'full' },
                  ].map((row) => (
                    <tr key={row.agent} className="border-b border-border-subtle last:border-0">
                      <td className="px-4 py-3 font-medium text-text-main">{row.agent}</td>
                      {[row.leads, row.financials, row.documents].map((perm, i) => (
                        <td key={i} className="px-4 py-3 text-center">
                          <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                            perm === 'full' ? 'bg-green-100 text-green-600' :
                            perm === 'read' ? 'bg-blue-100 text-blue-600' :
                            'bg-gray-100 text-gray-400'
                          }`}>
                            <span className="material-symbols-outlined text-[14px]">
                              {perm === 'full' ? 'check' : perm === 'read' ? 'visibility' : 'block'}
                            </span>
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Instant Retrieval */}
      <section className="px-6 py-24 xl:px-12 bg-gray-950">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="font-display text-3xl font-bold text-white md:text-4xl">Instant Retrieval</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-400">
            Find mission-critical data in seconds. Our semantic search understands your intent, not just your keywords.
          </p>
          <div className="mt-12 mx-auto max-w-2xl">
            <div className="rounded-2xl border border-gray-700 bg-gray-800/60 p-6">
              <div className="flex items-center gap-3 rounded-xl border border-gray-600 bg-gray-700/50 px-4 py-3 mb-6">
                <span className="material-symbols-outlined text-[20px] text-gray-400">search</span>
                <span className="text-sm text-gray-400">What are the Q3 revenue forecasts for Enterprise accounts?</span>
              </div>
              <div className="space-y-3">
                {[
                  { icon: 'description', title: 'Q3 Financial Projections.pdf', match: '94% match', snippet: 'Enterprise segment projected at $2.1M...' },
                  { icon: 'table_chart', title: 'Enterprise Sales Pipeline', match: '89% match', snippet: '47 deals in pipeline, avg. deal size $45K...' },
                ].map((result) => (
                  <div key={result.title} className="flex items-start gap-3 rounded-xl border border-gray-700 bg-gray-800/40 p-4">
                    <span className="material-symbols-outlined text-[20px] text-green-400">{result.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-white">{result.title}</p>
                        <span className="text-xs text-green-400">{result.match}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{result.snippet}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <FeatureCta
        title="All Your Data. One Shared Brain."
        description="Upload documents, enrich data tables, and let agents turn raw information into actionable intelligence."
      />
    </MarketingLayout>
  )
}

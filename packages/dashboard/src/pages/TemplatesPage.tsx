import { useState } from 'react'
import { CreateAgentModal } from '@/components/CreateAgentModal'

interface Template {
  name: string
  description: string
  icon: string
  iconBg: string
  iconColor: string
  category: string
  tags: string[]
}

const TEMPLATES: Template[] = [
  {
    name: 'Sales Outreach Bot',
    description: 'Automates cold outreach sequences and intelligent follow-ups based on recipient engagement.',
    icon: 'campaign',
    iconBg: 'bg-green-100',
    iconColor: 'text-green-700',
    category: 'Sales',
    tags: ['Email', 'CRM', 'Scheduling'],
  },
  {
    name: 'Customer Support Agent',
    description: 'First-line response for common Zendesk inquiries, triage, and knowledge base routing.',
    icon: 'support_agent',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-700',
    category: 'Support',
    tags: ['Zendesk', 'Chat', 'NLP'],
  },
  {
    name: 'Data Analyst',
    description: 'Summarizes weekly CSV reports into actionable insights and visual dashboards.',
    icon: 'bar_chart',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-700',
    category: 'Operations',
    tags: ['Python', 'Excel', 'Reporting'],
  },
  {
    name: 'HR Onboarding Buddy',
    description: 'Guides new hires through paperwork, account setup, and initial training modules.',
    icon: 'badge',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-700',
    category: 'HR',
    tags: ['Workday', 'Slack', 'Docs'],
  },
  {
    name: 'Social Media Manager',
    description: 'Drafts, schedules, and monitors posts across LinkedIn, Twitter, and Instagram.',
    icon: 'share',
    iconBg: 'bg-pink-100',
    iconColor: 'text-pink-700',
    category: 'Marketing',
    tags: ['LinkedIn', 'Generative AI', 'Scheduling'],
  },
  {
    name: 'Meeting Assistant',
    description: 'Joins calls, transcribes discussion, and automatically generates action items.',
    icon: 'groups',
    iconBg: 'bg-teal-100',
    iconColor: 'text-teal-700',
    category: 'Operations',
    tags: ['Zoom', 'Jira', 'Notion'],
  },
  {
    name: 'Lead Qualifier',
    description: 'Scores and qualifies inbound leads based on custom criteria and CRM data.',
    icon: 'filter_alt',
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-700',
    category: 'Sales',
    tags: ['CRM', 'Scoring', 'Email'],
  },
  {
    name: 'Content Writer',
    description: 'Generates blog posts, newsletters, and marketing copy from briefs and outlines.',
    icon: 'edit_note',
    iconBg: 'bg-indigo-100',
    iconColor: 'text-indigo-700',
    category: 'Marketing',
    tags: ['SEO', 'Blog', 'Copy'],
  },
]

const categories = ['All', 'Sales', 'Support', 'Marketing', 'HR', 'Operations']

export function TemplatesPage() {
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)

  const filtered = TEMPLATES.filter((t) => {
    if (filter !== 'All' && t.category !== filter) return false
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const deploy = (template: Template) => {
    setSelectedTemplate(template)
    setShowCreate(true)
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-main">Agent Templates</h1>
          <p className="text-sm text-text-muted">Select a pre-configured agent to fast-track your automation workflows.</p>
        </div>
        <div className="relative max-w-xs">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-text-muted">search</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="w-full rounded-lg border border-border-subtle pl-10 pr-4 py-2 text-sm focus:border-forest-green focus:outline-none"
          />
        </div>
      </div>

      {/* Category Filters */}
      <div className="mb-6 flex gap-1">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === cat
                ? 'bg-forest-green text-white'
                : 'bg-light-surface-alt text-text-secondary hover:bg-gray-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Template Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((template) => (
          <div key={template.name} className="rounded-xl border border-border-subtle bg-white p-5 shadow-card">
            <div className="mb-3 flex items-start gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${template.iconBg} ${template.iconColor}`}>
                <span className="material-symbols-outlined">{template.icon}</span>
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-text-main">{template.name}</h3>
                <p className="mt-1 text-xs text-text-muted line-clamp-2">{template.description}</p>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-1.5">
              {template.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-light-surface-alt px-2.5 py-0.5 text-[10px] font-medium text-text-muted">
                  {tag}
                </span>
              ))}
            </div>

            <button
              onClick={() => deploy(template)}
              className="w-full rounded-lg bg-forest-green py-2 text-sm font-medium text-white hover:bg-forest-green/90"
            >
              Deploy Agent
            </button>
          </div>
        ))}
      </div>

      <div className="mt-6 text-center text-sm text-text-muted">
        Showing {filtered.length} of {TEMPLATES.length} templates
      </div>

      {showCreate && (
        <CreateAgentModal
          onClose={() => { setShowCreate(false); setSelectedTemplate(null) }}
          onCreated={() => { setShowCreate(false); setSelectedTemplate(null) }}
          defaultName={selectedTemplate?.name}
          defaultPrompt={selectedTemplate ? `You are a ${selectedTemplate.name}. ${selectedTemplate.description}` : undefined}
        />
      )}
    </div>
  )
}

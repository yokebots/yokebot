import { useState, useEffect } from 'react'
import * as engine from '@/lib/engine'
import type { AgentTemplate } from '@/lib/engine'
import { CreateAgentModal } from '@/components/CreateAgentModal'

export function TemplatesPage() {
  const [templates, setTemplates] = useState<AgentTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null)

  useEffect(() => {
    engine.listTemplates()
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Dynamic category list from templates
  const departments = ['All', ...Array.from(new Set(templates.map((t) => t.department))).sort()]

  const filtered = templates.filter((t) => {
    if (filter !== 'All' && t.department !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return t.name.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
    }
    return true
  })

  const deploy = (template: AgentTemplate) => {
    setSelectedTemplate(template)
    setShowCreate(true)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-forest-green border-t-transparent" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-main">Pre-Built Agents</h1>
          <p className="text-sm text-text-muted">
            {templates.length} pre-built agents ready to deploy. Choose one and customize it for your team.
          </p>
        </div>
        <div className="relative max-w-xs w-full">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-text-muted">search</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search pre-built agents..."
            className="w-full rounded-lg border border-border-subtle pl-10 pr-4 py-2 text-sm focus:border-forest-green focus:outline-none"
          />
        </div>
      </div>

      {/* Category Filters */}
      <div className="mb-6 flex flex-wrap gap-1">
        {departments.map((dept) => (
          <button
            key={dept}
            onClick={() => setFilter(dept)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === dept
                ? 'bg-forest-green text-white'
                : 'bg-light-surface-alt text-text-secondary hover:bg-gray-200'
            }`}
          >
            {dept}
          </button>
        ))}
      </div>

      {/* Template Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((template) => (
          <div key={template.id} className="flex flex-col rounded-xl border border-border-subtle bg-white p-5 shadow-card">
            <div className="mb-3 flex items-start gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white shadow-sm"
                style={{ backgroundColor: template.iconColor }}
              >
                <span className="material-symbols-outlined">{template.icon}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-text-main">{template.name}</h3>
                  {template.isFree && (
                    <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-bold text-green-700">Free</span>
                  )}
                  {template.isSpecial && (
                    <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-700">Reasoning</span>
                  )}
                </div>
                <p className="text-[11px] font-medium text-text-secondary">{template.title}</p>
                <p className="mt-1 text-xs text-text-muted line-clamp-2">{template.description}</p>
              </div>
            </div>

            {/* Personality traits */}
            <div className="mb-2 flex flex-wrap gap-1">
              {template.personalityTraits.map((trait) => (
                <span key={trait} className="rounded-full bg-light-surface-alt px-2 py-0.5 text-[10px] font-medium text-text-muted">
                  {trait}
                </span>
              ))}
            </div>

            {/* Skills count + model */}
            <div className="mb-3 mt-auto flex items-center gap-3 text-[10px] text-text-muted">
              {template.defaultSkills.length > 0 && (
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[12px]">extension</span>
                  {template.defaultSkills.length} skills
                </span>
              )}
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px]">smart_toy</span>
                {template.recommendedModel}
              </span>
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px]">folder</span>
                {template.department}
              </span>
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

      {filtered.length === 0 && (
        <div className="rounded-lg border border-border-subtle bg-white p-8 text-center">
          <span className="material-symbols-outlined mb-2 text-4xl text-text-muted">search_off</span>
          <p className="text-sm text-text-muted">No agents match your search.</p>
        </div>
      )}

      <div className="mt-6 text-center text-sm text-text-muted">
        Showing {filtered.length} of {templates.length} pre-built agents
      </div>

      {showCreate && selectedTemplate && (
        <CreateAgentModal
          onClose={() => { setShowCreate(false); setSelectedTemplate(null) }}
          onCreated={() => { setShowCreate(false); setSelectedTemplate(null) }}
          template={selectedTemplate}
        />
      )}
    </div>
  )
}

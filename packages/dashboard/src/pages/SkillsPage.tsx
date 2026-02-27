import { useState, useEffect } from 'react'
import * as engine from '@/lib/engine'

interface SkillCard {
  name: string
  description: string
  icon: string
  category: string
  source: string
  installed: boolean
}

const BUILT_IN_SKILLS: SkillCard[] = [
  { name: 'Slack Connect', icon: 'chat', category: 'Channels', source: 'YokeBot', installed: false, description: 'Seamlessly integrate your agents into Slack channels for real-time team collaboration.' },
  { name: 'Google Sheets', icon: 'table_chart', category: 'Tools', source: 'Community', installed: false, description: 'Read and write data directly to spreadsheets for reporting agents.' },
  { name: 'DALL-E 3', icon: 'image', category: 'Creative', source: 'Community', installed: false, description: 'Advanced image generation capabilities directly within your chat interface.' },
  { name: 'Zapier', icon: 'hub', category: 'Tools', source: 'Community', installed: false, description: 'Connect your agents to 6,000+ apps without writing a single line of code.' },
  { name: 'Python Interpreter', icon: 'terminal', category: 'Tools', source: 'Community', installed: false, description: 'Execute Python code safely in a sandboxed environment for data analysis.' },
  { name: 'Web Browser', icon: 'language', category: 'Tools', source: 'Community', installed: false, description: 'Allow agents to browse the internet to find information and take actions.' },
  { name: 'Jira Cloud', icon: 'task_alt', category: 'Tools', source: 'Community', installed: false, description: 'Create and track Jira tickets directly from agent conversations.' },
  { name: 'Gmail', icon: 'mail', category: 'Channels', source: 'Community', installed: false, description: 'Read, send, and summarize emails. Manage calendar events through agents.' },
  { name: 'Notion', icon: 'edit_note', category: 'Tools', source: 'Community', installed: false, description: 'Read and write Notion pages and databases for knowledge management.' },
]

const categories = ['All', 'Channels', 'Tools', 'Creative', 'Models']

export function SkillsPage() {
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [skills, setSkills] = useState<SkillCard[]>(BUILT_IN_SKILLS)

  useEffect(() => {
    engine.listSkills().then((loaded) => {
      const loadedCards: SkillCard[] = loaded.map((s) => ({
        name: s.metadata.name,
        description: s.metadata.description,
        icon: 'extension',
        category: s.metadata.tags[0] ?? 'Tools',
        source: s.metadata.source,
        installed: true,
      }))
      setSkills([...loadedCards, ...BUILT_IN_SKILLS])
    }).catch(() => { /* offline */ })
  }, [])

  const filtered = skills.filter((s) => {
    if (filter !== 'All' && s.category !== filter) return false
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const featured = filtered.filter((s) => s.source === 'YokeBot').slice(0, 2)
  const rest = filtered.filter((s) => !featured.includes(s))

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-main">Skills Marketplace</h1>
          <p className="text-sm text-text-muted">Supercharge your agents with official integrations and community-built skills.</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg border border-border-subtle bg-white px-4 py-2 text-sm font-medium text-text-secondary hover:bg-light-surface-alt">
          <span className="material-symbols-outlined text-[18px]">upload</span>
          Request New Skill
        </button>
      </div>

      {/* Search + Filters */}
      <div className="mb-6 flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-text-muted">search</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search for skills, integrations, and models..."
            className="w-full rounded-lg border border-border-subtle pl-10 pr-4 py-2 text-sm focus:border-forest-green focus:outline-none"
          />
        </div>
        <div className="flex gap-1">
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
      </div>

      {/* Featured */}
      {featured.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-text-muted">Featured Skills</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {featured.map((skill) => (
              <div key={skill.name} className="flex items-center gap-4 rounded-xl border border-border-subtle bg-white p-5 shadow-card">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-forest-green/10 text-forest-green">
                  <span className="material-symbols-outlined text-2xl">{skill.icon}</span>
                </div>
                <div className="flex-1">
                  <h3 className="font-display text-base font-bold text-text-main">{skill.name}</h3>
                  <p className="mt-1 text-sm text-text-muted">{skill.description}</p>
                </div>
                <button className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium ${
                  skill.installed
                    ? 'border border-green-200 bg-green-50 text-green-700'
                    : 'bg-forest-green text-white hover:bg-forest-green/90'
                }`}>
                  {skill.installed ? 'Installed' : 'Install'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Skills Grid */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">All Skills</h2>
          <span className="text-sm text-text-muted">Sort by: <span className="font-medium text-text-main">Popularity</span></span>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rest.map((skill) => (
            <div key={skill.name} className="rounded-xl border border-border-subtle bg-white p-5 shadow-card transition-all hover:shadow-lg">
              <div className="mb-3 flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-forest-green/10 text-forest-green">
                  <span className="material-symbols-outlined">{skill.icon}</span>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                  skill.source === 'YokeBot' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {skill.source}
                </span>
              </div>
              <h3 className="mb-1 text-sm font-bold text-text-main">{skill.name}</h3>
              <p className="mb-4 text-xs text-text-muted line-clamp-2">{skill.description}</p>
              <button className={`w-full rounded-lg py-2 text-sm font-medium ${
                skill.installed
                  ? 'border border-green-200 bg-green-50 text-green-700'
                  : 'border border-border-subtle text-text-secondary hover:border-forest-green hover:text-forest-green'
              }`}>
                {skill.installed ? 'Installed' : 'Install'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

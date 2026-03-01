import { useState, useEffect } from 'react'
import * as engine from '@/lib/engine'
import type { EngineAgent } from '@/lib/engine'

interface SkillCard {
  name: string
  description: string
  icon: string
  category: string
  source: string
  creditCost: number | null
  keyType: 'native' | 'byok' | 'internal'
  skillId: string
}

const SKILL_ICONS: Record<string, string> = {
  'Web Search': 'language',
  'Code Interpreter': 'terminal',
  'Slack Notify': 'chat',
  'Google Sheets': 'table_chart',
}

const SKILL_COSTS: Record<string, { credits: number; keyType: 'native' | 'byok' | 'internal' }> = {
  'web-search': { credits: 10, keyType: 'native' },
  'code-interpreter': { credits: 0, keyType: 'internal' },
  'slack-notify': { credits: 0, keyType: 'byok' },
  'google-sheets': { credits: 0, keyType: 'byok' },
}

const categories = ['All', 'Channels', 'Tools', 'Creative']

export function SkillsPage() {
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [skills, setSkills] = useState<SkillCard[]>([])
  const [agents, setAgents] = useState<EngineAgent[]>([])
  const [installTarget, setInstallTarget] = useState<string | null>(null) // skill name being installed
  const [installing, setInstalling] = useState(false)
  const [installSuccess, setInstallSuccess] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([engine.listSkills(), engine.listAgents()]).then(([loaded, ag]) => {
      setAgents(ag)
      const loadedCards: SkillCard[] = loaded.map((s) => {
        const skillId = s.metadata.name.toLowerCase().replace(/\s+/g, '-')
        const costInfo = SKILL_COSTS[skillId]
        return {
          name: s.metadata.name,
          description: s.metadata.description,
          icon: SKILL_ICONS[s.metadata.name] ?? 'extension',
          category: s.metadata.tags[0] ?? 'Tools',
          source: s.metadata.source === 'yokebot' ? 'YokeBot' : s.metadata.source,
          creditCost: costInfo?.credits ?? 0,
          keyType: costInfo?.keyType ?? 'internal',
          skillId,
        }
      })
      setSkills(loadedCards)
    }).catch(() => { /* offline */ })
  }, [])

  const filtered = skills.filter((s) => {
    if (filter !== 'All' && s.category !== filter) return false
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const featured = filtered.filter((s) => s.source === 'YokeBot').slice(0, 2)
  const rest = filtered.filter((s) => !featured.includes(s))

  const handleInstall = async (agentId: string, skillName: string) => {
    setInstalling(true)
    try {
      await engine.installAgentSkill(agentId, skillName)
      const agent = agents.find((a) => a.id === agentId)
      setInstallSuccess(`${skillName} added to ${agent?.name ?? 'agent'}`)
      setTimeout(() => setInstallSuccess(null), 3000)
    } catch { /* error */ }
    setInstalling(false)
    setInstallTarget(null)
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-main">Skills Marketplace</h1>
          <p className="text-sm text-text-muted">Supercharge your agents with official and community-built skills.</p>
        </div>
      </div>

      {/* Success toast */}
      {installSuccess && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
          <span className="material-symbols-outlined text-[16px]">check_circle</span>
          {installSuccess}
        </div>
      )}

      {/* Search + Filters */}
      <div className="mb-6 flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-text-muted">search</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search skills..."
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
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-base font-bold text-text-main">{skill.name}</h3>
                    <CreditBadge cost={skill.creditCost} keyType={skill.keyType} />
                  </div>
                  <p className="mt-1 text-sm text-text-muted">{skill.description}</p>
                </div>
                <div className="relative shrink-0">
                  <button
                    onClick={() => setInstallTarget(installTarget === skill.skillId ? null : skill.skillId)}
                    className="rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white hover:bg-forest-green/90 transition-colors"
                  >
                    Add to Agent
                  </button>
                  {installTarget === skill.skillId && (
                    <AgentPicker
                      agents={agents}
                      installing={installing}
                      onSelect={(agentId) => handleInstall(agentId, skill.skillId)}
                      onClose={() => setInstallTarget(null)}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Skills Grid */}
      {rest.length > 0 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">All Skills</h2>
            <span className="text-sm text-text-muted">{skills.length} skill{skills.length !== 1 ? 's' : ''} available</span>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {rest.map((skill) => (
              <div key={skill.name} className="flex flex-col rounded-xl border border-border-subtle bg-white p-5 shadow-card transition-all hover:shadow-lg">
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-forest-green/10 text-forest-green">
                    <span className="material-symbols-outlined">{skill.icon}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CreditBadge cost={skill.creditCost} keyType={skill.keyType} />
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      skill.source === 'YokeBot' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {skill.source}
                    </span>
                  </div>
                </div>
                <h3 className="mb-1 text-sm font-bold text-text-main">{skill.name}</h3>
                <p className="mb-4 text-xs text-text-muted line-clamp-2">{skill.description}</p>
                <div className="relative mt-auto">
                  <button
                    onClick={() => setInstallTarget(installTarget === skill.skillId ? null : skill.skillId)}
                    className="block w-full rounded-lg bg-forest-green py-2 text-center text-sm font-medium text-white hover:bg-forest-green/90 transition-colors"
                  >
                    Add to Agent
                  </button>
                  {installTarget === skill.skillId && (
                    <AgentPicker
                      agents={agents}
                      installing={installing}
                      onSelect={(agentId) => handleInstall(agentId, skill.skillId)}
                      onClose={() => setInstallTarget(null)}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {skills.length === 0 && (
        <div className="rounded-lg border border-border-subtle bg-white p-12 text-center">
          <span className="material-symbols-outlined mb-3 text-5xl text-text-muted">extension</span>
          <h2 className="mb-2 font-display text-lg font-bold text-text-main">No skills found</h2>
          <p className="text-sm text-text-muted">Add SKILL.md files to the skills directory to get started.</p>
        </div>
      )}
    </div>
  )
}

function AgentPicker({ agents, installing, onSelect, onClose }: {
  agents: EngineAgent[]
  installing: boolean
  onSelect: (agentId: string) => void
  onClose: () => void
}) {
  if (agents.length === 0) {
    return (
      <div className="absolute right-0 top-full z-10 mt-2 w-56 rounded-lg border border-border-subtle bg-white p-4 shadow-lg">
        <p className="text-sm text-text-muted">No agents yet. Create an agent first.</p>
        <button onClick={onClose} className="mt-2 text-xs text-text-muted hover:text-text-main">Close</button>
      </div>
    )
  }

  return (
    <div className="absolute right-0 top-full z-10 mt-2 w-56 rounded-lg border border-border-subtle bg-white shadow-lg">
      <p className="border-b border-border-subtle px-3 py-2 text-xs font-bold uppercase tracking-wider text-text-muted">
        Select Agent
      </p>
      {agents.map((agent) => (
        <button
          key={agent.id}
          onClick={() => onSelect(agent.id)}
          disabled={installing}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text-main hover:bg-light-surface-alt disabled:opacity-50"
        >
          <span className={`h-2 w-2 rounded-full ${agent.status === 'running' ? 'bg-green-500' : 'bg-gray-300'}`} />
          {agent.name}
        </button>
      ))}
      <button
        onClick={onClose}
        className="w-full border-t border-border-subtle px-3 py-2 text-xs text-text-muted hover:bg-light-surface-alt"
      >
        Cancel
      </button>
    </div>
  )
}

function CreditBadge({ cost, keyType }: { cost: number | null; keyType: string }) {
  if (keyType === 'byok') {
    return (
      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600">
        BYOK
      </span>
    )
  }
  if (keyType === 'internal' || cost === 0) {
    return (
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
        Free
      </span>
    )
  }
  return (
    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
      {cost} credits
    </span>
  )
}

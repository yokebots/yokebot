import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import * as engine from '@/lib/engine'

interface SearchResult {
  type: 'agent' | 'task' | 'file' | 'action'
  icon: string
  label: string
  detail: string
  badge?: string
  badgeClass?: string
  action: () => void
}

export function UniversalSearch({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Load initial results (agents, tasks) then filter
  useEffect(() => {
    const load = async () => {
      const items: SearchResult[] = []

      try {
        const agents = await engine.listAgents()
        for (const a of agents) {
          items.push({
            type: 'agent',
            icon: 'smart_toy',
            label: a.name,
            detail: a.department ?? 'General',
            badge: a.status === 'running' ? 'Active' : 'Idle',
            badgeClass: a.status === 'running' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600',
            action: () => { navigate(`/agents/${a.id}`); onClose() },
          })
        }
      } catch { /* offline */ }

      try {
        const tasks = await engine.listTasks()
        for (const t of tasks) {
          items.push({
            type: 'task',
            icon: 'task_alt',
            label: t.title,
            detail: `Assigned to: ${t.assignedAgentId ?? 'Unassigned'}`,
            badge: `Task #${t.id.slice(0, 4)}`,
            badgeClass: 'bg-gray-100 text-gray-600',
            action: () => { navigate(`/tasks/${t.id}`); onClose() },
          })
        }
      } catch { /* offline */ }

      // Static actions
      items.push({
        type: 'action',
        icon: 'add_circle',
        label: 'Create New Agent',
        detail: 'Deploy a new autonomous unit',
        action: () => { navigate('/agents'); onClose() },
      })
      items.push({
        type: 'action',
        icon: 'pause_circle',
        label: 'Pause All Activity',
        detail: 'Emergency stop for all active agents',
        action: () => { onClose() },
      })

      setResults(items)
    }
    load()
  }, [navigate, onClose])

  const filtered = query
    ? results.filter((r) => r.label.toLowerCase().includes(query.toLowerCase()) || r.detail.toLowerCase().includes(query.toLowerCase()))
    : results

  const grouped = {
    agent: filtered.filter((r) => r.type === 'agent'),
    task: filtered.filter((r) => r.type === 'task'),
    file: filtered.filter((r) => r.type === 'file'),
    action: filtered.filter((r) => r.type === 'action'),
  }

  const flatFiltered = [...grouped.agent, ...grouped.task, ...grouped.file, ...grouped.action]

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, flatFiltered.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && flatFiltered[selectedIdx]) { flatFiltered[selectedIdx].action() }
  }

  useEffect(() => { setSelectedIdx(0) }, [query])

  const sectionLabel: Record<string, string> = {
    agent: 'Agents',
    task: 'Mission Control',
    file: 'Knowledge Base',
    action: 'Actions',
  }

  let runningIdx = -1

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 pt-[15vh]" onClick={onClose}>
      <div
        className="w-full max-w-2xl mx-4 md:mx-0 rounded-2xl border border-border-subtle bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-border-subtle px-5 py-4">
          <span className="material-symbols-outlined text-xl text-text-muted">search</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search agents, tasks, or files..."
            className="flex-1 bg-transparent text-lg text-text-main placeholder-text-muted outline-none"
          />
          <kbd className="rounded border border-border-subtle bg-light-surface-alt px-2 py-0.5 text-xs text-text-muted">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {(Object.keys(grouped) as Array<keyof typeof grouped>).map((type) => {
            const items = grouped[type]
            if (items.length === 0) return null
            return (
              <div key={type}>
                <p className="px-5 py-2 text-xs font-bold uppercase tracking-wider text-text-muted">
                  {sectionLabel[type]}
                </p>
                {items.map((item) => {
                  runningIdx++
                  const idx = runningIdx
                  return (
                    <button
                      key={`${item.type}-${item.label}`}
                      onClick={item.action}
                      className={`flex w-full items-center gap-3 px-5 py-3 text-left transition-colors ${
                        selectedIdx === idx ? 'bg-forest-green/5 border-l-2 border-forest-green' : 'hover:bg-light-surface-alt border-l-2 border-transparent'
                      }`}
                    >
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        selectedIdx === idx ? 'bg-forest-green/10 text-forest-green' : 'bg-light-surface-alt text-text-muted'
                      }`}>
                        <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-text-main">{item.label}</p>
                        <p className="text-xs text-text-muted">{item.detail}</p>
                      </div>
                      {item.badge && (
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${item.badgeClass}`}>
                          {item.badge}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}

          {flatFiltered.length === 0 && (
            <p className="py-8 text-center text-sm text-text-muted">No results found for &ldquo;{query}&rdquo;</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border-subtle px-5 py-2.5">
          <div className="flex items-center gap-4 text-xs text-text-muted">
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">unfold_more</span> Navigate
            </span>
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">keyboard_return</span> Select
            </span>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-text-muted">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            System Operational
          </span>
        </div>
      </div>
    </div>
  )
}

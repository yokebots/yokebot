import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router'
import * as engine from '@/lib/engine'

// ===== Types =====

type ResultCategory = 'agent' | 'task' | 'message' | 'document' | 'goal' | 'kpi' | 'activity' | 'data' | 'notification' | 'action'

interface SearchResult {
  type: ResultCategory
  icon: string
  iconColor: string
  label: string
  detail: string
  timestamp?: string
  badge?: string
  badgeClass?: string
  action: () => void
}

// ===== Category config =====

const CATEGORIES: Array<{ key: ResultCategory | 'all'; label: string; icon: string }> = [
  { key: 'all', label: 'All', icon: 'select_all' },
  { key: 'agent', label: 'Agents', icon: 'smart_toy' },
  { key: 'task', label: 'Tasks', icon: 'task_alt' },
  { key: 'message', label: 'Messages', icon: 'chat_bubble' },
  { key: 'document', label: 'Docs', icon: 'description' },
  { key: 'goal', label: 'Goals', icon: 'flag' },
  { key: 'activity', label: 'Activity', icon: 'history' },
  { key: 'data', label: 'Data', icon: 'table_chart' },
  { key: 'notification', label: 'Notifications', icon: 'notifications' },
]

const ICON_COLORS: Record<ResultCategory, string> = {
  agent: 'text-emerald-600 bg-emerald-50',
  task: 'text-blue-600 bg-blue-50',
  message: 'text-violet-600 bg-violet-50',
  document: 'text-amber-600 bg-amber-50',
  goal: 'text-rose-600 bg-rose-50',
  kpi: 'text-orange-600 bg-orange-50',
  activity: 'text-slate-600 bg-slate-50',
  data: 'text-cyan-600 bg-cyan-50',
  notification: 'text-red-600 bg-red-50',
  action: 'text-forest-green bg-forest-green/10',
}

const SECTION_LABELS: Record<ResultCategory, string> = {
  agent: 'Agents',
  task: 'Mission Control',
  message: 'Chat Messages',
  document: 'Knowledge Base',
  goal: 'Goals',
  kpi: 'KPI Goals',
  activity: 'Activity Log',
  data: 'Data Tables',
  notification: 'Notifications',
  action: 'Actions',
}

const PREFIX_MAP: Record<string, ResultCategory> = {
  agents: 'agent',
  agent: 'agent',
  tasks: 'task',
  task: 'task',
  messages: 'message',
  message: 'message',
  chat: 'message',
  docs: 'document',
  doc: 'document',
  documents: 'document',
  goals: 'goal',
  goal: 'goal',
  kpi: 'kpi',
  kpis: 'kpi',
  activity: 'activity',
  log: 'activity',
  data: 'data',
  tables: 'data',
  notifications: 'notification',
  notification: 'notification',
}

// ===== Helpers =====

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function parseQuery(raw: string): { category: ResultCategory | null; query: string } {
  const match = raw.match(/^in:(\w+)\s+(.*)$/)
  if (match) {
    const cat = PREFIX_MAP[match[1].toLowerCase()]
    if (cat) return { category: cat, query: match[2].trim() }
  }
  return { category: null, query: raw }
}

function matchesQuery(q: string, ...fields: (string | null | undefined)[]): boolean {
  const lower = q.toLowerCase()
  return fields.some((f) => f?.toLowerCase().includes(lower))
}

// ===== Component =====

export function UniversalSearch({ onClose }: { onClose: () => void }) {
  const [rawQuery, setRawQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<ResultCategory | 'all'>('all')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  // All static data sources
  const [agents, setAgents] = useState<engine.EngineAgent[]>([])
  const [tasks, setTasks] = useState<engine.EngineTask[]>([])
  const [documents, setDocuments] = useState<engine.KbDocument[]>([])
  const [goals, setGoals] = useState<engine.Goal[]>([])
  const [kpiGoals, setKpiGoals] = useState<engine.KpiGoal[]>([])
  const [activityLog, setActivityLog] = useState<engine.ActivityLogEntry[]>([])
  const [dataTables, setDataTables] = useState<engine.SorTable[]>([])
  const [notifications, setNotifications] = useState<engine.EngineNotification[]>([])

  // Server-side chat message search
  const [messageResults, setMessageResults] = useState<SearchResult[]>([])
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  // Load all data sources on mount
  useEffect(() => {
    const settled = Promise.allSettled([
      engine.listAgents(),
      engine.listTasks(),
      engine.listKbDocuments(),
      engine.listGoals(),
      engine.listKpiGoals(),
      engine.listActivityLog({ limit: 100 }),
      engine.listSorTables(),
      engine.listNotifications({ limit: 50 }),
    ])
    settled.then((results) => {
      if (results[0].status === 'fulfilled') setAgents(results[0].value)
      if (results[1].status === 'fulfilled') setTasks(results[1].value)
      if (results[2].status === 'fulfilled') setDocuments(results[2].value)
      if (results[3].status === 'fulfilled') setGoals(results[3].value)
      if (results[4].status === 'fulfilled') setKpiGoals(results[4].value)
      if (results[5].status === 'fulfilled') setActivityLog(results[5].value)
      if (results[6].status === 'fulfilled') setDataTables(results[6].value)
      if (results[7].status === 'fulfilled') setNotifications(results[7].value)
    })
  }, [])

  // Parse query for prefix syntax
  const { category: prefixCategory, query } = useMemo(() => parseQuery(rawQuery), [rawQuery])

  // Effective category: prefix overrides chip selection
  const effectiveCategory = prefixCategory ?? (activeCategory === 'all' ? null : activeCategory)

  // Debounced server-side chat search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    // Skip if filtered to a non-message category
    if (effectiveCategory && effectiveCategory !== 'message') { setMessageResults([]); return }
    if (!query || query.length < 2) { setMessageResults([]); return }

    searchTimerRef.current = setTimeout(async () => {
      try {
        const hits = await engine.searchChatMessages(query, 10)
        setMessageResults(hits.map((m) => {
          const preview = m.content.length > 120 ? m.content.slice(0, 120) + '...' : m.content
          const channelLabel = m.channelType === 'dm' ? 'DM' : m.channelType === 'task_thread' ? 'Task Thread' : m.channelName
          return {
            type: 'message' as const,
            icon: 'chat_bubble',
            iconColor: ICON_COLORS.message,
            label: preview,
            detail: `${m.senderType === 'agent' ? 'Agent' : 'You'} in ${channelLabel}`,
            timestamp: relativeTime(m.createdAt),
            action: () => { navigate(`/chat?channel=${m.channelId}`); onClose() },
          }
        }))
      } catch { setMessageResults([]) }
    }, 300)

    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [query, effectiveCategory, navigate, onClose])

  // Build all local results
  const allResults = useMemo(() => {
    const items: SearchResult[] = []

    // Agents
    for (const a of agents) {
      if (query && !matchesQuery(query, a.name, a.department)) continue
      items.push({
        type: 'agent',
        icon: 'smart_toy',
        iconColor: ICON_COLORS.agent,
        label: a.name,
        detail: a.department ?? 'General',
        timestamp: relativeTime(a.updatedAt),
        badge: a.status === 'running' ? 'Active' : 'Idle',
        badgeClass: a.status === 'running' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600',
        action: () => { navigate(`/agents/${a.id}`); onClose() },
      })
    }

    // Tasks
    for (const t of tasks) {
      if (query && !matchesQuery(query, t.title, t.description)) continue
      items.push({
        type: 'task',
        icon: 'task_alt',
        iconColor: ICON_COLORS.task,
        label: t.title,
        detail: `${t.status} · ${t.priority} priority`,
        timestamp: relativeTime(t.updatedAt),
        badge: t.status,
        badgeClass: t.status === 'done' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700',
        action: () => { navigate(`/tasks/${t.id}`); onClose() },
      })
    }

    // KB Documents
    for (const d of documents) {
      if (query && !matchesQuery(query, d.title, d.fileName)) continue
      items.push({
        type: 'document',
        icon: 'description',
        iconColor: ICON_COLORS.document,
        label: d.title,
        detail: `${d.fileName} · ${d.chunkCount} chunks`,
        timestamp: relativeTime(d.createdAt),
        badge: d.status,
        badgeClass: d.status === 'ready' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700',
        action: () => { navigate('/knowledge-base'); onClose() },
      })
    }

    // Goals
    for (const g of goals) {
      if (query && !matchesQuery(query, g.title, g.description)) continue
      items.push({
        type: 'goal',
        icon: 'flag',
        iconColor: ICON_COLORS.goal,
        label: g.title,
        detail: `${g.progress}% complete`,
        timestamp: relativeTime(g.updatedAt),
        badge: g.status,
        badgeClass: g.status === 'completed' ? 'bg-green-50 text-green-700' : 'bg-rose-50 text-rose-700',
        action: () => { navigate('/goals'); onClose() },
      })
    }

    // KPI Goals
    for (const k of kpiGoals) {
      if (query && !matchesQuery(query, k.title, k.metricName)) continue
      items.push({
        type: 'kpi',
        icon: 'speed',
        iconColor: ICON_COLORS.kpi,
        label: k.title,
        detail: `${k.currentValue}/${k.targetValue} ${k.unit}`,
        timestamp: relativeTime(k.updatedAt),
        badge: k.status,
        badgeClass: k.status === 'achieved' ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700',
        action: () => { navigate('/goals'); onClose() },
      })
    }

    // Activity Log
    for (const a of activityLog) {
      if (query && !matchesQuery(query, a.description, a.details)) continue
      items.push({
        type: 'activity',
        icon: 'history',
        iconColor: ICON_COLORS.activity,
        label: a.description,
        detail: a.details ?? a.eventType,
        timestamp: relativeTime(a.createdAt),
        action: () => { navigate('/activity'); onClose() },
      })
    }

    // Data Tables
    for (const t of dataTables) {
      if (query && !matchesQuery(query, t.name)) continue
      items.push({
        type: 'data',
        icon: 'table_chart',
        iconColor: ICON_COLORS.data,
        label: t.name,
        detail: `${t.rowCount} rows · ${t.columns.length} columns`,
        timestamp: relativeTime(t.createdAt),
        action: () => { navigate('/data-tables'); onClose() },
      })
    }

    // Notifications
    for (const n of notifications) {
      if (query && !matchesQuery(query, n.title, n.body)) continue
      items.push({
        type: 'notification',
        icon: 'notifications',
        iconColor: ICON_COLORS.notification,
        label: n.title,
        detail: n.body.length > 100 ? n.body.slice(0, 100) + '...' : n.body,
        timestamp: relativeTime(n.createdAt),
        badge: n.read ? undefined : 'New',
        badgeClass: 'bg-red-50 text-red-700',
        action: () => { navigate(n.link ?? '/activity'); onClose() },
      })
    }

    // Static actions (only when no query or matching)
    if (!query || matchesQuery(query, 'create new agent deploy')) {
      items.push({
        type: 'action',
        icon: 'add_circle',
        iconColor: ICON_COLORS.action,
        label: 'Create New Agent',
        detail: 'Deploy a new autonomous unit',
        action: () => { navigate('/agents'); onClose() },
      })
    }
    if (!query || matchesQuery(query, 'pause stop emergency')) {
      items.push({
        type: 'action',
        icon: 'pause_circle',
        iconColor: ICON_COLORS.action,
        label: 'Pause All Activity',
        detail: 'Emergency stop for all active agents',
        action: () => { onClose() },
      })
    }

    return items
  }, [query, agents, tasks, documents, goals, kpiGoals, activityLog, dataTables, notifications, navigate, onClose])

  // Filter by effective category, merge in chat message results
  const filtered = useMemo(() => {
    let items = effectiveCategory
      ? allResults.filter((r) => r.type === effectiveCategory)
      : allResults

    // Merge server-side message results
    if (!effectiveCategory || effectiveCategory === 'message') {
      items = [...items, ...messageResults]
    }

    return items
  }, [allResults, messageResults, effectiveCategory])

  // Category counts for chips
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const r of allResults) {
      counts[r.type] = (counts[r.type] || 0) + 1
    }
    counts.message = (counts.message || 0) + messageResults.length
    counts.all = allResults.length + messageResults.length
    // Merge kpi into goal count for the chip display
    counts.goal = (counts.goal || 0) + (counts.kpi || 0)
    return counts
  }, [allResults, messageResults])

  // Group by type for display
  const grouped = useMemo(() => {
    const order: ResultCategory[] = ['agent', 'task', 'message', 'document', 'goal', 'kpi', 'activity', 'data', 'notification', 'action']
    const groups: Array<{ type: ResultCategory; items: SearchResult[] }> = []
    for (const t of order) {
      const items = filtered.filter((r) => r.type === t)
      if (items.length > 0) groups.push({ type: t, items })
    }
    return groups
  }, [filtered])

  const flatFiltered = useMemo(() => grouped.flatMap((g) => g.items), [grouped])

  // Keyboard nav
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, flatFiltered.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && flatFiltered[selectedIdx]) { flatFiltered[selectedIdx].action() }
  }

  useEffect(() => { setSelectedIdx(0) }, [rawQuery, activeCategory])

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
            value={rawQuery}
            onChange={(e) => setRawQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search YokeBot... (try in:docs or in:goals)"
            className="flex-1 bg-transparent text-lg text-text-main placeholder-text-muted outline-none"
          />
          <kbd className="rounded border border-border-subtle bg-light-surface-alt px-2 py-0.5 text-xs text-text-muted">ESC</kbd>
        </div>

        {/* Category chips */}
        <div className="flex flex-wrap gap-1.5 px-5 py-3 border-b border-border-subtle">
          {CATEGORIES.map((cat) => {
            const isActive = prefixCategory
              ? (cat.key === prefixCategory || (cat.key === 'goal' && prefixCategory === 'kpi'))
              : activeCategory === cat.key
            const count = categoryCounts[cat.key] ?? 0
            return (
              <button
                key={cat.key}
                onClick={() => { if (!prefixCategory) setActiveCategory(cat.key as ResultCategory | 'all') }}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-forest-green text-white'
                    : 'bg-light-surface-alt text-text-muted hover:bg-gray-200'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">{cat.icon}</span>
                {cat.label}
                {count > 0 && (
                  <span className={`ml-0.5 rounded-full px-1.5 text-[10px] font-bold ${
                    isActive ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {grouped.map((group) => (
            <div key={group.type}>
              <p className="px-5 py-2 text-xs font-bold uppercase tracking-wider text-text-muted">
                {SECTION_LABELS[group.type]}
              </p>
              {group.items.map((item) => {
                runningIdx++
                const idx = runningIdx
                return (
                  <button
                    key={`${item.type}-${idx}-${item.label.slice(0, 30)}`}
                    onClick={item.action}
                    className={`flex w-full items-center gap-3 px-5 py-3 text-left transition-colors ${
                      selectedIdx === idx ? 'bg-forest-green/5 border-l-2 border-forest-green' : 'hover:bg-light-surface-alt border-l-2 border-transparent'
                    }`}
                  >
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      selectedIdx === idx ? 'bg-forest-green/10 text-forest-green' : item.iconColor
                    }`}>
                      <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-main">{item.label}</p>
                      <p className="truncate text-xs text-text-muted">{item.detail}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {item.timestamp && (
                        <span className="text-[10px] text-text-muted">{item.timestamp}</span>
                      )}
                      {item.badge && (
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${item.badgeClass}`}>
                          {item.badge}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          ))}

          {flatFiltered.length === 0 && rawQuery && (
            <p className="py-8 text-center text-sm text-text-muted">No results found for &ldquo;{query}&rdquo;</p>
          )}

          {flatFiltered.length === 0 && !rawQuery && (
            <p className="py-8 text-center text-sm text-text-muted">Loading...</p>
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
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border-subtle bg-light-surface-alt px-1 text-[10px]">in:</kbd> Filter
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

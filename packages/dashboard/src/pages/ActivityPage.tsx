import { useState, useEffect } from 'react'
import * as engine from '@/lib/engine'
import type { ActivityLogEntry, EngineAgent } from '@/lib/engine'

const EVENT_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  agent_created:          { icon: 'add_circle',    color: 'text-green-600',  bg: 'bg-green-50' },
  agent_deleted:          { icon: 'delete',        color: 'text-red-600',    bg: 'bg-red-50' },
  agent_started:          { icon: 'play_arrow',    color: 'text-green-600',  bg: 'bg-green-50' },
  agent_stopped:          { icon: 'stop_circle',   color: 'text-gray-600',   bg: 'bg-gray-100' },
  tool_executed:          { icon: 'build',         color: 'text-blue-600',   bg: 'bg-blue-50' },
  approval_resolved:      { icon: 'gavel',         color: 'text-amber-600',  bg: 'bg-amber-50' },
  heartbeat_proactive:    { icon: 'favorite',      color: 'text-pink-600',   bg: 'bg-pink-50' },
  workflow_created:       { icon: 'account_tree',  color: 'text-green-600',  bg: 'bg-green-50' },
  workflow_updated:       { icon: 'edit',          color: 'text-blue-600',   bg: 'bg-blue-50' },
  workflow_deleted:       { icon: 'delete',        color: 'text-red-600',    bg: 'bg-red-50' },
  workflow_run_started:   { icon: 'play_arrow',    color: 'text-blue-600',   bg: 'bg-blue-50' },
  workflow_run_completed: { icon: 'check_circle',  color: 'text-green-600',  bg: 'bg-green-50' },
  workflow_run_failed:    { icon: 'error',         color: 'text-red-600',    bg: 'bg-red-50' },
  workflow_run_canceled:  { icon: 'cancel',        color: 'text-gray-600',   bg: 'bg-gray-100' },
  workflow_step_approved: { icon: 'verified_user', color: 'text-amber-600',  bg: 'bg-amber-50' },
}

const EVENT_LABELS: Record<string, string> = {
  agent_created: 'Agent Created',
  agent_deleted: 'Agent Deleted',
  agent_started: 'Agent Started',
  agent_stopped: 'Agent Stopped',
  tool_executed: 'Tool Executed',
  approval_resolved: 'Approval Resolved',
  heartbeat_proactive: 'Proactive Heartbeat',
  workflow_created: 'Workflow Created',
  workflow_updated: 'Workflow Updated',
  workflow_deleted: 'Workflow Deleted',
  workflow_run_started: 'Workflow Run Started',
  workflow_run_completed: 'Workflow Run Completed',
  workflow_run_failed: 'Workflow Run Failed',
  workflow_run_canceled: 'Workflow Run Canceled',
  workflow_step_approved: 'Step Approved',
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return d.toLocaleDateString()
}

export function ActivityPage() {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([])
  const [agents, setAgents] = useState<EngineAgent[]>([])
  const [filterAgent, setFilterAgent] = useState('')
  const [filterType, setFilterType] = useState('')
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [totalCount, setTotalCount] = useState(0)

  const loadData = async (append = false) => {
    try {
      const filters: { agentId?: string; eventType?: string; limit: number; before?: number } = { limit: 50 }
      if (filterAgent) filters.agentId = filterAgent
      if (filterType) filters.eventType = filterType
      if (append && entries.length > 0) filters.before = entries[entries.length - 1].id

      const [data, agentList, count] = await Promise.all([
        engine.listActivityLog(filters),
        append ? Promise.resolve(agents) : engine.listAgents(),
        append ? Promise.resolve({ count: totalCount }) : engine.activityCount(filterAgent || undefined),
      ])

      setEntries(append ? [...entries, ...data] : data)
      if (!append) setAgents(agentList)
      setTotalCount(count.count)
      setHasMore(data.length === 50)
    } catch { /* offline */ }
    setLoading(false)
  }

  useEffect(() => {
    setLoading(true)
    loadData()
    const interval = setInterval(() => loadData(), 10000)
    return () => clearInterval(interval)
  }, [filterAgent, filterType])

  const agentName = (id: string | null) => {
    if (!id) return 'System'
    return agents.find((a) => a.id === id)?.name ?? id.slice(0, 8)
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-text-main">Activity Log</h1>
        <p className="text-sm text-text-muted">
          Audit trail of all agent actions and system events.
          {totalCount > 0 && <span className="ml-2 font-medium">{totalCount} total events</span>}
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex gap-3">
        <select
          value={filterAgent}
          onChange={(e) => setFilterAgent(e.target.value)}
          className="rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none"
        >
          <option value="">All Agents</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none"
        >
          <option value="">All Events</option>
          {Object.entries(EVENT_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        {(filterAgent || filterType) && (
          <button
            onClick={() => { setFilterAgent(''); setFilterType('') }}
            className="text-sm text-forest-green hover:text-forest-green/80"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Timeline */}
      {loading && entries.length === 0 ? (
        <div className="py-12 text-center text-sm text-text-muted">Loading activity...</div>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-border-subtle bg-white py-12 text-center">
          <span className="material-symbols-outlined mb-2 text-4xl text-text-muted">history</span>
          <p className="text-sm text-text-muted">No activity recorded yet. Events will appear here as agents take actions.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {entries.map((entry) => {
            const config = EVENT_CONFIG[entry.eventType] ?? { icon: 'info', color: 'text-gray-600', bg: 'bg-gray-100' }
            return (
              <div key={entry.id} className="flex items-start gap-3 rounded-lg border border-border-subtle bg-white px-4 py-3">
                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${config.bg} ${config.color}`}>
                  <span className="material-symbols-outlined text-[18px]">{config.icon}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-main">{agentName(entry.agentId)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${config.bg} ${config.color}`}>
                      {EVENT_LABELS[entry.eventType] ?? entry.eventType}
                    </span>
                    <span className="ml-auto text-xs text-text-muted">{formatTime(entry.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-text-muted line-clamp-2">{entry.description}</p>
                </div>
              </div>
            )
          })}

          {hasMore && (
            <button
              onClick={() => loadData(true)}
              className="w-full rounded-lg border border-border-subtle bg-white py-3 text-sm font-medium text-text-secondary hover:bg-light-surface-alt"
            >
              Load more
            </button>
          )}
        </div>
      )}
    </div>
  )
}

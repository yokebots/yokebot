import { useState, useEffect } from 'react'
import { AgentCard, DeployNewAgentCard } from '@/components/AgentCard'
import { StatsRow } from '@/components/StatsRow'
import { CreateAgentModal } from '@/components/CreateAgentModal'
import { mockAgents } from '@/lib/mock-data'
import * as engine from '@/lib/engine'
import type { Agent } from '@/types/agent'

/** Map engine agent to dashboard Agent shape */
function toDisplayAgent(a: engine.EngineAgent): Agent {
  const iconMap: Record<string, { symbol: string; bgColor: string; textColor: string; borderColor: string }> = {
    SALES: { symbol: 'attach_money', bgColor: 'bg-blue-50', textColor: 'text-blue-600', borderColor: 'border-blue-100' },
    SUPPORT: { symbol: 'support_agent', bgColor: 'bg-purple-50', textColor: 'text-purple-600', borderColor: 'border-purple-100' },
    OPS: { symbol: 'calendar_month', bgColor: 'bg-amber-50', textColor: 'text-accent-gold', borderColor: 'border-amber-100' },
    RESEARCH: { symbol: 'travel_explore', bgColor: 'bg-pink-50', textColor: 'text-pink-500', borderColor: 'border-pink-100' },
    FINANCE: { symbol: 'receipt_long', bgColor: 'bg-green-50', textColor: 'text-green-600', borderColor: 'border-green-100' },
  }

  const dept = (a.department ?? '').toUpperCase()
  const icon = iconMap[dept] ?? { symbol: 'smart_toy', bgColor: 'bg-gray-50', textColor: 'text-gray-600', borderColor: 'border-gray-100' }

  const statusMap: Record<string, Agent['status']> = {
    running: 'active',
    stopped: 'paused',
    error: 'error',
  }

  return {
    id: a.id,
    name: a.name,
    department: a.department ?? 'GENERAL',
    status: statusMap[a.status] ?? 'offline',
    model: a.modelName,
    icon,
    channels: [],
    lastActive: new Date(a.updatedAt).toLocaleTimeString(),
    metricLabel: 'Status',
    metricValue: a.status,
    progressPercent: a.status === 'running' ? 100 : 0,
    progressColor: a.status === 'running' ? 'bg-accent-green' : 'bg-gray-300',
  }
}

export function DashboardPage() {
  const [agents, setAgents] = useState<Agent[]>(mockAgents)
  const [engineConnected, setEngineConnected] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [stats, setStats] = useState({
    activeAgents: 0,
    totalAgents: 0,
    pendingApprovals: 0,
    totalTasks: 0,
  })

  const loadData = async () => {
    try {
      const [agentList, approvalData, taskList] = await Promise.all([
        engine.listAgents(),
        engine.approvalCount(),
        engine.listTasks(),
      ])

      setEngineConnected(true)

      if (agentList.length > 0) {
        setAgents(agentList.map(toDisplayAgent))
      }
      // If no agents in engine yet, keep mock data for visual demo

      setStats({
        activeAgents: agentList.filter((a) => a.status === 'running').length,
        totalAgents: agentList.length,
        pendingApprovals: approvalData.count,
        totalTasks: taskList.length,
      })
    } catch {
      // Engine not running — use mock data
      setEngineConnected(false)
    }
  }

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="relative">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="mb-1 font-display text-3xl font-bold text-text-main">Fleet Overview</h1>
          <p className="text-sm text-text-muted">
            Manage your AI workforce and monitor real-time performance.
            {!engineConnected && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Engine offline — showing demo data
              </span>
            )}
            {engineConnected && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                Engine connected
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 rounded-lg border border-border-subtle bg-white px-4 py-2 text-sm font-medium text-text-secondary shadow-sm transition-colors hover:bg-light-surface-alt">
            <span className="material-symbols-outlined text-[18px]">filter_list</span>
            Filter
          </button>
          <button className="flex items-center gap-2 rounded-lg border border-border-subtle bg-white px-4 py-2 text-sm font-medium text-text-secondary shadow-sm transition-colors hover:bg-light-surface-alt">
            <span className="material-symbols-outlined text-[18px]">sort</span>
            Sort
          </button>
        </div>
      </div>

      {/* Stats */}
      <StatsRow
        activeAgents={stats.activeAgents}
        totalAgents={stats.totalAgents}
        pendingApprovals={stats.pendingApprovals}
        totalTasks={stats.totalTasks}
        connected={engineConnected}
      />

      {/* Agent Grid */}
      <div className="grid grid-cols-1 gap-6 pb-20 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {agents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
        <DeployNewAgentCard onClick={() => setShowCreateModal(true)} />
      </div>

      {/* FAB */}
      <button
        onClick={() => setShowCreateModal(true)}
        className="fixed bottom-8 right-8 z-30 flex h-14 w-14 transform items-center justify-center rounded-full bg-forest-green text-white shadow-lg transition-all hover:scale-105 hover:bg-forest-green/90 hover:shadow-xl"
      >
        <span className="material-symbols-outlined text-3xl font-bold">add</span>
      </button>

      {/* Create Agent Modal */}
      {showCreateModal && (
        <CreateAgentModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false)
            loadData()
          }}
        />
      )}
    </div>
  )
}

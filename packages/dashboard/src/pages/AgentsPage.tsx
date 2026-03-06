import { useState, useEffect } from 'react'
import { Link } from 'react-router'
import * as engine from '@/lib/engine'
import type { EngineAgent, ModelCreditCost } from '@/lib/engine'
import { CreateAgentModal } from '@/components/CreateAgentModal'

export function AgentsPage() {
  const [agents, setAgents] = useState<EngineAgent[]>([])
  const [modelCatalog, setModelCatalog] = useState<ModelCreditCost[]>([])
  const [showCreate, setShowCreate] = useState(false)

  const loadData = async () => {
    try {
      const [a, catalog] = await Promise.all([
        engine.listAgents(),
        engine.getModelCatalog().catch(() => [] as ModelCreditCost[]),
      ])
      setAgents(a)
      setModelCatalog(catalog)
    } catch { /* offline */ }
  }

  useEffect(() => { loadData() }, [])

  const statusDot: Record<string, string> = {
    running: 'bg-green-500',
    stopped: 'bg-gray-400',
    error: 'bg-red-500',
  }

  const statusLabel: Record<string, { bg: string; text: string }> = {
    running: { bg: 'bg-green-50', text: 'text-green-700' },
    stopped: { bg: 'bg-gray-100', text: 'text-gray-600' },
    error: { bg: 'bg-red-50', text: 'text-red-700' },
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-main">Agents</h1>
          <p className="text-sm text-text-muted">Manage and configure your AI workforce.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-forest-green/90"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          New Agent
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[...agents].sort((a, b) => {
          if (a.name === 'AdvisorBot') return -1
          if (b.name === 'AdvisorBot') return 1
          return 0
        }).map((agent) => (
          <Link
            key={agent.id}
            to={`/agents/${agent.id}`}
            className="group flex flex-col rounded-xl border border-border-subtle bg-white p-5 shadow-card transition-all hover:shadow-lg hover:border-forest-green/30"
          >
            {/* Icon + name + status */}
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-forest-green/10 text-forest-green border border-forest-green/20">
                <span className="material-symbols-outlined">smart_toy</span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot[agent.status]}`} />
                  <span className={`text-[10px] font-bold uppercase ${statusLabel[agent.status]?.text}`}>
                    {agent.status}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-text-main truncate">{agent.name}</h3>
                <p className="font-mono text-[11px] text-text-muted uppercase tracking-wide">{agent.department ?? 'General'}</p>
              </div>
            </div>

            {/* Details */}
            <div className="mt-4 space-y-2 border-t border-border-subtle pt-3 text-xs text-text-muted">
              <div className="flex justify-between">
                <span>Model</span>
                <span className="font-mono text-text-main truncate ml-2 text-right">{agent.modelName}</span>
              </div>
              <div className="flex justify-between">
                <span>Check-in</span>
                <span className="text-text-main">{agent.heartbeatSeconds >= 3600 ? `${agent.heartbeatSeconds / 3600}h` : `${agent.heartbeatSeconds / 60}m`}</span>
              </div>
              <div className="flex justify-between">
                <span>Last active</span>
                <span className="text-text-main">{new Date(agent.updatedAt).toLocaleTimeString()}</span>
              </div>
              {(() => {
                const cost = modelCatalog.find(c => c.modelId === agent.modelId)
                if (!cost) return null
                const checksPerDay = (24 * 60 * 60) / agent.heartbeatSeconds
                const daily = Math.round(checksPerDay * cost.creditsPerUse)
                return (
                  <div className="flex justify-between">
                    <span>Est. daily</span>
                    <span className="text-text-main">{daily.toLocaleString()} credits</span>
                  </div>
                )
              })()}
            </div>
          </Link>
        ))}

        {/* Deploy New Agent Card */}
        <button
          onClick={() => setShowCreate(true)}
          className="group flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border-strong bg-white p-5 transition-all hover:border-forest-green hover:bg-forest-green/5"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border-subtle bg-light-surface-alt group-hover:border-forest-green group-hover:bg-forest-green/10">
            <span className="material-symbols-outlined text-2xl text-text-muted group-hover:text-forest-green">add</span>
          </div>
          <div className="text-center">
            <h3 className="text-sm font-bold text-text-main group-hover:text-forest-green">Deploy New Agent</h3>
            <p className="text-xs text-text-muted">Choose a pre-built agent</p>
          </div>
        </button>
      </div>

      {showCreate && (
        <CreateAgentModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadData() }}
        />
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { Link } from 'react-router'
import * as engine from '@/lib/engine'
import type { EngineAgent } from '@/lib/engine'
import { CreateAgentModal } from '@/components/CreateAgentModal'

export function AgentsPage() {
  const [agents, setAgents] = useState<EngineAgent[]>([])
  const [showCreate, setShowCreate] = useState(false)

  const loadData = async () => {
    try {
      const a = await engine.listAgents()
      setAgents(a)
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
        {agents.map((agent) => (
          <Link
            key={agent.id}
            to={`/agents/${agent.id}`}
            className="group rounded-xl border border-border-subtle bg-white p-5 shadow-card transition-all hover:shadow-lg hover:border-forest-green/30"
          >
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-forest-green/10 text-forest-green border border-forest-green/20">
                  <span className="material-symbols-outlined">smart_toy</span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-text-main">{agent.name}</h3>
                  <p className="font-mono text-xs text-text-muted">{agent.department ?? 'GENERAL'}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${statusDot[agent.status]}`} />
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusLabel[agent.status]?.bg} ${statusLabel[agent.status]?.text}`}>
                  {agent.status}
                </span>
              </div>
            </div>
            <div className="space-y-2 text-xs text-text-muted">
              <div className="flex justify-between">
                <span>Model</span>
                <span className="font-mono text-text-main">{agent.modelName}</span>
              </div>
              <div className="flex justify-between">
                <span>Last active</span>
                <span>{new Date(agent.updatedAt).toLocaleTimeString()}</span>
              </div>
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

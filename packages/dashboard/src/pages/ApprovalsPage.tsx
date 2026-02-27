import { useState, useEffect } from 'react'
import * as engine from '@/lib/engine'
import type { EngineApproval, EngineAgent } from '@/lib/engine'

const riskStyle: Record<string, string> = {
  low: 'bg-gray-50 text-gray-600',
  medium: 'bg-yellow-50 text-yellow-700',
  high: 'bg-orange-50 text-orange-700',
  critical: 'bg-red-50 text-red-700',
}

export function ApprovalsPage() {
  const [approvals, setApprovals] = useState<EngineApproval[]>([])
  const [agents, setAgents] = useState<EngineAgent[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const loadData = async () => {
    try {
      const [a, ag] = await Promise.all([engine.listApprovals(), engine.listAgents()])
      setApprovals(a)
      setAgents(ag)
    } catch { /* offline */ }
  }

  useEffect(() => { loadData() }, [])

  const resolve = async (id: string, status: 'approved' | 'rejected') => {
    await engine.resolveApproval(id, status)
    setSelected((prev) => { const next = new Set(prev); next.delete(id); return next })
    loadData()
  }

  const batchResolve = async (status: 'approved' | 'rejected') => {
    await Promise.all(Array.from(selected).map((id) => engine.resolveApproval(id, status)))
    setSelected(new Set())
    loadData()
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selected.size === approvals.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(approvals.map((a) => a.id)))
    }
  }

  const getAgentName = (agentId: string) => agents.find((a) => a.id === agentId)?.name ?? 'Unknown'

  // Group approvals by agent
  const grouped = approvals.reduce<Record<string, EngineApproval[]>>((acc, a) => {
    const name = getAgentName(a.agentId)
    if (!acc[name]) acc[name] = []
    acc[name].push(a)
    return acc
  }, {})

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-main">
            Batch Approval
            {approvals.length > 0 && (
              <span className="ml-2 rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-700">
                {approvals.length} pending
              </span>
            )}
          </h1>
          <p className="text-sm text-text-muted">
            {approvals.length} pending actions &middot; {Object.keys(grouped).length} agents requiring review
          </p>
        </div>
      </div>

      {approvals.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border-subtle bg-white py-24">
          <span className="material-symbols-outlined mb-4 text-5xl text-green-500">check_circle</span>
          <h2 className="font-display text-xl font-bold text-text-main">All clear</h2>
          <p className="mt-2 text-sm text-text-muted">No pending approvals. Your agents are operating within bounds.</p>
        </div>
      ) : (
        <>
          {/* Select All */}
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-border-subtle bg-white px-4 py-3">
            <button
              onClick={selectAll}
              className={`flex h-5 w-5 items-center justify-center rounded border ${
                selected.size === approvals.length ? 'border-forest-green bg-forest-green text-white' : 'border-border-subtle'
              }`}
            >
              {selected.size === approvals.length && <span className="material-symbols-outlined text-[14px]">check</span>}
            </button>
            <span className="text-sm text-text-muted">Select all pending items</span>
            <span className="ml-auto text-sm text-text-muted">Sort by: <span className="font-medium text-text-main">Priority</span></span>
          </div>

          {/* Grouped approvals */}
          <div className="space-y-6">
            {Object.entries(grouped).map(([agentName, items]) => (
              <div key={agentName}>
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-forest-green/10 text-forest-green">
                    <span className="material-symbols-outlined text-[16px]">smart_toy</span>
                  </div>
                  <h3 className="text-sm font-bold text-text-main">{agentName}</h3>
                  <span className="text-xs text-text-muted">{items.length} pending actions</span>
                </div>

                <div className="space-y-2">
                  {items.map((approval) => (
                    <div key={approval.id} className="flex items-center gap-4 rounded-lg border border-border-subtle bg-white px-4 py-3">
                      <button
                        onClick={() => toggleSelect(approval.id)}
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                          selected.has(approval.id) ? 'border-forest-green bg-forest-green text-white' : 'border-border-subtle'
                        }`}
                      >
                        {selected.has(approval.id) && <span className="material-symbols-outlined text-[14px]">check</span>}
                      </button>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-main">{approval.actionDetail}</p>
                        <p className="text-xs text-text-muted">{approval.actionType}</p>
                      </div>

                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${riskStyle[approval.riskLevel]}`}>
                        {approval.riskLevel}
                      </span>

                      <span className="shrink-0 text-xs text-text-muted">
                        {new Date(approval.createdAt).toLocaleTimeString()}
                      </span>

                      <div className="flex shrink-0 gap-2">
                        <button
                          onClick={() => resolve(approval.id, 'rejected')}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => resolve(approval.id, 'approved')}
                          className="rounded-lg bg-forest-green px-3 py-1.5 text-xs font-medium text-white hover:bg-forest-green/90"
                        >
                          Approve
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Batch action bar */}
          {selected.size > 0 && (
            <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-xl border border-border-subtle bg-white px-6 py-3 shadow-xl">
              <span className="text-sm text-text-muted">{selected.size} of {approvals.length} tasks selected</span>
              <button
                onClick={() => batchResolve('rejected')}
                className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Reject Selected
              </button>
              <button
                onClick={() => batchResolve('approved')}
                className="rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white hover:bg-forest-green/90"
              >
                Approve Selected ({selected.size})
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

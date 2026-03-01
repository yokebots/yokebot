import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router'
import * as engine from '@/lib/engine'
import type { Workflow, WorkflowRun } from '@/lib/engine'

type FilterStatus = 'active' | 'archived' | 'all'

export function WorkflowsPage() {
  const navigate = useNavigate()
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [runs, setRuns] = useState<Map<string, WorkflowRun | null>>(new Map())
  const [filter, setFilter] = useState<FilterStatus>('active')
  const [loading, setLoading] = useState(true)

  const loadWorkflows = async () => {
    try {
      const data = await engine.listWorkflows(filter === 'all' ? undefined : filter)
      setWorkflows(data)
      // Fetch latest run for each workflow
      const allRuns = await engine.listWorkflowRuns()
      const latestByWf = new Map<string, WorkflowRun | null>()
      for (const r of allRuns) {
        if (!latestByWf.has(r.workflowId)) latestByWf.set(r.workflowId, r)
      }
      setRuns(latestByWf)
    } catch { /* offline */ }
    setLoading(false)
  }

  useEffect(() => { loadWorkflows() }, [filter])

  const handleRun = async (workflowId: string) => {
    try {
      const run = await engine.startWorkflowRun(workflowId)
      navigate(`/workflows/${workflowId}/runs/${run.id}`)
    } catch (err) {
      alert(`Failed to start workflow: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      running: 'bg-blue-50 text-blue-700',
      paused: 'bg-amber-50 text-amber-700',
      completed: 'bg-green-50 text-green-700',
      failed: 'bg-red-50 text-red-700',
      canceled: 'bg-gray-50 text-gray-600',
    }
    return styles[status] ?? 'bg-gray-50 text-gray-600'
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-main">Workflows</h1>
          <p className="mt-1 text-sm text-text-muted">Automate repeatable multi-step agent processes</p>
        </div>
        <Link
          to="/workflows/new"
          className="flex items-center gap-2 rounded-xl bg-forest-green px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-forest-green-dark transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          New Workflow
        </Link>
      </div>

      {/* Filter */}
      <div className="mb-6 flex gap-2">
        {(['all', 'active', 'archived'] as FilterStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === s ? 'bg-forest-green text-white' : 'bg-light-surface-alt text-text-secondary hover:text-text-main'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Workflow cards */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-text-muted">Loading...</div>
      ) : workflows.length === 0 ? (
        <div className="rounded-2xl border border-border-subtle bg-light-surface p-12 text-center">
          <span className="material-symbols-outlined text-[48px] text-text-muted">account_tree</span>
          <h3 className="mt-4 text-lg font-semibold text-text-main">No workflows yet</h3>
          <p className="mt-2 text-sm text-text-muted">Create your first workflow to automate multi-step processes.</p>
          <Link
            to="/workflows/new"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-forest-green px-4 py-2.5 text-sm font-medium text-white hover:bg-forest-green-dark transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Create Workflow
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {workflows.map((wf) => {
            const latestRun = runs.get(wf.id)
            return (
              <div key={wf.id} className="rounded-2xl border border-border-subtle bg-light-surface p-5 hover:border-forest-green/30 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <Link to={`/workflows/${wf.id}`} className="text-base font-semibold text-text-main hover:text-forest-green transition-colors">
                      {wf.name}
                    </Link>
                    {wf.description && (
                      <p className="mt-1 text-sm text-text-muted line-clamp-2">{wf.description}</p>
                    )}
                    <div className="mt-3 flex items-center gap-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        wf.triggerType === 'scheduled' ? 'bg-purple-50 text-purple-700' : 'bg-gray-50 text-gray-600'
                      }`}>
                        <span className="material-symbols-outlined text-[14px]">
                          {wf.triggerType === 'scheduled' ? 'schedule' : 'play_arrow'}
                        </span>
                        {wf.triggerType === 'scheduled' ? wf.scheduleCron : 'Manual'}
                      </span>
                      {wf.status === 'archived' && (
                        <span className="inline-flex items-center rounded-full bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-600">Archived</span>
                      )}
                      {latestRun && (
                        <Link
                          to={`/workflows/${wf.id}/runs/${latestRun.id}`}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge(latestRun.status)}`}
                        >
                          Last: {latestRun.status}
                        </Link>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => handleRun(wf.id)}
                      disabled={wf.status === 'archived'}
                      className="flex items-center gap-1.5 rounded-lg bg-forest-green px-3 py-1.5 text-sm font-medium text-white hover:bg-forest-green-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                      Run
                    </button>
                    <Link
                      to={`/workflows/${wf.id}`}
                      className="rounded-lg p-1.5 text-text-muted hover:bg-light-surface-alt hover:text-text-main transition-colors"
                      title="Edit"
                    >
                      <span className="material-symbols-outlined text-[18px]">edit</span>
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

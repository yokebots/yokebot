import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import * as engine from '@/lib/engine'
import type { WorkflowRunWithSteps, WorkflowWithSteps, WorkflowRunStep } from '@/lib/engine'

export function WorkflowRunPage() {
  const { id: workflowId, runId } = useParams<{ id: string; runId: string }>()
  const navigate = useNavigate()
  const [run, setRun] = useState<WorkflowRunWithSteps | null>(null)
  const [workflow, setWorkflow] = useState<WorkflowWithSteps | null>(null)
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    try {
      const [runData, wfData] = await Promise.all([
        engine.getWorkflowRun(runId!),
        engine.getWorkflow(workflowId!),
      ])
      setRun(runData)
      setWorkflow(wfData)
    } catch { /* offline */ }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [runId, workflowId])

  // Auto-refresh while running
  useEffect(() => {
    if (!run || (run.status !== 'running' && run.status !== 'paused')) return
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [run?.status])

  const handleCancel = async () => {
    if (!confirm('Cancel this workflow run? Remaining steps will be skipped.')) return
    await engine.cancelWorkflowRun(runId!)
    await loadData()
  }

  const handleApprove = async (runStepId: string) => {
    await engine.approveWorkflowRunStep(runStepId)
    await loadData()
  }

  const stepIcon = (status: WorkflowRunStep['status']) => {
    switch (status) {
      case 'pending': return { icon: 'circle', color: 'text-gray-300', bg: 'bg-gray-100' }
      case 'running': return { icon: 'pending', color: 'text-blue-500', bg: 'bg-blue-50', pulse: true }
      case 'awaiting_approval': return { icon: 'hourglass_top', color: 'text-amber-500', bg: 'bg-amber-50' }
      case 'completed': return { icon: 'check_circle', color: 'text-green-600', bg: 'bg-green-50' }
      case 'failed': return { icon: 'cancel', color: 'text-red-500', bg: 'bg-red-50' }
      case 'skipped': return { icon: 'skip_next', color: 'text-gray-400', bg: 'bg-gray-50' }
    }
  }

  const runStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      running: 'bg-blue-50 text-blue-700 border-blue-200',
      paused: 'bg-amber-50 text-amber-700 border-amber-200',
      completed: 'bg-green-50 text-green-700 border-green-200',
      failed: 'bg-red-50 text-red-700 border-red-200',
      canceled: 'bg-gray-50 text-gray-600 border-gray-200',
    }
    return styles[status] ?? 'bg-gray-50 text-gray-600 border-gray-200'
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-text-muted">Loading...</div>
  if (!run || !workflow) return <div className="flex items-center justify-center py-20 text-text-muted">Run not found</div>

  // Map step IDs to step definitions for display
  const stepDefMap = new Map(workflow.steps.map((s) => [s.id, s]))

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      {/* Header */}
      <button onClick={() => navigate(`/workflows/${workflowId}`)} className="mb-4 flex items-center gap-1 text-sm text-text-muted hover:text-text-main transition-colors">
        <span className="material-symbols-outlined text-[16px]">arrow_back</span>
        Back to {workflow.name}
      </button>

      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-main">{workflow.name}</h1>
          <div className="mt-2 flex items-center gap-3">
            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${runStatusBadge(run.status)}`}>
              {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
            </span>
            <span className="text-xs text-text-muted">
              Started {new Date(run.startedAt).toLocaleString()}
            </span>
            {run.completedAt && (
              <span className="text-xs text-text-muted">
                Completed {new Date(run.completedAt).toLocaleString()}
              </span>
            )}
          </div>
        </div>
        {(run.status === 'running' || run.status === 'paused') && (
          <button
            onClick={handleCancel}
            className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">stop</span>
            Cancel Run
          </button>
        )}
      </div>

      {/* Error */}
      {run.error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-700">Error: {run.error}</p>
        </div>
      )}

      {/* Step timeline */}
      <div className="space-y-0">
        {run.steps.map((rs, index) => {
          const stepDef = stepDefMap.get(rs.stepId)
          const iconStyle = stepIcon(rs.status)
          const isLast = index === run.steps.length - 1
          return (
            <div key={rs.id} className="relative flex gap-4">
              {/* Timeline line */}
              {!isLast && (
                <div className="absolute left-[19px] top-10 bottom-0 w-0.5 bg-border-subtle" />
              )}
              {/* Icon */}
              <div className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconStyle.bg}`}>
                <span className={`material-symbols-outlined text-[20px] ${iconStyle.color} ${iconStyle.pulse ? 'animate-pulse' : ''}`}>
                  {iconStyle.icon}
                </span>
              </div>
              {/* Content */}
              <div className={`flex-1 pb-8 ${isLast ? 'pb-0' : ''}`}>
                <div className="rounded-xl border border-border-subtle bg-light-surface p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-text-main">{stepDef?.title ?? 'Unknown Step'}</h3>
                      {stepDef?.description && (
                        <p className="mt-1 text-xs text-text-muted">{stepDef.description}</p>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          rs.status === 'completed' ? 'bg-green-50 text-green-700' :
                          rs.status === 'running' ? 'bg-blue-50 text-blue-700' :
                          rs.status === 'awaiting_approval' ? 'bg-amber-50 text-amber-700' :
                          rs.status === 'failed' ? 'bg-red-50 text-red-700' :
                          'bg-gray-50 text-gray-600'
                        }`}>
                          {rs.status.replace('_', ' ')}
                        </span>
                        {stepDef?.gate === 'approval' && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600">
                            <span className="material-symbols-outlined text-[12px]">verified_user</span>
                            Approval required
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {rs.taskId && (
                        <Link
                          to={`/tasks/${rs.taskId}`}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-forest-green hover:bg-forest-green/5 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                          View Task
                        </Link>
                      )}
                      {rs.status === 'awaiting_approval' && (
                        <button
                          onClick={() => handleApprove(rs.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-forest-green px-3 py-1.5 text-xs font-medium text-white hover:bg-forest-green-dark transition-colors"
                        >
                          <span className="material-symbols-outlined text-[14px]">check</span>
                          Approve
                        </button>
                      )}
                    </div>
                  </div>
                  {rs.error && (
                    <p className="mt-2 text-xs text-red-600">{rs.error}</p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

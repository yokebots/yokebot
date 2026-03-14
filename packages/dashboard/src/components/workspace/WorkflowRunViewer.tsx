import { useState, useEffect, useCallback, useRef } from 'react'
import type { WorkspaceState } from '@/pages/WorkspacePage'
import * as engine from '@/lib/engine'
import { useRealtimeEvent } from '@/lib/use-realtime'

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-gray-300',
  running: 'bg-amber-500 animate-pulse',
  awaiting_approval: 'bg-purple-500 animate-pulse',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
  skipped: 'bg-gray-300',
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  running: 'Running',
  awaiting_approval: 'Awaiting Approval',
  completed: 'Completed',
  failed: 'Failed',
  skipped: 'Skipped',
}

const RUN_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  running: { label: 'Running', color: 'text-amber-600 bg-amber-50' },
  paused: { label: 'Awaiting Approval', color: 'text-purple-600 bg-purple-50' },
  completed: { label: 'Completed', color: 'text-green-600 bg-green-50' },
  failed: { label: 'Failed', color: 'text-red-600 bg-red-50' },
  canceled: { label: 'Canceled', color: 'text-gray-600 bg-gray-100' },
}

interface WorkflowRunViewerProps {
  runId: string
  workspace: WorkspaceState
}

export function WorkflowRunViewer({ runId, workspace }: WorkflowRunViewerProps) {
  const [run, setRun] = useState<engine.WorkflowRunWithSteps | null>(null)
  const [workflowName, setWorkflowName] = useState('')
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState<string | null>(null)
  const [canceling, setCanceling] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadRun = useCallback(async () => {
    try {
      const r = await engine.getWorkflowRun(runId)
      setRun(r)
      // Fetch workflow name
      if (r.workflowId && !workflowName) {
        const wf = await engine.getWorkflow(r.workflowId)
        setWorkflowName(wf.name)
      }
    } catch { /* offline */ }
    setLoading(false)
  }, [runId, workflowName])

  useEffect(() => { loadRun() }, [loadRun])

  // Poll for updates while running/paused
  useEffect(() => {
    if (!run || (run.status !== 'running' && run.status !== 'paused')) return
    pollRef.current = setInterval(loadRun, 3000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [run?.status, loadRun])

  // Also listen for SSE task events
  useRealtimeEvent('task_updated', loadRun)

  const handleApprove = async (stepId: string) => {
    setApproving(stepId)
    try {
      await engine.approveWorkflowRunStep(stepId)
      await loadRun()
    } catch { /* ignore */ }
    setApproving(null)
  }

  const handleCancel = async () => {
    if (!run) return
    setCanceling(true)
    try {
      await engine.cancelWorkflowRun(run.id)
      await loadRun()
    } catch { /* ignore */ }
    setCanceling(false)
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-text-muted">
        Loading run...
      </div>
    )
  }

  if (!run) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-text-muted">
        Run not found
      </div>
    )
  }

  const runStatus = RUN_STATUS_LABEL[run.status] ?? RUN_STATUS_LABEL.running
  const isActive = run.status === 'running' || run.status === 'paused'

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle shrink-0">
        <span className="material-symbols-outlined text-[20px] text-forest-green">play_circle</span>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-text-main truncate">
            {workflowName || 'Workflow Run'}
          </h2>
          <p className="text-xs text-text-muted">
            Started {new Date(run.startedAt).toLocaleString()}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${runStatus.color}`}>
          {runStatus.label}
        </span>
        {isActive && (
          <button
            onClick={handleCancel}
            disabled={canceling}
            className="flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[14px]">cancel</span>
            {canceling ? 'Canceling...' : 'Cancel'}
          </button>
        )}
      </div>

      {/* Steps timeline */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="space-y-0">
          {(run.steps ?? []).map((step, i) => {
            const dot = STATUS_DOT[step.status] ?? STATUS_DOT.pending
            const label = STATUS_LABEL[step.status] ?? step.status
            const isAwaiting = step.status === 'awaiting_approval'
            const elapsed = step.startedAt && step.completedAt
              ? formatElapsed(new Date(step.startedAt), new Date(step.completedAt))
              : step.startedAt
              ? formatElapsed(new Date(step.startedAt), new Date())
              : null

            return (
              <div key={step.id} className="relative pl-6">
                {/* Connector line */}
                {i < (run.steps?.length ?? 0) - 1 && (
                  <div className={`absolute left-[11px] top-8 bottom-0 w-px ${
                    step.status === 'completed' ? 'bg-green-300' : 'bg-border-subtle'
                  }`} />
                )}
                {/* Status dot */}
                <div className="absolute left-[5px] top-2.5">
                  <div className={`w-3 h-3 rounded-full ${dot}`} />
                </div>
                {/* Step content */}
                <div className="pb-4 pl-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${
                      step.status === 'completed' ? 'text-text-main' :
                      step.status === 'running' || step.status === 'awaiting_approval' ? 'text-text-main' :
                      'text-text-muted'
                    }`}>
                      Step {i + 1}
                    </span>
                    <span className="text-xs text-text-muted">{label}</span>
                    {elapsed && (
                      <span className="text-[10px] text-text-muted/60">{elapsed}</span>
                    )}
                  </div>
                  {step.error && (
                    <p className="text-xs text-red-600 mt-0.5">{step.error}</p>
                  )}
                  {step.taskId && (
                    <button
                      onClick={() => workspace.setSelectedTaskId(step.taskId!)}
                      className="text-[10px] text-forest-green hover:underline mt-0.5"
                    >
                      View task
                    </button>
                  )}
                  {isAwaiting && (
                    <button
                      onClick={() => handleApprove(step.id)}
                      disabled={approving === step.id}
                      className="mt-1.5 flex items-center gap-1 rounded-md bg-forest-green px-3 py-1 text-xs font-semibold text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[14px]">check_circle</span>
                      {approving === step.id ? 'Approving...' : 'Approve'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function formatElapsed(start: Date, end: Date): string {
  const ms = end.getTime() - start.getTime()
  if (ms < 1000) return '<1s'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

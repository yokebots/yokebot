import { useState, useEffect, useCallback, useRef } from 'react'
import type { WorkspaceState } from '@/pages/WorkspacePage'
import { useRealtimeEvent } from '@/lib/use-realtime'
import * as engine from '@/lib/engine'

const GATE_LABELS: Record<string, { label: string; color: string }> = {
  auto: { label: 'Auto', color: 'bg-blue-100 text-blue-700' },
  approval: { label: 'Approval', color: 'bg-amber-100 text-amber-700' },
}

const STATUS_DOT: Record<string, string> = {
  pending: 'border-gray-300 bg-white',
  running: 'border-amber-500 bg-amber-500',
  awaiting_approval: 'border-purple-500 bg-purple-500',
  completed: 'border-green-500 bg-green-500',
  failed: 'border-red-500 bg-red-500',
  skipped: 'border-gray-300 bg-gray-100',
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  running: 'Running',
  awaiting_approval: 'Awaiting Approval',
  completed: 'Completed',
  failed: 'Failed',
  skipped: 'Skipped',
}

const RUN_STATUS_BADGE: Record<string, { label: string; color: string }> = {
  running: { label: 'Running', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  paused: { label: 'Awaiting Approval', color: 'text-purple-600 bg-purple-50 border-purple-200' },
  completed: { label: 'Completed', color: 'text-green-600 bg-green-50 border-green-200' },
  failed: { label: 'Failed', color: 'text-red-600 bg-red-50 border-red-200' },
  canceled: { label: 'Canceled', color: 'text-gray-600 bg-gray-100 border-gray-200' },
}

interface WorkflowViewerProps {
  workflowId: string
  workspace: WorkspaceState
}

export function WorkflowViewer({ workflowId, workspace }: WorkflowViewerProps) {
  const [workflow, setWorkflow] = useState<engine.WorkflowWithSteps | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)

  // Active run state — when user clicks Run, we show execution inline
  const [activeRun, setActiveRun] = useState<engine.WorkflowRunWithSteps | null>(null)
  const [approving, setApproving] = useState<string | null>(null)
  const [canceling, setCanceling] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadWorkflow = useCallback(async () => {
    try {
      const wf = await engine.getWorkflow(workflowId)
      setWorkflow(wf)
    } catch { /* offline */ }
    setLoading(false)
  }, [workflowId])

  useEffect(() => { loadWorkflow() }, [loadWorkflow])

  // Poll active run for updates
  const loadRun = useCallback(async () => {
    if (!activeRun) return
    try {
      const r = await engine.getWorkflowRun(activeRun.id)
      setActiveRun(r)
    } catch { /* offline */ }
  }, [activeRun?.id])

  useEffect(() => {
    if (!activeRun || (activeRun.status !== 'running' && activeRun.status !== 'paused')) {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }
    pollRef.current = setInterval(loadRun, 3000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [activeRun?.status, loadRun])

  // Listen for task events to refresh run
  useRealtimeEvent('task_updated', () => {
    if (activeRun) loadRun()
  })

  const handleRun = async () => {
    if (!workflow || starting) return
    setStarting(true)
    try {
      const run = await engine.startWorkflowRun(workflow.id)
      // Fetch the full run with steps
      const fullRun = await engine.getWorkflowRun(run.id)
      setActiveRun(fullRun)
      // Update the tab label to indicate it's running
      workspace.updateViewerTab(`workflow:${workflowId}`, {
        label: `${workflow.name} (Running)`,
      })
    } catch (err) {
      alert(`Failed to start workflow: ${(err as Error).message}`)
    }
    setStarting(false)
  }

  const handleApprove = async (stepId: string) => {
    setApproving(stepId)
    try {
      await engine.approveWorkflowRunStep(stepId)
      await loadRun()
    } catch { /* ignore */ }
    setApproving(null)
  }

  const handleCancel = async () => {
    if (!activeRun) return
    setCanceling(true)
    try {
      await engine.cancelWorkflowRun(activeRun.id)
      await loadRun()
    } catch { /* ignore */ }
    setCanceling(false)
  }

  const handleReset = () => {
    setActiveRun(null)
    if (workflow) {
      workspace.updateViewerTab(`workflow:${workflowId}`, {
        label: workflow.name,
      })
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-text-muted">
        Loading workflow...
      </div>
    )
  }

  if (!workflow) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-text-muted">
        Workflow not found
      </div>
    )
  }

  const sortedSteps = [...workflow.steps].sort((a, b) => a.stepOrder - b.stepOrder)
  const isRunning = activeRun && (activeRun.status === 'running' || activeRun.status === 'paused')
  const isFinished = activeRun && (activeRun.status === 'completed' || activeRun.status === 'failed' || activeRun.status === 'canceled')
  const runBadge = activeRun ? RUN_STATUS_BADGE[activeRun.status] : null

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle shrink-0">
        <span className="material-symbols-outlined text-[20px] text-forest-green">account_tree</span>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-text-main truncate">{workflow.name}</h2>
          {workflow.description && (
            <p className="text-xs text-text-muted truncate">{workflow.description}</p>
          )}
        </div>

        {/* Status badge when running */}
        {runBadge && (
          <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${runBadge.color}`}>
            {runBadge.label}
          </span>
        )}

        {/* Action buttons */}
        {!activeRun && (
          <button
            onClick={handleRun}
            disabled={starting}
            className="flex items-center gap-1.5 rounded-md bg-forest-green px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[14px]">play_arrow</span>
            {starting ? 'Starting...' : 'Run Workflow'}
          </button>
        )}

        {isRunning && (
          <button
            onClick={handleCancel}
            disabled={canceling}
            className="flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[14px]">cancel</span>
            {canceling ? 'Canceling...' : 'Cancel'}
          </button>
        )}

        {isFinished && (
          <div className="flex gap-2">
            <button
              onClick={handleReset}
              className="flex items-center gap-1 rounded-md border border-border-subtle px-2.5 py-1 text-xs font-medium text-text-main hover:bg-light-surface-alt transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">arrow_back</span>
              Back
            </button>
            <button
              onClick={handleRun}
              disabled={starting}
              className="flex items-center gap-1.5 rounded-md bg-forest-green px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[14px]">replay</span>
              {starting ? 'Starting...' : 'Run Again'}
            </button>
          </div>
        )}
      </div>

      {/* Steps timeline */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {sortedSteps.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-text-muted text-sm">
            <span className="material-symbols-outlined text-3xl text-text-muted/40">list</span>
            <p>No steps defined yet</p>
          </div>
        ) : (
          <div className="space-y-0">
            {sortedSteps.map((step, i) => {
              const gate = GATE_LABELS[step.gate] ?? GATE_LABELS.auto
              let config: Record<string, unknown> = {}
              try { config = JSON.parse(step.config) } catch { /* */ }

              // Find matching run step (if running)
              const runStep = activeRun?.steps?.find(rs => rs.stepId === step.id)
              const stepStatus = runStep?.status ?? (activeRun ? 'pending' : null)
              const dotClass = stepStatus ? STATUS_DOT[stepStatus] ?? STATUS_DOT.pending : null
              const isAwaiting = stepStatus === 'awaiting_approval'
              const isStepCompleted = stepStatus === 'completed'
              const isStepFailed = stepStatus === 'failed'

              const elapsed = runStep?.startedAt && runStep?.completedAt
                ? formatElapsed(new Date(runStep.startedAt), new Date(runStep.completedAt))
                : runStep?.startedAt
                ? formatElapsed(new Date(runStep.startedAt), new Date())
                : null

              return (
                <div key={step.id} className="relative pl-8">
                  {/* Connector line */}
                  {i < sortedSteps.length - 1 && (
                    <div className={`absolute left-[13px] top-8 bottom-0 w-px ${
                      isStepCompleted ? 'bg-green-300' : 'bg-border-subtle'
                    }`} />
                  )}

                  {/* Step indicator */}
                  {activeRun ? (
                    // Running mode: status dot
                    <div className="absolute left-[7px] top-3">
                      <div className={`w-3.5 h-3.5 rounded-full border-2 ${dotClass} ${
                        stepStatus === 'running' || stepStatus === 'awaiting_approval' ? 'animate-pulse' : ''
                      }`} />
                    </div>
                  ) : (
                    // Definition mode: numbered circle
                    <div className="absolute left-0 top-2 w-[26px] h-[26px] rounded-full border-2 border-border-subtle bg-white flex items-center justify-center">
                      <span className="text-[10px] font-bold text-text-muted">{i + 1}</span>
                    </div>
                  )}

                  {/* Step content */}
                  <div className="pb-4 pl-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-medium ${
                        isStepFailed ? 'text-red-600' :
                        isStepCompleted ? 'text-text-main' :
                        stepStatus === 'running' || isAwaiting ? 'text-text-main' :
                        activeRun ? 'text-text-muted' :
                        'text-text-main'
                      }`}>
                        {step.title}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${gate.color}`}>
                        {gate.label}
                      </span>
                      {stepStatus && (
                        <span className="text-[10px] text-text-muted">
                          {STATUS_LABEL[stepStatus]}
                        </span>
                      )}
                      {elapsed && (
                        <span className="text-[10px] text-text-muted/60">{elapsed}</span>
                      )}
                    </div>

                    {/* Description */}
                    {step.description && (
                      <p className="text-xs text-text-muted mt-0.5">{step.description}</p>
                    )}

                    {/* Step details (always shown) */}
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {step.assignedAgentId && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-text-muted/70 bg-light-surface-alt rounded px-1.5 py-0.5">
                          <span className="material-symbols-outlined text-[10px]">smart_toy</span>
                          Agent assigned
                        </span>
                      )}
                      {step.timeoutMinutes && (
                        <span className="text-[10px] text-text-muted/70 bg-light-surface-alt rounded px-1.5 py-0.5">
                          Timeout: {step.timeoutMinutes}m
                        </span>
                      )}
                      {typeof config.model === 'string' && config.model && (
                        <span className="text-[10px] text-text-muted/70 bg-light-surface-alt rounded px-1.5 py-0.5">
                          Model: {config.model}
                        </span>
                      )}
                    </div>

                    {/* Run step error */}
                    {runStep?.error && (
                      <p className="text-xs text-red-600 mt-1 bg-red-50 rounded px-2 py-1">{runStep.error}</p>
                    )}

                    {/* View task link */}
                    {runStep?.taskId && (
                      <button
                        onClick={() => workspace.setSelectedTaskId(runStep.taskId!)}
                        className="text-[10px] text-forest-green hover:underline mt-1 inline-flex items-center gap-0.5"
                      >
                        <span className="material-symbols-outlined text-[10px]">open_in_new</span>
                        View task
                      </button>
                    )}

                    {/* Approve button */}
                    {isAwaiting && runStep && (
                      <div className="mt-2">
                        <button
                          onClick={() => handleApprove(runStep.id)}
                          disabled={approving === runStep.id}
                          className="flex items-center gap-1 rounded-md bg-forest-green px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[14px]">check_circle</span>
                          {approving === runStep.id ? 'Approving...' : 'Approve & Continue'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Run completion summary */}
        {isFinished && activeRun && (
          <div className={`mt-4 rounded-lg border p-3 ${
            activeRun.status === 'completed' ? 'border-green-200 bg-green-50' :
            activeRun.status === 'failed' ? 'border-red-200 bg-red-50' :
            'border-gray-200 bg-gray-50'
          }`}>
            <div className="flex items-center gap-2">
              <span className={`material-symbols-outlined text-[18px] ${
                activeRun.status === 'completed' ? 'text-green-600' :
                activeRun.status === 'failed' ? 'text-red-600' :
                'text-gray-600'
              }`}>
                {activeRun.status === 'completed' ? 'check_circle' :
                 activeRun.status === 'failed' ? 'error' : 'cancel'}
              </span>
              <span className={`text-sm font-medium ${
                activeRun.status === 'completed' ? 'text-green-800' :
                activeRun.status === 'failed' ? 'text-red-800' :
                'text-gray-800'
              }`}>
                Workflow {activeRun.status === 'completed' ? 'completed successfully' :
                          activeRun.status === 'failed' ? 'failed' : 'was canceled'}
              </span>
            </div>
            {activeRun.error && (
              <p className="text-xs text-red-700 mt-1">{activeRun.error}</p>
            )}
            {activeRun.completedAt && (
              <p className="text-[10px] text-text-muted mt-1">
                Finished {new Date(activeRun.completedAt).toLocaleString()}
                {activeRun.startedAt && ` (${formatElapsed(new Date(activeRun.startedAt), new Date(activeRun.completedAt))})`}
              </p>
            )}
          </div>
        )}
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

import { useState, useEffect, useCallback } from 'react'
import type { WorkspaceState } from '@/pages/WorkspacePage'
import * as engine from '@/lib/engine'

const GATE_LABELS: Record<string, { label: string; color: string }> = {
  auto: { label: 'Auto', color: 'bg-blue-100 text-blue-700' },
  approval: { label: 'Approval', color: 'bg-amber-100 text-amber-700' },
}

interface WorkflowViewerProps {
  workflowId: string
  workspace: WorkspaceState
}

export function WorkflowViewer({ workflowId, workspace }: WorkflowViewerProps) {
  const [workflow, setWorkflow] = useState<engine.WorkflowWithSteps | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)

  const loadWorkflow = useCallback(async () => {
    try {
      const wf = await engine.getWorkflow(workflowId)
      setWorkflow(wf)
    } catch { /* offline */ }
    setLoading(false)
  }, [workflowId])

  useEffect(() => { loadWorkflow() }, [loadWorkflow])

  const handleRun = async () => {
    if (!workflow) return
    setStarting(true)
    try {
      const run = await engine.startWorkflowRun(workflow.id)
      workspace.addViewerTab({
        id: `workflow-run:${run.id}`,
        type: 'workflow-run',
        label: `Run — ${workflow.name}`,
        icon: 'play_circle',
        resourceId: run.id,
      })
    } catch { /* ignore */ }
    setStarting(false)
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
        <span className="text-[10px] uppercase tracking-wider text-text-muted/60 px-2 py-0.5 bg-light-surface-alt rounded">
          {workflow.triggerType}
        </span>
        <button
          onClick={handleRun}
          disabled={starting}
          className="flex items-center gap-1.5 rounded-md bg-forest-green px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 transition-colors disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[14px]">play_arrow</span>
          {starting ? 'Starting...' : 'Run'}
        </button>
      </div>

      {/* Steps list */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {workflow.steps.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-text-muted text-sm">
            <span className="material-symbols-outlined text-3xl text-text-muted/40">list</span>
            <p>No steps defined yet</p>
          </div>
        ) : (
          <div className="space-y-0">
            {workflow.steps
              .sort((a, b) => a.stepOrder - b.stepOrder)
              .map((step, i) => {
                const gate = GATE_LABELS[step.gate] ?? GATE_LABELS.auto
                let config: Record<string, unknown> = {}
                try { config = JSON.parse(step.config) } catch { /* */ }
                return (
                  <div key={step.id} className="relative pl-6">
                    {/* Connector line */}
                    {i < workflow.steps.length - 1 && (
                      <div className="absolute left-[11px] top-8 bottom-0 w-px bg-border-subtle" />
                    )}
                    {/* Step dot */}
                    <div className="absolute left-0 top-2.5 w-[22px] h-[22px] rounded-full border-2 border-border-subtle bg-white flex items-center justify-center">
                      <span className="text-[10px] font-bold text-text-muted">{i + 1}</span>
                    </div>
                    {/* Step content */}
                    <div className="pb-4 pl-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-main">{step.title}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${gate.color}`}>
                          {gate.label}
                        </span>
                      </div>
                      {step.description && (
                        <p className="text-xs text-text-muted mt-0.5">{step.description}</p>
                      )}
                      {typeof config.model === 'string' && config.model && (
                        <span className="inline-block mt-1 text-[10px] text-text-muted/70 bg-light-surface-alt rounded px-1.5 py-0.5">
                          Model: {config.model}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
          </div>
        )}
      </div>
    </div>
  )
}

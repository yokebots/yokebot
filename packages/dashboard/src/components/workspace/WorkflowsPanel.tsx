import { useState, useEffect, useCallback } from 'react'
import type { WorkspaceState } from '@/pages/WorkspacePage'
import * as engine from '@/lib/engine'

const RUN_STATUS_DOTS: Record<string, string> = {
  running: 'bg-amber-500',
  paused: 'bg-purple-500',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
  canceled: 'bg-gray-400',
}

const RUN_STATUS_LABELS: Record<string, string> = {
  running: 'Running',
  paused: 'Awaiting Approval',
  completed: 'Completed',
  failed: 'Failed',
  canceled: 'Canceled',
}

function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays < 0) {
    const futureDays = Math.abs(diffDays)
    if (futureDays === 0) return 'today'
    if (futureDays === 1) return 'tomorrow'
    if (futureDays < 7) return `in ${futureDays}d`
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

interface WorkflowsPanelProps {
  workspace: WorkspaceState
}

export function WorkflowsPanel({ workspace }: WorkflowsPanelProps) {
  const [workflows, setWorkflows] = useState<engine.Workflow[]>([])
  const [runs, setRuns] = useState<engine.WorkflowRun[]>([])
  const [tab, setTab] = useState<'active' | 'templates'>('active')
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    try {
      const [wfs, activeRuns] = await Promise.all([
        engine.listWorkflows(),
        engine.listWorkflowRuns({ status: tab === 'active' ? undefined : undefined }),
      ])
      setWorkflows(wfs)
      setRuns(activeRuns)
    } catch { /* offline */ }
    setLoading(false)
  }, [tab])

  useEffect(() => { loadData() }, [loadData])

  const activeRuns = runs.filter(r => r.status === 'running' || r.status === 'paused')
  const completedRuns = runs.filter(r => r.status === 'completed' || r.status === 'failed' || r.status === 'canceled')

  const handleWorkflowClick = (workflow: engine.Workflow) => {
    workspace.addViewerTab({
      id: `workflow:${workflow.id}`,
      type: 'workflow',
      label: workflow.name,
      icon: 'account_tree',
      resourceId: workflow.id,
    })
  }

  const handleRunClick = (run: engine.WorkflowRun) => {
    workspace.addViewerTab({
      id: `workflow-run:${run.id}`,
      type: 'workflow-run',
      label: `Run — ${getWorkflowName(run.workflowId)}`,
      icon: 'play_circle',
      resourceId: run.id,
    })
  }

  const getWorkflowName = (workflowId: string) => {
    return workflows.find(w => w.id === workflowId)?.name ?? 'Workflow'
  }

  const handleRunWorkflow = async (workflowId: string) => {
    try {
      const run = await engine.startWorkflowRun(workflowId)
      loadData()
      // Open the run in the center pane
      handleRunClick(run)
    } catch { /* ignore */ }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
        Loading workflows...
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tabs: Active Runs / Templates */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border-subtle shrink-0">
        <button
          onClick={() => setTab('active')}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            tab === 'active'
              ? 'bg-forest-green/10 text-forest-green'
              : 'text-text-muted hover:bg-light-surface-alt hover:text-text-main'
          }`}
        >
          Active Runs
          {activeRuns.length > 0 && (
            <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-forest-green px-1 text-[9px] font-bold text-white">
              {activeRuns.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('templates')}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            tab === 'templates'
              ? 'bg-forest-green/10 text-forest-green'
              : 'text-text-muted hover:bg-light-surface-alt hover:text-text-main'
          }`}
        >
          Templates
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'active' ? (
          <>
            {/* Active / paused runs */}
            {activeRuns.length === 0 && completedRuns.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-text-muted text-sm">
                <span className="material-symbols-outlined text-3xl text-text-muted/40">account_tree</span>
                <p>No workflow runs yet</p>
                <button
                  onClick={() => setTab('templates')}
                  className="text-forest-green hover:underline text-xs"
                >
                  Browse templates to get started
                </button>
              </div>
            ) : (
              <div className="divide-y divide-border-subtle">
                {activeRuns.map(run => (
                  <button
                    key={run.id}
                    onClick={() => handleRunClick(run)}
                    className="w-full text-left px-3 py-2.5 hover:bg-light-surface-alt transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${RUN_STATUS_DOTS[run.status] ?? 'bg-gray-400'}`} />
                      <span className="text-sm font-medium text-text-main truncate">
                        {getWorkflowName(run.workflowId)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 ml-4">
                      <span className="text-xs text-text-muted">
                        {RUN_STATUS_LABELS[run.status] ?? run.status}
                      </span>
                      <span className="text-xs text-text-muted/60">
                        {formatRelativeDate(run.startedAt)}
                      </span>
                    </div>
                  </button>
                ))}

                {/* Completed runs section */}
                {completedRuns.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 bg-light-surface-alt">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted/60">
                        Recent
                      </span>
                    </div>
                    {completedRuns.slice(0, 10).map(run => (
                      <button
                        key={run.id}
                        onClick={() => handleRunClick(run)}
                        className="w-full text-left px-3 py-2 hover:bg-light-surface-alt transition-colors opacity-70"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${RUN_STATUS_DOTS[run.status] ?? 'bg-gray-400'}`} />
                          <span className="text-sm text-text-main truncate">
                            {getWorkflowName(run.workflowId)}
                          </span>
                          <span className="ml-auto text-xs text-text-muted/60 shrink-0">
                            {formatRelativeDate(run.completedAt ?? run.startedAt)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          /* Templates tab */
          <>
            {workflows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-text-muted text-sm">
                <span className="material-symbols-outlined text-3xl text-text-muted/40">add_circle_outline</span>
                <p>No workflow templates yet</p>
                <p className="text-xs text-text-muted/60">Create one from the Workflows page</p>
              </div>
            ) : (
              <div className="divide-y divide-border-subtle">
                {workflows.map(workflow => (
                  <div
                    key={workflow.id}
                    className="px-3 py-2.5 hover:bg-light-surface-alt transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleWorkflowClick(workflow)}
                        className="flex-1 text-left min-w-0"
                      >
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[16px] text-text-muted">account_tree</span>
                          <span className="text-sm font-medium text-text-main truncate">
                            {workflow.name}
                          </span>
                        </div>
                        {workflow.description && (
                          <p className="text-xs text-text-muted mt-0.5 ml-6 truncate">
                            {workflow.description}
                          </p>
                        )}
                      </button>
                      <button
                        onClick={() => handleRunWorkflow(workflow.id)}
                        title="Run workflow"
                        className="shrink-0 opacity-0 group-hover:opacity-100 rounded-md p-1 text-forest-green hover:bg-forest-green/10 transition-all"
                      >
                        <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mt-1 ml-6">
                      <span className="text-[10px] text-text-muted/60 capitalize">
                        {workflow.triggerType === 'manual' ? 'Manual' :
                         workflow.triggerType === 'scheduled' ? 'Scheduled' :
                         workflow.triggerType === 'row_added' ? 'On row added' :
                         workflow.triggerType === 'row_updated' ? 'On row updated' :
                         workflow.triggerType}
                      </span>
                      <span className="text-[10px] text-text-muted/40">
                        {formatRelativeDate(workflow.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

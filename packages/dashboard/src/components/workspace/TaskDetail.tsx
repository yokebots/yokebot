import { useState, useEffect, useCallback, useRef } from 'react'
import { PanelHeader } from './PanelHeader'
import { AgentProgressPanel } from '@/components/AgentProgressPanel'
import { useAgentProgress } from '@/hooks/useAgentProgress'
import { useRealtimeEvent } from '@/lib/use-realtime'
import TagManager from '@/components/TagManager'
import type { WorkspaceState, ViewerTab } from '@/pages/WorkspacePage'
import * as engine from '@/lib/engine'

const STATUS_OPTIONS = ['backlog', 'todo', 'in_progress', 'blocked', 'review', 'done', 'archived']
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent']

function formatMessageTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (diffDays === 0) return time
  if (diffDays === 1) return `Yesterday ${time}`
  if (diffDays < 7) return `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`
}

interface TaskDetailProps {
  taskId: string
  workspace: WorkspaceState
  agents: engine.EngineAgent[]
  onBack: () => void
}

export function TaskDetail({ taskId, workspace, agents, onBack }: TaskDetailProps) {
  const [task, setTask] = useState<engine.EngineTask | null>(null)
  const [linkedFiles, setLinkedFiles] = useState<Array<{ path: string; name: string; size: number }>>([])
  const [taskMessages, setTaskMessages] = useState<engine.ChatMessage[]>([])
  const [actionLoading, setActionLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [teamUsers, setTeamUsers] = useState<Array<{ userId: string; email: string; displayName: string | null }>>([])
  const [agentColorMap, setAgentColorMap] = useState<Map<string, { color: string; icon: string; name: string }>>(new Map())
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Build agent color map for message rendering
  useEffect(() => {
    const colors = ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6']
    const icons = ['smart_toy', 'psychology', 'engineering', 'support_agent', 'memory', 'neurology', 'hub']
    const map = new Map<string, { color: string; icon: string; name: string }>()
    agents.forEach((a, i) => {
      map.set(a.id, { color: colors[i % colors.length], icon: icons[i % icons.length], name: a.name })
    })
    setAgentColorMap(map)
  }, [agents])

  // Fetch team users for assignee dropdown
  useEffect(() => {
    engine.getMentionCompletions().then(data => setTeamUsers(data.users)).catch(() => {})
  }, [])

  // Live tool streaming: show agent progress for this task
  const { progressMap } = useAgentProgress()

  // Load everything in a single API call
  const loadAll = useCallback(async () => {
    try {
      setLoadError(false)
      const detail = await engine.getTaskDetail(taskId)
      setTask(detail.task)
      setLinkedFiles(detail.files)
      setTaskMessages(detail.messages)
    } catch {
      setLoadError(true)
    }
  }, [taskId])

  useEffect(() => { loadAll() }, [loadAll])

  // Refresh task messages when new messages arrive via SSE
  useRealtimeEvent<{ channelId: string; messageId: number }>('new_message', () => {
    // Refresh — the message might be tagged with this task
    engine.getTaskDetail(taskId).then(detail => {
      setTaskMessages(detail.messages)
    }).catch(() => {})
  })

  // Scroll to bottom of task messages when they update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [taskMessages.length])

  const updateField = async (field: string, value: string | null) => {
    // Optimistic update so the UI feels instant
    setTask(prev => prev ? { ...prev, [field]: value } : prev)
    try {
      const updated = await engine.updateTask(taskId, { [field]: value })
      setTask(prev => prev ? { ...prev, ...updated } : prev)
    } catch {
      // Revert on failure
      loadAll()
    }
  }

  const openFile = (path: string) => {
    const name = path.split('/').pop() ?? path
    const tab: ViewerTab = {
      id: `file:${path}`,
      type: 'file',
      label: name,
      icon: 'description',
      resourceId: path,
    }
    workspace.addViewerTab(tab)
  }

  if (!task) {
    return (
      <div className="flex flex-col h-full">
        <PanelHeader icon="task_alt" title="Task" actions={
          <button onClick={onBack} className="rounded p-1 text-text-muted hover:bg-light-surface-alt">
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          </button>
        } />
        <div className="flex-1 flex items-center justify-center text-sm text-text-muted">
          {loadError ? (
            <div className="text-center space-y-2">
              <p>Failed to load task</p>
              <button onClick={loadAll} className="text-xs text-forest-green hover:underline">Retry</button>
            </div>
          ) : 'Loading...'}
        </div>
      </div>
    )
  }

  // Filter progress steps to only those for this task's assigned agent, scoped to this task
  const agentSteps = task.assignedAgentId
    ? (progressMap.get(task.assignedAgentId) ?? []).filter(s => !s.taskId || s.taskId === taskId)
    : []

  const handleDelete = async () => {
    if (!confirm('Delete this task? This cannot be undone.')) return
    setActionLoading(true)
    try {
      await engine.deleteTask(taskId)
      onBack()
    } catch { /* ignore */ }
    setActionLoading(false)
  }

  const handleRetry = async () => {
    setActionLoading(true)
    try {
      const updated = await engine.retryTask(taskId)
      setTask(prev => prev ? { ...prev, ...updated } : prev)
    } catch { /* ignore */ }
    setActionLoading(false)
  }

  const handleUnblock = async () => {
    setActionLoading(true)
    try {
      const updated = await engine.unblockTask(taskId)
      setTask(prev => prev ? { ...prev, ...updated } : prev)
    } catch { /* ignore */ }
    setActionLoading(false)
  }

  const handleApprovalAction = async (status: 'approved' | 'rejected') => {
    if (!task.blockedApprovalId) return
    setActionLoading(true)
    try {
      await engine.resolveApproval(task.blockedApprovalId, status)
      // Refresh task (resolveApproval auto-unblocks)
      const detail = await engine.getTaskDetail(taskId)
      setTask(detail.task)
    } catch { /* ignore */ }
    setActionLoading(false)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with back button */}
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2 shrink-0">
        <button onClick={onBack} className="rounded p-0.5 text-text-muted hover:bg-light-surface-alt hover:text-text-main">
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        </button>
        <span className="material-symbols-outlined text-[16px] text-text-muted">task_alt</span>
        <span className="text-sm font-semibold text-text-main truncate flex-1">{task.title}</span>
        <button
          onClick={handleDelete}
          disabled={actionLoading}
          className="rounded p-0.5 text-text-muted hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
          title="Delete task"
        >
          <span className="material-symbols-outlined text-[16px]">delete</span>
        </button>
      </div>

      {/* Blocked banner — distinct per reason */}
      {task.status === 'blocked' && (() => {
        const reason = task.blockedReason
        // Parse structured error context (system_error stores JSON in blockedReasonText)
        let errorCtx: { error?: string; phase?: string; model?: string; sprintCount?: number; suggestion?: string } | null = null
        if ((reason === 'system_error' || reason === 'max_retries') && task.blockedReasonText) {
          try { errorCtx = JSON.parse(task.blockedReasonText) } catch { /* plain text fallback */ }
        }

        const bannerStyle =
          reason === 'system_error' || reason === 'max_retries' ? 'bg-red-50 border-red-200' :
          reason === 'approval_pending' ? 'bg-orange-50 border-orange-200' :
          reason === 'needs_input' ? 'bg-purple-50 border-purple-200' :
          'bg-gray-50 border-gray-200'

        const iconColor =
          reason === 'system_error' || reason === 'max_retries' ? 'text-red-600' :
          reason === 'approval_pending' ? 'text-orange-600' :
          reason === 'needs_input' ? 'text-purple-600' :
          'text-gray-500'

        const icon =
          reason === 'system_error' || reason === 'max_retries' ? 'error' :
          reason === 'approval_pending' ? 'gpp_maybe' :
          reason === 'needs_input' ? 'help' :
          'block'

        return (
          <div className={`px-3 py-2.5 border-b shrink-0 ${bannerStyle}`}>
            <div className="flex items-start gap-2">
              <span className={`material-symbols-outlined text-[18px] mt-0.5 ${iconColor}`}>{icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-text-main">
                  {(reason === 'system_error' || reason === 'max_retries') && 'System Error'}
                  {reason === 'approval_pending' && 'Approval Required'}
                  {reason === 'needs_input' && 'Agent Needs Your Input'}
                  {reason === 'dependency' && 'Blocked by Another Task'}
                  {reason === 'manual' && 'Manually Blocked'}
                  {!reason && 'Task is Blocked'}
                </p>
                {/* System error: show structured details */}
                {(reason === 'system_error' || reason === 'max_retries') && errorCtx && (
                  <div className="mt-1.5 space-y-1">
                    <p className="text-[11px] text-red-700 bg-red-100/60 rounded px-2 py-1 font-mono whitespace-pre-wrap line-clamp-6">
                      {errorCtx.error}
                    </p>
                    {errorCtx.phase && (
                      <p className="text-[10px] text-text-secondary">
                        Phase: <span className="font-medium">{errorCtx.phase}</span>
                        {errorCtx.model && <> &middot; Model: <span className="font-medium">{errorCtx.model}</span></>}
                        {errorCtx.sprintCount && <> &middot; Attempts: <span className="font-medium">{errorCtx.sprintCount}</span></>}
                      </p>
                    )}
                    {errorCtx.suggestion && (
                      <p className="text-[11px] text-text-secondary italic">{errorCtx.suggestion}</p>
                    )}
                  </div>
                )}
                {/* System error without JSON: show raw text */}
                {(reason === 'system_error' || reason === 'max_retries') && !errorCtx && task.blockedReasonText && (
                  <p className="text-[11px] text-text-secondary mt-1 whitespace-pre-wrap line-clamp-6">{task.blockedReasonText}</p>
                )}
                {/* Approval: show action detail */}
                {reason === 'approval_pending' && task.blockedReasonText && (
                  <p className="text-[11px] text-text-secondary mt-1 whitespace-pre-wrap line-clamp-4">{task.blockedReasonText}</p>
                )}
                {/* Needs input: show the question */}
                {reason === 'needs_input' && task.blockedReasonText && (
                  <p className="text-[11px] text-purple-700 mt-1 whitespace-pre-wrap line-clamp-4">{task.blockedReasonText}</p>
                )}
                {/* Fallback for other reasons */}
                {reason !== 'system_error' && reason !== 'max_retries' && reason !== 'approval_pending' && reason !== 'needs_input' && task.blockedReasonText && (
                  <p className="text-[11px] text-text-secondary mt-1 whitespace-pre-wrap line-clamp-4">{task.blockedReasonText}</p>
                )}
              </div>
              <div className="flex gap-1.5 shrink-0">
                {(reason === 'system_error' || reason === 'max_retries') && (
                  <button
                    onClick={handleRetry}
                    disabled={actionLoading}
                    className="rounded-lg bg-red-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Retry Now
                  </button>
                )}
                {reason === 'approval_pending' && (
                  <>
                    <button
                      onClick={() => handleApprovalAction('rejected')}
                      disabled={actionLoading}
                      className="rounded-lg border border-red-200 px-2.5 py-1 text-[10px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleApprovalAction('approved')}
                      disabled={actionLoading}
                      className="rounded-lg bg-forest-green px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-forest-green/90 disabled:opacity-50"
                    >
                      Approve
                    </button>
                  </>
                )}
                {reason === 'needs_input' && (
                  <button
                    onClick={handleUnblock}
                    disabled={actionLoading}
                    className="rounded-lg bg-purple-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
                  >
                    Answered
                  </button>
                )}
                {(reason === 'manual' || reason === 'dependency' || !reason) && (
                  <button
                    onClick={handleUnblock}
                    disabled={actionLoading}
                    className="rounded-lg bg-forest-green px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-forest-green/90 disabled:opacity-50"
                  >
                    Unblock
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Live agent progress (tool streaming) */}
      {agentSteps.length > 0 && (
        <div className="px-3 py-2 border-b border-border-subtle shrink-0">
          <AgentProgressPanel steps={agentSteps} defaultExpanded={true} />
        </div>
      )}

      {/* Task details + thread (scrollable) */}
      <div className="flex-1 overflow-y-auto">
        {/* Status + Priority + Agent */}
        <div className="px-3 py-3 space-y-2.5 border-b border-border-subtle">
          {/* Status */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted w-14">Status</span>
            <select
              value={task.status}
              onChange={(e) => updateField('status', e.target.value)}
              className="rounded border border-border-subtle px-2 py-0.5 text-xs focus:border-forest-green focus:outline-none"
            >
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </div>
          {/* Priority */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted w-14">Priority</span>
            <select
              value={task.priority ?? 'medium'}
              onChange={(e) => updateField('priority', e.target.value)}
              className="rounded border border-border-subtle px-2 py-0.5 text-xs focus:border-forest-green focus:outline-none"
            >
              {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          {/* Tags */}
          <div className="flex items-start gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted w-14 mt-1">Tags</span>
            <TagManager
              resourceType="task"
              resourceId={taskId}
              currentTags={task.tags ?? []}
              onTagsChange={(tags) => setTask((prev) => prev ? { ...prev, tags } : prev)}
            />
          </div>
          {/* Assigned agent (reassignable) */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted w-14">Agent</span>
            <select
              value={task.assignedAgentId ?? ''}
              onChange={(e) => updateField('assignedAgentId', e.target.value || null!)}
              className="rounded border border-border-subtle px-2 py-0.5 text-xs focus:border-forest-green focus:outline-none"
            >
              <option value="">Unassigned</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          {/* Assigned human user */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted w-14">Assignee</span>
            <select
              value={task.assignedUserId ?? ''}
              onChange={(e) => updateField('assignedUserId', e.target.value || null!)}
              className="rounded border border-border-subtle px-2 py-0.5 text-xs focus:border-forest-green focus:outline-none"
            >
              <option value="">Unassigned</option>
              {teamUsers.map(u => (
                <option key={u.userId} value={u.userId}>{u.displayName || u.email.split('@')[0]}</option>
              ))}
            </select>
          </div>
          {/* Credit Estimate */}
          {task.estimatedCredits != null && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted w-14">Est.</span>
              <div className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px] text-amber-500">toll</span>
                <span className="text-xs text-text-main">{task.estimatedCredits.toLocaleString()} credits</span>
              </div>
            </div>
          )}
          {/* Description */}
          {task.description && (
            <p className="text-xs text-text-secondary leading-relaxed">{task.description}</p>
          )}
          {/* Agent Notes (scratchpad) */}
          {task.scratchpad && (
            <div className="mt-3 rounded-lg bg-surface-secondary p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="material-symbols-outlined text-[14px] text-text-secondary">note_alt</span>
                <span className="text-[11px] font-medium text-text-secondary">Agent Notes</span>
              </div>
              <p className="text-[11px] text-text-secondary whitespace-pre-wrap">{task.scratchpad}</p>
            </div>
          )}
        </div>

        {/* Linked files */}
        {linkedFiles.length > 0 && (
          <div className="px-3 py-2 border-b border-border-subtle">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">Linked Files</p>
            {linkedFiles.map(f => (
              <button
                key={f.path}
                onClick={() => openFile(f.path)}
                className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs text-forest-green hover:bg-forest-green/10 transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">description</span>
                <span className="truncate">{f.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Related chat messages — mirrored from main chat, tagged with this task */}
        <div className="px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">
            Related Messages {taskMessages.length > 0 && <span className="text-text-muted/60">({taskMessages.length})</span>}
          </p>
          {taskMessages.length === 0 ? (
            <p className="text-xs text-text-muted/60 italic">No messages tagged with this task yet</p>
          ) : (
            <div className="space-y-1.5">
              {taskMessages.map(msg => (
                <button
                  key={msg.id}
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('yokebot:scroll-to-message', { detail: { messageId: msg.id } }))
                  }}
                  className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-gray-100 transition-colors group"
                >
                  {/* Sender avatar/icon */}
                  <div className="shrink-0 mt-0.5">
                    {msg.senderType === 'agent' ? (
                      <div
                        className="h-5 w-5 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: agentColorMap.get(msg.senderId)?.color ?? '#6b7280' }}
                      >
                        <span className="material-symbols-outlined text-[12px] text-white">
                          {agentColorMap.get(msg.senderId)?.icon ?? 'smart_toy'}
                        </span>
                      </div>
                    ) : (
                      <div className="h-5 w-5 rounded-full bg-forest-green flex items-center justify-center">
                        <span className="text-[10px] font-bold text-white">
                          {(msg.senderId === 'system' ? 'S' : 'H')}
                        </span>
                      </div>
                    )}
                  </div>
                  {/* Content preview */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[11px] font-medium text-text-main truncate">
                        {msg.senderType === 'agent'
                          ? (agentColorMap.get(msg.senderId)?.name ?? 'Agent')
                          : (msg.senderId === 'system' ? 'System' : 'You')}
                      </span>
                      <span className="text-[10px] text-text-muted/60 shrink-0">
                        {formatMessageTime(msg.createdAt)}
                      </span>
                    </div>
                    <p className="text-[11px] text-text-muted line-clamp-2 leading-relaxed">
                      {msg.content.replace(/[#*_~`>\[\]()]/g, '').slice(0, 200)}
                    </p>
                  </div>
                  {/* Jump indicator */}
                  <span className="material-symbols-outlined text-[14px] text-text-muted/40 group-hover:text-forest-green shrink-0 mt-1">
                    open_in_new
                  </span>
                </button>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

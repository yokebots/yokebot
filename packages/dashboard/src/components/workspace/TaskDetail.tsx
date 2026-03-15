import { useState, useEffect, useCallback, useRef } from 'react'
import { PanelHeader } from './PanelHeader'
import { MessageBubble } from './ThreadView'
import { MentionInput } from '@/components/MentionInput'
import { AgentProgressPanel } from '@/components/AgentProgressPanel'
import { useAgentProgress } from '@/hooks/useAgentProgress'
import TagManager from '@/components/TagManager'
import type { WorkspaceState, ViewerTab } from '@/pages/WorkspacePage'
import * as engine from '@/lib/engine'

const STATUS_OPTIONS = ['backlog', 'todo', 'in_progress', 'blocked', 'review', 'done', 'archived']
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent']

interface TaskDetailProps {
  taskId: string
  workspace: WorkspaceState
  agents: engine.EngineAgent[]
  onBack: () => void
}

export function TaskDetail({ taskId, workspace, agents, onBack }: TaskDetailProps) {
  const [task, setTask] = useState<engine.EngineTask | null>(null)
  const [threadMessages, setThreadMessages] = useState<engine.ChatMessage[]>([])
  const [threadChannelId, setThreadChannelId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [linkedFiles, setLinkedFiles] = useState<Array<{ path: string; name: string; size: number }>>([])
  const [actionLoading, setActionLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [completions, setCompletions] = useState<engine.MentionCompletionData | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Live tool streaming: show agent progress for this task
  const { progressMap } = useAgentProgress()

  // Build agent color map
  const agentColorMap = new Map(
    agents.map(a => [a.id, { color: a.iconColor ?? '#0F4D26', icon: a.iconName ?? 'smart_toy', name: a.name }])
  )

  // Load everything in a single API call
  const loadAll = useCallback(async () => {
    try {
      setLoadError(false)
      const detail = await engine.getTaskDetail(taskId)
      setTask(detail.task)
      setThreadChannelId(detail.channelId)
      setThreadMessages(detail.messages)
      setLinkedFiles(detail.files)
    } catch {
      setLoadError(true)
    }
  }, [taskId])

  useEffect(() => { loadAll() }, [loadAll])

  // Fetch mention completions for the reply input
  useEffect(() => {
    engine.getMentionCompletions().then(setCompletions).catch(() => {})
  }, [])

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

  const sendReply = async () => {
    const text = replyText.trim()
    if (!text || !threadChannelId || sending) return
    setSending(true)
    try {
      const msg = await engine.sendMessage(threadChannelId, {
        senderType: 'human',
        senderId: 'user',
        content: text,
      })
      setThreadMessages(prev => [...prev, msg])
      setReplyText('')
    } catch { /* ignore */ }
    setSending(false)
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

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [threadMessages.length])

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

      {/* Blocked banner */}
      {task.status === 'blocked' && (
        <div className={`px-3 py-2.5 border-b shrink-0 ${
          task.blockedReason === 'max_retries' ? 'bg-amber-50 border-amber-200' :
          task.blockedReason === 'approval_pending' ? 'bg-blue-50 border-blue-200' :
          'bg-gray-50 border-gray-200'
        }`}>
          <div className="flex items-center gap-2">
            <span className={`material-symbols-outlined text-[18px] ${
              task.blockedReason === 'max_retries' ? 'text-amber-600' :
              task.blockedReason === 'approval_pending' ? 'text-blue-600' :
              'text-gray-500'
            }`}>
              {task.blockedReason === 'approval_pending' ? 'hourglass_top' : 'error'}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-text-main">
                {task.blockedReason === 'max_retries' && `Agent failed after ${task.sprintCount} attempts`}
                {task.blockedReason === 'approval_pending' && 'Waiting for approval'}
                {task.blockedReason === 'dependency' && 'Blocked by another task'}
                {task.blockedReason === 'manual' && 'Manually blocked'}
                {!task.blockedReason && 'Task is blocked'}
              </p>
              {task.blockedReasonText && (
                <p className="text-[11px] text-text-secondary mt-1 whitespace-pre-wrap line-clamp-4">
                  {task.blockedReasonText}
                </p>
              )}
            </div>
            <div className="flex gap-1.5 shrink-0">
              {task.blockedReason === 'max_retries' && (
                <button
                  onClick={handleRetry}
                  disabled={actionLoading}
                  className="rounded-lg bg-amber-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  Retry
                </button>
              )}
              {task.blockedReason === 'approval_pending' && (
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
              {(task.blockedReason === 'manual' || task.blockedReason === 'dependency') && (
                <button
                  onClick={handleUnblock}
                  disabled={actionLoading}
                  className="rounded-lg bg-forest-green px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-forest-green/90 disabled:opacity-50"
                >
                  Unblock
                </button>
              )}
              {!task.blockedReason && (
                <button
                  onClick={handleRetry}
                  disabled={actionLoading}
                  className="rounded-lg bg-forest-green px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-forest-green/90 disabled:opacity-50"
                >
                  Unblock
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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

        {/* Task thread */}
        <div className="px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">Thread</p>
          <div ref={scrollRef} className="space-y-1">
            {threadMessages.length === 0 && (
              <p className="text-xs text-text-muted py-2">No messages in this task thread yet</p>
            )}
            {threadMessages.map(msg => (
              <MessageBubble key={msg.id} message={msg} agentColorMap={agentColorMap} />
            ))}
          </div>
        </div>
      </div>

      {/* Reply input — MentionInput with @mention support */}
      <div className="px-3 py-2 border-t border-border-subtle shrink-0">
        <MentionInput
          value={replyText}
          onChange={setReplyText}
          onSubmit={sendReply}
          placeholder="Reply to task thread... (@mention an agent)"
          completions={completions}
          disabled={sending}
        />
      </div>
    </div>
  )
}

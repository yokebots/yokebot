import { useState, useEffect, useCallback, useRef } from 'react'
import { PanelHeader } from './PanelHeader'
import { MessageBubble } from './ThreadView'
import TagManager from '@/components/TagManager'
import type { WorkspaceState, ViewerTab } from '@/pages/WorkspacePage'
import * as engine from '@/lib/engine'

const STATUS_OPTIONS = ['backlog', 'todo', 'in_progress', 'review', 'done']
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
  const scrollRef = useRef<HTMLDivElement>(null)

  // Build agent color map
  const agentColorMap = new Map(
    agents.map(a => [a.id, { color: a.iconColor ?? '#0F4D26', icon: a.iconName ?? 'smart_toy', name: a.name }])
  )

  // Load task details, thread, and linked files in parallel
  const loadAll = useCallback(async () => {
    const [taskResult, threadResult, filesResult] = await Promise.allSettled([
      engine.listTasks().then(tasks => tasks.find(t => t.id === taskId) ?? null),
      engine.getTaskThread(taskId).then(async (channel) => {
        const msgs = await engine.getMessages(channel.id, 50)
        return { channelId: channel.id, msgs }
      }),
      engine.getFilesByTask(taskId),
    ])
    if (taskResult.status === 'fulfilled' && taskResult.value) setTask(taskResult.value)
    if (threadResult.status === 'fulfilled') {
      setThreadChannelId(threadResult.value.channelId)
      setThreadMessages(threadResult.value.msgs)
    }
    if (filesResult.status === 'fulfilled') setLinkedFiles(filesResult.value)
  }, [taskId])

  useEffect(() => { loadAll() }, [loadAll])

  // Mark task as read
  useEffect(() => {
    engine.markTaskRead(taskId).catch(() => {})
  }, [taskId])

  const updateField = async (field: string, value: string) => {
    try {
      const updated = await engine.updateTask(taskId, { [field]: value })
      setTask(prev => prev ? { ...prev, ...updated } : prev)
    } catch { /* ignore */ }
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
        <div className="flex-1 flex items-center justify-center text-sm text-text-muted">Loading...</div>
      </div>
    )
  }

  const assignedAgent = task.assignedAgentId ? agents.find(a => a.id === task.assignedAgentId) : null

  return (
    <div className="flex flex-col h-full">
      {/* Header with back button */}
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2 shrink-0">
        <button onClick={onBack} className="rounded p-0.5 text-text-muted hover:bg-light-surface-alt hover:text-text-main">
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        </button>
        <span className="material-symbols-outlined text-[16px] text-text-muted">task_alt</span>
        <span className="text-sm font-semibold text-text-main truncate flex-1">{task.title}</span>
      </div>

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
          {/* Assigned agent */}
          {assignedAgent && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted w-14">Agent</span>
              <div className="flex items-center gap-1">
                <span
                  className="material-symbols-outlined text-[14px]"
                  style={{ color: assignedAgent.iconColor ?? '#0F4D26' }}
                >
                  {assignedAgent.iconName ?? 'smart_toy'}
                </span>
                <span className="text-xs text-text-main">{assignedAgent.name}</span>
              </div>
            </div>
          )}
          {/* Description */}
          {task.description && (
            <p className="text-xs text-text-secondary leading-relaxed">{task.description}</p>
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

      {/* Reply input */}
      <div className="px-3 py-2 border-t border-border-subtle shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
            placeholder="Reply to task thread..."
            className="flex-1 rounded-lg border border-border-subtle px-2.5 py-1.5 text-xs focus:border-forest-green focus:outline-none"
          />
          <button
            onClick={sendReply}
            disabled={!replyText.trim() || sending}
            className="rounded-lg bg-forest-green px-3 py-1.5 text-xs text-white hover:bg-forest-green/90 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

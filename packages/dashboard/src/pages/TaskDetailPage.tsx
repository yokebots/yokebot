import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router'
import * as engine from '@/lib/engine'
import type { EngineTask, EngineAgent, ChatMessage } from '@/lib/engine'

const statusOptions = ['backlog', 'todo', 'in_progress', 'review', 'done'] as const
const priorityOptions = ['low', 'medium', 'high', 'urgent'] as const

const statusStyle: Record<string, string> = {
  backlog: 'bg-gray-100 text-gray-700',
  todo: 'bg-blue-50 text-blue-700',
  in_progress: 'bg-green-50 text-green-700',
  review: 'bg-amber-50 text-amber-700',
  done: 'bg-forest-green/10 text-forest-green',
}

const priorityStyle: Record<string, string> = {
  urgent: 'bg-red-50 text-red-700',
  high: 'bg-orange-50 text-orange-700',
  medium: 'bg-blue-50 text-blue-700',
  low: 'bg-gray-50 text-gray-600',
}

const FILE_ICONS: Record<string, string> = {
  'application/pdf': 'picture_as_pdf',
  'text/plain': 'description',
  'text/csv': 'table_chart',
  'text/markdown': 'description',
  'application/json': 'data_object',
  'application/zip': 'folder_zip',
}

function getFileIcon(type: string): string {
  if (type.startsWith('image/')) return 'image'
  return FILE_ICONS[type] ?? 'attach_file'
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function TaskDetailPage() {
  const { taskId } = useParams()
  const navigate = useNavigate()
  const [task, setTask] = useState<EngineTask | null>(null)
  const [subtasks, setSubtasks] = useState<EngineTask[]>([])
  const [agents, setAgents] = useState<EngineAgent[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [channelId, setChannelId] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [newSubtask, setNewSubtask] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [uploading, setUploading] = useState(false)
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const headerImageInputRef = useRef<HTMLInputElement>(null)

  const loadData = async () => {
    if (!taskId) return
    try {
      const [t, a, subs] = await Promise.all([
        engine.listTasks().then((ts) => ts.find((t) => t.id === taskId) ?? null),
        engine.listAgents(),
        engine.listTasks({ parentId: taskId }),
      ])
      setTask(t)
      setAgents(a)
      setSubtasks(subs)

      const thread = await engine.getTaskThread(taskId)
      setChannelId(thread.id)
      const msgs = await engine.getMessages(thread.id)
      setMessages(msgs)
    } catch { /* offline */ }
  }

  useEffect(() => { loadData() }, [taskId])

  const updateField = async (field: string, value: unknown) => {
    if (!taskId) return
    await engine.updateTask(taskId, { [field]: value })
    loadData()
  }

  const sendMsg = async () => {
    if (!newMessage.trim() || !channelId) return
    await engine.sendMessage(channelId, {
      senderType: 'human',
      senderId: 'user',
      content: newMessage.trim(),
      taskId,
    })
    setNewMessage('')
    loadData()
  }

  const addSubtask = async () => {
    if (!newSubtask.trim() || !taskId) return
    await engine.createTask({ title: newSubtask.trim(), parentTaskId: taskId })
    setNewSubtask('')
    loadData()
  }

  const handleHeaderImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !taskId) return
    setUploading(true)
    try {
      await engine.setTaskHeaderImage(taskId, file)
      loadData()
    } catch { /* error */ }
    setUploading(false)
    e.target.value = ''
  }

  const handleRemoveHeaderImage = async () => {
    if (!taskId) return
    await engine.removeTaskHeaderImage(taskId)
    loadData()
  }

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || !taskId) return
    setUploading(true)
    for (const file of Array.from(files)) {
      try {
        await engine.uploadTaskAttachment(taskId, file)
      } catch { /* error */ }
    }
    loadData()
    setUploading(false)
    e.target.value = ''
  }

  const handleRemoveAttachment = async (index: number) => {
    if (!taskId) return
    await engine.removeTaskAttachment(taskId, index)
    loadData()
  }

  const handleDelete = async () => {
    if (!taskId) return
    await engine.deleteTask(taskId)
    navigate('/tasks')
  }

  if (!task) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-text-muted">Loading task...</p>
      </div>
    )
  }

  const assignedAgent = agents.find((a) => a.id === task.assignedAgentId)
  const engineUrl = import.meta.env.VITE_ENGINE_URL ?? 'http://localhost:3001'

  return (
    <div className="mx-auto max-w-6xl">
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm text-text-muted">
        <Link to="/tasks" className="hover:text-forest-green">Tasks</Link>
        <span>/</span>
        <span className="text-text-main font-medium">{task.title}</span>
      </div>

      {/* Header Image */}
      {task.headerImage && (
        <div className="group relative mb-6 overflow-hidden rounded-xl border border-border-subtle">
          <img
            src={`${engineUrl}${task.headerImage}`}
            alt="Task header"
            className="h-48 w-full object-cover"
          />
          <div className="absolute inset-0 flex items-start justify-end bg-black/0 p-3 opacity-0 transition-opacity group-hover:bg-black/20 group-hover:opacity-100">
            <button
              onClick={handleRemoveHeaderImage}
              className="rounded-lg bg-white/90 px-3 py-1.5 text-xs font-medium text-red-600 shadow-sm hover:bg-white"
            >
              <span className="material-symbols-outlined text-[14px] align-middle">delete</span> Remove
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-6">
        {/* Left Column - Main Content */}
        <div className="flex-1 min-w-0">
          {/* Title & Status */}
          <h1 className="mb-2 font-display text-2xl font-bold text-text-main">{task.title}</h1>
          <div className="mb-6 flex items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusStyle[task.status]}`}>
              {task.status.replace('_', ' ')}
            </span>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${priorityStyle[task.priority]}`}>
              {task.priority}
            </span>
          </div>

          {/* Description */}
          <div className="mb-6 rounded-lg border border-border-subtle bg-white p-4">
            <h3 className="mb-2 text-sm font-bold text-text-main">Description</h3>
            <p className="text-sm text-text-muted whitespace-pre-wrap">
              {task.description || 'No description yet.'}
            </p>
          </div>

          {/* Attachments */}
          <div className="mb-6 rounded-lg border border-border-subtle bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-text-main">
                Attachments
                {task.attachments.length > 0 && (
                  <span className="ml-2 text-text-muted font-normal">{task.attachments.length}</span>
                )}
              </h3>
              <div className="flex items-center gap-2">
                {!task.headerImage && (
                  <button
                    onClick={() => headerImageInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-text-muted hover:bg-light-surface-alt hover:text-text-main transition-colors disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[14px]">add_photo_alternate</span>
                    Cover
                  </button>
                )}
                <button
                  onClick={() => attachmentInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1 rounded-lg bg-light-surface-alt px-3 py-1 text-xs font-medium text-text-secondary hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[14px]">attach_file</span>
                  {uploading ? 'Uploading...' : 'Add File'}
                </button>
              </div>
            </div>

            {task.attachments.length === 0 ? (
              <p className="py-3 text-center text-xs text-text-muted">No attachments yet.</p>
            ) : (
              <div className="space-y-2">
                {task.attachments.map((att, i) => (
                  <div key={i} className="group flex items-center gap-3 rounded-lg border border-border-subtle p-2 hover:bg-light-surface-alt transition-colors">
                    {att.type.startsWith('image/') ? (
                      <img
                        src={`${engineUrl}${att.url}`}
                        alt={att.name}
                        className="h-10 w-10 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-gray-100 text-text-muted">
                        <span className="material-symbols-outlined text-[18px]">{getFileIcon(att.type)}</span>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <a
                        href={`${engineUrl}${att.url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-sm font-medium text-text-main hover:text-forest-green"
                      >
                        {att.name}
                      </a>
                      <p className="text-[10px] text-text-muted">{formatFileSize(att.size)}</p>
                    </div>
                    <button
                      onClick={() => handleRemoveAttachment(i)}
                      className="hidden rounded p-1 text-text-muted hover:bg-red-50 hover:text-red-600 group-hover:block transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <input
              ref={attachmentInputRef}
              type="file"
              multiple
              onChange={handleAttachmentUpload}
              className="hidden"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.md,.json,.zip"
            />
            <input
              ref={headerImageInputRef}
              type="file"
              onChange={handleHeaderImageUpload}
              className="hidden"
              accept="image/*"
            />
          </div>

          {/* Subtasks */}
          <div className="mb-6 rounded-lg border border-border-subtle bg-white p-4">
            <h3 className="mb-3 text-sm font-bold text-text-main">
              Subtasks
              <span className="ml-2 text-text-muted font-normal">
                {subtasks.filter((s) => s.status === 'done').length}/{subtasks.length} completed
              </span>
            </h3>
            <div className="space-y-2">
              {subtasks.map((sub) => (
                <div key={sub.id} className="flex items-center gap-3 rounded-lg border border-border-subtle p-2">
                  <button
                    onClick={() => engine.updateTask(sub.id, { status: sub.status === 'done' ? 'todo' : 'done' }).then(loadData)}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                      sub.status === 'done'
                        ? 'border-forest-green bg-forest-green text-white'
                        : 'border-border-subtle hover:border-forest-green'
                    }`}
                  >
                    {sub.status === 'done' && <span className="material-symbols-outlined text-[14px]">check</span>}
                  </button>
                  <span className={`text-sm ${sub.status === 'done' ? 'text-text-muted line-through' : 'text-text-main'}`}>
                    {sub.title}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                placeholder="Add subtask..."
                className="flex-1 rounded-lg border border-border-subtle px-3 py-1.5 text-sm focus:border-forest-green focus:outline-none"
                onKeyDown={(e) => e.key === 'Enter' && addSubtask()}
              />
              <button onClick={addSubtask} className="rounded-lg bg-forest-green px-3 py-1.5 text-sm text-white">Add</button>
            </div>
          </div>

          {/* Discussion */}
          <div className="rounded-lg border border-border-subtle bg-white p-4">
            <h3 className="mb-3 text-sm font-bold text-text-main">Discussion</h3>
            <div className="mb-4 max-h-64 space-y-3 overflow-y-auto">
              {messages.length === 0 && (
                <p className="py-4 text-center text-xs text-text-muted">No messages yet. Start the conversation.</p>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-3 ${msg.senderType === 'human' ? 'justify-end' : ''}`}>
                  {msg.senderType !== 'human' && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-forest-green/10 text-forest-green">
                      <span className="material-symbols-outlined text-[14px]">smart_toy</span>
                    </div>
                  )}
                  <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    msg.senderType === 'human'
                      ? 'bg-forest-green/10 text-text-main'
                      : 'bg-light-surface-alt text-text-main'
                  }`}>
                    {msg.content}
                    <div className="mt-1 text-[10px] text-text-muted">{new Date(msg.createdAt).toLocaleTimeString()}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none"
                onKeyDown={(e) => e.key === 'Enter' && sendMsg()}
              />
              <button onClick={sendMsg} className="rounded-lg bg-forest-green px-4 py-2 text-sm text-white">
                <span className="material-symbols-outlined text-[18px]">send</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column - Properties */}
        <div className="w-72 shrink-0 space-y-4">
          <div className="rounded-lg border border-border-subtle bg-white p-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-text-muted">Properties</h3>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-text-muted">Status</label>
                <select
                  value={task.status}
                  onChange={(e) => updateField('status', e.target.value)}
                  className="w-full rounded border border-border-subtle px-2 py-1.5 text-sm"
                >
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-text-muted">Priority</label>
                <select
                  value={task.priority}
                  onChange={(e) => updateField('priority', e.target.value)}
                  className="w-full rounded border border-border-subtle px-2 py-1.5 text-sm"
                >
                  {priorityOptions.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-text-muted">Assigned Agent</label>
                <select
                  value={task.assignedAgentId ?? ''}
                  onChange={(e) => updateField('assignedAgentId', e.target.value || null)}
                  className="w-full rounded border border-border-subtle px-2 py-1.5 text-sm"
                >
                  <option value="">Unassigned</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-text-muted">Deadline</label>
                <input
                  type="date"
                  value={task.deadline?.split('T')[0] ?? ''}
                  onChange={(e) => updateField('deadline', e.target.value || null)}
                  className="w-full rounded border border-border-subtle px-2 py-1.5 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border-subtle bg-white p-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-text-muted">Info</h3>
            <div className="space-y-2 text-xs text-text-muted">
              <div className="flex justify-between">
                <span>Created</span>
                <span>{new Date(task.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Updated</span>
                <span>{new Date(task.updatedAt).toLocaleDateString()}</span>
              </div>
              {assignedAgent && (
                <div className="flex justify-between">
                  <span>Agent</span>
                  <Link to={`/agents/${assignedAgent.id}`} className="text-forest-green hover:underline">
                    {assignedAgent.name}
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Delete with confirmation */}
          {showDeleteConfirm ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="mb-3 text-sm font-medium text-red-700">Are you sure you want to delete this task?</p>
              <p className="mb-3 text-xs text-red-600">This will permanently delete the task, its subtasks, and all discussion messages.</p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  Delete
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 rounded-lg border border-border-subtle px-3 py-2 text-sm font-medium text-text-secondary hover:bg-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Delete Task
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

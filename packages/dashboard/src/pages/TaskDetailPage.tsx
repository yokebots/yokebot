import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router'
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

export function TaskDetailPage() {
  const { taskId } = useParams()
  const [task, setTask] = useState<EngineTask | null>(null)
  const [subtasks, setSubtasks] = useState<EngineTask[]>([])
  const [agents, setAgents] = useState<EngineAgent[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [channelId, setChannelId] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [newSubtask, setNewSubtask] = useState('')

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

  if (!task) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-text-muted">Loading task...</p>
      </div>
    )
  }

  const assignedAgent = agents.find((a) => a.id === task.assignedAgentId)

  return (
    <div className="mx-auto max-w-6xl">
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm text-text-muted">
        <Link to="/mission-control" className="hover:text-forest-green">Mission Control</Link>
        <span>/</span>
        <span className="text-text-main font-medium">{task.title}</span>
      </div>

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

          <button
            onClick={async () => {
              if (!taskId) return
              await engine.deleteTask(taskId)
              window.history.back()
            }}
            className="w-full rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Delete Task
          </button>
        </div>
      </div>
    </div>
  )
}

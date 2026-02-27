import { useState, useEffect } from 'react'
import { Link } from 'react-router'
import * as engine from '@/lib/engine'
import type { EngineTask, EngineAgent } from '@/lib/engine'

type Column = { key: string; label: string; color: string }

const COLUMNS: Column[] = [
  { key: 'backlog', label: 'Backlog', color: 'bg-gray-400' },
  { key: 'todo', label: 'Queued', color: 'bg-blue-500' },
  { key: 'in_progress', label: 'In Progress', color: 'bg-green-500' },
  { key: 'review', label: 'Review', color: 'bg-amber-500' },
  { key: 'done', label: 'Done', color: 'bg-forest-green' },
]

const priorityStyle: Record<string, string> = {
  urgent: 'bg-red-50 text-red-700 border-red-200',
  high: 'bg-orange-50 text-orange-700 border-orange-200',
  medium: 'bg-blue-50 text-blue-700 border-blue-200',
  low: 'bg-gray-50 text-gray-600 border-gray-200',
}

function TaskCard({ task, agents }: { task: EngineTask; agents: EngineAgent[] }) {
  const agent = agents.find((a) => a.id === task.assignedAgentId)

  return (
    <Link
      to={`/mission-control/${task.id}`}
      className="block rounded-lg border border-border-subtle bg-white p-3 shadow-sm transition-all hover:shadow-md hover:border-forest-green/30"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium text-text-main leading-tight">{task.title}</h4>
        <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${priorityStyle[task.priority]}`}>
          {task.priority}
        </span>
      </div>
      {task.description && (
        <p className="mb-2 text-xs text-text-muted line-clamp-2">{task.description}</p>
      )}
      <div className="flex items-center justify-between">
        {agent ? (
          <div className="flex items-center gap-1.5">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-forest-green/10 text-forest-green">
              <span className="material-symbols-outlined text-[12px]">smart_toy</span>
            </div>
            <span className="text-[11px] font-medium text-text-muted">{agent.name}</span>
          </div>
        ) : (
          <span className="text-[11px] text-text-muted">Unassigned</span>
        )}
        {task.deadline && (
          <span className="text-[11px] text-text-muted">
            {new Date(task.deadline).toLocaleDateString()}
          </span>
        )}
      </div>
    </Link>
  )
}

export function MissionControlPage() {
  const [tasks, setTasks] = useState<EngineTask[]>([])
  const [agents, setAgents] = useState<EngineAgent[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newPriority, setNewPriority] = useState('medium')
  const [filterAgent, setFilterAgent] = useState('')

  const loadData = async () => {
    try {
      const [t, a] = await Promise.all([engine.listTasks(), engine.listAgents()])
      setTasks(t)
      setAgents(a)
    } catch { /* offline */ }
  }

  useEffect(() => { loadData() }, [])

  const handleCreate = async () => {
    if (!newTitle.trim()) return
    await engine.createTask({ title: newTitle.trim(), priority: newPriority })
    setNewTitle('')
    setShowCreate(false)
    loadData()
  }

  const filtered = filterAgent
    ? tasks.filter((t) => t.assignedAgentId === filterAgent)
    : tasks

  const tasksByStatus = (status: string) => filtered.filter((t) => t.status === status)

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-main">Mission Control</h1>
          <p className="text-sm text-text-muted">Manage tasks across your agent workforce.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={filterAgent}
            onChange={(e) => setFilterAgent(e.target.value)}
            className="rounded-lg border border-border-subtle bg-white px-3 py-2 text-sm"
          >
            <option value="">All Agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-forest-green/90"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            New Task
          </button>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const colTasks = tasksByStatus(col.key)
          return (
            <div key={col.key} className="flex w-72 shrink-0 flex-col">
              <div className="mb-3 flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${col.color}`} />
                <h3 className="text-sm font-bold text-text-main">{col.label}</h3>
                <span className="rounded-full bg-light-surface-alt px-2 py-0.5 text-xs font-medium text-text-muted">
                  {colTasks.length}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-2 rounded-lg bg-light-surface-alt/50 p-2">
                {colTasks.map((task) => (
                  <TaskCard key={task.id} task={task} agents={agents} />
                ))}
                {colTasks.length === 0 && (
                  <p className="py-8 text-center text-xs text-text-muted">No tasks</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Quick Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 font-display text-lg font-bold text-text-main">New Task</h2>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Task title..."
              className="mb-3 w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <select
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value)}
              className="mb-4 w-full rounded-lg border border-border-subtle px-3 py-2 text-sm"
            >
              <option value="low">Low Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="high">High Priority</option>
              <option value="urgent">Urgent</option>
            </select>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowCreate(false)} className="rounded-lg border border-border-subtle px-4 py-2 text-sm">Cancel</button>
              <button onClick={handleCreate} className="rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

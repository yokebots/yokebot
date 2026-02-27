import { useState, useEffect } from 'react'
import { Link } from 'react-router'
import * as engine from '@/lib/engine'
import type { EngineTask, EngineAgent } from '@/lib/engine'

type ViewMode = 'kanban' | 'list' | 'calendar'

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

const statusColors: Record<string, string> = {
  backlog: 'bg-gray-400',
  todo: 'bg-blue-500',
  in_progress: 'bg-green-500',
  review: 'bg-amber-500',
  done: 'bg-forest-green',
}

export function MissionControlPage() {
  const [tasks, setTasks] = useState<EngineTask[]>([])
  const [agents, setAgents] = useState<EngineAgent[]>([])
  const [view, setView] = useState<ViewMode>(() => {
    try { return (localStorage.getItem('yokebot-tasks-view') as ViewMode) ?? 'kanban' } catch { return 'kanban' }
  })
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newPriority, setNewPriority] = useState('medium')
  const [filterAgent, setFilterAgent] = useState('')
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  const loadData = async () => {
    try {
      const [t, a] = await Promise.all([engine.listTasks(), engine.listAgents()])
      setTasks(t)
      setAgents(a)
    } catch { /* offline */ }
  }

  useEffect(() => { loadData() }, [])

  const setViewMode = (mode: ViewMode) => {
    setView(mode)
    try { localStorage.setItem('yokebot-tasks-view', mode) } catch {}
  }

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

  // Calendar helpers
  const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate()
  const firstDayOfWeek = calendarMonth.getDay()
  const calendarDays = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const getTasksForDay = (day: number) => {
    const dateStr = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return filtered.filter((t) => t.deadline?.startsWith(dateStr))
  }
  const prevMonth = () => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))
  const nextMonth = () => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-main">Tasks</h1>
          <p className="text-sm text-text-muted">Manage tasks across your agent workforce.</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex rounded-lg border border-border-subtle bg-white p-0.5">
            {([
              { mode: 'kanban' as const, icon: 'view_kanban', label: 'Kanban' },
              { mode: 'list' as const, icon: 'view_list', label: 'List' },
              { mode: 'calendar' as const, icon: 'calendar_month', label: 'Calendar' },
            ]).map(({ mode, icon, label }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  view === mode ? 'bg-forest-green text-white' : 'text-text-secondary hover:bg-light-surface-alt'
                }`}
                title={label}
              >
                <span className="material-symbols-outlined text-[16px]">{icon}</span>
                {label}
              </button>
            ))}
          </div>

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

      {/* Kanban View */}
      {view === 'kanban' && (
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
      )}

      {/* List View */}
      {view === 'list' && (
        <div className="flex-1 overflow-y-auto">
          <div className="rounded-xl border border-border-subtle bg-white shadow-card overflow-hidden">
            {/* Table header — desktop only */}
            <div className="hidden md:grid grid-cols-[1fr_120px_100px_140px_120px] gap-4 border-b border-border-subtle bg-light-surface-alt px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-text-muted">
              <span>Task</span>
              <span>Status</span>
              <span>Priority</span>
              <span>Assigned To</span>
              <span>Deadline</span>
            </div>
            {/* Rows */}
            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-text-muted">No tasks found</div>
            ) : (
              filtered.map((task) => {
                const agent = agents.find((a) => a.id === task.assignedAgentId)
                return (
                  <Link
                    key={task.id}
                    to={`/tasks/${task.id}`}
                    className="block md:grid md:grid-cols-[1fr_120px_100px_140px_120px] md:gap-4 border-b border-border-subtle px-4 py-3 hover:bg-light-surface-alt/50 transition-colors"
                  >
                    {/* Mobile: stacked card layout */}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-main truncate">{task.title}</p>
                      {task.description && (
                        <p className="text-xs text-text-muted truncate mt-0.5">{task.description}</p>
                      )}
                    </div>
                    <div className="flex md:hidden items-center gap-3 mt-2 flex-wrap">
                      <span className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${statusColors[task.status] ?? 'bg-gray-400'}`} />
                        <span className="text-xs capitalize text-text-secondary">{task.status.replace('_', ' ')}</span>
                      </span>
                      <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${priorityStyle[task.priority]}`}>
                        {task.priority}
                      </span>
                      {agent && (
                        <span className="flex items-center gap-1 text-xs text-text-secondary">
                          <span className="material-symbols-outlined text-[14px] text-forest-green">smart_toy</span>
                          {agent.name}
                        </span>
                      )}
                      {task.deadline && (
                        <span className="text-xs text-text-muted">{new Date(task.deadline).toLocaleDateString()}</span>
                      )}
                    </div>
                    {/* Desktop: grid columns */}
                    <div className="hidden md:flex items-center">
                      <span className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${statusColors[task.status] ?? 'bg-gray-400'}`} />
                        <span className="text-xs capitalize text-text-secondary">{task.status.replace('_', ' ')}</span>
                      </span>
                    </div>
                    <div className="hidden md:block">
                      <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${priorityStyle[task.priority]}`}>
                        {task.priority}
                      </span>
                    </div>
                    <div className="hidden md:flex items-center">
                      {agent ? (
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[14px] text-forest-green">smart_toy</span>
                          <span className="text-xs text-text-secondary truncate">{agent.name}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-text-muted">Unassigned</span>
                      )}
                    </div>
                    <div className="hidden md:flex items-center">
                      <span className="text-xs text-text-muted">
                        {task.deadline ? new Date(task.deadline).toLocaleDateString() : '—'}
                      </span>
                    </div>
                  </Link>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* Calendar View */}
      {view === 'calendar' && (
        <div className="flex-1 overflow-y-auto">
          <div className="rounded-xl border border-border-subtle bg-white p-5 shadow-card">
            {/* Month nav */}
            <div className="mb-4 flex items-center justify-between">
              <button onClick={prevMonth} className="rounded p-1 hover:bg-light-surface-alt">
                <span className="material-symbols-outlined text-[20px] text-text-muted">chevron_left</span>
              </button>
              <h2 className="text-sm font-bold text-text-main">
                {calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
              </h2>
              <button onClick={nextMonth} className="rounded p-1 hover:bg-light-surface-alt">
                <span className="material-symbols-outlined text-[20px] text-text-muted">chevron_right</span>
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 gap-px mb-1">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="py-1 text-center text-xs font-bold uppercase text-text-muted">{d}</div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-px bg-border-subtle rounded-lg overflow-hidden">
              {/* Empty cells before first day */}
              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} className="bg-light-surface-alt min-h-[80px] p-1" />
              ))}
              {calendarDays.map((day) => {
                const dayTasks = getTasksForDay(day)
                const isToday = (() => {
                  const now = new Date()
                  return now.getDate() === day && now.getMonth() === calendarMonth.getMonth() && now.getFullYear() === calendarMonth.getFullYear()
                })()
                return (
                  <div key={day} className={`bg-white min-h-[80px] p-1 ${isToday ? 'ring-2 ring-inset ring-forest-green/30' : ''}`}>
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${isToday ? 'bg-forest-green text-white' : 'text-text-secondary'}`}>
                      {day}
                    </span>
                    <div className="mt-0.5 space-y-0.5">
                      {dayTasks.slice(0, 3).map((task) => (
                        <Link
                          key={task.id}
                          to={`/tasks/${task.id}`}
                          className={`block truncate rounded px-1 py-0.5 text-[10px] font-medium ${
                            task.status === 'done' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'
                          } hover:opacity-80`}
                        >
                          {task.title}
                        </Link>
                      ))}
                      {dayTasks.length > 3 && (
                        <span className="block px-1 text-[10px] text-text-muted">+{dayTasks.length - 3} more</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

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

function TaskCard({ task, agents }: { task: EngineTask; agents: EngineAgent[] }) {
  const agent = agents.find((a) => a.id === task.assignedAgentId)

  return (
    <Link
      to={`/tasks/${task.id}`}
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

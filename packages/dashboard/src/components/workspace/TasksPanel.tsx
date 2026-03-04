import { useState, useEffect, useCallback } from 'react'
import { PanelHeader } from './PanelHeader'
import { TaskDetail } from './TaskDetail'
import TagFilterBar from '@/components/TagFilterBar'
import type { WorkspaceState } from '@/pages/WorkspacePage'
import * as engine from '@/lib/engine'

const STATUS_ORDER = ['todo', 'in_progress', 'review', 'done', 'backlog']
const STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog', todo: 'To Do', in_progress: 'In Progress', review: 'Review', done: 'Done',
}
const STATUS_DOTS: Record<string, string> = {
  backlog: 'bg-gray-400', todo: 'bg-blue-500', in_progress: 'bg-amber-500', review: 'bg-purple-500', done: 'bg-green-500',
}
const PRIORITY_BADGES: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-gray-100 text-gray-600',
}

interface TasksPanelProps {
  workspace: WorkspaceState
  unreadTaskIds?: Set<string>
  agents: engine.EngineAgent[]
}

export function TasksPanel({ workspace, unreadTaskIds, agents }: TasksPanelProps) {
  const [tasks, setTasks] = useState<engine.EngineTask[]>([])
  const [view, setView] = useState<'list' | 'kanban'>(() => {
    return localStorage.getItem('workspace-tasks-view') as 'list' | 'kanban' ?? 'list'
  })
  const [filterAgent, setFilterAgent] = useState<string>('')
  const [filterTags, setFilterTags] = useState<string[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newPriority, setNewPriority] = useState('medium')

  const loadTasks = useCallback(async () => {
    try {
      const filters: Parameters<typeof engine.listTasks>[0] = {}
      if (filterAgent) filters.agentId = filterAgent
      if (filterTags.length > 0) filters.tags = filterTags.join(',')
      const result = await engine.listTasks(Object.keys(filters).length > 0 ? filters : undefined)
      setTasks(result)
    } catch { /* offline */ }
  }, [filterAgent, filterTags])

  useEffect(() => { loadTasks() }, [loadTasks])

  const switchView = (v: 'list' | 'kanban') => {
    setView(v)
    localStorage.setItem('workspace-tasks-view', v)
  }

  const handleCreate = async () => {
    const title = newTitle.trim()
    if (!title) return
    try {
      await engine.createTask({ title, priority: newPriority })
      setNewTitle('')
      setShowCreate(false)
      loadTasks()
    } catch { /* ignore */ }
  }

  const handleTaskClick = (taskId: string) => {
    workspace.setSelectedTaskId(taskId)
  }

  // Show TaskDetail if a task is selected
  if (workspace.selectedTaskId) {
    return (
      <TaskDetail
        taskId={workspace.selectedTaskId}
        workspace={workspace}
        agents={agents}
        onBack={() => workspace.setSelectedTaskId(null)}
      />
    )
  }

  const tasksByStatus = (status: string) => tasks.filter(t => t.status === status)

  return (
    <div className="flex flex-col h-full">
      <PanelHeader
        icon="task_alt"
        title="Tasks"
        badge={unreadTaskIds?.size}
        actions={
          <div className="flex items-center gap-1">
            <button
              onClick={() => switchView('list')}
              className={`rounded p-1 transition-colors ${view === 'list' ? 'bg-forest-green/10 text-forest-green' : 'text-text-muted hover:bg-light-surface-alt'}`}
              title="List view"
            >
              <span className="material-symbols-outlined text-[16px]">view_list</span>
            </button>
            <button
              onClick={() => switchView('kanban')}
              className={`rounded p-1 transition-colors ${view === 'kanban' ? 'bg-forest-green/10 text-forest-green' : 'text-text-muted hover:bg-light-surface-alt'}`}
              title="Kanban view"
            >
              <span className="material-symbols-outlined text-[16px]">view_kanban</span>
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="rounded p-1 text-text-muted hover:bg-light-surface-alt hover:text-text-main transition-colors"
              title="New task"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
            </button>
          </div>
        }
      />

      {/* Agent filter */}
      {agents.length > 0 && (
        <div className="px-2 py-1.5 shrink-0">
          <select
            value={filterAgent}
            onChange={(e) => setFilterAgent(e.target.value)}
            className="w-full rounded-lg border border-border-subtle px-2 py-1 text-xs focus:border-forest-green focus:outline-none"
          >
            <option value="">All agents</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Tag filter */}
      <div className="px-2 py-1 shrink-0">
        <TagFilterBar selectedTags={filterTags} onSelectionChange={setFilterTags} />
      </div>

      {/* Quick create */}
      {showCreate && (
        <div className="px-2 py-2 border-b border-border-subtle shrink-0 space-y-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreate(false) }}
            placeholder="Task title..."
            className="w-full rounded-lg border border-border-subtle px-2.5 py-1.5 text-xs focus:border-forest-green focus:outline-none"
            autoFocus
          />
          <div className="flex items-center gap-2">
            <select
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value)}
              className="rounded border border-border-subtle px-1.5 py-1 text-[10px]"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <button
              onClick={handleCreate}
              disabled={!newTitle.trim()}
              className="rounded bg-forest-green px-2.5 py-1 text-[10px] text-white hover:bg-forest-green/90 disabled:opacity-50"
            >
              Create
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="rounded px-2 py-1 text-[10px] text-text-muted hover:bg-light-surface-alt"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Task views */}
      <div className="flex-1 overflow-auto">
        {view === 'list' ? (
          <ListView
            tasks={tasks}
            onTaskClick={handleTaskClick}
            unreadTaskIds={unreadTaskIds}
            agents={agents}
          />
        ) : (
          <KanbanView
            tasksByStatus={tasksByStatus}
            onTaskClick={handleTaskClick}
            unreadTaskIds={unreadTaskIds}
            agents={agents}
          />
        )}
      </div>
    </div>
  )
}

function ListView({
  tasks,
  onTaskClick,
  unreadTaskIds,
  agents,
}: {
  tasks: engine.EngineTask[]
  onTaskClick: (id: string) => void
  unreadTaskIds?: Set<string>
  agents: engine.EngineAgent[]
}) {
  const agentMap = new Map(agents.map(a => [a.id, a]))

  return (
    <div className="px-1 py-1">
      {tasks.length === 0 && (
        <p className="px-3 py-6 text-center text-xs text-text-muted">No tasks yet</p>
      )}
      {tasks.map(task => {
        const agent = task.assignedAgentId ? agentMap.get(task.assignedAgentId) : null
        const isUnread = unreadTaskIds?.has(task.id)
        return (
          <button
            key={task.id}
            onClick={() => onTaskClick(task.id)}
            className="group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-light-surface-alt"
          >
            {/* Status dot */}
            <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOTS[task.status] ?? 'bg-gray-400'}`} />
            {/* Unread indicator */}
            {isUnread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />}
            {/* Title */}
            <span className={`flex-1 truncate ${isUnread ? 'font-semibold text-text-main' : 'text-text-main'}`}>
              {task.title}
            </span>
            {/* Tag pills */}
            {task.tags?.length > 0 && (
              <div className="flex items-center gap-0.5 shrink-0">
                {task.tags.slice(0, 3).map((tag) => (
                  <span key={tag.id} className="rounded-full px-1.5 py-0 text-[8px] font-medium text-white" style={{ backgroundColor: tag.color }}>
                    {tag.name}
                  </span>
                ))}
                {task.tags.length > 3 && <span className="text-[8px] text-text-muted">+{task.tags.length - 3}</span>}
              </div>
            )}
            {/* Priority badge */}
            {task.priority && task.priority !== 'medium' && (
              <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${PRIORITY_BADGES[task.priority] ?? ''}`}>
                {task.priority}
              </span>
            )}
            {/* Agent avatar */}
            {agent && (
              <span
                className="material-symbols-outlined text-[14px] shrink-0"
                style={{ color: agent.iconColor ?? '#0F4D26' }}
                title={agent.name}
              >
                {agent.iconName ?? 'smart_toy'}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function KanbanView({
  tasksByStatus,
  onTaskClick,
  unreadTaskIds,
  agents,
}: {
  tasksByStatus: (status: string) => engine.EngineTask[]
  onTaskClick: (id: string) => void
  unreadTaskIds?: Set<string>
  agents: engine.EngineAgent[]
}) {
  const agentMap = new Map(agents.map(a => [a.id, a]))
  const columns = STATUS_ORDER.filter(s => tasksByStatus(s).length > 0 || s === 'todo' || s === 'in_progress')

  return (
    <div className="flex gap-2 p-2 overflow-x-auto h-full">
      {columns.map(status => (
        <div key={status} className="flex flex-col w-44 shrink-0">
          {/* Column header */}
          <div className="flex items-center gap-1.5 px-2 py-1.5 mb-1">
            <span className={`h-2 w-2 rounded-full ${STATUS_DOTS[status]}`} />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              {STATUS_LABELS[status]}
            </span>
            <span className="text-[10px] text-text-muted">{tasksByStatus(status).length}</span>
          </div>
          {/* Cards */}
          <div className="flex-1 overflow-y-auto space-y-1.5">
            {tasksByStatus(status).map(task => {
              const agent = task.assignedAgentId ? agentMap.get(task.assignedAgentId) : null
              const isUnread = unreadTaskIds?.has(task.id)
              return (
                <button
                  key={task.id}
                  onClick={() => onTaskClick(task.id)}
                  className="w-full rounded-lg border border-border-subtle bg-white p-2 text-left hover:border-forest-green/30 hover:shadow-sm transition-all"
                >
                  <p className={`text-xs leading-snug ${isUnread ? 'font-semibold' : ''} text-text-main line-clamp-2`}>
                    {isUnread && <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500 mr-1 align-middle" />}
                    {task.title}
                  </p>
                  {task.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-0.5 mt-1">
                      {task.tags.slice(0, 3).map((tag) => (
                        <span key={tag.id} className="rounded-full px-1.5 py-0 text-[7px] font-medium text-white" style={{ backgroundColor: tag.color }}>
                          {tag.name}
                        </span>
                      ))}
                      {task.tags.length > 3 && <span className="text-[7px] text-text-muted">+{task.tags.length - 3}</span>}
                    </div>
                  )}
                  <div className="flex items-center gap-1 mt-1.5">
                    {task.priority && task.priority !== 'medium' && (
                      <span className={`rounded px-1 py-0.5 text-[8px] font-semibold ${PRIORITY_BADGES[task.priority] ?? ''}`}>
                        {task.priority}
                      </span>
                    )}
                    {agent && (
                      <span
                        className="material-symbols-outlined text-[12px] ml-auto"
                        style={{ color: agent.iconColor ?? '#0F4D26' }}
                        title={agent.name}
                      >
                        {agent.iconName ?? 'smart_toy'}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

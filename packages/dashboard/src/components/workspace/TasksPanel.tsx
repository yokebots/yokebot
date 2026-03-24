import { useState, useEffect, useCallback, useMemo, useRef } from 'react'

import { TaskDetail } from './TaskDetail'
import TagFilterBar from '@/components/TagFilterBar'
import { useAgentProgress } from '@/hooks/useAgentProgress'
import { useRealtimeEvent } from '@/lib/use-realtime'
import type { AgentProgressEvent } from '@/hooks/useAgentProgress'
import type { WorkspaceState } from '@/pages/WorkspacePage'
import { useAuth } from '@/lib/auth'
import * as engine from '@/lib/engine'

const STATUS_ORDER = ['todo', 'in_progress', 'blocked', 'review', 'done', 'backlog', 'archived']
const STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog', todo: 'To Do', in_progress: 'In Progress', blocked: 'Blocked', review: 'Review', done: 'Done', archived: 'Archived',
}
const STATUS_DOTS: Record<string, string> = {
  backlog: 'bg-gray-400', todo: 'bg-blue-500', in_progress: 'bg-amber-500', blocked: 'bg-red-500', review: 'bg-purple-500', done: 'bg-green-500',
}
const PRIORITY_BADGES: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-gray-100 text-gray-600',
}
const PRIORITY_RANK: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 }

type ColumnKey = 'deadline' | 'createdAt' | 'updatedAt' | 'agent' | 'priority'
type SortKey = 'priority' | 'createdAt' | 'updatedAt' | 'deadline' | 'title'

const COLUMN_LABELS: Record<ColumnKey, string> = {
  deadline: 'Deadline',
  createdAt: 'Created',
  updatedAt: 'Updated',
  agent: 'Agent',
  priority: 'Priority',
}
const SORT_LABELS: Record<SortKey, string> = {
  priority: 'Priority',
  createdAt: 'Created',
  updatedAt: 'Updated',
  deadline: 'Deadline',
  title: 'Title',
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

interface TasksPanelProps {
  workspace: WorkspaceState
  unreadTaskIds?: Set<string>
  agents: engine.EngineAgent[]
}

export function TasksPanel({ workspace, unreadTaskIds, agents }: TasksPanelProps) {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<engine.EngineTask[]>([])
  const { currentAction } = useAgentProgress()
  const [archiving, setArchiving] = useState(false)
  const [view, setView] = useState<'list' | 'kanban'>(() => {
    return localStorage.getItem('workspace-tasks-view') as 'list' | 'kanban' ?? 'list'
  })
  const [filterAgent, setFilterAgent] = useState<string>('')
  const [filterMyTasks, setFilterMyTasks] = useState(false)
  const [filterTypeTab, setFilterTypeTab] = useState<'all' | 'work' | 'requests'>('all')
  const [filterTags, setFilterTags] = useState<string[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newPriority, setNewPriority] = useState('medium')

  // Column & sort state (persisted)
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(() => {
    try {
      const saved = localStorage.getItem('workspace-tasks-columns')
      return saved ? JSON.parse(saved) : ['priority', 'agent']
    } catch { return ['priority', 'agent'] }
  })
  const [sortKey, setSortKey] = useState<SortKey>(() => {
    return (localStorage.getItem('workspace-tasks-sort-key') as SortKey) ?? 'priority'
  })
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => {
    return (localStorage.getItem('workspace-tasks-sort-dir') as 'asc' | 'desc') ?? 'desc'
  })
  const [showColumnMenu, setShowColumnMenu] = useState(false)
  const columnMenuRef = useRef<HTMLDivElement>(null)

  // Persist settings
  useEffect(() => { localStorage.setItem('workspace-tasks-columns', JSON.stringify(visibleColumns)) }, [visibleColumns])
  useEffect(() => { localStorage.setItem('workspace-tasks-sort-key', sortKey) }, [sortKey])
  useEffect(() => { localStorage.setItem('workspace-tasks-sort-dir', sortDir) }, [sortDir])

  // Close column menu on outside click
  useEffect(() => {
    if (!showColumnMenu) return
    const handler = (e: MouseEvent) => {
      if (columnMenuRef.current && !columnMenuRef.current.contains(e.target as Node)) setShowColumnMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showColumnMenu])

  const loadTasks = useCallback(async () => {
    try {
      const filters: Parameters<typeof engine.listTasks>[0] = {}
      if (filterAgent) filters.agentId = filterAgent
      if (filterMyTasks && user?.id) filters.assignedUserId = user.id
      if (filterTags.length > 0) filters.tags = filterTags.join(',')
      if (filterTypeTab === 'work') filters.type = 'task,action_item'
      else if (filterTypeTab === 'requests') filters.type = 'approval,clarification'
      const result = await engine.listTasks(Object.keys(filters).length > 0 ? filters : undefined)
      setTasks(result)
    } catch { /* offline */ }
  }, [filterAgent, filterMyTasks, filterTags, filterTypeTab, user?.id])

  useEffect(() => { loadTasks() }, [loadTasks])

  // Real-time task list updates — refresh when tasks are created or updated
  useRealtimeEvent('task_created', () => { loadTasks() })
  useRealtimeEvent('task_updated', () => { loadTasks() })

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

  const handleArchiveCompleted = async () => {
    setArchiving(true)
    try {
      await engine.archiveCompletedTasks()
      loadTasks()
    } catch { /* ignore */ }
    setArchiving(false)
  }

  const toggleColumn = (col: ColumnKey) => {
    setVisibleColumns(prev =>
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    )
  }

  // Sorted tasks
  const sortedTasks = useMemo(() => {
    const sorted = [...tasks]
    sorted.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'priority':
          cmp = (PRIORITY_RANK[a.priority] ?? 0) - (PRIORITY_RANK[b.priority] ?? 0)
          break
        case 'title':
          cmp = a.title.localeCompare(b.title)
          break
        case 'createdAt':
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          break
        case 'updatedAt':
          cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
          break
        case 'deadline':
          // Tasks without deadlines sort last
          if (!a.deadline && !b.deadline) cmp = 0
          else if (!a.deadline) cmp = 1
          else if (!b.deadline) cmp = -1
          else cmp = new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
          break
      }
      return sortDir === 'desc' ? -cmp : cmp
    })
    return sorted
  }, [tasks, sortKey, sortDir])

  // IMPORTANT: useCallback must be called before any early return (Rules of Hooks)
  const handleStatusChange = useCallback(async (taskId: string, newStatus: string) => {
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus as engine.EngineTask['status'] } : t))
    try {
      await engine.updateTask(taskId, { status: newStatus })
    } catch {
      loadTasks() // revert on failure
    }
  }, [loadTasks])

  // Show TaskDetail if a task is selected
  if (workspace.selectedTaskId) {
    return (
      <TaskDetail
        taskId={workspace.selectedTaskId}
        workspace={workspace}
        agents={agents}
        onBack={() => workspace.setSelectedTaskId(null)}
        onDeleted={loadTasks}
      />
    )
  }

  const tasksByStatus = (status: string) => sortedTasks.filter(t => t.status === status)
  const doneCount = tasks.filter(t => t.status === 'done').length

  return (
    <div data-testid="tasks-panel" className="flex flex-col h-full">
      {/* Slim toolbar — no title (tab above already says "Tasks") */}
      <div className="flex items-center gap-1 border-b border-border-subtle px-2 py-1.5 shrink-0">
            <button
              onClick={() => setFilterMyTasks(v => !v)}
              className={`flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-medium transition-colors ${filterMyTasks ? 'bg-forest-green/10 text-forest-green' : 'text-text-muted hover:bg-light-surface-alt'}`}
              title="Show only tasks assigned to me"
            >
              <span className="material-symbols-outlined text-[13px]">person</span>
              My Tasks
            </button>
            {/* Type filter tabs */}
            <div className="flex items-center rounded-lg bg-light-surface-alt/50 p-0.5">
              {([['all', 'All'], ['work', 'Work'], ['requests', 'Requests']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilterTypeTab(key)}
                  className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${filterTypeTab === key ? 'bg-white text-text-main shadow-sm' : 'text-text-muted hover:text-text-secondary'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {doneCount > 0 && (
              <button
                onClick={handleArchiveCompleted}
                disabled={archiving}
                className="flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-medium text-green-700 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50"
                title="Archive all completed tasks"
              >
                <span className="material-symbols-outlined text-[13px]">inventory_2</span>
                Clear {doneCount} done
              </button>
            )}
            <div className="flex-1" />
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

      {/* Sort & column toolbar (list view only) */}
      {view === 'list' && (
        <div className="flex items-center gap-1.5 px-2 py-1 border-b border-border-subtle shrink-0">
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded border border-border-subtle px-1.5 py-0.5 text-[10px] focus:border-forest-green focus:outline-none"
          >
            {Object.entries(SORT_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
          <button
            onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
            className="rounded p-0.5 text-text-muted hover:bg-light-surface-alt"
            title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
          >
            <span className="material-symbols-outlined text-[14px]">
              {sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}
            </span>
          </button>
          <div className="relative ml-auto" ref={columnMenuRef}>
            <button
              onClick={() => setShowColumnMenu(v => !v)}
              className="rounded p-0.5 text-text-muted hover:bg-light-surface-alt"
              title="Column settings"
            >
              <span className="material-symbols-outlined text-[14px]">settings</span>
            </button>
            {showColumnMenu && (
              <div className="absolute right-0 top-full mt-1 z-20 rounded-lg border border-border-subtle bg-white shadow-lg py-1 min-w-[130px]">
                {(Object.keys(COLUMN_LABELS) as ColumnKey[]).map(col => (
                  <label key={col} className="flex items-center gap-2 px-3 py-1 text-[11px] hover:bg-light-surface-alt cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.includes(col)}
                      onChange={() => toggleColumn(col)}
                      className="rounded"
                    />
                    {COLUMN_LABELS[col]}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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
            tasks={sortedTasks}
            onTaskClick={handleTaskClick}
            unreadTaskIds={unreadTaskIds}
            agents={agents}
            visibleColumns={visibleColumns}
            currentAction={currentAction}
          />
        ) : (
          <KanbanView
            tasksByStatus={tasksByStatus}
            onTaskClick={handleTaskClick}
            onStatusChange={handleStatusChange}
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
  visibleColumns,
  currentAction,
}: {
  tasks: engine.EngineTask[]
  onTaskClick: (id: string) => void
  unreadTaskIds?: Set<string>
  agents: engine.EngineAgent[]
  visibleColumns: ColumnKey[]
  currentAction: (agentId: string) => AgentProgressEvent | undefined
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
        const isDone = task.status === 'done'
        return (
          <button
            key={task.id}
            onClick={() => onTaskClick(task.id)}
            className={`group flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-light-surface-alt ${isDone ? 'opacity-60' : ''}`}
          >
            {/* Status indicator — checkmark for done, warning for blocked, dot for everything else */}
            {isDone ? (
              <span className="material-symbols-outlined text-[16px] shrink-0 self-start text-green-500">check_circle</span>
            ) : task.status === 'blocked' ? (
              <span className="material-symbols-outlined text-[16px] shrink-0 self-start text-red-500">error</span>
            ) : (
              <span className={`h-2 w-2 shrink-0 rounded-full self-start mt-1 ${STATUS_DOTS[task.status] ?? 'bg-gray-400'}`} />
            )}
            {/* Unread indicator */}
            {isUnread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500 self-start mt-1.5" />}
            {/* Type icon for non-default task types */}
            {task.type === 'clarification' && <span className="material-symbols-outlined text-[14px] text-purple-500 shrink-0 self-start mt-0.5" title="Agent needs input">help</span>}
            {task.type === 'approval' && <span className="material-symbols-outlined text-[14px] text-orange-500 shrink-0 self-start mt-0.5" title="Approval needed">gpp_maybe</span>}
            {task.type === 'action_item' && <span className="material-symbols-outlined text-[14px] text-blue-500 shrink-0 self-start mt-0.5" title="Action item">assignment_ind</span>}
            {/* Title + Tags stacked */}
            <div className="flex-1 min-w-0">
              <span className={`block truncate ${isDone ? 'line-through text-text-muted' : isUnread ? 'font-semibold text-text-main' : 'text-text-main'}`}>
                {task.title}
              </span>
              {task.status === 'blocked' && task.blockedReasonText && (
                <span className="block text-[10px] text-amber-700 truncate mt-0.5">
                  {task.blockedReasonText.slice(0, 100)}{task.blockedReasonText.length > 100 ? '...' : ''}
                </span>
              )}
              {task.tags?.length > 0 && (
                <div className="flex flex-wrap items-center gap-0.5 mt-0.5">
                  {task.tags.slice(0, 3).map((tag) => (
                    <span key={tag.id} className="rounded-full px-1.5 py-0 text-[8px] font-medium text-white" style={{ backgroundColor: tag.color }}>
                      {tag.name}
                    </span>
                  ))}
                  {task.tags.length > 3 && <span className="text-[8px] text-text-muted">+{task.tags.length - 3}</span>}
                </div>
              )}
              {/* Live progress indicator for active agents */}
              {task.assignedAgentId && (() => {
                const action = currentAction(task.assignedAgentId!)
                if (!action) return null
                return (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="relative flex h-2.5 w-2.5 items-center justify-center shrink-0">
                      <span className="absolute h-2 w-2 rounded-full bg-accent-green/30" style={{ animation: 'pulse 2s ease-in-out infinite' }} />
                      <span className="relative h-1 w-1 rounded-full bg-accent-green" />
                    </span>
                    <span className="text-[10px] text-text-muted truncate">{action.label}</span>
                  </div>
                )
              })()}
            </div>
            {/* Deadline column */}
            {visibleColumns.includes('deadline') && (
              <span className={`shrink-0 text-[10px] tabular-nums ${task.deadline && new Date(task.deadline) < new Date() ? 'text-red-600 font-semibold' : 'text-text-muted'}`}>
                {formatRelativeDate(task.deadline)}
              </span>
            )}
            {/* Created column */}
            {visibleColumns.includes('createdAt') && (
              <span className="shrink-0 text-[10px] text-text-muted tabular-nums">
                {formatRelativeDate(task.createdAt)}
              </span>
            )}
            {/* Updated column */}
            {visibleColumns.includes('updatedAt') && (
              <span className="shrink-0 text-[10px] text-text-muted tabular-nums">
                {formatRelativeDate(task.updatedAt)}
              </span>
            )}
            {/* Priority badge */}
            {visibleColumns.includes('priority') && task.priority && task.priority !== 'medium' && (
              <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${PRIORITY_BADGES[task.priority] ?? ''}`}>
                {task.priority}
              </span>
            )}
            {/* Agent avatar */}
            {visibleColumns.includes('agent') && agent && (
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
  onStatusChange,
  unreadTaskIds,
  agents,
}: {
  tasksByStatus: (status: string) => engine.EngineTask[]
  onTaskClick: (id: string) => void
  onStatusChange: (taskId: string, newStatus: string) => void
  unreadTaskIds?: Set<string>
  agents: engine.EngineAgent[]
}) {
  const agentMap = new Map(agents.map(a => [a.id, a]))
  const columns = STATUS_ORDER.filter(s => tasksByStatus(s).length > 0 || s === 'todo' || s === 'in_progress')
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)
  const dragTaskIdRef = useRef<string | null>(null)

  return (
    <div className="flex gap-2 p-2 overflow-x-auto h-full">
      {columns.map(status => (
        <div
          key={status}
          className={`flex flex-col w-44 shrink-0 rounded-lg transition-colors ${dragOverColumn === status ? 'bg-forest-green/10' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOverColumn(status) }}
          onDragLeave={() => setDragOverColumn(null)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOverColumn(null)
            const taskId = dragTaskIdRef.current || e.dataTransfer.getData('text/plain')
            if (taskId) onStatusChange(taskId, status)
            dragTaskIdRef.current = null
          }}
        >
          {/* Column header */}
          <div className="flex items-center gap-1.5 px-2 py-1.5 mb-1">
            <span className={`h-2 w-2 rounded-full ${STATUS_DOTS[status]}`} />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              {STATUS_LABELS[status]}
            </span>
            <span className="text-[10px] text-text-muted">{tasksByStatus(status).length}</span>
          </div>
          {/* Cards */}
          <div className="flex-1 overflow-y-auto space-y-1.5 min-h-[40px]">
            {tasksByStatus(status).map(task => {
              const agent = task.assignedAgentId ? agentMap.get(task.assignedAgentId) : null
              const isUnread = unreadTaskIds?.has(task.id)
              const isDone = task.status === 'done'
              return (
                <button
                  key={task.id}
                  draggable
                  onDragStart={(e) => {
                    dragTaskIdRef.current = task.id
                    e.dataTransfer.setData('text/plain', task.id)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onClick={() => onTaskClick(task.id)}
                  className={`w-full rounded-lg border bg-white p-2 text-left hover:border-forest-green/30 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing ${isDone ? 'opacity-60 border-border-subtle' : task.status === 'blocked' ? 'border-red-300' : 'border-border-subtle'}`}
                >
                  <p className={`text-xs leading-snug ${isDone ? 'line-through text-text-muted' : isUnread ? 'font-semibold text-text-main' : 'text-text-main'} line-clamp-2`}>
                    {isDone && <span className="material-symbols-outlined text-[13px] text-green-500 mr-0.5 align-middle">check_circle</span>}
                    {isUnread && !isDone && <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500 mr-1 align-middle" />}
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
                    {task.deadline && (
                      <span className={`text-[8px] ${new Date(task.deadline) < new Date() ? 'text-red-600' : 'text-text-muted'}`}>
                        {formatRelativeDate(task.deadline)}
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

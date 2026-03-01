import { useState, useEffect } from 'react'
import * as engine from '@/lib/engine'
import type { Goal } from '@/lib/engine'

type ProjectStatus = 'active' | 'completed' | 'paused' | 'canceled'

interface ProjectTemplate {
  id: string
  title: string
  description: string
  taskTitles: string[]
  createdAt: string
}

const TEMPLATES_KEY = 'yokebot-project-templates'

function loadTemplates(): ProjectTemplate[] {
  try { return JSON.parse(localStorage.getItem(TEMPLATES_KEY) ?? '[]') } catch { return [] }
}

function saveTemplates(templates: ProjectTemplate[]) {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates))
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<Goal[]>([])
  const [filter, setFilter] = useState<ProjectStatus | 'all'>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [editingProject, setEditingProject] = useState<Goal | null>(null)
  const [tasks, setTasks] = useState<engine.EngineTask[]>([])
  const [linkingProjectId, setLinkingProjectId] = useState<string | null>(null)
  const [templates, setTemplates] = useState<ProjectTemplate[]>(loadTemplates)
  const [showTemplates, setShowTemplates] = useState(false)

  // Create form
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newDate, setNewDate] = useState('')

  const loadProjects = async () => {
    try {
      const data = await engine.listGoals(filter === 'all' ? undefined : filter)
      setProjects(data)
    } catch { /* offline */ }
  }

  const loadTasks = async () => {
    try {
      const data = await engine.listTasks()
      setTasks(data)
    } catch { /* offline */ }
  }

  useEffect(() => { loadProjects(); loadTasks() }, [filter])

  const handleCreate = async () => {
    if (!newTitle.trim()) return
    await engine.createGoal({
      title: newTitle.trim(),
      description: newDesc.trim(),
      targetDate: newDate || undefined,
    })
    setNewTitle(''); setNewDesc(''); setNewDate('')
    setShowCreate(false)
    await loadProjects()
  }

  const handleDuplicate = async (project: Goal) => {
    await engine.createGoal({
      title: `${project.title} (Copy)`,
      description: project.description,
      targetDate: project.targetDate ?? undefined,
    })
    await loadProjects()
  }

  const handleSaveAsTemplate = (project: Goal) => {
    const linkedTasks = tasks.filter((t) => (project.taskIds ?? []).includes(t.id))
    const template: ProjectTemplate = {
      id: crypto.randomUUID(),
      title: project.title,
      description: project.description,
      taskTitles: linkedTasks.map((t) => t.title),
      createdAt: new Date().toISOString(),
    }
    const updated = [...templates, template]
    setTemplates(updated)
    saveTemplates(updated)
  }

  const handleCreateFromTemplate = async (template: ProjectTemplate) => {
    // Create the project
    const project = await engine.createGoal({
      title: template.title,
      description: template.description,
    })
    // Create and link tasks from template
    for (const taskTitle of template.taskTitles) {
      const task = await engine.createTask({ title: taskTitle })
      await engine.linkTaskToGoal(project.id, task.id)
    }
    setShowTemplates(false)
    await loadProjects()
    await loadTasks()
  }

  const handleDeleteTemplate = (id: string) => {
    const updated = templates.filter((t) => t.id !== id)
    setTemplates(updated)
    saveTemplates(updated)
  }

  const handleStatusChange = async (projectId: string, status: ProjectStatus) => {
    await engine.updateGoal(projectId, { status })
    await loadProjects()
  }

  const handleDelete = async (projectId: string) => {
    const project = projects.find((p) => p.id === projectId)
    if (!confirm(`Delete project "${project?.title}"? This cannot be undone.`)) return
    await engine.deleteGoal(projectId)
    await loadProjects()
  }

  const handleLinkTask = async (projectId: string, taskId: string) => {
    await engine.linkTaskToGoal(projectId, taskId)
    setLinkingProjectId(null)
    await loadProjects()
  }

  const handleUnlinkTask = async (projectId: string, taskId: string) => {
    await engine.unlinkTaskFromGoal(projectId, taskId)
    await loadProjects()
  }

  const handleSaveEdit = async () => {
    if (!editingProject) return
    await engine.updateGoal(editingProject.id, {
      title: editingProject.title,
      description: editingProject.description,
      targetDate: editingProject.targetDate,
    })
    setEditingProject(null)
    await loadProjects()
  }

  const statusColors: Record<ProjectStatus, string> = {
    active: 'bg-blue-50 text-blue-700',
    completed: 'bg-green-50 text-green-700',
    paused: 'bg-amber-50 text-amber-700',
    canceled: 'bg-gray-100 text-gray-600',
  }

  const statusIcons: Record<ProjectStatus, string> = {
    active: 'folder_open',
    completed: 'check_circle',
    paused: 'pause_circle',
    canceled: 'cancel',
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-main">Projects</h1>
          <p className="text-sm text-text-muted">Organize tasks into projects. Track progress, save templates, and duplicate workflows.</p>
        </div>
        <div className="flex items-center gap-2">
          {templates.length > 0 && (
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              className="flex items-center gap-2 rounded-lg border border-border-subtle px-4 py-2 text-sm font-medium text-text-secondary hover:bg-light-surface-alt transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">library_books</span>
              Templates ({templates.length})
            </button>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white hover:bg-forest-green/90 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            New Project
          </button>
        </div>
      </div>

      {/* Templates panel */}
      {showTemplates && (
        <div className="mb-6 rounded-xl border border-purple-200 bg-purple-50/50 p-5 shadow-card">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-purple-800">
            <span className="material-symbols-outlined text-[18px]">library_books</span>
            Project Templates
          </h2>
          <div className="space-y-2">
            {templates.map((template) => (
              <div key={template.id} className="flex items-center gap-3 rounded-lg bg-white p-3 border border-purple-100">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-main">{template.title}</p>
                  <p className="text-xs text-text-muted">
                    {template.taskTitles.length} task{template.taskTitles.length !== 1 ? 's' : ''} · Saved {new Date(template.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleCreateFromTemplate(template)}
                  className="rounded-lg bg-forest-green px-3 py-1.5 text-xs font-medium text-white hover:bg-forest-green/90"
                >
                  Use Template
                </button>
                <button
                  onClick={() => handleDeleteTemplate(template.id)}
                  className="rounded p-1 text-text-muted hover:text-red-500"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Project Form */}
      {showCreate && (
        <div className="mb-6 rounded-xl border border-forest-green/30 bg-white p-6 shadow-card">
          <h2 className="mb-4 text-lg font-bold text-text-main">Create a new project</h2>
          <div className="space-y-3">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Project name (e.g., Q1 Social Media Campaign)"
              className="w-full rounded-lg border border-border-subtle px-4 py-2.5 text-sm focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description — what is this project about?"
              rows={3}
              className="w-full rounded-lg border border-border-subtle px-4 py-2.5 text-sm focus:border-forest-green focus:outline-none resize-none"
            />
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm text-text-muted">Target date:</label>
                <input
                  type="date"
                  value={newDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="rounded-lg border border-border-subtle px-3 py-1.5 text-sm focus:border-forest-green focus:outline-none"
                />
              </div>
              <div className="flex-1" />
              <button
                onClick={() => { setShowCreate(false); setNewTitle(''); setNewDesc(''); setNewDate('') }}
                className="rounded-lg border border-border-subtle px-4 py-2 text-sm text-text-secondary hover:bg-light-surface-alt"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newTitle.trim()}
                className="rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white hover:bg-forest-green/90 disabled:opacity-50"
              >
                Create Project
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex gap-1">
        {(['all', 'active', 'completed', 'paused', 'canceled'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === s ? 'bg-forest-green text-white' : 'bg-light-surface-alt text-text-secondary hover:bg-gray-200'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Projects List */}
      <div className="space-y-4">
        {projects.map((project) => (
          <div key={project.id} className="rounded-xl border border-border-subtle bg-white p-5 shadow-card transition-all hover:shadow-lg">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  {editingProject?.id === project.id ? (
                    <input
                      type="text"
                      value={editingProject.title}
                      onChange={(e) => setEditingProject({ ...editingProject, title: e.target.value })}
                      className="flex-1 rounded-lg border border-forest-green px-3 py-1 text-base font-bold focus:outline-none"
                      autoFocus
                    />
                  ) : (
                    <h3 className="text-base font-bold text-text-main">{project.title}</h3>
                  )}
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${statusColors[project.status]}`}>
                    <span className="material-symbols-outlined text-[14px]">{statusIcons[project.status]}</span>
                    {project.status}
                  </span>
                </div>
                {editingProject?.id === project.id ? (
                  <textarea
                    value={editingProject.description}
                    onChange={(e) => setEditingProject({ ...editingProject, description: e.target.value })}
                    rows={2}
                    className="mt-2 w-full rounded-lg border border-border-subtle px-3 py-1.5 text-sm focus:border-forest-green focus:outline-none resize-none"
                  />
                ) : project.description ? (
                  <p className="text-sm text-text-muted">{project.description}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-1 ml-4">
                {editingProject?.id === project.id ? (
                  <>
                    <button onClick={handleSaveEdit} className="rounded-lg bg-forest-green px-3 py-1.5 text-xs font-medium text-white">Save</button>
                    <button onClick={() => setEditingProject(null)} className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs text-text-muted">Cancel</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setEditingProject(project)} className="rounded p-1 text-text-muted hover:bg-light-surface-alt" title="Edit">
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                    </button>
                    <button onClick={() => handleDuplicate(project)} className="rounded p-1 text-text-muted hover:bg-light-surface-alt" title="Duplicate">
                      <span className="material-symbols-outlined text-[16px]">content_copy</span>
                    </button>
                    <button onClick={() => handleSaveAsTemplate(project)} className="rounded p-1 text-text-muted hover:bg-purple-50 hover:text-purple-600" title="Save as Template">
                      <span className="material-symbols-outlined text-[16px]">library_books</span>
                    </button>
                    <button onClick={() => handleDelete(project.id)} className="rounded p-1 text-text-muted hover:bg-red-50 hover:text-red-500" title="Delete">
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-text-muted mb-1">
                <span>{project.taskCount ?? 0} task{(project.taskCount ?? 0) !== 1 ? 's' : ''} linked</span>
                <span>{project.progress}% complete</span>
              </div>
              <div className="h-2 rounded-full bg-light-surface-alt overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${project.progress === 100 ? 'bg-green-500' : 'bg-forest-green'}`}
                  style={{ width: `${project.progress}%` }}
                />
              </div>
            </div>

            {/* Meta */}
            <div className="mt-3 flex items-center gap-4 text-xs text-text-muted">
              {project.targetDate && (
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                  Target: {new Date(project.targetDate).toLocaleDateString()}
                </span>
              )}
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">schedule</span>
                Created {new Date(project.createdAt).toLocaleDateString()}
              </span>
            </div>

            {/* Actions */}
            <div className="mt-3 flex items-center gap-2 border-t border-border-subtle pt-3">
              {project.status === 'active' && (
                <>
                  <button
                    onClick={() => handleStatusChange(project.id, 'completed')}
                    className="flex items-center gap-1 rounded-lg border border-green-200 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50"
                  >
                    <span className="material-symbols-outlined text-[14px]">check</span>
                    Mark Complete
                  </button>
                  <button
                    onClick={() => handleStatusChange(project.id, 'paused')}
                    className="flex items-center gap-1 rounded-lg border border-border-subtle px-3 py-1.5 text-xs text-text-muted hover:bg-light-surface-alt"
                  >
                    Pause
                  </button>
                </>
              )}
              {project.status === 'paused' && (
                <button
                  onClick={() => handleStatusChange(project.id, 'active')}
                  className="flex items-center gap-1 rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
                >
                  Resume
                </button>
              )}
              {project.status === 'completed' && (
                <button
                  onClick={() => handleStatusChange(project.id, 'active')}
                  className="flex items-center gap-1 rounded-lg border border-border-subtle px-3 py-1.5 text-xs text-text-muted hover:bg-light-surface-alt"
                >
                  Reopen
                </button>
              )}
              <div className="relative">
                <button
                  onClick={() => setLinkingProjectId(linkingProjectId === project.id ? null : project.id)}
                  className="flex items-center gap-1 rounded-lg border border-border-subtle px-3 py-1.5 text-xs text-text-muted hover:bg-light-surface-alt"
                >
                  <span className="material-symbols-outlined text-[14px]">link</span>
                  Link Task
                </button>
                {linkingProjectId === project.id && (
                  <TaskLinker
                    tasks={tasks}
                    linkedTaskIds={project.taskIds ?? []}
                    onLink={(taskId) => handleLinkTask(project.id, taskId)}
                    onUnlink={(taskId) => handleUnlinkTask(project.id, taskId)}
                    onClose={() => setLinkingProjectId(null)}
                  />
                )}
              </div>
            </div>
          </div>
        ))}

        {projects.length === 0 && (
          <div className="rounded-xl border border-border-subtle bg-white p-12 text-center shadow-card">
            <span className="material-symbols-outlined mb-3 text-5xl text-text-muted">folder_open</span>
            <h2 className="mb-2 font-display text-lg font-bold text-text-main">No projects yet</h2>
            <p className="mb-4 text-sm text-text-muted">Projects organize tasks into repeatable workflows. Create one to get started.</p>
            <button
              onClick={() => setShowCreate(true)}
              className="rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white hover:bg-forest-green/90"
            >
              Create Your First Project
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function TaskLinker({ tasks, linkedTaskIds, onLink, onUnlink, onClose }: {
  tasks: engine.EngineTask[]
  linkedTaskIds: string[]
  onLink: (taskId: string) => void
  onUnlink: (taskId: string) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const filtered = tasks.filter((t) =>
    !search || t.title.toLowerCase().includes(search.toLowerCase()),
  ).slice(0, 10)

  return (
    <div className="absolute left-0 top-full z-20 mt-2 w-80 rounded-lg border border-border-subtle bg-white shadow-lg">
      <div className="border-b border-border-subtle p-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks..."
          className="w-full rounded-lg border border-border-subtle px-3 py-1.5 text-sm focus:border-forest-green focus:outline-none"
          autoFocus
        />
      </div>
      <div className="max-h-60 overflow-y-auto">
        {filtered.map((task) => {
          const isLinked = linkedTaskIds.includes(task.id)
          return (
            <button
              key={task.id}
              onClick={() => isLinked ? onUnlink(task.id) : onLink(task.id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-light-surface-alt"
            >
              <span className={`material-symbols-outlined text-[16px] ${isLinked ? 'text-forest-green' : 'text-text-muted'}`}>
                {isLinked ? 'check_box' : 'check_box_outline_blank'}
              </span>
              <span className={`flex-1 text-left truncate ${isLinked ? 'font-medium text-text-main' : 'text-text-secondary'}`}>
                {task.title}
              </span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                task.status === 'done' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {task.status}
              </span>
            </button>
          )
        })}
        {filtered.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-text-muted">No tasks found</p>
        )}
      </div>
      <button
        onClick={onClose}
        className="w-full border-t border-border-subtle px-3 py-2 text-xs text-text-muted hover:bg-light-surface-alt"
      >
        Done
      </button>
    </div>
  )
}

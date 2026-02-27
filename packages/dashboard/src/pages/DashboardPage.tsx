import { useState, useEffect } from 'react'
import { StatsRow } from '@/components/StatsRow'
import { CreateAgentModal } from '@/components/CreateAgentModal'
import * as engine from '@/lib/engine'
import type { ActivityLogEntry } from '@/lib/engine'
import { Link } from 'react-router'

export function DashboardPage() {
  const [agents, setAgents] = useState<engine.EngineAgent[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [recentActivity, setRecentActivity] = useState<ActivityLogEntry[]>([])
  const [tasks, setTasks] = useState<engine.EngineTask[]>([])
  const [projects, setProjects] = useState<engine.Goal[]>([])
  const [stats, setStats] = useState({
    activeAgents: 0,
    totalAgents: 0,
    pendingApprovals: 0,
    totalTasks: 0,
    completedTasks: 0,
  })

  const loadData = async () => {
    try {
      const [agentList, approvalData, taskList, activity, projectList] = await Promise.all([
        engine.listAgents(),
        engine.approvalCount(),
        engine.listTasks(),
        engine.listActivityLog({ limit: 8 }),
        engine.listGoals().catch(() => [] as engine.Goal[]),
      ])

      setAgents(agentList)
      setTasks(taskList)
      setProjects(projectList)
      setRecentActivity(activity)
      setStats({
        activeAgents: agentList.filter((a) => a.status === 'running').length,
        totalAgents: agentList.length,
        pendingApprovals: approvalData.count,
        totalTasks: taskList.length,
        completedTasks: taskList.filter((t) => t.status === 'done').length,
      })
    } catch { /* engine offline */ }
  }

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [])

  const statusColors: Record<string, string> = {
    running: 'bg-green-500',
    stopped: 'bg-gray-400',
    error: 'bg-red-500',
  }

  const inProgressTasks = tasks.filter((t) => t.status === 'in_progress').slice(0, 5)
  const activeProjects = projects.filter((p) => p.status === 'active').slice(0, 4)

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="mb-1 font-display text-3xl font-bold text-text-main">Dashboard</h1>
        <p className="text-sm text-text-muted">Overview of your AI workforce and current activity.</p>
      </div>

      {/* Stats */}
      <StatsRow
        activeAgents={stats.activeAgents}
        totalAgents={stats.totalAgents}
        pendingApprovals={stats.pendingApprovals}
        totalTasks={stats.totalTasks}
        connected={true}
      />

      {/* Two-column grid: Agents + Tasks */}
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Agents summary */}
        <div className="rounded-xl border border-border-subtle bg-white p-5 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">Agents</h2>
            <Link to="/agents" className="text-xs text-forest-green hover:underline">View all</Link>
          </div>
          {agents.length === 0 ? (
            <div className="py-6 text-center">
              <span className="material-symbols-outlined mb-2 text-3xl text-text-muted">smart_toy</span>
              <p className="text-sm text-text-muted">No agents yet.</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-2 rounded-lg bg-forest-green px-3 py-1.5 text-xs font-medium text-white hover:bg-forest-green/90"
              >
                Deploy Your First Agent
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {agents.slice(0, 5).map((agent) => (
                <Link key={agent.id} to={`/agents/${agent.id}`} className="flex items-center gap-3 rounded-lg p-2 hover:bg-light-surface-alt transition-colors">
                  <span className={`h-2.5 w-2.5 rounded-full ${statusColors[agent.status] ?? 'bg-gray-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-main truncate">{agent.name}</p>
                    <p className="text-xs text-text-muted">{agent.department ?? 'General'} · {agent.modelName}</p>
                  </div>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                    agent.status === 'running' ? 'bg-green-50 text-green-700' : agent.status === 'error' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {agent.status}
                  </span>
                </Link>
              ))}
              {agents.length > 5 && (
                <p className="text-center text-xs text-text-muted pt-1">+{agents.length - 5} more</p>
              )}
            </div>
          )}
        </div>

        {/* Tasks in progress */}
        <div className="rounded-xl border border-border-subtle bg-white p-5 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">Active Tasks</h2>
            <Link to="/tasks" className="text-xs text-forest-green hover:underline">View all</Link>
          </div>
          {inProgressTasks.length === 0 ? (
            <div className="py-6 text-center">
              <span className="material-symbols-outlined mb-2 text-3xl text-text-muted">task_alt</span>
              <p className="text-sm text-text-muted">No tasks in progress.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {inProgressTasks.map((task) => {
                const agent = agents.find((a) => a.id === task.assignedAgentId)
                return (
                  <Link key={task.id} to={`/tasks/${task.id}`} className="flex items-center gap-3 rounded-lg p-2 hover:bg-light-surface-alt transition-colors">
                    <span className="material-symbols-outlined text-[16px] text-forest-green">play_circle</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-main truncate">{task.title}</p>
                      <p className="text-xs text-text-muted">{agent ? agent.name : 'Unassigned'} · {task.priority}</p>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
          <div className="mt-3 flex items-center gap-4 border-t border-border-subtle pt-3 text-xs text-text-muted">
            <span>{stats.completedTasks} completed</span>
            <span>{stats.totalTasks - stats.completedTasks} remaining</span>
          </div>
        </div>
      </div>

      {/* Projects row */}
      {activeProjects.length > 0 && (
        <div className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">Active Projects</h2>
            <Link to="/projects" className="text-xs text-forest-green hover:underline">View all</Link>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {activeProjects.map((project) => (
              <div key={project.id} className="rounded-xl border border-border-subtle bg-white p-4 shadow-card">
                <h3 className="text-sm font-bold text-text-main truncate">{project.title}</h3>
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs text-text-muted mb-1">
                    <span>{project.taskCount ?? 0} tasks</span>
                    <span>{project.progress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-light-surface-alt overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${project.progress === 100 ? 'bg-green-500' : 'bg-forest-green'}`}
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {recentActivity.length > 0 && (
        <div className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">Recent Activity</h2>
            <Link to="/activity" className="text-xs text-forest-green hover:underline">View all</Link>
          </div>
          <div className="rounded-xl border border-border-subtle bg-white divide-y divide-border-subtle shadow-card">
            {recentActivity.map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-forest-green" />
                <p className="flex-1 truncate text-sm text-text-main">{entry.description}</p>
                <span className="shrink-0 text-xs text-text-muted">
                  {new Date(entry.createdAt + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Approvals */}
      {stats.pendingApprovals > 0 && (
        <div className="mb-8">
          <Link
            to="/approvals"
            className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 hover:bg-amber-100 transition-colors"
          >
            <span className="material-symbols-outlined text-amber-600">approval</span>
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-800">{stats.pendingApprovals} pending approval{stats.pendingApprovals !== 1 ? 's' : ''}</p>
              <p className="text-xs text-amber-600">Agents are waiting for your review.</p>
            </div>
            <span className="material-symbols-outlined text-amber-600">arrow_forward</span>
          </Link>
        </div>
      )}

      {/* Create Agent Modal */}
      {showCreateModal && (
        <CreateAgentModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false)
            loadData()
          }}
        />
      )}
    </div>
  )
}

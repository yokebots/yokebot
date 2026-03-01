import { useState, useEffect } from 'react'
import * as engine from '@/lib/engine'
import type { KpiGoal } from '@/lib/engine'

type GoalStatus = 'active' | 'achieved' | 'missed' | 'paused'

export function GoalsPage() {
  const [goals, setGoals] = useState<KpiGoal[]>([])
  const [filter, setFilter] = useState<GoalStatus | 'all'>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Create form
  const [newTitle, setNewTitle] = useState('')
  const [newMetric, setNewMetric] = useState('')
  const [newTarget, setNewTarget] = useState('')
  const [newUnit, setNewUnit] = useState('')
  const [newCurrent, setNewCurrent] = useState('')
  const [newDeadline, setNewDeadline] = useState('')

  // Edit form
  const [editCurrent, setEditCurrent] = useState('')

  const loadGoals = async () => {
    try {
      const data = await engine.listKpiGoals(filter === 'all' ? undefined : filter)
      setGoals(data)
    } catch { /* offline */ }
  }

  useEffect(() => { loadGoals() }, [filter])

  const handleCreate = async () => {
    if (!newTitle.trim() || !newMetric.trim() || !newTarget) return
    await engine.createKpiGoal({
      title: newTitle.trim(),
      metricName: newMetric.trim(),
      targetValue: parseFloat(newTarget),
      unit: newUnit.trim(),
      currentValue: newCurrent ? parseFloat(newCurrent) : 0,
      deadline: newDeadline || undefined,
    })
    setNewTitle(''); setNewMetric(''); setNewTarget(''); setNewUnit(''); setNewCurrent(''); setNewDeadline('')
    setShowCreate(false)
    await loadGoals()
  }

  const handleUpdateProgress = async (goalId: string) => {
    if (!editCurrent) return
    await engine.updateKpiGoal(goalId, { currentValue: parseFloat(editCurrent) })
    setEditingId(null)
    setEditCurrent('')
    await loadGoals()
  }

  const handleStatusChange = async (goalId: string, status: GoalStatus) => {
    await engine.updateKpiGoal(goalId, { status })
    await loadGoals()
  }

  const handleDelete = async (goalId: string) => {
    const goal = goals.find((g) => g.id === goalId)
    if (!confirm(`Delete goal "${goal?.title}"? This cannot be undone.`)) return
    await engine.deleteKpiGoal(goalId)
    await loadGoals()
  }

  const getProgress = (goal: KpiGoal) => {
    if (goal.targetValue === 0) return 0
    return Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100))
  }

  const statusColors: Record<GoalStatus, string> = {
    active: 'bg-blue-50 text-blue-700',
    achieved: 'bg-green-50 text-green-700',
    missed: 'bg-red-50 text-red-700',
    paused: 'bg-amber-50 text-amber-700',
  }

  const statusIcons: Record<GoalStatus, string> = {
    active: 'trending_up',
    achieved: 'emoji_events',
    missed: 'trending_down',
    paused: 'pause_circle',
  }

  const progressColor = (pct: number) => {
    if (pct >= 100) return 'bg-green-500'
    if (pct >= 75) return 'bg-forest-green'
    if (pct >= 50) return 'bg-blue-500'
    if (pct >= 25) return 'bg-amber-500'
    return 'bg-red-400'
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-main">Goals</h1>
          <p className="text-sm text-text-muted">Track measurable milestones and KPIs that guide your team's priorities.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white hover:bg-forest-green/90 transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          New Goal
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="mb-6 rounded-xl border border-forest-green/30 bg-white p-6 shadow-card">
          <h2 className="mb-4 text-lg font-bold text-text-main">Set a new goal</h2>
          <div className="space-y-3">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Goal title (e.g., Reach 100 active customers)"
              className="w-full rounded-lg border border-border-subtle px-4 py-2.5 text-sm focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green"
              autoFocus
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                value={newMetric}
                onChange={(e) => setNewMetric(e.target.value)}
                placeholder="Metric name (e.g., Active Customers)"
                className="rounded-lg border border-border-subtle px-4 py-2.5 text-sm focus:border-forest-green focus:outline-none"
              />
              <input
                type="text"
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
                placeholder="Unit (e.g., customers, $, %)"
                className="rounded-lg border border-border-subtle px-4 py-2.5 text-sm focus:border-forest-green focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-text-muted">Current Value</label>
                <input
                  type="number"
                  value={newCurrent}
                  onChange={(e) => setNewCurrent(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-lg border border-border-subtle px-4 py-2.5 text-sm focus:border-forest-green focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text-muted">Target Value</label>
                <input
                  type="number"
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                  placeholder="100"
                  className="w-full rounded-lg border border-border-subtle px-4 py-2.5 text-sm focus:border-forest-green focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text-muted">Deadline</label>
                <input
                  type="date"
                  value={newDeadline}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setNewDeadline(e.target.value)}
                  className="w-full rounded-lg border border-border-subtle px-4 py-2.5 text-sm focus:border-forest-green focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => { setShowCreate(false); setNewTitle(''); setNewMetric(''); setNewTarget(''); setNewUnit(''); setNewCurrent(''); setNewDeadline('') }}
                className="rounded-lg border border-border-subtle px-4 py-2 text-sm text-text-secondary hover:bg-light-surface-alt"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newTitle.trim() || !newMetric.trim() || !newTarget}
                className="rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white hover:bg-forest-green/90 disabled:opacity-50"
              >
                Create Goal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex gap-1">
        {(['all', 'active', 'achieved', 'missed', 'paused'] as const).map((s) => (
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

      {/* Goals List */}
      <div className="space-y-4">
        {goals.map((goal) => {
          const pct = getProgress(goal)
          const isEditing = editingId === goal.id

          return (
            <div key={goal.id} className="rounded-xl border border-border-subtle bg-white p-5 shadow-card transition-all hover:shadow-lg">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-base font-bold text-text-main">{goal.title}</h3>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${statusColors[goal.status]}`}>
                      <span className="material-symbols-outlined text-[14px]">{statusIcons[goal.status]}</span>
                      {goal.status}
                    </span>
                  </div>
                  <p className="text-sm text-text-muted">
                    {goal.metricName}: <span className="font-bold text-text-main">{goal.currentValue.toLocaleString()}</span>
                    {goal.unit && ` ${goal.unit}`} / {goal.targetValue.toLocaleString()}{goal.unit && ` ${goal.unit}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 ml-4">
                  <button
                    onClick={() => { setEditingId(isEditing ? null : goal.id); setEditCurrent(String(goal.currentValue)) }}
                    className="rounded p-1 text-text-muted hover:bg-light-surface-alt"
                    title="Update progress"
                  >
                    <span className="material-symbols-outlined text-[16px]">edit</span>
                  </button>
                  <button onClick={() => handleDelete(goal.id)} className="rounded p-1 text-text-muted hover:bg-red-50 hover:text-red-500" title="Delete">
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>
              </div>

              {/* Progress */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-text-muted mb-1">
                  <span>{goal.metricName}</span>
                  <span className="font-bold">{pct}%</span>
                </div>
                <div className="h-3 rounded-full bg-light-surface-alt overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${progressColor(pct)}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {/* Update progress inline */}
              {isEditing && (
                <div className="mt-3 flex items-center gap-3 rounded-lg bg-light-surface-alt p-3">
                  <label className="text-xs font-medium text-text-muted">Update current value:</label>
                  <input
                    type="number"
                    value={editCurrent}
                    onChange={(e) => setEditCurrent(e.target.value)}
                    className="w-32 rounded-lg border border-border-subtle px-3 py-1.5 text-sm focus:border-forest-green focus:outline-none"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleUpdateProgress(goal.id)}
                  />
                  <span className="text-xs text-text-muted">{goal.unit}</span>
                  <button
                    onClick={() => handleUpdateProgress(goal.id)}
                    className="rounded-lg bg-forest-green px-3 py-1.5 text-xs font-medium text-white"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-xs text-text-muted hover:text-text-main"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Meta + Actions */}
              <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3">
                <div className="flex items-center gap-4 text-xs text-text-muted">
                  {goal.deadline && (
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                      Deadline: {new Date(goal.deadline).toLocaleDateString()}
                      {new Date(goal.deadline) < new Date() && goal.status === 'active' && (
                        <span className="ml-1 text-red-500 font-bold">OVERDUE</span>
                      )}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">schedule</span>
                    Created {new Date(goal.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {goal.status === 'active' && (
                    <>
                      <button
                        onClick={() => handleStatusChange(goal.id, 'achieved')}
                        className="flex items-center gap-1 rounded-lg border border-green-200 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-50"
                      >
                        <span className="material-symbols-outlined text-[14px]">emoji_events</span>
                        Achieved
                      </button>
                      <button
                        onClick={() => handleStatusChange(goal.id, 'paused')}
                        className="rounded-lg border border-border-subtle px-2.5 py-1 text-xs text-text-muted hover:bg-light-surface-alt"
                      >
                        Pause
                      </button>
                    </>
                  )}
                  {goal.status === 'paused' && (
                    <button
                      onClick={() => handleStatusChange(goal.id, 'active')}
                      className="rounded-lg border border-blue-200 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                    >
                      Resume
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {goals.length === 0 && (
          <div className="rounded-xl border border-border-subtle bg-white p-12 text-center shadow-card">
            <span className="material-symbols-outlined mb-3 text-5xl text-text-muted">flag</span>
            <h2 className="mb-2 font-display text-lg font-bold text-text-main">No goals yet</h2>
            <p className="mb-4 text-sm text-text-muted max-w-md mx-auto">
              Goals are measurable milestones that guide your team's priorities. Set a target like
              "Reach 100 customers by May 1st" and track progress over time.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white hover:bg-forest-green/90"
            >
              Set Your First Goal
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

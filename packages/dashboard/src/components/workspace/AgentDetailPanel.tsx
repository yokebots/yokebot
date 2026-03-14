import { useState, useEffect, useCallback } from 'react'
import * as engine from '@/lib/engine'
import type { EngineAgent, LogicalModel, AgentSkill, ModelCreditCost, BillingStatus } from '@/lib/engine'
import { useAgentProgress } from '@/hooks/useAgentProgress'
import { AgentProgressPanel } from '@/components/AgentProgressPanel'

function StarRating({ stars, label }: { stars: number; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] font-medium text-text-muted w-5">{label}</span>
      <div className="flex gap-px">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`text-[10px] ${i <= stars ? 'text-amber-400' : 'text-gray-200'}`}>&#9733;</span>
        ))}
      </div>
    </div>
  )
}

interface AgentDetailPanelProps {
  agentId: string
}

export function AgentDetailPanel({ agentId }: AgentDetailPanelProps) {
  const [agent, setAgent] = useState<EngineAgent | null>(null)
  const [tab, setTab] = useState<'config' | 'skills' | 'activity'>('config')
  const [editPrompt, setEditPrompt] = useState('')
  const [editModelId, setEditModelId] = useState('')
  const [editHeartbeat, setEditHeartbeat] = useState(1800)
  const [editPlanMode, setEditPlanMode] = useState<boolean | null>(null)
  const [models, setModels] = useState<LogicalModel[]>([])
  const [modelCatalog, setModelCatalog] = useState<ModelCreditCost[]>([])
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null)
  const [agentSkills, setAgentSkills] = useState<AgentSkill[]>([])
  const [availableSkills, setAvailableSkills] = useState<Array<{ metadata: { name: string; description: string; tags: string[]; source: string }; filePath: string }>>([])
  const [installingSkill, setInstallingSkill] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const { progressMap } = useAgentProgress()
  const agentProgress = progressMap.get(agentId)

  const loadData = useCallback(async () => {
    if (!agentId) return
    try {
      const [a, m, catalog, billing, skills, allSkills] = await Promise.all([
        engine.getAgent(agentId),
        engine.getAvailableModels(),
        engine.getModelCatalog().catch(() => [] as ModelCreditCost[]),
        engine.getBillingStatus().catch(() => null),
        engine.getAgentSkills(agentId),
        engine.listSkills(),
      ])
      setAgent(a)
      setEditPrompt(a.systemPrompt ?? '')
      setEditModelId(a.modelId || '')
      setEditHeartbeat(a.heartbeatSeconds)
      setEditPlanMode(a.planMode ?? true)
      setModels(m)
      setModelCatalog(catalog)
      setBillingStatus(billing)
      setAgentSkills(skills)
      setAvailableSkills(allSkills)
    } catch { /* offline */ }
  }, [agentId])

  useEffect(() => { loadData() }, [loadData])

  const toggleStatus = async () => {
    if (!agent) return
    if (agent.status === 'running') {
      await engine.stopAgent(agent.id)
    } else {
      await engine.startAgent(agent.id)
    }
    loadData()
  }

  const saveConfig = async () => {
    if (!agentId || saving) return
    setSaving(true)
    setSaveSuccess(false)
    try {
      const selectedModel = models.find((m) => m.id === editModelId)
      await engine.updateAgent(agentId, {
        systemPrompt: editPrompt,
        modelId: editModelId,
        modelName: selectedModel?.name,
        heartbeatSeconds: editHeartbeat,
        planMode: editPlanMode,
      })
      await loadData()
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch (err) {
      alert(`Failed to save: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  const selectedCost = modelCatalog.find((c) => c.modelId === editModelId)
  const currentModelLabel = models.find((m) => m.id === editModelId)?.name ?? agent?.modelId ?? agent?.modelName ?? 'Unknown'

  // Credit estimator
  const heartbeatMinutes = editHeartbeat / 60
  const heartbeatsPerDay = 24 / (heartbeatMinutes / 60)
  const creditsPerDay = selectedCost ? heartbeatsPerDay * selectedCost.creditsPerUse : 0
  const creditsPerWeek = creditsPerDay * 7
  const creditsPerMonth = creditsPerDay * 30

  const heartbeatOptions = [
    { value: 300, label: '5 min' },
    { value: 600, label: '10 min' },
    { value: 900, label: '15 min' },
    { value: 1800, label: '30 min' },
    { value: 3600, label: '1 hour' },
  ]

  const minHeartbeat = billingStatus?.subscription?.minHeartbeatSeconds ?? 300

  if (!agent) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-text-muted">
        Loading agent...
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-border-subtle flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-forest-green/10 text-forest-green shrink-0">
            <span className="material-symbols-outlined text-xl">smart_toy</span>
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-text-main truncate">{agent.name}</h2>
            <p className="text-[11px] text-text-muted truncate">
              {agent.department ?? 'General'} &middot; {currentModelLabel}
            </p>
          </div>
          <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0 ${
            agent.status === 'running' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
          }`}>
            {agent.status}
          </span>
        </div>
        <div className="flex gap-2 shrink-0">
          {tab === 'config' && (
            <button
              onClick={saveConfig}
              disabled={saving}
              className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                saveSuccess
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-forest-green text-white hover:bg-forest-green/90 disabled:opacity-50'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">
                {saveSuccess ? 'check_circle' : 'save'}
              </span>
              {saving ? 'Saving...' : saveSuccess ? 'Saved' : 'Save'}
            </button>
          )}
          <button
            onClick={toggleStatus}
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium ${
              agent.status === 'running'
                ? 'border border-red-200 text-red-600 hover:bg-red-50'
                : 'bg-forest-green text-white hover:bg-forest-green/90'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">
              {agent.status === 'running' ? 'stop_circle' : 'play_arrow'}
            </span>
            {agent.status === 'running' ? 'Stop' : 'Start'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex gap-1 px-4 border-b border-border-subtle">
        {(['config', 'skills', 'activity'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-xs font-medium transition-colors ${
              tab === t
                ? 'border-b-2 border-forest-green text-forest-green'
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'config' && (
          <div className="space-y-4">
            {/* Model Picker */}
            <div className="rounded-lg border border-border-subtle bg-white p-3">
              <h3 className="mb-2 text-xs font-bold text-text-main">Model</h3>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {models.filter((m) => m.type === 'chat').map((m) => {
                  const cost = modelCatalog.find((c) => c.modelId === m.id)
                  const isSelected = editModelId === m.id
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setEditModelId(m.id)}
                      className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                        isSelected
                          ? 'border-forest-green bg-forest-green/5 ring-1 ring-forest-green'
                          : 'border-border-subtle hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-text-main">{m.name}</span>
                            {cost && (
                              <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-text-muted">
                                {cost.creditsPerUse} cr/hb
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-[11px] text-text-secondary line-clamp-1">{m.description}</p>
                          {cost && (
                            <div className="mt-1 flex gap-2">
                              <StarRating stars={cost.starIntelligence} label="Int" />
                              <StarRating stars={cost.starPower} label="Pwr" />
                              <StarRating stars={cost.starSpeed} label="Spd" />
                            </div>
                          )}
                        </div>
                        {isSelected && (
                          <span className="material-symbols-outlined text-forest-green text-sm mt-0.5">check_circle</span>
                        )}
                      </div>
                    </button>
                  )
                })}
                {models.filter((m) => m.category === 'local').map((m) => {
                  const isSelected = editModelId === m.id
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setEditModelId(m.id)}
                      className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                        isSelected
                          ? 'border-forest-green bg-forest-green/5 ring-1 ring-forest-green'
                          : 'border-border-subtle hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-bold text-text-main">{m.name}</span>
                          <p className="text-[11px] text-text-muted">{m.description}</p>
                        </div>
                        {isSelected && (
                          <span className="material-symbols-outlined text-forest-green text-sm">check_circle</span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Plan Mode */}
            <div className="rounded-lg border border-border-subtle bg-white p-3">
              <h3 className="text-xs font-bold text-text-main mb-2">Plan Mode</h3>
              <div className="flex gap-1.5">
                {([
                  { value: null, label: 'Team Default' },
                  { value: true, label: 'Plan Mode' },
                  { value: false, label: 'Auto Approve' },
                ] as const).map((opt) => (
                  <button
                    key={String(opt.value)}
                    onClick={() => setEditPlanMode(opt.value as boolean | null)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      editPlanMode === opt.value
                        ? 'bg-forest-green text-white'
                        : 'bg-surface-secondary text-text-secondary hover:bg-surface-secondary/80'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Heartbeat */}
            <div className="rounded-lg border border-border-subtle bg-white p-3">
              <h3 className="mb-2 text-xs font-bold text-text-main">Heartbeat Frequency</h3>
              <select
                value={editHeartbeat}
                onChange={(e) => setEditHeartbeat(Number(e.target.value))}
                className="w-full rounded-lg border border-border-subtle px-2.5 py-1.5 text-xs focus:border-forest-green focus:outline-none"
              >
                {heartbeatOptions.map((opt) => (
                  <option key={opt.value} value={opt.value} disabled={opt.value < minHeartbeat}>
                    Every {opt.label}{opt.value < minHeartbeat ? ' (upgrade plan)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Credit Burn Warning */}
            {editHeartbeat <= 600 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-amber-600 text-[16px] mt-0.5">local_fire_department</span>
                  <p className="text-[11px] text-amber-700">
                    Fast check-ins burn credits quickly. Consider a 30-minute check-in to stretch your credits.
                  </p>
                </div>
              </div>
            )}

            {/* Credit Estimator */}
            {selectedCost && creditsPerDay > 0 && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <h3 className="mb-2 text-xs font-bold text-blue-900">Est. Credit Usage</h3>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-sm font-bold text-blue-900">{Math.round(creditsPerDay).toLocaleString()}</p>
                    <p className="text-[10px] text-blue-700">Daily</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-blue-900">{Math.round(creditsPerWeek).toLocaleString()}</p>
                    <p className="text-[10px] text-blue-700">Weekly</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-blue-900">{Math.round(creditsPerMonth).toLocaleString()}</p>
                    <p className="text-[10px] text-blue-700">Monthly</p>
                  </div>
                </div>
                {billingStatus?.subscription && (
                  <p className="mt-1.5 text-[10px] text-blue-700">
                    Plan includes {billingStatus.subscription.includedCredits.toLocaleString()} cr/mo
                  </p>
                )}
              </div>
            )}

            {/* System Prompt */}
            <div className="rounded-lg border border-border-subtle bg-white p-3">
              <h3 className="mb-2 text-xs font-bold text-text-main">System Instructions</h3>
              <textarea
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                rows={5}
                className="w-full rounded-lg border border-border-subtle px-2.5 py-2 text-xs focus:border-forest-green focus:outline-none"
              />
            </div>
          </div>
        )}

        {tab === 'skills' && (
          <div className="space-y-3">
            {agentSkills.length > 0 && (
              <div className="space-y-1.5">
                {agentSkills.map((skill) => {
                  const meta = availableSkills.find((s) => s.metadata.name.toLowerCase().replace(/\s+/g, '-') === skill.skillName)
                  return (
                    <div key={skill.skillName} className="flex items-center justify-between rounded-lg border border-border-subtle bg-white p-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-forest-green/10 text-forest-green shrink-0">
                          <span className="material-symbols-outlined text-[16px]">extension</span>
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-text-main truncate">{meta?.metadata.name ?? skill.skillName}</h4>
                          <p className="text-[10px] text-text-muted truncate">{meta?.metadata.description ?? `Source: ${skill.source}`}</p>
                        </div>
                      </div>
                      <button
                        onClick={async () => { await engine.removeAgentSkill(agentId, skill.skillName); loadData() }}
                        className="rounded-lg border border-red-200 px-2 py-1 text-[10px] font-medium text-red-600 hover:bg-red-50 shrink-0"
                      >
                        Uninstall
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {(() => {
              const installedNames = new Set(agentSkills.map((s) => s.skillName))
              const notInstalled = availableSkills.filter((s) => !installedNames.has(s.metadata.name.toLowerCase().replace(/\s+/g, '-')))
              if (notInstalled.length === 0 && agentSkills.length === 0) {
                return (
                  <div className="rounded-lg border border-border-subtle bg-white p-4 text-center">
                    <span className="material-symbols-outlined mb-2 text-2xl text-text-muted">extension</span>
                    <p className="text-xs text-text-muted">No skills available.</p>
                  </div>
                )
              }
              if (notInstalled.length === 0) return null
              return (
                <div>
                  <h4 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">Available Skills</h4>
                  <div className="space-y-1.5">
                    {notInstalled.map((skill) => {
                      const skillId = skill.metadata.name.toLowerCase().replace(/\s+/g, '-')
                      return (
                        <div key={skillId} className="flex items-center justify-between rounded-lg border border-border-subtle bg-white p-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-500 shrink-0">
                              <span className="material-symbols-outlined text-[16px]">extension</span>
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-xs font-bold text-text-main truncate">{skill.metadata.name}</h4>
                              <p className="text-[10px] text-text-muted truncate">{skill.metadata.description}</p>
                            </div>
                          </div>
                          <button
                            disabled={installingSkill}
                            onClick={async () => { setInstallingSkill(true); await engine.installAgentSkill(agentId, skillId); setInstallingSkill(false); loadData() }}
                            className="rounded-lg bg-forest-green px-2 py-1 text-[10px] font-medium text-white hover:bg-forest-green/90 disabled:opacity-50 shrink-0"
                          >
                            Install
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {tab === 'activity' && (
          <div className="space-y-3">
            {agentProgress && agentProgress.length > 0 && (
              <div className="rounded-lg border border-accent-green/30 bg-white p-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="relative flex h-3 w-3 items-center justify-center">
                    <span className="absolute h-2.5 w-2.5 rounded-full bg-accent-green/30" style={{ animation: 'pulse 2s ease-in-out infinite' }} />
                    <span className="relative h-1.5 w-1.5 rounded-full bg-accent-green" />
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-accent-green">Working now</span>
                </div>
                <AgentProgressPanel steps={agentProgress} defaultExpanded />
              </div>
            )}
            <div className="rounded-lg border border-border-subtle bg-white p-3">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  <span className="text-text-muted">Created</span>
                  <span className="ml-auto text-[10px] text-text-muted">{new Date(agent.createdAt).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                  <span className="text-text-muted">Updated</span>
                  <span className="ml-auto text-[10px] text-text-muted">{new Date(agent.updatedAt).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

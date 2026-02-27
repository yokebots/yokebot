import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router'
import * as engine from '@/lib/engine'
import type { EngineAgent, ChatMessage, LogicalModel, AgentSkill, ModelCreditCost, BillingStatus } from '@/lib/engine'

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

export function AgentDetailPage() {
  const { agentId } = useParams()
  const [agent, setAgent] = useState<EngineAgent | null>(null)
  const [tab, setTab] = useState<'config' | 'skills' | 'activity'>('config')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [channelId, setChannelId] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [editPrompt, setEditPrompt] = useState('')
  const [editModelId, setEditModelId] = useState('')
  const [editHeartbeat, setEditHeartbeat] = useState(1800)
  const [editHoursStart, setEditHoursStart] = useState(6)
  const [editHoursEnd, setEditHoursEnd] = useState(22)
  const [models, setModels] = useState<LogicalModel[]>([])
  const [modelCatalog, setModelCatalog] = useState<ModelCreditCost[]>([])
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null)
  const [agentSkills, setAgentSkills] = useState<AgentSkill[]>([])
  const [availableSkills, setAvailableSkills] = useState<Array<{ metadata: { name: string; description: string; tags: string[]; source: string }; filePath: string }>>([])
  const [installingSkill, setInstallingSkill] = useState(false)

  const loadData = async () => {
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
      setEditHoursStart(a.activeHoursStart)
      setEditHoursEnd(a.activeHoursEnd)
      setModels(m)
      setModelCatalog(catalog)
      setBillingStatus(billing)
      setAgentSkills(skills)
      setAvailableSkills(allSkills)
      const ch = await engine.getDmChannel(agentId)
      setChannelId(ch.id)
      const msgs = await engine.getMessages(ch.id)
      setMessages(msgs)
    } catch { /* offline */ }
  }

  useEffect(() => { loadData() }, [agentId])

  const sendMsg = async () => {
    if (!newMessage.trim() || !agentId) return
    try {
      await engine.chatWithAgent(agentId, newMessage.trim())
    } catch { /* model not available */ }
    setNewMessage('')
    loadData()
  }

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
    if (!agentId) return
    await engine.updateAgent(agentId, {
      systemPrompt: editPrompt,
      modelId: editModelId,
      heartbeatSeconds: editHeartbeat,
      activeHoursStart: editHoursStart,
      activeHoursEnd: editHoursEnd,
    })
    loadData()
  }

  const selectedCost = modelCatalog.find((c) => c.modelId === editModelId)
  const currentModelLabel = models.find((m) => m.id === editModelId)?.name ?? agent?.modelId ?? agent?.modelName ?? 'Unknown'

  // Credit estimator calculation
  const activeHours = editHoursEnd - editHoursStart
  const heartbeatMinutes = editHeartbeat / 60
  const heartbeatsPerDay = activeHours > 0 ? activeHours / (heartbeatMinutes / 60) : 0
  const creditsPerDay = selectedCost ? heartbeatsPerDay * selectedCost.creditsPerUse : 0
  const creditsPerWeek = creditsPerDay * 7
  const creditsPerMonth = creditsPerDay * 30

  // Heartbeat options
  const heartbeatOptions = [
    { value: 300, label: '5 min' },
    { value: 600, label: '10 min' },
    { value: 900, label: '15 min' },
    { value: 1800, label: '30 min' },
    { value: 3600, label: '1 hour' },
  ]

  // Min heartbeat from subscription
  const minHeartbeat = billingStatus?.subscription?.minHeartbeatSeconds ?? 300

  if (!agent) {
    return <div className="flex items-center justify-center py-24"><p className="text-text-muted">Loading agent...</p></div>
  }

  return (
    <div className="mx-auto max-w-6xl">
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm text-text-muted">
        <Link to="/agents" className="hover:text-forest-green">Agents</Link>
        <span>/</span>
        <span className="text-text-main font-medium">{agent.name}</span>
      </div>

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-forest-green/10 text-forest-green">
            <span className="material-symbols-outlined text-2xl">smart_toy</span>
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-text-main">{agent.name}</h1>
            <p className="text-sm text-text-muted">
              {agent.department ?? 'General'} &middot; {currentModelLabel}
            </p>
          </div>
          <span className={`ml-2 rounded-full px-3 py-1 text-xs font-bold ${
            agent.status === 'running' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
          }`}>
            {agent.status}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={toggleStatus}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
              agent.status === 'running'
                ? 'border border-red-200 text-red-600 hover:bg-red-50'
                : 'bg-forest-green text-white hover:bg-forest-green/90'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {agent.status === 'running' ? 'stop_circle' : 'play_arrow'}
            </span>
            {agent.status === 'running' ? 'Stop Agent' : 'Start Agent'}
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Left - Config/Skills/Activity */}
        <div className="flex-1 min-w-0">
          {/* Tabs */}
          <div className="mb-4 flex gap-1 border-b border-border-subtle">
            {(['config', 'skills', 'activity'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                  tab === t
                    ? 'border-b-2 border-forest-green text-forest-green'
                    : 'text-text-muted hover:text-text-main'
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {tab === 'config' && (
            <div className="space-y-4">
              {/* Model Picker */}
              <div className="rounded-lg border border-border-subtle bg-white p-4">
                <h3 className="mb-3 text-sm font-bold text-text-main">Model</h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {models.filter((m) => m.type === 'chat').map((m) => {
                    const cost = modelCatalog.find((c) => c.modelId === m.id)
                    const isSelected = editModelId === m.id
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setEditModelId(m.id)}
                        className={`w-full rounded-lg border p-3 text-left transition-colors ${
                          isSelected
                            ? 'border-forest-green bg-forest-green/5 ring-1 ring-forest-green'
                            : 'border-border-subtle hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-text-main">{m.name}</span>
                              {cost && (
                                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-text-muted">
                                  {cost.creditsPerUse} cr/hb
                                </span>
                              )}
                            </div>
                            {cost?.tagline && (
                              <p className="mt-0.5 text-xs italic text-text-muted">Think of it as: {cost.tagline}</p>
                            )}
                            <p className="mt-1 text-xs text-text-secondary">{m.description}</p>
                            {cost && (
                              <div className="mt-1.5 flex gap-3">
                                <StarRating stars={cost.starIntelligence} label="Int" />
                                <StarRating stars={cost.starPower} label="Pwr" />
                                <StarRating stars={cost.starSpeed} label="Spd" />
                              </div>
                            )}
                          </div>
                          {isSelected && (
                            <span className="material-symbols-outlined text-forest-green text-lg mt-0.5">check_circle</span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                  {/* Ollama models */}
                  {models.filter((m) => m.category === 'local').map((m) => {
                    const isSelected = editModelId === m.id
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setEditModelId(m.id)}
                        className={`w-full rounded-lg border p-3 text-left transition-colors ${
                          isSelected
                            ? 'border-forest-green bg-forest-green/5 ring-1 ring-forest-green'
                            : 'border-border-subtle hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-sm font-bold text-text-main">{m.name}</span>
                            <p className="text-xs text-text-muted">{m.description}</p>
                          </div>
                          {isSelected && (
                            <span className="material-symbols-outlined text-forest-green text-lg">check_circle</span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
                {/* Show if current model isn't in the list */}
                {editModelId && !models.find((m) => m.id === editModelId) && (
                  <p className="mt-2 text-xs text-amber-600">Current model "{editModelId}" is not available. Select a new model.</p>
                )}
              </div>

              {/* Heartbeat & Work Shift */}
              <div className="rounded-lg border border-border-subtle bg-white p-4">
                <h3 className="mb-3 text-sm font-bold text-text-main">Work Schedule</h3>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-text-secondary">Heartbeat Frequency</label>
                    <select
                      value={editHeartbeat}
                      onChange={(e) => setEditHeartbeat(Number(e.target.value))}
                      className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none"
                    >
                      {heartbeatOptions.map((opt) => (
                        <option key={opt.value} value={opt.value} disabled={opt.value < minHeartbeat}>
                          Every {opt.label}{opt.value < minHeartbeat ? ' (upgrade plan)' : ''}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-text-muted">How often the agent checks in and does work</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-text-secondary">Shift Start</label>
                      <select
                        value={editHoursStart}
                        onChange={(e) => setEditHoursStart(Number(e.target.value))}
                        className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none"
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={i}>{i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-text-secondary">Shift End</label>
                      <select
                        value={editHoursEnd}
                        onChange={(e) => setEditHoursEnd(Number(e.target.value))}
                        className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none"
                      >
                        {Array.from({ length: 24 }, (_, i) => i + 1).map((i) => (
                          <option key={i} value={i}>{i === 24 ? '12:00 AM (next day)' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <p className="text-[11px] text-text-muted">
                    {activeHours > 0 ? `${activeHours} active hours/day` : 'No active hours'} &middot; {Math.round(activeHours * 7)} hrs/week equivalent
                  </p>
                </div>
              </div>

              {/* Credit Estimator */}
              {selectedCost && creditsPerDay > 0 && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <h3 className="mb-2 text-sm font-bold text-blue-900">Estimated Credit Usage</h3>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-lg font-bold text-blue-900">{Math.round(creditsPerDay).toLocaleString()}</p>
                      <p className="text-[11px] text-blue-700">Daily</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-blue-900">{Math.round(creditsPerWeek).toLocaleString()}</p>
                      <p className="text-[11px] text-blue-700">Weekly</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-blue-900">{Math.round(creditsPerMonth).toLocaleString()}</p>
                      <p className="text-[11px] text-blue-700">Monthly</p>
                    </div>
                  </div>
                  {billingStatus?.subscription && (
                    <p className="mt-2 text-xs text-blue-700">
                      Plan includes {billingStatus.subscription.includedCredits.toLocaleString()} credits/mo &middot;{' '}
                      {billingStatus.subscription.includedCredits - creditsPerMonth > 0
                        ? `${Math.round(billingStatus.subscription.includedCredits - creditsPerMonth).toLocaleString()} remaining after this agent`
                        : 'May need additional credit packs'}
                    </p>
                  )}
                </div>
              )}

              {/* System Prompt */}
              <div className="rounded-lg border border-border-subtle bg-white p-4">
                <h3 className="mb-3 text-sm font-bold text-text-main">System Instructions</h3>
                <textarea
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  rows={6}
                  className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none"
                />
              </div>

              {/* Behavior (read-only) */}
              <div className="rounded-lg border border-border-subtle bg-white p-4">
                <h3 className="mb-3 text-sm font-bold text-text-main">Behavior</h3>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-text-main">Proactive Mode</p>
                    <p className="text-xs text-text-muted">Agent initiates actions during heartbeat cycles</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${agent.proactive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {agent.proactive ? 'On' : 'Off'}
                  </span>
                </div>
              </div>

              <button onClick={saveConfig} className="rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white">
                Save Changes
              </button>
            </div>
          )}

          {tab === 'skills' && (
            <div className="space-y-4">
              {/* Installed Skills */}
              {agentSkills.length > 0 && (
                <div className="space-y-2">
                  {agentSkills.map((skill) => {
                    const meta = availableSkills.find((s) => s.metadata.name.toLowerCase().replace(/\s+/g, '-') === skill.skillName)
                    return (
                      <div key={skill.skillName} className="flex items-center justify-between rounded-lg border border-border-subtle bg-white p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-forest-green/10 text-forest-green">
                            <span className="material-symbols-outlined">extension</span>
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-text-main">{meta?.metadata.name ?? skill.skillName}</h4>
                            <p className="text-xs text-text-muted">{meta?.metadata.description ?? `Source: ${skill.source}`}</p>
                          </div>
                        </div>
                        <button
                          onClick={async () => { await engine.removeAgentSkill(agentId!, skill.skillName); loadData() }}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          Uninstall
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Available Skills to Install */}
              {(() => {
                const installedNames = new Set(agentSkills.map((s) => s.skillName))
                const notInstalled = availableSkills.filter((s) => !installedNames.has(s.metadata.name.toLowerCase().replace(/\s+/g, '-')))
                if (notInstalled.length === 0 && agentSkills.length === 0) {
                  return (
                    <div className="rounded-lg border border-border-subtle bg-white p-6 text-center">
                      <span className="material-symbols-outlined mb-2 text-4xl text-text-muted">extension</span>
                      <p className="text-sm text-text-muted">No skills available. Add SKILL.md files to the skills directory.</p>
                    </div>
                  )
                }
                if (notInstalled.length === 0) return null
                return (
                  <div>
                    <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-text-muted">Available Skills</h4>
                    <div className="space-y-2">
                      {notInstalled.map((skill) => {
                        const skillId = skill.metadata.name.toLowerCase().replace(/\s+/g, '-')
                        return (
                          <div key={skillId} className="flex items-center justify-between rounded-lg border border-border-subtle bg-white p-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                                <span className="material-symbols-outlined">extension</span>
                              </div>
                              <div>
                                <h4 className="text-sm font-bold text-text-main">{skill.metadata.name}</h4>
                                <p className="text-xs text-text-muted">{skill.metadata.description}</p>
                              </div>
                            </div>
                            <button
                              disabled={installingSkill}
                              onClick={async () => { setInstallingSkill(true); await engine.installAgentSkill(agentId!, skillId); setInstallingSkill(false); loadData() }}
                              className="rounded-lg bg-forest-green px-3 py-1.5 text-xs font-medium text-white hover:bg-forest-green/90 disabled:opacity-50"
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
            <div className="rounded-lg border border-border-subtle bg-white p-4">
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-text-muted">Agent created</span>
                  <span className="ml-auto text-xs text-text-muted">{new Date(agent.createdAt).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  <span className="text-text-muted">Last updated</span>
                  <span className="ml-auto text-xs text-text-muted">{new Date(agent.updatedAt).toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right - Chat Panel */}
        <div className="flex w-80 shrink-0 flex-col rounded-lg border border-border-subtle bg-white">
          <div className="border-b border-border-subtle px-4 py-3">
            <h3 className="text-sm font-bold text-text-main">Chat with {agent.name}</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: '400px' }}>
            {messages.length === 0 && (
              <p className="py-8 text-center text-xs text-text-muted">Send a message to start chatting.</p>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-2 ${msg.senderType === 'human' ? 'justify-end' : ''}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  msg.senderType === 'human'
                    ? 'bg-forest-green/10 text-text-main'
                    : 'bg-light-surface-alt text-text-main'
                }`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <p className="mt-1 text-[10px] text-text-muted">{new Date(msg.createdAt).toLocaleTimeString()}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-border-subtle p-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={`Message ${agent.name}...`}
                className="flex-1 rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none"
                onKeyDown={(e) => e.key === 'Enter' && sendMsg()}
              />
              <button onClick={sendMsg} className="rounded-lg bg-forest-green px-3 py-2 text-white">
                <span className="material-symbols-outlined text-[16px]">send</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

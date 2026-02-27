import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router'
import * as engine from '@/lib/engine'
import type { EngineAgent, ChatMessage, LogicalModel, AgentSkill } from '@/lib/engine'

export function AgentDetailPage() {
  const { agentId } = useParams()
  const [agent, setAgent] = useState<EngineAgent | null>(null)
  const [tab, setTab] = useState<'config' | 'skills' | 'activity'>('config')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [channelId, setChannelId] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [editPrompt, setEditPrompt] = useState('')
  const [editModelId, setEditModelId] = useState('')
  const [models, setModels] = useState<LogicalModel[]>([])
  const [agentSkills, setAgentSkills] = useState<AgentSkill[]>([])
  const [availableSkills, setAvailableSkills] = useState<Array<{ metadata: { name: string; description: string; tags: string[]; source: string }; filePath: string }>>([])
  const [installingSkill, setInstallingSkill] = useState(false)

  const loadData = async () => {
    if (!agentId) return
    try {
      const [a, m, skills, allSkills] = await Promise.all([
        engine.getAgent(agentId),
        engine.getAvailableModels(),
        engine.getAgentSkills(agentId),
        engine.listSkills(),
      ])
      setAgent(a)
      setEditPrompt(a.systemPrompt ?? '')
      setEditModelId(a.modelId || '')
      setModels(m)
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
    })
    loadData()
  }

  const currentModelLabel = models.find((m) => m.id === editModelId)?.name ?? agent?.modelId ?? agent?.modelName ?? 'Unknown'

  const categoryLabels: Record<string, string> = {
    frontier: 'Frontier', reasoning: 'Reasoning', efficient: 'Efficient',
    image: 'Image Generation', video: 'Video Generation', '3d': '3D Generation', local: 'Local (Ollama)',
  }
  const categoryOrder = ['frontier', 'reasoning', 'efficient', 'image', 'video', '3d', 'local']
  const groupedCategories = categoryOrder
    .map((cat) => ({ category: cat, label: categoryLabels[cat] ?? cat, models: models.filter((m) => m.category === cat) }))
    .filter((g) => g.models.length > 0)

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
              <div className="rounded-lg border border-border-subtle bg-white p-4">
                <h3 className="mb-3 text-sm font-bold text-text-main">Model</h3>
                <select
                  value={editModelId}
                  onChange={(e) => setEditModelId(e.target.value)}
                  className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none"
                >
                  {groupedCategories.map((group) => (
                    <optgroup key={group.category} label={group.label}>
                      {group.models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}{m.contextWindow ? ` (${Math.round(m.contextWindow / 1000)}k ctx)` : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  {/* If current model isn't in the list, show it anyway */}
                  {editModelId && !models.find((m) => m.id === editModelId) && (
                    <option value={editModelId}>{editModelId}</option>
                  )}
                </select>
                {(() => {
                  const selected = models.find((m) => m.id === editModelId)
                  return selected ? <p className="mt-1 text-xs text-text-muted">{selected.description}</p> : null
                })()}
              </div>

              <div className="rounded-lg border border-border-subtle bg-white p-4">
                <h3 className="mb-3 text-sm font-bold text-text-main">System Instructions</h3>
                <textarea
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  rows={6}
                  className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none"
                />
              </div>

              <div className="rounded-lg border border-border-subtle bg-white p-4">
                <h3 className="mb-3 text-sm font-bold text-text-main">Behavior</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-text-main">Proactive Mode</p>
                      <p className="text-xs text-text-muted">Agent initiates actions during heartbeat cycles</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${agent.proactive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {agent.proactive ? 'On' : 'Off'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-text-main">Heartbeat</p>
                      <p className="text-xs text-text-muted">Check-in interval</p>
                    </div>
                    <span className="font-mono text-sm text-text-main">{agent.heartbeatSeconds}s</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-text-main">Active Hours</p>
                      <p className="text-xs text-text-muted">When the agent operates</p>
                    </div>
                    <span className="font-mono text-sm text-text-main">{agent.activeHoursStart}:00 – {agent.activeHoursEnd}:00</span>
                  </div>
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

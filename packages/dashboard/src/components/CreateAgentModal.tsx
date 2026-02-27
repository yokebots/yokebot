import { useState, useEffect } from 'react'
import * as engine from '@/lib/engine'
import type { LogicalModel, ModelCreditCost } from '@/lib/engine'

interface Props {
  onClose: () => void
  onCreated: () => void
  defaultName?: string
  defaultPrompt?: string
}

function StarRating({ stars, label }: { stars: number; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] font-medium text-text-muted w-5">{label}</span>
      <div className="flex gap-px">
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={`text-[10px] ${i <= stars ? 'text-amber-400' : 'text-gray-200'}`}
          >
            &#9733;
          </span>
        ))}
      </div>
    </div>
  )
}

export function CreateAgentModal({ onClose, onCreated, defaultName, defaultPrompt }: Props) {
  const [name, setName] = useState(defaultName ?? '')
  const [department, setDepartment] = useState('')
  const [systemPrompt, setSystemPrompt] = useState(defaultPrompt ?? '')
  const [models, setModels] = useState<LogicalModel[]>([])
  const [modelCatalog, setModelCatalog] = useState<ModelCreditCost[]>([])
  const [selectedModelId, setSelectedModelId] = useState('')
  const [heartbeat, setHeartbeat] = useState(1800) // Default 30 min for all tiers
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      engine.getAvailableModels(),
      engine.getModelCatalog().catch(() => [] as ModelCreditCost[]),
    ]).then(([m, catalog]) => {
      setModels(m)
      setModelCatalog(catalog)
      const firstChat = m.find((model) => model.type === 'chat' && model.category !== 'local')
      const defaultModel = firstChat ?? m[0]
      if (defaultModel) setSelectedModelId(defaultModel.id)
    }).catch(() => {})
  }, [])

  const selectedModel = models.find((m) => m.id === selectedModelId)
  const selectedCost = modelCatalog.find((c) => c.modelId === selectedModelId)

  // Only show chat models for agent creation
  const chatModels = models.filter((m) => m.type === 'chat')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !selectedModelId) return

    setLoading(true)
    setError('')

    try {
      await engine.createAgent({
        name: name.trim(),
        department: department.trim() || undefined,
        systemPrompt: systemPrompt.trim() || undefined,
        modelId: selectedModelId,
        heartbeatSeconds: heartbeat,
      })
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl border border-border-subtle bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-text-main">Onboard Agent</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-main">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {models.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center">
            <span className="material-symbols-outlined mb-2 text-3xl text-amber-600">warning</span>
            <p className="text-sm font-medium text-amber-800">No models available</p>
            <p className="mt-1 text-xs text-amber-700">
              Configure a model provider in Settings &rarr; Model Providers to get started.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">Agent Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. OutreachBot"
                className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green"
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">Department</label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green"
              >
                <option value="">General</option>
                <option value="Sales">Sales</option>
                <option value="Support">Support</option>
                <option value="Ops">Operations</option>
                <option value="Research">Research</option>
                <option value="Finance">Finance</option>
                <option value="Marketing">Marketing</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-text-secondary">Model</label>
              <div className="space-y-2 max-h-72 overflow-y-auto rounded-lg border border-border-subtle p-2">
                {chatModels.map((m) => {
                  const cost = modelCatalog.find((c) => c.modelId === m.id)
                  const isSelected = selectedModelId === m.id
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedModelId(m.id)}
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
                                {cost.creditsPerUse} credits/hb
                              </span>
                            )}
                          </div>
                          {cost?.tagline && (
                            <p className="mt-0.5 text-xs italic text-text-muted">Think of it as: {cost.tagline}</p>
                          )}
                          <p className="mt-1 text-xs text-text-secondary">{m.description}</p>
                          {cost && (
                            <div className="mt-2 flex gap-3">
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
                {/* Ollama models at the bottom */}
                {models.filter((m) => m.category === 'local').map((m) => {
                  const isSelected = selectedModelId === m.id
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedModelId(m.id)}
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

              {/* Selected model detail panel */}
              {selectedCost && (
                <div className="mt-3 rounded-lg border border-border-subtle bg-gray-50 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-bold text-text-main">{selectedModel?.name}</span>
                    {selectedCost.releaseDate && (
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                        {new Date(selectedCost.releaseDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {selectedCost.pros.length > 0 && (
                      <div>
                        <span className="font-medium text-green-700">Pros:</span>
                        <ul className="mt-0.5 space-y-0.5">
                          {selectedCost.pros.map((p, i) => (
                            <li key={i} className="text-text-secondary">+ {p}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {selectedCost.cons.length > 0 && (
                      <div>
                        <span className="font-medium text-red-600">Cons:</span>
                        <ul className="mt-0.5 space-y-0.5">
                          {selectedCost.cons.map((c, i) => (
                            <li key={i} className="text-text-secondary">- {c}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-text-secondary">Check-in Frequency</label>
              <select
                value={heartbeat}
                onChange={(e) => setHeartbeat(Number(e.target.value))}
                className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green"
              >
                <option value={3600}>Every 1 hour</option>
                <option value={1800}>Every 30 min (recommended)</option>
                <option value={900}>Every 15 min</option>
                <option value={600}>Every 10 min</option>
                <option value={300}>Every 5 min</option>
              </select>
              <p className="mt-1 text-[11px] text-text-muted">How often the agent checks in for new work. 30 min is ideal for most tasks.</p>
              {heartbeat <= 600 && (
                <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
                  <div className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-amber-600 text-[16px] mt-0.5">local_fire_department</span>
                    <p className="text-xs text-amber-700">
                      <span className="font-bold">Heads up!</span> A {heartbeat / 60}-min check-in burns credits fast. Consider 30-min for most tasks — your agents will still respond quickly.
                    </p>
                  </div>
                </div>
              )}
              {selectedCost && (
                <p className="mt-1 text-[11px] text-text-muted">
                  Est. ~{Math.round((24 * 60 / (heartbeat / 60)) * selectedCost.creditsPerUse).toLocaleString()} credits/day at current settings
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">System Prompt</label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="You are a helpful agent that..."
                rows={3}
                className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-border-subtle px-4 py-2 text-sm font-medium text-text-secondary hover:bg-light-surface-alt"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !name.trim() || !selectedModelId}
                className="rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-forest-green/90 disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Onboard Agent'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import * as engine from '@/lib/engine'
import type { LogicalModel } from '@/lib/engine'

interface Props {
  onClose: () => void
  onCreated: () => void
  defaultName?: string
  defaultPrompt?: string
}

const categoryLabels: Record<string, string> = {
  frontier: 'Frontier',
  reasoning: 'Reasoning',
  efficient: 'Efficient',
  image: 'Image Generation',
  video: 'Video Generation',
  '3d': '3D Generation',
  local: 'Local (Ollama)',
}

const categoryOrder = ['frontier', 'reasoning', 'efficient', 'image', 'video', '3d', 'local']

export function CreateAgentModal({ onClose, onCreated, defaultName, defaultPrompt }: Props) {
  const [name, setName] = useState(defaultName ?? '')
  const [department, setDepartment] = useState('')
  const [systemPrompt, setSystemPrompt] = useState(defaultPrompt ?? '')
  const [models, setModels] = useState<LogicalModel[]>([])
  const [selectedModelId, setSelectedModelId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    engine.getAvailableModels().then((m) => {
      setModels(m)
      // Default to first non-local chat model
      const firstChat = m.find((model) => model.type === 'chat' && model.category !== 'local')
      const defaultModel = firstChat ?? m[0]
      if (defaultModel) setSelectedModelId(defaultModel.id)
    }).catch(() => {})
  }, [])

  const selectedModel = models.find((m) => m.id === selectedModelId)

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
      })
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent')
    } finally {
      setLoading(false)
    }
  }

  // Group models by category for the select
  const groupedCategories = categoryOrder
    .map((cat) => ({
      category: cat,
      label: categoryLabels[cat] ?? cat,
      models: models.filter((m) => m.category === cat),
    }))
    .filter((g) => g.models.length > 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-border-subtle bg-white p-6 shadow-xl"
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
              Configure a model provider in Settings → Model Providers to get started.
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
              <label className="mb-1 block text-sm font-medium text-text-secondary">Model</label>
              <select
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green"
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
              </select>
              {selectedModel && (
                <p className="mt-1 text-xs text-text-muted">{selectedModel.description}</p>
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

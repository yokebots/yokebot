import { useState, useEffect } from 'react'
import * as engine from '@/lib/engine'
import type { AvailableProvider } from '@/lib/engine'

interface Props {
  onClose: () => void
  onCreated: () => void
  defaultName?: string
  defaultPrompt?: string
}

export function CreateAgentModal({ onClose, onCreated, defaultName, defaultPrompt }: Props) {
  const [name, setName] = useState(defaultName ?? '')
  const [department, setDepartment] = useState('')
  const [systemPrompt, setSystemPrompt] = useState(defaultPrompt ?? '')
  const [providers, setProviders] = useState<AvailableProvider[]>([])
  const [selectedProvider, setSelectedProvider] = useState('ollama')
  const [selectedModel, setSelectedModel] = useState('llama3.2')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    engine.getAvailableModels().then((p) => {
      setProviders(p)
      // Default to first enabled provider
      const enabled = p.find((prov) => prov.enabled)
      if (enabled) {
        setSelectedProvider(enabled.providerId)
        if (enabled.models.length > 0) setSelectedModel(enabled.models[0].id)
      }
    }).catch(() => {})
  }, [])

  const currentProvider = providers.find((p) => p.providerId === selectedProvider)
  const currentModels = currentProvider?.models ?? []

  const handleProviderChange = (providerId: string) => {
    setSelectedProvider(providerId)
    const prov = providers.find((p) => p.providerId === providerId)
    if (prov && prov.models.length > 0) {
      setSelectedModel(prov.models[0].id)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    setError('')

    try {
      await engine.createAgent({
        name: name.trim(),
        department: department.trim() || undefined,
        systemPrompt: systemPrompt.trim() || undefined,
        modelEndpoint: selectedProvider,
        modelName: selectedModel,
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
        className="w-full max-w-lg rounded-2xl border border-border-subtle bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-text-main">Deploy New Agent</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-main">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

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
            <label className="mb-1 block text-sm font-medium text-text-secondary">Model Provider</label>
            <select
              value={selectedProvider}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green"
            >
              {providers.map((p) => (
                <option key={p.providerId} value={p.providerId} disabled={!p.enabled}>
                  {p.providerName}{!p.enabled ? ' (not configured)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Model</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green"
            >
              {currentModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}{m.contextWindow ? ` (${Math.round(m.contextWindow / 1000)}k ctx)` : ''}
                </option>
              ))}
            </select>
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
              disabled={loading || !name.trim()}
              className="rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-forest-green/90 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Deploy Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

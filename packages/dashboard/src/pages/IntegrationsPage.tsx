import { useState, useEffect } from 'react'
import * as engine from '@/lib/engine'
import type { ServiceInfo } from '@/lib/engine'
import { SettingsLayout } from '@/components/SettingsLayout'

const CATEGORY_LABELS: Record<string, string> = {
  search: 'Search & Research',
  communication: 'Communication',
  crm: 'CRM & Sales',
  productivity: 'Productivity',
  development: 'Development',
  analytics: 'Analytics & SEO',
  finance: 'Finance',
  media: 'Media',
  ai: 'AI Services',
}

export function IntegrationsPage() {
  const [services, setServices] = useState<ServiceInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [editingService, setEditingService] = useState<string | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [expandedSetup, setExpandedSetup] = useState<string | null>(null)

  const loadServices = async () => {
    try {
      const data = await engine.listServices()
      setServices(data)
    } catch { /* engine offline */ }
    setLoading(false)
  }

  useEffect(() => { loadServices() }, [])

  const handleConnect = async (serviceId: string) => {
    if (!keyInput.trim()) return
    setSaving(true)
    try {
      await engine.setCredential(serviceId, keyInput.trim())
      setEditingService(null)
      setKeyInput('')
      await loadServices()
    } catch { /* error */ }
    setSaving(false)
  }

  const handleDisconnect = async (serviceId: string) => {
    try {
      await engine.deleteCredential(serviceId)
      await loadServices()
    } catch { /* error */ }
  }

  // Group services by category
  const grouped = services.reduce<Record<string, ServiceInfo[]>>((acc, svc) => {
    const cat = svc.category
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(svc)
    return acc
  }, {})

  if (loading) {
    return (
      <SettingsLayout activeTab="integrations">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-forest-green border-t-transparent" />
        </div>
      </SettingsLayout>
    )
  }

  return (
    <SettingsLayout activeTab="integrations">
      <div className="max-w-4xl">
        <p className="mb-6 text-sm text-text-muted">
          Connect your API keys so agents can use external services. Keys are encrypted and stored per-team.
        </p>

        {Object.entries(grouped).map(([category, categoryServices]) => (
          <div key={category} className="mb-8">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-text-muted">
              {CATEGORY_LABELS[category] ?? category}
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {categoryServices.map((svc) => (
                <div key={svc.id} className="rounded-lg border border-border-subtle bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                        svc.connected ? 'bg-forest-green/10 text-forest-green' : 'bg-gray-100 text-gray-500'
                      }`}>
                        <span className="material-symbols-outlined">{svc.icon}</span>
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-text-main">{svc.name}</h3>
                        <p className="text-xs text-text-muted">{svc.description}</p>
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      svc.connected ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {svc.connected ? 'Connected' : 'Not connected'}
                    </span>
                  </div>

                  {/* Connect/Disconnect actions */}
                  <div className="mt-3 border-t border-border-subtle pt-3">
                    {editingService === svc.id ? (
                      <div className="space-y-2">
                        <input
                          type="password"
                          value={keyInput}
                          onChange={(e) => setKeyInput(e.target.value)}
                          placeholder={`Paste your ${svc.name} API key...`}
                          className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm font-mono focus:border-forest-green focus:outline-none"
                          autoFocus
                          onKeyDown={(e) => e.key === 'Enter' && handleConnect(svc.id)}
                        />
                        {/* Setup instructions toggle */}
                        <button
                          onClick={() => setExpandedSetup(expandedSetup === svc.id ? null : svc.id)}
                          className="flex items-center gap-1 text-xs text-forest-green hover:text-forest-green/80"
                        >
                          <span className="material-symbols-outlined text-[14px]">
                            {expandedSetup === svc.id ? 'expand_less' : 'help'}
                          </span>
                          {expandedSetup === svc.id ? 'Hide setup instructions' : 'How to get your API key'}
                        </button>
                        {expandedSetup === svc.id && (
                          <div className="rounded-lg bg-light-surface-alt p-3 text-xs text-text-muted">
                            <p>{svc.setupInstructions}</p>
                            <a
                              href={svc.setupUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 inline-flex items-center gap-1 text-forest-green hover:underline"
                            >
                              <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                              Open {svc.name} settings
                            </a>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleConnect(svc.id)}
                            disabled={saving || !keyInput.trim()}
                            className="rounded-lg bg-forest-green px-3 py-1.5 text-xs font-medium text-white hover:bg-forest-green/90 disabled:opacity-50"
                          >
                            {saving ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={() => { setEditingService(null); setKeyInput(''); setExpandedSetup(null) }}
                            className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs text-text-muted hover:bg-light-surface-alt"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setEditingService(svc.id); setKeyInput('') }}
                          className="flex items-center gap-1 text-xs font-medium text-forest-green hover:text-forest-green/80"
                        >
                          <span className="material-symbols-outlined text-[14px]">
                            {svc.connected ? 'edit' : 'key'}
                          </span>
                          {svc.connected ? 'Update key' : 'Connect'}
                        </button>
                        {svc.connected && (
                          <button
                            onClick={() => handleDisconnect(svc.id)}
                            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600"
                          >
                            <span className="material-symbols-outlined text-[14px]">link_off</span>
                            Disconnect
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {services.length === 0 && (
          <div className="rounded-lg border border-border-subtle bg-white p-8 text-center">
            <span className="material-symbols-outlined mb-2 text-4xl text-text-muted">cloud_off</span>
            <p className="text-sm text-text-muted">Could not load integrations. Is the engine running?</p>
          </div>
        )}
      </div>
    </SettingsLayout>
  )
}

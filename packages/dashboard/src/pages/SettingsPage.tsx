import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import * as engine from '@/lib/engine'
import type { ProviderConfig } from '@/lib/engine'

interface AlertRow {
  label: string
  description: string
  inApp: boolean
  email: boolean
  slack: boolean
  telegram: boolean
}

interface ConnectedChannel {
  name: string
  icon: string
  connected: boolean
  detail: string
}

export function SettingsPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'notifications' | 'providers'>('providers')
  const [globalEnabled, setGlobalEnabled] = useState(true)
  const [providers, setProviders] = useState<ProviderConfig[]>([])
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [alerts, setAlerts] = useState<AlertRow[]>([
    { label: 'Critical Errors', description: 'System failures and agent crashes', inApp: true, email: true, slack: true, telegram: false },
    { label: 'Task Completions', description: 'Successful agent run summaries', inApp: true, email: false, slack: false, telegram: false },
    { label: 'New Invoices', description: 'Billing updates and subscription renewals', inApp: false, email: false, slack: false, telegram: false },
    { label: 'Agent Feedback', description: 'Requests for human-in-the-loop review', inApp: true, email: true, slack: true, telegram: false },
    { label: 'Approval Queue', description: 'Items waiting for approval', inApp: true, email: true, slack: false, telegram: false },
  ])

  const [channels] = useState<ConnectedChannel[]>([
    { name: 'Slack Integration', icon: 'chat', connected: true, detail: 'Receive alerts directly in your team\'s workspace. Currently linked to acme-corp.slack.com.' },
    { name: 'Telegram Bot', icon: 'send', connected: false, detail: 'Connect the YokeBot Telegram bot to get mobile-friendly instant alerts on the go.' },
  ])

  const loadProviders = async () => {
    try {
      const p = await engine.listProviders()
      setProviders(p)
    } catch { /* offline */ }
  }

  useEffect(() => { loadProviders() }, [])

  const toggleAlert = (idx: number, field: 'inApp' | 'email' | 'slack' | 'telegram') => {
    setAlerts((prev) => prev.map((a, i) => i === idx ? { ...a, [field]: !a[field] } : a))
  }

  const handleSaveKey = async (providerId: string) => {
    setSaving(true)
    try {
      await engine.updateProvider(providerId, { apiKey: keyInput, enabled: keyInput.length > 0 })
      setEditingKey(null)
      setKeyInput('')
      await loadProviders()
    } catch { /* error */ }
    setSaving(false)
  }

  const handleToggleProvider = async (providerId: string, currentEnabled: boolean) => {
    await engine.updateProvider(providerId, { enabled: !currentEnabled })
    await loadProviders()
  }

  const providerIcon = (id: string) => {
    switch (id) {
      case 'ollama': return 'terminal'
      case 'deepinfra': return 'cloud'
      case 'fal': return 'image'
      default: return 'smart_toy'
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-text-main">Settings</h1>
        <p className="text-sm text-text-muted">Configure model providers, notifications, and integrations.</p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-border-subtle">
        {([{ id: 'providers', label: 'Model Providers' }, { id: 'notifications', label: 'Notifications' }, { id: 'billing', label: 'Billing' }] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => t.id === 'billing' ? navigate('/settings/billing') : setTab(t.id as 'providers' | 'notifications')}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'border-b-2 border-forest-green text-forest-green'
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Model Providers Tab */}
      {tab === 'providers' && (
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            Configure which LLM providers your agents can use. Cloud providers require an API key.
          </p>

          {providers.map((provider) => (
            <div key={provider.id} className="rounded-lg border border-border-subtle bg-white p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                    provider.enabled ? 'bg-forest-green/10 text-forest-green' : 'bg-gray-100 text-gray-500'
                  }`}>
                    <span className="material-symbols-outlined">{providerIcon(provider.id)}</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-text-main">{provider.name}</h3>
                    <p className="font-mono text-xs text-text-muted">{provider.endpoint}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {provider.requiresKey && (
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      provider.hasKey ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {provider.hasKey ? 'Key configured' : 'No API key'}
                    </span>
                  )}
                  {!provider.requiresKey && (
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      provider.enabled ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {provider.enabled ? 'Connected' : 'Not detected'}
                    </span>
                  )}
                  {provider.requiresKey && (
                    <button
                      onClick={() => provider.enabled ? handleToggleProvider(provider.id, provider.enabled) : undefined}
                      className={`relative h-6 w-11 rounded-full transition-colors ${provider.enabled ? 'bg-forest-green' : 'bg-gray-300'}`}
                    >
                      <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${provider.enabled ? 'left-5.5' : 'left-0.5'}`} />
                    </button>
                  )}
                </div>
              </div>

              {/* API Key Input */}
              {provider.requiresKey && (
                <div className="mt-4 border-t border-border-subtle pt-4">
                  {editingKey === provider.id ? (
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={keyInput}
                        onChange={(e) => setKeyInput(e.target.value)}
                        placeholder="Paste your API key..."
                        className="flex-1 rounded-lg border border-border-subtle px-3 py-2 text-sm font-mono focus:border-forest-green focus:outline-none"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveKey(provider.id)}
                        disabled={saving}
                        className="rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white hover:bg-forest-green/90 disabled:opacity-50"
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => { setEditingKey(null); setKeyInput('') }}
                        className="rounded-lg border border-border-subtle px-3 py-2 text-sm text-text-muted hover:bg-light-surface-alt"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingKey(provider.id)}
                      className="flex items-center gap-2 text-sm text-forest-green hover:text-forest-green/80"
                    >
                      <span className="material-symbols-outlined text-[16px]">{provider.hasKey ? 'edit' : 'key'}</span>
                      {provider.hasKey ? 'Update API Key' : 'Add API Key'}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {providers.length === 0 && (
            <div className="rounded-lg border border-border-subtle bg-white p-8 text-center">
              <span className="material-symbols-outlined mb-2 text-4xl text-text-muted">cloud_off</span>
              <p className="text-sm text-text-muted">Could not load providers. Is the engine running?</p>
            </div>
          )}
        </div>
      )}

      {/* Notifications Tab */}
      {tab === 'notifications' && (
        <>
          {/* Global Toggle */}
          <div className="mb-8 flex items-center justify-between rounded-lg border border-border-subtle bg-white p-4">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-xl text-text-muted">notifications</span>
              <div>
                <p className="text-sm font-bold text-text-main">Global Notifications</p>
                <p className="text-xs text-text-muted">Pause all notifications temporarily without losing your configuration.</p>
              </div>
            </div>
            <button
              onClick={() => setGlobalEnabled(!globalEnabled)}
              className={`relative h-6 w-11 rounded-full transition-colors ${globalEnabled ? 'bg-forest-green' : 'bg-gray-300'}`}
            >
              <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${globalEnabled ? 'left-5.5' : 'left-0.5'}`} />
            </button>
          </div>

          {/* Alert Configuration */}
          <div className="mb-8">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-text-main">
              <span className="material-symbols-outlined text-xl">tune</span>
              Alert Configuration
            </h2>
            <div className="overflow-hidden rounded-lg border border-border-subtle bg-white">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border-subtle bg-light-surface-alt/50">
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-muted">Alert Category</th>
                    <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-text-muted">In-App</th>
                    <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-text-muted">Email</th>
                    <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-text-muted">Slack</th>
                    <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-text-muted">Telegram</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((alert, idx) => (
                    <tr key={alert.label} className="border-b border-border-subtle last:border-0">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-text-main">{alert.label}</p>
                        <p className="text-xs text-text-muted">{alert.description}</p>
                      </td>
                      {(['inApp', 'email', 'slack', 'telegram'] as const).map((field) => (
                        <td key={field} className="px-4 py-3 text-center">
                          <button
                            onClick={() => toggleAlert(idx, field)}
                            className={`flex h-5 w-5 mx-auto items-center justify-center rounded border transition-colors ${
                              alert[field]
                                ? 'border-forest-green bg-forest-green text-white'
                                : 'border-border-subtle bg-white'
                            }`}
                          >
                            {alert[field] && <span className="material-symbols-outlined text-[14px]">check</span>}
                          </button>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Connected Channels */}
          <div>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-text-main">
              <span className="material-symbols-outlined text-xl">link</span>
              Connected Channels
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {channels.map((ch) => (
                <div key={ch.name} className="rounded-lg border border-border-subtle bg-white p-5">
                  <div className="mb-3 flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${ch.connected ? 'bg-forest-green/10 text-forest-green' : 'bg-gray-100 text-gray-500'}`}>
                      <span className="material-symbols-outlined">{ch.icon}</span>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-text-main">{ch.name}</h3>
                      <span className={`text-xs font-medium ${ch.connected ? 'text-green-600' : 'text-text-muted'}`}>
                        {ch.connected ? 'Connected' : 'Not Connected'}
                      </span>
                    </div>
                  </div>
                  <p className="mb-4 text-xs text-text-muted">{ch.detail}</p>
                  {ch.connected ? (
                    <div className="flex gap-2">
                      <button className="flex-1 rounded-lg border border-border-subtle px-3 py-2 text-sm font-medium text-text-secondary hover:bg-light-surface-alt">
                        Configure
                      </button>
                      <button className="flex-1 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <button className="w-full rounded-lg bg-forest-green px-3 py-2 text-sm font-medium text-white hover:bg-forest-green/90">
                      Connect {ch.name.split(' ')[0]}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

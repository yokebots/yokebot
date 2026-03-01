import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router'
import * as engine from '@/lib/engine'
import type { ProviderConfig, TeamProfile } from '@/lib/engine'
import { useTeam } from '@/lib/team-context'

interface AlertRow {
  category: string
  label: string
  description: string
  inApp: boolean
  email: boolean
  slack: boolean
  telegram: boolean
}

const DEFAULT_ALERTS: AlertRow[] = [
  { category: 'critical_errors', label: 'Critical Errors', description: 'System failures and agent crashes', inApp: true, email: true, slack: true, telegram: false },
  { category: 'task_completions', label: 'Task Completions', description: 'Successful agent run summaries', inApp: true, email: false, slack: false, telegram: false },
  { category: 'new_invoices', label: 'New Invoices', description: 'Billing updates and subscription renewals', inApp: false, email: false, slack: false, telegram: false },
  { category: 'agent_feedback', label: 'Agent Feedback', description: 'Requests for human-in-the-loop review', inApp: true, email: true, slack: true, telegram: false },
  { category: 'approval_queue', label: 'Approval Queue', description: 'Items waiting for approval', inApp: true, email: true, slack: false, telegram: false },
]

export function SettingsPage() {
  const navigate = useNavigate()
  const { activeTeam, refresh: refreshTeams } = useTeam()
  const [tab, setTab] = useState<'team' | 'notifications' | 'providers'>('team')
  const [providers, setProviders] = useState<ProviderConfig[]>([])
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingNotifs, setSavingNotifs] = useState(false)
  const [notifSaved, setNotifSaved] = useState(false)

  // Team settings state
  const [teamName, setTeamName] = useState('')
  const [, setTeamProfile] = useState<TeamProfile | null>(null)
  const [profileFields, setProfileFields] = useState({
    companyName: '', companyUrl: '', industry: '', companySize: '',
    targetMarket: '', primaryGoal: '', businessSummary: '',
  })
  const [additionalContext, setAdditionalContext] = useState('')
  const [savingTeam, setSavingTeam] = useState(false)
  const [teamSaved, setTeamSaved] = useState(false)

  // Notification state
  const [globalEnabled, setGlobalEnabled] = useState(true)
  const [inAppEnabled, setInAppEnabled] = useState(true)
  const [emailEnabled, setEmailEnabled] = useState(true)
  const [alerts, setAlerts] = useState<AlertRow[]>(DEFAULT_ALERTS)

  const loadProviders = async () => {
    try {
      const p = await engine.listProviders()
      setProviders(p)
    } catch { /* offline */ }
  }

  const loadNotificationPrefs = useCallback(async () => {
    if (!activeTeam) return
    try {
      // Load global team preferences
      const prefs = await engine.listNotificationPreferences()
      const teamPref = prefs.find((p) => p.teamId === activeTeam.id)
      if (teamPref) {
        setGlobalEnabled(!teamPref.muted)
        setInAppEnabled(teamPref.inAppEnabled)
        setEmailEnabled(teamPref.emailEnabled)
      }

      // Load per-category alert preferences
      const alertPrefs = await engine.listAlertPreferences()
      if (alertPrefs.length > 0) {
        setAlerts((prev) => prev.map((a) => {
          const saved = alertPrefs.find((p) => p.category === a.category)
          return saved ? { ...a, inApp: saved.inApp, email: saved.email, slack: saved.slack, telegram: saved.telegram } : a
        }))
      }
    } catch { /* offline */ }
  }, [activeTeam?.id])

  const loadTeamProfile = useCallback(async () => {
    if (!activeTeam) return
    setTeamName(activeTeam.name)
    try {
      const profile = await engine.getTeamProfile(activeTeam.id)
      setTeamProfile(profile)
      setProfileFields({
        companyName: profile.companyName ?? '',
        companyUrl: profile.companyUrl ?? '',
        industry: profile.industry ?? '',
        companySize: profile.companySize ?? '',
        targetMarket: profile.targetMarket ?? '',
        primaryGoal: profile.primaryGoal ?? '',
        businessSummary: profile.businessSummary ?? '',
      })
      setAdditionalContext(profile.additionalContext ?? '')
    } catch { /* no profile yet */ }
  }, [activeTeam?.id, activeTeam?.name])

  const saveTeamName = async () => {
    if (!activeTeam || !teamName.trim()) return
    setSavingTeam(true)
    try {
      await engine.updateTeam(activeTeam.id, { name: teamName.trim() })
      await refreshTeams()
      setTeamSaved(true)
      setTimeout(() => setTeamSaved(false), 2000)
    } catch { /* error */ }
    setSavingTeam(false)
  }

  const saveBusinessContext = async () => {
    if (!activeTeam) return
    setSavingTeam(true)
    try {
      await engine.updateTeamProfile(activeTeam.id, {
        companyName: profileFields.companyName || null,
        companyUrl: profileFields.companyUrl || null,
        industry: profileFields.industry || null,
        companySize: profileFields.companySize || null,
        targetMarket: profileFields.targetMarket || null,
        primaryGoal: profileFields.primaryGoal || null,
        businessSummary: profileFields.businessSummary || null,
      })
      setTeamSaved(true)
      setTimeout(() => setTeamSaved(false), 2000)
    } catch { /* error */ }
    setSavingTeam(false)
  }

  const saveAdditionalContext = async () => {
    if (!activeTeam) return
    setSavingTeam(true)
    try {
      await engine.updateTeamProfile(activeTeam.id, { additionalContext: additionalContext || null })
      setTeamSaved(true)
      setTimeout(() => setTeamSaved(false), 2000)
    } catch { /* error */ }
    setSavingTeam(false)
  }

  useEffect(() => { loadProviders() }, [])
  useEffect(() => { loadTeamProfile() }, [loadTeamProfile])
  useEffect(() => { loadNotificationPrefs() }, [loadNotificationPrefs])

  const toggleAlert = async (idx: number, field: 'inApp' | 'email' | 'slack' | 'telegram') => {
    const updated = alerts.map((a, i) => i === idx ? { ...a, [field]: !a[field] } : a)
    setAlerts(updated)
    // Save all alert preferences to backend
    try {
      await engine.saveAlertPreferences(updated.map((a) => ({
        category: a.category, inApp: a.inApp, email: a.email, slack: a.slack, telegram: a.telegram,
      })))
    } catch { /* error */ }
  }

  const saveNotificationPrefs = async (updates: { muted?: boolean; inAppEnabled?: boolean; emailEnabled?: boolean }) => {
    if (!activeTeam) return
    setSavingNotifs(true)
    try {
      await engine.updateNotificationPreference(activeTeam.id, updates)
      setNotifSaved(true)
      setTimeout(() => setNotifSaved(false), 2000)
    } catch { /* error */ }
    setSavingNotifs(false)
  }

  const handleGlobalToggle = () => {
    const newVal = !globalEnabled
    setGlobalEnabled(newVal)
    saveNotificationPrefs({ muted: !newVal })
  }

  const handleInAppToggle = () => {
    const newVal = !inAppEnabled
    setInAppEnabled(newVal)
    saveNotificationPrefs({ inAppEnabled: newVal })
  }

  const handleEmailToggle = () => {
    const newVal = !emailEnabled
    setEmailEnabled(newVal)
    saveNotificationPrefs({ emailEnabled: newVal })
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
        <p className="text-sm text-text-muted">Configure model providers and notifications.</p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-border-subtle">
        {([{ id: 'team', label: 'Team' }, { id: 'providers', label: 'Model Providers' }, { id: 'integrations', label: 'Integrations' }, { id: 'notifications', label: 'Notifications' }, { id: 'billing', label: 'Billing' }] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => t.id === 'billing' ? navigate('/settings/billing') : t.id === 'integrations' ? navigate('/settings/integrations') : setTab(t.id as 'team' | 'providers' | 'notifications')}
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

      {/* Team Tab */}
      {tab === 'team' && (
        <div className="space-y-6">
          {teamSaved && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              Saved successfully
            </div>
          )}

          {/* Team Identity */}
          <div className="rounded-lg border border-border-subtle bg-white p-5">
            <h3 className="mb-4 text-sm font-bold text-text-main">Team Identity</h3>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">Team Name</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="flex-1 rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none"
                  placeholder="My Team"
                />
                <button
                  onClick={saveTeamName}
                  disabled={savingTeam || teamName === activeTeam?.name}
                  className="rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white hover:bg-forest-green/90 disabled:opacity-50"
                >
                  {savingTeam ? 'Saving...' : 'Rename'}
                </button>
              </div>
            </div>
          </div>

          {/* Business Context */}
          <div className="rounded-lg border border-border-subtle bg-white p-5">
            <h3 className="mb-1 text-sm font-bold text-text-main">Business Context</h3>
            <p className="mb-4 text-xs text-text-muted">This information helps your agents understand your business.</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-secondary">Company Name</label>
                  <input type="text" value={profileFields.companyName} onChange={(e) => setProfileFields(p => ({ ...p, companyName: e.target.value }))}
                    className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none" placeholder="Acme Inc." />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-secondary">Website</label>
                  <input type="text" value={profileFields.companyUrl} onChange={(e) => setProfileFields(p => ({ ...p, companyUrl: e.target.value }))}
                    className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none" placeholder="https://example.com" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-secondary">Industry</label>
                  <input type="text" value={profileFields.industry} onChange={(e) => setProfileFields(p => ({ ...p, industry: e.target.value }))}
                    className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none" placeholder="SaaS, E-commerce, etc." />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-secondary">Company Size</label>
                  <input type="text" value={profileFields.companySize} onChange={(e) => setProfileFields(p => ({ ...p, companySize: e.target.value }))}
                    className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none" placeholder="1-10, 11-50, etc." />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">Target Market</label>
                <input type="text" value={profileFields.targetMarket} onChange={(e) => setProfileFields(p => ({ ...p, targetMarket: e.target.value }))}
                  className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none" placeholder="Who are your customers?" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">Primary Goal</label>
                <input type="text" value={profileFields.primaryGoal} onChange={(e) => setProfileFields(p => ({ ...p, primaryGoal: e.target.value }))}
                  className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none" placeholder="What's your #1 business objective?" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">Business Summary</label>
                <textarea value={profileFields.businessSummary} onChange={(e) => setProfileFields(p => ({ ...p, businessSummary: e.target.value }))}
                  rows={3} className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none" placeholder="Describe what your company does..." />
              </div>
            </div>
            <button
              onClick={saveBusinessContext}
              disabled={savingTeam}
              className="mt-4 rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white hover:bg-forest-green/90 disabled:opacity-50"
            >
              {savingTeam ? 'Saving...' : 'Save Business Context'}
            </button>
          </div>

          {/* Additional Context (Memories) */}
          <div className="rounded-lg border border-border-subtle bg-white p-5">
            <h3 className="mb-1 text-sm font-bold text-text-main">Additional Context</h3>
            <p className="mb-4 text-xs text-text-muted">
              Add notes your agents should always know about. Think of these like memories — ongoing context that stays relevant across all conversations.
            </p>
            <textarea
              value={additionalContext}
              onChange={(e) => setAdditionalContext(e.target.value)}
              rows={6}
              className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none"
              placeholder={"e.g.\n- We just hired 3 new salespeople starting March 1\n- Our Q2 focus is enterprise deals over $50K\n- We're rebranding from OldName to NewName in April\n- Key competitor launched a new feature last week"}
            />
            <button
              onClick={saveAdditionalContext}
              disabled={savingTeam}
              className="mt-4 rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white hover:bg-forest-green/90 disabled:opacity-50"
            >
              {savingTeam ? 'Saving...' : 'Save Context'}
            </button>
          </div>
        </div>
      )}

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
          {/* Saved indicator */}
          {notifSaved && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              Preferences saved
            </div>
          )}

          {/* Global Toggle */}
          <div className="mb-6 flex items-center justify-between rounded-lg border border-border-subtle bg-white p-4">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-xl text-text-muted">notifications</span>
              <div>
                <p className="text-sm font-bold text-text-main">Global Notifications</p>
                <p className="text-xs text-text-muted">Pause all notifications temporarily without losing your configuration.</p>
              </div>
            </div>
            <button
              onClick={handleGlobalToggle}
              disabled={savingNotifs}
              className={`relative h-6 w-11 rounded-full transition-colors ${globalEnabled ? 'bg-forest-green' : 'bg-gray-300'}`}
            >
              <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${globalEnabled ? 'left-5.5' : 'left-0.5'}`} />
            </button>
          </div>

          {/* Delivery Channels */}
          <div className="mb-6">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-text-muted">
              Delivery Channels
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-white p-4">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-xl text-text-muted">notifications_active</span>
                  <div>
                    <p className="text-sm font-bold text-text-main">In-App Notifications</p>
                    <p className="text-xs text-text-muted">Bell icon alerts in the dashboard</p>
                  </div>
                </div>
                <button
                  onClick={handleInAppToggle}
                  disabled={savingNotifs}
                  className={`relative h-6 w-11 rounded-full transition-colors ${inAppEnabled ? 'bg-forest-green' : 'bg-gray-300'}`}
                >
                  <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${inAppEnabled ? 'left-5.5' : 'left-0.5'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-white p-4">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-xl text-text-muted">email</span>
                  <div>
                    <p className="text-sm font-bold text-text-main">Email Notifications</p>
                    <p className="text-xs text-text-muted">Critical alerts sent to your email</p>
                  </div>
                </div>
                <button
                  onClick={handleEmailToggle}
                  disabled={savingNotifs}
                  className={`relative h-6 w-11 rounded-full transition-colors ${emailEnabled ? 'bg-forest-green' : 'bg-gray-300'}`}
                >
                  <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${emailEnabled ? 'left-5.5' : 'left-0.5'}`} />
                </button>
              </div>
            </div>
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
                    <tr key={alert.category} className="border-b border-border-subtle last:border-0">
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
        </>
      )}
    </div>
  )
}

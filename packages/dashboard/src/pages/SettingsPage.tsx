import { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router'
import * as engine from '@/lib/engine'
import type { TeamProfile } from '@/lib/engine'
import { useTeam } from '@/lib/team-context'
import { SettingsLayout } from '@/components/SettingsLayout'
import type { SettingsTab } from '@/components/SettingsLayout'

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
  const location = useLocation()
  const { activeTeam, refresh: refreshTeams } = useTeam()
  const activeTab: SettingsTab = location.pathname.endsWith('/notifications')
    ? 'notifications'
    : location.pathname.endsWith('/api-keys')
      ? 'api-keys'
      : 'identity'
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
  const [planModeDefault, setPlanModeDefault] = useState(true)
  const [savingTeam, setSavingTeam] = useState(false)
  const [teamSaved, setTeamSaved] = useState(false)

  // Notification state
  const [globalEnabled, setGlobalEnabled] = useState(true)
  const [inAppEnabled, setInAppEnabled] = useState(true)
  const [emailEnabled, setEmailEnabled] = useState(true)
  const [alerts, setAlerts] = useState<AlertRow[]>(DEFAULT_ALERTS)

  // API Keys state
  const [apiKeys, setApiKeys] = useState<engine.ApiKeyInfo[]>([])
  const [apiKeysLoading, setApiKeysLoading] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(['*'])
  const [newKeyExpiry, setNewKeyExpiry] = useState('')
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [keyCopied, setKeyCopied] = useState(false)
  const [confirmAction, setConfirmAction] = useState<{ type: 'revoke' | 'delete' | 'regenerate'; keyId: string; keyName: string } | null>(null)

  const loadNotificationPrefs = useCallback(async () => {
    if (!activeTeam) return
    try {
      const prefs = await engine.listNotificationPreferences()
      const teamPref = prefs.find((p) => p.teamId === activeTeam.id)
      if (teamPref) {
        setGlobalEnabled(!teamPref.muted)
        setInAppEnabled(teamPref.inAppEnabled)
        setEmailEnabled(teamPref.emailEnabled)
      }

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
      setPlanModeDefault(profile.planModeDefault ?? true)
    } catch { /* no profile yet */ }
  }, [activeTeam?.id, activeTeam?.name])

  const loadApiKeys = useCallback(async () => {
    if (!activeTeam) return
    setApiKeysLoading(true)
    try {
      const keys = await engine.listApiKeys()
      setApiKeys(keys)
    } catch { /* offline */ }
    setApiKeysLoading(false)
  }, [activeTeam?.id])

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return
    try {
      const result = await engine.createApiKey(
        newKeyName.trim(),
        newKeyScopes.includes('*') ? undefined : newKeyScopes,
        newKeyExpiry || undefined,
      )
      setCreatedKey(result.plaintext!)
      setShowCreateModal(false)
      setNewKeyName('')
      setNewKeyScopes(['*'])
      setNewKeyExpiry('')
      await loadApiKeys()
    } catch { /* error */ }
  }

  const handleRevokeKey = async (id: string) => {
    try {
      await engine.revokeApiKey(id)
      await loadApiKeys()
    } catch { /* error */ }
    setConfirmAction(null)
  }

  const handleDeleteKey = async (id: string) => {
    try {
      await engine.deleteApiKey(id)
      await loadApiKeys()
    } catch { /* error */ }
    setConfirmAction(null)
  }

  const handleRegenerateKey = async (id: string) => {
    try {
      const result = await engine.regenerateApiKey(id)
      setCreatedKey(result.plaintext!)
      await loadApiKeys()
    } catch { /* error */ }
    setConfirmAction(null)
  }

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

  useEffect(() => { loadTeamProfile() }, [loadTeamProfile])
  useEffect(() => { loadNotificationPrefs() }, [loadNotificationPrefs])
  useEffect(() => { if (activeTab === 'api-keys') loadApiKeys() }, [activeTab, loadApiKeys])

  const toggleAlert = async (idx: number, field: 'inApp' | 'email' | 'slack' | 'telegram') => {
    const updated = alerts.map((a, i) => i === idx ? { ...a, [field]: !a[field] } : a)
    setAlerts(updated)
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

  return (
    <SettingsLayout activeTab={activeTab}>
      {/* Business Context Tab */}
      {activeTab === 'identity' && (
        <div className="max-w-3xl space-y-6">
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

          {/* Plan Mode Default */}
          <div className="rounded-lg border border-border-subtle bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-text-main">Plan Mode</h3>
                <p className="text-xs text-text-muted mt-0.5">
                  {planModeDefault
                    ? 'Agents estimate cost and request approval before expensive tasks'
                    : 'Agents execute immediately without approval (Auto Approve)'}
                </p>
              </div>
              <button
                onClick={async () => {
                  const newVal = !planModeDefault
                  setPlanModeDefault(newVal)
                  if (activeTeam) {
                    await engine.updateTeamProfile(activeTeam.id, { planModeDefault: newVal } as Parameters<typeof engine.updateTeamProfile>[1])
                  }
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${planModeDefault ? 'bg-forest-green' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${planModeDefault ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            <p className="text-[11px] text-text-muted mt-2">This is the default for all agents. Individual agents can override this in their settings.</p>
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

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <div className="max-w-3xl">
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
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((alert, idx) => (
                    <tr key={alert.category} className="border-b border-border-subtle last:border-0">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-text-main">{alert.label}</p>
                        <p className="text-xs text-text-muted">{alert.description}</p>
                      </td>
                      {(['inApp', 'email'] as const).map((field) => (
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
        </div>
      )}
      {/* API Keys Tab */}
      {activeTab === 'api-keys' && (
        <div className="max-w-3xl space-y-6">
          {/* Key created success banner */}
          {createdKey && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-800">
                <span className="material-symbols-outlined text-[16px]">warning</span>
                Copy your API key now — it won't be shown again
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-white px-3 py-2 text-xs font-mono text-text-main border border-amber-200 break-all">
                  {createdKey}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(createdKey)
                    setKeyCopied(true)
                    setTimeout(() => setKeyCopied(false), 2000)
                  }}
                  className="rounded-lg bg-forest-green px-3 py-2 text-sm font-medium text-white hover:bg-forest-green/90"
                >
                  {keyCopied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  onClick={() => { setCreatedKey(null); setKeyCopied(false) }}
                  className="rounded-lg border border-border-subtle px-3 py-2 text-sm text-text-muted hover:bg-light-surface-alt"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Header + Create */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-text-main">API Keys</h3>
              <p className="text-xs text-text-muted">Create keys for programmatic access to the YokeBot API (CI/CD, scripts, integrations).</p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1 rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white hover:bg-forest-green/90"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              Create Key
            </button>
          </div>

          {/* Keys Table */}
          {apiKeysLoading ? (
            <div className="py-12 text-center text-sm text-text-muted">Loading...</div>
          ) : apiKeys.length === 0 ? (
            <div className="rounded-lg border border-border-subtle bg-white p-8 text-center">
              <span className="material-symbols-outlined mb-2 text-3xl text-text-muted">key</span>
              <p className="text-sm text-text-muted">No API keys yet. Create one to get started.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border-subtle bg-white">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border-subtle bg-light-surface-alt/50">
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-muted">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-muted">Key</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-muted">Scopes</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-muted">Last Used</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-muted">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-text-muted">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {apiKeys.map((key) => {
                    const isRevoked = !!key.revokedAt
                    const isExpired = key.expiresAt && new Date(key.expiresAt) < new Date()
                    const status = isRevoked ? 'Revoked' : isExpired ? 'Expired' : 'Active'
                    const statusColor = isRevoked ? 'text-red-600' : isExpired ? 'text-amber-600' : 'text-green-600'
                    return (
                      <tr key={key.id} className="border-b border-border-subtle last:border-0">
                        <td className="px-4 py-3 text-sm font-medium text-text-main">{key.name}</td>
                        <td className="px-4 py-3">
                          <code className="text-xs text-text-muted font-mono">yk_live_{key.keyPrefix}...</code>
                        </td>
                        <td className="px-4 py-3 text-xs text-text-muted">
                          {key.scopes === '*' ? 'Full access' : key.scopes.split(',').length + ' scopes'}
                        </td>
                        <td className="px-4 py-3 text-xs text-text-muted">
                          {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'Never'}
                        </td>
                        <td className={`px-4 py-3 text-xs font-medium ${statusColor}`}>{status}</td>
                        <td className="px-4 py-3 text-right">
                          {!isRevoked && (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => setConfirmAction({ type: 'regenerate', keyId: key.id, keyName: key.name })}
                                className="rounded px-2 py-1 text-xs text-text-muted hover:bg-light-surface-alt"
                                title="Regenerate"
                              >
                                <span className="material-symbols-outlined text-[14px]">refresh</span>
                              </button>
                              <button
                                onClick={() => setConfirmAction({ type: 'revoke', keyId: key.id, keyName: key.name })}
                                className="rounded px-2 py-1 text-xs text-amber-600 hover:bg-amber-50"
                                title="Revoke"
                              >
                                <span className="material-symbols-outlined text-[14px]">block</span>
                              </button>
                              <button
                                onClick={() => setConfirmAction({ type: 'delete', keyId: key.id, keyName: key.name })}
                                className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                                title="Delete"
                              >
                                <span className="material-symbols-outlined text-[14px]">delete</span>
                              </button>
                            </div>
                          )}
                          {isRevoked && (
                            <button
                              onClick={() => setConfirmAction({ type: 'delete', keyId: key.id, keyName: key.name })}
                              className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                              title="Delete"
                            >
                              <span className="material-symbols-outlined text-[14px]">delete</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Create Key Modal */}
          {showCreateModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
                <h3 className="mb-4 text-lg font-bold text-text-main">Create API Key</h3>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-text-secondary">Name</label>
                    <input
                      type="text"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none"
                      placeholder="e.g. CI/CD Pipeline, Zapier Integration"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-text-secondary">Scopes</label>
                    <div className="space-y-1">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={newKeyScopes.includes('*')}
                          onChange={(e) => setNewKeyScopes(e.target.checked ? ['*'] : [])}
                          className="accent-forest-green"
                        />
                        Full access (all scopes)
                      </label>
                      {!newKeyScopes.includes('*') && (
                        <div className="mt-2 grid grid-cols-2 gap-1 pl-2">
                          {['agents', 'tasks', 'chat', 'data', 'files', 'kb'].map((resource) => (
                            <div key={resource} className="space-y-0.5">
                              {['read', 'write'].map((perm) => {
                                const scope = `${resource}:${perm}`
                                return (
                                  <label key={scope} className="flex items-center gap-1.5 text-xs text-text-secondary">
                                    <input
                                      type="checkbox"
                                      checked={newKeyScopes.includes(scope)}
                                      onChange={(e) => {
                                        setNewKeyScopes(e.target.checked
                                          ? [...newKeyScopes, scope]
                                          : newKeyScopes.filter((s) => s !== scope))
                                      }}
                                      className="accent-forest-green"
                                    />
                                    {resource}:{perm}
                                  </label>
                                )
                              })}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-text-secondary">Expiration (optional)</label>
                    <input
                      type="date"
                      value={newKeyExpiry}
                      onChange={(e) => setNewKeyExpiry(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none"
                    />
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    onClick={() => { setShowCreateModal(false); setNewKeyName(''); setNewKeyScopes(['*']); setNewKeyExpiry('') }}
                    className="rounded-lg border border-border-subtle px-4 py-2 text-sm text-text-muted hover:bg-light-surface-alt"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateKey}
                    disabled={!newKeyName.trim()}
                    className="rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white hover:bg-forest-green/90 disabled:opacity-50"
                  >
                    Create Key
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Confirm Action Modal */}
          {confirmAction && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
                <h3 className="mb-2 text-lg font-bold text-text-main">
                  {confirmAction.type === 'revoke' ? 'Revoke' : confirmAction.type === 'delete' ? 'Delete' : 'Regenerate'} API Key
                </h3>
                <p className="mb-4 text-sm text-text-muted">
                  {confirmAction.type === 'revoke' && `This will immediately invalidate the key "${confirmAction.keyName}". Any services using it will lose access.`}
                  {confirmAction.type === 'delete' && `This will permanently delete the key "${confirmAction.keyName}". This cannot be undone.`}
                  {confirmAction.type === 'regenerate' && `This will revoke the current key "${confirmAction.keyName}" and create a new one. Any services using the old key will lose access.`}
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setConfirmAction(null)}
                    className="rounded-lg border border-border-subtle px-4 py-2 text-sm text-text-muted hover:bg-light-surface-alt"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (confirmAction.type === 'revoke') handleRevokeKey(confirmAction.keyId)
                      else if (confirmAction.type === 'delete') handleDeleteKey(confirmAction.keyId)
                      else handleRegenerateKey(confirmAction.keyId)
                    }}
                    className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
                      confirmAction.type === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'
                    }`}
                  >
                    {confirmAction.type === 'revoke' ? 'Revoke Key' : confirmAction.type === 'delete' ? 'Delete Key' : 'Regenerate Key'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </SettingsLayout>
  )
}

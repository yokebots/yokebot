import { useState } from 'react'

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
  const [globalEnabled, setGlobalEnabled] = useState(true)
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

  const toggleAlert = (idx: number, field: 'inApp' | 'email' | 'slack' | 'telegram') => {
    setAlerts((prev) => prev.map((a, i) => i === idx ? { ...a, [field]: !a[field] } : a))
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-main">Notification Settings</h1>
          <p className="text-sm text-text-muted">Manage alert types and delivery channels for your AI agents to ensure you never miss critical updates.</p>
        </div>
        <div className="flex gap-2">
          <button className="rounded-lg border border-border-subtle px-4 py-2 text-sm font-medium text-text-secondary hover:bg-light-surface-alt">
            Discard
          </button>
          <button className="rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white hover:bg-forest-green/90">
            Save Changes
          </button>
        </div>
      </div>

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
                    {ch.connected ? '● Connected' : '○ Not Connected'}
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
    </div>
  )
}

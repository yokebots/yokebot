import { useNavigate } from 'react-router'

const TABS = [
  { id: 'user', label: 'Profile', path: '/settings/user' },
  { id: 'team', label: 'Team', path: '/settings/team' },
  { id: 'identity', label: 'Business Context', path: '/settings' },
  { id: 'integrations', label: 'Integrations', path: '/settings/integrations' },
  { id: 'notifications', label: 'Notifications', path: '/settings/notifications' },
  { id: 'billing', label: 'Billing', path: '/settings/billing' },
] as const

export type SettingsTab = (typeof TABS)[number]['id']

export function SettingsLayout({ activeTab, children }: { activeTab: SettingsTab; children: React.ReactNode }) {
  const navigate = useNavigate()

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-text-main">Settings</h1>
        <p className="text-sm text-text-muted">Manage your team, integrations, and billing.</p>
      </div>

      <div className="mb-6 flex gap-1 border-b border-border-subtle">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => t.id !== activeTab && navigate(t.path)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              t.id === activeTab
                ? 'border-b-2 border-forest-green text-forest-green'
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {children}
    </div>
  )
}

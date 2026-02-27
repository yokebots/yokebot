import { useState } from 'react'
import { Link } from 'react-router'

interface Notification {
  id: string
  agent: string
  context?: string
  message: string
  highlight?: string
  time: string
  severity: 'critical' | 'warning' | 'info' | 'success'
  actionLabel?: string
  actionLink?: string
  dismissed?: boolean
}

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: '1',
    agent: 'SalesBot',
    context: 'Ad Optimization',
    highlight: 'API Rate Limit Exceeded.',
    message: 'Campaign #402 generation halted. Requires immediate token refresh.',
    time: '2m ago',
    severity: 'critical',
    actionLabel: 'Fix Now',
    actionLink: '/agents',
  },
  {
    id: '2',
    agent: 'ContentBot',
    message: 'Draft review needed: "Q4 Product Roadmap Blog Post" is ready for approval.',
    time: '1h ago',
    severity: 'warning',
    actionLabel: 'Review Draft',
    actionLink: '/approvals',
  },
  {
    id: '3',
    agent: 'SocialBot',
    message: "Scheduled 5 tweets successfully for next week's campaign.",
    time: '3h ago',
    severity: 'success',
  },
  {
    id: '4',
    agent: 'System',
    message: 'Weekly performance report is ready for download.',
    time: 'Yesterday',
    severity: 'info',
  },
  {
    id: '5',
    agent: 'ImageGenBot',
    message: 'Stuck on image generation for Ad #42.',
    time: 'Yesterday',
    severity: 'warning',
    actionLabel: 'Resolved',
  },
]

const severityDot: Record<string, string> = {
  critical: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-blue-500',
  success: 'bg-green-500',
}

const severityActionStyle: Record<string, string> = {
  critical: 'bg-red-600 text-white hover:bg-red-700',
  warning: 'bg-forest-green text-white hover:bg-forest-green/90',
  info: 'bg-forest-green text-white hover:bg-forest-green/90',
  success: 'bg-forest-green text-white hover:bg-forest-green/90',
}

export function NotificationCenter({ onClose }: { onClose: () => void }) {
  const [filter, setFilter] = useState<'all' | 'urgent' | 'mentions'>('all')
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS)

  const newCount = notifications.filter((n) => !n.dismissed).length

  const filtered = notifications.filter((n) => {
    if (filter === 'urgent') return n.severity === 'critical' || n.severity === 'warning'
    if (filter === 'mentions') return false // placeholder
    return true
  })

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, dismissed: true })))
  }

  const dismiss = (id: string) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, dismissed: true } : n))
  }

  // Group by time bucket
  const today = filtered.filter((n) => !n.time.includes('Yesterday'))
  const yesterday = filtered.filter((n) => n.time.includes('Yesterday'))

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-96 flex-col border-l border-border-subtle bg-white shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-text-main">Notifications</h2>
          {newCount > 0 && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">{newCount} New</span>
          )}
        </div>
        <button onClick={onClose} className="text-text-muted hover:text-text-main">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between border-b border-border-subtle px-5 py-2">
        <div className="flex gap-1">
          {(['all', 'urgent', 'mentions'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                filter === f ? 'bg-forest-green text-white' : 'text-text-muted hover:bg-light-surface-alt'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <button onClick={markAllRead} className="text-xs text-text-muted hover:text-forest-green">
          Mark all as read
        </button>
      </div>

      {/* Notification List */}
      <div className="flex-1 overflow-y-auto">
        {today.length > 0 && (
          <div>
            <p className="px-5 pt-4 pb-2 text-xs font-bold uppercase tracking-wider text-text-muted">Today</p>
            {today.map((n) => (
              <div key={n.id} className={`border-b border-border-subtle px-5 py-4 ${n.dismissed ? 'opacity-60' : ''}`}>
                <div className="mb-1 flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest-green/10 text-forest-green">
                      <span className="material-symbols-outlined text-[16px]">smart_toy</span>
                    </div>
                    <div>
                      <span className="text-sm font-bold text-text-main">{n.agent}</span>
                      {n.context && <span className="text-sm text-text-muted"> · {n.context}</span>}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-text-muted">{n.time}</span>
                </div>
                <div className="ml-10">
                  <p className="text-sm text-text-secondary">
                    {n.highlight && <span className="font-bold text-red-600">{n.highlight} </span>}
                    {n.message}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${severityDot[n.severity]}`} />
                    {n.actionLabel && n.actionLink && (
                      <Link
                        to={n.actionLink}
                        onClick={onClose}
                        className={`rounded px-3 py-1 text-xs font-medium ${severityActionStyle[n.severity]}`}
                      >
                        {n.actionLabel}
                      </Link>
                    )}
                    {!n.dismissed && (
                      <button onClick={() => dismiss(n.id)} className="text-xs text-text-muted hover:text-text-main">
                        Dismiss
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {yesterday.length > 0 && (
          <div>
            <p className="px-5 pt-4 pb-2 text-xs font-bold uppercase tracking-wider text-text-muted">Yesterday</p>
            {yesterday.map((n) => (
              <div key={n.id} className={`border-b border-border-subtle px-5 py-4 ${n.dismissed ? 'opacity-60' : ''}`}>
                <div className="mb-1 flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                      <span className="material-symbols-outlined text-[16px]">
                        {n.agent === 'System' ? 'computer' : 'smart_toy'}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-text-main">{n.agent}</span>
                  </div>
                  <span className="shrink-0 text-xs text-text-muted">{n.time}</span>
                </div>
                <div className="ml-10">
                  <p className="text-sm text-text-secondary">{n.message}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${severityDot[n.severity]}`} />
                    {n.actionLabel && (
                      <span className="text-xs text-forest-green">{n.actionLabel}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <span className="material-symbols-outlined mb-2 text-4xl text-green-500">check_circle</span>
            <p className="text-sm text-text-muted">You're all caught up!</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border-subtle p-4">
        <Link
          to="/settings"
          onClick={onClose}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border-subtle py-2 text-sm font-medium text-text-secondary hover:bg-light-surface-alt"
        >
          <span className="material-symbols-outlined text-[16px]">settings</span>
          Notification Settings
        </Link>
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { Link } from 'react-router'
import * as engine from '@/lib/engine'

const severityDot: Record<string, string> = {
  approval_needed: 'bg-amber-500',
  task_assigned: 'bg-blue-500',
  agent_message: 'bg-forest-green',
  mention: 'bg-purple-500',
  system: 'bg-gray-400',
}

const typeIcons: Record<string, string> = {
  approval_needed: 'approval',
  task_assigned: 'assignment',
  agent_message: 'smart_toy',
  mention: 'alternate_email',
  system: 'info',
}

export function NotificationCenter({ onClose }: { onClose: () => void }) {
  const [filter, setFilter] = useState<'all' | 'urgent' | 'unread'>('all')
  const [notifications, setNotifications] = useState<engine.EngineNotification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    engine.listNotifications({ limit: 30 })
      .then((data) => { setNotifications(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const unreadCount = notifications.filter((n) => !n.read).length

  const filtered = notifications.filter((n) => {
    if (filter === 'urgent') return n.type === 'approval_needed'
    if (filter === 'unread') return !n.read
    return true
  })

  const markAllRead = async () => {
    await engine.markAllNotificationsRead()
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  const handleClick = async (notif: engine.EngineNotification) => {
    if (!notif.read) {
      await engine.markNotificationRead(notif.id)
      setNotifications((prev) => prev.map((n) => n.id === notif.id ? { ...n, read: true } : n))
    }
    if (notif.link) {
      onClose()
    }
  }

  // Group by day
  const today = new Date()
  const isToday = (d: string) => {
    const date = new Date(d)
    return date.toDateString() === today.toDateString()
  }
  const isYesterday = (d: string) => {
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    return new Date(d).toDateString() === yesterday.toDateString()
  }

  const todayNotifs = filtered.filter((n) => isToday(n.createdAt))
  const yesterdayNotifs = filtered.filter((n) => isYesterday(n.createdAt))
  const olderNotifs = filtered.filter((n) => !isToday(n.createdAt) && !isYesterday(n.createdAt))

  const formatTime = (d: string) => {
    const date = new Date(d)
    if (isToday(d)) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    if (isYesterday(d)) return 'Yesterday'
    return date.toLocaleDateString()
  }

  const renderNotif = (n: engine.EngineNotification) => (
    <div key={n.id} className={`border-b border-border-subtle px-5 py-4 ${n.read ? 'opacity-60' : ''}`}>
      <div className="mb-1 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${n.read ? 'bg-gray-100 text-gray-500' : 'bg-forest-green/10 text-forest-green'}`}>
            <span className="material-symbols-outlined text-[16px]">
              {typeIcons[n.type] ?? 'circle'}
            </span>
          </div>
          <span className="text-sm font-bold text-text-main">{n.title}</span>
        </div>
        <span className="shrink-0 text-xs text-text-muted">{formatTime(n.createdAt)}</span>
      </div>
      <div className="ml-10">
        {n.body && <p className="text-sm text-text-secondary">{n.body}</p>}
        <div className="mt-2 flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${severityDot[n.type] ?? 'bg-gray-400'}`} />
          {n.link && (
            <Link
              to={n.link}
              onClick={() => handleClick(n)}
              className="rounded bg-forest-green px-3 py-1 text-xs font-medium text-white hover:bg-forest-green/90"
            >
              View
            </Link>
          )}
          {!n.read && !n.link && (
            <button onClick={() => handleClick(n)} className="text-xs text-text-muted hover:text-text-main">
              Mark read
            </button>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-96 flex-col border-l border-border-subtle bg-white shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-text-main">Notifications</h2>
          {unreadCount > 0 && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">{unreadCount} New</span>
          )}
        </div>
        <button onClick={onClose} className="text-text-muted hover:text-text-main">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between border-b border-border-subtle px-5 py-2">
        <div className="flex gap-1">
          {(['all', 'urgent', 'unread'] as const).map((f) => (
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
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="text-xs text-text-muted hover:text-forest-green">
            Mark all as read
          </button>
        )}
      </div>

      {/* Notification List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <span className="text-sm text-text-muted">Loading...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <span className="material-symbols-outlined mb-2 text-4xl text-green-500">check_circle</span>
            <p className="text-sm text-text-muted">You're all caught up!</p>
          </div>
        ) : (
          <>
            {todayNotifs.length > 0 && (
              <div>
                <p className="px-5 pt-4 pb-2 text-xs font-bold uppercase tracking-wider text-text-muted">Today</p>
                {todayNotifs.map(renderNotif)}
              </div>
            )}
            {yesterdayNotifs.length > 0 && (
              <div>
                <p className="px-5 pt-4 pb-2 text-xs font-bold uppercase tracking-wider text-text-muted">Yesterday</p>
                {yesterdayNotifs.map(renderNotif)}
              </div>
            )}
            {olderNotifs.length > 0 && (
              <div>
                <p className="px-5 pt-4 pb-2 text-xs font-bold uppercase tracking-wider text-text-muted">Earlier</p>
                {olderNotifs.map(renderNotif)}
              </div>
            )}
          </>
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

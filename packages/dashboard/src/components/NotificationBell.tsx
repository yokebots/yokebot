/**
 * NotificationBell.tsx — Bell icon with unread badge + dropdown
 */

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import * as engine from '@/lib/engine'
import { useTeam } from '@/lib/team-context'

export default function NotificationBell() {
  const { activeTeam } = useTeam()
  const navigate = useNavigate()
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<engine.EngineNotification[]>([])
  const ref = useRef<HTMLDivElement>(null)

  // Poll unread count
  useEffect(() => {
    const load = async () => {
      try {
        const { count } = await engine.notificationCount()
        setUnread(count)
      } catch { /* ignore */ }
    }
    load()
    const interval = setInterval(load, 10000)
    return () => clearInterval(interval)
  }, [activeTeam?.id])

  // Load notifications when dropdown opens
  useEffect(() => {
    if (!open) return
    engine.listNotifications({ limit: 10 }).then(setNotifications).catch(() => {})
  }, [open])

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleMarkAllRead() {
    await engine.markAllNotificationsRead()
    setUnread(0)
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  async function handleClick(notif: engine.EngineNotification) {
    if (!notif.read) {
      await engine.markNotificationRead(notif.id)
      setUnread((prev) => Math.max(0, prev - 1))
      setNotifications((prev) => prev.map((n) => n.id === notif.id ? { ...n, read: true } : n))
    }
    if (notif.link) {
      navigate(notif.link)
      setOpen(false)
    }
  }

  const typeIcons: Record<string, string> = {
    approval_needed: 'approval',
    task_assigned: 'assignment',
    agent_message: 'smart_toy',
    mention: 'alternate_email',
    system: 'info',
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-light-surface-alt transition-colors"
      >
        <span className="material-symbols-outlined text-[22px] text-text-secondary">notifications</span>
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-border-subtle rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
            <h3 className="text-sm font-bold text-text-main">Notifications</h3>
            {unread > 0 && (
              <button onClick={handleMarkAllRead} className="text-xs text-forest-green hover:underline">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-text-muted">No notifications yet</div>
            ) : (
              notifications.map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => handleClick(notif)}
                  className={`flex items-start gap-3 w-full px-4 py-3 text-left hover:bg-light-surface-alt transition-colors ${!notif.read ? 'bg-forest-green-light/30' : ''}`}
                >
                  <span className="material-symbols-outlined text-[18px] text-text-muted mt-0.5">
                    {typeIcons[notif.type] ?? 'circle'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${!notif.read ? 'font-semibold text-text-main' : 'text-text-secondary'}`}>
                      {notif.title}
                    </p>
                    {notif.body && (
                      <p className="text-xs text-text-muted truncate mt-0.5">{notif.body}</p>
                    )}
                    <p className="text-[10px] text-text-muted mt-1">
                      {new Date(notif.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {!notif.read && <span className="w-2 h-2 rounded-full bg-forest-green mt-1.5 flex-shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

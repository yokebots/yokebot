import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router'
import { UniversalSearch } from '@/components/UniversalSearch'
import { NotificationCenter } from '@/components/NotificationCenter'
import { ActivityDropdown } from '@/components/workspace/ActivityDropdown'
import { useSidebar } from '@/lib/sidebar-context'
import { useRealtimeEvent } from '@/lib/use-realtime'
import * as engine from '@/lib/engine'

export function TopBar() {
  const [showSearch, setShowSearch] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [credits, setCredits] = useState<number | null>(null)
  const [unread, setUnread] = useState(0)
  const [agents, setAgents] = useState<engine.EngineAgent[]>([])
  const [toggling, setToggling] = useState(false)
  const [showAgentTooltip, setShowAgentTooltip] = useState(false)
  const [confirmToggle, setConfirmToggle] = useState<'pause' | 'resume' | null>(null)
  const navigate = useNavigate()
  const { setMobileOpen } = useSidebar()

  // Fetch agents on mount
  useEffect(() => {
    engine.listAgents().then(setAgents).catch(() => {})
  }, [])

  // Refresh agent status when agents change
  useRealtimeEvent<{ agentId: string; status: string }>('agent_status', () => {
    engine.listAgents().then(setAgents).catch(() => {})
  })

  const runningAgents = agents.filter(a => a.status === 'running')
  const pausedAgents = agents.filter(a => a.status === 'paused')
  const allRunning = agents.length > 0 && pausedAgents.length === 0
  const allPaused = agents.length > 0 && runningAgents.length === 0
  const mixed = agents.length > 0 && !allRunning && !allPaused

  const toggleAgents = useCallback(async (forceStatus?: 'running' | 'paused') => {
    if (toggling || agents.length === 0) return

    const targetStatus = forceStatus ?? (allPaused ? 'running' : 'paused')

    // Mixed state requires confirmation (2-click)
    if (mixed && !forceStatus) {
      setConfirmToggle(targetStatus === 'running' ? 'resume' : 'pause')
      return
    }

    setToggling(true)
    setConfirmToggle(null)
    try {
      await engine.bulkSetAgentStatus(targetStatus)
      engine.listAgents().then(setAgents).catch(() => {})
    } catch { /* ignore */ }
    setToggling(false)
  }, [agents, allPaused, mixed, toggling])

  // Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowSearch(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // SSE: credits + notification count (initial snapshot + live updates)
  useRealtimeEvent<{ credits: number }>('credits', (data) => setCredits(data.credits))
  useRealtimeEvent<{ count: number }>('notification_count', (data) => setUnread(data.count))

  return (
    <>
      <header className="sticky top-0 z-10 flex h-14 md:h-16 items-center justify-between border-b border-border-subtle bg-white/80 backdrop-blur-md px-3 md:px-6">
        {/* Left: Hamburger (mobile) + Search */}
        <div className="flex flex-1 items-center gap-2 md:gap-0 max-w-xl">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden rounded-lg p-1.5 text-text-muted hover:bg-light-surface-alt hover:text-text-main transition-colors"
          >
            <span className="material-symbols-outlined text-[22px]">menu</span>
          </button>

          <button
            onClick={() => setShowSearch(true)}
            className="flex w-full items-center gap-2 rounded-lg border border-border-subtle bg-light-surface-alt py-2 pl-3 pr-4 text-sm text-text-muted transition-colors hover:border-forest-green"
          >
            <span className="material-symbols-outlined text-[20px]">search</span>
            <span className="flex-1 text-left hidden sm:inline">Search agents, tasks, or files...</span>
            <span className="flex-1 text-left sm:hidden">Search...</span>
            <kbd className="hidden sm:inline rounded border border-border-subtle bg-white px-1.5 py-0.5 text-[10px] font-mono text-text-muted">⌘K</kbd>
          </button>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3 md:gap-6 pl-3 md:pl-6">
          {/* Agent toggle */}
          <div
            className="relative"
            onMouseEnter={() => setShowAgentTooltip(true)}
            onMouseLeave={() => { setShowAgentTooltip(false); setConfirmToggle(null) }}
          >
            <div className={`flex items-center rounded-full border shadow-sm transition-colors ${
              allPaused
                ? 'border-gray-300 bg-gray-50'
                : allRunning
                  ? 'border-emerald-300 bg-emerald-50'
                  : 'border-amber-300 bg-amber-50'
            }`}>
              {/* Toggle button — ON/OFF */}
              <button
                onClick={() => toggleAgents()}
                disabled={toggling || agents.length === 0}
                className="flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 transition-colors hover:opacity-80 disabled:opacity-50"
              >
                <span className={`material-symbols-outlined text-[18px] ${
                  allPaused ? 'text-gray-500' : allRunning ? 'text-emerald-600' : 'text-amber-600'
                }`}>
                  {allPaused ? 'pause_circle' : 'play_circle'}
                </span>
                <span className="hidden sm:inline text-xs font-medium text-text-main">
                  {allPaused ? 'OFF' : allRunning ? 'ON' : `${runningAgents.length}/${agents.length}`}
                </span>
              </button>

              {/* Mixed state asterisk — click goes to agents page */}
              {mixed && (
                <button
                  onClick={() => navigate('/agents')}
                  className="pr-2 text-amber-500 text-xs font-bold hover:text-amber-700 transition-colors"
                  title="Some agents are paused — click to manage"
                >
                  *
                </button>
              )}
            </div>

            {/* Hover tooltip — agent status list */}
            {showAgentTooltip && agents.length > 0 && (
              <div className="absolute top-full right-0 mt-1 w-56 rounded-lg border border-border-subtle bg-white p-2.5 shadow-lg z-50">
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1.5">Agent Status</p>
                {agents.map(a => (
                  <div key={a.id} className="flex items-center gap-1.5 py-0.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${a.status === 'running' ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                    <span className="text-xs text-text-main truncate flex-1">{a.name}</span>
                    <span className={`text-[10px] ${a.status === 'running' ? 'text-emerald-600' : 'text-gray-500'}`}>
                      {a.status === 'running' ? 'ON' : 'OFF'}
                    </span>
                  </div>
                ))}

                {/* Confirmation buttons for mixed state toggle */}
                {confirmToggle && (
                  <div className="mt-2 pt-2 border-t border-border-subtle flex gap-1.5">
                    <button
                      onClick={() => toggleAgents(confirmToggle === 'resume' ? 'running' : 'paused')}
                      disabled={toggling}
                      className="flex-1 text-[10px] font-medium py-1 rounded-md bg-forest-green text-white hover:bg-forest-green/90 disabled:opacity-50"
                    >
                      {confirmToggle === 'resume' ? 'Resume All' : 'Pause All'}
                    </button>
                    <button
                      onClick={() => setConfirmToggle(null)}
                      className="flex-1 text-[10px] font-medium py-1 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Credits */}
          <button
            onClick={() => navigate('/settings/billing')}
            className={`flex items-center gap-1.5 md:gap-2 rounded-full border px-2.5 md:px-3 py-1.5 shadow-sm transition-colors ${
              credits !== null && credits <= 0
                ? 'border-red-300 bg-red-50 hover:border-red-400'
                : 'border-border-subtle bg-white hover:border-forest-green'
            }`}
          >
            <span className={`material-symbols-outlined text-[18px] ${credits !== null && credits <= 0 ? 'text-red-500' : 'text-accent-gold'}`}>
              {credits !== null && credits <= 0 ? 'warning' : 'bolt'}
            </span>
            <span className="font-mono text-sm font-bold text-text-main">{credits !== null ? credits.toLocaleString() : '--'}</span>
            <span className="hidden sm:inline text-xs text-text-muted">{credits !== null && credits <= 0 ? 'Add credits' : 'credits'}</span>
          </button>

          <div className="hidden sm:block h-6 w-px bg-border-subtle" />

          {/* Activity Log */}
          <ActivityDropdown />

          {/* Notifications */}
          <button
            onClick={() => { setShowNotifications(true); setUnread(0) }}
            className="relative text-text-muted hover:text-text-main"
          >
            <span className="material-symbols-outlined">notifications</span>
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Universal Search Overlay */}
      {showSearch && <UniversalSearch onClose={() => setShowSearch(false)} />}

      {/* Notification Center Slide-over */}
      {showNotifications && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setShowNotifications(false)} />
          <NotificationCenter onClose={() => setShowNotifications(false)} />
        </>
      )}
    </>
  )
}

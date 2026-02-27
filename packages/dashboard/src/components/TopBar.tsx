import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { UniversalSearch } from '@/components/UniversalSearch'
import { NotificationCenter } from '@/components/NotificationCenter'
import { getBillingStatus } from '@/lib/engine'

export function TopBar() {
  const [showSearch, setShowSearch] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [credits, setCredits] = useState<number | null>(null)
  const navigate = useNavigate()

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

  // Load credit balance
  useEffect(() => {
    getBillingStatus()
      .then((s) => setCredits(s.credits))
      .catch(() => setCredits(null))
  }, [])

  return (
    <>
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border-subtle bg-white/80 backdrop-blur-md px-6">
        {/* Search trigger */}
        <div className="flex flex-1 items-center max-w-xl">
          <button
            onClick={() => setShowSearch(true)}
            className="flex w-full items-center gap-2 rounded-lg border border-border-subtle bg-light-surface-alt py-2 pl-3 pr-4 text-sm text-text-muted transition-colors hover:border-forest-green"
          >
            <span className="material-symbols-outlined text-[20px]">search</span>
            <span className="flex-1 text-left">Search agents, tasks, or files...</span>
            <kbd className="rounded border border-border-subtle bg-white px-1.5 py-0.5 text-[10px] font-mono text-text-muted">⌘K</kbd>
          </button>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-6 pl-6">
          {/* Credits */}
          <button
            onClick={() => navigate('/settings/billing')}
            className="flex items-center gap-2 rounded-full border border-border-subtle bg-white px-3 py-1.5 shadow-sm hover:border-forest-green transition-colors"
          >
            <span className="material-symbols-outlined text-accent-gold text-[18px]">bolt</span>
            <span className="font-mono text-sm font-bold text-text-main">{credits !== null ? credits.toLocaleString() : '--'}</span>
            <span className="text-xs text-text-muted">credits</span>
          </button>

          <div className="h-6 w-px bg-border-subtle" />

          {/* Notifications */}
          <button
            onClick={() => setShowNotifications(true)}
            className="relative text-text-muted hover:text-text-main"
          >
            <span className="material-symbols-outlined">notifications</span>
            <span className="absolute right-0 top-0 h-2 w-2 rounded-full border border-white bg-accent-gold" />
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

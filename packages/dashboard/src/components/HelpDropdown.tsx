import { useState, useEffect, useRef } from 'react'

interface HelpDropdownProps {
  onRestartTour?: () => void
}

export function HelpDropdown({ onRestartTour }: HelpDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const items = [
    { icon: 'menu_book', label: 'Documentation', href: 'https://yokebot.com/docs' },
    { icon: 'monitor_heart', label: 'System Status', href: 'https://yokebot.com/status' },
    { icon: 'mail', label: 'Contact Support', href: 'mailto:support@yokebot.com' },
    { icon: 'rate_review', label: 'Give Feedback', href: 'https://github.com/yokebots/yokebot/issues' },
    { icon: 'forum', label: 'Join Discord', href: 'https://discord.gg/kqfFr87KqV' },
    { divider: true },
    { icon: 'keyboard', label: 'Keyboard Shortcuts', action: () => { setOpen(false); showShortcuts() } },
    ...(onRestartTour ? [{ icon: 'tour', label: 'Restart Tutorial', action: () => { setOpen(false); onRestartTour() } }] : []),
  ]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="text-text-muted hover:text-text-main transition-colors"
        title="Help & Support"
      >
        <span className="material-symbols-outlined">help</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 rounded-lg border border-border-subtle bg-white shadow-lg py-1 z-50">
          {items.map((item, i) => {
            if ('divider' in item) {
              return <div key={i} className="my-1 border-t border-border-subtle" />
            }
            if (item.href) {
              return (
                <a
                  key={i}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-text-main hover:bg-light-surface-alt transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px] text-text-muted">{item.icon}</span>
                  {item.label}
                </a>
              )
            }
            return (
              <button
                key={i}
                onClick={item.action}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-text-main hover:bg-light-surface-alt transition-colors"
              >
                <span className="material-symbols-outlined text-[18px] text-text-muted">{item.icon}</span>
                {item.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function showShortcuts() {
  // Simple alert for now — could be a modal later
  alert(
    'Keyboard Shortcuts\n\n' +
    'Cmd+K — Universal Search\n' +
    'Cmd+Enter — Send message\n' +
    'Escape — Close overlay / Cancel'
  )
}

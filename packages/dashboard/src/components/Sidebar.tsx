import { NavLink } from 'react-router'
import { useAuth } from '@/lib/auth'
import { useEffect, useState } from 'react'
import * as engine from '@/lib/engine'

const mainNav = [
  { to: '/dashboard', icon: 'dashboard', label: 'Dashboard' },
  { to: '/mission-control', icon: 'rocket_launch', label: 'Mission Control' },
  { to: '/chat', icon: 'forum', label: 'Chat' },
  { to: '/agents', icon: 'smart_toy', label: 'Agents' },
  { to: '/approvals', icon: 'approval', label: 'Approval Queue', badgeKey: 'approvals' as const },
]

const resourceNav = [
  { to: '/data-tables', icon: 'table_chart', label: 'Data Tables' },
  { to: '/knowledge-base', icon: 'menu_book', label: 'Knowledge Base' },
  { to: '/skills', icon: 'extension', label: 'Skills' },
  { to: '/templates', icon: 'library_books', label: 'Templates' },
]

const settingsNav = [
  { to: '/settings', icon: 'settings', label: 'Settings' },
]

export function Sidebar() {
  const { user } = useAuth()
  const [approvalCount, setApprovalCount] = useState(0)

  useEffect(() => {
    const load = async () => {
      try {
        const data = await engine.approvalCount()
        setApprovalCount(data.count)
      } catch { /* engine offline */ }
    }
    load()
    const interval = setInterval(load, 10000)
    return () => clearInterval(interval)
  }, [])

  return (
    <aside className="flex w-64 flex-col border-r border-border-subtle bg-light-surface h-full fixed md:relative z-20">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-border-subtle px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-forest-green text-white shadow-soft">
          <span className="text-lg">🐂</span>
        </div>
        <span className="font-display text-lg font-bold tracking-tight text-text-main">YokeBot</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-6">
        {mainNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                isActive
                  ? 'border border-forest-green/20 bg-forest-green-light text-forest-green'
                  : 'text-text-secondary hover:bg-light-surface-alt hover:text-text-main'
              }`
            }
          >
            <span className="material-symbols-outlined text-[20px] group-hover:text-forest-green transition-colors">
              {item.icon}
            </span>
            {item.label}
            {item.badgeKey === 'approvals' && approvalCount > 0 && (
              <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {approvalCount}
              </span>
            )}
          </NavLink>
        ))}

        {/* Resources section */}
        <div className="mt-6 border-t border-border-subtle pt-6">
          <p className="mb-2 px-3 font-mono text-xs font-medium uppercase tracking-wider text-text-muted">
            Resources
          </p>
          {resourceNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? 'border border-forest-green/20 bg-forest-green-light text-forest-green'
                    : 'text-text-secondary hover:bg-light-surface-alt hover:text-text-main'
                }`
              }
            >
              <span className="material-symbols-outlined text-[20px] group-hover:text-forest-green transition-colors">
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          ))}
        </div>

        {/* Settings section */}
        <div className="mt-6 border-t border-border-subtle pt-6">
          {settingsNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? 'border border-forest-green/20 bg-forest-green-light text-forest-green'
                    : 'text-text-secondary hover:bg-light-surface-alt hover:text-text-main'
                }`
              }
            >
              <span className="material-symbols-outlined text-[20px] group-hover:text-forest-green transition-colors">
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* User Profile */}
      <div className="border-t border-border-subtle p-4">
        <div className="cursor-pointer rounded-xl border border-border-subtle bg-light-surface-alt p-3 transition-colors hover:border-border-strong">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 overflow-hidden rounded-full bg-gradient-to-tr from-forest-green to-green-300 p-[1px]">
              <div className="flex h-full w-full items-center justify-center rounded-full bg-white text-xs font-bold text-forest-green">
                {user?.email?.[0]?.toUpperCase() ?? 'U'}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-text-main">
                {user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'User'}
              </p>
              <p className="truncate text-xs text-text-muted">Admin</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}

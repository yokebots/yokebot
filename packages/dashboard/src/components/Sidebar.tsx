import { NavLink } from 'react-router'
import { useAuth } from '@/lib/auth'
import { useEffect, useState } from 'react'
import * as engine from '@/lib/engine'
import TeamSwitcher from './TeamSwitcher'
import { useTeam } from '@/lib/team-context'
import { useSidebar } from '@/lib/sidebar-context'

const mainNav = [
  { to: '/dashboard', icon: 'dashboard', label: 'Dashboard', end: true },
  { to: '/tasks', icon: 'task_alt', label: 'Tasks' },
  { to: '/projects', icon: 'folder_open', label: 'Projects' },
  { to: '/goals', icon: 'flag', label: 'Goals' },
  { to: '/chat', icon: 'forum', label: 'Chat' },
  { to: '/agents', icon: 'smart_toy', label: 'Agents' },
  { to: '/approvals', icon: 'approval', label: 'Approvals', badgeKey: 'approvals' as const },
  { to: '/activity', icon: 'timeline', label: 'Activity' },
]

const resourceNav = [
  { to: '/data-tables', icon: 'table_chart', label: 'Data Tables' },
  { to: '/knowledge-base', icon: 'menu_book', label: 'Knowledge Base' },
  { to: '/skills', icon: 'extension', label: 'Skills' },
  { to: '/templates', icon: 'library_books', label: 'Templates' },
]

const settingsNav = [
  { to: '/team', icon: 'group', label: 'Team' },
  { to: '/settings', icon: 'settings', label: 'Settings' },
]

export function Sidebar() {
  const { user, signOut } = useAuth()
  const { activeTeam } = useTeam()
  const { collapsed, toggle, mobileOpen, closeMobile } = useSidebar()
  const [approvalCount, setApprovalCount] = useState(0)

  useEffect(() => {
    if (!activeTeam) return
    const load = async () => {
      try {
        const approvalData = await engine.approvalCount()
        setApprovalCount(approvalData.count)
      } catch { /* engine offline */ }
    }
    load()
    const interval = setInterval(load, 10000)
    return () => clearInterval(interval)
  }, [activeTeam?.id])

  // On mobile, always show expanded sidebar (not icon-only)
  const showLabels = mobileOpen || !collapsed

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
      isActive
        ? 'border border-forest-green/20 bg-forest-green-light text-forest-green'
        : 'text-text-secondary hover:bg-light-surface-alt hover:text-text-main'
    } ${!showLabels ? 'justify-center' : ''}`

  const handleNavClick = () => {
    // Auto-close sidebar on mobile after navigation
    closeMobile()
  }

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={closeMobile}
        />
      )}

      <aside
        className={[
          'flex flex-col border-r border-border-subtle bg-light-surface h-full z-30 transition-all duration-200',
          // Mobile: fixed, off-screen by default, slide in when open
          'fixed -translate-x-full md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '',
          // Mobile always 64w (w-64), desktop respects collapsed
          'w-64',
          // Desktop: relative positioning, respect collapsed width
          'md:relative',
          collapsed ? 'md:w-16' : 'md:w-64',
        ].join(' ')}
      >
        {/* Logo / Toggle */}
        <div className={`flex h-16 items-center border-b border-border-subtle ${!showLabels ? 'justify-center px-2' : 'gap-3 px-6'}`}>
          {showLabels && (
            <>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-forest-green text-white shadow-soft">
                <span className="text-lg">🐂</span>
              </div>
              <span className="flex-1 font-display text-lg font-bold tracking-tight text-text-main">YokeBot</span>
            </>
          )}
          {/* Desktop toggle — hidden on mobile (hamburger in TopBar handles it) */}
          <button
            onClick={toggle}
            className="hidden md:flex rounded-lg p-1.5 text-text-muted hover:bg-light-surface-alt hover:text-text-main transition-colors"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span className="material-symbols-outlined text-[18px]">
              {collapsed ? 'chevron_right' : 'chevron_left'}
            </span>
          </button>
          {/* Mobile close button */}
          <button
            onClick={closeMobile}
            className="md:hidden rounded-lg p-1.5 text-text-muted hover:bg-light-surface-alt hover:text-text-main transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Team Switcher */}
        {showLabels && (
          <div className="px-4 py-3 border-b border-border-subtle">
            <TeamSwitcher />
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-6">
          {mainNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={navLinkClass}
              title={!showLabels ? item.label : undefined}
              onClick={handleNavClick}
            >
              <span className="material-symbols-outlined text-[20px] group-hover:text-forest-green transition-colors">
                {item.icon}
              </span>
              {showLabels && item.label}
              {showLabels && item.badgeKey === 'approvals' && approvalCount > 0 && (
                <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {approvalCount}
                </span>
              )}
              {!showLabels && item.badgeKey === 'approvals' && approvalCount > 0 && (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
              )}
            </NavLink>
          ))}

          {/* Resources section */}
          <div className="mt-6 border-t border-border-subtle pt-6">
            {showLabels && (
              <p className="mb-2 px-3 font-mono text-xs font-medium uppercase tracking-wider text-text-muted">
                Resources
              </p>
            )}
            {resourceNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={navLinkClass}
                title={!showLabels ? item.label : undefined}
                onClick={handleNavClick}
              >
                <span className="material-symbols-outlined text-[20px] group-hover:text-forest-green transition-colors">
                  {item.icon}
                </span>
                {showLabels && item.label}
              </NavLink>
            ))}
          </div>

          {/* Settings section */}
          <div className="mt-6 border-t border-border-subtle pt-6">
            {settingsNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={navLinkClass}
                title={!showLabels ? item.label : undefined}
                onClick={handleNavClick}
              >
                <span className="material-symbols-outlined text-[20px] group-hover:text-forest-green transition-colors">
                  {item.icon}
                </span>
                {showLabels && item.label}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* User Profile */}
        {showLabels ? (
          <div className="border-t border-border-subtle p-4">
            <div className="rounded-xl border border-border-subtle bg-light-surface-alt p-3">
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
                  <p className="truncate text-xs text-text-muted">{activeTeam?.role ? activeTeam.role.charAt(0).toUpperCase() + activeTeam.role.slice(1) : 'Member'}</p>
                </div>
                <button
                  onClick={signOut}
                  className="rounded-lg p-1.5 text-text-muted hover:bg-red-50 hover:text-red-600 transition-colors"
                  title="Log out"
                >
                  <span className="material-symbols-outlined text-[18px]">logout</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="border-t border-border-subtle p-2 flex flex-col items-center gap-2">
            <div className="h-8 w-8 overflow-hidden rounded-full bg-gradient-to-tr from-forest-green to-green-300 p-[1px]">
              <div className="flex h-full w-full items-center justify-center rounded-full bg-white text-xs font-bold text-forest-green">
                {user?.email?.[0]?.toUpperCase() ?? 'U'}
              </div>
            </div>
            <button
              onClick={signOut}
              className="rounded-lg p-1.5 text-text-muted hover:bg-red-50 hover:text-red-600 transition-colors"
              title="Log out"
            >
              <span className="material-symbols-outlined text-[16px]">logout</span>
            </button>
          </div>
        )}
      </aside>
    </>
  )
}

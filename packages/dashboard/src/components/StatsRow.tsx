import { Link } from 'react-router'

interface StatsRowProps {
  activeAgents?: number
  totalAgents?: number
  pendingApprovals?: number
  totalTasks?: number
  connected?: boolean
}

export function StatsRow({ activeAgents = 0, totalAgents = 0, pendingApprovals = 0, totalTasks = 0, connected = false }: StatsRowProps) {
  const stats = [
    {
      label: 'Active Agents',
      value: connected ? String(activeAgents) : '—',
      sub: connected ? `/${totalAgents}` : '',
      icon: 'check_circle',
      iconColor: 'text-accent-green',
      to: '/agents',
    },
    {
      label: 'Total Tasks',
      value: connected ? String(totalTasks) : '—',
      icon: 'task_alt',
      iconColor: 'text-accent-gold',
      to: '/tasks',
    },
    {
      label: 'Pending Approvals',
      value: connected ? String(pendingApprovals) : '—',
      icon: 'approval',
      iconColor: pendingApprovals > 0 ? 'text-red-500' : 'text-blue-600',
      to: '/approvals',
    },
    {
      label: 'Engine Status',
      value: connected ? 'Online' : 'Offline',
      icon: connected ? 'cloud_done' : 'cloud_off',
      iconColor: connected ? 'text-accent-green' : 'text-gray-400',
      to: undefined as string | undefined,
    },
  ]

  return (
    <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
      {stats.map((stat) => {
        const content = (
          <>
            <div className="mb-2 flex items-start justify-between">
              <p className="font-mono text-xs font-medium uppercase text-text-muted">{stat.label}</p>
              <span className={`material-symbols-outlined text-[20px] ${stat.iconColor}`}>
                {stat.icon}
              </span>
            </div>
            <p className="font-display text-2xl font-bold text-text-main">
              {stat.value}
              {stat.sub && <span className="text-lg font-normal text-text-muted">{stat.sub}</span>}
            </p>
          </>
        )

        if (stat.to) {
          return (
            <Link
              key={stat.label}
              to={stat.to}
              className="rounded-xl border border-border-subtle bg-white p-4 shadow-card hover:border-forest-green/30 hover:shadow-md transition-all"
            >
              {content}
            </Link>
          )
        }

        return (
          <div
            key={stat.label}
            className="rounded-xl border border-border-subtle bg-white p-4 shadow-card"
          >
            {content}
          </div>
        )
      })}
    </div>
  )
}

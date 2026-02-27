import type { Agent } from '@/types/agent'

const statusDot: Record<string, string> = {
  active: 'bg-accent-green status-dot-pulse',
  paused: 'bg-yellow-500',
  error: 'bg-red-500',
  offline: 'bg-gray-400',
}

export function AgentCard({ agent }: { agent: Agent }) {
  return (
    <div className="agent-card group relative rounded-xl border border-border-subtle bg-white p-5 shadow-card hover:shadow-lg">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-lg border ${agent.icon.bgColor} ${agent.icon.textColor} ${agent.icon.borderColor}`}
          >
            <span className="material-symbols-outlined">{agent.icon.symbol}</span>
          </div>
          <div>
            <h3 className="text-sm font-bold text-text-main">{agent.name}</h3>
            <p className="font-mono text-xs text-text-muted">{agent.department}</p>
          </div>
        </div>
        <div className={`h-2.5 w-2.5 rounded-full ${statusDot[agent.status]}`} />
      </div>

      {/* Metrics */}
      <div className="mb-4 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-muted">Last Active</span>
          <span className="font-mono font-medium text-text-main">{agent.lastActive}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-muted">{agent.metricLabel}</span>
          <span className={`font-mono font-medium ${agent.metricColor ?? 'text-text-main'}`}>
            {agent.metricValue}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className={`h-full rounded-full ${agent.progressColor}`}
            style={{ width: `${agent.progressPercent}%` }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border-subtle pt-4">
        <div className="flex -space-x-2">
          {agent.channels.map((ch) => (
            <div
              key={ch.icon}
              title={ch.title}
              className="flex h-6 w-6 items-center justify-center rounded border border-border-subtle bg-white shadow-sm"
            >
              <span className="material-symbols-outlined text-[14px] text-text-muted">{ch.icon}</span>
            </div>
          ))}
        </div>
        <div className="rounded border border-border-subtle bg-gray-50 px-2 py-0.5 font-mono text-[10px] font-medium text-text-muted">
          {agent.model}
        </div>
      </div>
    </div>
  )
}

export function DeployNewAgentCard({ onClick }: { onClick?: () => void }) {
  return (
    <button onClick={onClick} className="agent-card group flex h-full min-h-[220px] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border-strong bg-white p-5 transition-all hover:border-forest-green hover:bg-forest-green-light/30">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border-subtle bg-light-surface-alt transition-all group-hover:border-forest-green group-hover:bg-forest-green/10">
        <span className="material-symbols-outlined text-3xl text-text-muted group-hover:text-forest-green">
          add
        </span>
      </div>
      <div className="text-center">
        <h3 className="mb-1 text-sm font-bold text-text-main group-hover:text-forest-green">
          Deploy New Agent
        </h3>
        <p className="text-xs text-text-muted">From template or scratch</p>
      </div>
    </button>
  )
}

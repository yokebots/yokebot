import type { ReactNode } from 'react'

interface PanelHeaderProps {
  icon: string
  title: string
  badge?: number
  actions?: ReactNode
}

export function PanelHeader({ icon, title, badge, actions }: PanelHeaderProps) {
  return (
    <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2 shrink-0">
      <span className="material-symbols-outlined text-[18px] text-text-muted">{icon}</span>
      <span className="text-sm font-semibold text-text-main truncate">{title}</span>
      {badge != null && badge > 0 && (
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-forest-green px-1 text-[10px] font-bold text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      <div className="ml-auto flex items-center gap-1">{actions}</div>
    </div>
  )
}

import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router'

const features = [
  { icon: 'smart_toy', title: 'AI Agents', route: '/features/agents', desc: 'Deploy digital workers that execute tasks autonomously.' },
  { icon: 'task_alt', title: 'Task Management', route: '/features/tasks', desc: 'Timelines, approvals, and priority management.' },
  { icon: 'forum', title: 'Team Chat', route: '/features/team-chat', desc: 'Human-AI collaboration with persistent context.' },
  { icon: 'flag', title: 'Goals & KPIs', route: '/features/goals', desc: 'Set targets and let agents plan the path.' },
  { icon: 'folder_open', title: 'Workspace', route: '/features/workspace', desc: 'Data tables, documents, and knowledge — connected.' },
  { icon: 'groups', title: 'Meetings', route: '/features/meetings', desc: 'Real-time voice collaboration with your AI team.' },
]

export function FeaturesMegaMenu() {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const navigate = useNavigate()

  const handleEnter = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpen(true)
  }, [])

  const handleLeave = useCallback(() => {
    closeTimer.current = setTimeout(() => setOpen(false), 150)
  }, [])

  return (
    <div className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      {/* Trigger */}
      <button className="flex items-center gap-1 text-base font-medium text-text-muted hover:text-forest-green transition-colors">
        Features
        <span className={`material-symbols-outlined text-[18px] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>expand_more</span>
      </button>

      {/* Panel */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 top-full pt-4 z-50 transition-all duration-200 ${open ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-2 pointer-events-none'}`}
      >
        <div className="w-[760px] rounded-2xl border border-border-subtle bg-white shadow-xl overflow-hidden">
          {/* Feature grid */}
          <div className="grid grid-cols-3 gap-2 p-5">
            {features.map((f) => (
              <button
                key={f.route}
                onClick={() => { setOpen(false); navigate(f.route) }}
                className="flex items-start gap-4 rounded-xl p-5 text-left hover:bg-light-surface-alt transition-colors group"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-forest-green/10 text-forest-green group-hover:bg-forest-green group-hover:text-white transition-colors">
                  <span className="material-symbols-outlined text-[22px]">{f.icon}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-text-main group-hover:text-forest-green transition-colors">{f.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-text-muted">{f.desc}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Bottom bar */}
          <div className="border-t border-border-subtle bg-light-surface-alt px-6 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-text-main">Everything you need to run an AI workforce</p>
              <p className="text-xs text-text-muted">40 agent templates across every business function</p>
            </div>
            <button
              onClick={() => { setOpen(false); navigate('/features') }}
              className="flex items-center gap-1 text-sm font-bold text-forest-green hover:underline"
            >
              See All Features
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

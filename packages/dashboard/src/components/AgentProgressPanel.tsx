import { useState, useRef, useEffect } from 'react'
import type { AgentProgressEvent } from '@/hooks/useAgentProgress'

interface AgentProgressPanelProps {
  steps: AgentProgressEvent[]
  /** If true, panel starts expanded (used on AgentDetailPage) */
  defaultExpanded?: boolean
  /** Compact inline mode — just shows current action, no expand */
  inline?: boolean
}

function StepIcon({ type }: { type: AgentProgressEvent['type'] }) {
  if (type === 'thinking' || type === 'tool_start' || type === 'responding') {
    return (
      <span className="relative flex h-4 w-4 items-center justify-center">
        <span className="absolute h-3 w-3 rounded-full bg-accent-green/30" style={{ animation: 'pulse 2s ease-in-out infinite' }} />
        <span className="relative h-2 w-2 rounded-full bg-accent-green" />
      </span>
    )
  }
  // tool_result = completed
  return (
    <span className="flex h-4 w-4 items-center justify-center">
      <span className="material-symbols-outlined text-[14px] text-accent-green">check_circle</span>
    </span>
  )
}

export function AgentProgressPanel({ steps, defaultExpanded = false, inline = false }: AgentProgressPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const scrollRef = useRef<HTMLDivElement>(null)
  const latest = steps.length > 0 ? steps[steps.length - 1] : null

  // Auto-scroll to bottom when new steps arrive
  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [steps.length, expanded])

  if (!latest) return null

  // Inline mode: just the one-liner
  if (inline) {
    return (
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <span className="relative flex h-3 w-3 items-center justify-center shrink-0">
          <span className="absolute h-2.5 w-2.5 rounded-full bg-accent-green/30" style={{ animation: 'pulse 2s ease-in-out infinite' }} />
          <span className="relative h-1.5 w-1.5 rounded-full bg-accent-green" />
        </span>
        <span className="truncate">{latest.label}</span>
        <span className="shrink-0 font-mono text-[10px] text-text-muted/60">
          {latest.iteration}/{latest.maxIterations}
        </span>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border-subtle bg-gray-50/50 transition-all duration-300">
      {/* Collapsed bar — click to expand */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs hover:bg-gray-100/50 transition-colors"
      >
        <span className="relative flex h-3.5 w-3.5 items-center justify-center shrink-0">
          <span className="absolute h-3 w-3 rounded-full bg-accent-green/30" style={{ animation: 'pulse 2s ease-in-out infinite' }} />
          <span className="relative h-2 w-2 rounded-full bg-accent-green" />
        </span>
        <span className="flex-1 truncate font-medium text-text-main">{latest.label}</span>
        <span className="shrink-0 font-mono text-[10px] text-text-muted">
          Step {latest.iteration} of {latest.maxIterations}
        </span>
        <span className={`material-symbols-outlined text-[14px] text-text-muted transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>

      {/* Expanded reasoning trace */}
      {expanded && (
        <div
          ref={scrollRef}
          className="max-h-64 overflow-y-auto border-t border-border-subtle px-3 py-2 space-y-1.5"
        >
          {steps.map((step, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <div className="mt-0.5 shrink-0">
                <StepIcon type={step.type} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className={`text-xs font-medium ${step.type === 'tool_result' ? 'text-text-muted' : 'text-text-main'}`}>
                    {step.label}
                  </span>
                  <span className="text-[10px] font-mono text-text-muted/50 shrink-0">
                    {step.iteration}/{step.maxIterations}
                  </span>
                </div>
                {step.detail && (
                  <p className="mt-0.5 text-[11px] font-mono leading-relaxed text-text-muted/70 line-clamp-3 whitespace-pre-wrap">
                    {step.detail}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Compact row for the Dashboard active agents ticker */
export function AgentProgressRow({
  agentName,
  steps,
  onExpand,
}: {
  agentName: string
  steps: AgentProgressEvent[]
  onExpand?: () => void
}) {
  const latest = steps[steps.length - 1]
  if (!latest) return null

  return (
    <button
      onClick={onExpand}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs hover:bg-gray-50 transition-colors"
    >
      <span className="relative flex h-3 w-3 items-center justify-center shrink-0">
        <span className="absolute h-2.5 w-2.5 rounded-full bg-accent-green/30" style={{ animation: 'pulse 2s ease-in-out infinite' }} />
        <span className="relative h-1.5 w-1.5 rounded-full bg-accent-green" />
      </span>
      <span className="font-medium text-text-main shrink-0">{agentName}</span>
      <span className="flex-1 truncate text-text-muted">{latest.label}</span>
      <span className="shrink-0 font-mono text-[10px] text-text-muted/60">
        Step {latest.iteration}/{latest.maxIterations}
      </span>
    </button>
  )
}

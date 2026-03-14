import { useState, useRef, useEffect } from 'react'
import type { AgentProgressEvent } from '@/hooks/useAgentProgress'

interface AgentProgressPanelProps {
  steps: AgentProgressEvent[]
  /** If true, panel starts expanded (used on AgentDetailPage) */
  defaultExpanded?: boolean
  /** Compact inline mode — just shows current action, no expand */
  inline?: boolean
}

const stepColors: Record<AgentProgressEvent['type'], string> = {
  thinking: 'text-blue-500',
  tool_start: 'text-amber-500',
  tool_result: 'text-accent-green',
  responding: 'text-purple-500',
  idle: 'text-text-muted',
}

function StepRow({ step, isLatest }: { step: AgentProgressEvent; isLatest: boolean }) {
  const [showMore, setShowMore] = useState(false)
  const hasDetail = !!step.detail?.trim()
  const isThinking = step.type === 'thinking'
  const isToolStart = step.type === 'tool_start'
  const isToolResult = step.type === 'tool_result'
  const isResponding = step.type === 'responding'

  return (
    <div className="py-0.5">
      <div className="flex items-start gap-2">
        {/* Icon only on latest active step */}
        <div className="mt-0.5 shrink-0 flex items-center justify-center w-4 h-4">
          {isLatest && (step.type === 'thinking' || step.type === 'tool_start') ? (
            <span className="relative flex h-4 w-4 items-center justify-center">
              <span className="absolute h-3 w-3 rounded-full bg-accent-green/30" style={{ animation: 'pulse 2s ease-in-out infinite' }} />
              <span className="relative h-2 w-2 rounded-full bg-accent-green" />
            </span>
          ) : (
            <span className="w-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            {isToolStart && <span className="text-[11px]">🔧</span>}
            {isToolResult && <span className="text-[11px] text-accent-green">✓</span>}
            {isResponding && <span className="text-[11px]">💬</span>}
            <span className={`text-xs ${isLatest && step.type !== 'tool_result' ? 'font-medium text-text-main' : 'text-text-muted'} ${isThinking ? stepColors.thinking : ''}`}>
              {step.label}
            </span>
          </div>
          {/* Thinking detail shown inline */}
          {hasDetail && isThinking && (
            <div className="mt-0.5">
              <p className={`text-[11px] leading-relaxed text-text-muted/70 ${showMore ? '' : 'line-clamp-4'}`}>
                {step.detail}
              </p>
              {step.detail!.length > 300 && (
                <button
                  onClick={() => setShowMore(!showMore)}
                  className="text-[10px] text-blue-500 hover:text-blue-600 mt-0.5"
                >
                  {showMore ? 'show less' : 'show more'}
                </button>
              )}
            </div>
          )}
          {/* Tool detail shown as compact subtitle */}
          {hasDetail && !isThinking && (
            <p className="mt-0.5 text-[11px] leading-relaxed text-text-muted/60 truncate">
              {step.detail!.split('\n')[0].slice(0, 120)}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/** Deduplicate steps: remove empty 'Reasoning...' placeholders when followed by actual reasoning */
function deduplicateSteps(steps: AgentProgressEvent[]): AgentProgressEvent[] {
  const meaningful = steps.filter(s => s.type !== 'idle')
  const result: AgentProgressEvent[] = []
  for (let i = 0; i < meaningful.length; i++) {
    const step = meaningful[i]
    const next = meaningful[i + 1]
    // Skip 'Reasoning...' placeholder if the next event is thinking with actual content
    if (
      step.type === 'thinking' &&
      (!step.detail || step.detail.trim() === '') &&
      next?.type === 'thinking' &&
      next.detail?.trim()
    ) {
      continue
    }
    result.push(step)
  }
  return result
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
        {latest.detail && <span className="truncate text-text-muted/60">— {latest.detail.split('\n')[0].slice(0, 60)}</span>}
      </div>
    )
  }

  const meaningfulSteps = deduplicateSteps(steps)
  const toolCalls = steps.filter(s => s.type === 'tool_start').length

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
        <span className="flex-1 truncate font-medium text-text-main">
          {latest.label}
          {latest.detail && <span className="font-normal text-text-muted ml-1.5">— {latest.detail.split('\n')[0].slice(0, 80)}</span>}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-text-muted">
          Step {latest.iteration}/{latest.maxIterations} · {toolCalls} tool{toolCalls !== 1 ? 's' : ''}
        </span>
        <span className={`material-symbols-outlined text-[14px] text-text-muted transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>

      {/* Expanded reasoning trace — clean single-thread view */}
      {expanded && (
        <div
          ref={scrollRef}
          className="max-h-96 overflow-y-auto border-t border-border-subtle px-3 py-2 space-y-0"
        >
          {meaningfulSteps.map((step, idx) => (
            <StepRow key={idx} step={step} isLatest={idx === meaningfulSteps.length - 1} />
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
      {latest.detail && <span className="flex-1 truncate text-text-muted/60">— {latest.detail.split('\n')[0].slice(0, 60)}</span>}
      <span className="shrink-0 font-mono text-[10px] text-text-muted/60">
        Step {latest.iteration}/{latest.maxIterations}
      </span>
    </button>
  )
}

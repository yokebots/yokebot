import { useState, useCallback, useRef, useEffect } from 'react'
import { useRealtimeEvent } from '@/lib/use-realtime'

export interface AgentProgressEvent {
  agentId: string
  agentName: string
  type: 'thinking' | 'tool_start' | 'tool_result' | 'responding' | 'idle'
  label: string
  detail?: string
  taskId?: string
  iteration: number
  maxIterations: number
  timestamp: number
}

/**
 * Subscribes to agent_progress SSE events and accumulates steps per agent.
 * Returns a map of agentId → array of progress events for the current heartbeat.
 * Auto-clears when idle event received or after 60s timeout.
 */
export function useAgentProgress() {
  const [progressMap, setProgressMap] = useState<Map<string, AgentProgressEvent[]>>(new Map())
  const timeoutRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Clean up timeouts on unmount
  useEffect(() => {
    return () => {
      for (const t of timeoutRefs.current.values()) clearTimeout(t)
    }
  }, [])

  useRealtimeEvent<AgentProgressEvent>('agent_progress', useCallback((event: AgentProgressEvent) => {
    setProgressMap(prev => {
      const next = new Map(prev)

      if (event.type === 'idle') {
        next.delete(event.agentId)
      } else {
        const steps = next.get(event.agentId) ?? []
        next.set(event.agentId, [...steps, event])
      }

      return next
    })

    // Reset/clear stale timeout
    const existing = timeoutRefs.current.get(event.agentId)
    if (existing) clearTimeout(existing)

    if (event.type !== 'idle') {
      // Auto-clear after 60s in case idle event is missed
      timeoutRefs.current.set(event.agentId, setTimeout(() => {
        setProgressMap(prev => {
          const next = new Map(prev)
          next.delete(event.agentId)
          return next
        })
        timeoutRefs.current.delete(event.agentId)
      }, 60_000))
    } else {
      timeoutRefs.current.delete(event.agentId)
    }
  }, []))

  /** Get latest action label for a given agent (for collapsed/inline display) */
  const currentAction = useCallback((agentId: string): AgentProgressEvent | undefined => {
    const steps = progressMap.get(agentId)
    if (!steps || steps.length === 0) return undefined
    return steps[steps.length - 1]
  }, [progressMap])

  return { progressMap, currentAction }
}

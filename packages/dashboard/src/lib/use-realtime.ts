/**
 * use-realtime.ts — React hooks for SSE real-time updates
 *
 * Connects to the engine's /api/events SSE endpoint and provides
 * hooks for components to subscribe to specific event types.
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { connectEventStream, subscribeSse, onSseConnectionChange, isSseConnected, type SseEventType } from './engine'

/**
 * Connect the global SSE stream on mount, disconnect on unmount.
 * Should be called once in a top-level component (e.g. App or Layout).
 */
export function useRealtimeConnection() {
  const [connected, setConnected] = useState(isSseConnected())

  useEffect(() => {
    const cleanup = connectEventStream()
    const unsub = onSseConnectionChange(setConnected)
    return () => {
      unsub()
      cleanup()
    }
  }, [])

  return connected
}

/**
 * Subscribe to a specific SSE event type. Calls `callback` whenever
 * the server pushes that event. The callback is stable (uses ref).
 */
export function useRealtimeEvent<T = unknown>(event: SseEventType, callback: (data: T) => void) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    return subscribeSse(event, (data) => {
      callbackRef.current(data as T)
    })
  }, [event])
}

/**
 * Subscribe to an SSE event and maintain state from it.
 * Returns the latest value pushed by the server.
 */
export function useRealtimeValue<T>(event: SseEventType, initialValue: T): T {
  const [value, setValue] = useState<T>(initialValue)

  useRealtimeEvent<T>(event, useCallback((data: T) => {
    setValue(data)
  }, []))

  return value
}

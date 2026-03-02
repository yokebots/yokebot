/**
 * ConnectionStatus.tsx — Shows a reconnecting banner when SSE drops
 */

import { useState, useEffect } from 'react'

export function ConnectionStatus({ connected }: { connected: boolean }) {
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    if (connected) {
      setShowBanner(false)
      return
    }

    // Don't show immediately — wait 3 seconds to avoid flashing on page load
    const timer = setTimeout(() => setShowBanner(true), 3000)
    return () => clearTimeout(timer)
  }, [connected])

  if (!showBanner) return null

  return (
    <div className="flex items-center justify-center gap-2 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-600">
      <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
      Reconnecting to server...
    </div>
  )
}

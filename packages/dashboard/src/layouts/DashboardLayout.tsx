import { useEffect, useRef, useState, useCallback } from 'react'
import { Outlet } from 'react-router'
import { Sidebar } from '@/components/Sidebar'
import { TopBar } from '@/components/TopBar'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { ProductTour, resetProductTour } from '@/components/ProductTour'
import { SidebarProvider } from '@/lib/sidebar-context'
import { useRealtimeConnection } from '@/lib/use-realtime'
import { useTeam } from '@/lib/team-context'
import { updateTeamProfile } from '@/lib/engine'

export function DashboardLayout() {
  const sseConnected = useRealtimeConnection()
  const { activeTeam } = useTeam()
  const tzSyncedRef = useRef<string | null>(null)
  const [tourForceStart, setTourForceStart] = useState(false)

  const handleRestartTour = useCallback(() => {
    resetProductTour()
    setTourForceStart(true)
  }, [])

  // Auto-detect browser timezone and save to team profile (once per team)
  useEffect(() => {
    if (!activeTeam || tzSyncedRef.current === activeTeam.id) return
    tzSyncedRef.current = activeTeam.id
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz) {
      updateTeamProfile(activeTeam.id, { timezone: tz } as Parameters<typeof updateTeamProfile>[1]).catch(() => {})
    }
  }, [activeTeam])

  return (
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden bg-light-bg">
        <Sidebar />
        <main className="flex flex-1 flex-col overflow-hidden">
          <ConnectionStatus connected={sseConnected} />
          <TopBar onRestartTour={handleRestartTour} />
          <div className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-hide">
            <Outlet />
          </div>
        </main>
        <ProductTour
          forceStart={tourForceStart}
          onComplete={() => setTourForceStart(false)}
        />
      </div>
    </SidebarProvider>
  )
}

import { useEffect, useRef, useState, useCallback, lazy, Suspense } from 'react'
import { Outlet, useLocation } from 'react-router'
import { Sidebar } from '@/components/Sidebar'
import { TopBar } from '@/components/TopBar'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { ProductTour, resetProductTour } from '@/components/ProductTour'
import { SidebarProvider } from '@/lib/sidebar-context'
import { useRealtimeConnection } from '@/lib/use-realtime'
import { useTeam } from '@/lib/team-context'
import { updateTeamProfile } from '@/lib/engine'

// Lazy-load persistent pages so they mount once and stay alive
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then(m => ({ default: m.DashboardPage })))
const WorkspacePage = lazy(() => import('@/pages/WorkspacePage').then(m => ({ default: m.WorkspacePage })))
const AgentsPage = lazy(() => import('@/pages/AgentsPage').then(m => ({ default: m.AgentsPage })))
const MissionControlPage = lazy(() => import('@/pages/MissionControlPage').then(m => ({ default: m.MissionControlPage })))

// Routes that stay mounted (keep-alive) — preserves WebSocket, SSE, and component state
const PERSISTENT_ROUTES: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/workspace': 'workspace',
  '/agents': 'agents',
  '/tasks': 'tasks',
}

export function DashboardLayout() {
  const sseConnected = useRealtimeConnection()
  const { activeTeam } = useTeam()
  const location = useLocation()
  const tzSyncedRef = useRef<string | null>(null)
  const [tourForceStart, setTourForceStart] = useState(false)
  // Track which persistent pages have been visited (mount on first visit, keep alive after)
  const [visited, setVisited] = useState<Set<string>>(new Set())

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

  // Mark persistent pages as visited when navigated to
  const currentPath = location.pathname
  const persistentKey = PERSISTENT_ROUTES[currentPath]
  const isPersistentRoute = !!persistentKey
  useEffect(() => {
    if (persistentKey && !visited.has(persistentKey)) {
      setVisited(prev => new Set(prev).add(persistentKey))
    }
  }, [persistentKey, visited])

  return (
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden bg-light-bg">
        <Sidebar />
        <main className="flex flex-1 flex-col overflow-hidden">
          <ConnectionStatus connected={sseConnected} />
          <TopBar onRestartTour={handleRestartTour} />
          <div className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-hide">
            {/* Persistent pages — mounted once, shown/hidden via CSS */}
            <Suspense fallback={null}>
              {visited.has('dashboard') && (
                <div style={{ display: currentPath === '/dashboard' ? 'block' : 'none' }}>
                  <DashboardPage />
                </div>
              )}
              {visited.has('workspace') && (
                <div style={{ display: currentPath === '/workspace' ? 'block' : 'none' }}>
                  <WorkspacePage />
                </div>
              )}
              {visited.has('agents') && (
                <div style={{ display: currentPath === '/agents' ? 'block' : 'none' }}>
                  <AgentsPage />
                </div>
              )}
              {visited.has('tasks') && (
                <div style={{ display: currentPath === '/tasks' ? 'block' : 'none' }}>
                  <MissionControlPage />
                </div>
              )}
            </Suspense>
            {/* Non-persistent routes — normal mount/unmount via Outlet */}
            {!isPersistentRoute && <Outlet />}
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

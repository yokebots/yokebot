import { Outlet } from 'react-router'
import { Sidebar } from '@/components/Sidebar'
import { TopBar } from '@/components/TopBar'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { SidebarProvider } from '@/lib/sidebar-context'
import { useRealtimeConnection } from '@/lib/use-realtime'

export function DashboardLayout() {
  const sseConnected = useRealtimeConnection()

  return (
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden bg-light-bg">
        <Sidebar />
        <main className="flex flex-1 flex-col overflow-hidden">
          <ConnectionStatus connected={sseConnected} />
          <TopBar />
          <div className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-hide">
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarProvider>
  )
}

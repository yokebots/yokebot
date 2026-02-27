import { Outlet } from 'react-router'
import { Sidebar } from '@/components/Sidebar'
import { TopBar } from '@/components/TopBar'
import { SidebarProvider } from '@/lib/sidebar-context'

export function DashboardLayout() {
  return (
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden bg-light-bg">
        <Sidebar />
        <main className="flex flex-1 flex-col overflow-hidden">
          <TopBar />
          <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarProvider>
  )
}

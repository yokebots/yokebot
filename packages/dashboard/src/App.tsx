import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { AuthProvider, useAuth } from '@/lib/auth'
import { TeamProvider } from '@/lib/team-context'
import { DashboardLayout } from '@/layouts/DashboardLayout'
import { HomePage } from '@/pages/HomePage'
import { DashboardPage } from '@/pages/DashboardPage'
import { MissionControlPage } from '@/pages/MissionControlPage'
import { TaskDetailPage } from '@/pages/TaskDetailPage'
import { ChatPage } from '@/pages/ChatPage'
import { AgentsPage } from '@/pages/AgentsPage'
import { AgentDetailPage } from '@/pages/AgentDetailPage'
import { ApprovalsPage } from '@/pages/ApprovalsPage'
import { DataTablesPage } from '@/pages/DataTablesPage'
import { KnowledgeBasePage } from '@/pages/KnowledgeBasePage'
import { SkillsPage } from '@/pages/SkillsPage'
import { TemplatesPage } from '@/pages/TemplatesPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { BillingPage } from '@/pages/BillingPage'
import { TeamPage } from '@/pages/TeamPage'
import { ActivityPage } from '@/pages/ActivityPage'
import { ProjectsPage } from '@/pages/ProjectsPage'
import { GoalsPage } from '@/pages/GoalsPage'
import { AuthCallbackPage } from '@/pages/AuthCallbackPage'
import { LoginPage } from '@/pages/LoginPage'
import { ToastProvider } from '@/components/ToastNotifications'
import type { ReactNode } from 'react'

const LoadingScreen = () => (
  <div className="flex h-screen items-center justify-center bg-light-bg">
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-forest-green text-white shadow-md">
        <span className="text-2xl">🐂</span>
      </div>
      <span className="font-display text-xl font-bold tracking-tight text-text-main">Loading...</span>
    </div>
  </div>
)

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/" replace />
  return <TeamProvider>{children}</TeamProvider>
}

function RootRoute() {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (user) return <Navigate to="/dashboard" replace />
  return <HomePage />
}

function AppRoutes() {
  return (
    <Routes>
      <Route index element={<RootRoute />} />
      <Route path="login" element={<LoginPage />} />
      <Route path="auth/callback" element={<AuthCallbackPage />} />

      <Route
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="tasks" element={<MissionControlPage />} />
        <Route path="tasks/:taskId" element={<TaskDetailPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="goals" element={<GoalsPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="chat/:channelId" element={<ChatPage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="agents/:agentId" element={<AgentDetailPage />} />
        <Route path="approvals" element={<ApprovalsPage />} />
        <Route path="data-tables" element={<DataTablesPage />} />
        <Route path="knowledge-base" element={<KnowledgeBasePage />} />
        <Route path="skills" element={<SkillsPage />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/billing" element={<BillingPage />} />
        <Route path="team" element={<TeamPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App

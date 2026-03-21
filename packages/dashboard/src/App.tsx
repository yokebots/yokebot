import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { AuthProvider, useAuth } from '@/lib/auth'
import { TeamProvider, useTeam } from '@/lib/team-context'
import { DashboardLayout } from '@/layouts/DashboardLayout'
import { HomePage } from '@/pages/HomePage'
import { DashboardPage } from '@/pages/DashboardPage'
import { MissionControlPage } from '@/pages/MissionControlPage'
import { TaskDetailPage } from '@/pages/TaskDetailPage'
import { AgentsPage } from '@/pages/AgentsPage'
import { AgentDetailPage } from '@/pages/AgentDetailPage'
import { ApprovalsPage } from '@/pages/ApprovalsPage'
import { DataTablesPage } from '@/pages/DataTablesPage'
import { FilesPage } from '@/pages/FilesPage'
import { SkillsPage } from '@/pages/SkillsPage'
import { TemplatesPage } from '@/pages/TemplatesPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { IntegrationsPage } from '@/pages/IntegrationsPage'
import { BillingPage } from '@/pages/BillingPage'
import { UsagePage } from '@/pages/UsagePage'
import { TeamPage } from '@/pages/TeamPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { ActivityPage } from '@/pages/ActivityPage'
import { MeetingsPage } from '@/pages/MeetingsPage'
import { MeetingReplayPage } from '@/pages/MeetingReplayPage'
import { ProjectsPage } from '@/pages/ProjectsPage'
import { GoalsPage } from '@/pages/GoalsPage'
import { WorkflowsPage } from '@/pages/WorkflowsPage'
import { WorkflowBuilderPage } from '@/pages/WorkflowBuilderPage'
import { WorkflowRunPage } from '@/pages/WorkflowRunPage'
import { WorkspacePage } from '@/pages/WorkspacePage'
import { SessionVaultPage } from '@/pages/SessionVaultPage'
import { BrowserPopoutPage } from '@/pages/BrowserPopoutPage'
import { BrandKitPage } from '@/pages/BrandKitPage'
import { AuthCallbackPage } from '@/pages/AuthCallbackPage'
import { LoginPage } from '@/pages/LoginPage'
import { OnboardingPage } from '@/pages/OnboardingPage'
import { DocsLayout } from '@/layouts/DocsLayout'
import { DocsPage } from '@/pages/docs/DocsPage'
import { TermsPage } from '@/pages/TermsPage'
import { PrivacyPage } from '@/pages/PrivacyPage'
import { PricingPage } from '@/pages/PricingPage'
import { ContactPage } from '@/pages/ContactPage'
import { FeaturesIndexPage } from '@/pages/features/FeaturesIndexPage'
import { AgentsFeaturePage } from '@/pages/features/AgentsFeaturePage'
import { TasksFeaturePage } from '@/pages/features/TasksFeaturePage'
import { TeamChatFeaturePage } from '@/pages/features/TeamChatFeaturePage'
import { GoalsFeaturePage } from '@/pages/features/GoalsFeaturePage'
import { WorkspaceFeaturePage } from '@/pages/features/WorkspaceFeaturePage'
import { MeetingsFeaturePage } from '@/pages/features/MeetingsFeaturePage'
import { ToastProvider } from '@/components/ToastNotifications'
import { useState, useEffect, type ReactNode } from 'react'
import * as engine from '@/lib/engine'

function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-light-bg">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-forest-green shadow-md overflow-hidden">
          <img src="/logo-icon-white.png" alt="YokeBot" className="h-8 w-8 object-contain" />
        </div>
        <div className="h-1 w-32 overflow-hidden rounded-full bg-border-subtle">
          <div className="h-full w-1/2 rounded-full bg-forest-green" style={{ animation: 'loading-slide 1.2s ease-in-out infinite' }} />
        </div>
        <style>{`@keyframes loading-slide { 0% { transform: translateX(-100%) } 100% { transform: translateX(200%) } }`}</style>
      </div>
    </div>
  )
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/" replace />
  return <TeamProvider>{children}</TeamProvider>
}

function OnboardingGuard({ children }: { children: ReactNode }) {
  const { activeTeam, loading: teamLoading, isNewTeam } = useTeam()
  const [checking, setChecking] = useState(true)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)

  useEffect(() => {
    if (teamLoading) return

    // If no active team (e.g. API failed with 401), skip onboarding check
    if (!activeTeam) {
      setChecking(false)
      return
    }

    // Brand new team (just created) — skip the API call, go straight to onboarding
    if (isNewTeam) {
      setNeedsOnboarding(true)
      setChecking(false)
      return
    }

    engine.getTeamProfile(activeTeam.id)
      .then((profile) => {
        setNeedsOnboarding(!profile.onboardedAt)
        setChecking(false)
      })
      .catch(() => {
        // Fail open — don't block users if profile endpoint fails
        setChecking(false)
      })
  }, [activeTeam, teamLoading, isNewTeam])

  if (teamLoading || checking) return <LoadingScreen />
  if (needsOnboarding) return <Navigate to="/onboarding" replace />
  return <>{children}</>
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
      <Route path="onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
      <Route path="browser-popout" element={<ProtectedRoute><BrowserPopoutPage /></ProtectedRoute>} />
      <Route path="terms" element={<TermsPage />} />
      <Route path="privacy" element={<PrivacyPage />} />
      <Route path="pricing" element={<PricingPage />} />
      <Route path="contact" element={<ContactPage />} />
      <Route path="features" element={<FeaturesIndexPage />} />
      <Route path="features/agents" element={<AgentsFeaturePage />} />
      <Route path="features/tasks" element={<TasksFeaturePage />} />
      <Route path="features/team-chat" element={<TeamChatFeaturePage />} />
      <Route path="features/goals" element={<GoalsFeaturePage />} />
      <Route path="features/workspace" element={<WorkspaceFeaturePage />} />
      <Route path="features/meetings" element={<MeetingsFeaturePage />} />

      <Route path="docs" element={<DocsLayout />}>
        <Route index element={<DocsPage />} />
        <Route path=":slug" element={<DocsPage />} />
        <Route path=":section/:slug" element={<DocsPage />} />
      </Route>

      <Route
        element={
          <ProtectedRoute>
            <OnboardingGuard>
              <DashboardLayout />
            </OnboardingGuard>
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="workspace" element={<WorkspacePage />} />
        <Route path="tasks" element={<MissionControlPage />} />
        <Route path="tasks/:taskId" element={<TaskDetailPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="goals" element={<GoalsPage />} />
        <Route path="workflows" element={<WorkflowsPage />} />
        <Route path="workflows/new" element={<WorkflowBuilderPage />} />
        <Route path="workflows/:id" element={<WorkflowBuilderPage />} />
        <Route path="workflows/:id/runs/:runId" element={<WorkflowRunPage />} />
        <Route path="chat" element={<Navigate to="/workspace" replace />} />
        <Route path="chat/*" element={<Navigate to="/workspace" replace />} />
        <Route path="meetings" element={<MeetingsPage />} />
        <Route path="meetings/:meetingId" element={<MeetingReplayPage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="agents/:agentId" element={<AgentDetailPage />} />
        <Route path="approvals" element={<ApprovalsPage />} />
        <Route path="data-tables" element={<DataTablesPage />} />
        <Route path="files" element={<FilesPage />} />
        <Route path="knowledge-base" element={<Navigate to="/files" replace />} />
        <Route path="skills" element={<SkillsPage />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/notifications" element={<SettingsPage />} />
        <Route path="settings/api-keys" element={<SettingsPage />} />
        <Route path="settings/brand-kit" element={<BrandKitPage />} />
        <Route path="settings/vault" element={<SessionVaultPage />} />
        <Route path="settings/billing" element={<BillingPage />} />
        <Route path="settings/usage" element={<UsagePage />} />
        <Route path="settings/integrations" element={<IntegrationsPage />} />
        <Route path="settings/team" element={<TeamPage />} />
        <Route path="settings/user" element={<ProfilePage />} />
        <Route path="team" element={<Navigate to="/settings/team" replace />} />
        <Route path="profile" element={<Navigate to="/settings/user" replace />} />
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

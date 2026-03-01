import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { AuthProvider, useAuth } from '@/lib/auth'
import { TeamProvider, useTeam } from '@/lib/team-context'
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
import { IntegrationsPage } from '@/pages/IntegrationsPage'
import { BillingPage } from '@/pages/BillingPage'
import { TeamPage } from '@/pages/TeamPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { ActivityPage } from '@/pages/ActivityPage'
import { MeetingsPage } from '@/pages/MeetingsPage'
import { MeetingReplayPage } from '@/pages/MeetingReplayPage'
import { ProjectsPage } from '@/pages/ProjectsPage'
import { GoalsPage } from '@/pages/GoalsPage'
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

const LoadingScreen = () => (
  <div className="flex h-screen items-center justify-center bg-light-bg">
    <div className="flex flex-col items-center gap-5">
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-forest-green shadow-lg overflow-hidden">
        <img src="/logo-icon-white.png" alt="YokeBot" className="h-10 w-10 object-contain" />
        <div className="absolute -inset-1 animate-ping rounded-2xl bg-forest-green/20" />
      </div>
      <div className="flex flex-col items-center gap-2">
        <span className="font-display text-xl font-bold tracking-tight text-text-main">
          Getting everything ready...
        </span>
        <span className="text-base text-text-secondary">
          Hang tight while we spin up your workspace
        </span>
      </div>
      <div className="mt-1 flex gap-1.5">
        <div className="h-2 w-2 animate-bounce rounded-full bg-forest-green" style={{ animationDelay: '0ms' }} />
        <div className="h-2 w-2 animate-bounce rounded-full bg-forest-green" style={{ animationDelay: '150ms' }} />
        <div className="h-2 w-2 animate-bounce rounded-full bg-forest-green" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  </div>
)

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/" replace />
  return <TeamProvider>{children}</TeamProvider>
}

function OnboardingGuard({ children }: { children: ReactNode }) {
  const { activeTeam, loading: teamLoading } = useTeam()
  const [checking, setChecking] = useState(true)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)

  useEffect(() => {
    if (teamLoading) return

    // If no active team (e.g. API failed with 401), skip onboarding check
    if (!activeTeam) {
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
  }, [activeTeam, teamLoading])

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
        <Route path="tasks" element={<MissionControlPage />} />
        <Route path="tasks/:taskId" element={<TaskDetailPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="goals" element={<GoalsPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="chat/:channelId" element={<ChatPage />} />
        <Route path="meetings" element={<MeetingsPage />} />
        <Route path="meetings/:meetingId" element={<MeetingReplayPage />} />
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
        <Route path="settings/integrations" element={<IntegrationsPage />} />
        <Route path="team" element={<TeamPage />} />
        <Route path="profile" element={<ProfilePage />} />
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

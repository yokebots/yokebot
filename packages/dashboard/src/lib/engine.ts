/**
 * engine.ts — API client for the YokeBot Engine
 *
 * All dashboard ↔ engine communication goes through here.
 * In dev, calls localhost:3001. In prod, proxied via Vite/hosting config.
 */

import { supabase } from './supabase'

const ENGINE_URL = import.meta.env.VITE_ENGINE_URL ?? 'http://localhost:3001'

// Active team ID — set by TeamProvider, included in all requests
let _activeTeamId: string | null = null

export function setActiveTeamId(teamId: string | null) {
  _activeTeamId = teamId
}

export function getActiveTeamId(): string | null {
  return _activeTeamId
}

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  // Get the current Supabase session token for authenticated API calls
  const { data: { session } } = await supabase.auth.getSession()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }
  if (_activeTeamId) {
    headers['X-Team-Id'] = _activeTeamId
  }

  const res = await fetch(`${ENGINE_URL}${path}`, {
    ...opts,
    headers: { ...headers, ...(opts?.headers as Record<string, string>) },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    if (res.status === 401) {
      console.warn('[engine] 401 — token rejected by engine. Check SUPABASE_JWT_SECRET on Railway.')
    }
    throw new Error(err.error ?? `Engine error: ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// ===== Types (mirror engine types) =====

export interface EngineAgent {
  id: string
  name: string
  status: 'stopped' | 'running' | 'error'
  department: string | null
  iconName: string | null
  iconColor: string | null
  modelId: string
  modelEndpoint: string
  modelName: string
  systemPrompt: string | null
  proactive: boolean
  heartbeatSeconds: number
  activeHoursStart: number
  activeHoursEnd: number
  templateId: string | null
  createdAt: string
  updatedAt: string
}

export interface EngineTask {
  id: string
  title: string
  description: string | null
  status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'done'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  assignedAgentId: string | null
  parentTaskId: string | null
  deadline: string | null
  createdAt: string
  updatedAt: string
}

export interface EngineApproval {
  id: string
  agentId: string
  actionType: string
  actionDetail: string
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  resolvedAt: string | null
}

export interface ChatChannel {
  id: string
  name: string
  type: 'dm' | 'group' | 'task_thread'
  createdAt: string
}

export interface ChatAttachment {
  type: 'image' | 'video' | '3d'
  url: string
  thumbnailUrl?: string
  filename: string
  mimeType: string
  width?: number
  height?: number
}

export interface ChatMessage {
  id: number
  channelId: string
  senderType: 'human' | 'agent' | 'system'
  senderId: string
  content: string
  attachments: ChatAttachment[]
  taskId: string | null
  createdAt: string
}

export interface OllamaStatus {
  connected: boolean
  models: Array<{ name: string; size: number; modified_at: string }>
}

export interface LogicalModel {
  id: string
  name: string
  description: string
  type: 'chat' | 'image' | 'video' | '3d'
  category: 'frontier' | 'efficient' | 'reasoning' | 'image' | 'video' | '3d' | 'local'
  contextWindow?: number
  backends: Array<{ providerId: string; providerModelId: string; priority: number }>
}

// ===== Health =====

export const health = () => request<{ status: string; version: string }>('/health')

// ===== Agents =====

export const listAgents = () => request<EngineAgent[]>('/api/agents')

export const getAgent = (id: string) => request<EngineAgent>(`/api/agents/${id}`)

export const createAgent = (data: {
  name: string
  department?: string
  systemPrompt?: string
  modelId?: string
  modelEndpoint?: string
  modelName?: string
  proactive?: boolean
  heartbeatSeconds?: number
}) => request<EngineAgent>('/api/agents', { method: 'POST', body: JSON.stringify(data) })

export const updateAgent = (id: string, data: Record<string, unknown>) =>
  request<EngineAgent>(`/api/agents/${id}`, { method: 'PATCH', body: JSON.stringify(data) })

export const deleteAgent = (id: string) =>
  request<void>(`/api/agents/${id}`, { method: 'DELETE' })

export const startAgent = (id: string) =>
  request<EngineAgent>(`/api/agents/${id}/start`, { method: 'POST' })

export const stopAgent = (id: string) =>
  request<EngineAgent>(`/api/agents/${id}/stop`, { method: 'POST' })

export const chatWithAgent = (id: string, message: string) =>
  request<{ response: string; iterations: number; toolCalls: string[] }>(
    `/api/agents/${id}/chat`,
    { method: 'POST', body: JSON.stringify({ message }) },
  )

// ===== Tasks =====

export const listTasks = (filters?: { status?: string; agentId?: string; parentId?: string }) => {
  const params = new URLSearchParams()
  if (filters?.status) params.set('status', filters.status)
  if (filters?.agentId) params.set('agentId', filters.agentId)
  if (filters?.parentId !== undefined) params.set('parentId', filters.parentId)
  const qs = params.toString()
  return request<EngineTask[]>(`/api/tasks${qs ? `?${qs}` : ''}`)
}

export const createTask = (data: {
  title: string
  description?: string
  priority?: string
  assignedAgentId?: string
  parentTaskId?: string
  deadline?: string
}) => request<EngineTask>('/api/tasks', { method: 'POST', body: JSON.stringify(data) })

export const updateTask = (id: string, data: Record<string, unknown>) =>
  request<EngineTask>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) })

export const deleteTask = (id: string) =>
  request<void>(`/api/tasks/${id}`, { method: 'DELETE' })

// ===== Approvals =====

export const listApprovals = () => request<EngineApproval[]>('/api/approvals')

export const approvalCount = () => request<{ count: number }>('/api/approvals/count')

export const resolveApproval = (id: string, status: 'approved' | 'rejected') =>
  request<EngineApproval>(`/api/approvals/${id}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  })

// ===== Chat =====

export const listChannels = () => request<ChatChannel[]>('/api/chat/channels')

export const createGroupChannel = (name: string) =>
  request<ChatChannel>('/api/chat/channels', {
    method: 'POST',
    body: JSON.stringify({ name, type: 'group' }),
  })

export const deleteChannel = (channelId: string) =>
  request<void>(`/api/chat/channels/${channelId}`, { method: 'DELETE' })

export const getDmChannel = (agentId: string) =>
  request<ChatChannel>(`/api/chat/dm/${agentId}`)

export const getTaskThread = (taskId: string) =>
  request<ChatChannel>(`/api/chat/task/${taskId}`)

export const getMessages = (channelId: string, limit = 50) =>
  request<ChatMessage[]>(`/api/chat/channels/${channelId}/messages?limit=${limit}`)

export const sendMessage = (channelId: string, data: {
  senderType: 'human' | 'agent' | 'system'
  senderId: string
  content: string
  taskId?: string
}) => request<ChatMessage>(`/api/chat/channels/${channelId}/messages`, {
  method: 'POST',
  body: JSON.stringify(data),
})

// ===== Workspace =====

export const listFiles = (dir = '') =>
  request<Array<{ path: string; name: string; isDirectory: boolean; size: number; modifiedAt: string }>>(
    `/api/workspace/files?dir=${encodeURIComponent(dir)}`,
  )

export const readFile = (path: string) =>
  request<{ path: string; content: string }>(`/api/workspace/file?path=${encodeURIComponent(path)}`)

export const writeFile = (path: string, content: string, agentId: string) =>
  request<{ success: boolean }>('/api/workspace/file', {
    method: 'PUT',
    body: JSON.stringify({ path, content, agentId }),
  })

// ===== Source of Record =====

export interface SorTable {
  id: string
  name: string
  createdAt: string
  rowCount: number
  columns: Array<{ id: string; name: string; colType: string; position: number }>
}

export interface SorRow {
  id: string
  tableId: string
  data: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface SorPermission {
  agentId: string
  tableId: string
  canRead: boolean
  canWrite: boolean
}

export const listSorTables = () => request<SorTable[]>('/api/sor/tables')

export const createSorTable = (name: string, columns?: Array<{ name: string; colType?: string }>) =>
  request<SorTable>('/api/sor/tables', { method: 'POST', body: JSON.stringify({ name, columns }) })

export const listSorRows = (tableId: string) => request<SorRow[]>(`/api/sor/tables/${tableId}/rows`)

export const addSorRow = (tableId: string, data: Record<string, unknown>) =>
  request<SorRow>(`/api/sor/tables/${tableId}/rows`, { method: 'POST', body: JSON.stringify(data) })

export const updateSorRow = (tableId: string, rowId: string, data: Record<string, unknown>) =>
  request<SorRow>(`/api/sor/tables/${tableId}/rows/${rowId}`, { method: 'PATCH', body: JSON.stringify(data) })

export const deleteSorRow = (tableId: string, rowId: string) =>
  request<void>(`/api/sor/tables/${tableId}/rows/${rowId}`, { method: 'DELETE' })

export const getSorPermissions = (tableId: string) => request<SorPermission[]>(`/api/sor/tables/${tableId}/permissions`)

export const setSorPermission = (tableId: string, agentId: string, canRead: boolean, canWrite: boolean) =>
  request<SorPermission[]>(`/api/sor/tables/${tableId}/permissions`, {
    method: 'PATCH', body: JSON.stringify({ agentId, canRead, canWrite }),
  })

// ===== Model Providers =====

export interface AvailableProvider {
  providerId: string
  providerName: string
  enabled: boolean
  models: Array<{ id: string; name: string; contextWindow?: number }>
}

export interface ProviderConfig {
  id: string
  name: string
  endpoint: string
  requiresKey: boolean
  enabled: boolean
  hasKey: boolean
}

export const getAvailableModels = () => request<LogicalModel[]>('/api/models')

export const listProviders = () => request<ProviderConfig[]>('/api/models/providers')

export const updateProvider = (id: string, data: { apiKey?: string; enabled?: boolean }) =>
  request<{ id: string; enabled: boolean; hasKey: boolean }>(`/api/models/providers/${id}`, {
    method: 'PATCH', body: JSON.stringify(data),
  })

// ===== Skills =====

export const listSkills = () =>
  request<Array<{ metadata: { name: string; description: string; tags: string[]; source: string }; filePath: string }>>(
    '/api/skills',
  )

// ===== Agent Skills =====

export interface AgentSkill {
  skillName: string
  source: string
  installedAt: string
}

export const getAgentSkills = (agentId: string) =>
  request<AgentSkill[]>(`/api/agents/${agentId}/skills`)

export const installAgentSkill = (agentId: string, skillName: string) =>
  request<{ agentId: string; skillName: string; installed: boolean }>(
    `/api/agents/${agentId}/skills`,
    { method: 'POST', body: JSON.stringify({ skillName }) },
  )

export const removeAgentSkill = (agentId: string, skillName: string) =>
  request<void>(`/api/agents/${agentId}/skills/${skillName}`, { method: 'DELETE' })

// ===== Activity Log =====

export interface ActivityLogEntry {
  id: number
  eventType: string
  agentId: string | null
  description: string
  details: string | null
  createdAt: string
}

export const listActivityLog = (filters?: { agentId?: string; eventType?: string; limit?: number; before?: number }) => {
  const params = new URLSearchParams()
  if (filters?.agentId) params.set('agentId', filters.agentId)
  if (filters?.eventType) params.set('eventType', filters.eventType)
  if (filters?.limit) params.set('limit', String(filters.limit))
  if (filters?.before) params.set('before', String(filters.before))
  const qs = params.toString()
  return request<ActivityLogEntry[]>(`/api/activity${qs ? `?${qs}` : ''}`)
}

export const activityCount = (agentId?: string) => {
  const qs = agentId ? `?agentId=${agentId}` : ''
  return request<{ count: number }>(`/api/activity/count${qs}`)
}

// ===== Teams =====

export interface Team {
  id: string
  name: string
  createdAt: string
  role?: string
}

export interface TeamMember {
  teamId: string
  userId: string
  email: string
  role: string
  joinedAt: string
}

export const listTeams = () => request<Team[]>('/api/teams')

export const createTeam = (name: string) =>
  request<Team>('/api/teams', { method: 'POST', body: JSON.stringify({ name }) })

export const deleteTeam = (id: string) =>
  request<void>(`/api/teams/${id}`, { method: 'DELETE' })

export const getTeamMembers = (teamId: string) =>
  request<TeamMember[]>(`/api/teams/${teamId}/members`)

export const addTeamMember = (teamId: string, userId: string, email: string, role = 'member') =>
  request<TeamMember>(`/api/teams/${teamId}/members`, {
    method: 'POST', body: JSON.stringify({ userId, email, role }),
  })

export const updateTeamMemberRole = (teamId: string, userId: string, role: string) =>
  request<TeamMember>(`/api/teams/${teamId}/members/${userId}`, {
    method: 'PATCH', body: JSON.stringify({ role }),
  })

export const removeTeamMember = (teamId: string, userId: string) =>
  request<void>(`/api/teams/${teamId}/members/${userId}`, { method: 'DELETE' })

// ===== Notifications =====

export interface EngineNotification {
  id: string
  teamId: string
  userId: string
  type: 'approval_needed' | 'task_assigned' | 'agent_message' | 'mention' | 'system'
  title: string
  body: string
  link: string | null
  read: boolean
  createdAt: string
}

export interface NotificationPreference {
  userId: string
  teamId: string
  inAppEnabled: boolean
  emailEnabled: boolean
  muted: boolean
}

export const listNotifications = (opts?: { teamId?: string; limit?: number; before?: string }) => {
  const params = new URLSearchParams()
  if (opts?.teamId) params.set('teamId', opts.teamId)
  if (opts?.limit) params.set('limit', String(opts.limit))
  if (opts?.before) params.set('before', opts.before)
  const qs = params.toString()
  return request<EngineNotification[]>(`/api/notifications${qs ? `?${qs}` : ''}`)
}

export const notificationCount = () => request<{ count: number }>('/api/notifications/count')

export const markNotificationRead = (id: string) =>
  request<{ success: boolean }>(`/api/notifications/${id}/read`, { method: 'POST' })

export const markAllNotificationsRead = (teamId?: string) => {
  const qs = teamId ? `?teamId=${teamId}` : ''
  return request<{ success: boolean }>(`/api/notifications/read-all${qs}`, { method: 'POST' })
}

export const listNotificationPreferences = () =>
  request<NotificationPreference[]>('/api/notifications/preferences')

export const updateNotificationPreference = (teamId: string, updates: { inAppEnabled?: boolean; emailEnabled?: boolean; muted?: boolean }) =>
  request<NotificationPreference>('/api/notifications/preferences', {
    method: 'PATCH', body: JSON.stringify({ teamId, ...updates }),
  })

// ===== Goals =====

export interface Goal {
  id: string
  teamId: string
  title: string
  description: string
  status: 'active' | 'completed' | 'paused' | 'canceled'
  targetDate: string | null
  progress: number
  createdBy: string
  createdAt: string
  updatedAt: string
  taskCount?: number
  completedTaskCount?: number
  taskIds?: string[]
}

export const listGoals = (status?: string) => {
  const qs = status ? `?status=${status}` : ''
  return request<Goal[]>(`/api/goals${qs}`)
}

export const createGoal = (data: { title: string; description?: string; targetDate?: string }) =>
  request<Goal>('/api/goals', { method: 'POST', body: JSON.stringify(data) })

export const getGoal = (id: string) => request<Goal>(`/api/goals/${id}`)

export const updateGoal = (id: string, updates: { title?: string; description?: string; status?: string; targetDate?: string | null }) =>
  request<Goal>(`/api/goals/${id}`, { method: 'PATCH', body: JSON.stringify(updates) })

export const deleteGoal = (id: string) =>
  request<{ deleted: boolean }>(`/api/goals/${id}`, { method: 'DELETE' })

export const linkTaskToGoal = (goalId: string, taskId: string) =>
  request<{ linked: boolean }>(`/api/goals/${goalId}/tasks`, { method: 'POST', body: JSON.stringify({ taskId }) })

export const unlinkTaskFromGoal = (goalId: string, taskId: string) =>
  request<{ unlinked: boolean }>(`/api/goals/${goalId}/tasks/${taskId}`, { method: 'DELETE' })

// ===== KPI Goals (measurable milestones) =====

export interface KpiGoal {
  id: string
  teamId: string
  title: string
  metricName: string
  currentValue: number
  targetValue: number
  unit: string
  deadline: string | null
  status: 'active' | 'achieved' | 'missed' | 'paused'
  createdBy: string
  createdAt: string
  updatedAt: string
}

export const listKpiGoals = (status?: string) => {
  const qs = status ? `?status=${status}` : ''
  return request<KpiGoal[]>(`/api/kpi-goals${qs}`)
}

export const createKpiGoal = (data: {
  title: string; metricName: string; targetValue: number; unit?: string; currentValue?: number; deadline?: string
}) => request<KpiGoal>('/api/kpi-goals', { method: 'POST', body: JSON.stringify(data) })

export const getKpiGoal = (id: string) => request<KpiGoal>(`/api/kpi-goals/${id}`)

export const updateKpiGoal = (id: string, updates: Record<string, unknown>) =>
  request<KpiGoal>(`/api/kpi-goals/${id}`, { method: 'PATCH', body: JSON.stringify(updates) })

export const deleteKpiGoal = (id: string) =>
  request<{ deleted: boolean }>(`/api/kpi-goals/${id}`, { method: 'DELETE' })

// Per-category alert preferences
export interface AlertPreference {
  userId: string
  teamId: string
  category: string
  inApp: boolean
  email: boolean
  slack: boolean
  telegram: boolean
}

export const listAlertPreferences = () =>
  request<AlertPreference[]>('/api/notifications/alerts')

export const saveAlertPreferences = (alerts: Array<{ category: string; inApp: boolean; email: boolean; slack: boolean; telegram: boolean }>) =>
  request<AlertPreference[]>('/api/notifications/alerts', {
    method: 'PUT', body: JSON.stringify({ alerts }),
  })

// ===== Billing =====

export interface BillingSubscription {
  tier: string
  status: string
  maxAgents: number
  minHeartbeatSeconds: number
  activeHoursStart: number
  activeHoursEnd: number
  monthlyCredits: number
  includedCredits: number
  creditsResetAt: string | null
  currentPeriodEnd: string | null
}

export interface BillingStatus {
  subscription: BillingSubscription | null
  credits: number
}

export interface CreditTransaction {
  id: string
  teamId: string
  amount: number
  balanceAfter: number
  type: string
  description: string
  stripePaymentIntentId: string | null
  createdAt: string
}

export interface ModelCreditCost {
  modelId: string
  creditsPerUse: number
  modelType: string
  starIntelligence: number
  starPower: number
  starSpeed: number
  description: string
  tagline: string
  pros: string[]
  cons: string[]
  releaseDate: string | null
  popularity: number
}

export const getModelCatalog = () => request<ModelCreditCost[]>('/api/billing/models')

export const getBillingStatus = () => request<BillingStatus>('/api/billing/status')

export const getCreditTransactions = (limit = 50) =>
  request<CreditTransaction[]>(`/api/billing/transactions?limit=${limit}`)

export const createSubscriptionCheckout = (priceId: string) =>
  request<{ url: string }>('/api/billing/checkout/subscription', {
    method: 'POST', body: JSON.stringify({ priceId }),
  })

export const createCreditPackCheckout = (priceId: string) =>
  request<{ url: string }>('/api/billing/checkout/credits', {
    method: 'POST', body: JSON.stringify({ priceId }),
  })

export const createBillingPortal = () =>
  request<{ url: string }>('/api/billing/portal', { method: 'POST' })

// ===== Credentials (BYOK) =====

export interface CredentialInfo {
  serviceId: string
  credentialType: string
  hasValue: boolean
  updatedAt: string
}

export const listCredentials = () => request<CredentialInfo[]>('/api/credentials')

export const setCredential = (serviceId: string, value: string, credentialType?: string) =>
  request<{ serviceId: string; hasValue: boolean }>('/api/credentials', {
    method: 'PUT', body: JSON.stringify({ serviceId, value, credentialType }),
  })

export const deleteCredential = (serviceId: string) =>
  request<void>(`/api/credentials/${serviceId}`, { method: 'DELETE' })

// ===== Services (integration catalog) =====

export interface ServiceInfo {
  id: string
  name: string
  description: string
  category: string
  credentialType: string
  setupUrl: string
  setupInstructions: string
  icon: string
  connected: boolean
  updatedAt: string | null
}

export const listServices = () => request<ServiceInfo[]>('/api/services')

// ===== Templates =====

export interface AgentTemplate {
  id: string
  name: string
  title: string
  department: string
  description: string
  icon: string
  iconColor: string
  recommendedModel: string
  systemPrompt: string
  defaultSkills: string[]
  personalityTraits: string[]
  commonTasks: string[]
  isFree?: boolean
  isSpecial?: boolean
}

export const listTemplates = () => request<AgentTemplate[]>('/api/templates')

// ===== MCP Servers =====

export interface McpServerConfig {
  id?: string
  agentId: string
  serverName: string
  transportType: 'stdio' | 'http'
  command?: string
  args?: string
  url?: string
  envVars?: string
}

export interface McpTestResult {
  status: 'connected' | 'error'
  toolCount?: number
  tools?: string[]
  error?: string
}

export const listMcpServers = (agentId: string) =>
  request<McpServerConfig[]>(`/api/agents/${agentId}/mcp-servers`)

export const addMcpServer = (agentId: string, config: Omit<McpServerConfig, 'id' | 'agentId'>) =>
  request<McpServerConfig>(`/api/agents/${agentId}/mcp-servers`, {
    method: 'POST',
    body: JSON.stringify(config),
  })

export const removeMcpServer = (agentId: string, serverName: string) =>
  request<void>(`/api/agents/${agentId}/mcp-servers/${serverName}`, { method: 'DELETE' })

export const testMcpServer = (agentId: string, serverName: string) =>
  request<McpTestResult>(`/api/agents/${agentId}/mcp-servers/${serverName}/test`, { method: 'POST' })

// ===== Team Profile (onboarding) =====

export interface TeamProfile {
  teamId: string
  companyName: string | null
  companyUrl: string | null
  industry: string | null
  companySize: string | null
  businessSummary: string | null
  targetMarket: string | null
  primaryGoal: string | null
  onboardedAt: string | null
}

export interface WebsiteScanResult {
  companyName: string | null
  industry: string | null
  problemSolved: string | null
  solution: string | null
  targetMarket: string | null
  geographicFocus: string | null
  productsServices: string | null
  pricePoints: string | null
  uniqueDifferentiators: string | null
  buyingMotivations: string | null
  primaryGoal: string | null
  secondaryGoals: string | null
}

export const getTeamProfile = (teamId: string) =>
  request<TeamProfile>(`/api/teams/${teamId}/profile`)

export const updateTeamProfile = (teamId: string, data: Partial<TeamProfile>) =>
  request<{ success: boolean }>(`/api/teams/${teamId}/profile`, {
    method: 'PUT', body: JSON.stringify(data),
  })

export const scanWebsite = (teamId: string, url: string) =>
  request<WebsiteScanResult>(`/api/teams/${teamId}/scan-website`, {
    method: 'POST', body: JSON.stringify({ url }),
  })

export const setupAdvisor = (teamId: string) =>
  request<{ agentId: string; alreadyExists: boolean }>(`/api/teams/${teamId}/setup-advisor`, {
    method: 'POST',
  })

// ===== Config =====

export interface PlatformConfig {
  hostedMode: boolean
}

export const getConfig = () => request<PlatformConfig>('/api/config')

// ===== Ollama =====

export const detectOllama = () => request<OllamaStatus>('/api/ollama')

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

export interface TaskAttachment {
  name: string; url: string; type: string; size: number
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
  headerImage: string | null
  attachments: TaskAttachment[]
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
  type: 'image' | 'video' | '3d' | 'audio'
  url: string
  thumbnailUrl?: string
  filename: string
  mimeType: string
  width?: number
  height?: number
  duration?: number  // milliseconds (for audio/video)
}

export interface ChatMessage {
  id: number
  channelId: string
  senderType: 'human' | 'agent' | 'system'
  senderId: string
  content: string
  attachments: ChatAttachment[]
  audioKey: string | null
  audioDurationMs: number | null
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

export const uploadTaskAttachment = async (taskId: string, file: File): Promise<{ url: string; attachments: TaskAttachment[] }> => {
  const contentBase64 = await fileToBase64(file)
  return request(`/api/tasks/${taskId}/attachments`, {
    method: 'POST',
    body: JSON.stringify({ fileName: file.name, fileType: file.type, fileSize: file.size, contentBase64 }),
  })
}

export const removeTaskAttachment = (taskId: string, index: number) =>
  request<{ attachments: TaskAttachment[] }>(`/api/tasks/${taskId}/attachments/${index}`, { method: 'DELETE' })

export const setTaskHeaderImage = async (taskId: string, file: File): Promise<{ url: string }> => {
  const contentBase64 = await fileToBase64(file)
  return request(`/api/tasks/${taskId}/header-image`, {
    method: 'POST',
    body: JSON.stringify({ fileName: file.name, fileType: file.type, contentBase64 }),
  })
}

export const removeTaskHeaderImage = (taskId: string) =>
  request<void>(`/api/tasks/${taskId}/header-image`, { method: 'DELETE' })

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1]) // strip "data:...;base64," prefix
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

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

export const renameChannel = (channelId: string, name: string) =>
  request<ChatChannel>(`/api/chat/channels/${channelId}`, { method: 'PATCH', body: JSON.stringify({ name }) })

export const markChannelRead = (channelId: string) =>
  request<{ ok: boolean }>(`/api/chat/channels/${channelId}/read`, { method: 'POST' })

export const getUnreadCounts = () =>
  request<{ counts: Record<string, number>; total: number }>('/api/chat/unread')

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

export const updateTeam = (id: string, data: { name: string }) =>
  request<{ success: boolean; name: string }>(`/api/teams/${id}`, {
    method: 'PATCH', body: JSON.stringify(data),
  })

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
  additionalContext: string | null
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

export const getAdvisorNarration = (teamId: string, step: number, firstName: string) =>
  request<{ text: string; audioBase64: string; audioDurationMs: number }>(
    `/api/teams/${teamId}/advisor-narration`,
    { method: 'POST', body: JSON.stringify({ step, firstName }) },
  )

export const setupAdvisor = (teamId: string) =>
  request<{ agentId: string; alreadyExists: boolean }>(`/api/teams/${teamId}/setup-advisor`, {
    method: 'POST',
  })

// ===== Team Logo =====

export async function uploadTeamLogo(teamId: string, file: File): Promise<{ success: boolean }> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64Data = result.includes(',') ? result.split(',')[1] : result
      resolve(base64Data)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  return request(`/api/teams/${teamId}/logo`, {
    method: 'POST',
    body: JSON.stringify({ contentBase64: base64, contentType: file.type }),
  })
}

export const removeTeamLogo = (teamId: string) =>
  request<{ success: boolean }>(`/api/teams/${teamId}/logo`, { method: 'DELETE' })

export const getTeamLogoUrl = (teamId: string): string => {
  const url = import.meta.env.VITE_ENGINE_URL ?? 'http://localhost:3001'
  return `${url}/api/teams/${teamId}/logo`
}

// ===== User Profile =====

export const updateUserProfile = (data: { iconName?: string; iconColor?: string }) =>
  request<{ success: boolean }>('/api/user/profile', { method: 'PATCH', body: JSON.stringify(data) })

// ===== Config =====

export interface PlatformConfig {
  hostedMode: boolean
}

export const getConfig = () => request<PlatformConfig>('/api/config')

// ===== Ollama =====

export const detectOllama = () => request<OllamaStatus>('/api/ollama')

// ===== Meetings (hosted-only — real-time meet-and-greet) =====

export type MeetingEventType =
  | 'meeting_started'
  | 'agent_speaking'
  | 'agent_message'
  | 'human_message'
  | 'human_raised_hand'
  | 'meeting_ended'
  | 'error'

export interface MeetingEvent {
  type: MeetingEventType
  meetingId: string
  timestamp: string
  data: {
    agentId?: string
    agentName?: string
    agentIcon?: string
    agentIconColor?: string
    content?: string
    audioBase64?: string
    audioDurationMs?: number
    messageId?: number
    senderType?: 'agent' | 'human'
    phase?: string
  }
}

export const startMeetAndGreet = (teamId: string) =>
  request<{ meetingId: string }>(`/api/teams/${teamId}/meetings/meet-and-greet`, {
    method: 'POST',
  })

export const sendMeetingMessage = (teamId: string, meetingId: string, content: string) =>
  request<{ queued: boolean }>(`/api/teams/${teamId}/meetings/${meetingId}/message`, {
    method: 'POST', body: JSON.stringify({ content }),
  })

export async function sendMeetingVoice(
  teamId: string,
  meetingId: string,
  audioBlob: Blob,
): Promise<{ text: string; queued: boolean }> {
  const { data: { session } } = await supabase.auth.getSession()
  const headers: Record<string, string> = {}
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }
  if (_activeTeamId) {
    headers['X-Team-Id'] = _activeTeamId
  }
  headers['Content-Type'] = 'audio/webm'

  const res = await fetch(
    `${ENGINE_URL}/api/teams/${teamId}/meetings/${meetingId}/voice`,
    { method: 'POST', headers, body: audioBlob },
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error ?? `Voice transcription failed: ${res.status}`)
  }
  return res.json()
}

export const raiseMeetingHand = (teamId: string, meetingId: string) =>
  request<{ raised: boolean }>(`/api/teams/${teamId}/meetings/${meetingId}/raise-hand`, {
    method: 'POST',
  })

/**
 * Connect to a meeting's SSE stream.
 * Uses fetch + ReadableStream (not EventSource) to support custom auth headers.
 * Returns a cleanup function to abort the connection.
 */
export function connectMeetingStream(
  teamId: string,
  meetingId: string,
  onEvent: (event: MeetingEvent) => void,
  onError?: (error: Error) => void,
): () => void {
  const controller = new AbortController()

  ;(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = {}
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }
      if (_activeTeamId) {
        headers['X-Team-Id'] = _activeTeamId
      }

      const res = await fetch(
        `${ENGINE_URL}/api/teams/${teamId}/meetings/${meetingId}/stream`,
        { headers, signal: controller.signal },
      )

      if (!res.ok || !res.body) {
        throw new Error(`SSE connection failed: ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Parse SSE frames
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? '' // keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6)) as MeetingEvent
              onEvent(event)
            } catch { /* ignore parse errors */ }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        onError?.(err as Error)
      }
    }
  })()

  return () => controller.abort()
}

// ===== Meeting List & Replay =====

export interface MeetingSummary {
  id: string
  teamId: string
  channelId: string
  type: string
  title: string
  status: 'in_progress' | 'completed'
  startedAt: string
  endedAt: string | null
  summary: string | null
  actionItems: Array<{ description: string; assignee: string }> | null
}

export interface MeetingDetail extends MeetingSummary {
  agents: Array<{ id: string; name: string; iconName: string | null; iconColor: string | null }>
}

export const listMeetings = (teamId: string) =>
  request<MeetingSummary[]>(`/api/teams/${teamId}/meetings`)

export const getMeeting = (teamId: string, meetingId: string) =>
  request<MeetingDetail>(`/api/teams/${teamId}/meetings/${meetingId}`)

/**
 * Get the audio URL for a stored meeting audio key.
 * Audio is served through the engine (proxied from R2).
 */
export const getMeetingAudioUrl = (audioKey: string): string =>
  `${ENGINE_URL}/api/audio/${audioKey}`

// ===== Knowledge Base =====

export interface KbDocument {
  id: string
  teamId: string
  title: string
  fileName: string
  fileType: string
  fileSize: number
  status: 'pending' | 'processing' | 'ready' | 'failed'
  l0Summary: string | null
  l1Overview: string | null
  chunkCount: number
  error: string | null
  createdAt: string
}

export interface KbSearchResult {
  chunkId: string
  documentId: string
  documentTitle: string
  content: string
  score: number
  l0Summary: string | null
}

export interface KbChunk {
  id: string
  content: string
  chunkIndex: number
  tokenCount: number
}

export const listKbDocuments = () =>
  request<KbDocument[]>('/api/kb/documents')

export const getKbDocument = (id: string) =>
  request<KbDocument>(`/api/kb/documents/${id}`)

export const deleteKbDocument = (id: string) =>
  request<{ success: boolean }>(`/api/kb/documents/${id}`, { method: 'DELETE' })

export const searchKb = (query: string, topK?: number) =>
  request<KbSearchResult[]>('/api/kb/search', {
    method: 'POST',
    body: JSON.stringify({ query, topK }),
  })

export const getKbDocumentChunks = (id: string) =>
  request<{ chunks: KbChunk[] }>(`/api/kb/documents/${id}/chunks`)

export async function uploadKbDocument(file: File, title?: string): Promise<KbDocument> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip data URL prefix: "data:application/pdf;base64,..."
      const base64Data = result.includes(',') ? result.split(',')[1] : result
      resolve(base64Data)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'txt'

  return request<KbDocument>('/api/kb/documents', {
    method: 'POST',
    body: JSON.stringify({
      fileName: file.name,
      fileType: ext,
      content: base64,
      title,
    }),
  })
}

// ===== Mentions =====

export interface MentionCompletionData {
  agents: Array<{ id: string; name: string; iconName: string | null; iconColor: string | null; status: string }>
  users: Array<{ userId: string; email: string }>
  documents: Array<{ id: string; title: string; fileType: string }>
}

export const getMentionCompletions = () =>
  request<MentionCompletionData>('/api/chat/mentions')

// ===== Chat Search =====

export interface ChatSearchResult {
  id: number
  channelId: string
  channelName: string
  channelType: 'dm' | 'group' | 'task_thread'
  senderType: 'human' | 'agent' | 'system'
  senderId: string
  content: string
  createdAt: string
}

export const searchChatMessages = (q: string, limit = 20) =>
  request<ChatSearchResult[]>(`/api/chat/search?q=${encodeURIComponent(q)}&limit=${limit}`)

// ===== Reactions =====

export const toggleReaction = (messageId: number, emoji: string) =>
  request<{ action: 'added' | 'removed'; emoji: string }>(`/api/chat/messages/${messageId}/reactions`, {
    method: 'POST',
    body: JSON.stringify({ emoji }),
  })

export const getReactions = (messageId: number) =>
  request<Record<string, string[]>>(`/api/chat/messages/${messageId}/reactions`)

// ===== Workflows =====

export interface Workflow {
  id: string
  teamId: string
  name: string
  description: string
  goalId: string | null
  triggerType: 'manual' | 'scheduled'
  scheduleCron: string | null
  createdBy: string
  status: 'active' | 'archived'
  createdAt: string
  updatedAt: string
}

export interface WorkflowStep {
  id: string
  workflowId: string
  stepOrder: number
  title: string
  description: string
  assignedAgentId: string | null
  gate: 'auto' | 'approval'
  timeoutMinutes: number | null
  config: string
}

export interface WorkflowWithSteps extends Workflow {
  steps: WorkflowStep[]
}

export interface WorkflowRun {
  id: string
  teamId: string
  workflowId: string
  status: 'running' | 'paused' | 'completed' | 'failed' | 'canceled'
  currentStep: number
  startedBy: string
  startedAt: string
  completedAt: string | null
  error: string | null
}

export interface WorkflowRunStep {
  id: string
  runId: string
  stepId: string
  taskId: string | null
  status: 'pending' | 'running' | 'awaiting_approval' | 'completed' | 'failed' | 'skipped'
  startedAt: string | null
  completedAt: string | null
  error: string | null
}

export interface WorkflowRunWithSteps extends WorkflowRun {
  steps: WorkflowRunStep[]
}

export const listWorkflows = (status?: string) => {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  const qs = params.toString()
  return request<Workflow[]>(`/api/workflows${qs ? `?${qs}` : ''}`)
}

export const createWorkflow = (data: {
  name: string; description?: string; goalId?: string;
  triggerType?: string; scheduleCron?: string;
  steps?: Array<{ title: string; description?: string; assignedAgentId?: string; gate?: string; timeoutMinutes?: number; config?: string }>
}) =>
  request<Workflow>('/api/workflows', { method: 'POST', body: JSON.stringify(data) })

export const getWorkflow = (id: string) =>
  request<WorkflowWithSteps>(`/api/workflows/${id}`)

export const updateWorkflow = (id: string, data: Record<string, unknown>) =>
  request<Workflow>(`/api/workflows/${id}`, { method: 'PATCH', body: JSON.stringify(data) })

export const deleteWorkflow = (id: string) =>
  request<void>(`/api/workflows/${id}`, { method: 'DELETE' })

export const addWorkflowStep = (workflowId: string, data: { title: string; description?: string; assignedAgentId?: string; gate?: string; timeoutMinutes?: number; config?: string }) =>
  request<WorkflowStep>(`/api/workflows/${workflowId}/steps`, { method: 'POST', body: JSON.stringify(data) })

export const updateWorkflowStep = (workflowId: string, stepId: string, data: Record<string, unknown>) =>
  request<WorkflowStep>(`/api/workflows/${workflowId}/steps/${stepId}`, { method: 'PATCH', body: JSON.stringify(data) })

export const deleteWorkflowStep = (workflowId: string, stepId: string) =>
  request<void>(`/api/workflows/${workflowId}/steps/${stepId}`, { method: 'DELETE' })

export const reorderWorkflowSteps = (workflowId: string, stepIds: string[]) =>
  request<{ reordered: boolean }>(`/api/workflows/${workflowId}/steps/reorder`, { method: 'PUT', body: JSON.stringify({ stepIds }) })

export const startWorkflowRun = (workflowId: string) =>
  request<WorkflowRun>(`/api/workflows/${workflowId}/run`, { method: 'POST' })

export const listWorkflowRuns = (filters?: { workflowId?: string; status?: string }) => {
  const params = new URLSearchParams()
  if (filters?.workflowId) params.set('workflowId', filters.workflowId)
  if (filters?.status) params.set('status', filters.status)
  const qs = params.toString()
  return request<WorkflowRun[]>(`/api/workflow-runs${qs ? `?${qs}` : ''}`)
}

export const getWorkflowRun = (id: string) =>
  request<WorkflowRunWithSteps>(`/api/workflow-runs/${id}`)

export const cancelWorkflowRun = (id: string) =>
  request<WorkflowRun>(`/api/workflow-runs/${id}/cancel`, { method: 'POST' })

export const approveWorkflowRunStep = (runStepId: string) =>
  request<{ approved: boolean }>(`/api/workflow-run-steps/${runStepId}/approve`, { method: 'POST' })

export const captureWorkflow = (name: string, taskIds: string[]) =>
  request<Workflow>('/api/workflows/capture', { method: 'POST', body: JSON.stringify({ name, taskIds }) })

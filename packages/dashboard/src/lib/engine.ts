/**
 * engine.ts — API client for the YokeBot Engine
 *
 * All dashboard ↔ engine communication goes through here.
 * In dev, calls localhost:3001. In prod, proxied via Vite/hosting config.
 */

const ENGINE_URL = import.meta.env.VITE_ENGINE_URL ?? 'http://localhost:3001'

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${ENGINE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
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
  modelEndpoint: string
  modelName: string
  systemPrompt: string | null
  proactive: boolean
  heartbeatSeconds: number
  activeHoursStart: number
  activeHoursEnd: number
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

export interface ChatMessage {
  id: number
  channelId: string
  senderType: 'human' | 'agent' | 'system'
  senderId: string
  content: string
  taskId: string | null
  createdAt: string
}

export interface OllamaStatus {
  connected: boolean
  models: Array<{ name: string; size: number; modified_at: string }>
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

// ===== Skills =====

export const listSkills = () =>
  request<Array<{ metadata: { name: string; description: string; tags: string[]; source: string }; filePath: string }>>(
    '/api/skills',
  )

// ===== Ollama =====

export const detectOllama = () => request<OllamaStatus>('/api/ollama')

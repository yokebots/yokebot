/**
 * validation.ts — Zod schemas for all API request bodies
 */

import { z } from 'zod'

// ---- Agents ----

export const CreateAgentSchema = z.object({
  name: z.string().min(1).max(100),
  department: z.string().max(100).optional(),
  iconName: z.string().max(50).optional(),
  iconColor: z.string().max(20).optional(),
  systemPrompt: z.string().max(10000).optional(),
  modelId: z.string().max(100).optional(),
  modelEndpoint: z.string().max(200).optional(),
  modelName: z.string().max(200).optional(),
  proactive: z.boolean().optional(),
  heartbeatSeconds: z.number().int().min(60).max(86400).optional(),
  activeHoursStart: z.number().int().min(0).max(23).optional(),
  activeHoursEnd: z.number().int().min(0).max(23).optional(),
})

export const UpdateAgentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  department: z.string().max(100).optional(),
  systemPrompt: z.string().max(10000).optional(),
  modelId: z.string().max(100).optional(),
  modelEndpoint: z.string().max(200).optional(),
  modelName: z.string().max(200).optional(),
  proactive: z.boolean().optional(),
  heartbeatSeconds: z.number().int().min(60).max(86400).optional(),
})

export const ChatWithAgentSchema = z.object({
  message: z.string().min(1).max(10000),
})

// ---- Tasks ----

export const CreateTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  assignedAgentId: z.string().max(200).optional(),
  parentTaskId: z.string().max(200).optional(),
  deadline: z.string().max(100).optional(),
})

export const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  status: z.enum(['backlog', 'todo', 'in_progress', 'review', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  assignedAgentId: z.string().max(200).nullable().optional(),
  deadline: z.string().max(100).nullable().optional(),
})

// ---- Chat ----

export const CreateChannelSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['dm', 'group', 'task_thread']),
})

export const SendChatMessageSchema = z.object({
  senderType: z.enum(['human', 'agent', 'system']),
  senderId: z.string().min(1).max(200),
  content: z.string().min(1).max(10000),
  taskId: z.string().max(200).optional(),
})

// ---- Approvals ----

export const CreateApprovalSchema = z.object({
  agentId: z.string().min(1).max(200),
  actionType: z.string().min(1).max(200),
  actionDetail: z.string().min(1).max(5000),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
})

export const ResolveApprovalSchema = z.object({
  status: z.enum(['approved', 'rejected']),
})

// ---- Source of Record ----

export const CreateSorTableSchema = z.object({
  name: z.string().min(1).max(100),
  columns: z.array(z.object({
    name: z.string().min(1).max(100),
    colType: z.string().max(50).optional(),
  })).optional(),
})

export const UpdateSorPermissionSchema = z.object({
  agentId: z.string().min(1).max(200),
  canRead: z.boolean(),
  canWrite: z.boolean(),
})

// ---- Workspace ----

export const WriteFileSchema = z.object({
  path: z.string().min(1).max(500),
  content: z.string().max(1_000_000),
  agentId: z.string().min(1).max(200),
})

// ---- Model Providers ----

export const UpdateProviderSchema = z.object({
  apiKey: z.string().max(500).optional(),
  enabled: z.boolean().optional(),
})

// ---- Skills ----

export const InstallSkillSchema = z.object({
  skillName: z.string().min(1).max(100),
})

// ---- Teams ----

export const CreateTeamSchema = z.object({
  name: z.string().min(1).max(100),
})

export const AddMemberSchema = z.object({
  userId: z.string().min(1).max(200),
  email: z.string().email().max(200),
  role: z.enum(['admin', 'member', 'viewer']).optional(),
})

export const UpdateRoleSchema = z.object({
  role: z.enum(['admin', 'member', 'viewer']),
})

// ---- Validation helper ----

export function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    const message = result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')
    const err = new Error(message) as Error & { status: number }
    err.status = 400
    throw err
  }
  return result.data
}

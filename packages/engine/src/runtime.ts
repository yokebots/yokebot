/**
 * runtime.ts — ReAct loop: the core reasoning cycle
 *
 * Receive message → Think → Act → Observe → Repeat
 *
 * The ReAct (Reasoning + Acting) loop is how agents process work.
 * On each cycle the agent: reads its messages, thinks about what
 * to do, optionally calls tools, observes the results, and responds.
 */

import type { Db } from './db/types.ts'
import { chatCompletionWithFallback, type ChatMessage, type ToolDef, type ToolCall, type ModelConfig } from './model.ts'
import { getMessages, addMessage } from './agent.ts'
import { listFiles, readFile, writeFile, type WorkspaceConfig } from './workspace.ts'
import { createTask, listTasks, updateTask } from './tasks.ts'
import { getDmChannel, sendMessage } from './chat.ts'
import { createApproval } from './approval.ts'
import { listSorTables, listSorRows, updateSorRow, getSorTableByName, checkSorPermission } from './sor.ts'
import { getAgentSkills, getSkillTools } from './skills.ts'
import { executeSkillHandler } from './skill-handlers.ts'
import { executeBrowserTool, isBrowserTool } from './browser.ts'
import { loadMcpTools, callMcpTool, isMcpTool } from './mcp-client.ts'
import { logActivity } from './activity.ts'
import { falGenerate } from './fal.ts'
import { getLogicalModel } from './model.ts'
import { downloadAndSave, guessMimeType, type MediaAttachment } from './media.ts'
import type { ChatAttachment } from './chat.ts'
import { deductCredits, getModelCreditCost, getSkillCreditCost } from './billing.ts'

const HOSTED_MODE = process.env.YOKEBOT_HOSTED_MODE === 'true'

export interface RuntimeConfig {
  maxIterations: number  // safety limit to prevent infinite loops
  skipCredits?: boolean  // bypass credit deduction (e.g. AdvisorBot is free)
}

const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  maxIterations: 10,
}

/** Context passed to tool execution so tools can access DB / workspace. */
export interface ToolContext {
  db: Db
  agentId: string
  teamId: string
  channelId?: string
  workspaceConfig: WorkspaceConfig
  skillsDir: string
  skipCredits?: boolean
}

/** Helper to reduce boilerplate when defining tool schemas. */
function toolDef(name: string, description: string, properties: Record<string, unknown>, required: string[]): ToolDef {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: { type: 'object', properties, required },
    },
  }
}

/**
 * Built-in tools that every agent has access to.
 * Additional tools come from installed skills.
 *
 * IMPORTANT: Agents have NO delete tools by design. All deletion
 * (tasks, files, channels, SOR rows, etc.) requires human action
 * through the dashboard UI. If delete tools are ever added here,
 * they MUST go through the approval system first (request_approval
 * with riskLevel 'high' or 'critical').
 */
function getBuiltinTools(): ToolDef[] {
  return [
    toolDef('think', 'MANDATORY: Reason through your approach before taking any other action. Use this to assess the situation, prioritize, plan your next step, and reflect on results. You MUST call this before every other tool call.', {
      thought: { type: 'string', description: 'Your step-by-step reasoning: ASSESS → PRIORITIZE → PLAN (or REFLECT after an action)' },
    }, ['thought']),

    toolDef('respond', 'Send a message to the user or team channel. Use this when you have a response ready.', {
      message: { type: 'string', description: 'The message to send' },
    }, ['message']),

    // Workspace / knowledge base
    toolDef('read_workspace_file', 'Read a file from the shared knowledge base / workspace.', {
      path: { type: 'string', description: 'File path relative to workspace root, e.g. "global/company-context.md"' },
    }, ['path']),

    toolDef('write_workspace_file', 'Write or update a file in the shared workspace.', {
      path: { type: 'string', description: 'File path relative to workspace root' },
      content: { type: 'string', description: 'The file content to write' },
    }, ['path', 'content']),

    toolDef('list_workspace_files', 'List files and directories in the workspace.', {
      directory: { type: 'string', description: 'Directory path relative to workspace root (empty string for root)' },
    }, []),

    // Tasks (Mission Control)
    toolDef('create_task', 'Create a new task in Mission Control.', {
      title: { type: 'string', description: 'Task title' },
      description: { type: 'string', description: 'Task description' },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Task priority' },
    }, ['title']),

    toolDef('update_task', 'Update an existing task (status, priority, description).', {
      taskId: { type: 'string', description: 'The task ID to update' },
      status: { type: 'string', enum: ['backlog', 'todo', 'in_progress', 'review', 'done'], description: 'New status' },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'New priority' },
      description: { type: 'string', description: 'Updated description' },
    }, ['taskId']),

    toolDef('list_tasks', 'Query tasks from Mission Control.', {
      status: { type: 'string', enum: ['backlog', 'todo', 'in_progress', 'review', 'done'], description: 'Filter by status' },
      agentId: { type: 'string', description: 'Filter by assigned agent ID' },
    }, []),

    // Chat
    toolDef('send_chat_message', 'Post a message to a chat channel.', {
      channelId: { type: 'string', description: 'The channel ID to send to. Use "dm" for your own DM channel.' },
      content: { type: 'string', description: 'The message content' },
    }, ['content']),

    // Approvals
    toolDef('request_approval', 'Create an approval request for a risky action. Non-blocking — returns immediately.', {
      actionType: { type: 'string', description: 'Category of the action, e.g. "delete_data", "external_api_call"' },
      actionDetail: { type: 'string', description: 'Description of what you want to do and why' },
      riskLevel: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Risk level assessment' },
    }, ['actionType', 'actionDetail', 'riskLevel']),

    // Source of Record
    toolDef('query_source_of_record', 'Read rows from a Source of Record data table.', {
      tableName: { type: 'string', description: 'The table name to query' },
    }, ['tableName']),

    toolDef('update_source_of_record', 'Update a row in a Source of Record data table.', {
      tableName: { type: 'string', description: 'The table name' },
      rowId: { type: 'string', description: 'The row ID to update' },
      data: { type: 'object', description: 'Key-value pairs to update' },
    }, ['tableName', 'rowId', 'data']),

    // Knowledge base search + memory
    toolDef('search_knowledge_base', 'Search uploaded documents in the knowledge base for relevant information. Returns matching text chunks ranked by relevance.', {
      query: { type: 'string', description: 'Search query — describe what information you need' },
      topK: { type: 'number', description: 'Max results to return (default 5, max 20)' },
    }, ['query']),

    toolDef('remember', 'Save an important fact or learning to long-term memory. Use this to persist key insights from conversations for future reference.', {
      content: { type: 'string', description: 'The fact, learning, or insight to remember' },
    }, ['content']),

    // Media generation
    toolDef('generate_image', 'Generate an image using AI. Returns the URL of the generated image.', {
      prompt: { type: 'string', description: 'Text description of the image to generate' },
      modelId: { type: 'string', description: 'Model to use. Default: "nano-banana-pro"' },
    }, ['prompt']),

    toolDef('generate_video', 'Generate a video using AI. Returns the URL of the generated video.', {
      prompt: { type: 'string', description: 'Text description of the video to generate' },
      modelId: { type: 'string', description: 'Model to use: "kling-3.0" or "seedance-2.0". Default: "kling-3.0"' },
    }, ['prompt']),

    toolDef('generate_3d', 'Generate a 3D model from an image. Returns the URL of the .glb file.', {
      imageUrl: { type: 'string', description: 'URL of the input image to convert to 3D' },
      modelId: { type: 'string', description: 'Model to use. Default: "hunyuan-3d-v3.1-pro"' },
    }, ['imageUrl']),

  ]
}

/**
 * Execute a single tool call and return the result string.
 */
async function executeToolCall(toolCall: ToolCall, ctx: ToolContext): Promise<string> {
  let args: Record<string, unknown>
  try {
    args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>
  } catch {
    return `Error: Could not parse tool arguments as JSON.`
  }

  switch (toolCall.function.name) {
    case 'think':
      return `Thought: ${args.thought as string}`

    case 'respond':
      return `Response: ${args.message as string}`

    // ---- Workspace ----
    case 'read_workspace_file': {
      const content = readFile(ctx.workspaceConfig, args.path as string)
      if (content === null) return `File not found: ${args.path as string}`
      return content
    }

    case 'write_workspace_file': {
      const content = args.content as string
      // Limit agent file writes to 100KB (API endpoint allows 1MB for human uploads)
      if (content.length > 100_000) return `Error: File content too large (${content.length} chars). Maximum is 100,000 characters for agent writes.`
      const result = writeFile(ctx.workspaceConfig, args.path as string, content, ctx.agentId)
      return result.success ? `File written: ${args.path as string}` : `Error: ${result.error}`
    }

    case 'list_workspace_files': {
      const dir = (args.directory as string) ?? ''
      const files = listFiles(ctx.workspaceConfig, dir)
      if (files.length === 0) return `No files found in "${dir || '/'}".`
      return files.map((f) => `${f.isDirectory ? '[dir] ' : ''}${f.path} (${f.size} bytes)`).join('\n')
    }

    // ---- Tasks ----
    case 'create_task': {
      const task = await createTask(ctx.db, ctx.teamId, args.title as string, {
        description: args.description as string | undefined,
        priority: (args.priority as 'low' | 'medium' | 'high' | 'urgent') ?? 'medium',
        assignedAgentId: ctx.agentId,
      })
      return `Task created: "${task.title}" (id: ${task.id}, priority: ${task.priority})`
    }

    case 'update_task': {
      // Verify task belongs to this agent's team before updating
      const existingTask = await listTasks(ctx.db, { teamId: ctx.teamId })
      const targetTask = existingTask.find((t) => t.id === (args.taskId as string))
      if (!targetTask) return `Task not found or access denied: ${args.taskId as string}`
      const updates: Record<string, unknown> = {}
      if (args.status) updates.status = args.status
      if (args.priority) updates.priority = args.priority
      if (args.description) updates.description = args.description
      const task = await updateTask(ctx.db, args.taskId as string, updates)
      if (!task) return `Task not found: ${args.taskId as string}`
      return `Task updated: "${task.title}" (status: ${task.status}, priority: ${task.priority})`
    }

    case 'list_tasks': {
      // Always scope to own team
      const filters: Record<string, unknown> = { teamId: ctx.teamId }
      if (args.status) filters.status = args.status
      if (args.agentId) filters.agentId = args.agentId
      const tasks = await listTasks(ctx.db, filters as Parameters<typeof listTasks>[1])
      if (tasks.length === 0) return 'No tasks found.'
      return tasks.map((t) => `- [${t.status}] ${t.title} (${t.priority}, id: ${t.id})`).join('\n')
    }

    // ---- Chat ----
    case 'send_chat_message': {
      const dmChannel = await getDmChannel(ctx.db, ctx.agentId, ctx.teamId)
      const channelId = (args.channelId as string) === 'dm'
        ? dmChannel.id
        : args.channelId as string
      const msg = await sendMessage(ctx.db, channelId, 'agent', ctx.agentId, args.content as string)
      return `Message sent (id: ${msg.id})`
    }

    // ---- Approvals ----
    case 'request_approval': {
      const approval = await createApproval(
        ctx.db,
        ctx.teamId,
        ctx.agentId,
        args.actionType as string,
        args.actionDetail as string,
        args.riskLevel as 'low' | 'medium' | 'high' | 'critical',
      )
      return `Approval request created (id: ${approval.id}, status: pending). A human will review it.`
    }

    // ---- Source of Record ----
    case 'query_source_of_record': {
      // Team-scoped: only access own team's tables
      const table = await getSorTableByName(ctx.db, args.tableName as string, ctx.teamId)
      if (!table) return `Table not found: "${args.tableName as string}"`
      // Enforce per-agent read permission
      const readPerm = await checkSorPermission(ctx.db, ctx.agentId, table.id)
      if (readPerm && !readPerm.canRead) return `Access denied: you do not have read permission on table "${table.name}".`
      const rows = await listSorRows(ctx.db, table.id)
      if (rows.length === 0) return `Table "${table.name}" has no rows.`
      return JSON.stringify(rows, null, 2)
    }

    case 'update_source_of_record': {
      // Team-scoped: only access own team's tables
      const table = await getSorTableByName(ctx.db, args.tableName as string, ctx.teamId)
      if (!table) return `Table not found: "${args.tableName as string}"`
      // Enforce per-agent write permission
      const writePerm = await checkSorPermission(ctx.db, ctx.agentId, table.id)
      if (writePerm && !writePerm.canWrite) return `Access denied: you do not have write permission on table "${table.name}".`
      const row = await updateSorRow(ctx.db, args.rowId as string, args.data as Record<string, unknown>)
      if (!row) return `Row not found: ${args.rowId as string}`
      return `Row updated: ${JSON.stringify(row.data)}`
    }

    // ---- Media Generation ----
    case 'generate_image': {
      const modelId = (args.modelId as string) || 'nano-banana-pro'
      const logical = getLogicalModel(modelId)
      if (!logical || logical.type !== 'image') return `Unknown image model: ${modelId}`
      const falModelId = logical.backends[0]?.providerModelId
      if (!falModelId) return `No backend configured for model: ${modelId}`
      if (HOSTED_MODE) {
        const cost = await getModelCreditCost(ctx.db, modelId)
        const { success, balance } = await deductCredits(ctx.db, ctx.teamId, cost || 10, 'media_debit', `Image generation: ${(args.prompt as string).slice(0, 80)}`)
        if (!success) return `Insufficient credits. Image generation costs ${cost} credits but your team has ${balance}. Purchase more credits in Settings → Billing.`
      }
      try {
        const result = await falGenerate(ctx.db, falModelId, { prompt: args.prompt as string })
        const image = result.images?.[0]
        if (!image) return 'Image generation completed but no image was returned.'

        // Download to workspace and post as chat attachment
        const ext = image.content_type?.split('/')?.[1] ?? 'png'
        const slug = (args.prompt as string).slice(0, 40).replace(/[^a-zA-Z0-9]/g, '_')
        const filename = `${slug}.${ext}`
        const workspacePath = await downloadAndSave(ctx.workspaceConfig, ctx.teamId, 'images', image.url, filename)
        const attachment: ChatAttachment = {
          type: 'image', url: workspacePath, filename,
          mimeType: guessMimeType(filename), width: image.width, height: image.height,
        }
        const dmChannel = await getDmChannel(ctx.db, ctx.agentId, ctx.teamId)
        await sendMessage(ctx.db, dmChannel.id, 'agent', ctx.agentId, `Generated image: ${(args.prompt as string).slice(0, 80)}`, undefined, ctx.teamId, [attachment])
        await logActivity(ctx.db, 'media_generated', ctx.agentId, `Generated image: ${(args.prompt as string).slice(0, 80)}`, undefined, ctx.teamId)
        return JSON.stringify({ type: 'image', url: workspacePath, width: image.width, height: image.height })
      } catch (err) {
        return `Image generation failed: ${(err as Error).message}`
      }
    }

    case 'generate_video': {
      const modelId = (args.modelId as string) || 'kling-3.0'
      const logical = getLogicalModel(modelId)
      if (!logical || logical.type !== 'video') return `Unknown video model: ${modelId}`
      const falModelId = logical.backends[0]?.providerModelId
      if (!falModelId) return `No backend configured for model: ${modelId}`
      if (HOSTED_MODE) {
        const cost = await getModelCreditCost(ctx.db, modelId)
        const { success, balance } = await deductCredits(ctx.db, ctx.teamId, cost || 100, 'media_debit', `Video generation: ${(args.prompt as string).slice(0, 80)}`)
        if (!success) return `Insufficient credits. Video generation costs ${cost} credits but your team has ${balance}. Purchase more credits in Settings → Billing.`
      }
      try {
        const result = await falGenerate(ctx.db, falModelId, { prompt: args.prompt as string })
        const video = result.video
        if (!video) return 'Video generation completed but no video was returned.'

        const ext = video.content_type?.split('/')?.[1] ?? 'mp4'
        const slug = (args.prompt as string).slice(0, 40).replace(/[^a-zA-Z0-9]/g, '_')
        const filename = `${slug}.${ext}`
        const workspacePath = await downloadAndSave(ctx.workspaceConfig, ctx.teamId, 'video', video.url, filename)
        const attachment: ChatAttachment = {
          type: 'video', url: workspacePath, filename,
          mimeType: guessMimeType(filename),
        }
        const dmChannel = await getDmChannel(ctx.db, ctx.agentId, ctx.teamId)
        await sendMessage(ctx.db, dmChannel.id, 'agent', ctx.agentId, `Generated video: ${(args.prompt as string).slice(0, 80)}`, undefined, ctx.teamId, [attachment])
        await logActivity(ctx.db, 'media_generated', ctx.agentId, `Generated video: ${(args.prompt as string).slice(0, 80)}`, undefined, ctx.teamId)
        return JSON.stringify({ type: 'video', url: workspacePath })
      } catch (err) {
        return `Video generation failed: ${(err as Error).message}`
      }
    }

    case 'generate_3d': {
      const modelId = (args.modelId as string) || 'hunyuan-3d-v3.1-pro'
      const logical = getLogicalModel(modelId)
      if (!logical || logical.type !== '3d') return `Unknown 3D model: ${modelId}`
      const falModelId = logical.backends[0]?.providerModelId
      if (!falModelId) return `No backend configured for model: ${modelId}`
      if (HOSTED_MODE) {
        const cost = await getModelCreditCost(ctx.db, modelId)
        const { success, balance } = await deductCredits(ctx.db, ctx.teamId, cost || 10, 'media_debit', `3D model generation`)
        if (!success) return `Insufficient credits. 3D generation costs ${cost} credits but your team has ${balance}. Purchase more credits in Settings → Billing.`
      }
      try {
        const result = await falGenerate(ctx.db, falModelId, { image_url: args.imageUrl as string })
        const mesh = result.model_mesh
        if (!mesh) return '3D generation completed but no model was returned.'

        const filename = mesh.file_name ?? 'model.glb'
        const workspacePath = await downloadAndSave(ctx.workspaceConfig, ctx.teamId, '3d', mesh.url, filename)
        const attachment: ChatAttachment = {
          type: '3d', url: workspacePath, filename,
          mimeType: guessMimeType(filename),
        }
        const dmChannel = await getDmChannel(ctx.db, ctx.agentId, ctx.teamId)
        await sendMessage(ctx.db, dmChannel.id, 'agent', ctx.agentId, `Generated 3D model`, undefined, ctx.teamId, [attachment])
        await logActivity(ctx.db, 'media_generated', ctx.agentId, `Generated 3D model from image`, undefined, ctx.teamId)
        return JSON.stringify({ type: '3d', url: workspacePath, filename })
      } catch (err) {
        return `3D generation failed: ${(err as Error).message}`
      }
    }

    // ---- Knowledge Base ----
    case 'search_knowledge_base': {
      const { searchKb } = await import('./knowledge-base.ts')
      const query = args.query as string
      const topK = Math.min(Math.max((args.topK as number) || 5, 1), 20)
      const results = await searchKb(ctx.db, ctx.teamId, query, topK)
      if (results.length === 0) return 'No relevant documents found in the knowledge base.'
      return results.map((r, i) =>
        `[${i + 1}] "${r.documentTitle}" (score: ${r.score.toFixed(3)})\n${r.content.slice(0, 1000)}${r.content.length > 1000 ? '...' : ''}`
      ).join('\n\n---\n\n')
    }

    case 'remember': {
      const { addMemory } = await import('./knowledge-base.ts')
      const content = args.content as string
      if (content.length > 5000) return 'Error: Memory content too long (max 5000 characters).'
      await addMemory(ctx.db, ctx.teamId, ctx.agentId, content, ctx.channelId)
      return `Memory saved: "${content.slice(0, 100)}${content.length > 100 ? '...' : ''}"`
    }

    default: {
      // Deduct skill credits before executing (hosted mode only, skip for free agents like AdvisorBot)
      if (HOSTED_MODE && !ctx.skipCredits) {
        const skillCost = await getSkillCreditCost(ctx.db, toolCall.function.name)
        if (skillCost > 0) {
          const { success, balance } = await deductCredits(ctx.db, ctx.teamId, skillCost, 'skill_debit',
            `Skill: ${toolCall.function.name}`)
          if (!success) {
            return `Insufficient credits. ${toolCall.function.name} costs ${skillCost} credits but your team has ${balance}. Purchase more credits in Settings → Billing.`
          }
        }
      }

      // Try browser tools first (browser_navigate, browser_snapshot, etc.)
      if (isBrowserTool(toolCall.function.name)) {
        const browserResult = await executeBrowserTool(ctx.agentId, toolCall.function.name, args)
        if (browserResult !== null) return browserResult
      }

      // Try MCP tools (server_name__tool_name pattern)
      if (isMcpTool(toolCall.function.name)) {
        const mcpResult = await callMcpTool(ctx.agentId, toolCall.function.name, args)
        if (mcpResult !== null) return mcpResult
      }

      // Try skill handler registry (credentials-aware)
      const skillResult = await executeSkillHandler(toolCall.function.name, args, {
        db: ctx.db,
        agentId: ctx.agentId,
        teamId: ctx.teamId,
      })
      if (skillResult !== null) return skillResult
      return `Skill tool '${toolCall.function.name}' is installed but no handler is registered for it.`
    }
  }
}


export interface RunResult {
  response: string | null
  iterations: number
  toolCalls: Array<{ name: string; result: string }>
}

/**
 * Build the system prompt for an agent with chain-of-thought baked in.
 * The CoT instructions ensure agents reason before every action, leading
 * to better prioritization, fewer mistakes, and more thoughtful responses.
 */
export function buildAgentSystemPrompt(agentName: string, customPrompt?: string | null): string {
  const identity = customPrompt?.trim()
    ? customPrompt.trim()
    : `You are ${agentName}, a proactive AI agent.`

  return `${identity}

## How you work

You are part of a team managed through YokeBot. You have access to tasks, goals, messages, a shared workspace, data tables, and various skills/tools.

## Chain of Thought — MANDATORY

Before EVERY action you take, you MUST use the "think" tool to reason through your approach. Never call a tool (other than "think") without thinking first. Your thinking should follow this pattern:

1. **ASSESS** — What is the current situation? What tasks, messages, or goals need attention?
2. **PRIORITIZE** — What is most urgent or important right now? Consider deadlines, priority levels, and dependencies.
3. **PLAN** — What specific action will I take next, and why? What is the expected outcome?

After executing an action, use "think" again to reflect:
4. **REFLECT** — Did the action succeed? What should I do next?

This applies to ALL actions: responding to messages, updating tasks, searching the web, writing files, generating media, requesting approvals — everything.

## Guidelines

- Be concise and professional in all communications.
- When you have multiple tasks, work on the highest-priority one first.
- If a task is blocked or unclear, ask for clarification via the respond tool.
- If an action could have significant consequences, use request_approval to get human sign-off first.
- When collaborating with other agents via channels, be specific about what you need from them.
- If there is nothing meaningful to do, respond with "[no-op]" — do not take actions just to appear busy.

`
}

/**
 * Run the ReAct loop for an agent processing a user message.
 *
 * 1. Load conversation history
 * 2. Add the new user message
 * 3. Loop: call model → if tool calls, execute them → feed results back
 * 4. When model responds with text (no tool calls), return the response
 */
export async function runReactLoop(
  db: Db,
  agentId: string,
  teamId: string,
  userMessage: string,
  modelConfig: ModelConfig,
  systemPrompt: string,
  workspaceConfig: WorkspaceConfig,
  skillsDir: string,
  config: RuntimeConfig = DEFAULT_RUNTIME_CONFIG,
  logicalModelId?: string,
): Promise<RunResult> {
  // Save the user message
  await addMessage(db, agentId, 'user', userMessage, teamId)

  // Build the message history
  const history = await getMessages(db, agentId, 50)
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({
      role: m.role as ChatMessage['role'],
      content: m.content,
    })),
  ]

  // Merge builtin tools with installed skill tools + MCP tools
  const installedSkills = (await getAgentSkills(db, agentId)).map((s) => s.skillName)
  const skillTools = getSkillTools(skillsDir, installedSkills)
  const mcpTools = await loadMcpTools(db, agentId)
  const tools = [...getBuiltinTools(), ...skillTools, ...mcpTools]
  const toolCtx: ToolContext = { db, agentId, teamId, workspaceConfig, skillsDir, skipCredits: config.skipCredits }
  const toolCallLog: Array<{ name: string; result: string }> = []
  let response: string | null = null

  for (let i = 0; i < config.maxIterations; i++) {
    // Deduct LLM credits before each ReAct iteration (hosted mode only, skip for free agents like AdvisorBot)
    if (HOSTED_MODE && logicalModelId && !config.skipCredits) {
      const llmCost = await getModelCreditCost(db, logicalModelId)
      if (llmCost > 0) {
        const { success, balance } = await deductCredits(db, teamId, llmCost, 'heartbeat_debit',
          `LLM: ${logicalModelId} (iteration ${i + 1})`)
        if (!success) {
          response = `Insufficient credits. ${logicalModelId} costs ${llmCost} credits per iteration but your team has ${balance}. Purchase more credits in Settings → Billing.`
          break
        }
      }
    }

    const completion = await chatCompletionWithFallback(modelConfig, messages, tools)

    // If the model returned tool calls, execute them
    if (completion.tool_calls.length > 0) {
      // Add assistant message with tool calls
      messages.push({
        role: 'assistant',
        content: completion.content ?? '',
        tool_calls: completion.tool_calls,
      })

      for (const toolCall of completion.tool_calls) {
        // Timeout tool execution at 30 seconds to prevent hung tools from blocking the loop
        let result: string
        try {
          result = await Promise.race([
            executeToolCall(toolCall, toolCtx),
            new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Tool execution timed out')), 30_000)),
          ])
        } catch (err) {
          result = `Error: ${err instanceof Error ? err.message : 'Tool execution failed'}`
        }
        toolCallLog.push({ name: toolCall.function.name, result })

        // Log tool execution to activity log (skip 'think' — too noisy)
        if (toolCall.function.name !== 'think') {
          await logActivity(db, 'tool_executed', agentId, `${toolCall.function.name}: ${result.slice(0, 200)}`, {
            tool: toolCall.function.name,
            resultPreview: result.slice(0, 500),
          })
        }

        // If this is a "respond" call, capture the response
        if (toolCall.function.name === 'respond') {
          const args = JSON.parse(toolCall.function.arguments) as { message: string }
          response = args.message
        }

        // Feed the tool result back to the model
        messages.push({
          role: 'tool',
          content: result,
          tool_call_id: toolCall.id,
        })
      }

      // If agent responded, we're done
      if (response !== null) {
        await addMessage(db, agentId, 'assistant', response, teamId)
        return { response, iterations: i + 1, toolCalls: toolCallLog }
      }

      // Otherwise continue the loop (agent thought but didn't respond yet)
      continue
    }

    // No tool calls — model gave a direct text response
    if (completion.content) {
      response = completion.content
      await addMessage(db, agentId, 'assistant', response, teamId)
      return { response, iterations: i + 1, toolCalls: toolCallLog }
    }

    // Empty response — shouldn't happen, but break to be safe
    break
  }

  // If we hit max iterations without a response
  const fallback = response ?? 'I was unable to complete the task within the iteration limit.'
  await addMessage(db, agentId, 'assistant', fallback, teamId)
  return { response: fallback, iterations: config.maxIterations, toolCalls: toolCallLog }
}

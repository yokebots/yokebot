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
import { listSorTables, listSorRows, updateSorRow, getSorTableByName } from './sor.ts'
import { getAgentSkills, getSkillTools } from './skills.ts'
import { logActivity } from './activity.ts'

export interface RuntimeConfig {
  maxIterations: number  // safety limit to prevent infinite loops
}

const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  maxIterations: 10,
}

/** Context passed to tool execution so tools can access DB / workspace. */
export interface ToolContext {
  db: Db
  agentId: string
  teamId: string
  workspaceConfig: WorkspaceConfig
  skillsDir: string
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
 */
function getBuiltinTools(): ToolDef[] {
  return [
    toolDef('think', 'Think through a problem step by step before acting.', {
      thought: { type: 'string', description: 'Your step-by-step reasoning' },
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
      const result = writeFile(ctx.workspaceConfig, args.path as string, args.content as string, ctx.agentId)
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
      const updates: Record<string, unknown> = {}
      if (args.status) updates.status = args.status
      if (args.priority) updates.priority = args.priority
      if (args.description) updates.description = args.description
      const task = await updateTask(ctx.db, args.taskId as string, updates)
      if (!task) return `Task not found: ${args.taskId as string}`
      return `Task updated: "${task.title}" (status: ${task.status}, priority: ${task.priority})`
    }

    case 'list_tasks': {
      const filters: Record<string, unknown> = {}
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
      const table = await getSorTableByName(ctx.db, args.tableName as string)
      if (!table) return `Table not found: "${args.tableName as string}"`
      const rows = await listSorRows(ctx.db, table.id)
      if (rows.length === 0) return `Table "${table.name}" has no rows.`
      return JSON.stringify(rows, null, 2)
    }

    case 'update_source_of_record': {
      const table = await getSorTableByName(ctx.db, args.tableName as string)
      if (!table) return `Table not found: "${args.tableName as string}"`
      const row = await updateSorRow(ctx.db, args.rowId as string, args.data as Record<string, unknown>)
      if (!row) return `Row not found: ${args.rowId as string}`
      return `Row updated: ${JSON.stringify(row.data)}`
    }

    default: {
      // Try skill tool handlers (web_search, slack_send_message, etc.)
      const skillResult = await executeSkillToolCall(toolCall, args)
      if (skillResult !== null) return skillResult
      return `Skill tool '${toolCall.function.name}' is installed but its handler requires external configuration.`
    }
  }
}

/**
 * Execute a skill tool call that has a built-in handler (e.g. web_search with Brave API).
 * Returns null if no handler is available, meaning the default message should be used.
 */
async function executeSkillToolCall(toolCall: ToolCall, args: Record<string, unknown>): Promise<string | null> {
  if (toolCall.function.name === 'web_search') {
    const apiKey = process.env.BRAVE_API_KEY
    if (!apiKey) return 'Web search requires BRAVE_API_KEY to be configured. Ask an admin to set it up.'
    const query = encodeURIComponent(args.query as string)
    const count = Math.min((args.count as number) ?? 5, 20)
    try {
      const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${query}&count=${count}`, {
        headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': apiKey },
      })
      if (!res.ok) return `Search failed: ${res.status} ${res.statusText}`
      const data = await res.json() as { web?: { results?: Array<{ title: string; url: string; description: string }> } }
      const results = data.web?.results ?? []
      if (results.length === 0) return 'No results found.'
      return results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.description}`).join('\n\n')
    } catch (err) {
      return `Search error: ${err instanceof Error ? err.message : 'Unknown error'}`
    }
  }

  if (toolCall.function.name === 'slack_send_message') {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL
    if (!webhookUrl) return 'Slack notifications require SLACK_WEBHOOK_URL to be configured.'
    try {
      const payload: Record<string, unknown> = { text: args.text as string }
      if (args.username) payload.username = args.username
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) return `Slack error: ${res.status} ${res.statusText}`
      return 'Message sent to Slack successfully.'
    } catch (err) {
      return `Slack error: ${err instanceof Error ? err.message : 'Unknown error'}`
    }
  }

  return null // No built-in handler for this skill tool
}

export interface RunResult {
  response: string | null
  iterations: number
  toolCalls: Array<{ name: string; result: string }>
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

  // Merge builtin tools with installed skill tools
  const installedSkills = (await getAgentSkills(db, agentId)).map((s) => s.skillName)
  const skillTools = getSkillTools(skillsDir, installedSkills)
  const tools = [...getBuiltinTools(), ...skillTools]
  const toolCtx: ToolContext = { db, agentId, teamId, workspaceConfig, skillsDir }
  const toolCallLog: Array<{ name: string; result: string }> = []
  let response: string | null = null

  for (let i = 0; i < config.maxIterations; i++) {
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
        const result = await executeToolCall(toolCall, toolCtx)
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

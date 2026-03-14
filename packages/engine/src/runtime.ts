/**
 * runtime.ts — ReAct loop: the core reasoning cycle
 *
 * Receive message → Think → Act → Observe → Repeat
 *
 * The ReAct (Reasoning + Acting) loop is how agents process work.
 * On each cycle the agent: reads its messages, thinks about what
 * to do, optionally calls tools, observes the results, and responds.
 */

import crypto from 'node:crypto'
import type { Db } from './db/types.ts'
import { chatCompletionWithFallback, type ChatMessage, type ToolDef, type ToolCall, type ModelConfig, type CompletionResponse } from './model.ts'
import { getMessages, addMessage, getAgent } from './agent.ts'
import { listFiles, readFile, writeFile, renameFile, deleteFile } from './workspace.ts'
import { createTask, listTasks, updateTask } from './tasks.ts'
import { applyTagsByName } from './tags.ts'
import { getDmChannel, sendMessage, getTaskThread, getChannel, listChannels, createChannel, broadcastAgentProgress, type AgentProgressEvent } from './chat.ts'
import { createApproval, getApproval } from './approval.ts'
import { sendMessage as sendChatMsg, getTeamChannel } from './chat.ts'
import { listSorTables, listSorRows, addSorRow, updateSorRow, getSorTableByName, checkSorPermission, createSorTable, addSorColumn, setSorPermission, importCsvAsTable } from './sor.ts'
import { getAgentSkills, getSkillTools, loadSkillsFromDir, installSkill } from './skills.ts'
import { executeSkillHandler } from './skill-handlers.ts'
import { executeBrowserTool, isBrowserTool } from './browser.ts'
import { loadMcpTools, callMcpTool, isMcpTool } from './mcp-client.ts'
import { logActivity } from './activity.ts'
import { falGenerate } from './fal.ts'
import { getLogicalModel } from './model.ts'
import { downloadAndSave, guessMimeType } from './media.ts'
import type { ChatAttachment } from './chat.ts'
import { deductCredits, getModelCreditCost, getSkillCreditCost } from './billing.ts'
import { getTeamMembers } from './teams.ts'

const HOSTED_MODE = process.env.YOKEBOT_HOSTED_MODE === 'true'

// ---- Token Estimation (lightweight, no tokenizer dependency) ----
const CHARS_PER_TOKEN = 4

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

function estimateMessagesTokens(messages: ChatMessage[]): number {
  let total = 0
  for (const msg of messages) {
    total += estimateTokens(msg.content ?? '') + 4 // 4 tokens overhead per message
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) total += estimateTokens(tc.function.name + tc.function.arguments)
    }
  }
  return total
}

function estimateToolsTokens(tools: ToolDef[]): number {
  let total = 0
  for (const t of tools) {
    total += estimateTokens(t.function.name + t.function.description + JSON.stringify(t.function.parameters))
  }
  return total
}

/**
 * Trim messages to fit within token budget.
 * Always keeps the system message (index 0) and the last `keepLast` messages.
 * Drops oldest history messages first.
 */
function trimMessagesToFit(messages: ChatMessage[], maxTokens: number, toolsTokens: number, keepLast = 5): ChatMessage[] {
  const totalTokens = estimateMessagesTokens(messages) + toolsTokens
  if (totalTokens <= maxTokens) return messages

  const systemMsg = messages[0]
  const rest = messages.slice(1)
  const tail = rest.slice(-keepLast)
  let middle = rest.slice(0, -keepLast)

  let currentTokens = estimateMessagesTokens([systemMsg, ...middle, ...tail]) + toolsTokens

  while (currentTokens > maxTokens && middle.length > 0) {
    middle.shift()
    currentTokens = estimateMessagesTokens([systemMsg, ...middle, ...tail]) + toolsTokens
  }

  const dropped = rest.length - keepLast - middle.length
  if (dropped > 0) {
    console.log(`[runtime] Context trimmed: dropped ${dropped} messages (was ${totalTokens} tokens, budget ${maxTokens})`)
  }

  return [systemMsg, ...middle, ...tail]
}

// ---- Observation Masking ----
// Keep only the last N tool results in full; replace older ones with one-line summaries.
// Research shows this is 52% cheaper AND improves agent performance.
const OBSERVATION_WINDOW = 10
const MASK_SKIP_TOOLS = new Set(['think', 'respond', 'update_task', 'update_scratchpad'])

function maskOldObservations(messages: ChatMessage[]): ChatMessage[] {
  const toolIndices: number[] = []
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'tool') toolIndices.push(i)
  }
  if (toolIndices.length <= OBSERVATION_WINDOW) return messages

  const toMask = toolIndices.slice(0, -OBSERVATION_WINDOW)
  const result = [...messages]
  for (const idx of toMask) {
    const msg = result[idx]
    const content = msg.content ?? ''
    // Find tool name from preceding assistant message
    let toolName = 'tool'
    for (let j = idx - 1; j >= 0; j--) {
      if (result[j].role === 'assistant' && result[j].tool_calls) {
        const match = result[j].tool_calls!.find(tc => tc.id === msg.tool_call_id)
        if (match) { toolName = match.function.name; break }
      }
    }
    if (MASK_SKIP_TOOLS.has(toolName)) continue
    const preview = content.replace(/\n/g, ' ').slice(0, 100)
    result[idx] = { ...msg, content: `[Previous: ${toolName} — ${preview}${content.length > 100 ? '...' : ''}]` }
  }
  return result
}

// ---- Tool Result Offloading ----
// When a tool returns >2KB, save to workspace file and return a reference + preview.
const OFFLOAD_THRESHOLD = 2000
const OFFLOAD_SKIP = new Set([
  'think', 'respond', 'update_task', 'update_scratchpad', 'send_chat_message',
  // Read-only tools — never create files as side-effects of reads
  'read_workspace_file', 'list_workspace_files', 'list_tasks', 'query_source_of_record',
  'search_knowledge_base', 'list_workflows', 'list_available_skills', 'list_team_members',
  'browser_snapshot',
])

async function maybeOffloadResult(result: string, toolName: string, ctx: ToolContext): Promise<string> {
  if (result.length <= OFFLOAD_THRESHOLD) return result
  if (OFFLOAD_SKIP.has(toolName)) return result
  if (result.startsWith('Error:') || result.startsWith('⚠️')) return result

  const filePath = `tool-results/${toolName}_${Date.now()}.txt`
  try {
    const wr = await writeFile(ctx.db, ctx.teamId, filePath, result, ctx.agentId, ctx.currentTaskId)
    if (!wr.success) return result
  } catch {
    return result // write failed — fall back to full result
  }

  const preview = result.slice(0, 500)
  return `Result saved to workspace: ${filePath} (${result.length} chars)\n\nPreview:\n${preview}\n...\n\nUse read_workspace_file to see full result.`
}

/**
 * If the model returned raw JSON structured output instead of a human-readable message,
 * try to extract the human-facing text. Common patterns:
 *   {"thought": "...", "tasks": [...]}
 *   {"response": "...", "tool_calls": [...]}
 *   {"message": "..."}
 */
function extractHumanMessage(content: string): string {
  const trimmed = content.trim()
  if (!trimmed.startsWith('{')) return content

  try {
    const parsed = JSON.parse(trimmed)
    if (typeof parsed !== 'object' || parsed === null) return content

    // Look for a human-facing text field
    const textField = parsed.response ?? parsed.message ?? parsed.output ?? parsed.result ?? parsed.reply
    if (typeof textField === 'string' && textField.trim().length > 0) {
      return textField.trim()
    }

    // If there's a "thought" field but also tool/function calls, it's an internal reasoning dump
    if (parsed.thought && (parsed.tasks || parsed.tool_calls || parsed.function)) {
      // Suppress the raw dump — return a no-op so it doesn't pollute chat
      console.log('[runtime] Suppressing raw JSON tool-call dump from model output')
      return 'no-op'
    }

    // If there's only a "thought" field with no tools, treat it as a think-aloud (OK to post)
    if (parsed.thought && typeof parsed.thought === 'string' && Object.keys(parsed).length <= 2) {
      return parsed.thought.trim()
    }
  } catch {
    // Not valid JSON — return as-is
  }

  return content
}

export type ToolCategory = 'core' | 'workspace' | 'tasks' | 'chat' | 'approvals' | 'data' | 'media' | 'browser' | 'workflows' | 'team' | 'skills'

const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  think: 'core',
  respond: 'core',
  read_workspace_file: 'workspace',
  write_workspace_file: 'workspace',
  list_workspace_files: 'workspace',
  rename_workspace_file: 'workspace',
  move_workspace_file: 'workspace',
  delete_workspace_file: 'workspace',
  search_knowledge_base: 'workspace',
  remember: 'workspace',
  create_task: 'tasks',
  update_task: 'tasks',
  delete_task: 'tasks',
  add_subtask: 'tasks',
  list_tasks: 'tasks',
  update_scratchpad: 'tasks',
  send_chat_message: 'chat',
  request_approval: 'approvals',
  create_source_of_record: 'data',
  query_source_of_record: 'data',
  add_source_of_record_row: 'data',
  update_source_of_record: 'data',
  generate_image: 'media',
  edit_image: 'media',
  generate_video: 'media',
  render_video: 'media',
  generate_3d: 'media',
  create_workflow: 'workflows',
  start_workflow: 'workflows',
  list_workflows: 'workflows',
  list_team_members: 'team',
  list_available_skills: 'skills',
  install_skill: 'skills',
  use_saved_login: 'browser',
  vault_report_session_expired: 'browser',
  browser_navigate: 'browser',
  browser_snapshot: 'browser',
  browser_click: 'browser',
  browser_type: 'browser',
  browser_select_option: 'browser',
  browser_press_key: 'browser',
  browser_screenshot: 'browser',
  browser_start_recording: 'browser',
  browser_stop_recording: 'browser',
  browser_close: 'browser',
  browser_ask_human: 'browser',
  browser_fill_form: 'browser',
  browser_download_file: 'browser',
}

export const ALL_CATEGORIES: ToolCategory[] = ['core', 'workspace', 'tasks', 'chat', 'approvals', 'data', 'media', 'browser', 'workflows', 'team', 'skills']

export function getFilteredBuiltinTools(categories: ToolCategory[]): ToolDef[] {
  return getBuiltinTools().filter(tool => {
    const cat = TOOL_CATEGORIES[tool.function.name]
    return !cat || categories.includes(cat)
  })
}

export interface RuntimeConfig {
  maxIterations: number  // safety limit to prevent infinite loops
  skipCredits?: boolean  // bypass credit deduction (e.g. AdvisorBot is free)
  taskFocused?: boolean  // enables task-loop exit conditions
  currentTaskId?: string // for logging
  onFileWritten?: (teamId: string, path: string) => void // SSE broadcast callback
  extraToolCategories?: ToolCategory[] // task-context category boosts
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
  skillsDir: string
  skipCredits?: boolean
  currentTaskId?: string
  /** Mutable tools array — install_skill pushes new tools into the live session */
  tools?: ToolDef[]
  onFileWritten?: (teamId: string, path: string) => void
}

/** Human-readable labels for common tools */
const TOOL_LABELS: Record<string, string> = {
  think: 'Thinking',
  respond: 'Composing response',
  web_search: 'Searching the web',
  install_skill: 'Installing skill',
  use_saved_login: 'Loading saved login',
  vault_report_session_expired: 'Reporting expired session',
  list_available_skills: 'Checking available skills',
  generate_image: 'Generating image',
  edit_image: 'Editing image',
  generate_video: 'Generating video',
  generate_3d: 'Generating 3D model',
  render_video: 'Rendering video',
  write_workspace_file: 'Writing file',
  read_workspace_file: 'Reading file',
  list_workspace_files: 'Browsing files',
  create_task: 'Creating task',
  update_task: 'Updating task',
  list_tasks: 'Reviewing tasks',
  send_chat_message: 'Sending message',
  browser_navigate: 'Browsing web',
  browser_click: 'Interacting with page',
  browser_type: 'Typing on page',
  browser_snapshot: 'Taking screenshot',
  browser_ask_human: 'Asking human for input',
  browser_fill_form: 'Filling form',
  browser_download_file: 'Downloading file',
  query_source_of_record: 'Querying data',
  update_source_of_record: 'Updating data',
  send_email: 'Sending email',
  slack_notify: 'Posting to Slack',
  transcribe_audio: 'Transcribing audio',
  summarize_video: 'Summarizing video',
  generate_captions: 'Generating captions',
  search_properties: 'Searching properties',
  search_companies: 'Researching companies',
}

function getToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? toolName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
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

    toolDef('rename_workspace_file', 'Rename a file or directory in the workspace.', {
      oldPath: { type: 'string', description: 'Current file/directory path relative to workspace root' },
      newPath: { type: 'string', description: 'New file/directory path relative to workspace root' },
    }, ['oldPath', 'newPath']),

    toolDef('move_workspace_file', 'Move a file to a different folder in the workspace.', {
      filePath: { type: 'string', description: 'Current file path relative to workspace root' },
      destinationFolder: { type: 'string', description: 'Destination folder path (e.g. "research/seo")' },
    }, ['filePath', 'destinationFolder']),

    toolDef('delete_workspace_file', 'Request deletion of a workspace file. Requires human approval — the file will NOT be deleted until a human approves.', {
      filePath: { type: 'string', description: 'File path relative to workspace root' },
      reason: { type: 'string', description: 'Why this file should be deleted' },
    }, ['filePath', 'reason']),

    // Tasks (Mission Control)
    toolDef('create_task', 'Create a new task in Mission Control.', {
      title: { type: 'string', description: 'Task title' },
      description: { type: 'string', description: 'Task description' },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Task priority' },
      status: { type: 'string', enum: ['backlog', 'todo', 'in_progress', 'review', 'done'], description: 'Initial status (defaults to backlog)' },
      assignedAgentId: { type: 'string', description: 'Agent ID to assign the task to (defaults to self). Use list_tasks to see other agents.' },
      assignedUserId: { type: 'string', description: 'Human team member user ID to assign the task to. Use list_team_members to look up IDs.' },
      deadline: { type: 'string', description: 'Deadline in ISO 8601 format (e.g. 2026-03-15). Default to TODAY unless the user specifies a later date or there are many active tasks ahead of this one.' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Tag names to apply (e.g. ["VIP", "follow-up"]). Tags are auto-created if they don\'t exist.' },
    }, ['title']),

    toolDef('update_task', 'Update an existing task. Can change any field: status, priority, description, title, assigned agent/user, or deadline.', {
      taskId: { type: 'string', description: 'The task ID to update' },
      status: { type: 'string', enum: ['backlog', 'todo', 'in_progress', 'review', 'done'], description: 'New status' },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'New priority' },
      description: { type: 'string', description: 'Updated description' },
      title: { type: 'string', description: 'New title for the task' },
      assignedAgentId: { type: 'string', description: 'Agent ID to reassign the task to' },
      assignedUserId: { type: 'string', description: 'Human team member user ID to assign the task to. Use list_team_members to look up IDs.' },
      deadline: { type: 'string', description: 'New deadline in ISO 8601 format (e.g. 2026-03-15)' },
      estimatedCredits: { type: 'number', description: 'Estimated total credits this task will cost to complete' },
    }, ['taskId']),

    toolDef('delete_task', 'Request deletion of a task. Requires human approval — the task will NOT be deleted until a human approves.', {
      taskId: { type: 'string', description: 'The task ID to delete' },
      reason: { type: 'string', description: 'Why this task should be deleted' },
    }, ['taskId', 'reason']),

    toolDef('add_subtask', 'Add a subtask to an existing task.', {
      parentTaskId: { type: 'string', description: 'The parent task ID' },
      title: { type: 'string', description: 'Subtask title' },
    }, ['parentTaskId', 'title']),

    toolDef('list_tasks', 'Query tasks from Mission Control.', {
      status: { type: 'string', enum: ['backlog', 'todo', 'in_progress', 'review', 'done'], description: 'Filter by status' },
      agentId: { type: 'string', description: 'Filter by assigned agent ID' },
    }, []),

    toolDef('update_scratchpad', 'Save notes about your current task for your next sprint. Use this to record: what you tried, what worked/failed, what to do next, key findings. This persists between sprints so you don\'t lose context. Max 8000 characters.', {
      notes: { type: 'string', description: 'Your scratchpad notes — what you learned, what failed, next steps' },
    }, ['notes']),

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
    toolDef('create_source_of_record', 'Create a new Source of Record data table with columns. Use this instead of CSV files when you need structured, queryable data.', {
      tableName: { type: 'string', description: 'Name for the new table (e.g. "Leads", "Inventory", "Contacts")' },
      columns: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, type: { type: 'string', enum: ['text', 'number', 'date', 'boolean'] } }, required: ['name'] }, description: 'Column definitions — each needs a name, type defaults to text' },
    }, ['tableName', 'columns']),

    toolDef('query_source_of_record', 'Read rows from a Source of Record data table.', {
      tableName: { type: 'string', description: 'The table name to query' },
    }, ['tableName']),

    toolDef('add_source_of_record_row', 'Add a new row to a Source of Record data table.', {
      tableName: { type: 'string', description: 'The table name to add the row to' },
      data: { type: 'object', description: 'Key-value pairs for the new row (keys should match table column names)' },
    }, ['tableName', 'data']),

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
    toolDef('generate_image', 'Generate an image using AI. Returns the URL of the generated image. Supports style reference images — when image_urls are provided, the model uses its edit endpoint to generate a new image that matches the style/content of the references. IMPORTANT: You MUST confirm the model choice with the human before generating, unless they already specified one.', {
      prompt: { type: 'string', description: 'Text description of the image to generate' },
      modelId: { type: 'string', description: 'Image model to use. Options (cheapest first): "flux-2-klein" (50 credits, fast/cheap), "nano-banana-2" (100 credits, excellent text rendering, fast), "qwen-image-2.0" (150 credits, good quality + text), "seedream-4.5" (175 credits, solid mid-tier), "flux-2-dev" (50 credits, LoRA support), "seedream-5.0-lite" (150 credits, web search), "nano-banana-pro" (200 credits, premium 4K). NO DEFAULT — you must choose or ask the human.' },
      image_urls: { type: 'array', description: 'Optional array of up to 6 image URLs to use as style references. When provided, the model generates a new image matching the style/content of these references. Uses the model\'s edit endpoint (e.g. nano-banana-2/edit).', items: { type: 'string' } },
      aspect_ratio: { type: 'string', description: 'Aspect ratio for the generated image. Options: "1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "9:21". Default: "1:1".' },
    }, ['prompt', 'modelId']),

    toolDef('edit_image', 'Edit an existing image using AI instruction-based editing. Use for: text correction, style transfer, object removal/addition, color changes. Default model: firered-image-edit (150 credits).', {
      prompt: { type: 'string', description: 'Editing instruction — what to change about the image (e.g. "Change the headline text to Say Hello", "Remove the background", "Make it warmer tones")' },
      image_urls: { type: 'array', description: 'Array of image URLs to edit (typically 1 source image)', items: { type: 'string' } },
      modelId: { type: 'string', description: 'Image editing model. Options: "firered-image-edit" (150 credits, instruction-based editing). Default: firered-image-edit.' },
    }, ['prompt', 'image_urls']),

    toolDef('generate_video', 'Generate a SHORT AI video clip from a text prompt using AI models (Wan, Kling). For programmatic/animated videos with code, use render_video instead. IMPORTANT: You MUST confirm the model choice with the human before generating, unless they already specified one. Supports image-to-video with imageUrl for frame continuation.', {
      prompt: { type: 'string', description: 'Text description of the video to generate' },
      modelId: { type: 'string', description: 'Video model to use. Options: "wan-2.6" (3000 credits, budget), "kling-3.0" (3000 credits, high-fidelity). NO DEFAULT — you must choose or ask the human.' },
      imageUrl: { type: 'string', description: 'Optional start frame image URL for image-to-video mode. Enables frame continuation for seamless multi-clip sequences.' },
      endImageUrl: { type: 'string', description: 'Optional end frame image URL for steering the video toward a target frame (Kling 3.0 only).' },
      duration: { type: 'number', description: 'Requested duration in seconds (default 5). Model-dependent max.' },
    }, ['prompt', 'modelId']),

    toolDef('render_video', 'Render a programmatic animated video from a JSON scene description. 50 credits. Each scene has a duration, background, and elements (text, rect, circle, image) with animations (fadeIn, slideUp, typewriter, scaleIn, etc.). Use this for: promo videos, explainers, motion graphics, branded content. MUCH CHEAPER than generate_video.', {
      scenes: {
        type: 'array',
        description: `Array of scene objects. Each scene: { duration: seconds, background: "#hex", backgroundGradient?: { type: "linear"|"radial", angle?: degrees, stops: [[0,"#color"],[1,"#color"]] }, transition?: "fade"|"none", transitionDuration?: seconds, elements: [{ type: "text"|"rect"|"circle"|"image", x: 0-1 (fraction) or pixels, y: 0-1 or pixels, text?: "string", fontSize?: number, fontWeight?: "bold"|"normal", color?: "#hex", textAlign?: "center"|"left"|"right", maxWidth?: number, fill?: "#hex", stroke?: "#hex", cornerRadius?: number, radius?: number (circle), width?: number, height?: number, src?: "url" (image), opacity?: 0-1, animation?: { type: "fadeIn"|"fadeOut"|"slideUp"|"slideDown"|"slideLeft"|"slideRight"|"scaleIn"|"typewriter"|"pulse"|"none", delay?: seconds, duration?: seconds, easing?: "easeOut"|"easeIn"|"easeInOut"|"bounce"|"linear" } }] }`,
        items: { type: 'object' },
      },
      width: { type: 'number', description: 'Video width in pixels (default: 1280)' },
      height: { type: 'number', description: 'Video height in pixels (default: 720)' },
      fps: { type: 'number', description: 'Frames per second (default: 30)' },
    }, ['scenes']),

    toolDef('generate_3d', 'Generate a 3D model from an image. Returns the URL of the .glb file. IMPORTANT: You MUST confirm the model choice with the human before generating, unless they already specified one.', {
      imageUrl: { type: 'string', description: 'URL of the input image to convert to 3D' },
      modelId: { type: 'string', description: '3D model to use. Options: "hunyuan-3d-v2.1" (1200 credits, budget), "hunyuan-3d-v3.1-pro" (2000 credits, high quality). NO DEFAULT — you must choose or ask the human.' },
    }, ['imageUrl', 'modelId']),

    // Workflows
    toolDef('create_workflow', 'Create a reusable multi-step workflow. Each step creates a task and can auto-proceed or require human approval.', {
      name: { type: 'string', description: 'Workflow name' },
      description: { type: 'string', description: 'What this workflow accomplishes' },
      steps: { type: 'array', description: 'Ordered list of steps', items: {
        type: 'object', properties: {
          title: { type: 'string', description: 'Step title' },
          description: { type: 'string', description: 'Step description' },
          assignedAgentId: { type: 'string', description: 'Agent ID to assign this step to' },
          gate: { type: 'string', enum: ['auto', 'approval'], description: 'auto = proceed automatically, approval = wait for human approval' },
        }, required: ['title'],
      }},
    }, ['name', 'steps']),

    toolDef('start_workflow', 'Start a workflow run. Creates tasks for each step and chains them together.', {
      workflowId: { type: 'string', description: 'The workflow ID to run' },
    }, ['workflowId']),

    toolDef('list_workflows', 'List available workflows for the current team.', {}, []),

    // Team
    toolDef('list_team_members', 'List human team members. Returns user IDs, emails, and roles. Use this to look up who to assign tasks to.', {}, []),

    // Skills self-install
    toolDef('list_available_skills', 'List all available skills with their install status. Use this to discover skills you can install to gain new capabilities.', {}, []),

    toolDef('install_skill', 'Install a skill to gain its tools and capabilities. The skill\'s tools become available on your next action cycle.', {
      skillName: { type: 'string', description: 'The name of the skill to install (from list_available_skills)' },
    }, ['skillName']),

    // Session Vault — authenticated browser sessions
    toolDef('use_saved_login', 'Load an authenticated browser session from the team\'s Session Vault. This lets you browse websites the team has logged into without needing credentials.', {
      domain: { type: 'string', description: 'Domain to load session for, e.g. "app.hubspot.com"' },
    }, ['domain']),

    toolDef('vault_report_session_expired', 'Report that a saved login session has expired (e.g. redirected to a login page). This notifies the team to re-record the session.', {
      domain: { type: 'string', description: 'Domain whose session has expired' },
      reason: { type: 'string', description: 'Why the session appears expired (e.g. "redirected to login page")' },
    }, ['domain', 'reason']),

    // Browser tools — executed via executeBrowserTool() side-channel, but must be
    // advertised here so the LLM knows they exist and can call them.
    toolDef('browser_navigate', 'Navigate to a URL in the browser.', {
      url: { type: 'string', description: 'The URL to navigate to' },
    }, ['url']),

    toolDef('browser_snapshot', 'Get the current page\'s accessibility tree (structured text representation of visible elements). Use this to see what\'s on the page.', {}, []),

    toolDef('browser_click', 'Click an element on the page by its accessibility ref (from browser_snapshot).', {
      ref: { type: 'string', description: 'Accessibility ref of the element to click (from snapshot)' },
    }, ['ref']),

    toolDef('browser_type', 'Type text into an input field identified by accessibility ref.', {
      ref: { type: 'string', description: 'Accessibility ref of the input element' },
      text: { type: 'string', description: 'Text to type' },
      submit: { type: 'boolean', description: 'Press Enter after typing (default: false)' },
    }, ['ref', 'text']),

    toolDef('browser_select_option', 'Select an option from a dropdown/select element.', {
      ref: { type: 'string', description: 'Accessibility ref of the select element' },
      value: { type: 'string', description: 'Value or label of the option to select' },
    }, ['ref', 'value']),

    toolDef('browser_press_key', 'Press a keyboard key (Enter, Tab, Escape, ArrowDown, etc.).', {
      key: { type: 'string', description: 'Key to press (e.g., \'Enter\', \'Tab\', \'Escape\', \'ArrowDown\')' },
    }, ['key']),

    toolDef('browser_screenshot', 'Take a screenshot of the current page. Optionally save to the knowledge base.', {
      saveTo: { type: 'string', description: 'Optional: knowledge base folder path to save the screenshot (e.g. \'screenshots/project-x\'). If omitted, returns base64 data only.' },
    }, []),

    toolDef('browser_start_recording', 'Start recording a visual screencast of browser actions. Each subsequent browser action will be captured as a screenshot. Call browser_stop_recording to save all frames.', {
      saveTo: { type: 'string', description: 'Knowledge base folder path to save the recording frames (e.g. \'recordings/demo\')' },
    }, ['saveTo']),

    toolDef('browser_stop_recording', 'Stop recording and save all captured frames to the knowledge base.', {}, []),

    toolDef('browser_close', 'Close the browser session and free resources.', {}, []),

    toolDef('browser_ask_human', 'Ask the human a question when you encounter ambiguity while browsing (e.g. which option to select, what info to enter, CAPTCHA help). The question will be sent to team chat with a screenshot for the human to review and respond. Your browser session stays open while waiting.', {
      question: { type: 'string', description: 'The question to ask the human' },
      options: { type: 'array', items: { type: 'string' }, description: 'Optional list of choices for the human to pick from' },
      context: { type: 'string', description: 'Brief context about what you were doing when you hit this ambiguity' },
    }, ['question']),

    toolDef('browser_fill_form', 'Fill multiple form fields at once. More efficient than clicking and typing each field individually.', {
      fields: { type: 'array', items: { type: 'object', properties: { selector: { type: 'string' }, value: { type: 'string' } } }, description: 'Array of { selector, value } pairs to fill' },
      submit: { type: 'boolean', description: 'If true, click the submit button after filling (default: false)' },
    }, ['fields']),

    toolDef('browser_download_file', 'Wait for and save a file download from the current page. Call this right before or after clicking a download link.', {
      description: { type: 'string', description: 'Brief description of the file being downloaded (e.g. "Q4 revenue report from Stripe")' },
    }, ['description']),

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
      const file = await readFile(ctx.db, ctx.teamId, args.path as string)
      if (!file) return `File not found: ${args.path as string}`
      return file.content
    }

    case 'write_workspace_file': {
      const content = args.content as string
      const filePath = args.path as string
      // Limit agent file writes to 100KB (API endpoint allows 1MB for human uploads)
      if (content.length > 100_000) return `Error: File content too large (${content.length} chars). Maximum is 100,000 characters for agent writes.`
      // CSV files auto-import as SOR data tables
      if (filePath.toLowerCase().endsWith('.csv')) {
        const tableName = filePath.split('/').pop()!.replace(/\.csv$/i, '')
        const tableId = await importCsvAsTable(ctx.db, ctx.teamId, tableName, content)
        if (!tableId) return `Error: Failed to parse CSV — check that it has a header row`
        return `CSV imported as data table "${tableName}" (id: ${tableId})`
      }
      const result = await writeFile(ctx.db, ctx.teamId, filePath, content, ctx.agentId, ctx.currentTaskId)
      if (result.success) {
        ctx.onFileWritten?.(ctx.teamId, filePath)
        await logActivity(ctx.db, 'file_written', ctx.agentId, `Wrote file: ${filePath}`, undefined, ctx.teamId)
      }
      return result.success ? `File written: ${filePath}` : `Error: ${result.error}`
    }

    case 'list_workspace_files': {
      const dir = (args.directory as string) ?? ''
      const files = await listFiles(ctx.db, ctx.teamId, dir)
      if (files.length === 0) return `No files found in "${dir || '/'}".`
      return files.map((f) => `${f.isDirectory ? '[dir] ' : ''}${f.path} (${f.size} bytes)`).join('\n')
    }

    case 'rename_workspace_file': {
      const oldPath = args.oldPath as string
      const newPath = args.newPath as string
      if (!oldPath || !newPath) return 'Error: Both oldPath and newPath are required.'
      const result = await renameFile(ctx.db, ctx.teamId, oldPath, newPath)
      if (result.success) await logActivity(ctx.db, 'file_renamed', ctx.agentId, `Renamed file: ${oldPath} → ${newPath}`, undefined, ctx.teamId)
      return result.success ? `Renamed: ${oldPath} → ${newPath}` : `Error: ${result.error}`
    }

    case 'move_workspace_file': {
      const filePath = args.filePath as string
      const destFolder = (args.destinationFolder as string).replace(/\/+$/, '')
      const fileName = filePath.split('/').pop() ?? filePath
      const newPath = destFolder ? `${destFolder}/${fileName}` : fileName
      const result = await renameFile(ctx.db, ctx.teamId, filePath, newPath)
      if (result.success) await logActivity(ctx.db, 'file_moved', ctx.agentId, `Moved file: ${filePath} → ${newPath}`, undefined, ctx.teamId)
      return result.success ? `Moved: ${filePath} → ${newPath}` : `Error: ${result.error}`
    }

    case 'delete_workspace_file': {
      const filePath = args.filePath as string
      const reason = args.reason as string
      // Route through approval — agent cannot delete directly
      const deleteApproval = await createApproval(
        ctx.db, ctx.teamId, ctx.agentId,
        'delete_file',
        `Delete file "${filePath}". Reason: ${reason}`,
        'high',
      )
      await logActivity(ctx.db, 'file_deleted', ctx.agentId, `Requested file deletion: ${filePath}`, undefined, ctx.teamId)
      return `Deletion request submitted for approval (approval id: ${deleteApproval.id}). File "${filePath}" will be deleted once a human approves.`
    }

    // ---- Tasks ----
    case 'create_task': {
      // Validate deadline is not in the past
      if (args.deadline) {
        const dl = new Date(args.deadline as string)
        const today = new Date(); today.setHours(0, 0, 0, 0)
        if (!isNaN(dl.getTime()) && dl < today) {
          return `Error: Deadline "${args.deadline}" is in the past. Today is ${today.toISOString().split('T')[0]}. Please set a future deadline.`
        }
      }
      // Validate assignedAgentId belongs to this team
      let targetAgentId = (args.assignedAgentId as string) ?? ctx.agentId
      if (targetAgentId && targetAgentId !== ctx.agentId) {
        const targetAgent = await getAgent(ctx.db, targetAgentId)
        if (!targetAgent || targetAgent.teamId !== ctx.teamId) {
          return `Error: Cannot assign to agent "${targetAgentId}" — not found or not on this team`
        }
      }
      const task = await createTask(ctx.db, ctx.teamId, args.title as string, {
        description: args.description as string | undefined,
        priority: (args.priority as 'low' | 'medium' | 'high' | 'urgent') ?? 'medium',
        status: (args.status as 'backlog' | 'todo' | 'in_progress' | 'review' | 'done') || undefined,
        assignedAgentId: targetAgentId,
        assignedUserId: args.assignedUserId as string | undefined,
        deadline: args.deadline as string | undefined,
      })
      // Apply tags if provided
      const tagNames = Array.isArray(args.tags) ? (args.tags as string[]).filter(Boolean) : []
      let appliedTags: string[] = []
      if (tagNames.length > 0) {
        const tags = await applyTagsByName(ctx.db, ctx.teamId, tagNames, 'task', task.id)
        appliedTags = tags.map((t) => t.name)
      }
      // Auto-create task thread and post initial summary
      try {
        const thread = await getTaskThread(ctx.db, task.id, ctx.teamId)
        const parts = [`**${task.title}**`]
        if (task.description) parts.push(task.description)
        parts.push(`Priority: ${task.priority}`)
        if (task.deadline) parts.push(`Deadline: ${task.deadline}`)
        if (appliedTags.length > 0) parts.push(`Tags: ${appliedTags.join(', ')}`)
        parts.push(`Status: ${task.status}`)
        await sendMessage(ctx.db, thread.id, 'agent', ctx.agentId, parts.join('\n'))
      } catch { /* thread creation is best-effort */ }
      await logActivity(ctx.db, 'task_created', ctx.agentId, `Created task: ${task.title}`, undefined, ctx.teamId)
      return `Task created: "${task.title}" (id: ${task.id}, priority: ${task.priority}${task.deadline ? `, deadline: ${task.deadline}` : ''}${appliedTags.length ? `, tags: ${appliedTags.join(', ')}` : ''})`
    }

    case 'update_task': {
      // Validate deadline is not in the past
      if (args.deadline) {
        const dl = new Date(args.deadline as string)
        const today = new Date(); today.setHours(0, 0, 0, 0)
        if (!isNaN(dl.getTime()) && dl < today) {
          return `Error: Deadline "${args.deadline}" is in the past. Today is ${today.toISOString().split('T')[0]}. Please set a future deadline.`
        }
      }
      // Verify task belongs to this agent's team before updating
      const existingTask = await listTasks(ctx.db, { teamId: ctx.teamId })
      const targetTask = existingTask.find((t) => t.id === (args.taskId as string))
      if (!targetTask) return `Task not found or access denied: ${args.taskId as string}`
      const updates: Record<string, unknown> = {}
      if (args.status) updates.status = args.status
      if (args.priority) updates.priority = args.priority
      if (args.description) updates.description = args.description
      if (args.title) updates.title = args.title
      if (args.assignedAgentId) {
        const targetAgent = await getAgent(ctx.db, args.assignedAgentId as string)
        if (!targetAgent || targetAgent.teamId !== ctx.teamId) {
          return `Error: Cannot assign to agent "${args.assignedAgentId}" — not found or not on this team`
        }
        updates.assignedAgentId = args.assignedAgentId
      }
      if (args.assignedUserId) updates.assignedUserId = args.assignedUserId
      if (args.deadline) updates.deadline = args.deadline
      if (args.estimatedCredits != null) updates.estimatedCredits = args.estimatedCredits as number
      const task = await updateTask(ctx.db, args.taskId as string, updates)
      if (!task) return `Task not found: ${args.taskId as string}`
      // Workflow step chaining: if task is done, advance linked workflow
      if (task.status === 'done') {
        try {
          const { onTaskCompleted } = await import('./workflow-executor.ts')
          await onTaskCompleted(ctx.db, task.id)
        } catch { /* best-effort */ }
      }
      await logActivity(ctx.db, 'task_updated', ctx.agentId, `Updated task: ${task.title}`, undefined, ctx.teamId)
      return `Task updated: "${task.title}" (status: ${task.status}, priority: ${task.priority}${task.deadline ? `, deadline: ${task.deadline}` : ''}${task.assignedAgentId ? `, assigned: ${task.assignedAgentId}` : ''})`
    }

    case 'delete_task': {
      // Verify task belongs to this agent's team
      const allTasks = await listTasks(ctx.db, { teamId: ctx.teamId })
      const taskToDelete = allTasks.find((t) => t.id === (args.taskId as string))
      if (!taskToDelete) return `Task not found or access denied: ${args.taskId as string}`
      // Route through approval — agent cannot delete directly
      const deleteApproval = await createApproval(
        ctx.db, ctx.teamId, ctx.agentId,
        'delete_task',
        `Delete task "${taskToDelete.title}" (id: ${taskToDelete.id}). Reason: ${args.reason as string}`,
        'high',
      )
      return `Deletion request submitted for approval (approval id: ${deleteApproval.id}). Task "${taskToDelete.title}" will be deleted once a human approves.`
    }

    case 'add_subtask': {
      // Verify parent task belongs to this agent's team
      const teamTasks = await listTasks(ctx.db, { teamId: ctx.teamId })
      const parentTask = teamTasks.find((t) => t.id === (args.parentTaskId as string))
      if (!parentTask) return `Parent task not found or access denied: ${args.parentTaskId as string}`
      const subtask = await createTask(ctx.db, ctx.teamId, args.title as string, {
        parentTaskId: args.parentTaskId as string,
        assignedAgentId: ctx.agentId,
      })
      return `Subtask created: "${subtask.title}" (id: ${subtask.id}) under parent "${parentTask.title}"`
    }

    case 'list_tasks': {
      // Always scope to own team
      const filters: Record<string, unknown> = { teamId: ctx.teamId }
      if (args.status) filters.status = args.status
      if (args.agentId) filters.agentId = args.agentId
      const tasks = await listTasks(ctx.db, filters as Parameters<typeof listTasks>[1])
      if (tasks.length === 0) return 'No tasks found.'
      // Resolve agent names for richer output
      const agentNameCache = new Map<string, string>()
      const lines: string[] = []
      for (const t of tasks) {
        let agentLabel = ''
        if (t.assignedAgentId) {
          if (!agentNameCache.has(t.assignedAgentId)) {
            const a = await getAgent(ctx.db, t.assignedAgentId)
            agentNameCache.set(t.assignedAgentId, a?.name ?? t.assignedAgentId)
          }
          agentLabel = `, agent: ${agentNameCache.get(t.assignedAgentId)}`
        }
        const deadlineLabel = t.deadline ? `, deadline: ${t.deadline}` : ''
        const updatedLabel = t.updatedAt ? `, updated: ${t.updatedAt}` : ''
        lines.push(`- [${t.status}] ${t.title} (${t.priority}, id: ${t.id}${agentLabel}${deadlineLabel}${updatedLabel})`)
      }
      return lines.join('\n')
    }

    case 'update_scratchpad': {
      const notes = (args.notes as string).slice(0, 8000)
      if (!ctx.currentTaskId) return 'Error: Not currently working on a task.'
      await updateTask(ctx.db, ctx.currentTaskId, { scratchpad: notes })
      return `Scratchpad updated (${notes.length} chars saved).`
    }

    // ---- Chat ----
    case 'send_chat_message': {
      let channelId = args.channelId as string
      const content = args.content as string

      // Filter out thinking dumps and internal reasoning that should never reach chat
      const isThinkingDump = content.includes('### ASSESS') || content.includes('### PRIORITIZE') || content.includes('### PLAN')
        || content.includes('"assessment"') || content.includes('"prioritization"')
      const isNoOp = content.trim() === 'no-op' || content.includes('[no-op]') || content.trim().length === 0
      if (isThinkingDump || isNoOp) {
        return 'Message suppressed — internal reasoning should not be posted to chat. Write a concise human-readable summary instead.'
      }

      const isDmRequest = channelId === 'dm'
      if (!isDmRequest) {
        const targetChannel = await getChannel(ctx.db, channelId)
        if (targetChannel?.type === 'dm') {
          // Trying to send to a DM channel by ID — treat same as 'dm'
        } else {
          // Valid non-DM channel — send normally
          const msg = await sendMessage(ctx.db, channelId, 'agent', ctx.agentId, content)
          await logActivity(ctx.db, 'message_sent', ctx.agentId, `Sent message to chat`, undefined, ctx.teamId)
          return `Message sent (id: ${msg.id})`
        }
      }
      // DM blocked — route to the best-matching group channel for this agent
      const agent = await getAgent(ctx.db, ctx.agentId)
      const channels = await listChannels(ctx.db, ctx.teamId)
      const groupChannels = channels.filter(c => c.type === 'group')
      let bestChannel = groupChannels.find(c => c.name === 'general')
      if (agent?.department && groupChannels.length > 0) {
        const dept = agent.department.toLowerCase()
        const exact = groupChannels.find(c => c.name === dept)
        const partial = groupChannels.find(c => c.name.includes(dept) || dept.includes(c.name))
        bestChannel = exact || partial || bestChannel
      }
      const fallback = bestChannel || groupChannels[0] || await createChannel(ctx.db, ctx.teamId, 'general', 'group')
      const msg = await sendMessage(ctx.db, fallback.id, 'agent', ctx.agentId, content)
      await logActivity(ctx.db, 'message_sent', ctx.agentId, `Sent message to ${fallback.name || 'chat'}`, undefined, ctx.teamId)
      return `Message sent to #${fallback.name} (id: ${msg.id}). Note: Direct messages are not allowed — use group channels or task threads instead.`
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
        ctx.currentTaskId,
      )
      return `Approval request created (id: ${approval.id}, status: pending). A human will review it.`
    }

    // ---- Source of Record ----
    case 'create_source_of_record': {
      const tableName = args.tableName as string
      // Check if table already exists
      const existing = await getSorTableByName(ctx.db, tableName, ctx.teamId)
      if (existing) return `Table "${tableName}" already exists. Use add_source_of_record_row to add data.`
      const newTable = await createSorTable(ctx.db, ctx.teamId, tableName)
      // Add columns
      const columns = args.columns as Array<{ name: string; type?: string }>
      for (const col of columns) {
        await addSorColumn(ctx.db, newTable.id, col.name, col.type ?? 'text')
      }
      // Grant the creating agent read+write permission
      await setSorPermission(ctx.db, ctx.agentId, newTable.id, true, true)
      await logActivity(ctx.db, 'table_created', ctx.agentId, `Created data table: ${tableName}`, undefined, ctx.teamId)
      return `Created data table "${tableName}" with ${columns.length} columns: ${columns.map(c => c.name).join(', ')}. You now have read/write access.`
    }

    case 'query_source_of_record': {
      // Team-scoped: only access own team's tables
      const table = await getSorTableByName(ctx.db, args.tableName as string, ctx.teamId)
      if (!table) return `Table not found: "${args.tableName as string}"`
      // Enforce per-agent read permission (deny by default — must have explicit canRead=true)
      const readPerm = await checkSorPermission(ctx.db, ctx.agentId, table.id)
      if (!readPerm || !readPerm.canRead) return `Access denied: you do not have read permission on table "${table.name}".`
      const rows = await listSorRows(ctx.db, table.id)
      if (rows.length === 0) return `Table "${table.name}" has no rows.`
      return JSON.stringify(rows, null, 2)
    }

    case 'add_source_of_record_row': {
      const table = await getSorTableByName(ctx.db, args.tableName as string, ctx.teamId)
      if (!table) return `Table not found: "${args.tableName as string}"`
      // Deny by default — must have explicit canWrite=true
      const addPerm = await checkSorPermission(ctx.db, ctx.agentId, table.id)
      if (!addPerm || !addPerm.canWrite) return `Access denied: you do not have write permission on table "${table.name}".`
      const newRow = await addSorRow(ctx.db, table.id, args.data as Record<string, unknown>)
      // Fire row_added workflows (best-effort, don't block agent)
      try {
        const { findWorkflowsByTableTrigger, startRun, listRuns } = await import('./workflows.ts')
        const { advanceWorkflow } = await import('./workflow-executor.ts')
        const triggered = await findWorkflowsByTableTrigger(ctx.db, ctx.teamId, table.id, 'row_added')
        for (const wf of triggered) {
          const active = await listRuns(ctx.db, { workflowId: wf.id, status: 'running' as const })
          if (active.length > 0) continue
          const run = await startRun(ctx.db, ctx.teamId, wf.id, 'table_trigger', { tableName: table.name, row: newRow.data, triggerType: 'row_added' })
          await advanceWorkflow(ctx.db, run.id)
        }
      } catch { /* best-effort */ }
      await logActivity(ctx.db, 'row_added', ctx.agentId, `Added row to table: ${table.name}`, undefined, ctx.teamId)
      return `Row added to "${table.name}" (id: ${newRow.id}): ${JSON.stringify(newRow.data)}`
    }

    case 'update_source_of_record': {
      // Team-scoped: only access own team's tables
      const table = await getSorTableByName(ctx.db, args.tableName as string, ctx.teamId)
      if (!table) return `Table not found: "${args.tableName as string}"`
      // Deny by default — must have explicit canWrite=true
      const writePerm = await checkSorPermission(ctx.db, ctx.agentId, table.id)
      if (!writePerm || !writePerm.canWrite) return `Access denied: you do not have write permission on table "${table.name}".`
      const row = await updateSorRow(ctx.db, args.rowId as string, args.data as Record<string, unknown>)
      if (!row) return `Row not found: ${args.rowId as string}`
      await logActivity(ctx.db, 'row_updated', ctx.agentId, `Updated row in table: ${table.name}`, undefined, ctx.teamId)
      return `Row updated: ${JSON.stringify(row.data)}`
    }

    // ---- Media Generation ----
    case 'generate_image': {
      const modelId = args.modelId as string
      if (!modelId) return 'Error: modelId is required. Ask the human which model to use. Options: flux-2-klein (50 credits), nano-banana-2 (100 credits, great text), qwen-image-2.0 (150 credits), seedream-4.5 (175 credits), flux-2-dev (50 credits), seedream-5.0-lite (150 credits), nano-banana-pro (200 credits, premium).'
      const logical = getLogicalModel(modelId)
      if (!logical || logical.type !== 'image') return `Unknown image model: ${modelId}`
      let falModelId = logical.backends[0]?.providerModelId
      if (!falModelId) return `No backend configured for model: ${modelId}`

      // When image_urls are provided, use the edit endpoint for style-referenced generation
      const imageUrls = args.image_urls as string[] | undefined
      if (imageUrls?.length) {
        falModelId = `${falModelId}/edit`
      }

      if (HOSTED_MODE) {
        const cost = await getModelCreditCost(ctx.db, modelId)
        const { success, balance } = await deductCredits(ctx.db, ctx.teamId, cost || 10, 'media_debit', `Image generation: ${(args.prompt as string).slice(0, 80)}`)
        if (!success) return `Insufficient credits. Image generation costs ${cost} credits but your team has ${balance}. Purchase more credits in Settings → Billing.`
      }
      try {
        const falInput: Record<string, unknown> = { prompt: args.prompt as string }
        if (imageUrls?.length) falInput.image_urls = imageUrls
        if (args.aspect_ratio) falInput.aspect_ratio = args.aspect_ratio as string
        const result = await falGenerate(ctx.db, falModelId, falInput)
        const image = result.images?.[0]
        if (!image) return 'Image generation completed but no image was returned.'

        // Download to workspace and post as chat attachment
        const ext = image.content_type?.split('/')?.[1] ?? 'png'
        const slug = (args.prompt as string).slice(0, 40).replace(/[^a-zA-Z0-9]/g, '_')
        const filename = `${slug}.${ext}`
        const workspacePath = await downloadAndSave(ctx.db, ctx.teamId, 'images', image.url, filename)
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

    case 'edit_image': {
      const modelId = (args.modelId as string) || 'firered-image-edit'
      const imageUrls = args.image_urls as string[]
      if (!imageUrls?.length) return 'Error: image_urls is required — provide at least one image URL to edit.'
      const logical = getLogicalModel(modelId)
      if (!logical || logical.type !== 'image') return `Unknown image model: ${modelId}`
      const falModelId = logical.backends[0]?.providerModelId
      if (!falModelId) return `No backend configured for model: ${modelId}`
      if (HOSTED_MODE) {
        const cost = await getModelCreditCost(ctx.db, modelId)
        const { success, balance } = await deductCredits(ctx.db, ctx.teamId, cost || 10, 'media_debit', `Image editing: ${(args.prompt as string).slice(0, 80)}`)
        if (!success) return `Insufficient credits. Image editing costs ${cost} credits but your team has ${balance}. Purchase more credits in Settings → Billing.`
      }
      try {
        const result = await falGenerate(ctx.db, falModelId, {
          prompt: args.prompt as string,
          image_urls: imageUrls,
        })
        const image = result.images?.[0]
        if (!image) return 'Image editing completed but no image was returned.'

        const ext = image.content_type?.split('/')?.[1] ?? 'png'
        const slug = (args.prompt as string).slice(0, 40).replace(/[^a-zA-Z0-9]/g, '_')
        const filename = `edited_${slug}.${ext}`
        const workspacePath = await downloadAndSave(ctx.db, ctx.teamId, 'images', image.url, filename)
        const attachment: ChatAttachment = {
          type: 'image', url: workspacePath, filename,
          mimeType: guessMimeType(filename), width: image.width, height: image.height,
        }
        const dmChannel = await getDmChannel(ctx.db, ctx.agentId, ctx.teamId)
        await sendMessage(ctx.db, dmChannel.id, 'agent', ctx.agentId, `Edited image: ${(args.prompt as string).slice(0, 80)}`, undefined, ctx.teamId, [attachment])
        await logActivity(ctx.db, 'media_generated', ctx.agentId, `Edited image: ${(args.prompt as string).slice(0, 80)}`, undefined, ctx.teamId)
        return JSON.stringify({ type: 'image', url: workspacePath, width: image.width, height: image.height })
      } catch (err) {
        return `Image editing failed: ${(err as Error).message}`
      }
    }

    case 'generate_video': {
      const modelId = args.modelId as string
      if (!modelId) return 'Error: modelId is required. Ask the human which model to use. Options: wan-2.6 (3000 credits, budget), kling-3.0 (3000 credits, high-fidelity).'
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
        const falInput: Record<string, unknown> = { prompt: args.prompt as string }
        if (args.imageUrl) falInput.image_url = args.imageUrl as string
        if (args.endImageUrl) falInput.end_image_url = args.endImageUrl as string
        if (args.duration) falInput.duration = args.duration as number
        const result = await falGenerate(ctx.db, falModelId, falInput)
        const video = result.video
        if (!video) return 'Video generation completed but no video was returned.'

        const ext = video.content_type?.split('/')?.[1] ?? 'mp4'
        const slug = (args.prompt as string).slice(0, 40).replace(/[^a-zA-Z0-9]/g, '_')
        const filename = `${slug}.${ext}`
        const workspacePath = await downloadAndSave(ctx.db, ctx.teamId, 'video', video.url, filename)
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
      const modelId = args.modelId as string
      if (!modelId) return 'Error: modelId is required. Ask the human which model to use. Options: hunyuan-3d-v2.1 (1200 credits, budget), hunyuan-3d-v3.1-pro (2000 credits, high quality).'
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
        const workspacePath = await downloadAndSave(ctx.db, ctx.teamId, '3d', mesh.url, filename)
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

    case 'create_workflow': {
      const { createWorkflow, addStep: addWfStep } = await import('./workflows.ts')
      const wf = await createWorkflow(ctx.db, ctx.teamId, args.name as string, {
        description: args.description as string | undefined,
        createdBy: `agent:${ctx.agentId}`,
      })
      const steps = args.steps as Array<{ title: string; description?: string; assignedAgentId?: string; gate?: string }> | undefined
      if (steps) {
        for (let i = 0; i < steps.length; i++) {
          const s = steps[i]
          await addWfStep(ctx.db, wf.id, s.title, {
            description: s.description,
            assignedAgentId: s.assignedAgentId,
            gate: (s.gate as 'auto' | 'approval') ?? 'auto',
            stepOrder: i,
          })
        }
      }
      return `Workflow created: "${wf.name}" (id: ${wf.id}) with ${steps?.length ?? 0} step(s)`
    }

    case 'start_workflow': {
      const { startRun } = await import('./workflows.ts')
      const { advanceWorkflow } = await import('./workflow-executor.ts')
      const run = await startRun(ctx.db, ctx.teamId, args.workflowId as string, `agent:${ctx.agentId}`)
      void advanceWorkflow(ctx.db, run.id).catch((err) => console.error('[workflows] advanceWorkflow error:', err))
      return `Workflow run started (run id: ${run.id}). Tasks will be created for each step.`
    }

    case 'list_workflows': {
      const { listWorkflows } = await import('./workflows.ts')
      const workflows = await listWorkflows(ctx.db, ctx.teamId)
      if (workflows.length === 0) return 'No workflows found for this team.'
      return workflows.map((w) => `- "${w.name}" (id: ${w.id}, status: ${w.status}, trigger: ${w.triggerType})`).join('\n')
    }

    // ---- Skills Self-Install ----
    case 'list_available_skills': {
      const allSkills = loadSkillsFromDir(ctx.skillsDir)
      const installed = (await getAgentSkills(ctx.db, ctx.agentId)).map(s => s.skillName)
      if (allSkills.length === 0) return 'No skills available in the skills directory.'
      return allSkills.map(s => {
        const status = installed.includes(s.metadata.name) ? ' (installed)' : ''
        return `- ${s.metadata.name}${status}: ${s.metadata.description}`
      }).join('\n')
    }

    case 'install_skill': {
      const skillName = args.skillName as string
      const allSkills = loadSkillsFromDir(ctx.skillsDir)
      const skill = allSkills.find(s => s.metadata.name === skillName)
      if (!skill) return `Skill not found: "${skillName}". Use list_available_skills to see available skills.`
      const installed = (await getAgentSkills(ctx.db, ctx.agentId)).map(s => s.skillName)
      if (installed.includes(skillName)) return `Skill "${skillName}" is already installed.`
      await installSkill(ctx.db, ctx.agentId, skillName)

      // Announce in chat so the human sees it (use team channel if no specific channel)
      try {
        let announceChannelId = ctx.channelId
        if (!announceChannelId) {
          const { getTeamChannel } = await import('./chat.ts')
          const teamChannel = await getTeamChannel(ctx.db, ctx.teamId)
          announceChannelId = teamChannel.id
        }
        await sendMessage(ctx.db, announceChannelId, 'agent', ctx.agentId,
          `Installing the **${skillName}** skill to gain new capabilities.`, undefined, ctx.teamId)
      } catch { /* don't fail the install if chat announcement fails */ }
      await logActivity(ctx.db, 'skill_installed', ctx.agentId,
        `Installed skill: ${skillName}`, { skillName }, ctx.teamId)

      // Dynamically load the new skill's tools into the current session
      if (ctx.tools) {
        const newSkillTools = getSkillTools(ctx.skillsDir, [skillName])
        for (const t of newSkillTools) {
          // Avoid duplicates
          if (!ctx.tools.some(existing => existing.function.name === t.function.name)) {
            ctx.tools.push(t)
          }
        }
      }

      return `Skill "${skillName}" installed successfully. Its tools are now available in this session.`
    }

    case 'list_team_members': {
      const members = await getTeamMembers(ctx.db, ctx.teamId)
      if (members.length === 0) return 'No team members found.'
      return members.map(m => `- ${m.email} (userId: ${m.userId}, role: ${m.role})`).join('\n')
    }

    case 'use_saved_login': {
      const domain = args.domain as string
      const { findVaultSessionByDomain, updateSessionUsage, logVaultEvent: logVault } = await import('./session-vault.ts')
      const { restartWithStorageState } = await import('./browser.ts')
      const { writeFileSync, mkdtempSync, rmSync } = await import('node:fs')
      const { join } = await import('node:path')
      const { tmpdir } = await import('node:os')

      const session = await findVaultSessionByDomain(ctx.db, ctx.teamId, domain)
      if (!session) return `No active saved login found for "${domain}". The team needs to record a login session for this domain in Settings → Session Vault.`
      if (session.info.status !== 'active') return `The saved login for "${domain}" is ${session.info.status}. The team needs to re-record it.`

      // Write storageState to a secure temp directory (mode 0o700), then delete
      const tempDir = mkdtempSync(join(tmpdir(), 'vault-'))
      const tmpPath = join(tempDir, 'state.json')
      writeFileSync(tmpPath, session.storageState, { mode: 0o600 })
      try {
        await restartWithStorageState(ctx.agentId, tmpPath)
      } finally {
        try { rmSync(tempDir, { recursive: true, force: true }) } catch { /* best effort */ }
      }

      await updateSessionUsage(ctx.db, session.info.id)
      await logVault(ctx.db, session.info.id, ctx.teamId, 'used', ctx.agentId)
      return `Authenticated session loaded for ${domain}. You can now browse as the logged-in user. Use browser_navigate to go to https://${domain}.`
    }

    case 'vault_report_session_expired': {
      const domain = args.domain as string
      const reason = args.reason as string
      const { findVaultSessionByDomain, expireVaultSession, logVaultEvent: logVault } = await import('./session-vault.ts')
      const { notifyTeam: notifyVault } = await import('./notifications.ts')

      const session = await findVaultSessionByDomain(ctx.db, ctx.teamId, domain)
      if (session) {
        await expireVaultSession(ctx.db, session.info.id, ctx.teamId)
        await logVault(ctx.db, session.info.id, ctx.teamId, 'expired', ctx.agentId, undefined, reason)
        await notifyVault(ctx.db, ctx.teamId, 'system',
          `Session Expired: ${session.info.serviceLabel}`,
          `The saved login for ${domain} has expired. Please re-record it in Settings → Session Vault. Reason: ${reason}`,
        )
      }
      return `Session expiry reported for ${domain}. The team has been notified to re-record the login.`
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
        const browserResult = await executeBrowserTool(ctx.agentId, toolCall.function.name, args, ctx.teamId)
        // browser_ask_human returns a marker — handle it here where we have db/approval access
        if (browserResult === '__browser_ask_human__') {
          const question = (args.question as string) || 'Need your input'
          const options = args.options as string[] | undefined
          const askContext = (args.context as string) || ''
          // Capture screenshot for the approval panel
          let screenshotData: string | undefined
          try {
            const { captureAgentScreenshot } = await import('./browser.ts')
            const snap = await captureAgentScreenshot(ctx.agentId)
            if (snap) screenshotData = snap.screenshot
          } catch { /* ignore */ }
          // Create approval request
          const actionDetail = JSON.stringify({
            question, options, context: askContext,
            screenshot: screenshotData?.slice(0, 50000), // cap size for DB storage
          })
          const approval = await createApproval(ctx.db, ctx.teamId, ctx.agentId,
            'browser_question', actionDetail, 'low')
          // Send chat message to team channel
          const optionsText = options?.length ? `\nOptions: ${options.join(' | ')}` : ''
          const teamChannel = await getTeamChannel(ctx.db, ctx.teamId)
          await sendChatMsg(ctx.db, teamChannel.id, 'agent', ctx.agentId,
            `🌐 **Browser Question**: ${question}${optionsText}\n\n_${askContext}_\n\n[Review and respond in Approvals]`,
            undefined, ctx.teamId)
          // Wait for approval resolution (poll with timeout)
          const maxWait = 10 * 60 * 1000 // 10 min
          const pollInterval = 3000
          const startTime = Date.now()
          while (Date.now() - startTime < maxWait) {
            const updated = await getApproval(ctx.db, approval.id)
            if (updated && updated.status !== 'pending') {
              return updated.status === 'approved'
                ? `Human approved. Continue with the task.`
                : `Human rejected: the request was denied. Adjust your approach.`
            }
            await new Promise(r => setTimeout(r, pollInterval))
          }
          return 'Timed out waiting for human response (10 min). Try a different approach or ask again.'
        }
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
  taskCompleted?: boolean
  taskBlocked?: boolean
}

/**
 * Build the system prompt for an agent with chain-of-thought baked in.
 * The CoT instructions ensure agents reason before every action, leading
 * to better prioritization, fewer mistakes, and more thoughtful responses.
 */
export function buildAgentSystemPrompt(agentName: string, customPrompt?: string | null, timezone?: string | null, creditBalance?: number | null): string {
  let identity = customPrompt?.trim()
    ? customPrompt.trim()
    : `You are ${agentName}, a proactive AI agent.`

  if (identity.length > 8000) {
    console.log(`[runtime] Custom prompt for "${agentName}" truncated from ${identity.length} to 8000 chars`)
    identity = identity.slice(0, 8000) + '\n\n[System prompt truncated]'
  }

  const tz = timezone || 'UTC'
  const now = new Date()
  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true,
  })
  const today = dateFormatter.format(now)       // "Saturday, March 1, 2026"
  const time = timeFormatter.format(now)        // "2:30 PM"
  const isoDate = now.toLocaleDateString('en-CA', { timeZone: tz }) // "2026-03-01"

  return `${identity}

## Current Date & Time

Today is ${today}. The current time is ${time} (${tz}).
ISO date: ${isoDate}

CRITICAL: You MUST use this date for ALL scheduling, deadlines, and time-related reasoning.
Do NOT rely on your training data for the current date — today is ${isoDate}.
Never set a deadline or meeting in the past. When someone says "next week", calculate from ${isoDate}.
When creating tasks, default the deadline to TODAY (${isoDate}) — act immediately. Only push the deadline out if the user explicitly requests a later date or there are already many active tasks queued ahead.

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

## Workspace File Rules — MANDATORY

Before creating ANY file, you MUST:
1. Use list_files with recursive=true to see what already exists
2. If a file on the same topic exists, UPDATE it instead of creating a new one
3. Never create dated variants (e.g. "report_20260304.md") — use a single file and update it

**Folder structure** (use these exact top-level folders):
- \`content/\` — blog posts, articles, copy, marketing materials, social media content
- \`research/\` — keyword research, competitor analysis, market research, trend reports, audits
- \`strategy/\` — plans, roadmaps, calendars, campaign strategies, playbooks
- \`community/\` — community docs, welcome messages, channel structures, moderation guides
- \`reports/\` — recurring reports, performance summaries, analytics
- \`templates/\` — reusable templates, frameworks, checklists
- \`internal/\` — meeting notes, SOPs, process docs, team guidelines

**Naming rules:**
- Use kebab-case: \`keyword-research-report.md\` not \`Keyword_Research_Report_20260304.md\`
- No dates in filenames — the file's updated_at timestamp tracks recency
- Use descriptive names: \`seo-audit.md\` not \`audit.md\`
- Max 2 levels of nesting: \`content/seo-briefs/trading-strategies.md\` is OK, deeper is not

**One file per topic.** If your task produces a deliverable that overlaps with an existing file, update that file. Never create parallel versions, drafts, or copies.

**Prefer existing directories.** Before creating a new folder, check what directories already exist using list_files. Place files in the most relevant existing directory. Only create a new directory when no existing one fits AND you expect multiple files in that category.

**Structured data belongs in Data Tables, NOT files.** When you need to store structured/tabular data (leads, contacts, inventory, metrics, etc.), use \`create_source_of_record\` to make a Data Table with typed columns — then add rows with \`add_source_of_record_row\`. NEVER create CSV, JSON, or other flat files for structured data. Data Tables are searchable, sortable, and visible in the dashboard.

**Data Table Organization — CRITICAL:**
- Before creating a new Data Table, ALWAYS use \`query_source_of_record\` to check what tables already exist.
- If a table with a similar purpose already exists (e.g. "Leads", "Prospects", "Contacts" are all the same concept), add your data to the EXISTING table. Do NOT create a parallel table.
- Use consistent column names across rows. If the existing table has columns like "Name", "Email", "Company", always use those exact column names — never create variant columns like "Full Name", "Email Address", "Organization" for the same data.
- Standard CRM table names: "Contacts" for prospects/leads/contacts, "Companies" for company/org data, "Deals" for pipeline/opportunities. Always prefer these canonical names.
- If you need columns the existing table doesn't have, add data to the closest matching columns and put extra info in a "Notes" column — do NOT create a new table just for different columns.

**Content quality rules:**
- Always include a Sources section at the bottom with links to references, data sources, or tools used
- Use markdown links throughout the document — link to external resources, tools, competitors, etc.
- Internal cross-references: link to other workspace files using relative paths when relevant
- Never produce a research document, audit, or report without citing where the data came from

## Communication Rules — MANDATORY

- **Write like a human teammate, not a machine.** Use natural language — short sentences, bullet points, plain English. Never output raw JSON, code blocks of structured data, or internal reasoning as your response.
- **Be concise.** Status updates should be 1-3 sentences. Only write longer responses when delivering actual work product (reports, content, analysis).
- **If you have nothing to report, say nothing.** When a check-in reveals no new work, no pending tasks, and nothing to communicate, respond with exactly "no-op". Do NOT post a summary saying "nothing to do" — that wastes everyone's attention.
- **Never dump your internal thinking.** Your assessment, prioritization, and planning happen in the "think" tool. Your final response should only contain the outcome — what you did, what you need, or what you recommend.
- **Focus on actions and results.** Say "Finished the blog post (1,800 words)" not "I assessed the task list, prioritized the blog post, planned my approach, and executed the writing."

## Media Generation — MANDATORY

Before generating ANY image, video, or 3D model, you MUST:
1. **Ask the human which model to use** if they didn't already specify one. Present the options with credit costs so they can make an informed choice.
2. **Never silently default to the most expensive model.** If the human says "make me an image" without specifying a model, respond with the available options and their credit costs and ask which one they'd like.
3. **If the human specifies a model or says "cheapest" / "best quality" / etc., pick accordingly** — no need to ask again.

## Resource Intelligence — MANDATORY

Credits are real money. Treat them like a company budget — be smart about spending regardless of the current balance.${creditBalance != null ? `\n\n**Current team balance: ${creditBalance.toLocaleString()} credits.**` : ''}

**Efficiency rules:**
- **Don't spin your wheels.** If a task isn't working after 3-4 tool calls, stop and ask the human for guidance. Do NOT retry the same approach 10+ times — that burns credits with nothing to show for it.
- **Save your work as you go.** Before attempting any expensive action (image/video/3D generation), write your research, plan, or draft to a workspace file first. If the action fails or you run out of iterations, the work is preserved and you can pick it up next cycle.
- **Know the cost before you act.** Image generation costs 50-600 credits. Video rendering costs 50+ credits. Each LLM thinking iteration costs 20+ credits. A web search costs 25-55 credits. Be intentional — don't call expensive tools speculatively.
- **Batch your thinking.** Plan your full approach in ONE think call, then execute. Don't use 5 separate think calls to decide what to do — that's 100+ credits on thinking alone.
- **Fail gracefully.** If a tool call fails, save what you have, report the issue to the human, and move on. Do not retry the same failing action in a loop.
- **Prioritize cheap actions first.** Read existing files, check task status, list what's available — these are free. Do your homework before spending credits on generation or search.
- **One iteration, one meaningful action.** Each iteration costs credits. Make every iteration count — don't waste an iteration just to think without acting, or to post a status update nobody asked for.
- **Estimate before executing.** When starting a task, estimate total credits needed and set estimatedCredits on the task via update_task. If you're in Plan Mode, use request_approval with a cost breakdown (e.g. "~7 iterations × 20 + render_video 50 = ~190 credits") before doing expensive work.

## Honesty & Error Handling — CRITICAL

**NEVER claim you did something you didn't do.** If you didn't call a tool, you didn't do the action. Period.

- **If a tool returns an error** (result starts with "Error:" or contains "failed"), you MUST report the error to the human. Do NOT pretend the action succeeded. Do NOT say "almost done" or "finishing up" when the tool failed.
- **If you don't have the right tool or skill**, say so. Do NOT describe doing work you cannot actually perform.
- **If you're stuck**, explain exactly what's blocking you and what the human needs to do to fix it. Be specific — "I need X" is better than "I'm working on it."
- **Never fabricate progress.** If you haven't called render_video, don't say "the render is done." If you haven't called generate_image, don't say "the image is ready." Your tool call history is logged — lies will be caught.
- **Actions only count if you used a tool.** Thinking about doing something is not the same as doing it. Planning to render a video is not rendering a video.

## Using Skills & Tools Effectively

- **Check your installed skills FIRST.** You may have specialized tools from installed skills (like render_video for animated videos). Use list_available_skills to see what you have.
- **Skill tools are different from built-in tools.** For example: \`generate_video\` (built-in) creates AI video clips from prompts using AI models. \`render_video\` (skill) renders programmatic animated videos from JSON scene descriptions — text, shapes, animations, transitions. They are NOT the same — choose the right one for the job.
- **render_video is for deterministic content** — promo videos, explainers, branded content, data visualizations. \`generate_video\` is for AI-generated creative content.
- **If you have the right skill installed, USE IT.** Don't talk about using it — call the tool. Don't plan to use it — call the tool. Don't say you need more credits for a different tool — check if the skill tool is cheaper and use that instead.

## Guidelines

- Be concise and professional in all communications.
- When you have multiple tasks, work on the highest-priority one first.
- If a task is blocked or unclear, ask for clarification via the respond tool.
- If an action could have significant consequences, use request_approval to get human sign-off first.
- **For complex tasks requiring many steps, break the work into subtasks using add_subtask.** Each subtask gets its own fresh sprint with full context. This is more effective than trying to do everything in one long session.
- **If you created subtasks, do NOT mark the parent as "done"** until all subtasks are complete. Check their status first.
- When you need guidance, direction, or collaboration, @mention the relevant agent in a group channel. Do NOT message the human directly unless they specifically asked you something.
- All your communication should happen in group channels or task threads — never send direct messages proactively.
- If you're unsure what to do, ask your team lead or AdvisorBot via @mention in a group channel.
- If there is nothing meaningful to do, call the "respond" tool with the message "no-op" — do not take actions just to appear busy.

## CRITICAL: Use function calls, NOT text tags

You MUST use the provided tool/function calls for ALL actions. NEVER write tool names as text tags like [think], [respond], [update_task], etc. Always use the native function calling mechanism. If you want to think, call the "think" function. If you want to respond, call the "respond" function. Plain text output should ONLY be used for final messages — never for tool invocations.

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
  _workspaceConfig: unknown,
  skillsDir: string,
  config: RuntimeConfig = DEFAULT_RUNTIME_CONFIG,
  logicalModelId?: string,
  channelId?: string,
): Promise<RunResult> {
  // Save the user message
  const reactStart = Date.now()
  await addMessage(db, agentId, 'user', userMessage, teamId)

  // Conversation compaction: summarize old messages if history is long
  let conversationSummary: string | null = null
  const fullHistory = await getMessages(db, agentId, 30)
  try {
    const summaryRow = await db.queryOne<{ summary: string; messages_summarized: number }>(
      `SELECT summary, messages_summarized FROM conversation_summaries WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [agentId],
    )
    const summarizedCount = summaryRow?.messages_summarized ?? 0
    const newMessagesSinceSummary = fullHistory.length - summarizedCount

    if (newMessagesSinceSummary >= 30 && fullHistory.length > 10) {
      // Generate a new summary from older messages
      const toSummarize = fullHistory.slice(0, -10)
      const summaryMessages: ChatMessage[] = [
        { role: 'system', content: 'Summarize the following conversation concisely, preserving key facts, decisions, and context. Output only the summary.' },
        { role: 'user', content: toSummarize.map((m) => `${m.role}: ${m.content}`).join('\n\n') },
      ]
      try {
        const { chatCompletion } = await import('./model.ts')
        const summaryResult = await chatCompletion(modelConfig, summaryMessages)
        if (summaryResult.content) {
          const summaryId = (await import('crypto')).randomUUID()
          await db.run(
            `INSERT INTO conversation_summaries (id, team_id, agent_id, summary, messages_summarized) VALUES ($1, $2, $3, $4, $5)`,
            [summaryId, teamId, agentId, summaryResult.content, fullHistory.length],
          )
          conversationSummary = summaryResult.content
          console.log(`[runtime] Conversation compacted for agent ${agentId}: ${toSummarize.length} messages summarized`)
        }
      } catch (err) {
        console.error('[runtime] Compaction failed:', err)
      }
    } else if (summaryRow) {
      conversationSummary = summaryRow.summary
    }
  } catch { /* compaction is best-effort */ }

  // Build the message history (reuse fullHistory, no second fetch)
  const messages: ChatMessage[] = conversationSummary
    ? [
        { role: 'system', content: systemPrompt },
        { role: 'system', content: `## Previous Conversation Summary\n\n${conversationSummary}` },
        ...fullHistory.slice(-10).map((m) => ({ role: m.role as ChatMessage['role'], content: m.content })),
      ]
    : [
        { role: 'system', content: systemPrompt },
        ...fullHistory.map((m) => ({ role: m.role as ChatMessage['role'], content: m.content })),
      ]

  // Merge builtin tools with installed skill tools + MCP tools
  const installedSkills = (await getAgentSkills(db, agentId)).map((s) => s.skillName)
  const skillTools = getSkillTools(skillsDir, installedSkills)
  const mcpTools = await loadMcpTools(db, agentId)

  // Filter built-in tools by agent's template categories
  const agentRow = await getAgent(db, agentId)
  const template = agentRow?.templateId ? (await import('./templates.ts')).TEMPLATES.find((t: any) => t.id === agentRow.templateId) : null
  const categories = template?.toolCategories ?? ALL_CATEGORIES
  const effectiveCategories = config.extraToolCategories
    ? [...new Set([...categories, ...config.extraToolCategories])]
    : categories
  const builtinTools = getFilteredBuiltinTools(effectiveCategories as ToolCategory[])
  const tools = [...builtinTools, ...skillTools, ...mcpTools]

  // Look up agent name for progress broadcasts (reuse agentRow from above)
  const agentName = agentRow?.name ?? agentId

  // Progress broadcast helper
  const emitProgress = (type: AgentProgressEvent['type'], label: string, iteration: number, detail?: string) => {
    broadcastAgentProgress(teamId, {
      agentId,
      agentName,
      type,
      label,
      detail: detail?.slice(0, 500),
      taskId: config.currentTaskId,
      iteration,
      maxIterations: config.maxIterations,
      timestamp: Date.now(),
    })
  }

  const toolCtx: ToolContext = { db, agentId, teamId, channelId, skillsDir, skipCredits: config.skipCredits, currentTaskId: config.currentTaskId, tools, onFileWritten: config.onFileWritten }
  const toolCallLog: Array<{ name: string; result: string }> = []
  let response: string | null = null

  // Context window management: trim messages to fit model's context window
  const logicalModel = logicalModelId ? getLogicalModel(logicalModelId) : undefined
  const contextWindow = logicalModel?.contextWindow ?? 128_000
  const maxInputTokens = Math.floor(contextWindow * 0.8) // reserve 20% for response
  const toolsTokens = estimateToolsTokens(tools)

  // Inject relevant memories into system prompt
  try {
    const { searchMemories } = await import('./knowledge-base.ts')
    const memories = await searchMemories(db, teamId, userMessage, 3)
    if (memories.length > 0) {
      const memSection = '\n\n## Relevant Memories\n\n' + memories.map((m) => `- ${m.content}`).join('\n')
      messages[0] = { ...messages[0], content: (messages[0].content ?? '') + memSection }
    }
  } catch { /* never block on memory failure */ }

  // Initial trim before first LLM call
  let trimmedMessages = trimMessagesToFit(messages, maxInputTokens, toolsTokens)

  const setupMs = Date.now() - reactStart
  console.log(`[runtime] React loop setup: ${setupMs}ms (${fullHistory.length} msgs, ${tools.length} tools)`)

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

    // Mask old tool results, then re-trim before each LLM call
    const maskedMessages = maskOldObservations(messages)
    trimmedMessages = trimMessagesToFit(maskedMessages, maxInputTokens, toolsTokens)

    emitProgress('thinking', `Reasoning...`, i + 1)
    let completion: CompletionResponse
    try {
      completion = await chatCompletionWithFallback(modelConfig, trimmedMessages, tools)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown LLM error'
      console.error(`[runtime] LLM call failed on iteration ${i + 1}: ${errMsg}`)
      // Graceful exit — return whatever progress we've made so far
      if (!response) response = "I ran into a temporary issue communicating with my AI model. I'll pick this back up on my next check-in."
      break
    }

    // If the model returned tool calls, execute them
    if (completion.tool_calls.length > 0) {
      // Add assistant message with tool calls
      messages.push({
        role: 'assistant',
        content: completion.content ?? '',
        tool_calls: completion.tool_calls,
      })

      // Broadcast the assistant's reasoning text (if any) before tool calls
      if (completion.content && completion.content.trim()) {
        emitProgress('thinking', `Reasoning`, i + 1, completion.content.slice(0, 500))
      }

      for (const toolCall of completion.tool_calls) {
        // Broadcast tool_start progress with rich argument context
        const toolLabel = getToolLabel(toolCall.function.name)
        let argPreview: string | undefined
        try {
          const parsed = JSON.parse(toolCall.function.arguments)
          if (toolCall.function.name === 'think') {
            // For think tool, show the full thought as the detail
            argPreview = (parsed.thought as string)?.slice(0, 500)
          } else if (toolCall.function.name === 'respond') {
            argPreview = (parsed.message as string)?.slice(0, 300)
          } else {
            // Pick the most useful arg for display
            argPreview = parsed.query ?? parsed.skillName ?? parsed.path ?? parsed.message?.slice(0, 200) ?? parsed.prompt?.slice(0, 200) ?? parsed.content?.slice(0, 200) ?? parsed.notes?.slice(0, 200) ?? parsed.url ?? parsed.tableName ?? undefined
          }
        } catch { /* ignore parse errors */ }
        emitProgress('tool_start', toolLabel, i + 1, argPreview)

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
        // Offload large results to workspace files
        result = await maybeOffloadResult(result, toolCall.function.name, toolCtx)
        toolCallLog.push({ name: toolCall.function.name, result })

        // Broadcast tool_result
        emitProgress('tool_result', `${toolLabel} complete`, i + 1, result.slice(0, 300))

        // Log tool execution to activity log (skip 'think' — too noisy)
        if (toolCall.function.name !== 'think') {
          await logActivity(db, 'tool_executed', agentId, `${toolCall.function.name}: ${result.slice(0, 200)}`, {
            tool: toolCall.function.name,
            resultPreview: result.slice(0, 500),
          }, teamId)
        }

        // If this is a "respond" call, capture the response
        if (toolCall.function.name === 'respond') {
          emitProgress('responding', 'Composing response', i + 1)
          const args = JSON.parse(toolCall.function.arguments) as { message: string }
          response = args.message
        }

        // Feed the tool result back to the model
        // Prefix errors clearly so the LLM cannot mistake them for success
        const isError = result.startsWith('Error:') || result.startsWith('Error —') || result.includes('failed:') || result.includes('Failed:')
        messages.push({
          role: 'tool',
          content: isError ? `⚠️ TOOL ERROR — This action FAILED. Do NOT claim it succeeded.\n\n${result}` : result,
          tool_call_id: toolCall.id,
        })
      }

      // If agent responded, we're done
      if (response !== null) {
        await addMessage(db, agentId, 'assistant', response, teamId)
        emitProgress('idle', 'Done', i + 1)
        return { response, iterations: i + 1, toolCalls: toolCallLog }
      }

      // Task-focused exit conditions: detect when agent completes or gets blocked on its task
      if (config.taskFocused) {
        let taskCompleted = false
        let taskBlocked = false

        for (const tc of completion.tool_calls) {
          if (tc.function.name === 'update_task') {
            try {
              const args = JSON.parse(tc.function.arguments) as { status?: string }
              if (args.status === 'done' || args.status === 'review') {
                taskCompleted = true
              }
            } catch { /* parse error — ignore */ }
          }
          if (tc.function.name === 'request_approval') {
            taskBlocked = true
          }
        }

        if (taskCompleted || taskBlocked) {
          const fallback = response ?? (taskCompleted ? 'Task completed.' : 'Waiting for approval.')
          await addMessage(db, agentId, 'assistant', fallback, teamId)
          emitProgress('idle', 'Done', i + 1)
          return { response: fallback, iterations: i + 1, toolCalls: toolCallLog, taskCompleted, taskBlocked }
        }
      }

      // Otherwise continue the loop (agent thought but didn't respond yet)
      continue
    }

    // No tool calls — check if model wrote tool syntax as plain text (common with DeepSeek, Llama, etc.)
    if (completion.content) {
      const text = completion.content

      // Detect text-based [think] blocks and convert to synthetic tool calls
      const thinkMatch = text.match(/\[think\]([\s\S]*?)\[\/think\]/)
      if (thinkMatch && i < config.maxIterations - 1) {
        const thought = thinkMatch[1].trim()
        console.log(`[runtime] Model wrote [think] as text — converting to tool call (iteration ${i + 1})`)

        // Check if the rest of the text after stripping think blocks is just [no-op] or empty
        const remainder = text.replace(/\[think\][\s\S]*?\[\/think\]/g, '').replace(/\[no-?op\]/gi, '').trim()

        // Treat the think block as if it were a real tool call, feed it back, and continue
        messages.push({
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: `synth_think_${i}`,
            type: 'function' as const,
            function: { name: 'think', arguments: JSON.stringify({ thought }) },
          }],
        })
        messages.push({
          role: 'tool',
          content: 'Thought noted. Now use your tools (function calls) to take action. Do NOT write [think] or [no-op] as text — use the actual function calling mechanism.',
          tool_call_id: `synth_think_${i}`,
        })
        toolCallLog.push({ name: 'think', result: thought.slice(0, 200) })

        // If the model also wrote [no-op] and there's nothing else, return no-op
        if (remainder.length === 0 && text.includes('[no-op]')) {
          response = 'no-op'
          await addMessage(db, agentId, 'assistant', response, teamId)
          emitProgress('idle', 'Done', i + 1)
          return { response, iterations: i + 1, toolCalls: toolCallLog }
        }

        continue  // Re-enter the loop so the model can make real tool calls
      }

      // No text-based tool syntax detected — genuine text response
      // Guard: if the model returned structured JSON (e.g. {"thought":"...","tasks":[...]})
      // instead of a human-readable message, extract the readable part.
      response = extractHumanMessage(completion.content)
      await addMessage(db, agentId, 'assistant', response, teamId)
      emitProgress('idle', 'Done', i + 1)
      return { response, iterations: i + 1, toolCalls: toolCallLog }
    }

    // Empty response — shouldn't happen, but break to be safe
    break
  }

  // If we hit max iterations without a response
  const fallback = response ?? "I'm still working on this but need a bit more time. I've saved my progress — I'll pick it back up on my next check-in."
  await addMessage(db, agentId, 'assistant', fallback, teamId)
  emitProgress('idle', 'Done', config.maxIterations)
  return { response: fallback, iterations: config.maxIterations, toolCalls: toolCallLog }
}

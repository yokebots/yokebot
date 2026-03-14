/**
 * memory.ts — Lossless hierarchical conversation memory
 *
 * DAG-based memory system where raw messages are never deleted,
 * summaries link back to their sources at multiple depth levels,
 * and agents can search/expand their own history.
 *
 * Inspired by lossless-claw (Martian Engineering).
 */

import type { Db } from './db/types.ts'
import type { ChatMessage, ModelConfig } from './model.ts'
import { deductCredits, getModelCreditCost } from './billing.ts'
import { randomUUID } from 'crypto'

const HOSTED_MODE = process.env.YOKEBOT_HOSTED_MODE === 'true'

// ---- Constants ----
const COMPACTION_THRESHOLD = 30   // unsummarized messages before compaction triggers
const FRESH_TAIL_COUNT = 10       // always keep last N raw messages in context
const CONDENSATION_THRESHOLD = 4  // merge N+ uncovered nodes at depth N into depth N+1
const CHARS_PER_TOKEN = 4

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

// ---- Types ----
interface MemoryNode {
  id: string
  team_id: string
  agent_id: string
  parent_id: string | null
  depth: number
  summary: string
  msg_start_id: number | null
  msg_end_id: number | null
  msg_count: number
  child_ids: string | null // JSON array of child node IDs
  token_count: number
  created_at: string
}

interface RawMessage {
  id: number
  role: string
  content: string
  is_noop: boolean
  created_at: string
}

export interface HistoryResult {
  type: 'message' | 'summary'
  id: string | number
  content: string
  timestamp: string
  node_id?: string
}

// ---- Compaction ----

/**
 * Hierarchical conversation compaction. Replaces the old flat summary system.
 *
 * 1. Count non-noop messages after the last leaf node's msg_end_id
 * 2. If >= 30, create a depth-0 leaf node summarizing all but last 10
 * 3. Condense: when 4+ uncovered nodes at depth N, merge into depth N+1
 */
export async function compactConversation(
  db: Db,
  agentId: string,
  teamId: string,
  modelConfig: ModelConfig,
  logicalModelId?: string,
): Promise<void> {
  try {
    // Find the last leaf node's msg_end_id (highest message ID already summarized)
    const lastLeaf = await db.queryOne<{ msg_end_id: number }>(
      `SELECT msg_end_id FROM memory_nodes WHERE agent_id = $1 AND team_id = $2 AND depth = 0 ORDER BY msg_end_id DESC LIMIT 1`,
      [agentId, teamId],
    )
    const lastSummarizedId = lastLeaf?.msg_end_id ?? 0

    // Count non-noop messages after the last summarized point
    const countRow = await db.queryOne<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM messages WHERE agent_id = $1 AND team_id = $2 AND id > $3 AND is_noop = FALSE`,
      [agentId, teamId, lastSummarizedId],
    )
    const unsummarizedCount = countRow?.cnt ?? 0

    if (unsummarizedCount < COMPACTION_THRESHOLD) return

    // Fetch messages to summarize (all non-noop after last leaf, excluding fresh tail)
    const allNew = await db.query<RawMessage>(
      `SELECT id, role, content, is_noop, created_at FROM messages WHERE agent_id = $1 AND team_id = $2 AND id > $3 AND is_noop = FALSE ORDER BY id ASC`,
      [agentId, teamId, lastSummarizedId],
    )

    if (allNew.length <= FRESH_TAIL_COUNT) return

    const toSummarize = allNew.slice(0, -FRESH_TAIL_COUNT)
    const msgStartId = toSummarize[0].id
    const msgEndId = toSummarize[toSummarize.length - 1].id

    // Generate depth-0 summary
    const summaryText = await generateSummary(
      db, teamId, modelConfig, logicalModelId, 0,
      toSummarize.map(m => `${m.role}: ${m.content}`).join('\n\n'),
    )
    if (!summaryText) return

    const nodeId = randomUUID()
    await db.run(
      `INSERT INTO memory_nodes (id, team_id, agent_id, parent_id, depth, summary, msg_start_id, msg_end_id, msg_count, child_ids, token_count) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [nodeId, teamId, agentId, null, 0, summaryText, msgStartId, msgEndId, toSummarize.length, null, estimateTokens(summaryText)],
    )
    console.log(`[memory] Created depth-0 node for agent ${agentId}: ${toSummarize.length} messages → ${estimateTokens(summaryText)} tokens`)

    // Condense higher levels
    await condenseNodes(db, agentId, teamId, modelConfig, logicalModelId)
  } catch (err) {
    console.error('[memory] Compaction failed:', err)
  }
}

/**
 * Recursively condense nodes: when 4+ uncovered nodes exist at depth N,
 * merge them into a depth N+1 node.
 */
async function condenseNodes(
  db: Db,
  agentId: string,
  teamId: string,
  modelConfig: ModelConfig,
  logicalModelId?: string,
): Promise<void> {
  // Find max depth
  const maxRow = await db.queryOne<{ max_depth: number }>(
    `SELECT MAX(depth) as max_depth FROM memory_nodes WHERE agent_id = $1 AND team_id = $2`,
    [agentId, teamId],
  )
  const maxDepth = maxRow?.max_depth ?? 0

  for (let depth = 0; depth <= maxDepth; depth++) {
    // Find uncovered nodes at this depth (not yet merged into a parent)
    const uncovered = await db.query<MemoryNode>(
      `SELECT * FROM memory_nodes WHERE agent_id = $1 AND team_id = $2 AND depth = $3 AND parent_id IS NULL ORDER BY created_at ASC`,
      [agentId, teamId, depth],
    )

    if (uncovered.length < CONDENSATION_THRESHOLD) continue

    // Merge all uncovered nodes into a new parent
    const childSummaries = uncovered.map(n => n.summary).join('\n\n---\n\n')
    const summaryText = await generateSummary(
      db, teamId, modelConfig, logicalModelId, depth + 1, childSummaries,
    )
    if (!summaryText) continue

    const parentId = randomUUID()
    const childIds = JSON.stringify(uncovered.map(n => n.id))
    const totalMsgCount = uncovered.reduce((sum, n) => sum + n.msg_count, 0)

    await db.run(
      `INSERT INTO memory_nodes (id, team_id, agent_id, parent_id, depth, summary, msg_start_id, msg_end_id, msg_count, child_ids, token_count) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [parentId, teamId, agentId, null, depth + 1, summaryText, null, null, totalMsgCount, childIds, estimateTokens(summaryText)],
    )

    // Update children to point to parent
    for (const child of uncovered) {
      await db.run(
        `UPDATE memory_nodes SET parent_id = $1 WHERE id = $2`,
        [parentId, child.id],
      )
    }

    console.log(`[memory] Created depth-${depth + 1} node for agent ${agentId}: ${uncovered.length} children → ${estimateTokens(summaryText)} tokens`)
  }
}

/**
 * Generate a summary using the agent's model. Charges credits for the LLM call.
 */
async function generateSummary(
  db: Db,
  teamId: string,
  modelConfig: ModelConfig,
  logicalModelId: string | undefined,
  depth: number,
  content: string,
): Promise<string | null> {
  const prompt = depth === 0
    ? 'Summarize this conversation, preserving key facts, decisions, action items, and outcomes. Be thorough but concise.'
    : 'Summarize these conversation summaries into a higher-level summary. Be more concise while retaining anything an agent might need to recall.'

  const messages: ChatMessage[] = [
    { role: 'system', content: prompt },
    { role: 'user', content },
  ]

  try {
    const { chatCompletion } = await import('./model.ts')
    const result = await chatCompletion(modelConfig, messages)
    if (!result.content) return null

    // Charge credits for compaction
    if (HOSTED_MODE && logicalModelId) {
      const cost = await getModelCreditCost(db, logicalModelId)
      if (cost > 0) {
        await deductCredits(db, teamId, cost, 'heartbeat_debit', `Memory compaction (depth ${depth})`)
      }
    }

    return result.content
  } catch (err) {
    console.error(`[memory] Summary generation failed (depth ${depth}):`, err)
    return null
  }
}

// ---- Context Assembly ----

/**
 * Assemble conversation context from the DAG memory + fresh tail messages.
 * Replaces the old flat approach.
 *
 * 1. Start with system prompt + tools overhead → calculate remaining budget
 * 2. Always include last 10 raw messages ("fresh tail")
 * 3. Collect all root-level (parentless) memory nodes, ordered by created_at DESC
 * 4. Greedily add each node's summary until budget exhausted
 * 5. Format as a single system message: "## Conversation Memory\n\n[summaries]"
 */
export function assembleContext(
  systemPrompt: string,
  memoryNodes: MemoryNode[],
  tailMessages: Array<{ role: string; content: string }>,
  maxTokens: number,
  toolsTokens: number,
): ChatMessage[] {
  const systemMsg: ChatMessage = { role: 'system', content: systemPrompt }
  const tail: ChatMessage[] = tailMessages.map(m => ({
    role: m.role as ChatMessage['role'],
    content: m.content,
  }))

  // Budget calculation
  const fixedCost = estimateTokens(systemPrompt) + toolsTokens
  const tailCost = tail.reduce((sum, m) => sum + estimateTokens(m.content ?? '') + 4, 0)
  let remaining = maxTokens - fixedCost - tailCost

  if (remaining <= 0 || memoryNodes.length === 0) {
    return [systemMsg, ...tail]
  }

  // Greedily add summaries newest-first until budget exhausted
  const summaryParts: string[] = []
  for (const node of memoryNodes) {
    const nodeCost = estimateTokens(node.summary) + 10 // overhead for formatting
    if (nodeCost > remaining) continue
    summaryParts.push(node.summary)
    remaining -= nodeCost
  }

  if (summaryParts.length === 0) {
    return [systemMsg, ...tail]
  }

  const memoryMsg: ChatMessage = {
    role: 'system',
    content: `## Conversation Memory\n\n${summaryParts.join('\n\n---\n\n')}`,
  }

  return [systemMsg, memoryMsg, ...tail]
}

// ---- Agent Tools: Search & Recall ----

/**
 * Search agent's conversation history — keyword search across messages and memory node summaries.
 * Read-only, 0 credits.
 */
export async function searchHistory(
  db: Db,
  agentId: string,
  teamId: string,
  query: string,
  maxResults = 10,
): Promise<HistoryResult[]> {
  const results: HistoryResult[] = []
  const searchPattern = `%${query}%`

  // Search recent messages (non-noop)
  const msgResults = await db.query<{ id: number; role: string; content: string; created_at: string }>(
    `SELECT id, role, content, created_at FROM messages WHERE agent_id = $1 AND team_id = $2 AND is_noop = FALSE AND content ILIKE $3 ORDER BY created_at DESC LIMIT $4`,
    [agentId, teamId, searchPattern, maxResults],
  )

  for (const msg of msgResults) {
    // Snippet: 200 chars around first match
    const idx = msg.content.toLowerCase().indexOf(query.toLowerCase())
    const start = Math.max(0, idx - 100)
    const end = Math.min(msg.content.length, idx + query.length + 100)
    const snippet = (start > 0 ? '...' : '') + msg.content.slice(start, end) + (end < msg.content.length ? '...' : '')

    results.push({
      type: 'message',
      id: msg.id,
      content: `[${msg.role}] ${snippet}`,
      timestamp: msg.created_at,
    })
  }

  // Search memory node summaries
  const nodeResults = await db.query<{ id: string; summary: string; depth: number; created_at: string }>(
    `SELECT id, summary, depth, created_at FROM memory_nodes WHERE agent_id = $1 AND team_id = $2 AND summary ILIKE $3 ORDER BY created_at DESC LIMIT $4`,
    [agentId, teamId, searchPattern, maxResults],
  )

  for (const node of nodeResults) {
    const idx = node.summary.toLowerCase().indexOf(query.toLowerCase())
    const start = Math.max(0, idx - 100)
    const end = Math.min(node.summary.length, idx + query.length + 100)
    const snippet = (start > 0 ? '...' : '') + node.summary.slice(start, end) + (end < node.summary.length ? '...' : '')

    results.push({
      type: 'summary',
      id: node.id,
      content: `[depth-${node.depth} summary] ${snippet}`,
      timestamp: node.created_at,
      node_id: node.id,
    })
  }

  // Sort by timestamp descending, take top N
  results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  return results.slice(0, maxResults)
}

/**
 * Recall detail from a memory node — expands a summary back to its source material.
 * Read-only, 0 credits.
 */
export async function recallDetail(
  db: Db,
  agentId: string,
  teamId: string,
  nodeId: string,
): Promise<string> {
  const node = await db.queryOne<MemoryNode>(
    `SELECT * FROM memory_nodes WHERE id = $1 AND agent_id = $2 AND team_id = $3`,
    [nodeId, agentId, teamId],
  )

  if (!node) return 'Error: Memory node not found.'

  if (node.depth === 0) {
    // Return raw messages between msg_start_id and msg_end_id
    if (node.msg_start_id == null || node.msg_end_id == null) {
      return `Summary (no raw messages available):\n${node.summary}`
    }

    const messages = await db.query<{ role: string; content: string; created_at: string }>(
      `SELECT role, content, created_at FROM messages WHERE agent_id = $1 AND team_id = $2 AND id >= $3 AND id <= $4 ORDER BY id ASC`,
      [agentId, teamId, node.msg_start_id, node.msg_end_id],
    )

    if (messages.length === 0) {
      return `Summary (messages may have been pruned):\n${node.summary}`
    }

    return messages.map(m => `[${m.created_at}] ${m.role}: ${m.content}`).join('\n\n')
  }

  // Depth 1+: return child node summaries
  if (!node.child_ids) {
    return `Summary:\n${node.summary}`
  }

  let childIds: string[]
  try {
    childIds = JSON.parse(node.child_ids)
  } catch {
    return `Summary:\n${node.summary}`
  }

  const parts: string[] = []
  for (const cid of childIds) {
    const child = await db.queryOne<{ summary: string; depth: number; created_at: string }>(
      `SELECT summary, depth, created_at FROM memory_nodes WHERE id = $1`,
      [cid],
    )
    if (child) {
      parts.push(`[${child.created_at}, depth-${child.depth}]\n${child.summary}`)
    }
  }

  return parts.length > 0
    ? parts.join('\n\n---\n\n')
    : `Summary:\n${node.summary}`
}

// ---- Heartbeat Pruning ----

/**
 * Mark messages from a no-op heartbeat cycle as is_noop = TRUE.
 * Called after isNoOp detection in scheduler.ts.
 */
export async function markNoopMessages(
  db: Db,
  agentId: string,
  teamId: string,
  since: Date,
): Promise<void> {
  try {
    if (db.driver === 'postgres') {
      await db.run(
        `UPDATE messages SET is_noop = TRUE WHERE agent_id = $1 AND team_id = $2 AND created_at >= $3`,
        [agentId, teamId, since.toISOString()],
      )
    } else {
      await db.run(
        `UPDATE messages SET is_noop = 1 WHERE agent_id = $1 AND team_id = $2 AND created_at >= $3`,
        [agentId, teamId, since.toISOString()],
      )
    }
  } catch (err) {
    console.error('[memory] Failed to mark noop messages:', err)
  }
}

// ---- Helpers for runtime.ts integration ----

/**
 * Fetch root-level memory nodes (no parent) for context assembly, newest first.
 */
export async function getRootMemoryNodes(
  db: Db,
  agentId: string,
  teamId: string,
): Promise<MemoryNode[]> {
  return db.query<MemoryNode>(
    `SELECT * FROM memory_nodes WHERE agent_id = $1 AND team_id = $2 AND parent_id IS NULL ORDER BY created_at DESC`,
    [agentId, teamId],
  )
}

/**
 * Fetch the fresh tail: last N non-noop messages for an agent.
 */
export async function getFreshTail(
  db: Db,
  agentId: string,
  teamId: string,
  count = FRESH_TAIL_COUNT,
): Promise<Array<{ role: string; content: string }>> {
  const rows = await db.query<{ role: string; content: string }>(
    `SELECT role, content FROM messages WHERE agent_id = $1 AND team_id = $2 AND is_noop = FALSE ORDER BY id DESC LIMIT $3`,
    [agentId, teamId, count],
  )
  return rows.reverse()
}

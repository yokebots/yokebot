/**
 * chat.ts — Built-in chat: DMs, task threads, group channels
 */

import type { Db } from './db/types.ts'
import { randomUUID } from 'crypto'

export type ChannelType = 'dm' | 'group' | 'task_thread'
export type SenderType = 'human' | 'agent' | 'system'

export interface ChatChannel { id: string; name: string; type: ChannelType; createdAt: string }
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

export interface ChatMessage { id: number; channelId: string; senderType: SenderType; senderId: string; content: string; attachments: ChatAttachment[]; taskId: string | null; createdAt: string }

// ---- Channels ----

export async function createChannel(db: Db, teamId: string, name: string, type: ChannelType): Promise<ChatChannel> {
  const id = randomUUID()
  await db.run('INSERT INTO chat_channels (id, team_id, name, type) VALUES ($1, $2, $3, $4)', [id, teamId, name, type])
  return (await getChannel(db, id))!
}

export async function getChannel(db: Db, id: string): Promise<ChatChannel | null> {
  const row = await db.queryOne<Record<string, unknown>>('SELECT * FROM chat_channels WHERE id = $1', [id])
  if (!row) return null
  return { id: row.id as string, name: row.name as string, type: row.type as ChannelType, createdAt: row.created_at as string }
}

export async function listChannels(db: Db, teamId?: string): Promise<ChatChannel[]> {
  if (teamId) {
    const rows = await db.query<Record<string, unknown>>('SELECT * FROM chat_channels WHERE team_id = $1 ORDER BY created_at DESC', [teamId])
    return rows.map((row) => ({ id: row.id as string, name: row.name as string, type: row.type as ChannelType, createdAt: row.created_at as string }))
  }
  const rows = await db.query<Record<string, unknown>>('SELECT * FROM chat_channels ORDER BY created_at DESC')
  return rows.map((row) => ({ id: row.id as string, name: row.name as string, type: row.type as ChannelType, createdAt: row.created_at as string }))
}

export async function getDmChannel(db: Db, agentId: string, teamId = ''): Promise<ChatChannel> {
  const dmName = `dm:${agentId}`
  const existing = await db.queryOne<Record<string, unknown>>('SELECT * FROM chat_channels WHERE name = $1 AND team_id = $2', [dmName, teamId])
  if (existing) {
    return { id: existing.id as string, name: existing.name as string, type: existing.type as ChannelType, createdAt: existing.created_at as string }
  }
  return createChannel(db, teamId, dmName, 'dm')
}

export async function getTaskThread(db: Db, taskId: string, teamId = ''): Promise<ChatChannel> {
  const threadName = `task:${taskId}`
  const existing = await db.queryOne<Record<string, unknown>>('SELECT * FROM chat_channels WHERE name = $1 AND team_id = $2', [threadName, teamId])
  if (existing) {
    return { id: existing.id as string, name: existing.name as string, type: existing.type as ChannelType, createdAt: existing.created_at as string }
  }
  return createChannel(db, teamId, threadName, 'task_thread')
}

// ---- Messages ----

export async function sendMessage(db: Db, channelId: string, senderType: SenderType, senderId: string, content: string, taskId?: string, teamId = '', attachments?: ChatAttachment[]): Promise<ChatMessage> {
  const attachmentsJson = attachments && attachments.length > 0 ? JSON.stringify(attachments) : null
  const insertedId = await db.insert(
    'INSERT INTO chat_messages (team_id, channel_id, sender_type, sender_id, content, task_id, attachments) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [teamId, channelId, senderType, senderId, content, taskId ?? null, attachmentsJson],
    'id',
  )
  return (await getMessage(db, Number(insertedId)))!
}

export async function getMessage(db: Db, id: number): Promise<ChatMessage | null> {
  const row = await db.queryOne<Record<string, unknown>>('SELECT * FROM chat_messages WHERE id = $1', [id])
  if (!row) return null
  return rowToMessage(row)
}

export async function getChannelMessages(db: Db, channelId: string, limit = 50, before?: number): Promise<ChatMessage[]> {
  let sql = 'SELECT * FROM chat_messages WHERE channel_id = $1'
  const params: unknown[] = [channelId]
  let paramIdx = 2

  if (before) {
    sql += ` AND id < $${paramIdx++}`
    params.push(before)
  }

  sql += ` ORDER BY id DESC LIMIT $${paramIdx}`
  params.push(limit)

  const rows = await db.query<Record<string, unknown>>(sql, params)
  return rows.map(rowToMessage).reverse()
}

// ---- Search ----

export interface ChatSearchResult {
  id: number
  channelId: string
  channelName: string
  channelType: ChannelType
  senderType: SenderType
  senderId: string
  content: string
  createdAt: string
}

export async function searchMessages(db: Db, teamId: string, query: string, limit = 20): Promise<ChatSearchResult[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT m.id, m.channel_id, c.name AS channel_name, c.type AS channel_type,
            m.sender_type, m.sender_id, m.content, m.created_at
     FROM chat_messages m
     JOIN chat_channels c ON c.id = m.channel_id
     WHERE m.team_id = $1 AND m.content ILIKE $2
     ORDER BY m.created_at DESC
     LIMIT $3`,
    [teamId, `%${query}%`, limit],
  )
  return rows.map((r) => ({
    id: r.id as number,
    channelId: r.channel_id as string,
    channelName: r.channel_name as string,
    channelType: r.channel_type as ChannelType,
    senderType: r.sender_type as SenderType,
    senderId: r.sender_id as string,
    content: r.content as string,
    createdAt: r.created_at as string,
  }))
}

// ---- Mention Processing ----

const MENTION_REGEX = /@\[([^\]]+)\]\((agent|user|file):([^)]+)\)/g

interface ParsedMention {
  displayName: string
  type: 'agent' | 'user' | 'file'
  id: string
}

function parseMentions(content: string): ParsedMention[] {
  const mentions: ParsedMention[] = []
  let match
  while ((match = MENTION_REGEX.exec(content)) !== null) {
    mentions.push({
      displayName: match[1],
      type: match[2] as ParsedMention['type'],
      id: match[3],
    })
  }
  return mentions
}

/**
 * Process @mentions in a message: send notifications and trigger agents.
 * Call fire-and-forget after sendMessage().
 */
export async function processMentions(
  db: Db,
  teamId: string,
  channelId: string,
  message: ChatMessage,
): Promise<void> {
  const mentions = parseMentions(message.content)
  if (mentions.length === 0) return

  // Lazy imports to avoid circular deps
  const { createNotification } = await import('./notifications.ts')
  const { triggerAgentNow } = await import('./scheduler.ts')

  for (const mention of mentions) {
    try {
      switch (mention.type) {
        case 'agent':
          // Notify the agent by triggering its heartbeat immediately
          await triggerAgentNow(db, mention.id, teamId)
          break

        case 'user':
          // Create a notification for the human user
          await createNotification(
            db, teamId, mention.id, 'mention',
            `You were mentioned by ${message.senderType === 'agent' ? 'an agent' : 'a team member'}`,
            message.content.slice(0, 200),
            `/chat/channels/${channelId}`,
          )
          break

        case 'file':
          // File mentions are display-only — no notification needed
          break
      }
    } catch (err) {
      console.error(`[chat] Failed to process mention ${mention.type}:${mention.id}:`, err)
    }
  }
}

function rowToMessage(row: Record<string, unknown>): ChatMessage {
  let attachments: ChatAttachment[] = []
  if (row.attachments) {
    try {
      attachments = JSON.parse(row.attachments as string) as ChatAttachment[]
    } catch { /* ignore parse errors */ }
  }
  return {
    id: row.id as number, channelId: row.channel_id as string, senderType: row.sender_type as SenderType,
    senderId: row.sender_id as string, content: row.content as string, attachments,
    taskId: row.task_id as string | null, createdAt: row.created_at as string,
  }
}

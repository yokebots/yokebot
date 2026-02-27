/**
 * chat.ts — Built-in chat: DMs, task threads, group channels
 */

import type { Db } from './db/types.ts'
import { randomUUID } from 'crypto'

export type ChannelType = 'dm' | 'group' | 'task_thread'
export type SenderType = 'human' | 'agent' | 'system'

export interface ChatChannel { id: string; name: string; type: ChannelType; createdAt: string }
export interface ChatMessage { id: number; channelId: string; senderType: SenderType; senderId: string; content: string; taskId: string | null; createdAt: string }

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

export async function sendMessage(db: Db, channelId: string, senderType: SenderType, senderId: string, content: string, taskId?: string, teamId = ''): Promise<ChatMessage> {
  const insertedId = await db.insert(
    'INSERT INTO chat_messages (team_id, channel_id, sender_type, sender_id, content, task_id) VALUES ($1, $2, $3, $4, $5, $6)',
    [teamId, channelId, senderType, senderId, content, taskId ?? null],
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

function rowToMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: row.id as number, channelId: row.channel_id as string, senderType: row.sender_type as SenderType,
    senderId: row.sender_id as string, content: row.content as string, taskId: row.task_id as string | null,
    createdAt: row.created_at as string,
  }
}

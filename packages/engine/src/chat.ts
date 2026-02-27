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

export async function createChannel(db: Db, name: string, type: ChannelType): Promise<ChatChannel> {
  const id = randomUUID()
  await db.run('INSERT INTO chat_channels (id, name, type) VALUES ($1, $2, $3)', [id, name, type])
  return (await getChannel(db, id))!
}

export async function getChannel(db: Db, id: string): Promise<ChatChannel | null> {
  const row = await db.queryOne<Record<string, unknown>>('SELECT * FROM chat_channels WHERE id = $1', [id])
  if (!row) return null
  return { id: row.id as string, name: row.name as string, type: row.type as ChannelType, createdAt: row.created_at as string }
}

export async function listChannels(db: Db): Promise<ChatChannel[]> {
  const rows = await db.query<Record<string, unknown>>('SELECT * FROM chat_channels ORDER BY created_at DESC')
  return rows.map((row) => ({ id: row.id as string, name: row.name as string, type: row.type as ChannelType, createdAt: row.created_at as string }))
}

export async function getDmChannel(db: Db, agentId: string): Promise<ChatChannel> {
  const dmName = `dm:${agentId}`
  const existing = await db.queryOne<Record<string, unknown>>('SELECT * FROM chat_channels WHERE name = $1', [dmName])
  if (existing) {
    return { id: existing.id as string, name: existing.name as string, type: existing.type as ChannelType, createdAt: existing.created_at as string }
  }
  return createChannel(db, dmName, 'dm')
}

export async function getTaskThread(db: Db, taskId: string): Promise<ChatChannel> {
  const threadName = `task:${taskId}`
  const existing = await db.queryOne<Record<string, unknown>>('SELECT * FROM chat_channels WHERE name = $1', [threadName])
  if (existing) {
    return { id: existing.id as string, name: existing.name as string, type: existing.type as ChannelType, createdAt: existing.created_at as string }
  }
  return createChannel(db, threadName, 'task_thread')
}

// ---- Messages ----

export async function sendMessage(db: Db, channelId: string, senderType: SenderType, senderId: string, content: string, taskId?: string): Promise<ChatMessage> {
  const insertedId = await db.insert(
    'INSERT INTO chat_messages (channel_id, sender_type, sender_id, content, task_id) VALUES ($1, $2, $3, $4, $5)',
    [channelId, senderType, senderId, content, taskId ?? null],
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

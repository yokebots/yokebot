/**
 * chat.ts — Built-in chat: DMs, task threads, group channels
 *
 * The primary communication layer for YokeBot. Agents and humans
 * talk here. Every task has a chat thread. DMs are for quick
 * side conversations and approval nudges.
 */

import type Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

export type ChannelType = 'dm' | 'group' | 'task_thread'
export type SenderType = 'human' | 'agent' | 'system'

export interface ChatChannel {
  id: string
  name: string
  type: ChannelType
  createdAt: string
}

export interface ChatMessage {
  id: number
  channelId: string
  senderType: SenderType
  senderId: string
  content: string
  taskId: string | null
  createdAt: string
}

// ---- Channels ----

export function createChannel(
  db: Database.Database,
  name: string,
  type: ChannelType,
): ChatChannel {
  const id = randomUUID()
  db.prepare('INSERT INTO chat_channels (id, name, type) VALUES (?, ?, ?)').run(id, name, type)
  return getChannel(db, id)!
}

export function getChannel(db: Database.Database, id: string): ChatChannel | null {
  const row = db.prepare('SELECT * FROM chat_channels WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!row) return null
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as ChannelType,
    createdAt: row.created_at as string,
  }
}

export function listChannels(db: Database.Database): ChatChannel[] {
  const rows = db.prepare('SELECT * FROM chat_channels ORDER BY created_at DESC').all() as Record<string, unknown>[]
  return rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    type: row.type as ChannelType,
    createdAt: row.created_at as string,
  }))
}

/**
 * Get or create a DM channel between a human and an agent.
 */
export function getDmChannel(db: Database.Database, agentId: string): ChatChannel {
  const dmName = `dm:${agentId}`
  const existing = db.prepare('SELECT * FROM chat_channels WHERE name = ?').get(dmName) as Record<string, unknown> | undefined
  if (existing) {
    return {
      id: existing.id as string,
      name: existing.name as string,
      type: existing.type as ChannelType,
      createdAt: existing.created_at as string,
    }
  }
  return createChannel(db, dmName, 'dm')
}

/**
 * Get or create the task thread channel for a specific task.
 */
export function getTaskThread(db: Database.Database, taskId: string): ChatChannel {
  const threadName = `task:${taskId}`
  const existing = db.prepare('SELECT * FROM chat_channels WHERE name = ?').get(threadName) as Record<string, unknown> | undefined
  if (existing) {
    return {
      id: existing.id as string,
      name: existing.name as string,
      type: existing.type as ChannelType,
      createdAt: existing.created_at as string,
    }
  }
  return createChannel(db, threadName, 'task_thread')
}

// ---- Messages ----

export function sendMessage(
  db: Database.Database,
  channelId: string,
  senderType: SenderType,
  senderId: string,
  content: string,
  taskId?: string,
): ChatMessage {
  const result = db.prepare(`
    INSERT INTO chat_messages (channel_id, sender_type, sender_id, content, task_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(channelId, senderType, senderId, content, taskId ?? null)

  return getMessage(db, Number(result.lastInsertRowid))!
}

export function getMessage(db: Database.Database, id: number): ChatMessage | null {
  const row = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!row) return null
  return rowToMessage(row)
}

export function getChannelMessages(
  db: Database.Database,
  channelId: string,
  limit = 50,
  before?: number,
): ChatMessage[] {
  let sql = 'SELECT * FROM chat_messages WHERE channel_id = ?'
  const params: unknown[] = [channelId]

  if (before) {
    sql += ' AND id < ?'
    params.push(before)
  }

  sql += ' ORDER BY id DESC LIMIT ?'
  params.push(limit)

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[]
  return rows.map(rowToMessage).reverse()
}

function rowToMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: row.id as number,
    channelId: row.channel_id as string,
    senderType: row.sender_type as SenderType,
    senderId: row.sender_id as string,
    content: row.content as string,
    taskId: row.task_id as string | null,
    createdAt: row.created_at as string,
  }
}

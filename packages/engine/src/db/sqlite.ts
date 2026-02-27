/**
 * db/sqlite.ts — SQLite adapter (wraps better-sqlite3)
 *
 * Wraps the synchronous better-sqlite3 API in the async Db interface.
 * Used for local / open-source deployments.
 */

import Database from 'better-sqlite3'
import { join } from 'path'
import { mkdirSync } from 'fs'
import type { Db } from './types.ts'

export function createSqliteDb(dataDir: string): Db {
  mkdirSync(dataDir, { recursive: true })
  const dbPath = join(dataDir, 'yokebot.db')
  const db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  return {
    driver: 'sqlite' as const,

    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
      return db.prepare(sql).all(...params) as T[]
    },

    async queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
      const row = db.prepare(sql).get(...params) as T | undefined
      return row ?? null
    },

    async run(sql: string, params: unknown[] = []): Promise<void> {
      db.prepare(sql).run(...params)
    },

    async insert(sql: string, params: unknown[] = [], _returningCol?: string): Promise<number | string> {
      const result = db.prepare(sql).run(...params)
      return Number(result.lastInsertRowid)
    },

    async exec(sql: string): Promise<void> {
      db.exec(sql)
    },

    now(): string {
      return "datetime('now')"
    },

    async close(): Promise<void> {
      db.close()
    },
  }
}

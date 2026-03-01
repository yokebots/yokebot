/**
 * db/index.ts — Database factory
 *
 * If DATABASE_URL is set, connects to Postgres (hosted cloud).
 * Otherwise, uses SQLite (local / open-source).
 */

import { createSqliteDb } from './sqlite.ts'
import { createPostgresDb } from './postgres.ts'
import { migrate } from '../state.ts'
import { runMigrations } from '../migrations.ts'
import type { Db } from './types.ts'

export type { Db } from './types.ts'

export interface DbConfig {
  dataDir: string
}

export async function createDb(config: DbConfig): Promise<Db> {
  const databaseUrl = process.env.DATABASE_URL

  let db: Db

  if (databaseUrl) {
    console.log('[db] Connecting to Postgres...')
    db = createPostgresDb(databaseUrl)

    // Verify connectivity with retries (prevents crash-loop on connection exhaustion)
    const MAX_RETRIES = 8
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await db.queryOne('SELECT 1 as ok')
        console.log('[db] Postgres connection verified')
        break
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        if (attempt === MAX_RETRIES) {
          console.error(`[db] Failed to connect after ${MAX_RETRIES} attempts: ${errMsg}`)
          throw err
        }
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 30000)
        console.warn(`[db] Connection attempt ${attempt}/${MAX_RETRIES} failed: ${errMsg} — retrying in ${delayMs / 1000}s...`)
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        // Recreate the pool in case connections are stale
        try { await db.close() } catch { /* ignore */ }
        db = createPostgresDb(databaseUrl)
      }
    }
  } else {
    console.log(`[db] Using SQLite at ${config.dataDir}/yokebot.db`)
    db = createSqliteDb(config.dataDir)
  }

  await migrate(db)
  await runMigrations(db)

  return db
}

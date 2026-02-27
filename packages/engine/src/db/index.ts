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
  } else {
    console.log(`[db] Using SQLite at ${config.dataDir}/yokebot.db`)
    db = createSqliteDb(config.dataDir)
  }

  await migrate(db)
  await runMigrations(db)

  return db
}

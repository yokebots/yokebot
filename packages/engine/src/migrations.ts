/**
 * migrations.ts — Versioned schema migration runner
 *
 * Manages incremental schema changes beyond the initial DDL.
 * Each migration runs exactly once, tracked via the schema_version table.
 */

import type { Db } from './db/types.ts'
import { randomUUID } from 'crypto'

interface Migration {
  version: number
  name: string
  up: (db: Db) => Promise<void>
}

/**
 * All migrations in order. Each runs exactly once.
 */
const migrations: Migration[] = [
  {
    version: 1,
    name: 'add_team_id_to_data_tables',
    async up(db: Db) {
      // Create a default team for existing data
      const defaultTeamId = randomUUID()

      if (db.driver === 'postgres') {
        // Insert default team
        await db.run(
          `INSERT INTO teams (id, name, created_at) VALUES ($1, $2, NOW())`,
          [defaultTeamId, 'Default Team'],
        )

        // Add team_id to 8 tables, backfill, set NOT NULL
        const tables = [
          'agents', 'messages', 'tasks', 'chat_messages',
          'chat_channels', 'approvals', 'sor_tables', 'activity_log',
        ]

        for (const table of tables) {
          await db.run(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS team_id TEXT`)
          await db.run(`UPDATE ${table} SET team_id = $1 WHERE team_id IS NULL`, [defaultTeamId])
          await db.run(`ALTER TABLE ${table} ALTER COLUMN team_id SET NOT NULL`)
          await db.run(`ALTER TABLE ${table} ALTER COLUMN team_id SET DEFAULT ''`)
          await db.run(`CREATE INDEX IF NOT EXISTS idx_${table}_team ON ${table}(team_id)`)
        }

        // Update sor_tables unique constraint to include team_id
        await db.run(`ALTER TABLE sor_tables DROP CONSTRAINT IF EXISTS sor_tables_name_key`)
        await db.run(`CREATE UNIQUE INDEX IF NOT EXISTS uq_sor_tables_team_name ON sor_tables(team_id, name)`)
      } else {
        // SQLite — can't ALTER COLUMN or SET NOT NULL, so add column + backfill
        // SQLite also can't do ADD COLUMN IF NOT EXISTS, so check first
        await db.run(
          `INSERT INTO teams (id, name, created_at) VALUES ($1, $2, datetime('now'))`,
          [defaultTeamId, 'Default Team'],
        )

        const tables = [
          'agents', 'messages', 'tasks', 'chat_messages',
          'chat_channels', 'approvals', 'sor_tables', 'activity_log',
        ]

        for (const table of tables) {
          // Check if column already exists
          const cols = await db.query<{ name: string }>(`PRAGMA table_info(${table})`)
          const hasTeamId = cols.some((c) => c.name === 'team_id')
          if (!hasTeamId) {
            await db.run(`ALTER TABLE ${table} ADD COLUMN team_id TEXT NOT NULL DEFAULT ''`)
          }
          await db.run(`UPDATE ${table} SET team_id = $1 WHERE team_id = '' OR team_id IS NULL`, [defaultTeamId])
          await db.run(`CREATE INDEX IF NOT EXISTS idx_${table}_team ON ${table}(team_id)`)
        }
      }
    },
  },
]

/**
 * Run all pending migrations.
 */
export async function runMigrations(db: Db): Promise<void> {
  // Ensure schema_version table exists
  if (db.driver === 'postgres') {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
  } else {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  }

  // Get current version
  const row = await db.queryOne<{ max_v: number | null }>(
    'SELECT MAX(version) as max_v FROM schema_version',
  )
  const currentVersion = row?.max_v ?? 0

  // Run pending migrations
  for (const migration of migrations) {
    if (migration.version <= currentVersion) continue

    console.log(`[migrations] Running migration ${migration.version}: ${migration.name}`)
    await migration.up(db)
    await db.run(
      'INSERT INTO schema_version (version, name) VALUES ($1, $2)',
      [migration.version, migration.name],
    )
    console.log(`[migrations] Completed migration ${migration.version}`)
  }
}

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
  {
    version: 2,
    name: 'add_model_id_to_agents',
    async up(db: Db) {
      // Add model_id column for logical model IDs
      if (db.driver === 'postgres') {
        await db.run('ALTER TABLE agents ADD COLUMN IF NOT EXISTS model_id TEXT')
      } else {
        const cols = await db.query<{ name: string }>('PRAGMA table_info(agents)')
        if (!cols.some((c) => c.name === 'model_id')) {
          await db.run('ALTER TABLE agents ADD COLUMN model_id TEXT')
        }
      }

      // Backfill: map known (endpoint, model_name) pairs to logical model IDs
      const backfillMap: Array<{ endpoint: string; modelName: string; logicalId: string }> = [
        // DeepInfra models
        { endpoint: 'deepinfra', modelName: 'MiniMaxAI/MiniMax-M2.5', logicalId: 'minimax-m2.5' },
        { endpoint: 'deepinfra', modelName: 'Qwen/Qwen3.5-397B-A17B', logicalId: 'qwen-3.5' },
        { endpoint: 'deepinfra', modelName: 'moonshotai/Kimi-K2.5', logicalId: 'kimi-k2.5' },
        { endpoint: 'deepinfra', modelName: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8', logicalId: 'llama-4-maverick' },
        { endpoint: 'deepinfra', modelName: 'meta-llama/Llama-4-Scout-17B-16E-Instruct', logicalId: 'llama-4-scout' },
        { endpoint: 'deepinfra', modelName: 'meta-llama/Meta-Llama-3.1-70B-Instruct', logicalId: 'llama-4-maverick' },
        { endpoint: 'deepinfra', modelName: 'meta-llama/Meta-Llama-3.1-8B-Instruct', logicalId: 'llama-4-scout' },
        { endpoint: 'deepinfra', modelName: 'deepseek-ai/DeepSeek-R1', logicalId: 'deepseek-r1' },
        { endpoint: 'deepinfra', modelName: 'deepseek-ai/DeepSeek-V3', logicalId: 'deepseek-v3' },
        { endpoint: 'deepinfra', modelName: 'Qwen/Qwen2.5-72B-Instruct', logicalId: 'qwen-3.5' },
        // Together models → map to closest logical model
        { endpoint: 'together', modelName: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', logicalId: 'llama-4-maverick' },
        { endpoint: 'together', modelName: 'deepseek-ai/DeepSeek-R1', logicalId: 'deepseek-r1' },
        { endpoint: 'together', modelName: 'deepseek-ai/DeepSeek-V3', logicalId: 'deepseek-v3' },
        // OpenAI models → no longer in catalog, map to closest frontier
        { endpoint: 'openai', modelName: 'gpt-4o', logicalId: 'minimax-m2.5' },
        { endpoint: 'openai', modelName: 'gpt-4o-mini', logicalId: 'llama-4-scout' },
      ]

      for (const mapping of backfillMap) {
        await db.run(
          'UPDATE agents SET model_id = $1 WHERE model_endpoint = $2 AND model_name = $3 AND (model_id IS NULL OR model_id = \'\')',
          [mapping.logicalId, mapping.endpoint, mapping.modelName],
        )
      }

      // Default any remaining agents to llama-4-maverick
      await db.run(
        "UPDATE agents SET model_id = 'llama-4-maverick' WHERE model_id IS NULL OR model_id = ''",
      )
    },
  },
  {
    version: 3,
    name: 'add_attachments_to_chat_messages',
    async up(db: Db) {
      if (db.driver === 'postgres') {
        await db.run('ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachments TEXT')
      } else {
        const cols = await db.query<{ name: string }>('PRAGMA table_info(chat_messages)')
        if (!cols.some((c) => c.name === 'attachments')) {
          await db.run('ALTER TABLE chat_messages ADD COLUMN attachments TEXT')
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

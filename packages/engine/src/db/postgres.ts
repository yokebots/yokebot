/**
 * db/postgres.ts — Postgres adapter (uses postgres.js)
 *
 * Connects to Supabase Postgres (or any Postgres instance) via DATABASE_URL.
 * Used for hosted cloud deployments (yokebot.com).
 */

import postgres from 'postgres'
import type { Db } from './types.ts'

export function createPostgresDb(connectionString: string): Db {
  const sql = postgres(connectionString, {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10,
  })

  return {
    driver: 'postgres' as const,

    async query<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
      const result = await sql.unsafe(query, params as postgres.SerializableParameter[])
      return result as unknown as T[]
    },

    async queryOne<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T | null> {
      const result = await sql.unsafe(query, params as postgres.SerializableParameter[])
      return (result[0] as T) ?? null
    },

    async run(query: string, params: unknown[] = []): Promise<void> {
      await sql.unsafe(query, params as postgres.SerializableParameter[])
    },

    async insert(query: string, params: unknown[] = [], returningCol = 'id'): Promise<number | string> {
      const fullQuery = `${query} RETURNING ${returningCol}`
      const result = await sql.unsafe(fullQuery, params as postgres.SerializableParameter[])
      return result[0]?.[returningCol] as number | string
    },

    async exec(query: string): Promise<void> {
      await sql.unsafe(query)
    },

    now(): string {
      return 'NOW()'
    },

    async close(): Promise<void> {
      await sql.end()
    },
  }
}

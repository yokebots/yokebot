/**
 * db/types.ts — Database adapter interface
 *
 * Abstracts SQLite and Postgres behind a common async interface.
 * All engine modules use this instead of better-sqlite3 directly.
 */

export interface Db {
  /** Which driver is active — used for dialect-specific DDL/SQL. */
  driver: 'sqlite' | 'postgres'

  /** Execute a SELECT and return all matching rows. */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>

  /** Execute a SELECT and return the first row, or null. */
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>

  /** Execute an INSERT/UPDATE/DELETE with no return value. */
  run(sql: string, params?: unknown[]): Promise<void>

  /**
   * Execute an INSERT and return the auto-generated ID.
   * For SQLite: returns lastInsertRowid.
   * For Postgres: appends RETURNING <column> and returns the value.
   */
  insert(sql: string, params?: unknown[], returningCol?: string): Promise<number | string>

  /** Execute raw SQL (DDL, multi-statement migrations). */
  exec(sql: string): Promise<void>

  /** Returns the SQL expression for "current timestamp" in the active dialect. */
  now(): string

  /** Close the database connection. */
  close(): Promise<void>
}

/**
 * sor.ts — Source of Record: CRUD for dynamic data tables
 *
 * Agents and humans can create tables, add columns, and manage rows.
 * Permissions control which agents can read/write each table.
 * Row data is stored as JSON blobs for schema flexibility.
 */

import type { Db } from './db/types.ts'
import { randomUUID } from 'crypto'

export interface SorTable {
  id: string
  name: string
  createdAt: string
}

export interface SorColumn {
  id: string
  tableId: string
  name: string
  colType: string
  position: number
}

export interface SorRow {
  id: string
  tableId: string
  data: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface SorPermission {
  agentId: string
  tableId: string
  canRead: boolean
  canWrite: boolean
}

// ---- Tables ----

export async function createSorTable(db: Db, teamId: string, name: string): Promise<SorTable> {
  const id = randomUUID()
  await db.run('INSERT INTO sor_tables (id, team_id, name) VALUES ($1, $2, $3)', [id, teamId, name])
  return (await getSorTable(db, id))!
}

export async function getSorTable(db: Db, id: string): Promise<SorTable | null> {
  const row = await db.queryOne<Record<string, unknown>>('SELECT * FROM sor_tables WHERE id = $1', [id])
  if (!row) return null
  return { id: row.id as string, name: row.name as string, createdAt: row.created_at as string }
}

export async function getSorTableByName(db: Db, name: string, teamId?: string): Promise<SorTable | null> {
  let row: Record<string, unknown> | null
  if (teamId) {
    // Team-scoped lookup (used by runtime to prevent cross-team access)
    if (db.driver === 'postgres') {
      row = await db.queryOne<Record<string, unknown>>('SELECT * FROM sor_tables WHERE LOWER(name) = LOWER($1) AND team_id = $2', [name, teamId])
    } else {
      row = await db.queryOne<Record<string, unknown>>('SELECT * FROM sor_tables WHERE name = $1 COLLATE NOCASE AND team_id = $2', [name, teamId])
    }
  } else {
    if (db.driver === 'postgres') {
      row = await db.queryOne<Record<string, unknown>>('SELECT * FROM sor_tables WHERE LOWER(name) = LOWER($1)', [name])
    } else {
      row = await db.queryOne<Record<string, unknown>>('SELECT * FROM sor_tables WHERE name = $1 COLLATE NOCASE', [name])
    }
  }
  if (!row) return null
  return { id: row.id as string, name: row.name as string, createdAt: row.created_at as string }
}

export async function listSorTables(db: Db, teamId?: string): Promise<SorTable[]> {
  if (teamId) {
    const rows = await db.query<Record<string, unknown>>('SELECT * FROM sor_tables WHERE team_id = $1 ORDER BY created_at DESC', [teamId])
    return rows.map((r) => ({ id: r.id as string, name: r.name as string, createdAt: r.created_at as string }))
  }
  const rows = await db.query<Record<string, unknown>>('SELECT * FROM sor_tables ORDER BY created_at DESC')
  return rows.map((r) => ({ id: r.id as string, name: r.name as string, createdAt: r.created_at as string }))
}

// ---- Columns ----

export async function addSorColumn(db: Db, tableId: string, name: string, colType = 'text'): Promise<SorColumn> {
  const id = randomUUID()
  const maxPos = await db.queryOne<{ m: number | null }>('SELECT MAX(position) as m FROM sor_columns WHERE table_id = $1', [tableId])
  const position = ((maxPos?.m) ?? -1) + 1
  await db.run('INSERT INTO sor_columns (id, table_id, name, col_type, position) VALUES ($1, $2, $3, $4, $5)', [id, tableId, name, colType, position])
  return { id, tableId, name, colType, position }
}

export async function listSorColumns(db: Db, tableId: string): Promise<SorColumn[]> {
  const rows = await db.query<Record<string, unknown>>('SELECT * FROM sor_columns WHERE table_id = $1 ORDER BY position', [tableId])
  return rows.map((r) => ({
    id: r.id as string, tableId: r.table_id as string, name: r.name as string,
    colType: r.col_type as string, position: r.position as number,
  }))
}

// ---- Rows ----

export async function addSorRow(db: Db, tableId: string, data: Record<string, unknown>): Promise<SorRow> {
  const id = randomUUID()
  await db.run('INSERT INTO sor_rows (id, table_id, data) VALUES ($1, $2, $3)', [id, tableId, JSON.stringify(data)])
  return (await getSorRow(db, id))!
}

export async function getSorRow(db: Db, id: string): Promise<SorRow | null> {
  const row = await db.queryOne<Record<string, unknown>>('SELECT * FROM sor_rows WHERE id = $1', [id])
  if (!row) return null
  return rowToSorRow(row)
}

export async function listSorRows(db: Db, tableId: string): Promise<SorRow[]> {
  const rows = await db.query<Record<string, unknown>>('SELECT * FROM sor_rows WHERE table_id = $1 ORDER BY created_at DESC', [tableId])
  return rows.map(rowToSorRow)
}

export async function updateSorRow(db: Db, id: string, data: Record<string, unknown>): Promise<SorRow | null> {
  const existing = await getSorRow(db, id)
  if (!existing) return null
  const merged = { ...existing.data, ...data }
  await db.run(`UPDATE sor_rows SET data = $1, updated_at = ${db.now()} WHERE id = $2`, [JSON.stringify(merged), id])
  return getSorRow(db, id)
}

export async function deleteSorRow(db: Db, id: string): Promise<void> {
  await db.run('DELETE FROM sor_rows WHERE id = $1', [id])
}

// ---- Permissions ----

export async function setSorPermission(db: Db, agentId: string, tableId: string, canRead: boolean, canWrite: boolean): Promise<void> {
  if (db.driver === 'postgres') {
    await db.run(
      `INSERT INTO sor_permissions (agent_id, table_id, can_read, can_write) VALUES ($1, $2, $3, $4)
       ON CONFLICT(agent_id, table_id) DO UPDATE SET can_read = excluded.can_read, can_write = excluded.can_write`,
      [agentId, tableId, canRead ? 1 : 0, canWrite ? 1 : 0],
    )
  } else {
    await db.run(
      `INSERT INTO sor_permissions (agent_id, table_id, can_read, can_write) VALUES ($1, $2, $3, $4)
       ON CONFLICT(agent_id, table_id) DO UPDATE SET can_read = excluded.can_read, can_write = excluded.can_write`,
      [agentId, tableId, canRead ? 1 : 0, canWrite ? 1 : 0],
    )
  }
}

export async function getSorPermissions(db: Db, tableId: string): Promise<SorPermission[]> {
  const rows = await db.query<Record<string, unknown>>('SELECT * FROM sor_permissions WHERE table_id = $1', [tableId])
  return rows.map((r) => ({
    agentId: r.agent_id as string, tableId: r.table_id as string,
    canRead: (r.can_read as number) === 1, canWrite: (r.can_write as number) === 1,
  }))
}

export async function checkSorPermission(db: Db, agentId: string, tableId: string): Promise<SorPermission | null> {
  const row = await db.queryOne<Record<string, unknown>>('SELECT * FROM sor_permissions WHERE agent_id = $1 AND table_id = $2', [agentId, tableId])
  if (!row) return null
  return {
    agentId: row.agent_id as string, tableId: row.table_id as string,
    canRead: (row.can_read as number) === 1, canWrite: (row.can_write as number) === 1,
  }
}

function rowToSorRow(row: Record<string, unknown>): SorRow {
  const rawData = row.data
  const data = typeof rawData === 'string' ? JSON.parse(rawData) as Record<string, unknown> : rawData as Record<string, unknown>
  return {
    id: row.id as string, tableId: row.table_id as string,
    data,
    createdAt: row.created_at as string, updatedAt: row.updated_at as string,
  }
}

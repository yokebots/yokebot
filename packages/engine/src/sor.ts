/**
 * sor.ts — Source of Record: CRUD for dynamic data tables
 *
 * Agents and humans can create tables, add columns, and manage rows.
 * Permissions control which agents can read/write each table.
 * Row data is stored as JSON blobs for schema flexibility.
 */

import type Database from 'better-sqlite3'
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

export function createSorTable(db: Database.Database, name: string): SorTable {
  const id = randomUUID()
  db.prepare('INSERT INTO sor_tables (id, name) VALUES (?, ?)').run(id, name)
  return getSorTable(db, id)!
}

export function getSorTable(db: Database.Database, id: string): SorTable | null {
  const row = db.prepare('SELECT * FROM sor_tables WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!row) return null
  return { id: row.id as string, name: row.name as string, createdAt: row.created_at as string }
}

export function getSorTableByName(db: Database.Database, name: string): SorTable | null {
  const row = db.prepare('SELECT * FROM sor_tables WHERE name = ? COLLATE NOCASE').get(name) as Record<string, unknown> | undefined
  if (!row) return null
  return { id: row.id as string, name: row.name as string, createdAt: row.created_at as string }
}

export function listSorTables(db: Database.Database): SorTable[] {
  const rows = db.prepare('SELECT * FROM sor_tables ORDER BY created_at DESC').all() as Record<string, unknown>[]
  return rows.map((r) => ({ id: r.id as string, name: r.name as string, createdAt: r.created_at as string }))
}

// ---- Columns ----

export function addSorColumn(db: Database.Database, tableId: string, name: string, colType = 'text'): SorColumn {
  const id = randomUUID()
  const maxPos = db.prepare('SELECT MAX(position) as m FROM sor_columns WHERE table_id = ?').get(tableId) as { m: number | null }
  const position = (maxPos.m ?? -1) + 1
  db.prepare('INSERT INTO sor_columns (id, table_id, name, col_type, position) VALUES (?, ?, ?, ?, ?)').run(id, tableId, name, colType, position)
  return { id, tableId, name, colType, position }
}

export function listSorColumns(db: Database.Database, tableId: string): SorColumn[] {
  const rows = db.prepare('SELECT * FROM sor_columns WHERE table_id = ? ORDER BY position').all(tableId) as Record<string, unknown>[]
  return rows.map((r) => ({
    id: r.id as string, tableId: r.table_id as string, name: r.name as string,
    colType: r.col_type as string, position: r.position as number,
  }))
}

// ---- Rows ----

export function addSorRow(db: Database.Database, tableId: string, data: Record<string, unknown>): SorRow {
  const id = randomUUID()
  db.prepare('INSERT INTO sor_rows (id, table_id, data) VALUES (?, ?, ?)').run(id, tableId, JSON.stringify(data))
  return getSorRow(db, id)!
}

export function getSorRow(db: Database.Database, id: string): SorRow | null {
  const row = db.prepare('SELECT * FROM sor_rows WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!row) return null
  return rowToSorRow(row)
}

export function listSorRows(db: Database.Database, tableId: string): SorRow[] {
  const rows = db.prepare('SELECT * FROM sor_rows WHERE table_id = ? ORDER BY created_at DESC').all(tableId) as Record<string, unknown>[]
  return rows.map(rowToSorRow)
}

export function updateSorRow(db: Database.Database, id: string, data: Record<string, unknown>): SorRow | null {
  const existing = getSorRow(db, id)
  if (!existing) return null
  const merged = { ...existing.data, ...data }
  db.prepare("UPDATE sor_rows SET data = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(merged), id)
  return getSorRow(db, id)
}

export function deleteSorRow(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM sor_rows WHERE id = ?').run(id)
}

// ---- Permissions ----

export function setSorPermission(db: Database.Database, agentId: string, tableId: string, canRead: boolean, canWrite: boolean): void {
  db.prepare(`
    INSERT INTO sor_permissions (agent_id, table_id, can_read, can_write) VALUES (?, ?, ?, ?)
    ON CONFLICT(agent_id, table_id) DO UPDATE SET can_read = excluded.can_read, can_write = excluded.can_write
  `).run(agentId, tableId, canRead ? 1 : 0, canWrite ? 1 : 0)
}

export function getSorPermissions(db: Database.Database, tableId: string): SorPermission[] {
  const rows = db.prepare('SELECT * FROM sor_permissions WHERE table_id = ?').all(tableId) as Record<string, unknown>[]
  return rows.map((r) => ({
    agentId: r.agent_id as string, tableId: r.table_id as string,
    canRead: (r.can_read as number) === 1, canWrite: (r.can_write as number) === 1,
  }))
}

export function checkSorPermission(db: Database.Database, agentId: string, tableId: string): SorPermission | null {
  const row = db.prepare('SELECT * FROM sor_permissions WHERE agent_id = ? AND table_id = ?').get(agentId, tableId) as Record<string, unknown> | undefined
  if (!row) return null
  return {
    agentId: row.agent_id as string, tableId: row.table_id as string,
    canRead: (row.can_read as number) === 1, canWrite: (row.can_write as number) === 1,
  }
}

function rowToSorRow(row: Record<string, unknown>): SorRow {
  return {
    id: row.id as string, tableId: row.table_id as string,
    data: JSON.parse(row.data as string) as Record<string, unknown>,
    createdAt: row.created_at as string, updatedAt: row.updated_at as string,
  }
}

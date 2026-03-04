/**
 * tags.ts — Standalone, multi-resource tagging system
 *
 * Tags are first-class entities owned by a team. They can be applied to
 * any resource type (tasks, SOR rows, files, etc.) via the polymorphic
 * resource_tags junction table.
 */

import type { Db } from './db/types.ts'
import { randomUUID } from 'crypto'

export interface Tag {
  id: string
  teamId: string
  name: string
  color: string
  createdAt: string
}

// ---- Tag CRUD ----

export async function createTag(db: Db, teamId: string, name: string, color?: string): Promise<Tag> {
  const id = randomUUID()
  const c = color ?? '#6B7280'
  if (db.driver === 'postgres') {
    await db.run(
      'INSERT INTO tags (id, team_id, name, color) VALUES ($1, $2, $3, $4) ON CONFLICT (team_id, name) DO UPDATE SET color = EXCLUDED.color RETURNING id',
      [id, teamId, name, c],
    )
    // Return the actual row (could be existing on conflict)
    const row = await db.queryOne<Record<string, unknown>>(
      'SELECT * FROM tags WHERE team_id = $1 AND name = $2',
      [teamId, name],
    )
    return rowToTag(row!)
  } else {
    await db.run(
      'INSERT OR IGNORE INTO tags (id, team_id, name, color) VALUES ($1, $2, $3, $4)',
      [id, teamId, name, c],
    )
    const row = await db.queryOne<Record<string, unknown>>(
      'SELECT * FROM tags WHERE team_id = $1 AND name = $2',
      [teamId, name],
    )
    return rowToTag(row!)
  }
}

export async function listTags(db: Db, teamId: string): Promise<Tag[]> {
  const rows = await db.query<Record<string, unknown>>(
    'SELECT * FROM tags WHERE team_id = $1 ORDER BY name',
    [teamId],
  )
  return rows.map(rowToTag)
}

export async function updateTag(db: Db, tagId: string, updates: { name?: string; color?: string }): Promise<Tag | null> {
  const existing = await db.queryOne<Record<string, unknown>>('SELECT * FROM tags WHERE id = $1', [tagId])
  if (!existing) return null

  const fields: string[] = []
  const values: unknown[] = []
  let paramIdx = 1

  if (updates.name !== undefined) { fields.push(`name = $${paramIdx++}`); values.push(updates.name) }
  if (updates.color !== undefined) { fields.push(`color = $${paramIdx++}`); values.push(updates.color) }

  if (fields.length === 0) return rowToTag(existing)

  values.push(tagId)
  await db.run(`UPDATE tags SET ${fields.join(', ')} WHERE id = $${paramIdx}`, values)

  const row = await db.queryOne<Record<string, unknown>>('SELECT * FROM tags WHERE id = $1', [tagId])
  return row ? rowToTag(row) : null
}

export async function deleteTag(db: Db, tagId: string): Promise<void> {
  await db.run('DELETE FROM tags WHERE id = $1', [tagId])
}

// ---- Resource tagging ----

export async function tagResource(db: Db, teamId: string, tagId: string, resourceType: string, resourceId: string): Promise<void> {
  if (db.driver === 'postgres') {
    await db.run(
      'INSERT INTO resource_tags (tag_id, resource_type, resource_id, team_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
      [tagId, resourceType, resourceId, teamId],
    )
  } else {
    await db.run(
      'INSERT OR IGNORE INTO resource_tags (tag_id, resource_type, resource_id, team_id) VALUES ($1, $2, $3, $4)',
      [tagId, resourceType, resourceId, teamId],
    )
  }
}

export async function untagResource(db: Db, tagId: string, resourceType: string, resourceId: string): Promise<void> {
  await db.run(
    'DELETE FROM resource_tags WHERE tag_id = $1 AND resource_type = $2 AND resource_id = $3',
    [tagId, resourceType, resourceId],
  )
}

export async function getResourceTags(db: Db, resourceType: string, resourceId: string): Promise<Tag[]> {
  const rows = await db.query<Record<string, unknown>>(
    'SELECT t.* FROM tags t JOIN resource_tags rt ON rt.tag_id = t.id WHERE rt.resource_type = $1 AND rt.resource_id = $2 ORDER BY t.name',
    [resourceType, resourceId],
  )
  return rows.map(rowToTag)
}

export async function bulkSetResourceTags(db: Db, teamId: string, tagIds: string[], resourceType: string, resourceId: string): Promise<void> {
  // Remove all existing tags for this resource
  await db.run(
    'DELETE FROM resource_tags WHERE resource_type = $1 AND resource_id = $2',
    [resourceType, resourceId],
  )
  // Insert new ones
  for (const tagId of tagIds) {
    if (db.driver === 'postgres') {
      await db.run(
        'INSERT INTO resource_tags (tag_id, resource_type, resource_id, team_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
        [tagId, resourceType, resourceId, teamId],
      )
    } else {
      await db.run(
        'INSERT OR IGNORE INTO resource_tags (tag_id, resource_type, resource_id, team_id) VALUES ($1, $2, $3, $4)',
        [tagId, resourceType, resourceId, teamId],
      )
    }
  }
}

/**
 * Upsert tags by name and apply them to a resource. Used by agent tools
 * that pass tag names rather than IDs.
 */
export async function applyTagsByName(db: Db, teamId: string, tagNames: string[], resourceType: string, resourceId: string): Promise<Tag[]> {
  const tags: Tag[] = []
  for (const name of tagNames) {
    const tag = await createTag(db, teamId, name.trim())
    tags.push(tag)
  }
  const tagIds = tags.map((t) => t.id)
  // Append (don't replace) — agent might be adding to existing tags
  for (const tagId of tagIds) {
    await tagResource(db, teamId, tagId, resourceType, resourceId)
  }
  return tags
}

// ---- Helpers ----

function rowToTag(row: Record<string, unknown>): Tag {
  return {
    id: row.id as string,
    teamId: row.team_id as string,
    name: row.name as string,
    color: row.color as string,
    createdAt: row.created_at as string,
  }
}

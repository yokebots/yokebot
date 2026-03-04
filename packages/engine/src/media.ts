/**
 * media.ts — Download and persist generated media to workspace
 *
 * When agents generate images/video/3D, the result is a temporary URL
 * from fal.ai. This module downloads the file and saves it to the team's
 * workspace (DB-backed) so it becomes part of the knowledge base.
 */

import type { Db } from './db/types.ts'
import { writeBinaryFile } from './workspace.ts'

export type MediaType = 'images' | 'video' | '3d'

export interface MediaAttachment {
  type: 'image' | 'video' | '3d'
  url: string              // relative workspace path
  thumbnailUrl?: string
  filename: string
  mimeType: string
  width?: number
  height?: number
}

/**
 * Download media from a temporary URL and save to workspace.
 * Returns the relative workspace path.
 */
export async function downloadAndSave(
  db: Db,
  teamId: string,
  mediaType: MediaType,
  sourceUrl: string,
  filename: string,
): Promise<string> {
  // Generate timestamped filename
  const timestamp = new Date().toISOString().slice(0, 10)
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const fullFilename = `${timestamp}_${safeFilename}`
  const relativePath = `${teamId}/media/${mediaType}/${fullFilename}`

  // Download the file
  const res = await fetch(sourceUrl)
  if (!res.ok) throw new Error(`Failed to download media: ${res.status}`)

  const buffer = Buffer.from(await res.arrayBuffer())
  const mimeType = guessMimeType(filename)

  // Save to DB
  await writeBinaryFile(db, teamId, relativePath, buffer, mimeType, 'system')

  return relativePath
}

/**
 * Determine MIME type from filename extension.
 */
export function guessMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const mimeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    mp4: 'video/mp4',
    webm: 'video/webm',
    glb: 'model/gltf-binary',
    gltf: 'model/gltf+json',
    obj: 'model/obj',
  }
  return mimeMap[ext ?? ''] ?? 'application/octet-stream'
}

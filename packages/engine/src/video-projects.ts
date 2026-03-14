/**
 * video-projects.ts — Video project CRUD: projects, scenes, and assets
 *
 * A VideoProject is the top-level container for a video production pipeline.
 * It links to a workflow run and contains ordered scenes with attached assets.
 */

import type { Db } from './db/types.ts'
import { randomUUID } from 'crypto'

// ---- Types ----

export type VideoProjectStatus = 'draft' | 'in_progress' | 'completed' | 'archived'
export type AssetType = 'image' | 'video' | 'audio' | 'voiceover' | 'music' | 'sfx'
export type AssetSource = 'generated' | 'uploaded' | 'stock'
export type TransitionType = 'cut' | 'fade' | 'dissolve' | 'wipe' | 'slide' | 'zoom' | 'blur' | 'push'
export type TrackType = 'main' | 'overlay' | 'caption' | 'voiceover' | 'music' | 'sfx'

export type FormatPreset = 'landscape_fhd' | 'landscape_720' | 'portrait_9_16' | 'square_1_1' | 'portrait_4_5' | 'ultrawide_21_9'

export interface FormatPresetInfo {
  id: FormatPreset
  width: number
  height: number
  aspect: string
  label: string
  platforms: string
}

export const FORMAT_PRESETS: FormatPresetInfo[] = [
  { id: 'landscape_fhd', width: 1920, height: 1080, aspect: '16:9', label: 'Landscape Full HD (16:9)', platforms: 'YouTube, Vimeo, websites, presentations, TV' },
  { id: 'landscape_720', width: 1280, height: 720, aspect: '16:9', label: 'Landscape 720p (16:9)', platforms: 'Faster renders, email embeds, lower bandwidth' },
  { id: 'portrait_9_16', width: 1080, height: 1920, aspect: '9:16', label: 'Vertical (9:16)', platforms: 'TikTok, Instagram Reels, YouTube Shorts, Snapchat' },
  { id: 'square_1_1', width: 1080, height: 1080, aspect: '1:1', label: 'Square (1:1)', platforms: 'Instagram posts, Facebook feed, LinkedIn, Twitter/X' },
  { id: 'portrait_4_5', width: 1080, height: 1350, aspect: '4:5', label: 'Portrait (4:5)', platforms: 'Instagram feed (more screen space than square)' },
  { id: 'ultrawide_21_9', width: 2560, height: 1080, aspect: '21:9', label: 'Ultrawide (21:9)', platforms: 'Cinematic, film-style, hero banners' },
]

export interface VideoProject {
  id: string
  teamId: string
  name: string
  description: string
  workflowRunId: string | null
  status: VideoProjectStatus
  settings: string  // JSON: { formatPreset, fps, resolution }
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface VideoScene {
  id: string
  projectId: string
  sceneOrder: number
  title: string
  scriptText: string
  imagePrompt: string
  durationMs: number
  transition: TransitionType
  sceneData: string  // JSON: render_video compatible scene format
  createdAt: string
  updatedAt: string
}

export interface VideoAsset {
  id: string
  projectId: string
  sceneId: string | null
  type: AssetType
  source: AssetSource
  filePath: string
  filename: string
  durationMs: number | null
  mimeType: string
  metadata: string  // JSON: prompt, model, originalPath, originalAssetId, etc.
  track: TrackType
  startMs: number
  createdAt: string
}

// ---- Project CRUD ----

export async function createVideoProject(
  db: Db,
  teamId: string,
  name: string,
  opts?: { description?: string; workflowRunId?: string; settings?: string; createdBy?: string },
): Promise<VideoProject> {
  const id = randomUUID()
  const settings = opts?.settings ?? JSON.stringify({ formatPreset: 'landscape_fhd', fps: 30, resolution: { width: 1920, height: 1080 } })
  await db.run(
    'INSERT INTO video_projects (id, team_id, name, description, workflow_run_id, settings, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [id, teamId, name, opts?.description ?? '', opts?.workflowRunId ?? null, settings, opts?.createdBy ?? ''],
  )
  return (await getVideoProject(db, id))!
}

export async function getVideoProject(db: Db, id: string): Promise<VideoProject | null> {
  const row = await db.queryOne<Record<string, unknown>>('SELECT * FROM video_projects WHERE id = $1', [id])
  if (!row) return null
  return rowToProject(row)
}

export async function listVideoProjects(db: Db, teamId: string, status?: VideoProjectStatus): Promise<VideoProject[]> {
  let sql = 'SELECT * FROM video_projects WHERE team_id = $1'
  const params: unknown[] = [teamId]
  if (status) {
    sql += ' AND status = $2'
    params.push(status)
  }
  sql += ' ORDER BY created_at DESC'
  const rows = await db.query<Record<string, unknown>>(sql, params)
  return rows.map(rowToProject)
}

export async function updateVideoProject(
  db: Db,
  id: string,
  updates: { name?: string; description?: string; workflowRunId?: string | null; status?: VideoProjectStatus; settings?: string },
): Promise<VideoProject | null> {
  const fields: string[] = []
  const values: unknown[] = []
  let paramIdx = 1

  if (updates.name !== undefined) { fields.push(`name = $${paramIdx++}`); values.push(updates.name) }
  if (updates.description !== undefined) { fields.push(`description = $${paramIdx++}`); values.push(updates.description) }
  if (updates.workflowRunId !== undefined) { fields.push(`workflow_run_id = $${paramIdx++}`); values.push(updates.workflowRunId) }
  if (updates.status !== undefined) { fields.push(`status = $${paramIdx++}`); values.push(updates.status) }
  if (updates.settings !== undefined) { fields.push(`settings = $${paramIdx++}`); values.push(updates.settings) }

  if (fields.length === 0) return getVideoProject(db, id)

  fields.push(`updated_at = ${db.now()}`)
  values.push(id)

  await db.run(`UPDATE video_projects SET ${fields.join(', ')} WHERE id = $${paramIdx}`, values)
  return getVideoProject(db, id)
}

export async function deleteVideoProject(db: Db, id: string): Promise<void> {
  await db.run('DELETE FROM video_projects WHERE id = $1', [id])
}

// ---- Scene CRUD ----

export async function addScene(
  db: Db,
  projectId: string,
  title: string,
  opts?: { scriptText?: string; imagePrompt?: string; durationMs?: number; transition?: TransitionType; sceneData?: string; sceneOrder?: number },
): Promise<VideoScene> {
  const id = randomUUID()
  let sceneOrder = opts?.sceneOrder
  if (sceneOrder === undefined) {
    const row = await db.queryOne<{ max_order: number | null }>(
      'SELECT MAX(scene_order) as max_order FROM video_scenes WHERE project_id = $1',
      [projectId],
    )
    sceneOrder = (row?.max_order ?? -1) + 1
  }
  await db.run(
    'INSERT INTO video_scenes (id, project_id, scene_order, title, script_text, image_prompt, duration_ms, transition, scene_data) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    [id, projectId, sceneOrder, title, opts?.scriptText ?? '', opts?.imagePrompt ?? '', opts?.durationMs ?? 5000, opts?.transition ?? 'cut', opts?.sceneData ?? '{}'],
  )
  return (await getScene(db, id))!
}

export async function getScene(db: Db, id: string): Promise<VideoScene | null> {
  const row = await db.queryOne<Record<string, unknown>>('SELECT * FROM video_scenes WHERE id = $1', [id])
  if (!row) return null
  return rowToScene(row)
}

export async function listScenes(db: Db, projectId: string): Promise<VideoScene[]> {
  const rows = await db.query<Record<string, unknown>>(
    'SELECT * FROM video_scenes WHERE project_id = $1 ORDER BY scene_order ASC',
    [projectId],
  )
  return rows.map(rowToScene)
}

export async function updateScene(
  db: Db,
  id: string,
  updates: { title?: string; scriptText?: string; imagePrompt?: string; durationMs?: number; transition?: TransitionType; sceneData?: string },
): Promise<VideoScene | null> {
  const fields: string[] = []
  const values: unknown[] = []
  let paramIdx = 1

  if (updates.title !== undefined) { fields.push(`title = $${paramIdx++}`); values.push(updates.title) }
  if (updates.scriptText !== undefined) { fields.push(`script_text = $${paramIdx++}`); values.push(updates.scriptText) }
  if (updates.imagePrompt !== undefined) { fields.push(`image_prompt = $${paramIdx++}`); values.push(updates.imagePrompt) }
  if (updates.durationMs !== undefined) { fields.push(`duration_ms = $${paramIdx++}`); values.push(updates.durationMs) }
  if (updates.transition !== undefined) { fields.push(`transition = $${paramIdx++}`); values.push(updates.transition) }
  if (updates.sceneData !== undefined) { fields.push(`scene_data = $${paramIdx++}`); values.push(updates.sceneData) }

  if (fields.length === 0) return getScene(db, id)

  fields.push(`updated_at = ${db.now()}`)
  values.push(id)

  await db.run(`UPDATE video_scenes SET ${fields.join(', ')} WHERE id = $${paramIdx}`, values)
  return getScene(db, id)
}

export async function deleteScene(db: Db, id: string): Promise<void> {
  await db.run('DELETE FROM video_scenes WHERE id = $1', [id])
}

export async function reorderScenes(db: Db, projectId: string, sceneIds: string[]): Promise<void> {
  for (let i = 0; i < sceneIds.length; i++) {
    await db.run(
      'UPDATE video_scenes SET scene_order = $1 WHERE id = $2 AND project_id = $3',
      [i, sceneIds[i], projectId],
    )
  }
}

// ---- Asset CRUD ----

export async function addAsset(
  db: Db,
  projectId: string,
  type: AssetType,
  filePath: string,
  opts?: { sceneId?: string; source?: AssetSource; filename?: string; durationMs?: number; mimeType?: string; metadata?: string; track?: TrackType; startMs?: number },
): Promise<VideoAsset> {
  const id = randomUUID()
  await db.run(
    'INSERT INTO video_assets (id, project_id, scene_id, type, source, file_path, filename, duration_ms, mime_type, metadata, track, start_ms) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
    [id, projectId, opts?.sceneId ?? null, type, opts?.source ?? 'generated', filePath, opts?.filename ?? '', opts?.durationMs ?? null, opts?.mimeType ?? '', opts?.metadata ?? '{}', opts?.track ?? 'main', opts?.startMs ?? 0],
  )
  return (await getAsset(db, id))!
}

export async function getAsset(db: Db, id: string): Promise<VideoAsset | null> {
  const row = await db.queryOne<Record<string, unknown>>('SELECT * FROM video_assets WHERE id = $1', [id])
  if (!row) return null
  return rowToAsset(row)
}

export async function listAssets(db: Db, projectId: string, sceneId?: string): Promise<VideoAsset[]> {
  let sql = 'SELECT * FROM video_assets WHERE project_id = $1'
  const params: unknown[] = [projectId]
  if (sceneId) {
    sql += ' AND scene_id = $2'
    params.push(sceneId)
  }
  sql += ' ORDER BY track ASC, start_ms ASC'
  const rows = await db.query<Record<string, unknown>>(sql, params)
  return rows.map(rowToAsset)
}

export async function updateAsset(
  db: Db,
  id: string,
  updates: { sceneId?: string | null; track?: TrackType; startMs?: number; durationMs?: number | null; metadata?: string },
): Promise<VideoAsset | null> {
  const fields: string[] = []
  const values: unknown[] = []
  let paramIdx = 1

  if (updates.sceneId !== undefined) { fields.push(`scene_id = $${paramIdx++}`); values.push(updates.sceneId) }
  if (updates.track !== undefined) { fields.push(`track = $${paramIdx++}`); values.push(updates.track) }
  if (updates.startMs !== undefined) { fields.push(`start_ms = $${paramIdx++}`); values.push(updates.startMs) }
  if (updates.durationMs !== undefined) { fields.push(`duration_ms = $${paramIdx++}`); values.push(updates.durationMs) }
  if (updates.metadata !== undefined) { fields.push(`metadata = $${paramIdx++}`); values.push(updates.metadata) }

  if (fields.length === 0) return getAsset(db, id)

  values.push(id)
  await db.run(`UPDATE video_assets SET ${fields.join(', ')} WHERE id = $${paramIdx}`, values)
  return getAsset(db, id)
}

export async function deleteAsset(db: Db, id: string): Promise<void> {
  await db.run('DELETE FROM video_assets WHERE id = $1', [id])
}

// ---- Row converters ----

function rowToProject(row: Record<string, unknown>): VideoProject {
  return {
    id: row.id as string,
    teamId: row.team_id as string,
    name: row.name as string,
    description: (row.description as string) ?? '',
    workflowRunId: row.workflow_run_id as string | null,
    status: (row.status as VideoProjectStatus) ?? 'draft',
    settings: (row.settings as string) ?? '{}',
    createdBy: (row.created_by as string) ?? '',
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

function rowToScene(row: Record<string, unknown>): VideoScene {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    sceneOrder: row.scene_order as number,
    title: (row.title as string) ?? '',
    scriptText: (row.script_text as string) ?? '',
    imagePrompt: (row.image_prompt as string) ?? '',
    durationMs: (row.duration_ms as number) ?? 5000,
    transition: (row.transition as TransitionType) ?? 'cut',
    sceneData: (row.scene_data as string) ?? '{}',
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

// ---- Transcription ----

export interface TranscriptionSegment {
  start: number  // seconds
  end: number
  text: string
}

export interface TranscriptionWord {
  word: string
  start: number  // seconds
  end: number
}

export interface Transcription {
  segments: TranscriptionSegment[]
  words: TranscriptionWord[]
  fullText: string
  model: string
  processedAt: string
}

export interface TranscriptEdit {
  type: 'delete' | 'split'
  startMs?: number
  endMs?: number
  atMs?: number
}

/**
 * Transcribe an audio/voiceover asset using DeepInfra Voxtral.
 * Stores word-level and segment-level timestamps in asset metadata.
 */
export async function transcribeAsset(
  db: Db,
  assetId: string,
  audioBuffer: Buffer,
  filename: string,
): Promise<VideoAsset | null> {
  const apiKey = process.env.DEEPINFRA_API_KEY
  if (!apiKey) throw new Error('DEEPINFRA_API_KEY not configured')

  const formData = new FormData()
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/mpeg' })
  formData.append('file', blob, filename || 'audio.mp3')
  formData.append('model', 'mistralai/Voxtral-Mini-4B-Realtime-2602')
  formData.append('response_format', 'verbose_json')
  formData.append('timestamp_granularities[]', 'word')
  formData.append('timestamp_granularities[]', 'segment')

  const res = await fetch('https://api.deepinfra.com/v1/openai/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: formData,
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Transcription failed (${res.status}): ${errText.slice(0, 200)}`)
  }

  const data = await res.json() as {
    text: string
    segments?: TranscriptionSegment[]
    words?: Array<{ word: string; start: number; end: number }>
  }

  const transcription: Transcription = {
    segments: data.segments ?? [],
    words: (data.words ?? []).map(w => ({ word: w.word, start: w.start, end: w.end })),
    fullText: data.text,
    model: 'voxtral-mini-realtime',
    processedAt: new Date().toISOString(),
  }

  // If no word-level data, derive words from segments
  if (transcription.words.length === 0 && transcription.segments.length > 0) {
    for (const seg of transcription.segments) {
      const words = seg.text.trim().split(/\s+/)
      const segDur = seg.end - seg.start
      const wordDur = segDur / Math.max(words.length, 1)
      words.forEach((w, i) => {
        transcription.words.push({
          word: w,
          start: seg.start + i * wordDur,
          end: seg.start + (i + 1) * wordDur,
        })
      })
    }
  }

  // Merge transcription into existing metadata
  const asset = await getAsset(db, assetId)
  if (!asset) return null

  let existingMeta: Record<string, unknown> = {}
  try { existingMeta = JSON.parse(asset.metadata) } catch { /* */ }
  existingMeta.transcription = transcription

  return updateAsset(db, assetId, { metadata: JSON.stringify(existingMeta) })
}

function rowToAsset(row: Record<string, unknown>): VideoAsset {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    sceneId: row.scene_id as string | null,
    type: row.type as AssetType,
    source: (row.source as AssetSource) ?? 'generated',
    filePath: row.file_path as string,
    filename: (row.filename as string) ?? '',
    durationMs: row.duration_ms as number | null,
    mimeType: (row.mime_type as string) ?? '',
    metadata: (row.metadata as string) ?? '{}',
    track: (row.track as TrackType) ?? 'main',
    startMs: (row.start_ms as number) ?? 0,
    createdAt: row.created_at as string,
  }
}

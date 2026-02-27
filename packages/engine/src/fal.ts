/**
 * fal.ts — fal.ai client for media generation
 *
 * Handles image (Nano Banana Pro), video (Kling 3.0, Seedance 2.0),
 * and 3D (Hunyuan 3D 3.1) generation via fal.ai's queue-based API.
 *
 * Flow: submit job → poll status → return result
 */

import type { Db } from './db/types.ts'
import { getStoredProvider } from './model.ts'

const FAL_BASE_URL = 'https://queue.fal.run'
const POLL_INTERVAL_MS = 2000
const MAX_POLL_TIME_MS = 5 * 60 * 1000 // 5 minutes

export interface FalResult {
  images?: Array<{ url: string; width: number; height: number; content_type: string }>
  video?: { url: string; content_type: string }
  model_mesh?: { url: string; content_type: string; file_name: string }
  [key: string]: unknown
}

/**
 * Resolve the fal.ai API key from DB (self-hosted) or env var (hosted).
 */
async function getFalApiKey(db: Db): Promise<string> {
  // Env var takes priority (hosted mode via /ee)
  const envKey = process.env.FAL_API_KEY
  if (envKey) return envKey

  // DB-stored key (self-hosted)
  const stored = await getStoredProvider(db, 'fal')
  if (stored?.enabled && stored.apiKey) return stored.apiKey

  throw new Error('No fal.ai API key configured. Add one in Settings → Model Providers.')
}

/**
 * Submit a job to fal.ai and wait for the result.
 */
export async function falGenerate(
  db: Db,
  falModelId: string,
  input: Record<string, unknown>,
): Promise<FalResult> {
  const apiKey = await getFalApiKey(db)

  // Submit job
  const submitRes = await fetch(`${FAL_BASE_URL}/${falModelId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Key ${apiKey}`,
    },
    body: JSON.stringify(input),
  })

  if (!submitRes.ok) {
    const text = await submitRes.text()
    throw new Error(`fal.ai submit error ${submitRes.status}: ${text}`)
  }

  const submitData = await submitRes.json() as { request_id: string; status?: string }

  // If the response already contains a result (synchronous mode), return it
  if (!submitData.request_id) {
    return submitData as unknown as FalResult
  }

  // Poll for completion
  const startTime = Date.now()
  while (Date.now() - startTime < MAX_POLL_TIME_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))

    const statusRes = await fetch(
      `${FAL_BASE_URL}/${falModelId}/requests/${submitData.request_id}/status`,
      { headers: { 'Authorization': `Key ${apiKey}` } },
    )

    if (!statusRes.ok) continue

    const statusData = await statusRes.json() as { status: string }

    if (statusData.status === 'COMPLETED') {
      // Fetch the result
      const resultRes = await fetch(
        `${FAL_BASE_URL}/${falModelId}/requests/${submitData.request_id}`,
        { headers: { 'Authorization': `Key ${apiKey}` } },
      )
      if (!resultRes.ok) {
        const text = await resultRes.text()
        throw new Error(`fal.ai result fetch error ${resultRes.status}: ${text}`)
      }
      return await resultRes.json() as FalResult
    }

    if (statusData.status === 'FAILED') {
      throw new Error('fal.ai job failed')
    }
  }

  throw new Error('fal.ai job timed out after 5 minutes')
}

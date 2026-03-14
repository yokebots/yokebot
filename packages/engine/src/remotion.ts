/**
 * remotion.ts — DEPRECATED
 *
 * Remotion has been replaced by video-render.ts (node-canvas + FFmpeg).
 * This file is kept only to avoid breaking any stale imports.
 */

export interface RenderOptions {
  compositionCode: string
  durationInFrames?: number
  fps?: number
  width?: number
  height?: number
  inputProps?: Record<string, unknown>
}

export interface RenderResult {
  buffer: Buffer
  durationSeconds: number
}

export async function renderComposition(_opts: RenderOptions): Promise<RenderResult> {
  throw new Error('Remotion has been replaced. Use the render_video tool with JSON scenes instead.')
}

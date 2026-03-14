/**
 * remotion.ts — Server-side video rendering via Remotion
 *
 * Bundles agent-provided React composition code, renders to MP4 via
 * headless Chromium. Concurrency-limited to 1 render at a time to
 * stay within Railway memory limits.
 *
 * Chromium is downloaded on-demand by Remotion's ensureBrowser() on
 * first render — NOT baked into the Docker image (too heavy, causes
 * healthcheck failures on Railway).
 */

import { mkdtemp, writeFile, readFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

// Tell Remotion to use system Chromium instead of downloading its own.
// The Docker image has chromium installed at /usr/bin/chromium but the
// non-root yokebot user can't write to node_modules/.remotion (EACCES).
const SYSTEM_CHROMIUM = process.env.REMOTION_CHROME_EXECUTABLE ?? process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH

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

// Concurrency guard — max 1 render at a time
let rendering = false
let browserReady = false

const RENDER_TIMEOUT_MS = 3 * 60 * 1000 // 3 minutes

export async function renderComposition(opts: RenderOptions): Promise<RenderResult> {
  if (rendering) {
    throw new Error('Another video render is in progress. Please wait and try again.')
  }

  const {
    compositionCode,
    durationInFrames = 150,
    fps = 30,
    width = 1920,
    height = 1080,
    inputProps = {},
  } = opts

  const tmpDir = await mkdtemp(join(tmpdir(), `yokebot-remotion-${randomUUID().slice(0, 8)}-`))
  rendering = true

  try {
    // Dynamic imports — .js extension for compiled output gotcha
    const { bundle } = await import('@remotion/bundler')
    const { renderMedia, selectComposition, ensureBrowser } = await import('@remotion/renderer')

    // Use system Chromium if available, otherwise download on first render
    if (!browserReady) {
      if (SYSTEM_CHROMIUM) {
        console.log(`[remotion] Using system browser: ${SYSTEM_CHROMIUM}`)
      } else {
        console.log('[remotion] Downloading browser for first render...')
        await ensureBrowser()
        console.log('[remotion] Browser ready')
      }
      browserReady = true
    }

    // Write the user's composition component
    const compositionPath = join(tmpDir, 'Composition.tsx')
    await writeFile(compositionPath, compositionCode, 'utf-8')

    // Write the entry point that registers the composition
    const entryPath = join(tmpDir, 'entry.tsx')
    await writeFile(entryPath, `
import { registerRoot } from 'remotion';
import { Composition } from 'remotion';
import React from 'react';
import MyComp from './Composition';

const Root: React.FC = () => {
  return (
    <Composition
      id="Main"
      component={MyComp}
      durationInFrames={${durationInFrames}}
      fps={${fps}}
      width={${width}}
      height={${height}}
      defaultProps={${JSON.stringify(inputProps)}}
    />
  );
};

registerRoot(Root);
`, 'utf-8')

    // Bundle the composition
    const bundleLocation = await bundle({
      entryPoint: entryPath,
      onProgress: () => {},
    })

    // Select the composition
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: 'Main',
      inputProps,
      ...(SYSTEM_CHROMIUM ? { browserExecutable: SYSTEM_CHROMIUM } : {}),
    })

    // Render to MP4
    const outputPath = join(tmpDir, 'output.mp4')

    await Promise.race([
      renderMedia({
        composition,
        serveUrl: bundleLocation,
        codec: 'h264',
        outputLocation: outputPath,
        ...(SYSTEM_CHROMIUM ? { browserExecutable: SYSTEM_CHROMIUM } : {}),
        chromiumOptions: {
          enableMultiProcessOnLinux: true,
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Render timed out after 3 minutes')), RENDER_TIMEOUT_MS)
      ),
    ])

    const buffer = await readFile(outputPath)

    return {
      buffer,
      durationSeconds: durationInFrames / fps,
    }
  } finally {
    rendering = false
    rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

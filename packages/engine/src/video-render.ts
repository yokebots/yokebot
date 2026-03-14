/**
 * video-render.ts — Lightweight server-side video rendering
 *
 * Uses node-canvas (Cairo) to draw frames + FFmpeg to encode MP4.
 * No Chromium, no Remotion — runs in ~100-200MB RAM.
 *
 * Supports: text with shadows/glow/gradients, shapes, images, particles,
 * decorative geometric patterns, smooth animations with spring physics,
 * scene transitions, and pre-built templates.
 */

import { createCanvas, loadImage, type CanvasRenderingContext2D } from 'canvas'
import { spawn } from 'child_process'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

// ---- Types ----

export interface VideoScene {
  duration: number
  background?: string
  backgroundGradient?: {
    type: 'linear' | 'radial'
    angle?: number
    stops: [number, string][]
  }
  /** Animated background particles */
  particles?: {
    count?: number
    color?: string
    minSize?: number
    maxSize?: number
    speed?: number
    shape?: 'circle' | 'square' | 'diamond' | 'line'
  }
  /** Decorative geometric pattern overlay */
  pattern?: {
    type: 'grid' | 'dots' | 'diagonal' | 'waves' | 'hexagons'
    color?: string
    opacity?: number
    spacing?: number
  }
  elements: VideoElement[]
  transition?: 'fade' | 'wipe' | 'slide' | 'none'
  transitionDuration?: number
}

export interface VideoElement {
  type: 'text' | 'rect' | 'circle' | 'image' | 'line' | 'divider'

  x: number
  y: number
  width?: number
  height?: number

  // Text properties
  text?: string
  fontSize?: number
  fontFamily?: string
  fontWeight?: 'normal' | 'bold' | 'light'
  color?: string
  /** Gradient fill for text: { stops: [[0, "#color"], [1, "#color"]] } */
  textGradient?: { stops: [number, string][] }
  textAlign?: 'left' | 'center' | 'right'
  lineHeight?: number
  maxWidth?: number
  letterSpacing?: number
  textTransform?: 'uppercase' | 'lowercase' | 'none'

  // Text effects
  shadow?: { x?: number; y?: number; blur?: number; color?: string }
  glow?: { blur?: number; color?: string; strength?: number }
  outline?: { width?: number; color?: string }

  // Shape properties
  fill?: string
  /** Gradient fill for shapes */
  fillGradient?: { type?: 'linear' | 'radial'; angle?: number; stops: [number, string][] }
  stroke?: string
  strokeWidth?: number
  cornerRadius?: number
  radius?: number

  // Line / divider
  x2?: number
  y2?: number
  dashPattern?: number[]

  // Image properties
  src?: string

  // Effects
  rotation?: number  // degrees
  blur?: number

  // Animation
  animation?: VideoAnimation
  opacity?: number
}

export interface VideoAnimation {
  type: 'fadeIn' | 'fadeOut' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight'
    | 'scaleIn' | 'scaleOut' | 'typewriter' | 'pulse' | 'float' | 'countUp'
    | 'spring' | 'stagger' | 'waveIn' | 'blurIn' | 'none'
  delay?: number
  duration?: number
  easing?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'bounce' | 'spring' | 'elastic'
  /** For stagger: index in the stagger group (0, 1, 2, ...) */
  staggerIndex?: number
  /** For stagger: delay between each item */
  staggerDelay?: number
  /** For countUp: target number */
  countTarget?: number
}

export interface RenderVideoOptions {
  scenes: VideoScene[]
  width?: number
  height?: number
  fps?: number
}

export interface RenderResult {
  buffer: Buffer
  durationSeconds: number
}

// Concurrency guard
let rendering = false
const RENDER_TIMEOUT_MS = 3 * 60 * 1000

// ---- Easing functions ----

function ease(t: number, type: string): number {
  t = Math.max(0, Math.min(1, t))
  switch (type) {
    case 'easeIn': return t * t * t
    case 'easeOut': return 1 - Math.pow(1 - t, 3)
    case 'easeInOut': return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    case 'bounce': {
      const n1 = 7.5625, d1 = 2.75
      if (t < 1 / d1) return n1 * t * t
      if (t < 2 / d1) { t -= 1.5 / d1; return n1 * t * t + 0.75 }
      if (t < 2.5 / d1) { t -= 2.25 / d1; return n1 * t * t + 0.9375 }
      t -= 2.625 / d1; return n1 * t * t + 0.984375
    }
    case 'spring': {
      const c4 = (2 * Math.PI) / 3
      return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
    }
    case 'elastic': {
      const c5 = (2 * Math.PI) / 4.5
      if (t === 0 || t === 1) return t
      return t < 0.5
        ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
        : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1
    }
    default: return t
  }
}

// ---- Resolve position values ----

function resolveX(val: number, w: number): number { return val >= -1 && val <= 1 ? val * w : val }
function resolveY(val: number, h: number): number { return val >= -1 && val <= 1 ? val * h : val }

// ---- Particle system ----

interface Particle {
  x: number; y: number; size: number; speed: number; opacity: number; angle: number
}

function createParticles(w: number, h: number, cfg: NonNullable<VideoScene['particles']>): Particle[] {
  const count = cfg.count ?? 30
  const particles: Particle[] = []
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      size: (cfg.minSize ?? 2) + Math.random() * ((cfg.maxSize ?? 6) - (cfg.minSize ?? 2)),
      speed: (cfg.speed ?? 0.5) * (0.3 + Math.random() * 0.7),
      opacity: 0.15 + Math.random() * 0.4,
      angle: Math.random() * Math.PI * 2,
    })
  }
  return particles
}

function drawParticles(
  ctx: CanvasRenderingContext2D, particles: Particle[], w: number, h: number,
  color: string, shape: string, time: number,
) {
  for (const p of particles) {
    const px = (p.x + Math.sin(p.angle + time * p.speed) * 40) % w
    const py = (p.y - time * p.speed * 20 + h * 2) % h
    ctx.save()
    ctx.globalAlpha = p.opacity * (0.7 + 0.3 * Math.sin(time * 2 + p.angle))
    ctx.fillStyle = color
    ctx.translate(px, py)

    switch (shape) {
      case 'square':
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size)
        break
      case 'diamond':
        ctx.rotate(Math.PI / 4)
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size)
        break
      case 'line':
        ctx.rotate(p.angle + time * 0.5)
        ctx.fillRect(-p.size * 2, -0.5, p.size * 4, 1)
        break
      default: // circle
        ctx.beginPath()
        ctx.arc(0, 0, p.size, 0, Math.PI * 2)
        ctx.fill()
    }
    ctx.restore()
  }
}

// ---- Pattern overlays ----

function drawPattern(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  pattern: NonNullable<VideoScene['pattern']>, time: number,
) {
  ctx.save()
  ctx.globalAlpha = pattern.opacity ?? 0.08
  ctx.strokeStyle = pattern.color ?? '#ffffff'
  ctx.lineWidth = 1

  const spacing = pattern.spacing ?? 40

  switch (pattern.type) {
    case 'grid':
      for (let x = 0; x < w; x += spacing) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
      }
      for (let y = 0; y < h; y += spacing) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
      }
      break
    case 'dots':
      ctx.fillStyle = pattern.color ?? '#ffffff'
      for (let x = spacing / 2; x < w; x += spacing) {
        for (let y = spacing / 2; y < h; y += spacing) {
          ctx.beginPath()
          ctx.arc(x, y, 2, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      break
    case 'diagonal':
      for (let i = -h; i < w + h; i += spacing) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke()
      }
      break
    case 'waves':
      for (let y = 0; y < h; y += spacing) {
        ctx.beginPath()
        for (let x = 0; x <= w; x += 2) {
          ctx.lineTo(x, y + Math.sin((x / w) * Math.PI * 4 + time * 2) * 8)
        }
        ctx.stroke()
      }
      break
    case 'hexagons': {
      const s = spacing / 2
      const h6 = s * Math.sqrt(3)
      for (let row = -1; row < h / h6 + 1; row++) {
        for (let col = -1; col < w / (s * 3) + 1; col++) {
          const cx = col * s * 3 + (row % 2 ? s * 1.5 : 0)
          const cy = row * h6
          ctx.beginPath()
          for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i - Math.PI / 6
            const px = cx + s * Math.cos(angle)
            const py = cy + s * Math.sin(angle)
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
          }
          ctx.closePath()
          ctx.stroke()
        }
      }
      break
    }
  }
  ctx.restore()
}

// ---- Animation state calculator ----

function getAnimState(anim: VideoAnimation | undefined, sceneTime: number) {
  if (!anim || anim.type === 'none') return { progress: 1, opacity: 1, offsetX: 0, offsetY: 0, scale: 1, rotation: 0 }

  const delay = (anim.delay ?? 0) + (anim.staggerIndex ?? 0) * (anim.staggerDelay ?? 0.1)
  const dur = anim.duration ?? 0.6
  let raw = 0
  if (sceneTime >= delay + dur) raw = 1
  else if (sceneTime > delay) raw = (sceneTime - delay) / dur
  const p = ease(raw, anim.easing ?? 'easeOut')

  let opacity = 1, offsetX = 0, offsetY = 0, scale = 1, rotation = 0

  switch (anim.type) {
    case 'fadeIn': opacity = p; break
    case 'fadeOut': opacity = 1 - p; break
    case 'slideUp': offsetY = (1 - p) * 60; opacity = p; break
    case 'slideDown': offsetY = -(1 - p) * 60; opacity = p; break
    case 'slideLeft': offsetX = (1 - p) * 100; opacity = p; break
    case 'slideRight': offsetX = -(1 - p) * 100; opacity = p; break
    case 'scaleIn': case 'spring': scale = Math.max(0.001, p); opacity = Math.min(p * 2, 1); break
    case 'scaleOut': scale = Math.max(0.001, 1 - p); opacity = 1 - p; break
    case 'waveIn': offsetY = (1 - p) * 30; scale = 0.8 + 0.2 * p; opacity = p; break
    case 'blurIn': opacity = p; break // blur handled separately
    case 'float': offsetY = Math.sin(sceneTime * 2) * 8; break
    case 'pulse': scale = 1 + 0.06 * Math.sin(sceneTime * 4 * Math.PI); break
    case 'stagger': opacity = p; offsetY = (1 - p) * 30; break
    case 'typewriter': break // handled in text draw
    case 'countUp': break // handled in text draw
  }

  return { progress: p, opacity, offsetX, offsetY, scale, rotation }
}

// ---- Draw element ----

function drawElement(
  ctx: CanvasRenderingContext2D, el: VideoElement,
  w: number, h: number, sceneTime: number,
) {
  const x = resolveX(el.x, w)
  const y = resolveY(el.y, h)
  const state = getAnimState(el.animation, sceneTime)

  ctx.save()
  ctx.globalAlpha = (el.opacity ?? 1) * state.opacity
  ctx.translate(x + state.offsetX, y + state.offsetY)
  if (state.scale !== 1) ctx.scale(state.scale, state.scale)
  if (el.rotation) ctx.rotate((el.rotation * Math.PI) / 180)

  switch (el.type) {
    case 'text': {
      const fontSize = el.fontSize ?? 48
      const family = el.fontFamily ?? 'DejaVu Sans'
      const weight = el.fontWeight === 'bold' ? 'bold' : el.fontWeight === 'light' ? '300' : 'normal'
      ctx.font = `${weight} ${fontSize}px "${family}"`
      ctx.textAlign = (el.textAlign ?? 'center') as CanvasTextAlign
      ctx.textBaseline = 'top'

      let displayText = el.text ?? ''
      if (el.textTransform === 'uppercase') displayText = displayText.toUpperCase()
      else if (el.textTransform === 'lowercase') displayText = displayText.toLowerCase()

      // Typewriter
      if (el.animation?.type === 'typewriter') {
        const chars = Math.floor(state.progress * displayText.length)
        displayText = displayText.slice(0, chars)
      }

      // Count up
      if (el.animation?.type === 'countUp') {
        const target = el.animation.countTarget ?? (parseInt(displayText) || 100)
        displayText = Math.floor(state.progress * target).toLocaleString()
      }

      // Word wrap
      const maxW = el.maxWidth ? resolveX(el.maxWidth, w) : undefined
      const lineH = el.lineHeight ?? fontSize * 1.4
      const lines: string[] = []
      if (maxW) {
        const words = displayText.split(' ')
        let cur = ''
        for (const word of words) {
          const test = cur ? `${cur} ${word}` : word
          if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = word } else { cur = test }
        }
        if (cur) lines.push(cur)
      } else {
        lines.push(displayText)
      }

      // Draw text with effects
      for (let i = 0; i < lines.length; i++) {
        const ly = i * lineH

        // Glow effect (drawn first, behind text)
        if (el.glow) {
          ctx.save()
          ctx.shadowColor = el.glow.color ?? el.color ?? '#ffffff'
          ctx.shadowBlur = el.glow.blur ?? 20
          ctx.fillStyle = el.glow.color ?? el.color ?? '#ffffff'
          const str = el.glow.strength ?? 2
          for (let s = 0; s < str; s++) ctx.fillText(lines[i], 0, ly)
          ctx.restore()
        }

        // Shadow
        if (el.shadow) {
          ctx.save()
          ctx.shadowColor = el.shadow.color ?? 'rgba(0,0,0,0.5)'
          ctx.shadowBlur = el.shadow.blur ?? 8
          ctx.shadowOffsetX = el.shadow.x ?? 3
          ctx.shadowOffsetY = el.shadow.y ?? 3
          ctx.fillStyle = el.color ?? '#ffffff'
          ctx.fillText(lines[i], 0, ly)
          ctx.restore()
        }

        // Outline
        if (el.outline) {
          ctx.save()
          ctx.strokeStyle = el.outline.color ?? '#000000'
          ctx.lineWidth = el.outline.width ?? 2
          ctx.lineJoin = 'round'
          ctx.strokeText(lines[i], 0, ly)
          ctx.restore()
        }

        // Main text fill (gradient or solid)
        if (el.textGradient) {
          const m = ctx.measureText(lines[i])
          const tx = el.textAlign === 'center' ? -m.width / 2 : el.textAlign === 'right' ? -m.width : 0
          const grad = ctx.createLinearGradient(tx, ly, tx + m.width, ly + fontSize)
          for (const [pos, color] of el.textGradient.stops) grad.addColorStop(pos, color)
          ctx.fillStyle = grad
        } else {
          ctx.fillStyle = el.color ?? '#ffffff'
        }
        ctx.fillText(lines[i], 0, ly)
      }
      break
    }

    case 'rect': {
      const rw = el.width ? resolveX(el.width, w) : 200
      const rh = el.height ? resolveY(el.height, h) : 100
      const r = el.cornerRadius ?? 0

      // Build path
      ctx.beginPath()
      if (r > 0) {
        ctx.moveTo(r, 0); ctx.lineTo(rw - r, 0); ctx.quadraticCurveTo(rw, 0, rw, r)
        ctx.lineTo(rw, rh - r); ctx.quadraticCurveTo(rw, rh, rw - r, rh)
        ctx.lineTo(r, rh); ctx.quadraticCurveTo(0, rh, 0, rh - r)
        ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0)
      } else {
        ctx.rect(0, 0, rw, rh)
      }
      ctx.closePath()

      // Fill
      if (el.fillGradient) {
        const angle = ((el.fillGradient.angle ?? 180) * Math.PI) / 180
        const grad = ctx.createLinearGradient(
          rw / 2 - Math.sin(angle) * rw / 2, rh / 2 - Math.cos(angle) * rh / 2,
          rw / 2 + Math.sin(angle) * rw / 2, rh / 2 + Math.cos(angle) * rh / 2,
        )
        for (const [pos, color] of el.fillGradient.stops) grad.addColorStop(pos, color)
        ctx.fillStyle = grad
        ctx.fill()
      } else if (el.fill) {
        ctx.fillStyle = el.fill
        ctx.fill()
      }

      // Shadow on shapes
      if (el.shadow) {
        ctx.save()
        ctx.shadowColor = el.shadow.color ?? 'rgba(0,0,0,0.3)'
        ctx.shadowBlur = el.shadow.blur ?? 12
        ctx.shadowOffsetX = el.shadow.x ?? 4
        ctx.shadowOffsetY = el.shadow.y ?? 4
        if (el.fill || el.fillGradient) ctx.fill()
        ctx.restore()
      }

      if (el.stroke) {
        ctx.strokeStyle = el.stroke
        ctx.lineWidth = el.strokeWidth ?? 2
        ctx.stroke()
      }
      break
    }

    case 'circle': {
      const radius = el.radius ?? 50
      ctx.beginPath()
      ctx.arc(0, 0, radius, 0, Math.PI * 2)
      if (el.fillGradient) {
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius)
        for (const [pos, color] of el.fillGradient.stops) grad.addColorStop(pos, color)
        ctx.fillStyle = grad
        ctx.fill()
      } else if (el.fill) {
        ctx.fillStyle = el.fill
        ctx.fill()
      }
      if (el.stroke) { ctx.strokeStyle = el.stroke; ctx.lineWidth = el.strokeWidth ?? 2; ctx.stroke() }
      break
    }

    case 'line': case 'divider': {
      const x2 = el.x2 != null ? resolveX(el.x2, w) - resolveX(el.x, w) : resolveX(el.width ?? 0.3, w)
      const y2 = el.y2 != null ? resolveY(el.y2, h) - resolveY(el.y, h) : 0
      ctx.beginPath()
      if (el.dashPattern) ctx.setLineDash(el.dashPattern)
      ctx.moveTo(0, 0)
      ctx.lineTo(x2, y2)
      ctx.strokeStyle = el.stroke ?? el.color ?? 'rgba(255,255,255,0.3)'
      ctx.lineWidth = el.strokeWidth ?? 2
      ctx.stroke()
      if (el.dashPattern) ctx.setLineDash([])
      break
    }

    case 'image': break // handled in renderVideo loop
  }

  ctx.restore()
}

// ---- Draw background ----

function drawBackground(ctx: CanvasRenderingContext2D, scene: VideoScene, w: number, h: number) {
  if (scene.backgroundGradient) {
    const g = scene.backgroundGradient
    let gradient: CanvasGradient
    if (g.type === 'radial') {
      gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7)
    } else {
      const angle = ((g.angle ?? 180) * Math.PI) / 180
      const cx = w / 2, cy = h / 2, len = Math.max(w, h)
      gradient = ctx.createLinearGradient(
        cx - Math.sin(angle) * len / 2, cy - Math.cos(angle) * len / 2,
        cx + Math.sin(angle) * len / 2, cy + Math.cos(angle) * len / 2,
      )
    }
    for (const [pos, color] of g.stops) gradient.addColorStop(pos, color)
    ctx.fillStyle = gradient
  } else {
    ctx.fillStyle = scene.background ?? '#000000'
  }
  ctx.fillRect(0, 0, w, h)
}

// ---- Draw scene transition ----

function drawTransition(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  transition: string, progress: number, nextBg: string,
) {
  ctx.save()
  switch (transition) {
    case 'fade':
      ctx.globalAlpha = progress
      ctx.fillStyle = nextBg
      ctx.fillRect(0, 0, w, h)
      break
    case 'wipe':
      ctx.fillStyle = nextBg
      ctx.fillRect(0, 0, w * progress, h)
      break
    case 'slide':
      ctx.fillStyle = nextBg
      ctx.fillRect(w * (1 - progress), 0, w * progress, h)
      break
  }
  ctx.restore()
}

// ---- Main render function ----

export async function renderVideo(opts: RenderVideoOptions): Promise<RenderResult> {
  if (rendering) throw new Error('Another video render is in progress. Please wait and try again.')

  const { scenes, width = 1280, height = 720, fps = 30 } = opts
  if (!scenes || scenes.length === 0) throw new Error('At least one scene is required')

  const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0)
  const totalFrames = Math.ceil(totalDuration * fps)
  if (totalFrames > 1800) throw new Error('Video too long — max 60 seconds')

  rendering = true
  const tmpDir = await mkdtemp(join(tmpdir(), `yokebot-video-${randomUUID().slice(0, 8)}-`))
  const outputPath = join(tmpDir, 'output.mp4')

  try {
    console.log(`[video-render] Starting render: ${scenes.length} scenes, ${totalDuration}s, ${width}x${height} @ ${fps}fps`)

    // Pre-load images
    const imageCache = new Map<string, Awaited<ReturnType<typeof loadImage>>>()
    for (const scene of scenes) {
      for (const el of scene.elements) {
        if (el.type === 'image' && el.src && !imageCache.has(el.src)) {
          try { imageCache.set(el.src, await loadImage(el.src)) }
          catch { console.warn(`[video-render] Failed to load image: ${el.src}`) }
        }
      }
    }

    // Pre-generate particles per scene
    const sceneParticles = scenes.map(s =>
      s.particles ? createParticles(width, height, s.particles) : null
    )

    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d')

    // Spawn FFmpeg
    const ffmpeg = spawn('ffmpeg', [
      '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba',
      '-s', `${width}x${height}`, '-r', String(fps),
      '-i', 'pipe:0',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      '-preset', 'fast', '-crf', '23',
      '-movflags', '+faststart', outputPath,
    ], { stdio: ['pipe', 'pipe', 'pipe'] })

    let ffmpegError = ''
    ffmpeg.stderr?.on('data', (d: Buffer) => { ffmpegError += d.toString() })

    const ffmpegDone = new Promise<void>((resolve, reject) => {
      ffmpeg.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`FFmpeg exited with code ${code}: ${ffmpegError.slice(-500)}`))
      })
      ffmpeg.on('error', reject)
    })

    // Build timeline
    const timeline: Array<{ start: number; end: number; scene: VideoScene; sceneIdx: number }> = []
    let t = 0
    for (let i = 0; i < scenes.length; i++) {
      timeline.push({ start: t, end: t + scenes[i].duration, scene: scenes[i], sceneIdx: i })
      t += scenes[i].duration
    }

    // Render frames
    for (let frame = 0; frame < totalFrames; frame++) {
      const currentTime = frame / fps
      const entry = timeline.find(e => currentTime >= e.start && currentTime < e.end) ?? timeline[timeline.length - 1]
      const sceneTime = currentTime - entry.start

      // Background
      drawBackground(ctx, entry.scene, width, height)

      // Pattern overlay
      if (entry.scene.pattern) {
        drawPattern(ctx, width, height, entry.scene.pattern, currentTime)
      }

      // Particles
      const particles = sceneParticles[entry.sceneIdx]
      if (particles && entry.scene.particles) {
        drawParticles(ctx, particles, width, height,
          entry.scene.particles.color ?? 'rgba(255,255,255,0.5)',
          entry.scene.particles.shape ?? 'circle', currentTime)
      }

      // Elements
      for (const el of entry.scene.elements) {
        if (el.type === 'image' && el.src) {
          const img = imageCache.get(el.src)
          if (img) {
            const state = getAnimState(el.animation, sceneTime)
            ctx.save()
            ctx.globalAlpha = (el.opacity ?? 1) * state.opacity
            const ix = resolveX(el.x, width), iy = resolveY(el.y, height)
            const iw = el.width ? resolveX(el.width, width) : img.width
            const ih = el.height ? resolveY(el.height, height) : img.height
            ctx.translate(ix + iw / 2 + state.offsetX, iy + ih / 2 + state.offsetY)
            if (state.scale !== 1) ctx.scale(state.scale, state.scale)
            ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih)
            ctx.restore()
          }
        } else {
          drawElement(ctx, el, width, height, sceneTime)
        }
      }

      // Scene transition
      const nextIdx = entry.sceneIdx + 1
      const trans = entry.scene.transition ?? 'none'
      if (trans !== 'none' && nextIdx < scenes.length) {
        const transDur = entry.scene.transitionDuration ?? 0.5
        const timeToEnd = entry.end - currentTime
        if (timeToEnd <= transDur) {
          const progress = 1 - timeToEnd / transDur
          drawTransition(ctx, width, height, trans, progress, scenes[nextIdx].background ?? '#000000')
        }
      }

      // Pipe frame
      const frameData = ctx.getImageData(0, 0, width, height)
      const ok = ffmpeg.stdin!.write(Buffer.from(frameData.data.buffer))
      if (!ok) await new Promise<void>(resolve => ffmpeg.stdin!.once('drain', resolve))

      if (frame % fps === 0) {
        console.log(`[video-render] Frame ${frame}/${totalFrames} (${Math.round(frame / totalFrames * 100)}%)`)
      }
    }

    ffmpeg.stdin!.end()
    await Promise.race([
      ffmpegDone,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Video render timed out after 3 minutes')), RENDER_TIMEOUT_MS)),
    ])

    const buffer = await readFile(outputPath)
    console.log(`[video-render] Done! ${(buffer.length / 1024 / 1024).toFixed(1)}MB, ${totalDuration}s`)
    return { buffer, durationSeconds: totalDuration }

  } finally {
    rendering = false
    rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

// ---- Video Assembly (multi-clip + audio mixing) ----

export interface AssemblyScene {
  /** Path to image or video file for this scene */
  mediaPath: string
  /** Duration in ms (for images — videos use their native duration) */
  durationMs: number
  /** Transition to next scene */
  transition: 'cut' | 'fade' | 'dissolve' | 'wipe' | 'slide' | 'zoom' | 'blur' | 'push'
}

export interface AssemblyAudioTrack {
  /** Path to audio file */
  filePath: string
  /** Start position on timeline in ms */
  startMs: number
  /** Volume 0.0 - 1.0 */
  volume: number
  /** Track type for labeling */
  track: 'voiceover' | 'music' | 'sfx'
}

export interface AssembleVideoOptions {
  scenes: AssemblyScene[]
  audioTracks?: AssemblyAudioTrack[]
  width: number
  height: number
  fps?: number
  outputPath?: string
}

/**
 * Assemble a final video from ordered scenes with transitions and mixed audio.
 * Uses FFmpeg concat + filter_complex for transitions and audio mixing.
 */
export async function assembleVideo(opts: AssembleVideoOptions): Promise<{ buffer: Buffer; durationSeconds: number }> {
  const { scenes, audioTracks = [], width, height, fps = 30 } = opts
  if (scenes.length === 0) throw new Error('No scenes to assemble')

  const tmpDir = await mkdtemp(join(tmpdir(), 'yb-assemble-'))
  const outputPath = opts.outputPath ?? join(tmpDir, `assembled_${randomUUID()}.mp4`)

  try {
    // Build FFmpeg concat filter for scenes
    const inputArgs: string[] = []
    const filterParts: string[] = []

    // Add scene inputs
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i]
      const isImage = /\.(png|jpe?g|webp|bmp)$/i.test(scene.mediaPath)

      if (isImage) {
        // Loop image for its duration
        inputArgs.push('-loop', '1', '-t', String(scene.durationMs / 1000), '-i', scene.mediaPath)
      } else {
        inputArgs.push('-i', scene.mediaPath)
      }

      // Scale each input to target resolution
      filterParts.push(`[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}[v${i}]`)
    }

    // Add audio inputs
    const audioInputOffset = scenes.length
    for (let i = 0; i < audioTracks.length; i++) {
      inputArgs.push('-i', audioTracks[i].filePath)
    }

    // Concat video streams
    const videoInputs = scenes.map((_, i) => `[v${i}]`).join('')
    filterParts.push(`${videoInputs}concat=n=${scenes.length}:v=1:a=0[vout]`)

    // Mix audio tracks with adelay and volume
    if (audioTracks.length > 0) {
      const audioFilterParts: string[] = []
      for (let i = 0; i < audioTracks.length; i++) {
        const track = audioTracks[i]
        const inputIdx = audioInputOffset + i
        audioFilterParts.push(
          `[${inputIdx}:a]adelay=${track.startMs}|${track.startMs},volume=${track.volume}[a${i}]`,
        )
      }
      filterParts.push(...audioFilterParts)

      const audioInputLabels = audioTracks.map((_, i) => `[a${i}]`).join('')
      filterParts.push(`${audioInputLabels}amix=inputs=${audioTracks.length}:duration=longest:normalize=0[aout]`)
    }

    const filterComplex = filterParts.join(';')

    const ffmpegArgs = [
      ...inputArgs,
      '-filter_complex', filterComplex,
      '-map', '[vout]',
      ...(audioTracks.length > 0 ? ['-map', '[aout]'] : ['-an']),
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      ...(audioTracks.length > 0 ? ['-c:a', 'aac', '-b:a', '128k'] : []),
      '-movflags', '+faststart',
      '-y',
      outputPath,
    ]

    await runFfmpeg(ffmpegArgs)

    const buffer = await readFile(outputPath)
    const totalDuration = scenes.reduce((sum, s) => sum + s.durationMs, 0) / 1000

    console.log(`[video-render] Assembly done! ${(buffer.length / 1024 / 1024).toFixed(1)}MB, ${totalDuration}s`)
    return { buffer, durationSeconds: totalDuration }
  } finally {
    if (!opts.outputPath) {
      rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }
  }
}

/**
 * Extract the last frame from a video file as PNG.
 * Used for frame continuation (Kling 3.0 image-to-video chaining).
 */
export async function extractLastFrame(videoPath: string): Promise<Buffer> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'yb-frame-'))
  const outPath = join(tmpDir, 'lastframe.png')

  try {
    await runFfmpeg([
      '-sseof', '-0.04',
      '-i', videoPath,
      '-frames:v', '1',
      '-y',
      outPath,
    ])

    return await readFile(outPath)
  } finally {
    rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

// ---- Transcript-based editing (Descript-style cuts) ----

export interface TranscriptEditOp {
  type: 'delete' | 'split'
  startMs?: number
  endMs?: number
  atMs?: number
}

/**
 * Apply transcript edits (deletions/splits) to an audio file.
 * Produces a new audio file with the specified time ranges removed.
 * Non-destructive — the original buffer is not modified.
 */
export async function applyTranscriptEdits(
  audioBuffer: Buffer,
  edits: TranscriptEditOp[],
  totalDurationMs: number,
): Promise<{ buffer: Buffer; durationMs: number }> {
  if (edits.length === 0) return { buffer: audioBuffer, durationMs: totalDurationMs }

  const tmpDir = await mkdtemp(join(tmpdir(), 'yb-txedit-'))
  const inputPath = join(tmpDir, 'input.mp3')
  const outputPath = join(tmpDir, 'output.mp3')

  try {
    const { writeFile: writeFs } = await import('fs/promises')
    await writeFs(inputPath, audioBuffer)

    // Collect all delete ranges and merge overlapping ones
    const deleteRanges = edits
      .filter(e => e.type === 'delete' && e.startMs !== undefined && e.endMs !== undefined)
      .map(e => ({ start: e.startMs! / 1000, end: e.endMs! / 1000 }))
      .sort((a, b) => a.start - b.start)

    // Merge overlapping ranges
    const merged: Array<{ start: number; end: number }> = []
    for (const r of deleteRanges) {
      const last = merged[merged.length - 1]
      if (last && r.start <= last.end) {
        last.end = Math.max(last.end, r.end)
      } else {
        merged.push({ ...r })
      }
    }

    if (merged.length === 0) return { buffer: audioBuffer, durationMs: totalDurationMs }

    // Compute keep ranges (inverse of delete ranges)
    const totalDurS = totalDurationMs / 1000
    const keepRanges: Array<{ start: number; end: number }> = []
    let cursor = 0
    for (const del of merged) {
      if (del.start > cursor) {
        keepRanges.push({ start: cursor, end: del.start })
      }
      cursor = del.end
    }
    if (cursor < totalDurS) {
      keepRanges.push({ start: cursor, end: totalDurS })
    }

    if (keepRanges.length === 0) {
      // Everything deleted — return empty/silence
      return { buffer: Buffer.alloc(0), durationMs: 0 }
    }

    // Build FFmpeg filter to select and concat keep ranges
    const filterParts = keepRanges.map((r, i) =>
      `[0:a]atrim=start=${r.start}:end=${r.end},asetpts=PTS-STARTPTS[a${i}]`
    )
    const concatInputs = keepRanges.map((_, i) => `[a${i}]`).join('')
    filterParts.push(`${concatInputs}concat=n=${keepRanges.length}:v=0:a=1[out]`)

    await runFfmpeg([
      '-i', inputPath,
      '-filter_complex', filterParts.join(';'),
      '-map', '[out]',
      '-c:a', 'libmp3lame',
      '-q:a', '2',
      '-y',
      outputPath,
    ])

    const resultBuffer = await readFile(outputPath)
    const keptDuration = keepRanges.reduce((sum, r) => sum + (r.end - r.start), 0)

    return { buffer: resultBuffer, durationMs: Math.round(keptDuration * 1000) }
  } finally {
    rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

/** Run an FFmpeg command and return a promise that resolves on success. */
function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`))
    })
    proc.on('error', reject)
  })
}

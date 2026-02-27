import { useEffect, useRef } from 'react'

/**
 * Organic gradient mesh — slow-moving luminous blobs
 * that blend together like an aurora. Uses the forest
 * green + gold brand palette.
 */

interface Orb {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  color: [number, number, number]
}

const ORB_CONFIGS: Array<{ color: [number, number, number]; radiusMin: number; radiusMax: number }> = [
  { color: [45, 90, 61], radiusMin: 200, radiusMax: 350 },    // forest green
  { color: [34, 120, 70], radiusMin: 150, radiusMax: 300 },   // lighter green
  { color: [212, 160, 23], radiusMin: 100, radiusMax: 250 },  // gold
  { color: [45, 90, 61], radiusMin: 250, radiusMax: 400 },    // forest green large
  { color: [22, 78, 50], radiusMin: 180, radiusMax: 320 },    // deep green
  { color: [180, 140, 20], radiusMin: 120, radiusMax: 220 },  // muted gold
]

export function ParticleConstellation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const orbsRef = useRef<Orb[]>([])
  const rafRef = useRef<number>(0)
  const mouseRef = useRef({ x: -1000, y: -1000 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = 0
    let h = 0

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      w = rect.width
      h = rect.height
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.scale(dpr, dpr)
    }

    const initOrbs = () => {
      orbsRef.current = ORB_CONFIGS.map((cfg) => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: cfg.radiusMin + Math.random() * (cfg.radiusMax - cfg.radiusMin),
        color: cfg.color,
      }))
    }

    const animate = () => {
      ctx.clearRect(0, 0, w, h)

      const orbs = orbsRef.current
      const mouse = mouseRef.current

      for (const orb of orbs) {
        // Drift
        orb.x += orb.vx
        orb.y += orb.vy

        // Bounce off edges with padding
        const pad = orb.radius * 0.3
        if (orb.x < -pad || orb.x > w + pad) orb.vx *= -1
        if (orb.y < -pad || orb.y > h + pad) orb.vy *= -1

        // Subtle mouse attraction
        const dx = mouse.x - orb.x
        const dy = mouse.y - orb.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 400 && dist > 0) {
          orb.vx += (dx / dist) * 0.003
          orb.vy += (dy / dist) * 0.003
        }

        // Dampen
        orb.vx *= 0.998
        orb.vy *= 0.998

        // Draw radial gradient blob
        const gradient = ctx.createRadialGradient(
          orb.x, orb.y, 0,
          orb.x, orb.y, orb.radius,
        )
        const [r, g, b] = orb.color
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.15)`)
        gradient.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, 0.08)`)
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)

        ctx.beginPath()
        ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2)
        ctx.fillStyle = gradient
        ctx.fill()
      }

      rafRef.current = requestAnimationFrame(animate)
    }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    const handleMouseLeave = () => {
      mouseRef.current = { x: -1000, y: -1000 }
    }

    resize()
    initOrbs()
    rafRef.current = requestAnimationFrame(animate)

    window.addEventListener('resize', () => { resize(); initOrbs() })
    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mouseleave', handleMouseLeave)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-0 h-full w-full"
      style={{ pointerEvents: 'auto' }}
    />
  )
}

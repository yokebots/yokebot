import { useRef, useCallback, useEffect, useState, type ReactNode } from 'react'

interface ResizablePanelProps {
  children: ReactNode
  defaultWidth: number
  minWidth: number
  maxWidth: number
  storageKey: string
  side: 'left' | 'right'
  className?: string
  collapsed?: boolean
  'data-tour'?: string
}

export function ResizablePanel({
  children,
  defaultWidth,
  minWidth,
  maxWidth,
  storageKey,
  side,
  className = '',
  collapsed = false,
  'data-tour': dataTour,
}: ResizablePanelProps) {
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem(`workspace-panel-${storageKey}`)
    return saved ? Math.max(minWidth, Math.min(maxWidth, Number(saved))) : defaultWidth
  })

  // Use refs to avoid stale closures in mousemove/mouseup handlers
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)
  const currentWidth = useRef(width)
  currentWidth.current = width

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragging.current = true
    startX.current = e.clientX
    startWidth.current = currentWidth.current
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  // Register listeners once — no dependencies that change during drag
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      e.preventDefault()
      const delta = side === 'left'
        ? e.clientX - startX.current
        : startX.current - e.clientX
      const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth.current + delta))
      setWidth(newWidth)
      currentWidth.current = newWidth
    }

    const onMouseUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      localStorage.setItem(`workspace-panel-${storageKey}`, String(currentWidth.current))
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [minWidth, maxWidth, side, storageKey])

  if (collapsed) return null

  const handle = (
    <div
      onMouseDown={onMouseDown}
      className={`group absolute top-0 bottom-0 z-10 w-2 cursor-col-resize ${
        side === 'left' ? 'right-0 translate-x-1/2' : 'left-0 -translate-x-1/2'
      }`}
    >
      <div className={`absolute top-0 bottom-0 w-px bg-transparent group-hover:bg-forest-green/40 group-active:bg-forest-green/60 transition-colors ${
        side === 'left' ? 'right-1/2' : 'left-1/2'
      }`} />
      <div className={`absolute top-1/2 -translate-y-1/2 h-8 w-1 rounded-full bg-transparent group-hover:bg-forest-green/40 group-active:bg-forest-green/60 transition-colors ${
        side === 'left' ? 'right-[calc(50%-2px)]' : 'left-[calc(50%-2px)]'
      }`} />
    </div>
  )

  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width }}
      data-tour={dataTour}
    >
      {children}
      {handle}
    </div>
  )
}

/** Horizontal resizable divider (for splitting top/bottom). */
interface HorizontalDividerProps {
  storageKey: string
  minRatio?: number
  maxRatio?: number
  onRatioChange: (ratio: number) => void
}

export function HorizontalDivider({
  storageKey,
  minRatio = 0.15,
  maxRatio = 0.85,
  onRatioChange,
}: HorizontalDividerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const dragging = useRef(false)
  // Keep a stable ref to the callback so the effect doesn't re-run when parent re-renders
  const onRatioChangeRef = useRef(onRatioChange)
  onRatioChangeRef.current = onRatioChange

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragging.current = true
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }, [])

  // Register listeners once — stable refs prevent stale closures
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      e.preventDefault()
      const parent = containerRef.current?.parentElement
      if (!parent) return
      const rect = parent.getBoundingClientRect()
      const ratio = Math.max(minRatio, Math.min(maxRatio, (e.clientY - rect.top) / rect.height))
      onRatioChangeRef.current(ratio)
    }

    const onMouseUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [minRatio, maxRatio, storageKey])

  return (
    <div
      ref={containerRef}
      onMouseDown={onMouseDown}
      className="group relative z-10 shrink-0 cursor-row-resize"
      style={{ height: 8 }}
    >
      {/* Visible line — only appears on hover/drag */}
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-border-subtle group-hover:bg-forest-green/40 group-active:bg-forest-green/60 transition-colors" />
      {/* Grab indicator dot */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-1 w-8 rounded-full bg-transparent group-hover:bg-forest-green/40 group-active:bg-forest-green/60 transition-colors" />
    </div>
  )
}

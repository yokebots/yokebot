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
}: ResizablePanelProps) {
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem(`workspace-panel-${storageKey}`)
    return saved ? Math.max(minWidth, Math.min(maxWidth, Number(saved))) : defaultWidth
  })
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    startX.current = e.clientX
    startWidth.current = width
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [width])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = side === 'left'
        ? e.clientX - startX.current
        : startX.current - e.clientX
      const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth.current + delta))
      setWidth(newWidth)
    }

    const onMouseUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      localStorage.setItem(`workspace-panel-${storageKey}`, String(width))
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [width, minWidth, maxWidth, side, storageKey])

  if (collapsed) return null

  const handle = (
    <div
      onMouseDown={onMouseDown}
      className={`group absolute top-0 bottom-0 z-10 w-1 cursor-col-resize hover:bg-forest-green/30 active:bg-forest-green/50 transition-colors ${
        side === 'left' ? 'right-0' : 'left-0'
      }`}
    >
      <div className={`absolute top-1/2 -translate-y-1/2 h-8 w-1 rounded-full bg-border-subtle group-hover:bg-forest-green/50 transition-colors ${
        side === 'left' ? 'right-0' : 'left-0'
      }`} />
    </div>
  )

  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width }}
    >
      {children}
      {handle}
    </div>
  )
}

/** Horizontal resizable divider (for splitting top/bottom in context pane). */
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

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const parent = containerRef.current?.parentElement
      if (!parent) return
      const rect = parent.getBoundingClientRect()
      const ratio = Math.max(minRatio, Math.min(maxRatio, (e.clientY - rect.top) / rect.height))
      onRatioChange(ratio)
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
  }, [minRatio, maxRatio, onRatioChange, storageKey])

  return (
    <div
      ref={containerRef}
      onMouseDown={onMouseDown}
      className="group relative z-10 h-3 shrink-0 cursor-row-resize bg-forest-green/15 hover:bg-forest-green/30 active:bg-forest-green/50 transition-colors my-1"
    >
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-1 w-10 rounded-full bg-forest-green/30 group-hover:bg-forest-green/60 transition-colors" />
    </div>
  )
}

import { useRef, useState, useCallback, useEffect } from 'react'

// ---- Types ----

type AnnotationTool = 'rectangle' | 'arrow' | 'freehand' | 'text'

interface Annotation {
  type: AnnotationTool
  startX: number
  startY: number
  endX: number
  endY: number
  points?: Array<{ x: number; y: number }>  // freehand
  text?: string
}

interface AnnotationOverlayProps {
  width: number
  height: number
  onSendToBot: (annotations: Annotation[]) => void
  onClose: () => void
}

const STROKE_COLOR = '#ef4444'  // red-500
const STROKE_WIDTH = 2
const FONT_SIZE = 14

// ---- Component ----

export function AnnotationOverlay({ width, height, onSendToBot, onClose }: AnnotationOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [tool, setTool] = useState<AnnotationTool>('rectangle')
  const [annotations, setAnnotations] = useState<Annotation[]>(() => {
    try {
      const saved = sessionStorage.getItem('__yokebot_annotations')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [drawing, setDrawing] = useState(false)
  const [current, setCurrent] = useState<Annotation | null>(null)
  const [textInput, setTextInput] = useState<{ x: number; y: number } | null>(null)
  const [textValue, setTextValue] = useState('')
  const textInputRef = useRef<HTMLInputElement>(null)
  const [redoStack, setRedoStack] = useState<Annotation[]>(() => {
    try {
      const saved = sessionStorage.getItem('__yokebot_annotations_redo')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })

  const MAX_ANNOTATIONS = 50

  // Persist annotations to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem('__yokebot_annotations', JSON.stringify(annotations.slice(-MAX_ANNOTATIONS)))
      sessionStorage.setItem('__yokebot_annotations_redo', JSON.stringify(redoStack.slice(-MAX_ANNOTATIONS)))
    } catch { /* storage full */ }
  }, [annotations, redoStack])

  // Keyboard shortcuts: Ctrl+Z undo, Ctrl+Shift+Z / Ctrl+Y redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          // Redo
          setRedoStack(prev => {
            if (prev.length === 0) return prev
            const restored = prev[prev.length - 1]
            setAnnotations(a => [...a, restored])
            return prev.slice(0, -1)
          })
        } else {
          // Undo
          setAnnotations(prev => {
            if (prev.length === 0) return prev
            const removed = prev[prev.length - 1]
            setRedoStack(r => [...r, removed])
            return prev.slice(0, -1)
          })
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
        e.preventDefault()
        setRedoStack(prev => {
          if (prev.length === 0) return prev
          const restored = prev[prev.length - 1]
          setAnnotations(a => [...a, restored])
          return prev.slice(0, -1)
        })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Get mouse position relative to canvas
  const getPos = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }, [])

  // ---- Drawing ----

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === 'text') {
      const { x, y } = getPos(e)
      setTextInput({ x, y })
      setTextValue('')
      return
    }
    const { x, y } = getPos(e)
    const ann: Annotation = {
      type: tool,
      startX: x, startY: y,
      endX: x, endY: y,
      ...(tool === 'freehand' ? { points: [{ x, y }] } : {}),
    }
    setCurrent(ann)
    setDrawing(true)
  }, [tool, getPos])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing || !current) return
    const { x, y } = getPos(e)
    setCurrent(prev => {
      if (!prev) return prev
      if (prev.type === 'freehand') {
        return { ...prev, endX: x, endY: y, points: [...(prev.points || []), { x, y }] }
      }
      return { ...prev, endX: x, endY: y }
    })
  }, [drawing, current, getPos])

  const handleMouseUp = useCallback(() => {
    if (!drawing || !current) return
    setDrawing(false)
    setAnnotations(prev => [...prev, current])
    setCurrent(null)
  }, [drawing, current])

  // Focus text input when shown (delayed to avoid canvas stealing focus)
  useEffect(() => {
    if (textInput) {
      const timer = setTimeout(() => textInputRef.current?.focus(), 50)
      return () => clearTimeout(timer)
    }
  }, [textInput])

  const commitText = useCallback(() => {
    if (textInput && textValue.trim()) {
      const ann: Annotation = {
        type: 'text',
        startX: textInput.x, startY: textInput.y,
        endX: textInput.x, endY: textInput.y,
        text: textValue.trim(),
      }
      setAnnotations(prev => [...prev, ann])
    }
    setTextInput(null)
    setTextValue('')
  }, [textInput, textValue])

  // ---- Rendering ----

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, width, height)

    const allAnnotations = [...annotations, ...(current ? [current] : [])]

    for (const ann of allAnnotations) {
      ctx.strokeStyle = STROKE_COLOR
      ctx.fillStyle = STROKE_COLOR
      ctx.lineWidth = STROKE_WIDTH
      ctx.font = `${FONT_SIZE}px sans-serif`

      switch (ann.type) {
        case 'rectangle':
          ctx.strokeRect(ann.startX, ann.startY, ann.endX - ann.startX, ann.endY - ann.startY)
          break

        case 'arrow': {
          // Line
          ctx.beginPath()
          ctx.moveTo(ann.startX, ann.startY)
          ctx.lineTo(ann.endX, ann.endY)
          ctx.stroke()
          // Arrowhead
          const angle = Math.atan2(ann.endY - ann.startY, ann.endX - ann.startX)
          const headLen = 12
          ctx.beginPath()
          ctx.moveTo(ann.endX, ann.endY)
          ctx.lineTo(ann.endX - headLen * Math.cos(angle - Math.PI / 6), ann.endY - headLen * Math.sin(angle - Math.PI / 6))
          ctx.moveTo(ann.endX, ann.endY)
          ctx.lineTo(ann.endX - headLen * Math.cos(angle + Math.PI / 6), ann.endY - headLen * Math.sin(angle + Math.PI / 6))
          ctx.stroke()
          break
        }

        case 'freehand':
          if (ann.points && ann.points.length > 1) {
            ctx.beginPath()
            ctx.moveTo(ann.points[0].x, ann.points[0].y)
            for (let i = 1; i < ann.points.length; i++) {
              ctx.lineTo(ann.points[i].x, ann.points[i].y)
            }
            ctx.stroke()
          }
          break

        case 'text':
          if (ann.text) {
            ctx.fillText(ann.text, ann.startX, ann.startY)
          }
          break
      }
    }
  }, [annotations, current, width, height])

  // ---- Actions ----

  const handleUndo = useCallback(() => {
    setAnnotations(prev => {
      if (prev.length === 0) return prev
      setRedoStack(r => [...r, prev[prev.length - 1]])
      return prev.slice(0, -1)
    })
  }, [])

  const handleRedo = useCallback(() => {
    setRedoStack(prev => {
      if (prev.length === 0) return prev
      const restored = prev[prev.length - 1]
      setAnnotations(a => [...a, restored])
      return prev.slice(0, -1)
    })
  }, [])

  const handleClear = useCallback(() => {
    setRedoStack(prev => [...prev, ...annotations])
    setAnnotations([])
  }, [annotations])

  const handleSend = useCallback(() => {
    onSendToBot(annotations)
  }, [annotations, onSendToBot])

  const tools: Array<{ id: AnnotationTool; icon: string; label: string }> = [
    { id: 'rectangle', icon: 'rectangle', label: 'Rectangle' },
    { id: 'arrow', icon: 'north_east', label: 'Arrow' },
    { id: 'freehand', icon: 'draw', label: 'Freehand' },
    { id: 'text', icon: 'title', label: 'Text' },
  ]

  return (
    <div className="absolute inset-0 z-40" style={{ pointerEvents: 'auto' }}>
      {/* Canvas overlay */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="absolute inset-0 cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />

      {/* Floating text input */}
      {textInput && (
        <input
          ref={textInputRef}
          type="text"
          value={textValue}
          onChange={e => setTextValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commitText(); if (e.key === 'Escape') setTextInput(null) }}
          onBlur={commitText}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          className="absolute z-50 bg-white/90 border-2 border-red-400 rounded px-2 py-1 text-sm text-red-600 outline-none shadow-lg"
          style={{ left: textInput.x, top: Math.max(40, textInput.y - 20), minWidth: 200 }}
          placeholder="Add comment..."
        />
      )}

      {/* Toolbar */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-[#1e1e1e]/90 backdrop-blur-sm rounded-lg px-2 py-1 shadow-lg border border-border-subtle">
        {tools.map(t => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
              tool === t.id
                ? 'bg-red-500/20 text-red-400'
                : 'text-text-muted hover:text-text-main hover:bg-white/10'
            }`}
            title={t.label}
          >
            <span className="material-symbols-outlined text-[14px]">{t.icon}</span>
          </button>
        ))}

        <div className="h-4 w-px bg-border-subtle mx-1" />

        <button
          onClick={handleUndo}
          disabled={annotations.length === 0}
          className="flex items-center px-2 py-1 rounded text-xs text-text-muted hover:text-text-main hover:bg-white/10 disabled:opacity-30 transition-colors"
          title="Undo (Ctrl+Z)"
        >
          <span className="material-symbols-outlined text-[14px]">undo</span>
        </button>
        <button
          onClick={handleRedo}
          disabled={redoStack.length === 0}
          className="flex items-center px-2 py-1 rounded text-xs text-text-muted hover:text-text-main hover:bg-white/10 disabled:opacity-30 transition-colors"
          title="Redo (Ctrl+Shift+Z)"
        >
          <span className="material-symbols-outlined text-[14px]">redo</span>
        </button>
        <button
          onClick={handleClear}
          disabled={annotations.length === 0}
          className="flex items-center px-2 py-1 rounded text-xs text-text-muted hover:text-text-main hover:bg-white/10 disabled:opacity-30 transition-colors"
          title="Clear all"
        >
          <span className="material-symbols-outlined text-[14px]">delete</span>
        </button>

        <div className="h-4 w-px bg-border-subtle mx-1" />

        <button
          onClick={handleSend}
          disabled={annotations.length === 0}
          className="flex items-center gap-1 px-3 py-1 rounded text-xs bg-forest-green text-white hover:bg-forest-green/90 disabled:opacity-30 transition-colors"
          title="Send annotations to bot"
        >
          <span className="material-symbols-outlined text-[14px]">send</span>
          Send to Bot
        </button>

        <button
          onClick={onClose}
          className="flex items-center px-2 py-1 rounded text-xs text-text-muted hover:text-text-main hover:bg-white/10 transition-colors"
          title="Exit annotate mode"
        >
          <span className="material-symbols-outlined text-[14px]">close</span>
        </button>
      </div>
    </div>
  )
}

// ---- Build structured message from annotations ----

export function buildAnnotationMessage(annotations: Array<{
  type: string
  startX: number
  startY: number
  endX: number
  endY: number
  text?: string
}>, viewportWidth: number, viewportHeight: number): string {
  const lines: string[] = [
    `I've annotated the preview (${viewportWidth}x${viewportHeight}px). Please review and make changes:`,
    '',
  ]

  for (let i = 0; i < annotations.length; i++) {
    const ann = annotations[i]
    const region = `(${Math.round(ann.startX)},${Math.round(ann.startY)}) to (${Math.round(ann.endX)},${Math.round(ann.endY)})`

    switch (ann.type) {
      case 'rectangle':
        lines.push(`${i + 1}. **Region** ${region}${ann.text ? ` — "${ann.text}"` : ' — check/fix this area'}`)
        break
      case 'arrow':
        lines.push(`${i + 1}. **Arrow** pointing to ${region}${ann.text ? ` — "${ann.text}"` : ' — look at this element'}`)
        break
      case 'freehand':
        lines.push(`${i + 1}. **Highlight** around ${region}${ann.text ? ` — "${ann.text}"` : ' — this area needs attention'}`)
        break
      case 'text':
        lines.push(`${i + 1}. **Comment** at (${Math.round(ann.startX)},${Math.round(ann.startY)}): "${ann.text}"`)
        break
    }
  }

  return lines.join('\n')
}

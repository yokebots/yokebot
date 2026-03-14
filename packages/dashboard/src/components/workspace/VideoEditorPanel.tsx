/**
 * VideoEditorPanel — Custom multi-track timeline editor for video production.
 *
 * Layout:
 * ┌──────────────────────────────────────────┐
 * │ [Project Name]  [Timeline|Text] [Export] │
 * ├──────────┬───────────────────────────────┤
 * │ Scenes   │        Preview               │
 * │ List     │   [Scene thumbnail/preview]   │
 * ├──────────┴───────────────────────────────┤
 * │ TIMELINE or TRANSCRIPT EDITOR            │
 * └──────────────────────────────────────────┘
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import * as engine from '@/lib/engine'
import { TranscriptEditor, type Transcription, type DeletedRange } from './TranscriptEditor'

// ---- Constants ----

const TRACK_HEIGHT = 40
const TRACK_GAP = 2
const HEADER_WIDTH = 100
const MIN_SCENE_WIDTH = 40
const PIXELS_PER_SECOND = 60
const PLAYHEAD_COLOR = '#ef4444'

const TRACK_DEFS = [
  { id: 'main', label: 'Video', icon: 'movie', color: '#3b82f6' },
  { id: 'caption', label: 'Captions', icon: 'closed_caption', color: '#8b5cf6' },
  { id: 'voiceover', label: 'Voiceover', icon: 'record_voice_over', color: '#10b981' },
  { id: 'music', label: 'Music', icon: 'music_note', color: '#f59e0b' },
  { id: 'sfx', label: 'SFX', icon: 'surround_sound', color: '#ef4444' },
] as const

const TRANSITIONS: Array<{ value: string; label: string }> = [
  { value: 'cut', label: 'Cut' },
  { value: 'fade', label: 'Fade' },
  { value: 'dissolve', label: 'Dissolve' },
  { value: 'wipe', label: 'Wipe' },
  { value: 'slide', label: 'Slide' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'blur', label: 'Blur' },
  { value: 'push', label: 'Push' },
]

interface VideoEditorPanelProps {
  projectId: string
}

interface ProjectSnapshot {
  scenes: engine.VideoScene[]
  assets: engine.VideoAsset[]
  deletedRanges: DeletedRange[]
}

export function VideoEditorPanel({ projectId }: VideoEditorPanelProps) {
  const [project, setProject] = useState<engine.VideoProjectWithDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null)
  const [playheadMs, setPlayheadMs] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [viewMode, setViewMode] = useState<'timeline' | 'text'>('timeline')
  const [transcribing, setTranscribing] = useState(false)
  const [deletedRanges, setDeletedRanges] = useState<DeletedRange[]>([])
  const [applyingEdits, setApplyingEdits] = useState(false)
  const animFrameRef = useRef<number | null>(null)
  const playStartRef = useRef<{ wallTime: number; startMs: number } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const timelineContainerRef = useRef<HTMLDivElement>(null)

  // Undo/redo stacks
  const [undoStack, setUndoStack] = useState<ProjectSnapshot[]>([])
  const [redoStack, setRedoStack] = useState<ProjectSnapshot[]>([])

  // Load project data
  const loadProject = useCallback(async () => {
    try {
      const p = await engine.getVideoProject(projectId)
      setProject(p)
      if (!selectedSceneId && p.scenes.length > 0) {
        setSelectedSceneId(p.scenes[0].id)
      }
    } catch { /* offline */ }
    setLoading(false)
  }, [projectId, selectedSceneId])

  useEffect(() => { loadProject() }, [loadProject])

  // Parse project settings
  const settings = useMemo(() => {
    if (!project) return { formatPreset: 'landscape_fhd', fps: 30, resolution: { width: 1920, height: 1080 } }
    try { return JSON.parse(project.settings) } catch { return { formatPreset: 'landscape_fhd', fps: 30, resolution: { width: 1920, height: 1080 } } }
  }, [project])

  // Compute total duration
  const totalDurationMs = useMemo(() => {
    if (!project) return 0
    return project.scenes.reduce((sum, s) => sum + s.durationMs, 0)
  }, [project])

  const totalDurationS = totalDurationMs / 1000

  // Selected scene
  const selectedScene = project?.scenes.find(s => s.id === selectedSceneId) ?? null

  // Find voiceover asset with transcription
  const voiceoverAsset = useMemo(() => {
    if (!project) return null
    return project.assets.find(a =>
      (a.type === 'voiceover' || a.type === 'audio') && a.metadata,
    ) ?? null
  }, [project])

  const transcription: Transcription | null = useMemo(() => {
    if (!voiceoverAsset?.metadata) return null
    try {
      const meta = typeof voiceoverAsset.metadata === 'string'
        ? JSON.parse(voiceoverAsset.metadata)
        : voiceoverAsset.metadata
      return meta.transcription ?? null
    } catch { return null }
  }, [voiceoverAsset])

  // Check if there are voiceover assets without transcription (show Transcribe button)
  const hasUntranscribedVoiceover = useMemo(() => {
    if (!project) return false
    return project.assets.some(a => {
      if (a.type !== 'voiceover' && a.type !== 'audio') return false
      try {
        const meta = a.metadata ? (typeof a.metadata === 'string' ? JSON.parse(a.metadata) : a.metadata) : null
        return !meta?.transcription
      } catch { return true }
    })
  }, [project])

  // ---- Snapshot helpers for undo/redo ----

  const takeSnapshot = useCallback((): ProjectSnapshot | null => {
    if (!project) return null
    return {
      scenes: [...project.scenes],
      assets: [...project.assets],
      deletedRanges: [...deletedRanges],
    }
  }, [project, deletedRanges])

  const pushUndo = useCallback(() => {
    const snap = takeSnapshot()
    if (snap) {
      setUndoStack(prev => [...prev.slice(-49), snap])
      setRedoStack([])
    }
  }, [takeSnapshot])

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        // Undo
        setUndoStack(prev => {
          if (prev.length === 0) return prev
          const snap = prev[prev.length - 1]
          const currentSnap = takeSnapshot()
          if (currentSnap) setRedoStack(r => [...r, currentSnap])
          setDeletedRanges(snap.deletedRanges)
          return prev.slice(0, -1)
        })
      } else if (mod && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        // Redo
        setRedoStack(prev => {
          if (prev.length === 0) return prev
          const snap = prev[prev.length - 1]
          const currentSnap = takeSnapshot()
          if (currentSnap) setUndoStack(u => [...u, currentSnap])
          setDeletedRanges(snap.deletedRanges)
          return prev.slice(0, -1)
        })
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [takeSnapshot])

  // ---- Playback ----

  const startPlayback = useCallback(() => {
    if (isPlaying) return
    setIsPlaying(true)
    playStartRef.current = { wallTime: performance.now(), startMs: playheadMs }
    const tick = () => {
      if (!playStartRef.current) return
      const elapsed = performance.now() - playStartRef.current.wallTime
      const newMs = playStartRef.current.startMs + elapsed
      if (newMs >= totalDurationMs) {
        setPlayheadMs(totalDurationMs)
        setIsPlaying(false)
        playStartRef.current = null
        return
      }
      setPlayheadMs(newMs)
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
  }, [isPlaying, playheadMs, totalDurationMs])

  const stopPlayback = useCallback(() => {
    setIsPlaying(false)
    playStartRef.current = null
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
  }, [])

  const togglePlayback = useCallback(() => {
    if (isPlaying) stopPlayback()
    else startPlayback()
  }, [isPlaying, startPlayback, stopPlayback])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [])

  // ---- Scene operations ----

  const handleAddScene = async () => {
    if (!project) return
    pushUndo()
    const title = `Scene ${project.scenes.length + 1}`
    try {
      await engine.addVideoScene(projectId, { title, durationMs: 5000 })
      await loadProject()
    } catch { /* ignore */ }
  }

  const handleDeleteScene = async (sceneId: string) => {
    if (!project) return
    pushUndo()
    try {
      await engine.deleteVideoScene(projectId, sceneId)
      if (selectedSceneId === sceneId) setSelectedSceneId(null)
      await loadProject()
    } catch { /* ignore */ }
  }

  const handleUpdateScene = async (sceneId: string, updates: Record<string, unknown>) => {
    pushUndo()
    try {
      await engine.updateVideoScene(projectId, sceneId, updates)
      await loadProject()
    } catch { /* ignore */ }
  }

  // ---- Transcription ----

  const handleTranscribe = async () => {
    if (!project || transcribing) return
    const asset = project.assets.find(a => a.type === 'voiceover' || a.type === 'audio')
    if (!asset) return
    setTranscribing(true)
    try {
      await engine.transcribeVideoAsset(projectId, asset.id)
      await loadProject()
      setViewMode('text')
    } catch { /* ignore */ }
    setTranscribing(false)
  }

  // ---- Transcript edits ----

  const handleDeleteRange = useCallback((startMs: number, endMs: number) => {
    pushUndo()
    setDeletedRanges(prev => [...prev, { startMs, endMs }])
  }, [pushUndo])

  const handleUndoDelete = useCallback((range: DeletedRange) => {
    pushUndo()
    setDeletedRanges(prev => prev.filter(r => r.startMs !== range.startMs || r.endMs !== range.endMs))
  }, [pushUndo])

  const handleApplyEdits = async () => {
    if (!voiceoverAsset || deletedRanges.length === 0 || applyingEdits) return
    setApplyingEdits(true)
    try {
      const edits = deletedRanges.map(r => ({
        type: 'delete' as const,
        startMs: r.startMs,
        endMs: r.endMs,
      }))
      await engine.applyTranscriptEdits(projectId, voiceoverAsset.id, edits)
      setDeletedRanges([])
      await loadProject()
    } catch { /* ignore */ }
    setApplyingEdits(false)
  }

  // ---- Timeline canvas drawing ----

  const drawTimeline = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !project) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)
    const W = rect.width
    const H = rect.height

    // Clear
    ctx.clearRect(0, 0, W, H)

    // Draw tracks
    TRACK_DEFS.forEach((track, trackIdx) => {
      const y = trackIdx * (TRACK_HEIGHT + TRACK_GAP)

      // Track header background
      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(0, y, HEADER_WIDTH, TRACK_HEIGHT)
      ctx.strokeStyle = '#e2e8f0'
      ctx.strokeRect(0, y, HEADER_WIDTH, TRACK_HEIGHT)

      // Track label
      ctx.fillStyle = '#64748b'
      ctx.font = '11px Inter, system-ui, sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(track.label, 8, y + TRACK_HEIGHT / 2)

      // Track content area
      ctx.fillStyle = '#fafbfc'
      ctx.fillRect(HEADER_WIDTH, y, W - HEADER_WIDTH, TRACK_HEIGHT)
      ctx.strokeStyle = '#e2e8f0'
      ctx.strokeRect(HEADER_WIDTH, y, W - HEADER_WIDTH, TRACK_HEIGHT)

      // Draw blocks on the main video track
      if (track.id === 'main') {
        let offsetMs = 0
        for (const scene of project.scenes) {
          const x = HEADER_WIDTH + (offsetMs / 1000) * PIXELS_PER_SECOND
          const w = (scene.durationMs / 1000) * PIXELS_PER_SECOND
          const isSelected = scene.id === selectedSceneId

          // Block
          ctx.fillStyle = isSelected ? '#3b82f6' : '#93c5fd'
          ctx.beginPath()
          roundRect(ctx, x + 1, y + 3, Math.max(w - 2, MIN_SCENE_WIDTH), TRACK_HEIGHT - 6, 4)
          ctx.fill()

          // Border for selected
          if (isSelected) {
            ctx.strokeStyle = '#1d4ed8'
            ctx.lineWidth = 2
            ctx.beginPath()
            roundRect(ctx, x + 1, y + 3, Math.max(w - 2, MIN_SCENE_WIDTH), TRACK_HEIGHT - 6, 4)
            ctx.stroke()
            ctx.lineWidth = 1
          }

          // Label
          ctx.fillStyle = isSelected ? '#ffffff' : '#1e3a5f'
          ctx.font = '10px Inter, system-ui, sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText(
            scene.title.length > 12 ? scene.title.slice(0, 11) + '...' : scene.title,
            x + Math.max(w, MIN_SCENE_WIDTH) / 2,
            y + TRACK_HEIGHT / 2,
          )

          // Transition marker
          if (scene.transition && scene.transition !== 'cut' && offsetMs > 0) {
            ctx.fillStyle = '#a855f7'
            ctx.beginPath()
            ctx.arc(x, y + TRACK_HEIGHT / 2, 4, 0, Math.PI * 2)
            ctx.fill()
          }

          offsetMs += scene.durationMs
        }
      }

      // Draw asset blocks for audio tracks
      const trackAssets = project.assets.filter(a => a.track === track.id)
      for (const asset of trackAssets) {
        const x = HEADER_WIDTH + (asset.startMs / 1000) * PIXELS_PER_SECOND
        const dur = asset.durationMs ?? 5000
        const w = (dur / 1000) * PIXELS_PER_SECOND

        ctx.fillStyle = track.color + '80' // semi-transparent
        ctx.beginPath()
        roundRect(ctx, x + 1, y + 3, Math.max(w - 2, 20), TRACK_HEIGHT - 6, 4)
        ctx.fill()

        ctx.fillStyle = track.color
        ctx.font = '9px Inter, system-ui, sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText(asset.filename || asset.type, x + 4, y + TRACK_HEIGHT / 2)
      }
    })

    // Draw playhead
    const playheadX = HEADER_WIDTH + (playheadMs / 1000) * PIXELS_PER_SECOND
    if (playheadX >= HEADER_WIDTH && playheadX <= W) {
      ctx.strokeStyle = PLAYHEAD_COLOR
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(playheadX, 0)
      ctx.lineTo(playheadX, H)
      ctx.stroke()
      ctx.lineWidth = 1

      // Playhead triangle
      ctx.fillStyle = PLAYHEAD_COLOR
      ctx.beginPath()
      ctx.moveTo(playheadX - 5, 0)
      ctx.lineTo(playheadX + 5, 0)
      ctx.lineTo(playheadX, 8)
      ctx.closePath()
      ctx.fill()
    }

    // Time ruler (top edge)
    ctx.fillStyle = '#94a3b8'
    ctx.font = '9px Inter, system-ui, sans-serif'
    ctx.textAlign = 'center'
    const step = totalDurationS > 60 ? 10 : totalDurationS > 20 ? 5 : 1
    for (let t = 0; t <= totalDurationS; t += step) {
      const x = HEADER_WIDTH + t * PIXELS_PER_SECOND
      if (x > W) break
      ctx.fillText(formatTimeShort(t * 1000), x, H - 4)
    }
  }, [project, selectedSceneId, playheadMs, totalDurationS])

  // Redraw on state changes
  useEffect(() => { drawTimeline() }, [drawTimeline])

  // Resize observer for canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(() => drawTimeline())
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [drawTimeline])

  // Click on timeline to set playhead / select scene
  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || !project) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Set playhead
    if (x >= HEADER_WIDTH) {
      const ms = ((x - HEADER_WIDTH) / PIXELS_PER_SECOND) * 1000
      setPlayheadMs(Math.max(0, Math.min(ms, totalDurationMs)))

      // Check which scene was clicked (video track only, track 0)
      if (y < TRACK_HEIGHT) {
        let offsetMs = 0
        for (const scene of project.scenes) {
          const sceneX = HEADER_WIDTH + (offsetMs / 1000) * PIXELS_PER_SECOND
          const sceneW = (scene.durationMs / 1000) * PIXELS_PER_SECOND
          if (x >= sceneX && x <= sceneX + sceneW) {
            setSelectedSceneId(scene.id)
            break
          }
          offsetMs += scene.durationMs
        }
      }
    }
  }, [project, totalDurationMs])

  // ---- Loading / Error states ----

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-text-muted">
        Loading project...
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-text-muted">
        Project not found
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border-subtle shrink-0">
        <span className="material-symbols-outlined text-[18px] text-forest-green">movie_edit</span>
        <h2 className="text-sm font-semibold text-text-main truncate flex-1">{project.name}</h2>
        <span className="text-xs text-text-muted">{formatTime(totalDurationMs)}</span>
        <span className="text-[10px] text-text-muted/60 bg-light-surface-alt rounded px-1.5 py-0.5">
          {settings.formatPreset?.replace(/_/g, ' ')}
        </span>

        {/* View mode toggle */}
        <div className="flex items-center rounded-md border border-border-subtle overflow-hidden">
          <button
            onClick={() => setViewMode('timeline')}
            className={`flex items-center gap-1 px-2 py-1 text-xs transition-colors ${
              viewMode === 'timeline'
                ? 'bg-forest-green text-white'
                : 'text-text-muted hover:bg-light-surface-alt'
            }`}
            title="Timeline view"
          >
            <span className="material-symbols-outlined text-[14px]">timeline</span>
          </button>
          <button
            onClick={() => setViewMode('text')}
            className={`flex items-center gap-1 px-2 py-1 text-xs transition-colors ${
              viewMode === 'text'
                ? 'bg-forest-green text-white'
                : 'text-text-muted hover:bg-light-surface-alt'
            }`}
            title="Text editing view"
          >
            <span className="material-symbols-outlined text-[14px]">notes</span>
          </button>
        </div>

        {/* Transcribe button */}
        {hasUntranscribedVoiceover && (
          <button
            onClick={handleTranscribe}
            disabled={transcribing}
            className="flex items-center gap-1.5 rounded-md bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[14px]">
              {transcribing ? 'hourglass_top' : 'mic'}
            </span>
            {transcribing ? 'Transcribing...' : 'Transcribe'}
          </button>
        )}

        {/* Apply edits button */}
        {deletedRanges.length > 0 && (
          <button
            onClick={handleApplyEdits}
            disabled={applyingEdits}
            className="flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[14px]">
              {applyingEdits ? 'hourglass_top' : 'content_cut'}
            </span>
            {applyingEdits ? 'Applying...' : `Apply ${deletedRanges.length} cut${deletedRanges.length !== 1 ? 's' : ''}`}
          </button>
        )}

        {/* Undo/redo */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => {
              setUndoStack(prev => {
                if (prev.length === 0) return prev
                const snap = prev[prev.length - 1]
                const currentSnap = takeSnapshot()
                if (currentSnap) setRedoStack(r => [...r, currentSnap])
                setDeletedRanges(snap.deletedRanges)
                return prev.slice(0, -1)
              })
            }}
            disabled={undoStack.length === 0}
            className="rounded p-1 text-text-muted hover:bg-gray-100 transition-colors disabled:opacity-30"
            title="Undo (Ctrl+Z)"
          >
            <span className="material-symbols-outlined text-[16px]">undo</span>
          </button>
          <button
            onClick={() => {
              setRedoStack(prev => {
                if (prev.length === 0) return prev
                const snap = prev[prev.length - 1]
                const currentSnap = takeSnapshot()
                if (currentSnap) setUndoStack(u => [...u, currentSnap])
                setDeletedRanges(snap.deletedRanges)
                return prev.slice(0, -1)
              })
            }}
            disabled={redoStack.length === 0}
            className="rounded p-1 text-text-muted hover:bg-gray-100 transition-colors disabled:opacity-30"
            title="Redo (Ctrl+Shift+Z)"
          >
            <span className="material-symbols-outlined text-[16px]">redo</span>
          </button>
        </div>

        <button
          className="flex items-center gap-1.5 rounded-md bg-forest-green px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 transition-colors"
        >
          <span className="material-symbols-outlined text-[14px]">download</span>
          Export MP4
        </button>
      </div>

      {/* Main area: scene list + preview */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Scene list (left sidebar) */}
        <div className="w-48 border-r border-border-subtle flex flex-col shrink-0 overflow-hidden">
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border-subtle shrink-0">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider flex-1">Scenes</span>
            <button
              onClick={handleAddScene}
              className="rounded p-0.5 text-forest-green hover:bg-forest-green/10 transition-colors"
              title="Add scene"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {project.scenes.length === 0 ? (
              <div className="flex flex-col items-center gap-1 py-8 text-text-muted text-xs">
                <span className="material-symbols-outlined text-2xl text-text-muted/30">movie</span>
                <p>No scenes yet</p>
              </div>
            ) : (
              project.scenes
                .sort((a, b) => a.sceneOrder - b.sceneOrder)
                .map((scene) => (
                  <div
                    key={scene.id}
                    onClick={() => setSelectedSceneId(scene.id)}
                    className={`flex items-start gap-2 px-2 py-2 cursor-pointer border-b border-border-subtle/50 transition-colors group ${
                      selectedSceneId === scene.id
                        ? 'bg-forest-green/5 border-l-2 border-l-forest-green'
                        : 'hover:bg-light-surface-alt border-l-2 border-l-transparent'
                    }`}
                  >
                    {/* Scene thumbnail placeholder */}
                    <div className="w-12 h-8 rounded bg-gray-100 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[14px] text-text-muted/40">image</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-text-main truncate">{scene.title}</p>
                      <p className="text-[10px] text-text-muted">{formatTime(scene.durationMs)}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteScene(scene.id) }}
                      className="opacity-0 group-hover:opacity-100 shrink-0 rounded p-0.5 text-text-muted hover:text-red-500 transition-all"
                    >
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </div>
                ))
            )}
          </div>
        </div>

        {/* Preview area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedScene ? (
            <div className="flex-1 flex flex-col p-4 overflow-y-auto">
              {/* Preview canvas placeholder */}
              <div
                className="mx-auto bg-black rounded-lg flex items-center justify-center"
                style={{
                  aspectRatio: `${settings.resolution?.width ?? 1920} / ${settings.resolution?.height ?? 1080}`,
                  maxWidth: '100%',
                  maxHeight: '50vh',
                  width: '100%',
                }}
              >
                <div className="text-center text-white/40">
                  <span className="material-symbols-outlined text-4xl block mb-1">play_circle</span>
                  <p className="text-xs">{selectedScene.title}</p>
                </div>
              </div>

              {/* Scene details */}
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    value={selectedScene.title}
                    onChange={(e) => handleUpdateScene(selectedScene.id, { title: e.target.value })}
                    className="flex-1 rounded border border-border-subtle px-2 py-1 text-sm focus:border-forest-green focus:outline-none"
                  />
                  <select
                    value={selectedScene.transition}
                    onChange={(e) => handleUpdateScene(selectedScene.id, { transition: e.target.value })}
                    className="rounded border border-border-subtle px-2 py-1 text-xs focus:border-forest-green focus:outline-none"
                  >
                    {TRANSITIONS.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={selectedScene.durationMs / 1000}
                      onChange={(e) => handleUpdateScene(selectedScene.id, { durationMs: Math.max(100, Number(e.target.value) * 1000) })}
                      step="0.5"
                      min="0.1"
                      className="w-16 rounded border border-border-subtle px-2 py-1 text-xs text-center focus:border-forest-green focus:outline-none"
                    />
                    <span className="text-xs text-text-muted">sec</span>
                  </div>
                </div>
                {selectedScene.scriptText && (
                  <div className="rounded bg-light-surface-alt p-2">
                    <p className="text-xs text-text-muted mb-0.5 font-semibold">Script</p>
                    <p className="text-xs text-text-main whitespace-pre-wrap">{selectedScene.scriptText}</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
              Select a scene to preview
            </div>
          )}
        </div>
      </div>

      {/* Bottom section: Timeline or Transcript Editor */}
      {viewMode === 'timeline' ? (
        <div
          ref={timelineContainerRef}
          className="border-t border-border-subtle bg-gray-50 shrink-0"
          style={{ height: TRACK_DEFS.length * (TRACK_HEIGHT + TRACK_GAP) + 50 }}
        >
          <canvas
            ref={canvasRef}
            onClick={handleTimelineClick}
            className="w-full cursor-crosshair"
            style={{ height: TRACK_DEFS.length * (TRACK_HEIGHT + TRACK_GAP) + 20 }}
          />

          {/* Transport controls */}
          <div className="flex items-center gap-2 px-3 py-1 border-t border-border-subtle/50">
            <button
              onClick={togglePlayback}
              className="rounded p-1 hover:bg-gray-200 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">
                {isPlaying ? 'pause' : 'play_arrow'}
              </span>
            </button>
            <button
              onClick={() => { stopPlayback(); setPlayheadMs(0) }}
              className="rounded p-1 hover:bg-gray-200 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">stop</span>
            </button>
            <div className="text-xs text-text-muted font-mono ml-2">
              {formatTime(playheadMs)} / {formatTime(totalDurationMs)}
            </div>
          </div>
        </div>
      ) : (
        <div className="border-t border-border-subtle bg-white flex flex-col" style={{ height: 280 }}>
          {transcription ? (
            <>
              <TranscriptEditor
                transcription={transcription}
                playheadMs={playheadMs}
                isPlaying={isPlaying}
                deletedRanges={deletedRanges}
                onSeek={(ms) => setPlayheadMs(ms)}
                onDeleteRange={handleDeleteRange}
                onUndoDelete={handleUndoDelete}
              />
              {/* Transport controls */}
              <div className="flex items-center gap-2 px-3 py-1 border-t border-border-subtle/50 shrink-0">
                <button
                  onClick={togglePlayback}
                  className="rounded p-1 hover:bg-gray-200 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {isPlaying ? 'pause' : 'play_arrow'}
                  </span>
                </button>
                <button
                  onClick={() => { stopPlayback(); setPlayheadMs(0) }}
                  className="rounded p-1 hover:bg-gray-200 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">stop</span>
                </button>
                <div className="text-xs text-text-muted font-mono ml-2">
                  {formatTime(playheadMs)} / {formatTime(totalDurationMs)}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-muted">
              <span className="material-symbols-outlined text-3xl text-text-muted/30">mic</span>
              <p className="text-sm">No transcription available</p>
              {hasUntranscribedVoiceover && (
                <button
                  onClick={handleTranscribe}
                  disabled={transcribing}
                  className="flex items-center gap-1.5 rounded-md bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-700 transition-colors disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {transcribing ? 'hourglass_top' : 'mic'}
                  </span>
                  {transcribing ? 'Transcribing...' : 'Transcribe voiceover'}
                </button>
              )}
              <p className="text-xs text-text-muted/60 max-w-xs text-center">
                Add a voiceover asset and transcribe it to enable text-based editing
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---- Helpers ----

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function formatTimeShort(ms: number): string {
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s`
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
}

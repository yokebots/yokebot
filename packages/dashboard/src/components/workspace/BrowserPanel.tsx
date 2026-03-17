import { useState, useRef, useEffect, useCallback } from 'react'
import * as engine from '@/lib/engine'

type BrowserMode = 'take_control' | 'agent_browser'

interface BrowserPanelProps {
  sessionId: string
  /** If true, render in popout mode (no status bar chrome) */
  popout?: boolean
}

/**
 * Live browser viewer for the workspace context pane.
 * Uses CDP Screencast over WebSocket for real-time JPEG frame streaming.
 * Two modes:
 *   - Agent Browser: agent drives, human observes in real-time
 *   - Take Control: human drives the browser via click/type/scroll
 */
export function BrowserPanel({ sessionId, popout }: BrowserPanelProps) {
  const isAgentSession = sessionId.startsWith('agent:')
  const agentId = isAgentSession ? sessionId.slice('agent:'.length) : null

  const [mode, setMode] = useState<BrowserMode>(isAgentSession ? 'agent_browser' : 'take_control')
  const [currentUrl, setCurrentUrl] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(isAgentSession ? null : sessionId)
  const [zoom, setZoom] = useState(100)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const urlInputRef = useRef<HTMLInputElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const scrollAccRef = useRef({ x: 0, y: 0, deltaX: 0, deltaY: 0 })
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Initialize session — for agent sessions, first get the agent's session ID
  useEffect(() => {
    if (isAgentSession) {
      // Agent browser mode — try to get existing screenshot to find active session
      const init = async () => {
        try {
          const result = await engine.getAgentBrowserScreenshot(agentId!)
          setCurrentUrl(result.url)
          setUrlInput(result.url)
          // We'll need the session ID from the engine to connect WebSocket
          // For now, try listing sessions
          const sessions = await engine.listBrowserSessions()
          const agentSession = sessions.find(s => s.mode === 'agent_browser')
          if (agentSession) {
            setActiveSessionId(agentSession.id)
          }
        } catch {
          // Agent may not have an active browser yet
        }
        setLoading(false)
      }
      init()
    } else {
      setLoading(false)
    }
  }, [sessionId, isAgentSession, agentId])

  // WebSocket connection for CDP Screencast
  useEffect(() => {
    if (!activeSessionId) return

    let ws: WebSocket | null = null
    let cancelled = false

    const connect = async () => {
      try {
        const wsUrl = await engine.getBrowserStreamUrl(activeSessionId)
        if (cancelled) return

        ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onopen = () => {
          if (!cancelled) {
            setConnected(true)
            setLoading(false)
            setError(null)
          }
        }

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data)

            if (msg.type === 'frame' && msg.data) {
              drawFrame(msg.data)
            } else if (msg.type === 'url') {
              setCurrentUrl(msg.url)
              if (urlInputRef.current && document.activeElement !== urlInputRef.current) {
                setUrlInput(msg.url)
              }
            } else if (msg.type === 'error') {
              setError(msg.message)
            }
          } catch { /* ignore */ }
        }

        ws.onclose = () => {
          if (!cancelled) {
            setConnected(false)
          }
        }

        ws.onerror = () => {
          if (!cancelled) {
            setError('WebSocket connection failed')
            setConnected(false)
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message)
          setLoading(false)
        }
      }
    }

    connect()

    return () => {
      cancelled = true
      if (ws) {
        ws.close()
      }
      wsRef.current = null
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
    }
  }, [activeSessionId])

  // Draw a JPEG frame onto the canvas using createImageBitmap (much faster than Image + data URL)
  const drawingRef = useRef(false)
  const drawFrame = useCallback((base64Data: string) => {
    const canvas = canvasRef.current
    if (!canvas || drawingRef.current) return // skip if still drawing previous frame
    drawingRef.current = true

    // Decode base64 to binary
    const binary = atob(base64Data)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const blob = new Blob([bytes], { type: 'image/jpeg' })

    createImageBitmap(blob).then((bitmap) => {
      if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
        canvas.width = bitmap.width
        canvas.height = bitmap.height
      }
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0)
      }
      bitmap.close()
      drawingRef.current = false
    }).catch(() => {
      drawingRef.current = false
    })
  }, [])

  // Send message over WebSocket
  const wsSend = useCallback((msg: Record<string, unknown>) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
  }, [])

  // Click handler — map canvas coordinates to 1280x800 viewport
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode !== 'take_control') return
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const x = Math.round((e.clientX - rect.left) * scaleX)
    const y = Math.round((e.clientY - rect.top) * scaleY)
    wsSend({ type: 'click', x, y })
  }, [mode, wsSend])

  // Keyboard handler — skip when URL input is focused
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (mode !== 'take_control') return
    if (urlInputRef.current && document.activeElement === urlInputRef.current) return

    const specialKeys = ['Enter', 'Tab', 'Backspace', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Delete', 'Home', 'End']
    if (specialKeys.includes(e.key)) {
      e.preventDefault()
      wsSend({ type: 'press', key: e.key })
      return
    }
    if (e.key.length === 1) {
      e.preventDefault()
      wsSend({ type: 'type', text: e.key })
    }
  }, [mode, wsSend])

  // Scroll handler — debounce: accumulate deltas over 100ms, send as one batch
  const flushScroll = useCallback(() => {
    const acc = scrollAccRef.current
    if (acc.deltaX === 0 && acc.deltaY === 0) return
    const { x, y, deltaX, deltaY } = acc
    scrollAccRef.current = { x: 0, y: 0, deltaX: 0, deltaY: 0 }
    scrollTimerRef.current = null
    wsSend({ type: 'scroll', x, y, deltaX, deltaY })
  }, [wsSend])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (mode !== 'take_control' || !canvasRef.current) return
    e.preventDefault()

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const x = Math.round((e.clientX - rect.left) * scaleX)
    const y = Math.round((e.clientY - rect.top) * scaleY)

    scrollAccRef.current.x = x
    scrollAccRef.current.y = y
    scrollAccRef.current.deltaX += Math.round(e.deltaX)
    scrollAccRef.current.deltaY += Math.round(e.deltaY)

    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
    scrollTimerRef.current = setTimeout(flushScroll, 100)
  }, [mode, flushScroll])

  // URL bar navigation
  const handleNavigate = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    if (!urlInput.trim()) return
    wsSend({ type: 'navigate', url: urlInput.trim() })
    setError(null)
  }, [urlInput, wsSend])

  // Back / Forward / Refresh
  const handleBack = useCallback(() => wsSend({ type: 'back' }), [wsSend])
  const handleForward = useCallback(() => wsSend({ type: 'forward' }), [wsSend])
  const handleRefresh = useCallback(() => {
    if (currentUrl) wsSend({ type: 'navigate', url: currentUrl })
  }, [currentUrl, wsSend])

  // Save login to vault
  const [savingLogin, setSavingLogin] = useState(false)
  const handleSaveLogin = useCallback(async () => {
    if (!activeSessionId) return
    const label = prompt('Enter a label for this saved login (e.g. "HubSpot", "GitHub"):')
    if (!label?.trim()) return

    setSavingLogin(true)
    try {
      await engine.saveBrowserToVault(activeSessionId, label.trim())
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
    setSavingLogin(false)
  }, [activeSessionId])

  // Take control from agent browser mode
  const handleTakeControl = useCallback(async () => {
    if (!activeSessionId) return
    wsSend({ type: 'control', controller: 'human' })
    setMode('take_control')
  }, [activeSessionId, wsSend])

  // Return to agent
  const handleReturnToAgent = useCallback(() => {
    if (!activeSessionId) return
    wsSend({ type: 'control', controller: 'agent' })
    setMode('agent_browser')
  }, [activeSessionId, wsSend])

  // Pop out to new window
  const handlePopout = useCallback(() => {
    if (!activeSessionId) return
    window.open(`/browser-popout?session=${activeSessionId}`, '_blank', 'width=1360,height=920')
  }, [activeSessionId])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
        <div className="flex items-center gap-2" data-testid="browser-loading">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-forest-green border-t-transparent" />
          Connecting to browser...
        </div>
      </div>
    )
  }

  return (
    <div className={`flex-1 flex flex-col overflow-hidden ${popout ? 'h-screen' : ''}`} data-testid="browser-panel">
      {/* URL bar + nav controls */}
      {mode === 'take_control' && (
        <div className="flex items-center gap-1 border-b border-border-subtle bg-light-surface-alt px-2 py-1" data-testid="browser-url-bar">
          <button
            onClick={handleBack}
            className="p-1 rounded hover:bg-light-surface-alt2 text-text-muted"
            title="Back"
            data-testid="browser-back"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
          </button>
          <button
            onClick={handleForward}
            className="p-1 rounded hover:bg-light-surface-alt2 text-text-muted"
            title="Forward"
            data-testid="browser-forward"
          >
            <span className="material-symbols-outlined text-base">arrow_forward</span>
          </button>
          <button
            onClick={handleRefresh}
            className="p-1 rounded hover:bg-light-surface-alt2 text-text-muted"
            title="Refresh"
            data-testid="browser-refresh"
          >
            <span className="material-symbols-outlined text-base">refresh</span>
          </button>
          <form onSubmit={handleNavigate} className="flex-1 flex">
            <input
              ref={urlInputRef}
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Enter URL..."
              data-testid="browser-url-input"
              autoFocus={!currentUrl || currentUrl === 'about:blank'}
              className="flex-1 bg-white border border-border-subtle rounded px-2 py-1 text-xs focus:border-forest-green focus:outline-none"
            />
          </form>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setZoom(z => Math.max(25, z - 25))}
              className="p-1 rounded hover:bg-light-surface-alt2 text-text-muted"
              title="Zoom out"
              data-testid="browser-zoom-out"
            >
              <span className="material-symbols-outlined text-sm">zoom_out</span>
            </button>
            <button
              onClick={() => setZoom(100)}
              className="px-1 py-0.5 rounded hover:bg-light-surface-alt2 text-text-muted text-[10px] font-mono min-w-[36px] text-center"
              title="Reset zoom"
              data-testid="browser-zoom-reset"
            >
              {zoom}%
            </button>
            <button
              onClick={() => setZoom(z => Math.min(200, z + 25))}
              className="p-1 rounded hover:bg-light-surface-alt2 text-text-muted"
              title="Zoom in"
              data-testid="browser-zoom-in"
            >
              <span className="material-symbols-outlined text-sm">zoom_in</span>
            </button>
          </div>
          <button
            onClick={handleSaveLogin}
            disabled={savingLogin}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-light-surface-alt2 text-text-muted disabled:opacity-50"
            title="Save login session to vault"
            data-testid="browser-save-login"
          >
            <span className="material-symbols-outlined text-sm">security</span>
            Save Login
          </button>
          {!popout && (
            <button
              onClick={handlePopout}
              className="p-1 rounded hover:bg-light-surface-alt2 text-text-muted"
              title="Pop out to new window"
              data-testid="browser-popout"
            >
              <span className="material-symbols-outlined text-sm">open_in_new</span>
            </button>
          )}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="border-b border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-600 flex items-center justify-between" data-testid="browser-error">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-2">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* Browser view */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-auto bg-slate-100 p-2"
        data-testid="browser-viewport"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {connected ? (
          <canvas
            ref={canvasRef}
            onClick={handleClick}
            onWheel={handleWheel}
            data-testid="browser-canvas"
            className={`rounded border border-border-subtle shadow-lg ${
              mode === 'take_control' ? 'cursor-crosshair' : 'cursor-default'
            }`}
            style={{
              imageRendering: 'auto',
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'center center',
              maxWidth: zoom <= 100 ? '100%' : 'none',
              maxHeight: zoom <= 100 ? '100%' : 'none',
            }}
          />
        ) : (
          <div className="text-center text-text-muted text-sm">
            <span className="material-symbols-outlined text-4xl block mb-3 text-forest-green/40">language</span>
            {isAgentSession ? (
              <p data-testid="browser-waiting-agent">Waiting for agent to start browsing...</p>
            ) : (
              <>
                <p className="font-medium text-text-main mb-1" data-testid="browser-ready">Browser ready</p>
                <p>Type a URL in the address bar above to get started</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Status bar */}
      {!popout && (
        <div className="flex items-center justify-between border-t border-border-subtle bg-light-surface-alt px-3 py-1.5 text-xs text-text-muted" data-testid="browser-status-bar">
          <div className="flex items-center gap-3">
            {mode === 'take_control' ? (
              <span className="flex items-center gap-1">
                <span className={`h-2 w-2 rounded-full ${connected ? 'bg-forest-green' : 'bg-gray-400'}`} data-testid="browser-connection-indicator" />
                Take Control
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <span className={`h-2 w-2 rounded-full ${connected ? 'animate-pulse bg-blue-500' : 'bg-gray-400'}`} data-testid="browser-connection-indicator" />
                Agent Browser
              </span>
            )}
            {currentUrl && (
              <span className="max-w-xs truncate text-text-muted/70">{currentUrl}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {mode === 'agent_browser' && (
              <button
                onClick={handleTakeControl}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-forest-green text-white hover:bg-forest-green/90 text-xs font-medium"
                data-testid="browser-take-control"
              >
                <span className="material-symbols-outlined text-sm">pan_tool</span>
                Take Control
              </button>
            )}
            {mode === 'take_control' && isAgentSession && (
              <button
                onClick={handleReturnToAgent}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500 text-white hover:bg-blue-600 text-xs font-medium"
                data-testid="browser-return-to-agent"
              >
                <span className="material-symbols-outlined text-sm">smart_toy</span>
                Return to Agent
              </button>
            )}
            {!popout && activeSessionId && (
              <button
                onClick={handlePopout}
                className="p-0.5 rounded hover:bg-light-surface-alt2 text-text-muted"
                title="Pop out to new window"
                data-testid="browser-popout"
              >
                <span className="material-symbols-outlined text-sm">open_in_new</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

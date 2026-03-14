import { useState, useRef, useEffect, useCallback } from 'react'
import * as engine from '@/lib/engine'

type BrowserMode = 'take_control' | 'agent_browser'

interface BrowserPanelProps {
  sessionId: string
}

/**
 * Live browser viewer for the workspace context pane.
 * Two modes:
 *   - Agent Browser: agent drives, human observes in real-time (default)
 *   - Take Control: human drives the browser via click/type/scroll
 */
export function BrowserPanel({ sessionId }: BrowserPanelProps) {
  const isAgentSession = sessionId.startsWith('agent:')
  const agentId = isAgentSession ? sessionId.slice('agent:'.length) : null

  const [mode, setMode] = useState<BrowserMode>(isAgentSession ? 'agent_browser' : 'take_control')
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [currentUrl, setCurrentUrl] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(isAgentSession ? null : sessionId)
  const imgRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Initialize session
  useEffect(() => {
    if (isAgentSession) {
      // Agent browser mode — fetch initial screenshot from agent
      const fetchAgentScreenshot = async () => {
        try {
          const result = await engine.getAgentBrowserScreenshot(agentId!)
          setScreenshot(result.screenshot)
          setCurrentUrl(result.url)
          setUrlInput(result.url)
        } catch {
          // Agent may not have an active browser yet
          setScreenshot(null)
        }
        setLoading(false)
      }
      fetchAgentScreenshot()
    } else {
      // Take control mode — session already exists or needs to be created
      const initSession = async () => {
        try {
          const result = await engine.getBrowserScreenshot(sessionId)
          setScreenshot(result.screenshot)
          setCurrentUrl(result.url)
          setUrlInput(result.url)
        } catch {
          setError('Failed to connect to browser session')
        }
        setLoading(false)
      }
      initSession()
    }
  }, [sessionId, isAgentSession, agentId])

  // Subscribe to SSE browser_frame events for agent browser mode
  useEffect(() => {
    if (mode !== 'agent_browser' || !agentId) return
    const unsub = engine.subscribeSse('browser_frame', (data: unknown) => {
      const frame = data as { agentId?: string; screenshot?: string; tool?: string }
      if (frame.agentId === agentId && frame.screenshot) {
        setScreenshot(frame.screenshot)
      }
    })
    return unsub
  }, [mode, agentId])

  // Periodic refresh as fallback (2s interval)
  useEffect(() => {
    if (mode === 'agent_browser') return // SSE handles this
    if (!activeSessionId) return

    const interval = setInterval(async () => {
      try {
        const result = await engine.getBrowserScreenshot(activeSessionId)
        setScreenshot(result.screenshot)
        setCurrentUrl(result.url)
        setUrlInput(result.url)
      } catch { /* ignore */ }
    }, 2000)

    return () => clearInterval(interval)
  }, [mode, activeSessionId])

  // Click handler — map coordinates to 1280x800 viewport
  const handleClick = useCallback(async (e: React.MouseEvent<HTMLImageElement>) => {
    if (mode !== 'take_control' || !activeSessionId || !imgRef.current) return

    const rect = imgRef.current.getBoundingClientRect()
    const scaleX = 1280 / rect.width
    const scaleY = 800 / rect.height
    const x = Math.round((e.clientX - rect.left) * scaleX)
    const y = Math.round((e.clientY - rect.top) * scaleY)

    try {
      const result = await engine.sendBrowserInteraction(activeSessionId, { type: 'click', x, y })
      setScreenshot(result.screenshot)
      setCurrentUrl(result.url)
      setUrlInput(result.url)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [mode, activeSessionId])

  // Keyboard handler
  const handleKeyDown = useCallback(async (e: React.KeyboardEvent) => {
    if (mode !== 'take_control' || !activeSessionId) return

    const specialKeys = ['Enter', 'Tab', 'Backspace', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Delete', 'Home', 'End']
    if (specialKeys.includes(e.key)) {
      e.preventDefault()
      try {
        const result = await engine.sendBrowserInteraction(activeSessionId, { type: 'press', key: e.key })
        setScreenshot(result.screenshot)
        setCurrentUrl(result.url)
        setUrlInput(result.url)
      } catch { /* ignore */ }
      return
    }

    // Regular character typing
    if (e.key.length === 1) {
      e.preventDefault()
      try {
        const result = await engine.sendBrowserInteraction(activeSessionId, { type: 'type', text: e.key })
        setScreenshot(result.screenshot)
        setCurrentUrl(result.url)
        setUrlInput(result.url)
      } catch { /* ignore */ }
    }
  }, [mode, activeSessionId])

  // Scroll handler
  const handleWheel = useCallback(async (e: React.WheelEvent) => {
    if (mode !== 'take_control' || !activeSessionId || !imgRef.current) return

    const rect = imgRef.current.getBoundingClientRect()
    const scaleX = 1280 / rect.width
    const scaleY = 800 / rect.height
    const x = Math.round((e.clientX - rect.left) * scaleX)
    const y = Math.round((e.clientY - rect.top) * scaleY)

    try {
      const result = await engine.sendBrowserInteraction(activeSessionId, {
        type: 'scroll', x, y,
        deltaX: Math.round(e.deltaX),
        deltaY: Math.round(e.deltaY),
      })
      setScreenshot(result.screenshot)
      setCurrentUrl(result.url)
      setUrlInput(result.url)
    } catch { /* ignore */ }
  }, [mode, activeSessionId])

  // URL bar navigation
  const handleNavigate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeSessionId || !urlInput.trim()) return

    try {
      const result = await engine.navigateBrowser(activeSessionId, urlInput.trim())
      setScreenshot(result.screenshot)
      setCurrentUrl(result.url)
      setUrlInput(result.url)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [activeSessionId, urlInput])

  // Refresh
  const handleRefresh = useCallback(async () => {
    if (!activeSessionId) return
    try {
      const result = await engine.navigateBrowser(activeSessionId, currentUrl)
      setScreenshot(result.screenshot)
      setCurrentUrl(result.url)
      setUrlInput(result.url)
    } catch { /* ignore */ }
  }, [activeSessionId, currentUrl])

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
    try {
      setLoading(true)
      const result = await engine.createBrowserSession({ startUrl: currentUrl || undefined })
      setActiveSessionId(result.sessionId)
      setScreenshot(result.screenshot)
      setCurrentUrl(result.url)
      setUrlInput(result.url)
      setMode('take_control')
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
    setLoading(false)
  }, [currentUrl])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-forest-green border-t-transparent" />
          Connecting to browser...
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* URL bar + nav controls */}
      {mode === 'take_control' && (
        <div className="flex items-center gap-1 border-b border-border-subtle bg-light-surface-alt px-2 py-1">
          <button
            onClick={handleRefresh}
            className="p-1 rounded hover:bg-light-surface-alt2 text-text-muted"
            title="Refresh"
          >
            <span className="material-symbols-outlined text-base">refresh</span>
          </button>
          <form onSubmit={handleNavigate} className="flex-1 flex">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Enter URL..."
              className="flex-1 bg-white border border-border-subtle rounded px-2 py-1 text-xs focus:border-forest-green focus:outline-none"
            />
          </form>
          <button
            onClick={handleSaveLogin}
            disabled={savingLogin}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-light-surface-alt2 text-text-muted disabled:opacity-50"
            title="Save login session to vault"
          >
            <span className="material-symbols-outlined text-sm">security</span>
            Save Login
          </button>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="border-b border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-600 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-2">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* Browser view */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-hidden bg-slate-100 p-2"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {screenshot ? (
          <img
            ref={imgRef}
            src={`data:image/png;base64,${screenshot}`}
            alt="Browser view"
            onClick={handleClick}
            onWheel={handleWheel}
            className={`max-h-full max-w-full rounded border border-border-subtle shadow-lg ${
              mode === 'take_control' ? 'cursor-crosshair' : 'cursor-default'
            }`}
            style={{ imageRendering: 'auto' }}
            draggable={false}
          />
        ) : (
          <div className="text-center text-text-muted text-sm">
            <span className="material-symbols-outlined text-3xl block mb-2 text-text-muted/50">language</span>
            <p>{isAgentSession ? 'Waiting for agent to start browsing...' : 'No browser view available'}</p>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between border-t border-border-subtle bg-light-surface-alt px-3 py-1.5 text-xs text-text-muted">
        <div className="flex items-center gap-3">
          {mode === 'take_control' ? (
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-forest-green" />
              Take Control
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
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
            >
              <span className="material-symbols-outlined text-sm">pan_tool</span>
              Take Control
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

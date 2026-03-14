import { useState, useEffect, useRef, useCallback } from 'react'
import * as engine from '@/lib/engine'

interface PreviewPanelProps {
  previewUrl?: string
}

type ViewportMode = 'desktop' | 'tablet' | 'mobile'

const VIEWPORT_WIDTHS: Record<ViewportMode, number | null> = {
  desktop: null,    // full width
  tablet: 768,
  mobile: 375,
}

export function PreviewPanel({ previewUrl: initialUrl }: PreviewPanelProps) {
  const [url, setUrl] = useState<string | null>(initialUrl ?? null)
  const [loading, setLoading] = useState(!initialUrl)
  const [error, setError] = useState<string | null>(null)
  const [viewport, setViewport] = useState<ViewportMode>('desktop')
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [consoleLogs, setConsoleLogs] = useState<string[]>([])
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Fetch preview URL if not provided
  useEffect(() => {
    if (url) return
    let cancelled = false
    setLoading(true)
    engine.getSandboxPreview()
      .then(res => {
        if (!cancelled) {
          setUrl(res.url)
          setLoading(false)
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message ?? 'Failed to get preview URL')
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [url])

  // Listen for sandbox_preview events via SSE
  useEffect(() => {
    const handler = (event: CustomEvent) => {
      const data = event.detail
      if (data?.type === 'tool_result' && data?.toolName === 'sandbox_preview' && data?.result) {
        // Extract URL from tool result like "Preview URL: https://..."
        const match = (data.result as string).match(/Preview URL: (https?:\/\/\S+)/)
        if (match) {
          setUrl(match[1])
          setLoading(false)
        }
      }
    }
    window.addEventListener('yokebot:agent-progress', handler as EventListener)
    return () => window.removeEventListener('yokebot:agent-progress', handler as EventListener)
  }, [])

  const handleRefresh = useCallback(() => {
    if (iframeRef.current && url) {
      iframeRef.current.src = url
    }
  }, [url])

  const vpWidth = VIEWPORT_WIDTHS[viewport]

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-text-muted">
        <div className="flex flex-col items-center gap-3">
          <span className="material-symbols-outlined text-3xl animate-spin">progress_activity</span>
          <span>Starting sandbox preview...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-text-muted">
        <div className="flex flex-col items-center gap-3">
          <span className="material-symbols-outlined text-3xl text-red-400">error</span>
          <span>{error}</span>
          <button
            onClick={() => { setError(null); setUrl(null); setLoading(true) }}
            className="px-3 py-1 rounded bg-forest-green/10 text-forest-green text-xs hover:bg-forest-green/20"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border-subtle bg-light-surface-alt shrink-0">
        <button
          onClick={handleRefresh}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-text-muted hover:bg-light-surface-alt hover:text-text-main transition-colors"
          title="Refresh preview"
        >
          <span className="material-symbols-outlined text-[14px]">refresh</span>
        </button>

        <div className="h-4 w-px bg-border-subtle mx-1" />

        {/* Viewport toggles */}
        {(['mobile', 'tablet', 'desktop'] as ViewportMode[]).map(mode => (
          <button
            key={mode}
            onClick={() => setViewport(mode)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
              viewport === mode
                ? 'bg-forest-green/10 text-forest-green'
                : 'text-text-muted hover:text-text-main hover:bg-light-surface-alt'
            }`}
            title={mode.charAt(0).toUpperCase() + mode.slice(1)}
          >
            <span className="material-symbols-outlined text-[14px]">
              {mode === 'mobile' ? 'smartphone' : mode === 'tablet' ? 'tablet' : 'laptop'}
            </span>
          </button>
        ))}

        <div className="flex-1" />

        {/* Console toggle */}
        <button
          onClick={() => setConsoleOpen(!consoleOpen)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
            consoleOpen
              ? 'bg-forest-green/10 text-forest-green'
              : 'text-text-muted hover:text-text-main hover:bg-light-surface-alt'
          }`}
          title="Toggle console"
        >
          <span className="material-symbols-outlined text-[14px]">terminal</span>
          Console
        </button>

        {/* URL display */}
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-text-muted hover:text-text-main truncate max-w-[200px]"
            title={url}
          >
            <span className="material-symbols-outlined text-[12px]">open_in_new</span>
            {new URL(url).hostname}
          </a>
        )}
      </div>

      {/* Preview iframe */}
      <div className="flex-1 overflow-hidden flex items-start justify-center bg-[#1a1a1a]">
        {url ? (
          <iframe
            ref={iframeRef}
            src={url}
            title="App Preview"
            className="bg-white h-full border-0"
            style={{
              width: vpWidth ? `${vpWidth}px` : '100%',
              maxWidth: '100%',
              boxShadow: vpWidth ? '0 0 20px rgba(0,0,0,0.3)' : 'none',
              borderRadius: vpWidth ? '8px' : '0',
              marginTop: vpWidth ? '8px' : '0',
            }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          />
        ) : (
          <div className="flex items-center justify-center h-full w-full text-sm text-text-muted">
            No preview available. Ask an agent to build something!
          </div>
        )}
      </div>

      {/* Console panel (collapsible) */}
      {consoleOpen && (
        <div className="h-32 border-t border-border-subtle bg-[#1e1e1e] overflow-auto shrink-0">
          <div className="flex items-center justify-between px-2 py-1 border-b border-border-subtle">
            <span className="text-[10px] font-semibold text-text-muted">Console</span>
            <button
              onClick={() => setConsoleLogs([])}
              className="text-[10px] text-text-muted hover:text-text-main"
            >
              Clear
            </button>
          </div>
          <div className="p-2 font-mono text-[11px] text-green-400">
            {consoleLogs.length === 0 ? (
              <span className="text-text-muted">Build output will appear here...</span>
            ) : (
              consoleLogs.map((log, i) => (
                <div key={i} className="whitespace-pre-wrap">{log}</div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

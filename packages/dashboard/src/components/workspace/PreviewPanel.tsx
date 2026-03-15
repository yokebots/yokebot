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
  const [url, setUrl] = useState<string | null>(initialUrl || null)
  const [loading, setLoading] = useState(!initialUrl)
  const [error, setError] = useState<string | null>(null)
  const [viewport, setViewport] = useState<ViewportMode>('desktop')
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [consoleLogs, setConsoleLogs] = useState<string[]>([])
  const [zoom, setZoom] = useState(100)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Publish dialog state
  const [showPublish, setShowPublish] = useState(false)
  const [publishName, setPublishName] = useState('')
  const [publishSubdomain, setPublishSubdomain] = useState('')
  const [publishType, setPublishType] = useState<'static' | 'custom-domain' | 'dynamic'>('custom-domain')
  const [customDomain, setCustomDomain] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState<engine.PublishedApp | null>(null)
  const [publishError, setPublishError] = useState<string | null>(null)

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

  const handlePublish = async () => {
    if (!publishName.trim() || !publishSubdomain.trim()) return
    setPublishing(true)
    setPublishError(null)

    try {
      // For paid hosting, handle Stripe checkout flow first
      if (publishType === 'custom-domain' || publishType === 'dynamic') {
        const checkout = await engine.checkoutHostingAddon(publishName, publishType)
        if (checkout.url) {
          // Redirect to Stripe checkout
          window.location.href = checkout.url
          return
        }
        // If added directly (existing subscription), continue to publish
      }

      const app = await engine.publishApp({
        appName: publishName.trim(),
        displayName: publishName.trim(),
        subdomain: publishSubdomain.trim(),
        hostingType: publishType,
        ...(publishType !== 'static' && customDomain.trim() ? { customDomain: customDomain.trim() } : {}),
      })
      setPublishResult(app)
    } catch (err) {
      setPublishError((err as Error).message)
    } finally {
      setPublishing(false)
    }
  }

  // Auto-generate subdomain from name
  const handleNameChange = (name: string) => {
    setPublishName(name)
    const subdomain = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 63)
    setPublishSubdomain(subdomain)
  }

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

        <div className="h-4 w-px bg-border-subtle mx-1" />

        {/* Zoom controls */}
        <button
          onClick={() => setZoom(z => Math.max(25, z - 25))}
          className="flex items-center px-1 py-1 rounded text-xs text-text-muted hover:text-text-main hover:bg-light-surface-alt transition-colors"
          title="Zoom out"
        >
          <span className="material-symbols-outlined text-[14px]">zoom_out</span>
        </button>
        <button
          onClick={() => setZoom(100)}
          className="px-1 py-0.5 rounded text-[10px] font-mono text-text-muted hover:text-text-main hover:bg-light-surface-alt min-w-[36px] text-center transition-colors"
          title="Reset zoom"
        >
          {zoom}%
        </button>
        <button
          onClick={() => setZoom(z => Math.min(200, z + 25))}
          className="flex items-center px-1 py-1 rounded text-xs text-text-muted hover:text-text-main hover:bg-light-surface-alt transition-colors"
          title="Zoom in"
        >
          <span className="material-symbols-outlined text-[14px]">zoom_in</span>
        </button>

        <div className="flex-1" />

        {/* Publish button */}
        <button
          onClick={() => setShowPublish(true)}
          className="flex items-center gap-1 px-3 py-1 rounded text-xs bg-forest-green text-white hover:bg-forest-green/90 transition-colors"
          title="Publish this app"
        >
          <span className="material-symbols-outlined text-[14px]">rocket_launch</span>
          Publish
        </button>

        <div className="h-4 w-px bg-border-subtle mx-1" />

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

      {/* Publish Dialog */}
      {showPublish && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-light-surface rounded-lg shadow-xl border border-border-subtle w-[420px] max-w-[90vw]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
              <h3 className="text-sm font-semibold text-text-main">Publish App</h3>
              <button
                onClick={() => { setShowPublish(false); setPublishResult(null); setPublishError(null) }}
                className="text-text-muted hover:text-text-main"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {publishResult ? (
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-2xl text-forest-green">check_circle</span>
                  <span className="text-sm font-medium text-text-main">Published!</span>
                </div>
                <div className="bg-light-surface-alt rounded p-3 mb-3">
                  <div className="text-[10px] text-text-muted mb-1">Your app is live at:</div>
                  <a
                    href={publishResult.publishedUrl ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-forest-green hover:underline font-mono"
                  >
                    {publishResult.publishedUrl}
                  </a>
                </div>
                <button
                  onClick={() => { setShowPublish(false); setPublishResult(null) }}
                  className="w-full px-3 py-2 rounded text-xs bg-forest-green text-white hover:bg-forest-green/90"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                <div>
                  <label className="block text-[11px] text-text-muted mb-1">App Name</label>
                  <input
                    type="text"
                    value={publishName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="My Awesome App"
                    className="w-full px-3 py-2 rounded border border-border-subtle bg-light-surface text-sm text-text-main placeholder:text-text-muted/50 focus:outline-none focus:ring-1 focus:ring-forest-green"
                    autoFocus
                  />
                </div>

                {publishType === 'static' && (
                  <div>
                    <label className="block text-[11px] text-text-muted mb-1">Subdomain</label>
                    <div className="flex items-center gap-0">
                      <input
                        type="text"
                        value={publishSubdomain}
                        onChange={(e) => setPublishSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                        placeholder="my-awesome-app"
                        className="flex-1 px-3 py-2 rounded-l border border-r-0 border-border-subtle bg-light-surface text-sm text-text-main font-mono placeholder:text-text-muted/50 focus:outline-none focus:ring-1 focus:ring-forest-green"
                      />
                      <span className="px-3 py-2 rounded-r border border-border-subtle bg-light-surface-alt text-[11px] text-text-muted whitespace-nowrap">
                        .yokebot.app
                      </span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] text-text-muted mb-1">Hosting Plan</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setPublishType('custom-domain')}
                      className={`p-3 rounded border text-left transition-colors ${
                        publishType === 'custom-domain'
                          ? 'border-forest-green bg-forest-green/5'
                          : 'border-border-subtle hover:border-text-muted/30'
                      }`}
                    >
                      <div className="text-xs font-medium text-text-main">Static Site</div>
                      <div className="text-[10px] text-forest-green mt-0.5">$9/mo</div>
                      <div className="text-[9px] text-text-muted mt-0.5">Your domain, fast CDN</div>
                    </button>
                    <button
                      onClick={() => setPublishType('dynamic')}
                      className={`p-3 rounded border text-left transition-colors ${
                        publishType === 'dynamic'
                          ? 'border-forest-green bg-forest-green/5'
                          : 'border-border-subtle hover:border-text-muted/30'
                      }`}
                    >
                      <div className="text-xs font-medium text-text-main">App Hosting</div>
                      <div className="text-[10px] text-forest-green mt-0.5">$25/mo</div>
                      <div className="text-[9px] text-text-muted mt-0.5">Server, database, API</div>
                    </button>
                  </div>
                  <button
                    onClick={() => setPublishType('static')}
                    className="mt-2 text-[10px] text-text-muted hover:text-text-main transition-colors"
                  >
                    Or share for free on yokebot.app
                  </button>
                </div>

                {(publishType === 'custom-domain' || publishType === 'dynamic') && (
                  <div>
                    <label className="block text-[11px] text-text-muted mb-1">Custom Domain</label>
                    <input
                      type="text"
                      value={customDomain}
                      onChange={(e) => setCustomDomain(e.target.value.toLowerCase().trim())}
                      placeholder="app.yourbusiness.com"
                      className="w-full px-3 py-2 rounded border border-border-subtle bg-light-surface text-sm text-text-main font-mono placeholder:text-text-muted/50 focus:outline-none focus:ring-1 focus:ring-forest-green"
                    />
                    <div className="text-[10px] text-text-muted mt-1">
                      Point a CNAME record from your domain to your app after publishing.
                    </div>
                  </div>
                )}

                {publishType === 'dynamic' && (
                  <div className="bg-light-surface-alt rounded p-2 text-[10px] text-text-muted">
                    Includes 100 compute hrs, 5GB bandwidth, 500MB storage, 100MB DB, 500K requests/mo.
                    Overages billed from your credits.
                  </div>
                )}

                {publishError && (
                  <div className="text-xs text-red-400 bg-red-400/10 rounded p-2">{publishError}</div>
                )}

                <button
                  onClick={handlePublish}
                  disabled={publishing || !publishName.trim() || !publishSubdomain.trim()}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded text-xs bg-forest-green text-white hover:bg-forest-green/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {publishing ? (
                    <>
                      <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                      Publishing...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[14px]">rocket_launch</span>
                      {publishType === 'dynamic' ? 'Subscribe & Publish — $25/mo'
                        : publishType === 'custom-domain' ? 'Subscribe & Publish — $9/mo'
                        : 'Publish — Free'}
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Preview iframe */}
      <div className="flex-1 overflow-auto flex items-start justify-center bg-[#1a1a1a] relative">
        {url ? (
          <iframe
            ref={iframeRef}
            src={url}
            title="App Preview"
            className="bg-white border-0"
            style={{
              width: vpWidth ? `${vpWidth}px` : '100%',
              height: '100%',
              maxWidth: zoom <= 100 ? '100%' : 'none',
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'top center',
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

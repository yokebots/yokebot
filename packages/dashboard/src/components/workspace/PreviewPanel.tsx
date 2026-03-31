import { useState, useEffect, useRef, useCallback } from 'react'
import * as engine from '@/lib/engine'
import { useAuth } from '@/lib/auth'
import { AnnotationOverlay, buildAnnotationMessage } from './AnnotationOverlay'
import { StyleEditorPanel, type SelectedElement, type StyleChange } from './StyleEditorPanel'

interface PreviewPanelProps {
  previewUrl?: string
  /** Channel ID for sending annotation messages to the bot */
  channelId?: string
  /** Sandbox project ID — if provided, fetches this project's preview URL */
  projectId?: string
}

type ViewportMode = 'desktop' | 'tablet' | 'mobile'
type EditMode = 'none' | 'annotate' | 'edit'

const VIEWPORT_WIDTHS: Record<ViewportMode, number | null> = {
  desktop: null,    // full width
  tablet: 768,
  mobile: 375,
}

const VIEWPORT_PREFIX: Record<ViewportMode, string> = {
  desktop: 'lg:',
  tablet: 'md:',
  mobile: '',  // mobile-first = no prefix
}

export function PreviewPanel({ previewUrl: initialUrl, channelId, projectId }: PreviewPanelProps) {
  const { user } = useAuth()
  const userId = user?.id
  const [url, setUrl] = useState<string | null>(initialUrl || null)
  const [loading, setLoading] = useState(!initialUrl)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewport, setViewport] = useState<ViewportMode>('desktop')
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [consoleLogs, setConsoleLogs] = useState<string[]>([])
  const [zoom, setZoom] = useState(100)
  const [editMode, setEditMode] = useState<EditMode>('none')
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [wakingUp, setWakingUp] = useState(false)
  const [wakeProgress, setWakeProgress] = useState(0)
  const [saveToast, setSaveToast] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const previewContainerRef = useRef<HTMLDivElement>(null)

  // Publish dialog state
  const [showPublish, setShowPublish] = useState(false)
  const [publishName, setPublishName] = useState('')
  const [publishSubdomain, setPublishSubdomain] = useState('')
  const [publishType, setPublishType] = useState<'static' | 'custom-domain' | 'dynamic'>('custom-domain')
  const [customDomain, setCustomDomain] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState<engine.PublishedApp | null>(null)
  const [publishError, setPublishError] = useState<string | null>(null)

  // Fetch preview via proxy — auto-retry with wake-up if sandbox is stopped
  // Re-run when projectId changes (switching between project tabs)
  const prevProjectRef = useRef(projectId)
  useEffect(() => {
    // Reset URL when switching to a different project
    if (prevProjectRef.current !== projectId) {
      prevProjectRef.current = projectId
      setUrl(null)
      setLoading(true)
      setError(null)
      setIframeLoaded(false)
    }
  }, [projectId])

  // Track if this is the first mount — always fetch fresh token on first mount
  const hasMountedRef = useRef(false)
  useEffect(() => {
    // Skip re-fetch if URL exists AND we've already mounted (not first load)
    if (url && hasMountedRef.current) return
    hasMountedRef.current = true
    let cancelled = false
    setLoading(true)

    async function fetchWithRetry() {
      // If we have a specific project ID, get its port and use the proxy (never raw Daytona URL)
      if (projectId && projectId !== 'default') {
        try {
          const project = await engine.getSandboxProject(projectId)
          if (!cancelled && project.devPort) {
            const res = await engine.getSandboxProxyToken(project.devPort)
            const newUrl = `${engine.getBaseUrl()}${res.proxyUrl}`
            setUrl(newUrl)
            setLoading(false)
            return
          }
        } catch { /* fall through to default proxy */ }
      }

      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          const res = await engine.getSandboxProxyToken()
          if (!cancelled) {
            setUrl(`${engine.getBaseUrl()}${res.proxyUrl}`)
            setLoading(false)
            setWakingUp(false)
          }
          return
        } catch (err) {
          if (cancelled) return
          if (attempt === 0) {
            // First failure — try to start the sandbox
            setWakingUp(true)
            setWakeProgress(10)
            try { await engine.startSandbox() } catch { /* sandbox may already be starting */ }
          }
          // Update progress
          setWakeProgress(Math.min(90, 10 + (attempt + 1) * 9))
          // Wait before retry
          await new Promise(r => setTimeout(r, 3000))
        }
      }
      // All retries failed
      if (!cancelled) {
        setError('Sandbox failed to wake up. Try starting it from the Files panel.')
        setLoading(false)
        setWakingUp(false)
      }
    }

    fetchWithRetry()
    return () => { cancelled = true }
  }, [url, projectId])

  // Listen for sandbox_preview events via SSE
  useEffect(() => {
    const handler = (event: CustomEvent) => {
      const data = event.detail
      if (data?.type === 'tool_result' && data?.toolName === 'sandbox_preview' && data?.result) {
        if (!url) {
          setLoading(true)
          engine.getSandboxProxyToken()
            .then(res => {
              setUrl(`${engine.getBaseUrl()}${res.proxyUrl}`)
              setLoading(false)
            })
            .catch(() => {})
        } else {
          if (iframeRef.current) iframeRef.current.src = url
        }
      }
    }
    window.addEventListener('yokebot:agent-progress', handler as EventListener)
    return () => window.removeEventListener('yokebot:agent-progress', handler as EventListener)
  }, [url])

  // Reset iframe loaded state when URL changes, with timeout fallback
  useEffect(() => {
    setIframeLoaded(false)
    // Fallback: if onLoad never fires (slow/partial response), clear overlay after 8s
    if (url) {
      const timeout = setTimeout(() => setIframeLoaded(true), 8000)
      return () => clearTimeout(timeout)
    }
  }, [url])

  // ---- Edit mode: postMessage listener for element selection ----
  useEffect(() => {
    if (editMode !== 'edit') return
    const handler = (e: MessageEvent) => {
      // Validate origin: only accept messages from our own engine proxy
      const expectedOrigin = new URL(engine.getBaseUrl()).origin
      if (e.origin !== expectedOrigin && e.origin !== window.location.origin) return

      const data = e.data
      if (!data || typeof data.type !== 'string') return

      if (data.type === 'yokebot:element-selected') {
        setSelectedElement({
          tagName: data.tagName,
          id: data.id,
          className: data.className,
          textContent: data.textContent,
          computedStyles: data.computedStyles,
          rect: data.rect,
          sourceFile: data.sourceFile,
          sourceLine: data.sourceLine,
          selector: data.selector,
        })
      }

      if (data.type === 'yokebot:history-state') {
        setCanUndo(data.canUndo)
        setCanRedo(data.canRedo)
      }

      if (data.type === 'yokebot:text-changed') {
        const persistText = async () => {
          // Try direct source file edit first
          if (data.sourceFile && data.sourceLine) {
            try {
              const result = await engine.applyTextToSource({
                sourceFile: data.sourceFile,
                sourceLine: data.sourceLine,
                oldText: data.oldText || '',
                newText: data.newText,
              })
              if (result.ok && result.replaced !== false) {
                setSaveToast(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
                setTimeout(() => setSaveToast(null), 3000)
                return
              }
            } catch (err) {
              console.warn('[PreviewPanel] Direct text persist failed:', (err as Error).message)
            }
          }

          // Fallback: send change to BuilderBot via chat
          if (channelId && userId) {
            let mention = ''
            try {
              const completions = await engine.getMentionCompletions()
              const builder = completions.agents.find(a => a.name.toLowerCase().includes('builderbot') || a.name.toLowerCase().includes('builder bot'))
              if (builder) mention = `@[${builder.name}](agent:${builder.id}) `
            } catch { /* proceed without mention */ }

            const oldSnippet = data.oldText ? `"${data.oldText}"` : 'the text'
            await engine.sendMessage(channelId, {
              senderType: 'human',
              senderId: userId,
              content: `${mention}Please change ${oldSnippet} to "${data.newText}" in the app. I edited it visually in the preview but need you to update the source code.`,
            })
            setSaveToast(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' (via BuilderBot)')
            setTimeout(() => setSaveToast(null), 3000)
          }
        }
        persistText()
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [editMode])

  // Toggle picker in iframe when edit mode changes
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe?.contentWindow) return
    iframe.contentWindow.postMessage({
      type: 'yokebot:toggle-picker',
      enabled: editMode === 'edit',
    }, new URL(engine.getBaseUrl()).origin)
    if (editMode !== 'edit') setSelectedElement(null)
  }, [editMode])

  const handleRefresh = useCallback(() => {
    if (iframeRef.current && url) {
      setIframeLoaded(false)
      iframeRef.current.src = url
    }
  }, [url])

  // ---- Undo/redo ----
  const handleUndo = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'yokebot:undo-change' }, new URL(engine.getBaseUrl()).origin)
  }, [])

  const handleRedo = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'yokebot:redo-change' }, new URL(engine.getBaseUrl()).origin)
  }, [])

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    if (editMode !== 'edit') return
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) handleRedo()
        else handleUndo()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
        e.preventDefault()
        handleRedo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [editMode, handleUndo, handleRedo])

  // ---- Annotation: send to bot ----
  const handleSendAnnotations = useCallback(async (annotations: Array<{
    type: string; startX: number; startY: number; endX: number; endY: number; text?: string
  }>) => {
    if (!channelId || !userId) return
    const container = previewContainerRef.current
    const w = container?.clientWidth ?? 800
    const h = container?.clientHeight ?? 600
    const message = buildAnnotationMessage(annotations, w, h)

    // Find BuilderBot agent to @mention it
    let mention = ''
    try {
      const completions = await engine.getMentionCompletions()
      const builder = completions.agents.find(a => a.name.toLowerCase().includes('builderbot') || a.name.toLowerCase().includes('builder bot'))
      if (builder) mention = `@[${builder.name}](agent:${builder.id}) `
    } catch { /* proceed without mention */ }

    engine.sendMessage(channelId, {
      senderType: 'human',
      senderId: userId,
      content: mention + message,
    })
    setEditMode('none')
  }, [channelId, userId])

  // ---- Style editor: apply changes ----
  const handleApplyStyle = useCallback((selector: string, changes: StyleChange[]) => {
    const iframe = iframeRef.current
    if (!iframe?.contentWindow) return

    // 1. Instant preview via postMessage
    for (const change of changes) {
      iframe.contentWindow.postMessage({
        type: 'yokebot:apply-style',
        selector,
        styles: { [change.property]: change.value },
      }, new URL(engine.getBaseUrl()).origin)
    }

    // 2. Persist to source file via engine API (with responsive breakpoint prefix)
    if (selectedElement?.sourceFile && selectedElement.sourceLine) {
      const prefix = VIEWPORT_PREFIX[viewport]
      engine.applyStyleToSource({
        sourceFile: selectedElement.sourceFile,
        sourceLine: selectedElement.sourceLine,
        changes: changes.map(c => ({ property: c.property, value: c.value, tailwindClass: prefix + c.tailwindClass })),
      }).catch(err => {
        console.warn('[PreviewPanel] Failed to persist style change:', err.message)
      })
    }
  }, [selectedElement, viewport])

  const handlePublish = async () => {
    if (!publishName.trim() || !publishSubdomain.trim()) return
    setPublishing(true)
    setPublishError(null)

    try {
      if (publishType === 'custom-domain' || publishType === 'dynamic') {
        const checkout = await engine.checkoutHostingAddon(publishName, publishType)
        if (checkout.url) {
          window.location.href = checkout.url
          return
        }
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
          <span>{wakingUp ? 'Sandbox is waking up...' : 'Starting sandbox preview...'}</span>
          {wakingUp && (
            <div className="w-48">
              <div className="h-1.5 bg-border-subtle rounded-full overflow-hidden">
                <div
                  className="h-full bg-forest-green rounded-full transition-all duration-1000"
                  style={{ width: `${wakeProgress}%` }}
                />
              </div>
              <p className="text-[10px] text-text-muted mt-1.5 text-center">
                Resuming from idle — this takes ~30 seconds
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-text-muted">
        <div className="flex flex-col items-center gap-4 max-w-xs text-center">
          <span className="material-symbols-outlined text-4xl text-amber-400">power_settings_new</span>
          <p className="font-medium text-text-main">Dev server is not running</p>
          <p className="text-xs text-text-muted">The app needs its dev server started to show the preview.</p>
          <button
            onClick={async () => {
              setError(null)
              setLoading(true)
              setWakingUp(true)
              setWakeProgress(20)
              try {
                if (projectId && projectId !== 'default') {
                  await engine.startProjectDevServer(projectId)
                } else {
                  await engine.startSandbox()
                }
                setWakeProgress(80)
                // Re-fetch URL after server starts
                setUrl(null)
              } catch {
                setError('Failed to start dev server. Try again.')
                setLoading(false)
                setWakingUp(false)
              }
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-forest-green text-white text-sm font-medium hover:bg-forest-green/90 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">play_arrow</span>
            Start Dev Server
          </button>
          <button
            onClick={() => { setError(null); setUrl(null); setLoading(true) }}
            className="text-xs text-text-muted hover:text-text-main transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      <div className="flex flex-col flex-1 min-w-0">
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

          <div className="h-4 w-px bg-border-subtle mx-1" />

          {/* Annotate toggle */}
          <button
            onClick={() => setEditMode(editMode === 'annotate' ? 'none' : 'annotate')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
              editMode === 'annotate'
                ? 'bg-red-500/10 text-red-400'
                : 'text-text-muted hover:text-text-main hover:bg-light-surface-alt'
            }`}
            title="Annotate — mark areas for the bot to fix"
          >
            <span className="material-symbols-outlined text-[14px]">draw</span>
            Annotate
          </button>

          {/* Edit toggle */}
          <button
            onClick={() => setEditMode(editMode === 'edit' ? 'none' : 'edit')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
              editMode === 'edit'
                ? 'bg-blue-500/10 text-blue-400'
                : 'text-text-muted hover:text-text-main hover:bg-light-surface-alt'
            }`}
            title="Visual Edit — click elements to edit styles"
          >
            <span className="material-symbols-outlined text-[14px]">edit</span>
            Edit
          </button>

          {editMode === 'edit' && (
            <>
              <div className="h-4 w-px bg-border-subtle mx-1" />
              <button
                onClick={handleUndo}
                disabled={!canUndo}
                className="flex items-center px-1.5 py-1 rounded text-xs text-text-muted hover:text-text-main hover:bg-light-surface-alt disabled:opacity-30 transition-colors"
                title="Undo (Ctrl+Z)"
              >
                <span className="material-symbols-outlined text-[14px]">undo</span>
              </button>
              <button
                onClick={handleRedo}
                disabled={!canRedo}
                className="flex items-center px-1.5 py-1 rounded text-xs text-text-muted hover:text-text-main hover:bg-light-surface-alt disabled:opacity-30 transition-colors"
                title="Redo (Ctrl+Shift+Z)"
              >
                <span className="material-symbols-outlined text-[14px]">redo</span>
              </button>
              <span className="text-[9px] text-text-muted ml-0.5">
                {viewport === 'mobile' ? 'base' : viewport === 'tablet' ? 'md:' : 'lg:'}
              </span>
            </>
          )}

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

        {/* Preview iframe + overlays */}
        <div ref={previewContainerRef} className="flex-1 overflow-auto flex items-start justify-center bg-[#1a1a1a] relative">
          {/* Loading spinner overlay (shown while iframe is loading) */}
          {url && !iframeLoaded && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#1a1a1a]">
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  <span className="material-symbols-outlined text-4xl text-forest-green animate-spin">progress_activity</span>
                </div>
                <span className="text-sm text-text-muted">Loading preview...</span>
              </div>
            </div>
          )}

          {/* Autosave toast */}
          {saveToast && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-forest-green/90 backdrop-blur-sm text-white text-xs font-medium shadow-lg transition-opacity duration-300">
              <span className="material-symbols-outlined text-[14px]">check_circle</span>
              Autosaved {saveToast}
            </div>
          )}

          {/* Annotation overlay */}
          {editMode === 'annotate' && url && (
            <AnnotationOverlay
              width={previewContainerRef.current?.clientWidth ?? 800}
              height={previewContainerRef.current?.clientHeight ?? 600}
              onSendToBot={handleSendAnnotations}
              onClose={() => setEditMode('none')}
            />
          )}

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
                // In annotate mode, disable iframe pointer events so canvas gets them
                pointerEvents: editMode === 'annotate' ? 'none' : 'auto',
              }}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
              onLoad={() => setIframeLoaded(true)}
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

      {/* Style editor sidebar (right) */}
      {editMode === 'edit' && selectedElement && (
        <StyleEditorPanel
          element={selectedElement}
          onApplyStyle={handleApplyStyle}
          onClose={() => setSelectedElement(null)}
        />
      )}
    </div>
  )
}

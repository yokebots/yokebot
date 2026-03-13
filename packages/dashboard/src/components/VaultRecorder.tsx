import { useState, useRef, useEffect } from 'react'
import {
  startVaultRecording,
  sendVaultInteraction,
  finishVaultRecording,
  cancelVaultRecording,
} from '@/lib/engine'

interface VaultRecorderProps {
  onComplete: () => void
  onCancel: () => void
}

export function VaultRecorder({ onComplete, onCancel }: VaultRecorderProps) {
  const [step, setStep] = useState<'form' | 'recording' | 'saving'>('form')
  const [targetUrl, setTargetUrl] = useState('')
  const [label, setLabel] = useState('')
  const [recordingId, setRecordingId] = useState<string | null>(null)
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [currentUrl, setCurrentUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const recordingIdRef = useRef<string | null>(null)

  // Clean up SSE on unmount
  useEffect(() => {
    return () => {
      // Cancel recording if still active
      if (recordingIdRef.current) {
        cancelVaultRecording(recordingIdRef.current).catch(() => {})
      }
    }
  }, [])

  const handleStart = async () => {
    if (!targetUrl.trim() || !label.trim()) return
    setLoading(true)
    setError(null)

    try {
      const result = await startVaultRecording(targetUrl.trim(), label.trim())
      setRecordingId(result.recordingId)
      recordingIdRef.current = result.recordingId
      setScreenshot(result.screenshot)
      setCurrentUrl(result.url)
      setStep('recording')

      // Note: SSE stream requires auth which EventSource doesn't support easily.
      // We'll use polling via interact responses instead — each interaction returns
      // a fresh screenshot. For periodic refresh we use a simple interval.
      startPeriodicRefresh(result.recordingId)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startPeriodicRefresh = (recId: string) => {
    // Poll for screenshots every 2s as a fallback when no interaction happens
    refreshIntervalRef.current = setInterval(async () => {
      try {
        const snap = await sendVaultInteraction(recId, { type: 'press', key: '' })
        setScreenshot(snap.screenshot)
        setCurrentUrl(snap.url)
      } catch { /* ignore */ }
    }, 2000)
  }

  useEffect(() => {
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current)
    }
  }, [])

  const handleClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!recordingId || !imgRef.current) return

    const rect = imgRef.current.getBoundingClientRect()
    const scaleX = 1280 / rect.width
    const scaleY = 800 / rect.height
    const x = Math.round((e.clientX - rect.left) * scaleX)
    const y = Math.round((e.clientY - rect.top) * scaleY)

    try {
      const result = await sendVaultInteraction(recordingId, { type: 'click', x, y })
      setScreenshot(result.screenshot)
      setCurrentUrl(result.url)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (!recordingId) return

    // Map special keys
    const specialKeys = ['Enter', 'Tab', 'Backspace', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
    if (specialKeys.includes(e.key)) {
      e.preventDefault()
      try {
        const result = await sendVaultInteraction(recordingId, { type: 'press', key: e.key })
        setScreenshot(result.screenshot)
        setCurrentUrl(result.url)
      } catch { /* ignore */ }
      return
    }

    // Regular character typing
    if (e.key.length === 1) {
      e.preventDefault()
      try {
        const result = await sendVaultInteraction(recordingId, { type: 'type', text: e.key })
        setScreenshot(result.screenshot)
        setCurrentUrl(result.url)
      } catch { /* ignore */ }
    }
  }

  const handleFinish = async () => {
    if (!recordingId) return
    setStep('saving')
    setLoading(true)

    try {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current)
      await finishVaultRecording(recordingId, label)
      recordingIdRef.current = null
      onComplete()
    } catch (err) {
      setError((err as Error).message)
      setStep('recording')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = async () => {
    if (recordingId) {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current)
      await cancelVaultRecording(recordingId).catch(() => {})
      recordingIdRef.current = null
    }
    onCancel()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800 px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-forest-green">security</span>
          {step === 'form' ? (
            <span className="text-sm font-medium text-white">Record New Login</span>
          ) : (
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              <span className="text-sm font-medium text-white">Recording — {label}</span>
              <span className="ml-2 max-w-md truncate rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
                {currentUrl}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {step === 'recording' && (
            <button
              onClick={handleFinish}
              disabled={loading}
              className="rounded-lg bg-forest-green px-4 py-1.5 text-sm font-medium text-white hover:bg-forest-green/90 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Session'}
            </button>
          )}
          <button
            onClick={handleCancel}
            className="rounded-lg border border-slate-600 px-4 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="border-b border-red-800 bg-red-900/50 px-4 py-2 text-sm text-red-300">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-200">Dismiss</button>
        </div>
      )}

      {/* Main content */}
      {step === 'form' ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-lg font-bold text-text-main">Record a Login</h2>
            <p className="mb-4 text-sm text-text-muted">
              A secure browser will open so you can log into the service. Only the session state is saved — never your password.
            </p>

            <label className="mb-1 block text-sm font-medium text-text-main">Service Name</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. HubSpot, GitHub, Gmail"
              className="mb-3 w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none"
            />

            <label className="mb-1 block text-sm font-medium text-text-main">Login URL</label>
            <input
              type="text"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="e.g. https://app.hubspot.com/login"
              className="mb-4 w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none"
            />

            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <span className="material-symbols-outlined mr-1 text-sm" style={{ verticalAlign: 'middle' }}>info</span>
              Your password is never stored. Only the resulting session cookies and tokens are saved (encrypted).
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleStart}
                disabled={loading || !targetUrl.trim() || !label.trim()}
                className="flex-1 rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white hover:bg-forest-green/90 disabled:opacity-50"
              >
                {loading ? 'Starting...' : 'Start Recording'}
              </button>
              <button
                onClick={onCancel}
                className="rounded-lg border border-border-subtle px-4 py-2 text-sm text-text-muted hover:bg-light-surface-alt"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="flex flex-1 items-center justify-center overflow-hidden bg-slate-900 p-4"
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          {screenshot ? (
            <img
              ref={imgRef}
              src={`data:image/png;base64,${screenshot}`}
              alt="Browser view"
              onClick={handleClick}
              className="max-h-full max-w-full cursor-crosshair rounded border border-slate-700 shadow-2xl"
              style={{ imageRendering: 'auto' }}
              draggable={false}
            />
          ) : (
            <div className="flex items-center gap-2 text-slate-400">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-forest-green border-t-transparent" />
              Loading browser...
            </div>
          )}
        </div>
      )}

      {/* Saving overlay */}
      {step === 'saving' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
          <div className="flex items-center gap-3 rounded-xl bg-white px-6 py-4 shadow-xl">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-forest-green border-t-transparent" />
            <span className="text-sm font-medium text-text-main">Encrypting and saving session...</span>
          </div>
        </div>
      )}
    </div>
  )
}

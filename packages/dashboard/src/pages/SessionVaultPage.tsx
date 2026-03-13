import { useState, useEffect } from 'react'
import { SettingsLayout } from '@/components/SettingsLayout'
import { VaultRecorder } from '@/components/VaultRecorder'
import {
  listVaultSessions,
  revokeVaultSession,
  deleteVaultSession,
  getVaultSessionLogs,
  type VaultSessionInfo,
  type VaultLogEntry,
} from '@/lib/engine'

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    revoked: 'bg-red-100 text-red-700',
    expired: 'bg-amber-100 text-amber-700',
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] || 'bg-slate-100 text-slate-600'}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

function LogsModal({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [logs, setLogs] = useState<VaultLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getVaultSessionLogs(sessionId).then(setLogs).finally(() => setLoading(false))
  }, [sessionId])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-text-main">Audit Log</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-main">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-forest-green border-t-transparent" />
          </div>
        ) : logs.length === 0 ? (
          <p className="py-4 text-center text-sm text-text-muted">No log entries yet.</p>
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {logs.map((log) => (
              <div key={log.id} className="rounded-lg border border-border-subtle px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text-main">{log.eventType}</span>
                  <span className="text-xs text-text-muted">{timeAgo(log.createdAt)}</span>
                </div>
                {log.details && <p className="mt-0.5 text-xs text-text-muted">{log.details}</p>}
                {log.agentId && <p className="mt-0.5 text-xs text-text-muted">Agent: {log.agentId.slice(0, 8)}...</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function SessionVaultPage() {
  const [sessions, setSessions] = useState<VaultSessionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [recording, setRecording] = useState(false)
  const [logsSessionId, setLogsSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadSessions = () => {
    setLoading(true)
    listVaultSessions()
      .then(setSessions)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false))
  }

  useEffect(loadSessions, [])

  const handleRevoke = async (id: string) => {
    if (!confirm('Revoke this session? Agents will no longer be able to use it.')) return
    try {
      await revokeVaultSession(id)
      loadSessions()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Permanently delete this session and its audit logs?')) return
    try {
      await deleteVaultSession(id)
      loadSessions()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (recording) {
    return (
      <VaultRecorder
        onComplete={() => {
          setRecording(false)
          loadSessions()
        }}
        onCancel={() => setRecording(false)}
      />
    )
  }

  return (
    <SettingsLayout activeTab="vault">
      <div className="max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-text-main">Session Vault</h2>
            <p className="text-sm text-text-muted">
              Manage authenticated browser sessions for your agents. Record a login once — agents replay the session.
            </p>
          </div>
          <button
            onClick={() => setRecording(true)}
            className="flex items-center gap-2 rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white hover:bg-forest-green/90"
          >
            <span className="material-symbols-outlined text-lg">add_circle</span>
            Record New Login
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
            <button onClick={() => setError(null)} className="ml-2 font-medium underline">
              Dismiss
            </button>
          </div>
        )}

        {/* Loading state */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-forest-green border-t-transparent" />
          </div>
        ) : sessions.length === 0 ? (
          /* Empty state */
          <div className="rounded-lg border border-border-subtle bg-white px-6 py-12 text-center">
            <span className="material-symbols-outlined mb-2 text-4xl text-text-muted">lock_open</span>
            <h3 className="mb-1 text-sm font-bold text-text-main">No saved sessions yet</h3>
            <p className="mb-4 text-sm text-text-muted">
              Record a login to give your agents authenticated access to web services like CRMs, email, and more.
            </p>
            <button
              onClick={() => setRecording(true)}
              className="rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white hover:bg-forest-green/90"
            >
              Record Your First Login
            </button>
          </div>
        ) : (
          /* Session cards */
          <div className="space-y-3">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between rounded-lg border border-border-subtle bg-white px-5 py-4"
              >
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-2xl text-text-muted">language</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-text-main">{session.serviceLabel}</span>
                      <StatusBadge status={session.status} />
                    </div>
                    <p className="text-xs text-text-muted">{session.domain}</p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      Recorded {timeAgo(session.recordedAt)}
                      {session.useCount > 0 && <> &middot; Used {session.useCount} time{session.useCount !== 1 ? 's' : ''}</>}
                      {session.lastUsedAt && <> &middot; Last used {timeAgo(session.lastUsedAt)}</>}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setLogsSessionId(session.id)}
                    className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-medium text-text-muted hover:bg-light-surface-alt"
                  >
                    View Logs
                  </button>
                  {session.status === 'active' && (
                    <button
                      onClick={() => handleRevoke(session.id)}
                      className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
                    >
                      Revoke
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(session.id)}
                    className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Info card */}
        <div className="rounded-lg border border-border-subtle bg-white p-5">
          <h3 className="mb-2 text-sm font-bold text-text-main">How Session Vault Works</h3>
          <div className="space-y-2 text-xs text-text-muted">
            <p>
              <strong>1. Record</strong> — Click "Record New Login" and log into the service through our secure browser.
              Your password is never stored — only the resulting session cookies and tokens.
            </p>
            <p>
              <strong>2. Agents Use It</strong> — When an agent needs to access a site, it loads the saved session
              automatically. No credentials needed.
            </p>
            <p>
              <strong>3. Revoke Anytime</strong> — Revoke a session instantly. The agent loses access immediately.
              Sessions that expire are flagged automatically.
            </p>
          </div>
        </div>
      </div>

      {/* Logs modal */}
      {logsSessionId && (
        <LogsModal sessionId={logsSessionId} onClose={() => setLogsSessionId(null)} />
      )}
    </SettingsLayout>
  )
}

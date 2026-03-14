import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import * as engine from '@/lib/engine'
import { useRealtimeEvent } from '@/lib/use-realtime'

const EVENT_ICONS: Record<string, string> = {
  task_created: 'add_task',
  task_completed: 'task_alt',
  task_updated: 'edit_note',
  file_written: 'edit_document',
  agent_started: 'play_circle',
  agent_stopped: 'stop_circle',
  sprint_started: 'sprint',
  sprint_completed: 'check_circle',
  skill_executed: 'extension',
  approval_created: 'approval',
  approval_resolved: 'verified',
  message_sent: 'chat',
  workflow_started: 'account_tree',
  workflow_completed: 'done_all',
}

function sanitizeActivityDescription(text: string): string {
  let clean = text
  clean = clean.replace(/<[｜|]DSML[｜|][^>]*>/g, '')
  clean = clean.replace(/<\/?(?:function_calls|invoke|parameter|tool_call|tool_result)[^>]*>/g, '')
  clean = clean.replace(/<[^>]*(?:name=|string=|type=)[^>]*>/g, '')
  clean = clean.replace(/\[([a-z_]+)\][\s\S]*?\[\/\1\]/g, '')
  clean = clean.replace(/\[\/?[a-z_]+\]/g, '')
  clean = clean.replace(/\n{2,}/g, ' ').trim()
  if (!clean || clean.length < 3) clean = '(action completed)'
  return clean
}

export function ActivityDropdown() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<engine.ActivityLogEntry[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [hasNew, setHasNew] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Load entries when dropdown opens
  useEffect(() => {
    if (!open) return
    engine.listActivityLog({ limit: 20 }).then((data) => {
      setEntries(data)
      setHasNew(false)
    }).catch(() => {})
    engine.activityCount().then(d => setTotalCount(d.count)).catch(() => {})
  }, [open])

  // SSE: new activity events
  useRealtimeEvent<engine.ActivityLogEntry>('activity', () => {
    setHasNew(true)
    // If dropdown is open, refresh
    if (open) {
      engine.listActivityLog({ limit: 20 }).then(setEntries).catch(() => {})
    }
  })

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative text-text-muted hover:text-text-main transition-colors"
        title="Activity"
      >
        <span className="material-symbols-outlined text-[22px]">timeline</span>
        {hasNew && (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-forest-green ring-2 ring-white" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-border-subtle rounded-xl shadow-lg z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
            <h3 className="text-sm font-bold text-text-main">Activity</h3>
            <span className="text-[10px] text-text-muted">{totalCount.toLocaleString()} total events</span>
          </div>

          {/* Entries */}
          <div className="max-h-80 overflow-y-auto">
            {entries.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-text-muted">No activity yet</div>
            ) : (
              entries.map(entry => {
                const isFileEvent = ['file_written', 'file_renamed', 'file_moved'].includes(entry.eventType)
                const handleEntryClick = () => {
                  if (isFileEvent) {
                    const match = entry.description.match(/(?:Wrote|Renamed|Moved) file: (.+)/)
                    if (match) {
                      navigate(`/workspace?file=${encodeURIComponent(match[1])}`)
                      setOpen(false)
                      return
                    }
                  }
                }
                return (
                  <div
                    key={entry.id}
                    onClick={handleEntryClick}
                    className={`flex items-start gap-2.5 px-4 py-2.5 hover:bg-light-surface-alt transition-colors border-b border-border-subtle/50 last:border-0 ${isFileEvent ? 'cursor-pointer' : ''}`}
                  >
                    <span className="material-symbols-outlined text-[16px] text-text-muted mt-0.5 shrink-0">
                      {EVENT_ICONS[entry.eventType] ?? 'circle'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-text-main leading-relaxed">{sanitizeActivityDescription(entry.description)}</p>
                      <p className="text-[10px] text-text-muted mt-0.5">
                        {formatRelativeTime(entry.createdAt)}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border-subtle px-4 py-2">
            <button
              onClick={() => { navigate('/activity'); setOpen(false) }}
              className="w-full text-center text-xs text-forest-green hover:underline font-medium"
            >
              View All History
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

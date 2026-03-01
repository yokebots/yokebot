/**
 * MeetingsPage.tsx — Browse past meetings
 */

import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTeam } from '@/lib/team-context'
import * as engine from '@/lib/engine'

export function MeetingsPage() {
  const { activeTeam } = useTeam()
  const navigate = useNavigate()
  const [meetings, setMeetings] = useState<engine.MeetingSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [limitError, setLimitError] = useState<string | null>(null)

  useEffect(() => {
    if (!activeTeam) return
    engine.listMeetings(activeTeam.id)
      .then(setMeetings)
      .catch((err) => console.error('[meetings] Failed to load:', err))
      .finally(() => setLoading(false))
  }, [activeTeam?.id])

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  const formatDuration = (start: string, end: string | null) => {
    if (!end) return 'In progress'
    const ms = new Date(end).getTime() - new Date(start).getTime()
    const mins = Math.round(ms / 60000)
    if (mins < 1) return '<1 min'
    return `${mins} min`
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-text-main">Meetings</h1>
          <p className="mt-1 text-text-secondary">Browse and replay past team meetings</p>
        </div>
        <button
          disabled={starting}
          onClick={async () => {
            if (!activeTeam) return
            setStarting(true)
            setLimitError(null)
            try {
              const { meetingId } = await engine.startMeetAndGreet(activeTeam.id)
              navigate(`/meetings/${meetingId}`)
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              if (msg.includes('plan includes')) {
                setLimitError(msg)
              } else {
                setLimitError('Failed to start meeting. Please try again.')
              }
            } finally {
              setStarting(false)
            }
          }}
          className="flex items-center gap-2 rounded-xl bg-forest-green px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-forest-green-hover disabled:opacity-50 transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">{starting ? 'hourglass_empty' : 'add'}</span>
          {starting ? 'Starting...' : 'New Meeting'}
        </button>
      </div>

      {limitError && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <span className="material-symbols-outlined text-[20px] text-amber-600 mt-0.5">schedule</span>
          <div>
            <p className="text-sm font-medium text-amber-800">{limitError}</p>
            <Link
              to="/settings/billing"
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-forest-green px-3 py-1.5 text-sm font-medium text-white hover:bg-forest-green-hover transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">upgrade</span>
              Upgrade Plan
            </Link>
          </div>
          <button onClick={() => setLimitError(null)} className="ml-auto shrink-0 text-amber-400 hover:text-amber-600">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-forest-green" />
        </div>
      ) : meetings.length === 0 ? (
        <div className="rounded-2xl border border-border-subtle bg-white p-12 text-center">
          <span className="material-symbols-outlined text-[48px] text-gray-300">groups</span>
          <p className="mt-4 text-lg font-medium text-text-main">No meetings yet</p>
          <p className="mt-1 text-text-muted">Your first meeting will appear here after the team meet-and-greet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {meetings.map((meeting) => (
            <Link
              key={meeting.id}
              to={`/meetings/${meeting.id}`}
              className="flex items-center gap-4 rounded-xl border border-border-subtle bg-white px-5 py-4 shadow-sm hover:border-forest-green/30 hover:shadow-md transition-all"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-forest-green/10">
                <span className="material-symbols-outlined text-[22px] text-forest-green">groups</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-display text-base font-semibold text-text-main truncate">
                  {meeting.title}
                </h3>
                <p className="mt-0.5 text-sm text-text-muted">
                  {formatDate(meeting.startedAt)} at {formatTime(meeting.startedAt)} — {formatDuration(meeting.startedAt, meeting.endedAt)}
                </p>
                {meeting.summary && (
                  <p className="mt-1 text-sm text-text-secondary line-clamp-1">{meeting.summary}</p>
                )}
              </div>
              <div className="shrink-0">
                {meeting.status === 'in_progress' ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                    Live
                  </span>
                ) : (
                  <span className="material-symbols-outlined text-[20px] text-gray-400">play_circle</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

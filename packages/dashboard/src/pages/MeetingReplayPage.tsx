/**
 * MeetingReplayPage.tsx — Replay a past meeting with animated avatar view,
 * synced word-highlighted captions, and scrolling chat thread.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router'
import { useTeam } from '@/lib/team-context'
import * as engine from '@/lib/engine'

interface PlaylistItem {
  idx: number
  agentName: string
  agentIcon: string
  agentIconColor: string
  senderType: 'agent' | 'human' | 'system'
  content: string
  audioUrl: string | null
  audioDurationMs: number | null
  createdAt: string
}

// Split text into screens of ~20-30 words
function buildScreens(text: string): string[][] {
  const sentences = text.split(/(?<=[.!?])\s+/)
  const screens: string[][] = []
  let currentWords: string[] = []
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/)
    currentWords.push(...words)
    if (currentWords.length >= 20) {
      screens.push([...currentWords])
      currentWords = []
    }
  }
  if (currentWords.length > 0) screens.push(currentWords)
  return screens
}

function screenStartWord(screens: string[][], screenIdx: number): number {
  let count = 0
  for (let i = 0; i < screenIdx; i++) count += (screens[i]?.length ?? 0)
  return count
}

export function MeetingReplayPage() {
  const { meetingId } = useParams<{ meetingId: string }>()
  const { activeTeam } = useTeam()

  const [meeting, setMeeting] = useState<engine.MeetingDetail | null>(null)
  const [messages, setMessages] = useState<engine.ChatMessage[]>([])
  const [loading, setLoading] = useState(true)

  // Playback state
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([])
  const [currentIdx, setCurrentIdx] = useState(-1) // -1 = not started
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)

  // Caption state
  const [captionScreens, setCaptionScreens] = useState<string[][]>([])
  const [captionScreen, setCaptionScreen] = useState(0)
  const [captionWord, setCaptionWord] = useState(0)
  const captionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)

  // Visible messages up to currentIdx
  const visibleMessages = playlist.slice(0, currentIdx + 1)
  const currentItem = currentIdx >= 0 ? playlist[currentIdx] : null

  // Load meeting data
  useEffect(() => {
    if (!activeTeam || !meetingId) return
    engine.getMeeting(activeTeam.id, meetingId).then(async (m) => {
      setMeeting(m)
      if (m.channelId) {
        const msgs = await engine.getMessages(m.channelId, 500)
        setMessages(msgs)
      }
      setLoading(false)
    }).catch((err) => {
      console.error('[replay] Failed to load meeting:', err)
      setLoading(false)
    })
  }, [activeTeam?.id, meetingId])

  // Build playlist from messages
  useEffect(() => {
    if (messages.length === 0 || !meeting) return
    const agentMap = new Map(meeting.agents.map(a => [a.id, a]))
    const items: PlaylistItem[] = messages.map((msg, idx) => {
      const agent = agentMap.get(msg.senderId)
      return {
        idx,
        agentName: agent?.name ?? (msg.senderType === 'human' ? 'You' : msg.senderId),
        agentIcon: agent?.iconName ?? (msg.senderType === 'human' ? 'person' : 'smart_toy'),
        agentIconColor: agent?.iconColor ?? (msg.senderType === 'human' ? '#6B7280' : '#0F4D26'),
        senderType: msg.senderType,
        content: msg.content,
        audioUrl: msg.audioKey ? engine.getMeetingAudioUrl(msg.audioKey) : null,
        audioDurationMs: msg.audioDurationMs,
        createdAt: msg.createdAt,
      }
    })
    setPlaylist(items)
  }, [messages, meeting])

  // Clean up
  const cleanupAudio = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null }
    if (captionTimerRef.current) { clearInterval(captionTimerRef.current); captionTimerRef.current = null }
  }, [])

  // Play a specific playlist item
  const playItem = useCallback((idx: number) => {
    cleanupAudio()
    if (idx < 0 || idx >= playlist.length) {
      setPlaying(false)
      return
    }

    const item = playlist[idx]
    setCurrentIdx(idx)

    // Build captions
    const screens = buildScreens(item.content)
    setCaptionScreens(screens)
    setCaptionScreen(0)
    setCaptionWord(0)

    const allWords = screens.flat()
    const durationMs = (item.audioDurationMs ?? allWords.length * 250) / speed

    // Play audio if available
    if (item.audioUrl) {
      const audio = new Audio(item.audioUrl)
      audioRef.current = audio
      audio.playbackRate = speed
      audio.onended = () => {
        // Auto-advance to next item
        if (idx + 1 < playlist.length) {
          playItem(idx + 1)
        } else {
          setPlaying(false)
        }
      }
      audio.play().catch(() => {})
    }

    // Word highlight timer
    const msPerWord = durationMs / allWords.length
    let wordIdx = 0
    captionTimerRef.current = setInterval(() => {
      wordIdx++
      if (wordIdx < allWords.length) {
        setCaptionWord(wordIdx)
        setCaptionScreen(() => {
          let count = 0
          for (let s = 0; s < screens.length; s++) {
            count += screens[s].length
            if (wordIdx < count) return s
          }
          return screens.length - 1
        })
      } else {
        if (captionTimerRef.current) clearInterval(captionTimerRef.current)
        // If no audio, auto-advance after a brief pause
        if (!item.audioUrl) {
          setTimeout(() => {
            if (idx + 1 < playlist.length) {
              playItem(idx + 1)
            } else {
              setPlaying(false)
            }
          }, 1000 / speed)
        }
      }
    }, msPerWord)

    // Scroll chat
    setTimeout(() => chatScrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 100)
  }, [playlist, speed, cleanupAudio])

  // Play/pause
  const togglePlay = useCallback(() => {
    if (playing) {
      cleanupAudio()
      setPlaying(false)
    } else {
      setPlaying(true)
      playItem(currentIdx < 0 ? 0 : currentIdx)
    }
  }, [playing, currentIdx, playItem, cleanupAudio])

  // Skip forward/back
  const skipForward = useCallback(() => {
    if (currentIdx + 1 < playlist.length) {
      playItem(currentIdx + 1)
    }
  }, [currentIdx, playlist.length, playItem])

  const skipBack = useCallback(() => {
    if (currentIdx > 0) {
      playItem(currentIdx - 1)
    }
  }, [currentIdx, playItem])

  // Jump to a specific message
  const jumpTo = useCallback((idx: number) => {
    const wasPlaying = playing
    setPlaying(true)
    playItem(idx)
    if (!wasPlaying) {
      // If not playing, just show the state but don't auto-advance
    }
  }, [playing, playItem])

  // Change speed
  const cycleSpeed = () => {
    const speeds = [1, 1.5, 2]
    const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length]
    setSpeed(next)
    if (audioRef.current) audioRef.current.playbackRate = next
  }

  if (loading || (!activeTeam && !meeting)) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-forest-green" />
      </div>
    )
  }

  if (!meeting) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8 text-center">
        <p className="text-lg text-text-muted">Meeting not found</p>
        <Link to="/meetings" className="mt-4 inline-block text-forest-green hover:underline">Back to meetings</Link>
      </div>
    )
  }

  const progress = playlist.length > 0 ? ((currentIdx + 1) / playlist.length) * 100 : 0

  return (
    <div className="flex flex-col -m-4 md:-m-6" style={{ height: 'calc(100vh - 8rem)' }}>
      {/* ── TOP: Speaker Banner ── */}
      {currentItem && currentItem.senderType === 'agent' && (
        <div className="shrink-0 bg-gray-900 px-6 py-5">
          <div className="mx-auto max-w-4xl">
            {/* Agent identity */}
            <div className="mb-3 flex items-center gap-3">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full shadow-lg"
                style={{ backgroundColor: currentItem.agentIconColor }}
              >
                <span className="material-symbols-outlined text-[24px] text-white">{currentItem.agentIcon}</span>
              </div>
              <div className="flex-1">
                <p className="font-display text-lg font-bold text-white">{currentItem.agentName}</p>
                <p className="text-sm text-amber-400">Replaying</p>
              </div>
              {/* Speed control */}
              <button
                onClick={cycleSpeed}
                className="rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-white hover:bg-white/20 transition-colors"
              >
                {speed}x
              </button>
            </div>
            {/* Word-highlighted captions */}
            {captionScreens.length > 0 && (
              <div className="min-h-[60px]">
                <p className="text-lg leading-relaxed">
                  {(captionScreens[captionScreen] ?? []).map((word, wi) => {
                    const globalIdx = screenStartWord(captionScreens, captionScreen) + wi
                    const isActive = globalIdx === captionWord
                    const isSpoken = globalIdx < captionWord
                    return (
                      <span
                        key={wi}
                        className={`transition-colors duration-150 ${
                          isActive ? 'text-amber-400 font-semibold' : isSpoken ? 'text-white' : 'text-white/30'
                        }`}
                      >
                        {word}{' '}
                      </span>
                    )
                  })}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Header (when no agent is speaking) ── */}
      {(!currentItem || currentItem.senderType !== 'agent') && (
        <div className="shrink-0 bg-gradient-to-r from-gray-800 to-gray-700 px-6 py-4">
          <div className="mx-auto flex max-w-4xl items-center gap-3">
            <Link to="/meetings" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors">
              <span className="material-symbols-outlined text-[18px] text-white">arrow_back</span>
            </Link>
            <div className="flex-1">
              <h1 className="font-display text-lg font-bold text-white">{meeting.title}</h1>
              <p className="text-sm text-gray-400">
                {new Date(meeting.startedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Chat Thread ── */}
      <div className="flex-1 overflow-y-auto bg-gradient-to-b from-gray-50 to-white p-5">
        <div className="mx-auto max-w-2xl space-y-5">
          {/* Meeting summary card */}
          {meeting.summary && currentIdx < 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-800">Meeting Summary</p>
              <p className="mt-1 text-sm text-amber-700">{meeting.summary}</p>
              {meeting.actionItems && meeting.actionItems.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-amber-800">Action Items</p>
                  <ul className="mt-1 space-y-1">
                    {meeting.actionItems.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-amber-700">
                        <span className="material-symbols-outlined text-[14px] mt-0.5">task_alt</span>
                        <span>{item.description} — <strong>{item.assignee}</strong></span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {visibleMessages.map((item) => (
            <div
              key={item.idx}
              className={`flex gap-3 cursor-pointer hover:opacity-80 transition-opacity ${item.senderType === 'human' ? 'justify-end' : ''}`}
              onClick={() => jumpTo(item.idx)}
            >
              {item.senderType !== 'human' && (
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-sm"
                  style={{ backgroundColor: item.agentIconColor }}
                >
                  <span className="material-symbols-outlined text-[18px] text-white">{item.agentIcon}</span>
                </div>
              )}
              <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-base leading-relaxed whitespace-pre-wrap shadow-sm ${
                item.senderType === 'human'
                  ? 'bg-forest-green text-white rounded-br-md'
                  : 'bg-white border border-gray-100 text-text-main rounded-bl-md'
              } ${item.idx === currentIdx ? 'ring-2 ring-amber-400' : ''}`}>
                {item.senderType !== 'human' && (
                  <p className="mb-1 text-sm font-semibold" style={{ color: item.agentIconColor }}>{item.agentName}</p>
                )}
                {item.content}
              </div>
              {item.senderType === 'human' && (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200">
                  <span className="material-symbols-outlined text-[18px] text-gray-600">person</span>
                </div>
              )}
            </div>
          ))}
          <div ref={chatScrollRef} />
        </div>
      </div>

      {/* ── Playback Controls ── */}
      <div className="shrink-0 border-t border-border-subtle bg-white px-4 py-3">
        <div className="mx-auto max-w-4xl">
          {/* Progress bar */}
          <div className="mb-3 h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-forest-green transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-center gap-4">
            <button onClick={skipBack} disabled={currentIdx <= 0} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100 disabled:opacity-30 transition-colors">
              <span className="material-symbols-outlined text-[24px]">skip_previous</span>
            </button>
            <button onClick={togglePlay} className="flex h-14 w-14 items-center justify-center rounded-full bg-forest-green text-white shadow-md hover:bg-forest-green-hover transition-colors">
              <span className="material-symbols-outlined text-[28px]">{playing ? 'pause' : 'play_arrow'}</span>
            </button>
            <button onClick={skipForward} disabled={currentIdx >= playlist.length - 1} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100 disabled:opacity-30 transition-colors">
              <span className="material-symbols-outlined text-[24px]">skip_next</span>
            </button>
            <button onClick={cycleSpeed} className="rounded-full border border-gray-200 px-3 py-1 text-sm font-medium text-text-secondary hover:bg-gray-50 transition-colors">
              {speed}x
            </button>
            <span className="text-sm text-text-muted">
              {currentIdx + 1} / {playlist.length} messages
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

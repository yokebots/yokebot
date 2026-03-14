/**
 * TranscriptEditor — Descript-style text-based video editing.
 *
 * Renders the transcription as editable text with word-level spans.
 * - Active word highlighting during playback (karaoke-style)
 * - Click word → seek playhead
 * - Select words + delete → marks time range for removal (strikethrough preview)
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'

export interface TranscriptionWord {
  word: string
  start: number  // seconds
  end: number    // seconds
}

export interface TranscriptionSegment {
  start: number
  end: number
  text: string
}

export interface Transcription {
  segments: TranscriptionSegment[]
  words: TranscriptionWord[]
  fullText: string
  model?: string
  processedAt?: string
}

export interface DeletedRange {
  startMs: number
  endMs: number
}

interface TranscriptEditorProps {
  transcription: Transcription
  playheadMs: number
  isPlaying: boolean
  deletedRanges: DeletedRange[]
  onSeek: (ms: number) => void
  onDeleteRange: (startMs: number, endMs: number) => void
  onUndoDelete: (range: DeletedRange) => void
}

export function TranscriptEditor({
  transcription,
  playheadMs,
  isPlaying,
  deletedRanges,
  onSeek,
  onDeleteRange,
  onUndoDelete,
}: TranscriptEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [selectionStart, setSelectionStart] = useState<number | null>(null)
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null)

  const playheadS = playheadMs / 1000

  // Group words by segment for display
  const segmentsWithWords = useMemo(() => {
    if (!transcription.segments.length) return []

    return transcription.segments.map((seg) => {
      const segWords = transcription.words.filter(
        (w) => w.start >= seg.start - 0.05 && w.end <= seg.end + 0.05,
      )
      return { segment: seg, words: segWords }
    })
  }, [transcription])

  // Find which word index is active based on playhead
  const activeWordIdx = useMemo(() => {
    if (!isPlaying && playheadMs === 0) return -1
    for (let i = 0; i < transcription.words.length; i++) {
      const w = transcription.words[i]
      if (playheadS >= w.start && playheadS <= w.end) return i
    }
    // If between words, find the closest upcoming word
    for (let i = 0; i < transcription.words.length; i++) {
      if (transcription.words[i].start > playheadS) return i - 1
    }
    return -1
  }, [transcription.words, playheadS, isPlaying, playheadMs])

  // Auto-scroll to active word during playback
  const activeWordRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (isPlaying && activeWordRef.current) {
      activeWordRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [activeWordIdx, isPlaying])

  // Check if a word falls within a deleted range
  const isWordDeleted = useCallback((word: TranscriptionWord) => {
    const wordStartMs = word.start * 1000
    const wordEndMs = word.end * 1000
    return deletedRanges.some(
      (r) => wordStartMs >= r.startMs && wordEndMs <= r.endMs,
    )
  }, [deletedRanges])

  // Handle word click → seek
  const handleWordClick = useCallback((wordIdx: number) => {
    const word = transcription.words[wordIdx]
    if (!word) return
    onSeek(word.start * 1000)
  }, [transcription.words, onSeek])

  // Handle word selection for delete
  const handleWordMouseDown = useCallback((wordIdx: number) => {
    setSelectionStart(wordIdx)
    setSelectionEnd(wordIdx)
  }, [])

  const handleWordMouseEnter = useCallback((wordIdx: number) => {
    if (selectionStart !== null) {
      setSelectionEnd(wordIdx)
    }
  }, [selectionStart])

  const handleMouseUp = useCallback(() => {
    // Selection finalized — will be used by delete action
  }, [])

  // Clear selection on click outside
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSelectionStart(null)
        setSelectionEnd(null)
      }
    }
    document.addEventListener('mousedown', handleGlobalClick)
    return () => document.removeEventListener('mousedown', handleGlobalClick)
  }, [])

  // Keyboard handler for delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectionStart !== null && selectionEnd !== null) {
        e.preventDefault()
        const startIdx = Math.min(selectionStart, selectionEnd)
        const endIdx = Math.max(selectionStart, selectionEnd)
        const firstWord = transcription.words[startIdx]
        const lastWord = transcription.words[endIdx]
        if (firstWord && lastWord) {
          onDeleteRange(firstWord.start * 1000, lastWord.end * 1000)
        }
        setSelectionStart(null)
        setSelectionEnd(null)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectionStart, selectionEnd, transcription.words, onDeleteRange])

  // Check if a word index is within the current selection
  const isWordSelected = useCallback((idx: number) => {
    if (selectionStart === null || selectionEnd === null) return false
    const lo = Math.min(selectionStart, selectionEnd)
    const hi = Math.max(selectionStart, selectionEnd)
    return idx >= lo && idx <= hi
  }, [selectionStart, selectionEnd])

  // Build a global word index offset per segment
  let globalWordOffset = 0

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-subtle/50 shrink-0">
        <span className="material-symbols-outlined text-[16px] text-text-muted">notes</span>
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Transcript</span>
        <div className="flex-1" />
        {selectionStart !== null && selectionEnd !== null && (
          <button
            onClick={() => {
              const startIdx = Math.min(selectionStart, selectionEnd)
              const endIdx = Math.max(selectionStart, selectionEnd)
              const firstWord = transcription.words[startIdx]
              const lastWord = transcription.words[endIdx]
              if (firstWord && lastWord) {
                onDeleteRange(firstWord.start * 1000, lastWord.end * 1000)
              }
              setSelectionStart(null)
              setSelectionEnd(null)
            }}
            className="flex items-center gap-1 rounded bg-red-50 border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-100 transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">content_cut</span>
            Cut selection
          </button>
        )}
        {deletedRanges.length > 0 && (
          <span className="text-[10px] text-text-muted/60">
            {deletedRanges.length} cut{deletedRanges.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Transcript body */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 select-text"
        onMouseUp={handleMouseUp}
      >
        {segmentsWithWords.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-text-muted text-sm">
            <span className="material-symbols-outlined text-3xl text-text-muted/30">mic_off</span>
            <p>No word-level data available</p>
          </div>
        ) : (
          segmentsWithWords.map(({ segment, words }, segIdx) => {
            const segStartOffset = globalWordOffset
            const el = (
              <div
                key={segIdx}
                className={`mb-3 rounded-md p-2 transition-colors ${
                  playheadS >= segment.start && playheadS <= segment.end
                    ? 'bg-forest-green/5 border-l-2 border-l-forest-green'
                    : 'border-l-2 border-l-transparent'
                }`}
              >
                {/* Timestamp */}
                <span
                  className="text-[10px] text-text-muted/60 font-mono cursor-pointer hover:text-forest-green transition-colors"
                  onClick={() => onSeek(segment.start * 1000)}
                >
                  {formatTimestamp(segment.start)}
                </span>

                {/* Words */}
                <p className="mt-0.5 leading-relaxed">
                  {words.length > 0 ? (
                    words.map((word, wIdx) => {
                      const globalIdx = segStartOffset + wIdx
                      const isActive = globalIdx === activeWordIdx
                      const isDeleted = isWordDeleted(word)
                      const isSelected = isWordSelected(globalIdx)

                      return (
                        <span
                          key={wIdx}
                          ref={isActive ? activeWordRef : undefined}
                          className={`text-sm cursor-pointer transition-colors ${
                            isDeleted
                              ? 'line-through text-text-muted/40'
                              : isActive
                                ? 'bg-amber-200/60 rounded'
                                : isSelected
                                  ? 'bg-blue-200/60 rounded'
                                  : 'hover:bg-gray-100 rounded'
                          }`}
                          onClick={() => {
                            if (isDeleted) return
                            handleWordClick(globalIdx)
                          }}
                          onMouseDown={(e) => {
                            if (isDeleted) return
                            e.preventDefault()
                            handleWordMouseDown(globalIdx)
                          }}
                          onMouseEnter={() => handleWordMouseEnter(globalIdx)}
                        >
                          {word.word}{' '}
                        </span>
                      )
                    })
                  ) : (
                    <span className="text-sm text-text-main">{segment.text}</span>
                  )}
                </p>
              </div>
            )
            globalWordOffset += words.length
            return el
          })
        )}

        {/* Deleted ranges list */}
        {deletedRanges.length > 0 && (
          <div className="mt-4 border-t border-border-subtle pt-3">
            <p className="text-[10px] text-text-muted/60 font-semibold uppercase tracking-wider mb-2">
              Pending cuts
            </p>
            {deletedRanges.map((range, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-xs text-text-muted mb-1 group"
              >
                <span className="material-symbols-outlined text-[12px] text-red-400">content_cut</span>
                <span className="font-mono text-[10px]">
                  {formatTimestamp(range.startMs / 1000)} — {formatTimestamp(range.endMs / 1000)}
                </span>
                <button
                  onClick={() => onUndoDelete(range)}
                  className="opacity-0 group-hover:opacity-100 text-[10px] text-blue-500 hover:underline transition-opacity"
                >
                  undo
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function formatTimestamp(seconds: number): string {
  const min = Math.floor(seconds / 60)
  const sec = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 10)
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${ms}`
}

import { useState, useEffect, useRef, useCallback } from 'react'
import { renderMentionContent, MentionInput } from '@/components/MentionInput'
import { useRealtimeEvent } from '@/lib/use-realtime'
import * as engine from '@/lib/engine'

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '👀', '💯', '🙌']

interface ThreadViewProps {
  parentMessage: engine.ChatMessage
  channelId: string
  onClose: () => void
  agentColorMap: Map<string, { color: string; icon: string; name: string }>
  completions: engine.MentionCompletionData | null
  humanName?: string
  onFileClick?: (docId: string) => void
  onTaskClick?: (taskId: string) => void
  onAgentClick?: (agentId: string) => void
}

export function ThreadView({ parentMessage, channelId, onClose, agentColorMap, completions, humanName, onFileClick, onTaskClick, onAgentClick }: ThreadViewProps) {
  const [replies, setReplies] = useState<engine.ChatMessage[]>([])
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    engine.getThreadReplies(parentMessage.id).then(setReplies).catch(() => {})
  }, [parentMessage.id])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [replies.length])

  // Real-time: listen for new messages and refresh thread replies
  useRealtimeEvent<{ channelId: string; messageId: number }>('new_message', (data) => {
    if (data.channelId !== channelId) return
    engine.getThreadReplies(parentMessage.id).then((fresh) => {
      setReplies(fresh)
    }).catch(() => {})
  })

  const sendReply = async () => {
    const text = replyText.trim()
    if (!text || sending) return
    setSending(true)
    setError(null)
    try {
      const msg = await engine.sendMessage(channelId, {
        senderType: 'human',
        senderId: 'user',
        content: text,
        parentMessageId: Number(parentMessage.id),
      })
      setReplies(prev => [...prev, msg])
      setReplyText('')
    } catch (err) {
      console.error('[ThreadView] Failed to send reply:', err)
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(`Failed to send reply: ${msg}`)
    }
    setSending(false)
  }

  const handleFileAttach = async (files: FileList) => {
    if (uploadingFile) return
    setUploadingFile(true)
    try {
      const snippets: string[] = []
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) {
          alert(`"${file.name}" exceeds the 10MB limit`)
          continue
        }
        const result = await engine.uploadWorkspaceFile(file, 'chat-uploads')
        const size = file.size < 1024 ? `${file.size}B` : file.size < 1024 * 1024 ? `${(file.size / 1024).toFixed(1)}KB` : `${(file.size / (1024 * 1024)).toFixed(1)}MB`
        snippets.push(`\u{1F4CE} **${file.name}** (${size}) \`${result.path}\``)
      }
      if (snippets.length > 0) {
        const fileText = snippets.join('\n')
        setReplyText(prev => prev ? `${prev}\n${fileText}` : fileText)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed')
    }
    setUploadingFile(false)
  }

  return (
    <div className="flex flex-col h-full bg-white border-l border-border-subtle">
      {/* Header — Discord-style with thread icon + close */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle shrink-0 bg-light-surface">
        <span className="material-symbols-outlined text-[18px] text-text-main">forum</span>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-text-main">Thread</span>
          <span className="ml-2 text-xs text-text-muted">{replies.length} {replies.length === 1 ? 'reply' : 'replies'}</span>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 hover:bg-light-surface-alt transition-colors"
          title="Close thread"
        >
          <span className="material-symbols-outlined text-[18px] text-text-muted">close</span>
        </button>
      </div>

      {/* Scrollable area: parent message + replies */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {/* Parent message — highlighted */}
        <div className="px-4 py-3 border-b border-border-subtle bg-gray-50/80">
          <MessageBubble
            message={parentMessage}
            agentColorMap={agentColorMap}
            humanName={humanName}
            onFileClick={onFileClick}
            onTaskClick={onTaskClick}
            onAgentClick={onAgentClick}
            isThreadParent
          />
        </div>

        {/* Reply count divider */}
        {replies.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2">
            <div className="flex-1 h-px bg-border-subtle" />
            <span className="text-[11px] font-medium text-text-muted">
              {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
            </span>
            <div className="flex-1 h-px bg-border-subtle" />
          </div>
        )}

        {/* Replies */}
        <div className="px-4 py-1 space-y-1">
          {replies.map(msg => (
            <MessageBubble
              key={msg.id}
              message={msg}
              agentColorMap={agentColorMap}
              humanName={humanName}
              onFileClick={onFileClick}
              onTaskClick={onTaskClick}
              onAgentClick={onAgentClick}
            />
          ))}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="px-4 py-1 shrink-0">
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {/* Reply input */}
      <div className="px-4 py-3 border-t border-border-subtle shrink-0 bg-white">
        <MentionInput
          value={replyText}
          onChange={setReplyText}
          onSubmit={sendReply}
          placeholder="Reply in thread..."
          completions={completions}
          disabled={sending || uploadingFile}
          onFileAttach={() => fileInputRef.current?.click()}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files?.length) handleFileAttach(e.target.files); e.target.value = '' }}
        />
      </div>
    </div>
  )
}

/** Shared message bubble used in TeamChat and ThreadView */
export function MessageBubble({
  message,
  agentColorMap,
  compact,
  humanName,
  onThreadClick,
  onFileClick,
  onTaskClick,
  onAgentClick,
  onContextMenu,
  isThreadParent,
}: {
  message: engine.ChatMessage
  agentColorMap: Map<string, { color: string; icon: string; name: string }>
  compact?: boolean
  humanName?: string
  onThreadClick?: (msg: engine.ChatMessage) => void
  onFileClick?: (docId: string) => void
  onTaskClick?: (taskId: string) => void
  onAgentClick?: (agentId: string) => void
  onContextMenu?: (e: React.MouseEvent, msg: engine.ChatMessage) => void
  isThreadParent?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [reactions, setReactions] = useState<Record<string, string[]>>({})
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  // Load reactions
  useEffect(() => {
    if (compact) return
    engine.getReactions(message.id).then(setReactions).catch(() => {})
  }, [message.id, compact])

  const toggleReaction = useCallback(async (emoji: string) => {
    // Optimistic update — apply immediately, reconcile after
    setReactions(prev => {
      const users = prev[emoji] ?? []
      const hasReacted = users.includes('user')
      const next = { ...prev }
      if (hasReacted) {
        next[emoji] = users.filter(u => u !== 'user')
        if (next[emoji].length === 0) delete next[emoji]
      } else {
        next[emoji] = [...users, 'user']
      }
      return next
    })
    setShowEmojiPicker(false)
    try {
      await engine.toggleReaction(message.id, emoji)
    } catch { /* ignore */ }
  }, [message.id])

  const isAgent = message.senderType === 'agent'
  const isSystem = message.senderType === 'system'
  const isHuman = message.senderType === 'human'
  const agent = isAgent ? agentColorMap.get(message.senderId) : null
  const displayName = agent?.name ?? (isAgent ? 'Agent' : isSystem ? 'System' : humanName ?? 'You')
  const color = agent?.color ?? (isAgent ? '#0F4D26' : isSystem ? '#6B7280' : '#059669')
  const icon = agent?.icon ?? (isAgent ? 'smart_toy' : isSystem ? 'info' : 'person')

  // Strip [think] blocks and tool-call syntax from display
  const cleanedContent = message.content
    .replace(/\[think\][\s\S]*?\[\/think\]\s*/g, '')
    .replace(/\[([a-z_]+)\][\s\S]*?\[\/\1\]/g, '')
    .replace(/\[\/?[a-z_]+\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  // Extract markdown images before stripping them from text
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g
  const embeddedImages: Array<{ alt: string; url: string }> = []
  let imgMatch
  while ((imgMatch = imageRegex.exec(cleanedContent)) !== null) {
    const imgUrl = imgMatch[2]
    try {
      const parsed = new URL(imgUrl, window.location.origin)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        embeddedImages.push({ alt: imgMatch[1], url: imgUrl })
      }
    } catch { /* skip invalid URLs */ }
  }
  const displayContent = cleanedContent
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .trim()

  if (!displayContent && embeddedImages.length === 0) return null

  const COLLAPSE_THRESHOLD = 300
  const isLong = displayContent.length > COLLAPSE_THRESHOLD
  const mobileCollapsed = isLong && !expanded

  const timeStr = (() => {
    const d = new Date(message.createdAt)
    const now = new Date()
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    const isToday = d.toDateString() === now.toDateString()
    if (isToday) return time
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)
    if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`
    const daysDiff = Math.floor((now.getTime() - d.getTime()) / 86400000)
    if (daysDiff < 7) return `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`
    if (d.getFullYear() === now.getFullYear()) return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} ${time}`
  })()

  const reactionEntries = Object.entries(reactions).filter(([, users]) => users.length > 0)

  return (
    <div
      className={`group/msg relative flex gap-2 ${isHuman ? 'justify-end' : ''} ${compact ? '' : 'py-0.5'}`}
      onContextMenu={onContextMenu ? (e) => onContextMenu(e, message) : undefined}
    >
      {/* Avatar (left side, non-human only) */}
      {!isHuman && (
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full mt-0.5"
          style={{ backgroundColor: color + '18' }}
        >
          <span className="material-symbols-outlined text-[14px]" style={{ color }}>{icon}</span>
        </div>
      )}

      <div className={`min-w-0 max-w-[85%] rounded-xl px-3 py-2 ${
        isHuman
          ? 'bg-forest-green/10'
          : isSystem
            ? 'bg-amber-50 text-amber-800'
            : 'bg-white border border-border-subtle'
      }`}>
        {/* Name + time */}
        <div className={`flex items-baseline gap-1.5 mb-0.5 ${isHuman ? 'justify-end' : ''}`}>
          <span className="text-[11px] font-bold" style={{ color }}>{displayName}</span>
          <span className="text-[10px] text-text-muted">{timeStr}</span>
        </div>
        {/* Embedded images (GIFs, markdown images) */}
        {embeddedImages.length > 0 && (
          <div className="mt-1 mb-1">
            {embeddedImages.map((img, i) => (
              <img key={i} src={img.url} alt={img.alt} className="rounded-lg max-w-[280px] max-h-[200px] object-contain" loading="lazy" />
            ))}
          </div>
        )}
        {/* Content — full on desktop, collapsible on mobile */}
        {displayContent && (<>
        <div className={`relative text-sm text-text-main leading-relaxed break-words whitespace-pre-wrap ${mobileCollapsed ? 'max-md:max-h-[6.5em] max-md:overflow-hidden' : ''}`}>
          <>{renderMentionContent(displayContent, onAgentClick, onFileClick, undefined, onTaskClick)}</>
          {mobileCollapsed && (
            <div
              className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none hidden max-md:block"
              style={{ background: `linear-gradient(to top, ${isHuman ? '#e8f5ec' : isSystem ? '#fffbeb' : '#ffffff'}, transparent)` }}
            />
          )}
        </div>
        {isLong && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-1 hidden max-md:flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-forest-green hover:bg-forest-green/10 transition-colors mx-auto"
          >
            <span className="material-symbols-outlined text-[13px]">{expanded ? 'expand_less' : 'expand_more'}</span>
            {expanded ? 'Show less' : 'Read more'}
          </button>
        )}
        </>)}
        {/* Thread badge */}
        {!compact && !isThreadParent && message.replyCount > 0 && onThreadClick && (() => {
          const isRecent = message.latestReplyAt && (Date.now() - new Date(message.latestReplyAt).getTime()) < 300000
          return (
            <button
              onClick={() => onThreadClick(message)}
              className={`mt-1.5 flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors border ${
                isRecent
                  ? 'text-forest-green bg-forest-green/10 border-forest-green/30 shadow-sm'
                  : 'text-forest-green bg-forest-green/5 hover:bg-forest-green/10 border-forest-green/15'
              }`}
            >
              {isRecent && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-forest-green opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-forest-green" />
                </span>
              )}
              <span className="material-symbols-outlined text-[14px]">forum</span>
              {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
              {message.latestReplyAt && (
                <span className="text-text-muted ml-0.5">
                  {formatRelativeTime(message.latestReplyAt)}
                </span>
              )}
            </button>
          )
        })()}
        {/* Emoji reactions + action buttons */}
        {!compact && (
          <div className="flex flex-wrap items-center gap-1 mt-1 relative">
            {reactionEntries.map(([emoji, users]) => (
              <button
                key={emoji}
                onClick={() => toggleReaction(emoji)}
                className={`flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs transition-colors ${
                  users.includes('user')
                    ? 'border-forest-green/40 bg-forest-green/10'
                    : 'border-border-subtle bg-white hover:border-forest-green/30'
                }`}
              >
                <span>{emoji}</span>
                <span className="text-[10px] text-text-muted">{users.length}</span>
              </button>
            ))}
            {/* Add reaction button — visible on hover */}
            {!isThreadParent && (
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="flex items-center rounded-full border border-border-subtle bg-white px-1.5 py-0.5 text-[11px] text-text-muted opacity-0 group-hover/msg:opacity-100 transition-opacity hover:border-forest-green/30"
                title="Add reaction"
              >
                <span className="material-symbols-outlined text-[13px]">add_reaction</span>
              </button>
            )}
            {/* Reply in thread button — visible on hover */}
            {!isThreadParent && onThreadClick && (
              <button
                onClick={() => onThreadClick(message)}
                className="flex items-center rounded-full border border-border-subtle bg-white px-1.5 py-0.5 text-[11px] text-text-muted opacity-0 group-hover/msg:opacity-100 transition-opacity hover:border-forest-green/30 hover:text-forest-green"
                title="Reply in thread"
              >
                <span className="material-symbols-outlined text-[13px]">forum</span>
              </button>
            )}
            {/* Quick emoji picker */}
            {showEmojiPicker && (
              <div className="absolute bottom-full left-0 mb-1 flex gap-0.5 rounded-lg border border-border-subtle bg-white p-1 shadow-lg z-10">
                {QUICK_EMOJIS.map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => toggleReaction(emoji)}
                    className="rounded p-1 text-sm hover:bg-light-surface-alt transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Avatar (right side, human only) */}
      {isHuman && (
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full mt-0.5"
          style={{ backgroundColor: color + '18' }}
        >
          <span className="material-symbols-outlined text-[14px]" style={{ color }}>{icon}</span>
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
  return `${Math.floor(hrs / 24)}d ago`
}

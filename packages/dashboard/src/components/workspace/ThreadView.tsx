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
}

export function ThreadView({ parentMessage, channelId, onClose, agentColorMap, completions }: ThreadViewProps) {
  const [replies, setReplies] = useState<engine.ChatMessage[]>([])
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    engine.getThreadReplies(parentMessage.id).then(setReplies).catch(() => {})
  }, [parentMessage.id])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [replies.length])

  // Real-time: listen for new messages and append thread replies
  useRealtimeEvent<{ channelId: string; messageId: number }>('new_message', (data) => {
    if (data.channelId !== channelId) return
    // Refetch thread replies to pick up agent responses
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
        parentMessageId: parentMessage.id,
      })
      setReplies(prev => [...prev, msg])
      setReplyText('')
    } catch (err) {
      console.error('[ThreadView] Failed to send reply:', err)
      setError('Failed to send reply. Please try again.')
    }
    setSending(false)
  }

  return (
    <div className="flex flex-col border-t border-border-subtle bg-light-surface/50 max-h-[50%]">
      {/* Thread header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle shrink-0">
        <span className="material-symbols-outlined text-[16px] text-text-muted">reply</span>
        <span className="text-xs font-semibold text-text-main">Thread</span>
        <span className="text-xs text-text-muted">{replies.length} {replies.length === 1 ? 'reply' : 'replies'}</span>
        <button onClick={onClose} className="ml-auto rounded p-0.5 hover:bg-light-surface-alt">
          <span className="material-symbols-outlined text-[16px] text-text-muted">close</span>
        </button>
      </div>

      {/* Parent message context */}
      <div className="px-3 py-2 bg-light-surface-alt/50 border-b border-border-subtle shrink-0">
        <MessageBubble message={parentMessage} agentColorMap={agentColorMap} compact />
      </div>

      {/* Replies */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {replies.map(msg => (
          <MessageBubble key={msg.id} message={msg} agentColorMap={agentColorMap} />
        ))}
      </div>

      {/* Error message */}
      {error && (
        <div className="px-3 py-1 shrink-0">
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {/* Reply input — MentionInput with @mention support */}
      <div className="px-3 py-2 border-t border-border-subtle shrink-0">
        <MentionInput
          value={replyText}
          onChange={setReplyText}
          onSubmit={sendReply}
          placeholder="Reply..."
          completions={completions}
          disabled={sending}
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

  const timeStr = new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  const reactionEntries = Object.entries(reactions).filter(([, users]) => users.length > 0)

  return (
    <div
      className={`group/msg flex gap-2 ${isHuman ? 'justify-end' : ''} ${compact ? '' : ''}`}
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
        {!compact && message.replyCount > 0 && onThreadClick && (
          <button
            onClick={() => onThreadClick(message)}
            className="mt-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-forest-green hover:bg-forest-green/10 transition-colors"
          >
            <span className="material-symbols-outlined text-[13px]">chat_bubble</span>
            {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
            {message.latestReplyAt && (
              <span className="text-text-muted ml-1">
                {formatRelativeTime(message.latestReplyAt)}
              </span>
            )}
          </button>
        )}
        {/* Emoji reactions */}
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
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="flex items-center rounded-full border border-border-subtle bg-white px-1.5 py-0.5 text-[11px] text-text-muted opacity-0 group-hover/msg:opacity-100 transition-opacity hover:border-forest-green/30"
            >
              <span className="material-symbols-outlined text-[13px]">add_reaction</span>
            </button>
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

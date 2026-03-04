import { useState, useEffect, useRef } from 'react'
import { renderMentionContent } from '@/components/MentionInput'
import * as engine from '@/lib/engine'

interface ThreadViewProps {
  parentMessage: engine.ChatMessage
  channelId: string
  onClose: () => void
  agentColorMap: Map<string, { color: string; icon: string; name: string }>
}

export function ThreadView({ parentMessage, channelId, onClose, agentColorMap }: ThreadViewProps) {
  const [replies, setReplies] = useState<engine.ChatMessage[]>([])
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    engine.getThreadReplies(parentMessage.id).then(setReplies).catch(() => {})
  }, [parentMessage.id])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [replies.length])

  const sendReply = async () => {
    const text = replyText.trim()
    if (!text || sending) return
    setSending(true)
    try {
      const msg = await engine.sendMessage(channelId, {
        senderType: 'human',
        senderId: 'user',
        content: text,
        parentMessageId: parentMessage.id,
      })
      setReplies(prev => [...prev, msg])
      setReplyText('')
    } catch { /* ignore */ }
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

      {/* Reply input */}
      <div className="px-3 py-2 border-t border-border-subtle shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
            placeholder="Reply..."
            className="flex-1 rounded-lg border border-border-subtle px-2.5 py-1.5 text-xs focus:border-forest-green focus:outline-none"
          />
          <button
            onClick={sendReply}
            disabled={!replyText.trim() || sending}
            className="rounded-lg bg-forest-green px-3 py-1.5 text-xs text-white hover:bg-forest-green/90 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

/** Shared message bubble used in TeamChat and ThreadView */
export function MessageBubble({
  message,
  agentColorMap,
  compact,
  onThreadClick,
}: {
  message: engine.ChatMessage
  agentColorMap: Map<string, { color: string; icon: string; name: string }>
  compact?: boolean
  onThreadClick?: (msg: engine.ChatMessage) => void
}) {
  const isAgent = message.senderType === 'agent'
  const isSystem = message.senderType === 'system'
  const agent = isAgent ? agentColorMap.get(message.senderId) : null
  const displayName = agent?.name ?? (isAgent ? 'Agent' : isSystem ? 'System' : 'You')
  const color = agent?.color ?? (isAgent ? '#0F4D26' : isSystem ? '#6B7280' : '#059669')
  const icon = agent?.icon ?? (isAgent ? 'smart_toy' : isSystem ? 'info' : 'person')

  // Strip [think] blocks from display
  const displayContent = message.content
    .replace(/\[think\][\s\S]*?\[\/think\]/g, '')
    .trim()

  if (!displayContent) return null

  const timeStr = new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  return (
    <div className={`group flex gap-2 ${compact ? '' : 'py-1'}`}>
      {/* Avatar */}
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: color + '18' }}
      >
        <span className="material-symbols-outlined text-[14px]" style={{ color }}>{icon}</span>
      </div>

      <div className="min-w-0 flex-1">
        {/* Name + time */}
        <div className="flex items-baseline gap-1.5">
          <span className="text-xs font-semibold" style={{ color }}>{displayName}</span>
          <span className="text-[10px] text-text-muted">{timeStr}</span>
        </div>
        {/* Content */}
        <div className="text-sm text-text-main leading-relaxed break-words">
          {renderMentionContent(displayContent)}
        </div>
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
      </div>
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

import { useState, useEffect, useCallback, useRef } from 'react'
import { PanelHeader } from './PanelHeader'
import { MessageBubble } from './ThreadView'
import { ThreadView } from './ThreadView'
import { MentionInput } from '@/components/MentionInput'
import { useRealtimeEvent } from '@/lib/use-realtime'
import * as engine from '@/lib/engine'

interface TeamChatProps {
  teamChannelId: string | null
}

export function TeamChat({ teamChannelId }: TeamChatProps) {
  const [messages, setMessages] = useState<engine.ChatMessage[]>([])
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [completions, setCompletions] = useState<engine.MentionCompletionData | null>(null)
  const [threadParent, setThreadParent] = useState<engine.ChatMessage | null>(null)
  const [agentColorMap, setAgentColorMap] = useState<Map<string, { color: string; icon: string; name: string }>>(new Map())
  const scrollRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)

  // Load messages
  const loadMessages = useCallback(async () => {
    if (!teamChannelId) return
    try {
      const msgs = await engine.getMessages(teamChannelId, 100)
      setMessages(msgs)
    } catch { /* offline */ }
  }, [teamChannelId])

  useEffect(() => { loadMessages() }, [loadMessages])

  // Load mention completions + build agent color map
  useEffect(() => {
    engine.getMentionCompletions().then((data) => {
      setCompletions(data)
      const map = new Map<string, { color: string; icon: string; name: string }>()
      for (const a of data.agents) {
        map.set(a.id, {
          color: a.iconColor ?? '#0F4D26',
          icon: a.iconName ?? 'smart_toy',
          name: a.name,
        })
      }
      setAgentColorMap(map)
    }).catch(() => {})
  }, [])

  // Real-time new messages
  useRealtimeEvent<{ channelId: string; messageId: number }>('new_message', (data) => {
    if (data.channelId !== teamChannelId) return
    // Fetch the new message and append
    engine.getMessages(teamChannelId!, 1).then((msgs) => {
      if (msgs.length > 0) {
        setMessages(prev => {
          // Deduplicate
          if (prev.some(m => m.id === msgs[0].id)) return prev
          return [...prev, msgs[0]]
        })
      }
    }).catch(() => {})
  })

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  // Detect if user is near bottom
  const handleScroll = () => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 100
  }

  // Mark channel as read
  useEffect(() => {
    if (teamChannelId) {
      engine.markChannelRead(teamChannelId).catch(() => {})
    }
  }, [teamChannelId, messages.length])

  const sendMessage = async () => {
    const text = messageText.trim()
    if (!text || !teamChannelId || sending) return
    setSending(true)
    try {
      const msg = await engine.sendMessage(teamChannelId, {
        senderType: 'human',
        senderId: 'user',
        content: text,
      })
      setMessages(prev => [...prev, msg])
      setMessageText('')
    } catch { /* ignore */ }
    setSending(false)
  }

  const handleGifSelect = async (gifUrl: string, title: string) => {
    if (!teamChannelId) return
    try {
      const msg = await engine.sendMessage(teamChannelId, {
        senderType: 'human',
        senderId: 'user',
        content: `![${title}](${gifUrl})`,
      })
      setMessages(prev => [...prev, msg])
    } catch { /* ignore */ }
  }

  if (!teamChannelId) {
    return (
      <div className="flex flex-col h-full">
        <PanelHeader icon="forum" title="Team Chat" />
        <div className="flex-1 flex items-center justify-center text-sm text-text-muted">
          Loading team chat...
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <PanelHeader icon="forum" title="Team Chat" />

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-1"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-text-muted text-sm">
            <span className="material-symbols-outlined text-3xl mb-2 text-text-muted/40">forum</span>
            <p>No messages yet</p>
            <p className="text-xs mt-1">Start a conversation with your team</p>
          </div>
        )}
        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            message={msg}
            agentColorMap={agentColorMap}
            onThreadClick={setThreadParent}
          />
        ))}
      </div>

      {/* Thread view (inline expand) */}
      {threadParent && (
        <ThreadView
          parentMessage={threadParent}
          channelId={teamChannelId}
          onClose={() => setThreadParent(null)}
          agentColorMap={agentColorMap}
        />
      )}

      {/* Message input */}
      <div className="px-3 py-2 border-t border-border-subtle shrink-0">
        <MentionInput
          value={messageText}
          onChange={setMessageText}
          onSubmit={sendMessage}
          placeholder="Message your team..."
          completions={completions}
          disabled={sending}
          onGifSelect={handleGifSelect}
        />
      </div>
    </div>
  )
}

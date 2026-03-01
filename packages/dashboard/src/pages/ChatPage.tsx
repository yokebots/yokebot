import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router'
import * as engine from '@/lib/engine'
import type { ChatChannel, ChatMessage, ChatAttachment, EngineAgent, MentionCompletionData } from '@/lib/engine'
import { MentionInput, renderMentionContent } from '@/components/MentionInput'
import { supabase } from '@/lib/supabase'

const ENGINE_URL = import.meta.env.VITE_ENGINE_URL ?? 'http://localhost:3001'

function ThinkingBlock({ content }: { content: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-1.5">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
      >
        <span className={`material-symbols-outlined text-[14px] transition-transform ${open ? 'rotate-90' : ''}`}>
          chevron_right
        </span>
        <span className="material-symbols-outlined text-[13px]">psychology</span>
        {open ? 'Hide reasoning' : 'Show reasoning'}
      </button>
      {open && (
        <div className="mt-1 ml-5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-text-muted whitespace-pre-wrap leading-relaxed">
          {content}
        </div>
      )}
    </div>
  )
}

export function ChatPage() {
  const { channelId: paramChannelId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [channels, setChannels] = useState<ChatChannel[]>([])
  const [agents, setAgents] = useState<EngineAgent[]>([])
  const [activeChannelId, setActiveChannelId] = useState(paramChannelId ?? '')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')
  const [creating, setCreating] = useState(false)
  const [mentionCompletions, setMentionCompletions] = useState<MentionCompletionData | null>(null)
  const [reactions, setReactions] = useState<Record<number, Record<string, string[]>>>({}) // messageId → { emoji → userIds[] }
  const [showReactionPicker, setShowReactionPicker] = useState<number | null>(null) // messageId with picker open
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const channelInputRef = useRef<HTMLInputElement>(null)

  const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '👀', '💯', '🙌']

  const loadChannels = async () => {
    try {
      const [ch, ag] = await Promise.all([engine.listChannels(), engine.listAgents()])
      setChannels(ch)
      setAgents(ag)
      if (!activeChannelId && ch.length > 0) setActiveChannelId(ch[0].id)
    } catch { /* offline */ }
  }

  const loadMentionCompletions = async () => {
    try {
      const data = await engine.getMentionCompletions()
      setMentionCompletions(data)
    } catch { /* offline */ }
  }

  const loadMessages = async () => {
    if (!activeChannelId) return
    try {
      const msgs = await engine.getMessages(activeChannelId)
      setMessages(msgs)
    } catch { /* offline */ }
  }

  const loadUnread = async () => {
    try {
      const data = await engine.getUnreadCounts()
      setUnreadCounts(data.counts)
    } catch { /* offline */ }
  }

  useEffect(() => { loadChannels(); loadMentionCompletions(); loadUnread() }, [])

  // Handle ?dm=agentId query param (from AgentDetailPage link)
  useEffect(() => {
    const dmAgentId = searchParams.get('dm')
    if (!dmAgentId) return
    const resolve = async () => {
      try {
        const ch = await engine.getDmChannel(dmAgentId)
        setActiveChannelId(ch.id)
        setSearchParams({}, { replace: true }) // clean up URL
      } catch { /* channel not found */ }
    }
    resolve()
  }, [searchParams])
  useEffect(() => {
    // Mark channel as read when selecting it
    if (!activeChannelId) return
    loadMessages()
    engine.markChannelRead(activeChannelId).catch(() => {})
    setUnreadCounts(prev => { const next = { ...prev }; delete next[activeChannelId]; return next })
  }, [activeChannelId])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => {
    if (showCreateChannel) channelInputRef.current?.focus()
  }, [showCreateChannel])

  // Poll for new messages every 5 seconds + unread counts every 15 seconds
  useEffect(() => {
    if (!activeChannelId) return
    const msgInterval = setInterval(loadMessages, 5000)
    const unreadInterval = setInterval(loadUnread, 15000)
    return () => { clearInterval(msgInterval); clearInterval(unreadInterval) }
  }, [activeChannelId])

  const sendMsg = async () => {
    if (!newMessage.trim() || !activeChannelId) return
    const ch = channels.find((c) => c.id === activeChannelId)
    if (ch?.type === 'dm') {
      const agentId = ch.name.replace('dm:', '')
      try {
        await engine.chatWithAgent(agentId, newMessage.trim())
      } catch { /* model not available */ }
    } else {
      await engine.sendMessage(activeChannelId, {
        senderType: 'human',
        senderId: 'user',
        content: newMessage.trim(),
      })
    }
    setNewMessage('')
    loadMessages()
  }

  const sendGif = async (gifUrl: string, title: string) => {
    if (!activeChannelId) return
    const content = `![${title}](${gifUrl})`
    await engine.sendMessage(activeChannelId, {
      senderType: 'human',
      senderId: 'user',
      content,
    })
    loadMessages()
  }

  const openDm = async (agentId: string) => {
    const ch = await engine.getDmChannel(agentId)
    setActiveChannelId(ch.id)
    setShowChannelsMobile(false)
    await loadChannels()
  }

  const handleCreateChannel = async () => {
    const name = newChannelName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    if (!name) return
    setCreating(true)
    try {
      const ch = await engine.createGroupChannel(name)
      setNewChannelName('')
      setShowCreateChannel(false)
      await loadChannels()
      setActiveChannelId(ch.id)
    } catch { /* error */ }
    setCreating(false)
  }

  const handleDeleteChannel = async (channelId: string) => {
    const ch = channels.find((c) => c.id === channelId)
    if (!ch || ch.type !== 'group') return
    if (!confirm(`Delete #${ch.name}? All messages in this channel will be permanently deleted.`)) return
    try {
      await engine.deleteChannel(channelId)
      if (activeChannelId === channelId) setActiveChannelId('')
      await loadChannels()
    } catch { /* error */ }
  }

  const activeChannel = channels.find((c) => c.id === activeChannelId)
  const dmChannels = channels.filter((c) => c.type === 'dm')
  const taskThreads = channels.filter((c) => c.type === 'task_thread')
  const groupChannels = channels.filter((c) => c.type === 'group')

  const getAgentName = (ch: ChatChannel) => {
    if (!ch.name.startsWith('dm:')) return ch.name
    const agentId = ch.name.replace('dm:', '')
    return agents.find((a) => a.id === agentId)?.name ?? 'Unknown Agent'
  }

  const getAgentForChannel = (ch: ChatChannel) => {
    if (!ch.name.startsWith('dm:')) return null
    const agentId = ch.name.replace('dm:', '')
    return agents.find((a) => a.id === agentId) ?? null
  }

  // Build agent color/icon map for mention rendering
  const agentColorMap = useMemo(() => {
    const map = new Map<string, { color: string; icon: string }>()
    for (const a of agents) {
      map.set(a.id, { color: a.iconColor ?? '#0F4D26', icon: a.iconName ?? 'smart_toy' })
    }
    return map
  }, [agents])

  // Load reactions for visible messages
  useEffect(() => {
    if (messages.length === 0) return
    const loadReactions = async () => {
      const reactionMap: Record<number, Record<string, string[]>> = {}
      await Promise.all(
        messages.map(async (msg) => {
          try {
            const r = await engine.getReactions(msg.id)
            if (Object.keys(r).length > 0) reactionMap[msg.id] = r
          } catch { /* ignore */ }
        }),
      )
      setReactions(reactionMap)
    }
    loadReactions()
  }, [messages])

  const handleToggleReaction = async (messageId: number, emoji: string) => {
    try {
      const result = await engine.toggleReaction(messageId, emoji)
      // Optimistic update
      setReactions((prev) => {
        const msgReactions = { ...(prev[messageId] ?? {}) }
        const userId = 'me' // placeholder — server handles actual user
        if (result.action === 'added') {
          msgReactions[emoji] = [...(msgReactions[emoji] ?? []), userId]
        } else {
          msgReactions[emoji] = (msgReactions[emoji] ?? []).filter((u) => u !== userId)
          if (msgReactions[emoji].length === 0) delete msgReactions[emoji]
        }
        return { ...prev, [messageId]: msgReactions }
      })
      // Refresh from server for accuracy
      const fresh = await engine.getReactions(messageId)
      setReactions((prev) => ({ ...prev, [messageId]: fresh }))
    } catch { /* ignore */ }
    setShowReactionPicker(null)
  }

  const [showChannelsMobile, setShowChannelsMobile] = useState(false)

  // Rename channel state
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null)
  const [editChannelName, setEditChannelName] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Edit agent state (rename + icon)
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null)
  const [editAgentName, setEditAgentName] = useState('')
  const [editAgentIcon, setEditAgentIcon] = useState('')
  const [editAgentColor, setEditAgentColor] = useState('')
  const editAgentRef = useRef<HTMLDivElement>(null)

  const AGENT_ICONS = [
    'smart_toy', 'person', 'face', 'psychology', 'support_agent', 'robot_2',
    'engineering', 'school', 'science', 'brush', 'edit_note', 'campaign',
    'trending_up', 'analytics', 'query_stats', 'groups', 'diversity_3',
    'lightbulb', 'target', 'rocket_launch', 'code', 'terminal', 'memory',
    'hub', 'share', 'public', 'language', 'translate', 'attach_money',
    'payments', 'storefront', 'shopping_cart', 'inventory_2', 'local_shipping',
    'security', 'shield', 'gavel', 'balance', 'handshake',
    'auto_awesome', 'star', 'favorite', 'emoji_objects', 'verified',
  ]

  const AGENT_COLORS = [
    '#0F4D26', '#1a7a4c', '#2563eb', '#7c3aed', '#db2777',
    '#dc2626', '#ea580c', '#d97706', '#65a30d', '#0891b2',
    '#4f46e5', '#9333ea', '#c026d3', '#059669', '#0d9488',
    '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#14b8a6',
  ]

  const handleRenameChannel = async (channelId: string) => {
    const name = editChannelName.trim()
    if (!name) { setEditingChannelId(null); return }
    try {
      await engine.renameChannel(channelId, name)
      await loadChannels()
    } catch { /* error */ }
    setEditingChannelId(null)
  }

  const startEditChannel = (ch: ChatChannel) => {
    setEditingChannelId(ch.id)
    setEditChannelName(ch.name)
    requestAnimationFrame(() => renameInputRef.current?.focus())
  }

  const startEditAgent = (agent: EngineAgent) => {
    setEditingAgentId(agent.id)
    setEditAgentName(agent.name)
    setEditAgentIcon(agent.iconName ?? 'smart_toy')
    setEditAgentColor(agent.iconColor ?? '#0F4D26')
  }

  const handleSaveAgent = async () => {
    if (!editingAgentId) return
    const agent = agents.find((a) => a.id === editingAgentId)
    if (!agent) return
    const updates: Record<string, string> = {}
    if (editAgentName.trim() && editAgentName.trim() !== agent.name) updates.name = editAgentName.trim()
    if (editAgentIcon !== (agent.iconName ?? 'smart_toy')) updates.iconName = editAgentIcon
    if (editAgentColor !== (agent.iconColor ?? '#0F4D26')) updates.iconColor = editAgentColor
    if (Object.keys(updates).length > 0) {
      try {
        await engine.updateAgent(editingAgentId, updates)
        await loadChannels()
      } catch { /* error */ }
    }
    setEditingAgentId(null)
  }

  // Close agent edit popover on outside click
  useEffect(() => {
    if (!editingAgentId) return
    const handler = (e: MouseEvent) => {
      if (editAgentRef.current && !editAgentRef.current.contains(e.target as Node)) {
        handleSaveAgent()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [editingAgentId, editAgentName, editAgentIcon, editAgentColor])

  // Typing indicator state (from SSE)
  const [typingAgent, setTypingAgent] = useState<{ id: string; name: string; icon: string; color: string } | null>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Chat SSE for typing indicators
  useEffect(() => {
    if (!activeChannelId) return
    let aborted = false
    const controller = new AbortController()

    const connectSse = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token || aborted) return

      const teamId = engine.getActiveTeamId()
      const url = `${ENGINE_URL}/api/chat/channels/${activeChannelId}/events?token=${encodeURIComponent(session.access_token)}${teamId ? `&teamId=${teamId}` : ''}`

      try {
        const res = await fetch(url, { signal: controller.signal })
        if (!res.ok || !res.body) return
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (!aborted) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const event = JSON.parse(line.slice(6))
              if (event.type === 'typing') {
                setTypingAgent({ id: event.agentId, name: event.agentName, icon: event.agentIcon || 'smart_toy', color: event.agentColor || '#0F4D26' })
                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
                typingTimeoutRef.current = setTimeout(() => setTypingAgent(null), 3000)
              } else if (event.type === 'stop_typing') {
                setTypingAgent(null)
                if (typingTimeoutRef.current) { clearTimeout(typingTimeoutRef.current); typingTimeoutRef.current = null }
                // Refresh messages when agent finishes typing (new message posted)
                loadMessages()
              }
            } catch { /* ignore */ }
          }
        }
      } catch { /* aborted or network error */ }
    }

    connectSse()
    return () => {
      aborted = true
      controller.abort()
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      setTypingAgent(null)
    }
  }, [activeChannelId])

  return (
    <div className="flex h-[calc(100vh-8rem)] -m-4 md:-m-6 border-t border-border-subtle">
      {/* Mobile channels backdrop */}
      {showChannelsMobile && (
        <div className="fixed inset-0 z-20 bg-black/40 md:hidden" onClick={() => setShowChannelsMobile(false)} />
      )}
      {/* Left Sidebar - Channels */}
      <div className={`w-64 shrink-0 border-r border-border-subtle bg-light-surface overflow-y-auto fixed md:relative z-30 md:z-auto h-full md:block transition-transform duration-200 ${showChannelsMobile ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-4">
          <h2 className="mb-4 font-display text-lg font-bold text-text-main">Chat</h2>

          {/* Channels Section */}
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between px-2">
              <p className="text-xs font-bold uppercase tracking-wider text-text-muted">Channels</p>
              <button
                onClick={() => setShowCreateChannel(!showCreateChannel)}
                className="rounded p-0.5 text-text-muted hover:bg-light-surface-alt hover:text-text-main transition-colors"
                title="Create channel"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
              </button>
            </div>

            {/* Create Channel Inline Form */}
            {showCreateChannel && (
              <div className="mb-2 px-2">
                <div className="flex items-center gap-1 rounded-lg border border-forest-green bg-white px-2 py-1.5">
                  <span className="text-text-muted text-sm">#</span>
                  <input
                    ref={channelInputRef}
                    type="text"
                    value={newChannelName}
                    onChange={(e) => setNewChannelName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateChannel()
                      if (e.key === 'Escape') { setShowCreateChannel(false); setNewChannelName('') }
                    }}
                    placeholder="channel-name"
                    className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-text-muted/50"
                    disabled={creating}
                  />
                  <button
                    onClick={handleCreateChannel}
                    disabled={creating || !newChannelName.trim()}
                    className="rounded p-0.5 text-forest-green hover:bg-forest-green/10 disabled:opacity-40"
                  >
                    <span className="material-symbols-outlined text-[16px]">check</span>
                  </button>
                </div>
                <p className="mt-1 px-1 text-[10px] text-text-muted">Lowercase, hyphens only. Press Enter to create.</p>
              </div>
            )}

            {/* Default channels hint when none exist */}
            {groupChannels.length === 0 && !showCreateChannel && (
              <button
                onClick={() => setShowCreateChannel(true)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-text-muted hover:bg-light-surface-alt transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">add_circle_outline</span>
                Create your first channel
              </button>
            )}

            {groupChannels.map((ch) => (
              <div
                key={ch.id}
                className={`group flex w-full items-center rounded-lg transition-colors ${
                  ch.id === activeChannelId
                    ? 'bg-forest-green/10'
                    : 'hover:bg-light-surface-alt'
                }`}
              >
                {editingChannelId === ch.id ? (
                  <div className="flex flex-1 items-center gap-1 px-2 py-1">
                    <span className="text-text-muted text-sm">#</span>
                    <input
                      ref={renameInputRef}
                      type="text"
                      value={editChannelName}
                      onChange={(e) => setEditChannelName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameChannel(ch.id)
                        if (e.key === 'Escape') setEditingChannelId(null)
                      }}
                      onBlur={() => handleRenameChannel(ch.id)}
                      className="flex-1 min-w-0 bg-white border border-forest-green rounded px-1.5 py-0.5 text-sm outline-none"
                    />
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => { setActiveChannelId(ch.id); setShowChannelsMobile(false) }}
                      className={`flex flex-1 items-center gap-2 px-2 py-2 text-sm ${
                        ch.id === activeChannelId
                          ? 'text-forest-green font-medium'
                          : unreadCounts[ch.id] ? 'text-text-main font-semibold' : 'text-text-secondary'
                      }`}
                    >
                      <span className="text-text-muted">#</span>
                      {ch.name}
                      {unreadCounts[ch.id] && ch.id !== activeChannelId && (
                        <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-forest-green px-1.5 text-[10px] font-bold text-white">
                          {unreadCounts[ch.id]}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => startEditChannel(ch)}
                      className="mr-0.5 hidden rounded p-0.5 text-text-muted hover:bg-light-surface-alt hover:text-text-main group-hover:block"
                      title="Rename channel"
                    >
                      <span className="material-symbols-outlined text-[13px]">edit</span>
                    </button>
                    <button
                      onClick={() => handleDeleteChannel(ch.id)}
                      className="mr-1 hidden rounded p-0.5 text-text-muted hover:bg-red-50 hover:text-red-500 group-hover:block"
                      title="Delete channel"
                    >
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Direct Messages */}
          <div className="mb-4">
            <p className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-text-muted">Direct Messages</p>
            {agents.map((agent) => {
              const dmCh = dmChannels.find((c) => c.name === `dm:${agent.id}`)
              const isActive = dmCh && dmCh.id === activeChannelId
              const dmUnread = dmCh ? unreadCounts[dmCh.id] : 0
              return (
                <div key={agent.id} className="group relative">
                  <div className="flex items-center">
                    <button
                      onClick={() => openDm(agent.id)}
                      className={`flex flex-1 items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors ${
                        isActive ? 'font-medium' : dmUnread ? 'text-text-main font-semibold' : 'text-text-secondary hover:bg-light-surface-alt'
                      }`}
                      style={isActive ? { backgroundColor: (agent.iconColor ?? '#0F4D26') + '18', color: agent.iconColor ?? '#0F4D26' } : undefined}
                    >
                      <span className="relative">
                        <span
                          className="material-symbols-outlined text-[16px]"
                          style={{ color: agent.iconColor ?? '#0F4D26' }}
                        >
                          {agent.iconName ?? 'smart_toy'}
                        </span>
                        {dmUnread > 0 && !isActive && (
                          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-forest-green ring-2 ring-white" />
                        )}
                      </span>
                      {agent.name}
                      {dmUnread > 0 && !isActive && (
                        <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-forest-green px-1.5 text-[10px] font-bold text-white">
                          {dmUnread}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => startEditAgent(agent)}
                      className="mr-1 hidden rounded p-0.5 text-text-muted hover:bg-light-surface-alt hover:text-text-main group-hover:block"
                      title="Edit agent"
                    >
                      <span className="material-symbols-outlined text-[13px]">edit</span>
                    </button>
                  </div>

                  {/* Agent edit popover */}
                  {editingAgentId === agent.id && (
                    <div ref={editAgentRef} className="absolute left-full top-0 ml-2 z-50 w-64 rounded-xl border border-border-subtle bg-white shadow-lg p-3 space-y-3">
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Name</label>
                        <input
                          type="text"
                          value={editAgentName}
                          onChange={(e) => setEditAgentName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSaveAgent() }}
                          className="mt-1 w-full rounded-lg border border-border-subtle px-2.5 py-1.5 text-sm focus:border-forest-green focus:outline-none"
                          autoFocus
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Color</label>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {AGENT_COLORS.map((c) => (
                            <button
                              key={c}
                              onClick={() => setEditAgentColor(c)}
                              className={`h-6 w-6 rounded-full border-2 transition-transform ${editAgentColor === c ? 'border-text-main scale-110' : 'border-transparent hover:scale-110'}`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Icon</label>
                        <div className="mt-1 grid grid-cols-8 gap-1 max-h-32 overflow-y-auto">
                          {AGENT_ICONS.map((icon) => (
                            <button
                              key={icon}
                              onClick={() => setEditAgentIcon(icon)}
                              className={`flex items-center justify-center rounded-lg p-1 transition-colors ${editAgentIcon === icon ? 'bg-forest-green/15 ring-1 ring-forest-green' : 'hover:bg-light-surface-alt'}`}
                              style={editAgentIcon === icon ? { color: editAgentColor } : undefined}
                            >
                              <span className="material-symbols-outlined text-[18px]">{icon}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          onClick={() => setEditingAgentId(null)}
                          className="rounded-lg px-3 py-1.5 text-xs text-text-muted hover:bg-light-surface-alt"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveAgent}
                          className="rounded-lg bg-forest-green px-3 py-1.5 text-xs text-white hover:bg-forest-green/90"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {agents.length === 0 && (
              <p className="px-2 text-xs text-text-muted">No agents yet</p>
            )}
          </div>

          {/* Task Threads */}
          {taskThreads.length > 0 && (
            <div>
              <p className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-text-muted">Task Threads</p>
              {taskThreads.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => { setActiveChannelId(ch.id); setShowChannelsMobile(false) }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors ${
                    ch.id === activeChannelId
                      ? 'bg-forest-green/10 text-forest-green font-medium'
                      : 'text-text-secondary hover:bg-light-surface-alt'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">task_alt</span>
                  {ch.name.replace('task:', '').slice(0, 8)}...
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col">
        {/* Chat Header */}
        <div className="flex h-14 items-center justify-between border-b border-border-subtle bg-white px-3 md:px-6">
          <div className="flex items-center gap-2 md:gap-3">
            {/* Mobile channels toggle */}
            <button
              onClick={() => setShowChannelsMobile(true)}
              className="md:hidden rounded-lg p-1 text-text-muted hover:bg-light-surface-alt hover:text-text-main transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">menu</span>
            </button>
            {activeChannel ? (
              <>
                <span className="material-symbols-outlined text-[20px] text-text-muted">
                  {activeChannel.type === 'dm' ? 'smart_toy' : activeChannel.type === 'task_thread' ? 'task_alt' : 'tag'}
                </span>
                <h3 className="font-medium text-text-main">
                  {activeChannel.type === 'dm' ? getAgentName(activeChannel) : activeChannel.name}
                </h3>
                {activeChannel.type === 'dm' && (() => {
                  const ag = getAgentForChannel(activeChannel)
                  return ag ? (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      ag.status === 'running' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {ag.status}
                    </span>
                  ) : null
                })()}
                {activeChannel.type === 'group' && (
                  <span className="text-xs text-text-muted">
                    Team channel
                  </span>
                )}
              </>
            ) : (
              <span className="text-sm text-text-muted">Select a conversation</span>
            )}
          </div>
          {activeChannel?.type === 'group' && (
            <button
              onClick={() => handleDeleteChannel(activeChannel.id)}
              className="rounded-lg p-1.5 text-text-muted hover:bg-red-50 hover:text-red-500 transition-colors"
              title="Delete channel"
            >
              <span className="material-symbols-outlined text-[18px]">delete_outline</span>
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && activeChannelId && activeChannel?.type === 'group' && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-forest-green/10">
                <span className="material-symbols-outlined text-3xl text-forest-green">tag</span>
              </div>
              <h3 className="text-lg font-bold text-text-main">Welcome to #{activeChannel.name}</h3>
              <p className="mt-1 text-sm text-text-muted">
                This is the start of the #{activeChannel.name} channel. Post updates, questions, or anything your team needs to see.
              </p>
            </div>
          )}
          {messages.length === 0 && activeChannelId && activeChannel?.type !== 'group' && (
            <p className="py-12 text-center text-sm text-text-muted">No messages yet. Start the conversation.</p>
          )}
          {!activeChannelId && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <span className="material-symbols-outlined mb-4 text-5xl text-text-muted">forum</span>
              <h3 className="mb-2 text-lg font-bold text-text-main">Team Chat</h3>
              <p className="text-text-muted max-w-sm">
                Chat directly with your agents, create channels for different teams or topics, and keep everyone aligned.
              </p>
            </div>
          )}
          {messages.map((msg) => {
            const msgAgent = msg.senderType === 'agent' ? agents.find((a) => a.id === msg.senderId) : null
            const agentColor = msgAgent?.iconColor ?? '#0F4D26'
            return (
            <div key={msg.id} className={`group/msg flex gap-2 ${msg.senderType === 'human' ? 'justify-end' : ''}`}>
              {msg.senderType !== 'human' && (
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  style={msg.senderType === 'agent' ? { backgroundColor: agentColor + '18', color: agentColor } : undefined}
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {msg.senderType === 'agent' ? (msgAgent?.iconName ?? 'smart_toy') : 'info'}
                  </span>
                </div>
              )}
              <div className={`max-w-[70%] rounded-xl px-4 py-2.5 ${
                msg.senderType === 'human'
                  ? 'bg-forest-green/10 text-text-main'
                  : msg.senderType === 'system'
                    ? 'bg-amber-50 text-amber-800 italic'
                    : 'bg-white border border-border-subtle text-text-main'
              }`}>
                {msg.senderType === 'agent' && (
                  <p className="mb-1 text-[11px] font-bold" style={{ color: agentColor }}>
                    {msgAgent?.name ?? 'Agent'}
                  </p>
                )}
                {/* Render text (minus any markdown images), with collapsible thinking */}
                {(() => {
                  const textOnly = msg.content.replace(/!\[[^\]]*\]\([^)]+\)/g, '').trim()
                  if (!textOnly) return null
                  // Extract [think]...[/think] blocks
                  const thinkRegex = /\[think\]([\s\S]*?)\[\/think\]/g
                  const thinkBlocks: string[] = []
                  let thinkMatch
                  while ((thinkMatch = thinkRegex.exec(textOnly)) !== null) {
                    thinkBlocks.push(thinkMatch[1].trim())
                  }
                  const visibleText = textOnly.replace(/\[think\][\s\S]*?\[\/think\]\s*/g, '').trim()
                  return (
                    <>
                      {thinkBlocks.length > 0 && (
                        <ThinkingBlock content={thinkBlocks.join('\n\n')} />
                      )}
                      {visibleText && (
                        <p className="text-sm whitespace-pre-wrap">
                          {renderMentionContent(
                            visibleText,
                            (agentId) => openDm(agentId),
                            (docId) => navigate(`/knowledge-base?doc=${docId}`),
                            agentColorMap,
                          )}
                        </p>
                      )}
                    </>
                  )
                })()}

                {/* Render inline images/GIFs from markdown syntax */}
                {(() => {
                  const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g
                  const images: Array<{ alt: string; url: string }> = []
                  let imgMatch
                  while ((imgMatch = imgRegex.exec(msg.content)) !== null) {
                    images.push({ alt: imgMatch[1], url: imgMatch[2] })
                  }
                  return images.length > 0 ? (
                    <div className="mt-1.5 space-y-1">
                      {images.map((img, idx) => (
                        <img key={idx} src={img.url} alt={img.alt} className="max-w-full rounded-lg" style={{ maxHeight: '200px' }} loading="lazy" />
                      ))}
                    </div>
                  ) : null
                })()}

                {/* Inline media attachments */}
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {msg.attachments.map((att, idx) => (
                      <MediaPreview key={idx} attachment={att} />
                    ))}
                  </div>
                )}

                <p className="mt-1 text-[10px] text-text-muted">{new Date(msg.createdAt).toLocaleTimeString()}</p>

                {/* Reactions row: existing reactions + add button */}
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  {reactions[msg.id] && Object.entries(reactions[msg.id]).map(([emoji, users]) => (
                    <button
                      key={emoji}
                      onClick={() => handleToggleReaction(msg.id, emoji)}
                      className="inline-flex items-center gap-1 rounded-full border border-border-subtle bg-light-surface px-2 py-0.5 text-xs hover:bg-light-surface-alt transition-colors"
                    >
                      <span>{emoji}</span>
                      <span className="text-text-muted">{users.length}</span>
                    </button>
                  ))}
                  {/* Add reaction button — inline with reaction pills */}
                  <div className="relative">
                    <button
                      onClick={() => setShowReactionPicker(showReactionPicker === msg.id ? null : msg.id)}
                      className="inline-flex items-center rounded-full border border-dashed border-border-subtle px-1.5 py-0.5 text-text-muted hover:bg-light-surface-alt hover:text-text-main opacity-0 group-hover/msg:opacity-100 transition-all"
                      title="Add reaction"
                    >
                      <span className="material-symbols-outlined text-[14px]">add_reaction</span>
                    </button>
                    {showReactionPicker === msg.id && (
                      <div className="absolute bottom-full left-0 mb-1 z-50 flex gap-1 rounded-xl border border-border-subtle bg-white p-2 shadow-lg">
                        {QUICK_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => handleToggleReaction(msg.id, emoji)}
                            className="rounded-md p-1 text-lg hover:bg-light-surface-alt transition-colors"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            )
          })}
          {/* Typing indicator */}
          {typingAgent && (
            <div className="flex items-center gap-2 px-1">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: typingAgent.color + '18', color: typingAgent.color }}
              >
                <span className="material-symbols-outlined text-[16px]">{typingAgent.icon}</span>
              </div>
              <div className="rounded-xl bg-white border border-border-subtle px-4 py-2.5">
                <p className="text-[11px] font-bold mb-0.5" style={{ color: typingAgent.color }}>{typingAgent.name}</p>
                <div className="flex gap-1 items-center">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        {activeChannelId && (
          <div className="border-t border-border-subtle bg-white p-4">
            <div className="flex gap-3">
              <MentionInput
                value={newMessage}
                onChange={setNewMessage}
                onSubmit={sendMsg}
                placeholder={`Message ${activeChannel ? (activeChannel.type === 'dm' ? getAgentName(activeChannel) : '#' + activeChannel.name) : ''}...`}
                completions={mentionCompletions}
                onGifSelect={sendGif}
              />
              <button
                onClick={sendMsg}
                className="shrink-0 self-end rounded-lg bg-forest-green px-4 py-2.5 text-white hover:bg-forest-green/90"
              >
                <span className="material-symbols-outlined text-[20px]">send</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MediaPreview({ attachment }: { attachment: ChatAttachment }) {
  const fileUrl = `${ENGINE_URL}/api/workspace/file?path=${encodeURIComponent(attachment.url)}`

  if (attachment.type === 'image') {
    return (
      <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="block">
        <img
          src={fileUrl}
          alt={attachment.filename}
          className="max-h-64 max-w-full rounded-lg border border-border-subtle cursor-pointer hover:opacity-90 transition-opacity"
        />
        <p className="mt-1 text-[10px] text-text-muted">{attachment.filename}</p>
      </a>
    )
  }

  if (attachment.type === 'video') {
    return (
      <div>
        <video
          src={fileUrl}
          controls
          className="max-h-64 max-w-full rounded-lg border border-border-subtle"
          poster={attachment.thumbnailUrl ? `${ENGINE_URL}/api/workspace/file?path=${encodeURIComponent(attachment.thumbnailUrl)}` : undefined}
        />
        <p className="mt-1 text-[10px] text-text-muted">{attachment.filename}</p>
      </div>
    )
  }

  if (attachment.type === '3d') {
    return (
      <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg border border-border-subtle bg-light-surface-alt p-3 hover:bg-light-surface transition-colors">
        <span className="material-symbols-outlined text-2xl text-forest-green">view_in_ar</span>
        <div>
          <p className="text-sm font-medium text-text-main">{attachment.filename}</p>
          <p className="text-[10px] text-text-muted">3D Model — Click to download</p>
        </div>
      </a>
    )
  }

  return null
}

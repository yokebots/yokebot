import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router'
import * as engine from '@/lib/engine'
import type { ChatChannel, ChatMessage, ChatAttachment, EngineAgent } from '@/lib/engine'

const ENGINE_URL = import.meta.env.VITE_ENGINE_URL ?? 'http://localhost:3001'

export function ChatPage() {
  const { channelId: paramChannelId } = useParams()
  const [channels, setChannels] = useState<ChatChannel[]>([])
  const [agents, setAgents] = useState<EngineAgent[]>([])
  const [activeChannelId, setActiveChannelId] = useState(paramChannelId ?? '')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const loadChannels = async () => {
    try {
      const [ch, ag] = await Promise.all([engine.listChannels(), engine.listAgents()])
      setChannels(ch)
      setAgents(ag)
      if (!activeChannelId && ch.length > 0) setActiveChannelId(ch[0].id)
    } catch { /* offline */ }
  }

  const loadMessages = async () => {
    if (!activeChannelId) return
    try {
      const msgs = await engine.getMessages(activeChannelId)
      setMessages(msgs)
    } catch { /* offline */ }
  }

  useEffect(() => { loadChannels() }, [])
  useEffect(() => { loadMessages() }, [activeChannelId])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const sendMsg = async () => {
    if (!newMessage.trim() || !activeChannelId) return
    const ch = channels.find((c) => c.id === activeChannelId)
    if (ch?.type === 'dm') {
      // DM channel — route through ReAct endpoint (handles chat_messages too)
      const agentId = ch.name.replace('dm:', '')
      try {
        await engine.chatWithAgent(agentId, newMessage.trim())
      } catch { /* model not available */ }
    } else {
      // Group/task channels — post directly
      await engine.sendMessage(activeChannelId, {
        senderType: 'human',
        senderId: 'user',
        content: newMessage.trim(),
      })
    }
    setNewMessage('')
    loadMessages()
  }

  const openDm = async (agentId: string) => {
    const ch = await engine.getDmChannel(agentId)
    setActiveChannelId(ch.id)
    await loadChannels()
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

  return (
    <div className="flex h-[calc(100vh-8rem)] -m-6 border-t border-border-subtle">
      {/* Left Sidebar - Channels */}
      <div className="w-60 shrink-0 border-r border-border-subtle bg-light-surface overflow-y-auto">
        <div className="p-4">
          <h2 className="mb-4 font-display text-lg font-bold text-text-main">Chat</h2>

          {/* Direct Messages */}
          <div className="mb-4">
            <p className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-text-muted">Direct Messages</p>
            {agents.map((agent) => {
              const dmCh = dmChannels.find((c) => c.name === `dm:${agent.id}`)
              return (
                <button
                  key={agent.id}
                  onClick={() => openDm(agent.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors ${
                    dmCh && dmCh.id === activeChannelId
                      ? 'bg-forest-green/10 text-forest-green font-medium'
                      : 'text-text-secondary hover:bg-light-surface-alt'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${agent.status === 'running' ? 'bg-green-500' : 'bg-gray-300'}`} />
                  {agent.name}
                </button>
              )
            })}
            {agents.length === 0 && (
              <p className="px-2 text-xs text-text-muted">No agents yet</p>
            )}
          </div>

          {/* Task Threads */}
          {taskThreads.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-text-muted">Task Threads</p>
              {taskThreads.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => setActiveChannelId(ch.id)}
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

          {/* Group Channels */}
          {groupChannels.length > 0 && (
            <div>
              <p className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-text-muted">Group Channels</p>
              {groupChannels.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => setActiveChannelId(ch.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors ${
                    ch.id === activeChannelId
                      ? 'bg-forest-green/10 text-forest-green font-medium'
                      : 'text-text-secondary hover:bg-light-surface-alt'
                  }`}
                >
                  <span className="text-text-muted">#</span>
                  {ch.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col">
        {/* Chat Header */}
        <div className="flex h-14 items-center gap-3 border-b border-border-subtle bg-white px-6">
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
            </>
          ) : (
            <span className="text-sm text-text-muted">Select a conversation</span>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && activeChannelId && (
            <p className="py-12 text-center text-sm text-text-muted">No messages yet. Start the conversation.</p>
          )}
          {!activeChannelId && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <span className="material-symbols-outlined mb-4 text-5xl text-text-muted">forum</span>
              <p className="text-text-muted">Select an agent to start chatting</p>
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.senderType === 'human' ? 'justify-end' : ''}`}>
              {msg.senderType !== 'human' && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest-green/10 text-forest-green">
                  <span className="material-symbols-outlined text-[16px]">
                    {msg.senderType === 'agent' ? 'smart_toy' : 'info'}
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
                  <p className="mb-1 text-[11px] font-bold text-forest-green">
                    {agents.find((a) => a.id === msg.senderId)?.name ?? 'Agent'}
                  </p>
                )}
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>

                {/* Inline media attachments */}
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {msg.attachments.map((att, idx) => (
                      <MediaPreview key={idx} attachment={att} />
                    ))}
                  </div>
                )}

                <p className="mt-1 text-[10px] text-text-muted">{new Date(msg.createdAt).toLocaleTimeString()}</p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        {activeChannelId && (
          <div className="border-t border-border-subtle bg-white p-4">
            <div className="flex gap-3">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={`Message ${activeChannel ? (activeChannel.type === 'dm' ? getAgentName(activeChannel) : activeChannel.name) : ''}...`}
                className="flex-1 rounded-lg border border-border-subtle px-4 py-2.5 text-sm focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green"
                onKeyDown={(e) => e.key === 'Enter' && sendMsg()}
              />
              <button
                onClick={sendMsg}
                className="rounded-lg bg-forest-green px-4 py-2.5 text-white hover:bg-forest-green/90"
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

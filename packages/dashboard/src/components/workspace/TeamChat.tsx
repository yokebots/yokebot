import { useState, useEffect, useCallback, useRef } from 'react'
import { PanelHeader } from './PanelHeader'
import { MessageBubble } from './ThreadView'
import { ThreadView } from './ThreadView'
import { useAgentProgress } from '@/hooks/useAgentProgress'
import { AgentProgressPanel } from '@/components/AgentProgressPanel'
import { MentionInput } from '@/components/MentionInput'
import { useRealtimeEvent } from '@/lib/use-realtime'
import { useAuth } from '@/lib/auth'
import { parseSlashCommand, type CommandContext } from '@/lib/slash-commands'
import * as engine from '@/lib/engine'

interface TeamChatProps {
  teamChannelId: string | null
  onFileClick?: (docId: string) => void
  onTaskClick?: (taskId: string) => void
  onAgentClick?: (agentId: string, agentName: string) => void
  onOpenThread?: (msg: engine.ChatMessage) => void
}

interface ContextMenuState {
  x: number; y: number
  message: engine.ChatMessage
}

export function TeamChat({ teamChannelId, onFileClick, onTaskClick, onAgentClick, onOpenThread }: TeamChatProps) {
  const { user } = useAuth()
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'You'
  const [messages, setMessages] = useState<engine.ChatMessage[]>([])
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [completions, setCompletions] = useState<engine.MentionCompletionData | null>(null)
  const [internalThreadParent, setInternalThreadParent] = useState<engine.ChatMessage | null>(null)
  // If external handler provided (desktop), use it; otherwise fall back to internal thread panel
  const handleOpenThread = onOpenThread ?? setInternalThreadParent
  const threadParent = onOpenThread ? null : internalThreadParent
  const [agentColorMap, setAgentColorMap] = useState<Map<string, { color: string; icon: string; name: string }>>(new Map())
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [fileDragOver, setFileDragOver] = useState(false)
  const [agentStatuses, setAgentStatuses] = useState<Map<string, { agentName: string; status: 'typing' | 'working' | 'idle' }>>(new Map())
  const [activeProgressAgent, setActiveProgressAgent] = useState<string | null>(null)
  const { progressMap } = useAgentProgress()
  const scrollRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)
  const chatFileInputRef = useRef<HTMLInputElement>(null)

  // Close context menu on click anywhere
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [contextMenu])

  // Listen for scroll-to-message events (from task detail panel)
  useEffect(() => {
    const handler = (e: Event) => {
      const messageId = (e as CustomEvent).detail?.messageId
      if (!messageId) return
      const el = document.getElementById(`chat-msg-${messageId}`)
      if (!el) return
      // Scroll into view and flash highlight using inline styles (Tailwind v4 won't see dynamic classList classes)
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.style.backgroundColor = 'rgba(251, 191, 36, 0.3)'
      el.style.transition = 'background-color 0.5s'
      el.style.borderRadius = '8px'
      setTimeout(() => {
        el.style.backgroundColor = ''
        el.style.borderRadius = ''
      }, 2000)
    }
    window.addEventListener('yokebot:scroll-to-message', handler)
    return () => window.removeEventListener('yokebot:scroll-to-message', handler)
  }, [])

  const handleMessageContextMenu = (e: React.MouseEvent, msg: engine.ChatMessage) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, message: msg })
  }

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
        const newMsg = msgs[0]
        setMessages(prev => {
          // Deduplicate
          if (prev.some(m => m.id === newMsg.id)) return prev

          // If this is a thread reply, update the parent message's replyCount + latestReplyAt
          if (newMsg.parentMessageId) {
            const updated = prev.map(m =>
              m.id === newMsg.parentMessageId
                ? { ...m, replyCount: (m.replyCount || 0) + 1, latestReplyAt: newMsg.createdAt }
                : m
            )
            // Thread replies don't appear in the main feed — just update the parent
            return updated
          }

          return [...prev, newMsg]
        })
      }
    }).catch(() => {})
  })

  // Real-time agent typing/working indicators (with auto-clear safety net)
  const statusTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  useRealtimeEvent<{ channelId: string; agentId: string; agentName: string; status: 'typing' | 'working' | 'idle' }>('agent_typing', (data) => {
    if (data.channelId !== teamChannelId) return

    // Clear any existing timeout for this agent
    const existing = statusTimeoutsRef.current.get(data.agentId)
    if (existing) clearTimeout(existing)

    setAgentStatuses(prev => {
      const next = new Map(prev)
      if (data.status === 'idle') {
        next.delete(data.agentId)
      } else {
        next.set(data.agentId, { agentName: data.agentName, status: data.status })
      }
      return next
    })

    // Auto-clear after 30s in case idle event is missed (safety net only)
    if (data.status !== 'idle') {
      statusTimeoutsRef.current.set(data.agentId, setTimeout(() => {
        setAgentStatuses(prev => {
          const next = new Map(prev)
          next.delete(data.agentId)
          return next
        })
        statusTimeoutsRef.current.delete(data.agentId)
      }, 30_000))
    } else {
      statusTimeoutsRef.current.delete(data.agentId)
    }
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

  // Get team ID from the first message's channel or from listTeams
  const teamIdRef = useRef<string | null>(null)
  useEffect(() => {
    engine.listTeams().then(teams => {
      if (teams.length > 0) teamIdRef.current = teams[0].id
    }).catch(() => {})
  }, [])

  const addLocalMessage = useCallback((content: string) => {
    // Handle /clear special case
    if (content === '__clear__') {
      setMessages([])
      return
    }
    // Add a local-only system message
    const localMsg: engine.ChatMessage = {
      id: Date.now(),
      channelId: teamChannelId ?? '',
      senderType: 'system',
      senderId: 'system',
      content,
      attachments: [],
      audioKey: null,
      audioDurationMs: null,
      taskId: null,
      modelId: null,
      parentMessageId: null,
      replyCount: 0,
      latestReplyAt: null,
      createdAt: new Date().toISOString(),
    }
    setMessages(prev => [...prev, localMsg])
  }, [teamChannelId])

  const handleFileDragOver = useCallback((e: React.DragEvent) => {
    // Only show drop zone if dragging a yokebot file (not external files)
    if (e.dataTransfer.types.includes('application/yokebot-file')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setFileDragOver(true)
    }
  }, [])

  const handleFileDragLeave = useCallback(() => {
    setFileDragOver(false)
  }, [])

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setFileDragOver(false)
    const raw = e.dataTransfer.getData('application/yokebot-file')
    if (!raw) return
    try {
      const data = JSON.parse(raw) as { path: string; name: string; isDirectory: boolean }
      const ext = data.name.split('.').pop()?.toLowerCase() ?? ''
      const imageExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'])
      let ref: string
      if (data.isDirectory) {
        ref = `[\u{1F4C1} ${data.name}](/workspace/${data.path})`
      } else if (imageExts.has(ext)) {
        ref = `[\u{1F5BC}\uFE0F ${data.name}](/workspace/${data.path})`
      } else {
        ref = `[\u{1F4C4} ${data.name}](/workspace/${data.path})`
      }
      setMessageText(prev => prev ? `${prev} ${ref}` : ref)
    } catch { /* ignore bad data */ }
  }, [])

  const sendMessage = async () => {
    const text = messageText.trim()
    if (!text || !teamChannelId || sending) return

    // Intercept slash commands
    const parsed = parseSlashCommand(text)
    if (parsed) {
      setMessageText('')
      const ctx: CommandContext = {
        teamId: teamIdRef.current ?? '',
        channelId: teamChannelId,
        addLocalMessage,
      }
      await parsed.command.execute(parsed.args, ctx)
      return
    }

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

  const handleFileAttach = async (files: FileList) => {
    if (!teamChannelId || uploadingFile) return
    setUploadingFile(true)
    try {
      const snippets: string[] = []
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) {
          alert(`"${file.name}" exceeds the 10MB limit`)
          continue
        }
        // Upload to workspace under chat-uploads/ folder
        const result = await engine.uploadWorkspaceFile(file, 'chat-uploads')
        snippets.push(`📎 **${file.name}** (${formatFileSize(file.size)}) \`${result.path}\``)
      }
      if (snippets.length > 0) {
        // Append file references to the compose box so user can add @mentions before sending
        const fileText = snippets.join('\n')
        setMessageText(prev => prev ? `${prev}\n${fileText}` : fileText)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed')
    }
    setUploadingFile(false)
  }

  if (!teamChannelId) {
    return (
      <div data-testid="team-chat-panel" className="flex flex-col h-full">
        <PanelHeader icon="forum" title="Team Chat" />
        <div className="flex-1 flex items-center justify-center text-sm text-text-muted">
          Loading team chat...
        </div>
      </div>
    )
  }

  return (
    <div data-testid="team-chat-panel" className="flex flex-col h-full">
      <PanelHeader icon="forum" title="Team Chat" />

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-gray-50/60"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-text-muted text-sm">
            <span className="material-symbols-outlined text-3xl mb-2 text-text-muted/40">forum</span>
            <p>No messages yet</p>
            <p className="text-xs mt-1">Start a conversation with your team</p>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} id={`chat-msg-${msg.id}`}>
            <MessageBubble
              message={msg}
              agentColorMap={agentColorMap}
              humanName={userName}
              onThreadClick={handleOpenThread}
              onFileClick={onFileClick}
              onTaskClick={onTaskClick}
              onAgentClick={onAgentClick ? (id) => {
                const info = agentColorMap.get(id)
                onAgentClick(id, info?.name ?? 'Agent')
              } : undefined}
              onContextMenu={handleMessageContextMenu}
            />
          </div>
        ))}
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[160px] rounded-lg border border-border-subtle bg-white py-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => { handleOpenThread(contextMenu.message); setContextMenu(null) }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-text-main hover:bg-light-surface-alt"
          >
            <span className="material-symbols-outlined text-[16px]">reply</span>
            Reply in thread
          </button>
          <button
            onClick={() => { navigator.clipboard.writeText(contextMenu.message.content); setContextMenu(null) }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-text-main hover:bg-light-surface-alt"
          >
            <span className="material-symbols-outlined text-[16px]">content_copy</span>
            Copy text
          </button>
        </div>
      )}

      {/* Thread view (inline expand — only used on mobile / when no external handler) */}
      {threadParent && !onOpenThread && (
        <ThreadView
          parentMessage={threadParent}
          channelId={teamChannelId}
          onClose={() => setInternalThreadParent(null)}
          agentColorMap={agentColorMap}
          completions={completions}
          humanName={userName}
        />
      )}

      {/* Agent progress tabs — compact overview, click to expand details */}
      {(agentStatuses.size > 0 || progressMap.size > 0) && (() => {
        const agentIds = Array.from(new Set([...agentStatuses.keys(), ...progressMap.keys()]))
        // Auto-select first agent if none selected
        if (activeProgressAgent === null && agentIds.length > 0) setActiveProgressAgent(agentIds[0])
        const getActivity = (agentId: string) => {
          const steps = progressMap.get(agentId)
          if (!steps || steps.length === 0) return 'Working'
          const recentTools = steps.filter(s => s.type === 'tool_start').slice(-3)
          const latestTool = recentTools[recentTools.length - 1]?.label?.toLowerCase() ?? ''
          const latestStep = steps[steps.length - 1]
          if (latestStep?.type === 'responding') return 'Responding'
          if (latestTool.includes('browser') || latestTool.includes('navigate')) return 'Browsing'
          if (latestTool.includes('search') || latestTool.includes('web_search')) return 'Searching'
          if (latestTool.includes('write_file') || latestTool.includes('sandbox')) return 'Building'
          if (latestTool.includes('read') || latestTool.includes('workspace')) return 'Researching'
          if (latestTool.includes('send_message') || latestTool.includes('update_task')) return 'Updating'
          if (latestTool.includes('exec') || latestTool.includes('install')) return 'Running'
          if (latestStep?.type === 'thinking') return 'Analyzing'
          return 'Working'
        }
        return (
          <div className="border-t border-border-subtle shrink-0">
            {/* Tab bar */}
            <div className="flex gap-0.5 px-2 py-1 overflow-x-auto">
              {agentIds.map(agentId => {
                const statusEntry = agentStatuses.get(agentId)
                const agentName = statusEntry?.agentName ?? progressMap.get(agentId)?.[0]?.agentName ?? 'Agent'
                const status = statusEntry?.status ?? 'working'
                const activity = getActivity(agentId)
                const isActive = activeProgressAgent === agentId
                return (
                  <button
                    key={agentId}
                    onClick={() => setActiveProgressAgent(isActive ? null : agentId)}
                    className={`shrink-0 flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition-colors ${
                      isActive
                        ? 'bg-forest-green/10 text-forest-green font-semibold'
                        : 'text-text-muted hover:bg-light-surface-alt'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status === 'typing' ? 'bg-accent-green' : 'bg-accent-gold'}`} style={{ animation: 'pulse 2s ease-in-out infinite' }} />
                    <span>{agentName}</span>
                    <span className="text-[9px] uppercase tracking-wider opacity-70">{activity}</span>
                  </button>
                )
              })}
            </div>
            {/* Expanded detail for selected agent */}
            {activeProgressAgent && progressMap.get(activeProgressAgent) && progressMap.get(activeProgressAgent)!.length > 0 && (
              <div className="px-3 pb-2">
                <AgentProgressPanel steps={progressMap.get(activeProgressAgent)!} />
              </div>
            )}
          </div>
        )
      })()}

      {/* Message input */}
      <div
        className={`px-3 py-2 border-t shrink-0 transition-colors ${
          fileDragOver
            ? 'border-blue-400 bg-blue-50/60 ring-2 ring-inset ring-blue-300'
            : 'border-border-subtle'
        }`}
        onDragOver={handleFileDragOver}
        onDragLeave={handleFileDragLeave}
        onDrop={handleFileDrop}
      >
        {fileDragOver && (
          <div className="flex items-center justify-center gap-1.5 py-1 mb-1.5 rounded-md bg-blue-100/80 text-blue-600 text-xs font-medium">
            <span className="material-symbols-outlined text-[14px]">attach_file</span>
            Drop file to reference
          </div>
        )}
        <MentionInput
          value={messageText}
          onChange={setMessageText}
          onSubmit={sendMessage}
          placeholder="Message your team..."
          completions={completions}
          disabled={sending || uploadingFile}
          onGifSelect={handleGifSelect}
          onFileAttach={() => chatFileInputRef.current?.click()}
        />
        <input
          ref={chatFileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files?.length) handleFileAttach(e.target.files); e.target.value = '' }}
        />
      </div>
    </div>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

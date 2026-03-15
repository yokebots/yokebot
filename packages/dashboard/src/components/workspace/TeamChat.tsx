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
}

interface ContextMenuState {
  x: number; y: number
  message: engine.ChatMessage
}

export function TeamChat({ teamChannelId, onFileClick, onTaskClick, onAgentClick }: TeamChatProps) {
  const { user } = useAuth()
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'You'
  const [messages, setMessages] = useState<engine.ChatMessage[]>([])
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [completions, setCompletions] = useState<engine.MentionCompletionData | null>(null)
  const [threadParent, setThreadParent] = useState<engine.ChatMessage | null>(null)
  const [agentColorMap, setAgentColorMap] = useState<Map<string, { color: string; icon: string; name: string }>>(new Map())
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [fileDragOver, setFileDragOver] = useState(false)
  const [agentStatuses, setAgentStatuses] = useState<Map<string, { agentName: string; status: 'typing' | 'working' | 'idle' }>>(new Map())
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
        setMessages(prev => {
          // Deduplicate
          if (prev.some(m => m.id === msgs[0].id)) return prev
          return [...prev, msgs[0]]
        })
      }
    }).catch(() => {})
  })

  // Real-time agent typing/working indicators
  useRealtimeEvent<{ channelId: string; agentId: string; agentName: string; status: 'typing' | 'working' | 'idle' }>('agent_typing', (data) => {
    if (data.channelId !== teamChannelId) return
    setAgentStatuses(prev => {
      const next = new Map(prev)
      if (data.status === 'idle') {
        next.delete(data.agentId)
      } else {
        next.set(data.agentId, { agentName: data.agentName, status: data.status })
      }
      return next
    })
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
          <MessageBubble
            key={msg.id}
            message={msg}
            agentColorMap={agentColorMap}
            humanName={userName}
            onThreadClick={setThreadParent}
            onFileClick={onFileClick}
            onTaskClick={onTaskClick}
            onAgentClick={onAgentClick ? (id) => {
              const info = agentColorMap.get(id)
              onAgentClick(id, info?.name ?? 'Agent')
            } : undefined}
            onContextMenu={handleMessageContextMenu}
          />
        ))}
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[160px] rounded-lg border border-border-subtle bg-white py-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => { setThreadParent(contextMenu.message); setContextMenu(null) }}
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

      {/* Thread view (inline expand) */}
      {threadParent && (
        <ThreadView
          parentMessage={threadParent}
          channelId={teamChannelId}
          onClose={() => setThreadParent(null)}
          agentColorMap={agentColorMap}
          completions={completions}
        />
      )}

      {/* Agent live progress panels — Gemini-style expandable reasoning */}
      {agentStatuses.size > 0 && (
        <div className="px-3 py-2 border-t border-border-subtle shrink-0 space-y-2">
          {Array.from(agentStatuses.entries()).map(([agentId, { agentName, status }]) => {
            const steps = progressMap.get(agentId)
            if (steps && steps.length > 0) {
              return (
                <div key={agentId}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status === 'typing' ? 'bg-accent-green' : 'bg-accent-gold'}`} style={{ animation: 'pulse 2s ease-in-out infinite' }} />
                    <span className="text-xs font-medium text-text-main">{agentName}</span>
                  </div>
                  <AgentProgressPanel steps={steps} />
                </div>
              )
            }
            // Fallback: no progress data yet, show simple indicator
            return (
              <div key={agentId} className="flex items-center gap-1.5 text-xs text-text-muted">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status === 'typing' ? 'bg-accent-green' : 'bg-accent-gold'}`} style={{ animation: 'pulse 2s ease-in-out infinite' }} />
                <span>{agentName} {status === 'typing' ? 'is typing' : 'is working'}...</span>
              </div>
            )
          })}
        </div>
      )}

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

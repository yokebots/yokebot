import { useState, useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router'
import { ResizablePanel, HorizontalDivider } from '@/components/workspace/ResizablePanel'
import { FilesPanel } from '@/components/workspace/FilesPanel'
import { ContextPane } from '@/components/workspace/ContextPane'
import { TasksPanel } from '@/components/workspace/TasksPanel'
import { WorkflowsPanel } from '@/components/workspace/WorkflowsPanel'
import { TeamChat } from '@/components/workspace/TeamChat'
import { ThreadView } from '@/components/workspace/ThreadView'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { useRealtimeEvent } from '@/lib/use-realtime'
import { useTeam } from '@/lib/team-context'
import { useAuth } from '@/lib/auth'
import * as engine from '@/lib/engine'

// ---- Tab types for the context pane viewer ----

export type ViewerTabType = 'file' | 'data-table' | 'browser' | 'workflow' | 'workflow-run' | 'video-editor' | 'agent-detail' | 'sandbox-preview'

export interface ViewerTab {
  id: string
  type: ViewerTabType
  label: string
  icon: string
  /** file path, table ID, or browser session ID */
  resourceId: string
}

// ---- Workspace context (shared state between panels) ----

export interface WorkspaceState {
  viewerTabs: ViewerTab[]
  activeTabId: string | null
  selectedTaskId: string | null
  activeFilePath: string | null
  addViewerTab: (tab: ViewerTab) => void
  closeViewerTab: (tabId: string) => void
  updateViewerTab: (tabId: string, updates: Partial<Pick<ViewerTab, 'label' | 'resourceId'>>) => void
  setActiveTab: (tabId: string) => void
  setSelectedTaskId: (taskId: string | null) => void
}

// ---- Mobile tab names ----

const MOBILE_TABS = ['Files', 'Chat', 'Tasks', 'Workflows'] as const
type MobileTab = typeof MOBILE_TABS[number]

export function WorkspacePage() {
  const isMobile = useIsMobile()
  const { activeTeam } = useTeam()
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [mobileTab, setMobileTab] = useState<MobileTab>('Chat')

  // Viewer tabs state — persist to localStorage per team
  const storageKey = activeTeam ? `workspace-tabs:${activeTeam.id}` : null
  const [rightPanelTab, setRightPanelTab] = useState<'tasks' | 'workflows'>('tasks')
  const [viewerTabs, setViewerTabs] = useState<ViewerTab[]>(() => {
    if (!storageKey) return []
    try {
      const saved = localStorage.getItem(storageKey)
      if (!saved) return []
      const parsed = JSON.parse(saved) as { tabs: ViewerTab[]; activeTabId: string | null }
      // Filter out browser tabs — sessions don't survive refresh
      return (parsed.tabs ?? []).filter((t: ViewerTab) => t.type !== 'browser')
    } catch { return [] }
  })
  const [activeTabId, setActiveTabId] = useState<string | null>(() => {
    if (!storageKey) return null
    try {
      const saved = localStorage.getItem(storageKey)
      if (!saved) return null
      const parsed = JSON.parse(saved) as { tabs: ViewerTab[]; activeTabId: string | null }
      const restoredTabs = (parsed.tabs ?? []).filter((t: ViewerTab) => t.type !== 'browser')
      // Only restore activeTabId if the tab still exists after filtering
      return restoredTabs.some((t: ViewerTab) => t.id === parsed.activeTabId) ? parsed.activeTabId : (restoredTabs[0]?.id ?? null)
    } catch { return null }
  })
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [threadParent, setThreadParent] = useState<engine.ChatMessage | null>(null)
  const [completions, setCompletions] = useState<engine.MentionCompletionData | null>(null)
  const [threadSplitRatio, setThreadSplitRatio] = useState(() => {
    const saved = localStorage.getItem('workspace-thread-split-ratio')
    return saved ? Number(saved) : 0.5
  })
  const saveThreadSplitRatio = useCallback((ratio: number) => {
    setThreadSplitRatio(ratio)
    localStorage.setItem('workspace-thread-split-ratio', String(ratio))
  }, [])

  // Persist tabs to localStorage whenever they change
  useEffect(() => {
    if (!storageKey) return
    const data = { tabs: viewerTabs, activeTabId }
    localStorage.setItem(storageKey, JSON.stringify(data))
  }, [storageKey, viewerTabs, activeTabId])

  // Context pane split ratio (top viewer / bottom chat)
  const [splitRatio, setSplitRatio] = useState(() => {
    const saved = localStorage.getItem('workspace-split-ratio')
    return saved ? Number(saved) : 0.5
  })

  // Team channel ID (fetched once)
  const [teamChannelId, setTeamChannelId] = useState<string | null>(null)

  // Agents list (shared by tasks panel and agent color map)
  const [agents, setAgents] = useState<engine.EngineAgent[]>([])

  // Build agent color map from agents list (for ThreadView in right panel)
  const agentColorMapRef = useRef(new Map<string, { color: string; icon: string; name: string }>())
  useEffect(() => {
    const map = new Map<string, { color: string; icon: string; name: string }>()
    for (const a of agents) {
      map.set(a.id, {
        color: a.iconColor ?? '#0F4D26',
        icon: a.iconName ?? 'smart_toy',
        name: a.name,
      })
    }
    agentColorMapRef.current = map
  }, [agents])

  // Fetch mention completions for ThreadView
  useEffect(() => {
    if (!activeTeam) return
    engine.getMentionCompletions().then(setCompletions).catch(() => {})
  }, [activeTeam])

  // Unread tracking
  const [unreadFileIds, setUnreadFileIds] = useState<Set<string>>(new Set())
  const [unreadTaskIds, setUnreadTaskIds] = useState<Set<string>>(new Set())
  // Track recently-read files to prevent SSE re-fetch from re-adding them
  const recentlyReadRef = useRef<Set<string>>(new Set())

  // Fetch team channel, agents, unread state — wait for activeTeam so X-Team-Id header is set
  useEffect(() => {
    if (!activeTeam) return
    engine.getTeamChannel()
      .then(ch => { console.log('[workspace] team channel:', ch); setTeamChannelId(ch.id) })
      .catch(err => console.error('[workspace] getTeamChannel failed:', err))
    engine.listAgents().then(setAgents).catch(() => {})
    engine.getUnreadFileIds().then(res => setUnreadFileIds(new Set(res.fileIds))).catch(() => {})
    engine.getUnreadTaskIds().then(res => setUnreadTaskIds(new Set(res.taskIds))).catch(() => {})
  }, [activeTeam])

  // SSE: refresh unread state when files or tasks change
  // Filter out recently-read files so the re-fetch doesn't undo local mark-read
  useRealtimeEvent('file_written', () => {
    engine.getUnreadFileIds().then(res => {
      const serverSet = new Set(res.fileIds)
      // Remove files the user just read (race window with server)
      for (const path of recentlyReadRef.current) serverSet.delete(path)
      setUnreadFileIds(serverSet)
    }).catch(() => {})
  })
  useRealtimeEvent('task_updated', () => {
    engine.getUnreadTaskIds().then(res => setUnreadTaskIds(new Set(res.taskIds))).catch(() => {})
  })
  useRealtimeEvent('task_created', () => {
    engine.getUnreadTaskIds().then(res => setUnreadTaskIds(new Set(res.taskIds))).catch(() => {})
  })

  // Auto-open browser tab when an agent starts browsing
  useRealtimeEvent<{ agentId: string; sessionId: string }>('agent_browser_started', (data) => {
    const agent = agents.find(a => a.id === data.agentId)
    const label = agent ? `${agent.name} Browser` : 'Agent Browser'
    addViewerTab({
      id: `browser:agent:${data.agentId}`,
      type: 'browser',
      label,
      icon: 'language',
      resourceId: `agent:${data.agentId}:${data.sessionId}`,
    })
  })

  // Auto-open sandbox preview tab when a preview URL is generated
  useRealtimeEvent('sandbox_preview', () => {
    // Don't pass the raw Daytona URL — PreviewPanel fetches its own proxy token
    addViewerTab({
      id: 'sandbox-preview',
      type: 'sandbox-preview',
      label: 'Preview',
      icon: 'preview',
      resourceId: '',
    })
  })

  const markFileReadLocally = useCallback((path: string) => {
    // Track as recently-read so SSE re-fetches don't re-add it
    recentlyReadRef.current.add(path)
    // Keep in recently-read for 60s — agent may keep writing files during a sprint
    setTimeout(() => recentlyReadRef.current.delete(path), 60000)
    setUnreadFileIds(prev => {
      if (!prev.has(path)) return prev
      const next = new Set(prev)
      next.delete(path)
      return next
    })
  }, [])

  const handleMarkFileRead = useCallback((path: string) => {
    engine.markFileRead(path).catch(err => {
      console.warn('[workspace] markFileRead failed for path:', path, err)
    })
    markFileReadLocally(path)
  }, [markFileReadLocally])

  // Listen for file-read events from FileViewer (so opening a file in the viewer clears its unread dot)
  useEffect(() => {
    const handler = (e: Event) => {
      const path = (e as CustomEvent).detail?.path
      if (path) markFileReadLocally(path)
    }
    window.addEventListener('yokebot:file-read', handler)
    return () => window.removeEventListener('yokebot:file-read', handler)
  }, [markFileReadLocally])

  const handleMarkAllFilesRead = useCallback(() => {
    unreadFileIds.forEach(path => {
      engine.markFileRead(path).catch(err => {
        console.warn('[workspace] markFileRead failed for path:', path, err)
      })
      recentlyReadRef.current.add(path)
      setTimeout(() => recentlyReadRef.current.delete(path), 60000)
    })
    setUnreadFileIds(new Set())
  }, [unreadFileIds])

  const saveSplitRatio = useCallback((ratio: number) => {
    setSplitRatio(ratio)
    localStorage.setItem('workspace-split-ratio', String(ratio))
  }, [])

  const addViewerTab = useCallback((tab: ViewerTab) => {
    setViewerTabs(prev => {
      const existing = prev.find(t => t.resourceId === tab.resourceId && t.type === tab.type)
      if (existing) {
        setActiveTabId(existing.id)
        return prev
      }
      setActiveTabId(tab.id)
      return [...prev, tab]
    })
  }, [])

  // Open file/task from URL search params (e.g. from activity log clicks)
  useEffect(() => {
    const filePath = searchParams.get('file')
    const taskId = searchParams.get('task')
    if (filePath) {
      const name = filePath.split('/').pop() ?? filePath
      const ext = name.split('.').pop()?.toLowerCase() ?? ''
      const iconMap: Record<string, string> = { pdf: 'picture_as_pdf', png: 'image', jpg: 'image', jpeg: 'image', csv: 'table_chart' }
      addViewerTab({ id: `file:${filePath}`, type: 'file', label: name, icon: iconMap[ext] ?? 'description', resourceId: filePath })
      setSearchParams({}, { replace: true }) // clear param so it doesn't re-open on re-render
    }
    if (taskId) {
      setSelectedTaskId(taskId)
      setSearchParams({}, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- run once on mount

  const closeViewerTab = useCallback((tabId: string) => {
    setViewerTabs(prev => {
      const next = prev.filter(t => t.id !== tabId)
      if (activeTabId === tabId) {
        setActiveTabId(next.length > 0 ? next[next.length - 1].id : null)
      }
      return next
    })
  }, [activeTabId])

  const updateViewerTab = useCallback((tabId: string, updates: Partial<Pick<ViewerTab, 'label' | 'resourceId'>>) => {
    setViewerTabs(prev => prev.map(t => {
      if (t.id !== tabId) return t
      const updated = { ...t, ...updates }
      // Keep id in sync with resourceId for file tabs
      if (updates.resourceId && t.type === 'file') {
        updated.id = `file:${updates.resourceId}`
      }
      return updated
    }))
  }, [])

  // Derive active file path from active tab
  const activeTab = viewerTabs.find(t => t.id === activeTabId)
  const activeFilePath = activeTab?.type === 'file' ? activeTab.resourceId : null

  const workspaceState: WorkspaceState = {
    viewerTabs,
    activeTabId,
    selectedTaskId,
    activeFilePath,
    addViewerTab,
    closeViewerTab,
    updateViewerTab,
    setActiveTab: setActiveTabId,
    setSelectedTaskId,
  }

  // ---- Mobile layout ----
  if (isMobile) {
    return (
      <div className="-m-4 md:-m-6 flex flex-col h-[calc(100vh-4rem)]">
        {/* Tab bar */}
        <div className="flex border-b border-border-subtle bg-light-surface shrink-0">
          {MOBILE_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setMobileTab(tab)}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                mobileTab === tab
                  ? 'border-b-2 border-forest-green text-forest-green'
                  : 'text-text-muted hover:text-text-main'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Active panel */}
        <div className="flex-1 overflow-hidden">
          {mobileTab === 'Files' && (
            <FilesPanel workspace={workspaceState} unreadFileIds={unreadFileIds} onMarkFileRead={handleMarkFileRead} onMarkAllFilesRead={handleMarkAllFilesRead} />
          )}
          {mobileTab === 'Chat' && (
            <TeamChat
              teamChannelId={teamChannelId}
              onTaskClick={(taskId) => { setSelectedTaskId(taskId); setMobileTab('Tasks') }}
            />
          )}
          {mobileTab === 'Tasks' && (
            <TasksPanel workspace={workspaceState} unreadTaskIds={unreadTaskIds} agents={agents} />
          )}
          {mobileTab === 'Workflows' && (
            <WorkflowsPanel workspace={workspaceState} />
          )}
        </div>
      </div>
    )
  }

  // ---- Desktop layout: 3 resizable panels ----
  return (
    <div data-testid="workspace-layout" className="-m-4 md:-m-6 flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Left: Files */}
      <ResizablePanel
        defaultWidth={260}
        minWidth={180}
        maxWidth={400}
        storageKey="files"
        side="left"
        className="border-r border-border-subtle bg-light-surface overflow-hidden flex flex-col"
        data-tour="files-panel"
      >
        <FilesPanel workspace={workspaceState} unreadFileIds={unreadFileIds} onMarkFileRead={handleMarkFileRead} onMarkAllFilesRead={handleMarkAllFilesRead} />
      </ResizablePanel>

      {/* Center: Context Pane (viewer tabs + team chat) */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0" data-tour="chat-panel">
        <ContextPane
          workspace={workspaceState}
          teamChannelId={teamChannelId}
          splitRatio={splitRatio}
          onSplitRatioChange={saveSplitRatio}
          onOpenThread={setThreadParent}
        />
      </div>

      {/* Right: Tasks / Workflows */}
      <ResizablePanel
        defaultWidth={320}
        minWidth={240}
        maxWidth={500}
        storageKey="tasks"
        side="right"
        className="border-l border-border-subtle bg-light-surface overflow-hidden flex flex-col"
        data-tour="tasks-panel"
      >
        <div className="flex flex-col h-full">
          {/* Sub-tab toggle */}
          <div className="flex items-center gap-1 px-2 py-2 border-b border-border-subtle shrink-0">
            <button
              onClick={() => setRightPanelTab('tasks')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                rightPanelTab === 'tasks'
                  ? 'bg-forest-green/10 text-forest-green'
                  : 'text-text-muted hover:bg-light-surface-alt hover:text-text-main'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">task_alt</span>
              Tasks
              {unreadTaskIds.size > 0 && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-forest-green px-1 text-[9px] font-bold text-white">
                  {unreadTaskIds.size}
                </span>
              )}
            </button>
            <button
              onClick={() => setRightPanelTab('workflows')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                rightPanelTab === 'workflows'
                  ? 'bg-forest-green/10 text-forest-green'
                  : 'text-text-muted hover:bg-light-surface-alt hover:text-text-main'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">account_tree</span>
              Workflows
            </button>
          </div>
          {/* Tasks/Workflows panel — shrinks when thread is open */}
          <div
            className="overflow-hidden flex flex-col"
            style={threadParent ? { height: `${threadSplitRatio * 100}%` } : { flex: '1 1 0%' }}
          >
            {rightPanelTab === 'tasks' && <TasksPanel workspace={workspaceState} unreadTaskIds={unreadTaskIds} agents={agents} />}
            {rightPanelTab === 'workflows' && <WorkflowsPanel workspace={workspaceState} />}
          </div>
          {/* Draggable divider + Thread panel — bottom of right column */}
          {threadParent && teamChannelId && (
            <>
              <HorizontalDivider
                storageKey="thread-split"
                onRatioChange={saveThreadSplitRatio}
              />
              <div className="overflow-hidden flex flex-col" style={{ height: `${(1 - threadSplitRatio) * 100}%` }}>
                <ThreadView
                  parentMessage={threadParent}
                  channelId={teamChannelId}
                  onClose={() => setThreadParent(null)}
                  agentColorMap={agentColorMapRef.current}
                  completions={completions}
                  humanName={user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'You'}
                />
              </div>
            </>
          )}
        </div>
      </ResizablePanel>
    </div>
  )
}

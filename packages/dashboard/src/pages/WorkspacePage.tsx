import { useState, useCallback, useEffect } from 'react'
import { ResizablePanel } from '@/components/workspace/ResizablePanel'
import { FilesPanel } from '@/components/workspace/FilesPanel'
import { ContextPane } from '@/components/workspace/ContextPane'
import { TasksPanel } from '@/components/workspace/TasksPanel'
import { WorkflowsPanel } from '@/components/workspace/WorkflowsPanel'
import { TeamChat } from '@/components/workspace/TeamChat'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { useRealtimeEvent } from '@/lib/use-realtime'
import { useTeam } from '@/lib/team-context'
import * as engine from '@/lib/engine'

// ---- Tab types for the context pane viewer ----

export type ViewerTabType = 'file' | 'data-table' | 'browser' | 'workflow' | 'workflow-run' | 'video-editor'

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
  const [mobileTab, setMobileTab] = useState<MobileTab>('Chat')

  // Viewer tabs state
  const [rightPanelTab, setRightPanelTab] = useState<'tasks' | 'workflows'>('tasks')
  const [viewerTabs, setViewerTabs] = useState<ViewerTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  // Context pane split ratio (top viewer / bottom chat)
  const [splitRatio, setSplitRatio] = useState(() => {
    const saved = localStorage.getItem('workspace-split-ratio')
    return saved ? Number(saved) : 0.5
  })

  // Team channel ID (fetched once)
  const [teamChannelId, setTeamChannelId] = useState<string | null>(null)

  // Agents list (shared by tasks panel and agent color map)
  const [agents, setAgents] = useState<engine.EngineAgent[]>([])

  // Unread tracking
  const [unreadFileIds, setUnreadFileIds] = useState<Set<string>>(new Set())
  const [unreadTaskIds, setUnreadTaskIds] = useState<Set<string>>(new Set())

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
  useRealtimeEvent('file_written', () => {
    engine.getUnreadFileIds().then(res => setUnreadFileIds(new Set(res.fileIds))).catch(() => {})
  })
  useRealtimeEvent('task_updated', () => {
    engine.getUnreadTaskIds().then(res => setUnreadTaskIds(new Set(res.taskIds))).catch(() => {})
  })
  useRealtimeEvent('task_created', () => {
    engine.getUnreadTaskIds().then(res => setUnreadTaskIds(new Set(res.taskIds))).catch(() => {})
  })

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
            <FilesPanel workspace={workspaceState} unreadFileIds={unreadFileIds} />
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
    <div className="-m-4 md:-m-6 flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Left: Files */}
      <ResizablePanel
        defaultWidth={260}
        minWidth={180}
        maxWidth={400}
        storageKey="files"
        side="left"
        className="border-r border-border-subtle bg-light-surface overflow-hidden flex flex-col"
      >
        <FilesPanel workspace={workspaceState} unreadFileIds={unreadFileIds} />
      </ResizablePanel>

      {/* Center: Context Pane (viewer tabs + team chat) */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <ContextPane
          workspace={workspaceState}
          teamChannelId={teamChannelId}
          splitRatio={splitRatio}
          onSplitRatioChange={saveSplitRatio}
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
          {/* Active panel */}
          {rightPanelTab === 'tasks' && <TasksPanel workspace={workspaceState} unreadTaskIds={unreadTaskIds} agents={agents} />}
          {rightPanelTab === 'workflows' && <WorkflowsPanel workspace={workspaceState} />}
        </div>
      </ResizablePanel>
    </div>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { HorizontalDivider } from './ResizablePanel'
import { FileViewer } from './FileViewer'
import { TeamChat } from './TeamChat'
import type { WorkspaceState, ViewerTab } from '@/pages/WorkspacePage'

interface ContextPaneProps {
  workspace: WorkspaceState
  teamChannelId: string | null
  splitRatio: number
  onSplitRatioChange: (ratio: number) => void
}

export function ContextPane({ workspace, teamChannelId, splitRatio, onSplitRatioChange }: ContextPaneProps) {
  const hasViewerTabs = workspace.viewerTabs.length > 0
  const activeTab = workspace.viewerTabs.find(t => t.id === workspace.activeTabId)

  const handleFileClick = useCallback((docId: string) => {
    const name = docId.split('/').pop() ?? docId
    const ext = name.split('.').pop()?.toLowerCase() ?? ''
    const iconMap: Record<string, string> = { pdf: 'picture_as_pdf', png: 'image', jpg: 'image', jpeg: 'image', csv: 'table_chart' }
    const tab: ViewerTab = { id: `file:${docId}`, type: 'file', label: name, icon: iconMap[ext] ?? 'description', resourceId: docId }
    workspace.addViewerTab(tab)
  }, [workspace])

  const handleTaskClick = useCallback((taskId: string) => {
    workspace.setSelectedTaskId(taskId)
  }, [workspace])

  return (
    <div className="flex flex-col h-full relative">
      {/* Tab viewer (top) — only shown when tabs are open */}
      {hasViewerTabs && (
        <>
          <div style={{ height: `${splitRatio * 100}%` }} className="flex flex-col overflow-hidden">
            {/* Tab bar — Chrome/Zed-style with proportional shrink + scroll */}
            <TabBar workspace={workspace} />

            {/* Tab content */}
            <div className="flex-1 overflow-hidden flex flex-col">
              {activeTab?.type === 'file' && (
                <FileViewer filePath={activeTab.resourceId} onTaskClick={(taskId) => workspace.setSelectedTaskId(taskId)} />
              )}
              {activeTab?.type === 'data-table' && (
                <DataTablePlaceholder tableId={activeTab.resourceId} />
              )}
              {activeTab?.type === 'browser' && (
                <BrowserPlaceholder sessionId={activeTab.resourceId} />
              )}
              {!activeTab && (
                <div className="flex-1 flex items-center justify-center text-sm text-text-muted">
                  Select a tab
                </div>
              )}
            </div>
          </div>

          <HorizontalDivider
            storageKey="context-split"
            onRatioChange={onSplitRatioChange}
          />
        </>
      )}

      {/* Team Chat (bottom) — always visible, takes full height when no tabs */}
      <div
        className={hasViewerTabs ? 'flex flex-col overflow-hidden' : 'flex flex-col flex-1 overflow-hidden'}
        style={hasViewerTabs ? { height: `${(1 - splitRatio) * 100}%` } : undefined}
      >
        <TeamChat teamChannelId={teamChannelId} onFileClick={handleFileClick} onTaskClick={handleTaskClick} />
      </div>
    </div>
  )
}

/** Chrome/Zed-style tab bar with proportional sizing and scroll chevrons. */
function TabBar({ workspace }: { workspace: WorkspaceState }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const activeTabRef = useRef<HTMLButtonElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollState = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 1)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  // Recalculate on tab changes / resize
  useEffect(() => {
    updateScrollState()
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(updateScrollState)
    observer.observe(el)
    return () => observer.disconnect()
  }, [workspace.viewerTabs.length, updateScrollState])

  // Auto-scroll active tab into view
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' })
  }, [workspace.activeTabId])

  const scroll = (dir: number) => {
    containerRef.current?.scrollBy({ left: dir * 200, behavior: 'smooth' })
  }

  return (
    <div className="relative flex items-center border-b border-border-subtle bg-light-surface shrink-0 min-w-0">
      {/* Left chevron */}
      {canScrollLeft && (
        <button
          onClick={() => scroll(-1)}
          className="absolute left-0 z-10 flex h-full w-6 items-center justify-center bg-gradient-to-r from-light-surface via-light-surface/80 to-transparent"
        >
          <span className="material-symbols-outlined text-[14px] text-text-muted">chevron_left</span>
        </button>
      )}

      {/* Tab container — tabs shrink proportionally, scrolls only when they hit min-width */}
      <div
        ref={containerRef}
        onScroll={updateScrollState}
        className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide px-2 py-1 min-w-0 flex-1"
      >
        {workspace.viewerTabs.map(tab => {
          const isActive = workspace.activeTabId === tab.id
          return (
            <button
              key={tab.id}
              ref={isActive ? activeTabRef : undefined}
              onClick={() => workspace.setActiveTab(tab.id)}
              title={tab.label}
              className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors min-w-0 ${
                isActive
                  ? 'bg-forest-green/10 text-forest-green'
                  : 'text-text-muted hover:bg-light-surface-alt hover:text-text-main'
              }`}
              style={{ minWidth: 80, maxWidth: 180, flex: '1 1 0px' }}
            >
              <span className="material-symbols-outlined text-[14px] shrink-0">{tab.icon}</span>
              <span className="truncate min-w-0">{tab.label}</span>
              <span
                onClick={(e) => { e.stopPropagation(); workspace.closeViewerTab(tab.id) }}
                className="shrink-0 rounded hover:bg-black/10 p-0.5 leading-none cursor-pointer"
              >
                <span className="material-symbols-outlined text-[12px]">close</span>
              </span>
            </button>
          )
        })}
      </div>

      {/* Right chevron */}
      {canScrollRight && (
        <button
          onClick={() => scroll(1)}
          className="absolute right-0 z-10 flex h-full w-6 items-center justify-center bg-gradient-to-l from-light-surface via-light-surface/80 to-transparent"
        >
          <span className="material-symbols-outlined text-[14px] text-text-muted">chevron_right</span>
        </button>
      )}
    </div>
  )
}

/** Placeholder for data table viewer — will be replaced with full spreadsheet component */
function DataTablePlaceholder({ tableId }: { tableId: string }) {
  return (
    <div className="flex-1 flex items-center justify-center text-text-muted text-sm p-4">
      <div className="text-center">
        <span className="material-symbols-outlined text-3xl block mb-2 text-text-muted/50">table_chart</span>
        <p>Data Table: {tableId}</p>
        <p className="text-xs mt-1">Full spreadsheet editor coming soon</p>
      </div>
    </div>
  )
}

/** Placeholder for browser use viewer — Firecrawl live view */
function BrowserPlaceholder({ sessionId }: { sessionId: string }) {
  return (
    <div className="flex-1 flex items-center justify-center text-text-muted text-sm p-4">
      <div className="text-center">
        <span className="material-symbols-outlined text-3xl block mb-2 text-text-muted/50">language</span>
        <p>Browser Session: {sessionId}</p>
        <p className="text-xs mt-1">Firecrawl browser preview coming soon</p>
      </div>
    </div>
  )
}

import { HorizontalDivider } from './ResizablePanel'
import { FileViewer } from './FileViewer'
import { TeamChat } from './TeamChat'
import type { WorkspaceState } from '@/pages/WorkspacePage'

interface ContextPaneProps {
  workspace: WorkspaceState
  teamChannelId: string | null
  splitRatio: number
  onSplitRatioChange: (ratio: number) => void
}

export function ContextPane({ workspace, teamChannelId, splitRatio, onSplitRatioChange }: ContextPaneProps) {
  const hasViewerTabs = workspace.viewerTabs.length > 0
  const activeTab = workspace.viewerTabs.find(t => t.id === workspace.activeTabId)

  return (
    <div className="flex flex-col h-full relative">
      {/* Tab viewer (top) — only shown when tabs are open */}
      {hasViewerTabs && (
        <>
          <div style={{ height: `${splitRatio * 100}%` }} className="flex flex-col overflow-hidden">
            {/* Tab bar */}
            <div className="flex items-center gap-0.5 border-b border-border-subtle bg-light-surface px-2 py-1 shrink-0 overflow-x-auto scrollbar-hide">
              {workspace.viewerTabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => workspace.setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                    workspace.activeTabId === tab.id
                      ? 'bg-forest-green/10 text-forest-green'
                      : 'text-text-muted hover:bg-light-surface-alt hover:text-text-main'
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px]">{tab.icon}</span>
                  {tab.label}
                  <span
                    onClick={(e) => { e.stopPropagation(); workspace.closeViewerTab(tab.id) }}
                    className="ml-1 rounded hover:bg-black/10 p-0.5 leading-none cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[12px]">close</span>
                  </span>
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-hidden flex flex-col">
              {activeTab?.type === 'file' && (
                <FileViewer filePath={activeTab.resourceId} />
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
        <TeamChat teamChannelId={teamChannelId} />
      </div>
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

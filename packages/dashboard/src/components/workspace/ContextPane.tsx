import { useCallback, useEffect, useRef, useState } from 'react'
import { HorizontalDivider } from './ResizablePanel'
import { FileViewer } from './FileViewer'
import { TeamChat } from './TeamChat'
import type { WorkspaceState, ViewerTab } from '@/pages/WorkspacePage'
import * as engine from '@/lib/engine'
import type { SorTable, SorRow } from '@/lib/engine'

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
                <DataTableViewer tableId={activeTab.resourceId} />
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

const statusStyle: Record<string, string> = {
  Qualified: 'bg-green-50 text-green-700',
  New: 'bg-blue-50 text-blue-700',
  Contacted: 'bg-amber-50 text-amber-700',
  Active: 'bg-green-50 text-green-700',
  Inactive: 'bg-gray-100 text-gray-600',
  Lead: 'bg-purple-50 text-purple-700',
  Customer: 'bg-green-50 text-green-700',
  Canceled: 'bg-red-50 text-red-700',
}

function DataTableViewer({ tableId }: { tableId: string }) {
  const [table, setTable] = useState<SorTable | null>(null)
  const [rows, setRows] = useState<SorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editingCell, setEditingCell] = useState<{ rowId: string; col: string } | null>(null)
  const [editCellValue, setEditCellValue] = useState('')
  const [showAddRow, setShowAddRow] = useState(false)
  const [newRowData, setNewRowData] = useState<Record<string, string>>({})
  const editInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([engine.listSorTables(), engine.listSorRows(tableId)]).then(([tables, rowData]) => {
      if (cancelled) return
      setTable(tables.find(t => t.id === tableId) ?? null)
      setRows(rowData)
      setLoading(false)
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tableId])

  useEffect(() => {
    if (editingCell) editInputRef.current?.focus()
  }, [editingCell])

  const dataColumns = table?.columns
    .sort((a, b) => a.position - b.position)
    .map(c => c.name) ?? []

  const startCellEdit = (rowId: string, col: string, value: string) => {
    setEditingCell({ rowId, col })
    setEditCellValue(value)
  }

  const handleCellEdit = async (rowId: string, col: string) => {
    setEditingCell(null)
    const row = rows.find(r => r.id === rowId)
    if (!row || String(row.data[col] ?? '') === editCellValue) return
    const updated = await engine.updateSorRow(tableId, rowId, { ...row.data, [col]: editCellValue })
    setRows(prev => prev.map(r => r.id === rowId ? updated : r))
  }

  const handleAddRow = async () => {
    const row = await engine.addSorRow(tableId, newRowData)
    setRows(prev => [...prev, row])
    setNewRowData({})
    setShowAddRow(false)
  }

  const handleDeleteRow = async (rowId: string) => {
    await engine.deleteSorRow(tableId, rowId)
    setRows(prev => prev.filter(r => r.id !== rowId))
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-text-muted">
        Loading table...
      </div>
    )
  }

  if (!table) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-text-muted">
        Table not found
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle shrink-0">
        <span className="text-sm font-semibold text-text-main">{table.name}</span>
        <span className="text-xs text-text-muted">{rows.length} record{rows.length !== 1 ? 's' : ''}</span>
        <div className="flex-1" />
        <button
          onClick={() => { setShowAddRow(true); setNewRowData({}) }}
          className="flex items-center gap-1 rounded-md bg-forest-green px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 transition-colors"
        >
          <span className="material-symbols-outlined text-[14px]">add</span>
          Add Row
        </button>
      </div>

      {/* Table */}
      {dataColumns.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-text-muted">
          No columns defined. Add columns from the Data Tables page.
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border-subtle bg-light-surface-alt/80 backdrop-blur-sm">
                {dataColumns.map(col => (
                  <th key={col} className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-text-muted whitespace-nowrap">{col}</th>
                ))}
                <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-text-muted w-16">Actions</th>
              </tr>
            </thead>
            <tbody>
              {showAddRow && (
                <tr className="border-b border-forest-green/20 bg-forest-green/5">
                  {dataColumns.map((col, i) => (
                    <td key={col} className="px-3 py-1.5">
                      <input
                        type="text"
                        placeholder={col}
                        value={newRowData[col] ?? ''}
                        onChange={(e) => setNewRowData({ ...newRowData, [col]: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddRow()}
                        className="w-full rounded border border-border-subtle px-2 py-1 text-sm focus:border-forest-green focus:outline-none"
                        autoFocus={i === 0}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-1.5">
                    <div className="flex gap-1">
                      <button onClick={handleAddRow} className="text-forest-green hover:text-green-700">
                        <span className="material-symbols-outlined text-[16px]">check</span>
                      </button>
                      <button onClick={() => setShowAddRow(false)} className="text-text-muted hover:text-red-600">
                        <span className="material-symbols-outlined text-[16px]">close</span>
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              {rows.map((row, i) => (
                <tr key={row.id} className={`border-b border-border-subtle ${i % 2 === 1 ? 'bg-light-surface-alt/30' : ''} hover:bg-forest-green/5`}>
                  {dataColumns.map(col => {
                    const val = String(row.data[col] ?? '')
                    const style = statusStyle[val]
                    const isEditing = editingCell?.rowId === row.id && editingCell?.col === col
                    return (
                      <td
                        key={col}
                        className="px-3 py-2 text-sm text-text-main cursor-pointer"
                        onDoubleClick={() => startCellEdit(row.id, col, val)}
                      >
                        {isEditing ? (
                          <input
                            ref={editInputRef}
                            type="text"
                            value={editCellValue}
                            onChange={(e) => setEditCellValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleCellEdit(row.id, col)
                              if (e.key === 'Escape') setEditingCell(null)
                            }}
                            onBlur={() => handleCellEdit(row.id, col)}
                            className="w-full rounded border border-forest-green px-1.5 py-0.5 text-sm focus:outline-none"
                          />
                        ) : style ? (
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${style}`}>{val}</span>
                        ) : val}
                      </td>
                    )
                  })}
                  <td className="px-3 py-2">
                    <button onClick={() => handleDeleteRow(row.id)} className="text-text-muted hover:text-red-600 opacity-0 group-hover:opacity-100">
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !showAddRow && (
                <tr>
                  <td colSpan={dataColumns.length + 1} className="px-3 py-8 text-center text-sm text-text-muted">
                    No rows yet. Click &quot;Add Row&quot; to start entering data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
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

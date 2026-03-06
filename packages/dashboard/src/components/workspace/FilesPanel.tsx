import { useState, useEffect, useCallback, useRef } from 'react'
import type { WorkspaceState, ViewerTab } from '@/pages/WorkspacePage'
import * as engine from '@/lib/engine'
import { FileContextMenu } from './FileContextMenu'
import { downloadTextFile, downloadAsZip, tableToCsv } from '@/lib/export-utils'

interface FlatFile {
  path: string
  name: string
  size: number
  modifiedAt: string
  createdBy?: string
  taskId?: string | null
}

interface TreeNode {
  path: string
  name: string
  isDirectory: boolean
  children: TreeNode[]
  size: number
  modifiedAt: string
  createdBy?: string
  taskId?: string | null
}

interface FilesPanelProps {
  workspace: WorkspaceState
  unreadFileIds?: Set<string>
}

/** Build a tree from flat file paths */
function buildTree(files: FlatFile[]): TreeNode[] {
  const root: TreeNode[] = []

  for (const file of files) {
    const parts = file.path.split('/')
    let current = root

    // Create intermediate directories
    for (let i = 0; i < parts.length - 1; i++) {
      const dirPath = parts.slice(0, i + 1).join('/')
      let dir = current.find(n => n.path === dirPath && n.isDirectory)
      if (!dir) {
        dir = {
          path: dirPath,
          name: parts[i],
          isDirectory: true,
          children: [],
          size: 0,
          modifiedAt: file.modifiedAt,
        }
        current.push(dir)
      }
      current = dir.children
    }

    // Add the file
    current.push({
      path: file.path,
      name: parts[parts.length - 1],
      isDirectory: false,
      children: [],
      size: file.size,
      modifiedAt: file.modifiedAt,
      createdBy: file.createdBy,
      taskId: file.taskId,
    })
  }

  // Sort each level: directories first (alphabetical), then files (alphabetical)
  function sortNodes(nodes: TreeNode[]) {
    nodes.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
    for (const n of nodes) {
      if (n.isDirectory) sortNodes(n.children)
    }
  }
  sortNodes(root)

  return root
}

export function FilesPanel({ workspace, unreadFileIds }: FilesPanelProps) {
  const [activePanel, setActivePanel] = useState<'files' | 'data'>('files')
  const [tree, setTree] = useState<TreeNode[]>([])
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('workspace-expanded-dirs')
    return saved ? new Set(JSON.parse(saved)) : new Set<string>()
  })
  const [search, setSearch] = useState('')
  const [allFiles, setAllFiles] = useState<FlatFile[]>([])

  // Data tables state
  const [tables, setTables] = useState<engine.SorTable[]>([])
  const [tablesLoading, setTablesLoading] = useState(false)

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string; isDir: boolean } | null>(null)

  // Inline rename state
  const [renamingPath, setRenamingPath] = useState<string | null>(null)

  const panelRef = useRef<HTMLDivElement>(null)

  const loadFiles = useCallback(async () => {
    try {
      const result = await engine.listFiles('', true)
      const files: FlatFile[] = result.map(f => ({
        path: f.path,
        name: f.name,
        size: f.size,
        modifiedAt: f.modifiedAt,
        createdBy: f.createdBy,
        taskId: f.taskId,
      }))
      setAllFiles(files)
      setTree(buildTree(files))
    } catch { /* offline */ }
  }, [])

  const loadTables = useCallback(async () => {
    setTablesLoading(true)
    try {
      const result = await engine.listSorTables()
      setTables(result)
    } catch { /* offline */ }
    setTablesLoading(false)
  }, [])

  useEffect(() => { loadFiles() }, [loadFiles])
  useEffect(() => { if (activePanel === 'data') loadTables() }, [activePanel, loadTables])

  // Persist expanded dirs
  useEffect(() => {
    localStorage.setItem('workspace-expanded-dirs', JSON.stringify([...expandedDirs]))
  }, [expandedDirs])

  // Auto-expand parent directories when a file is opened from another panel
  useEffect(() => {
    const filePath = workspace.activeFilePath
    if (!filePath) return
    const parts = filePath.split('/')
    if (parts.length <= 1) return
    setExpandedDirs(prev => {
      const next = new Set(prev)
      let path = ''
      for (let i = 0; i < parts.length - 1; i++) {
        path = path ? `${path}/${parts[i]}` : parts[i]
        next.add(path)
      }
      return next
    })
  }, [workspace.activeFilePath])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle when files panel is active and not in an input
      if (activePanel !== 'files') return
      if (renamingPath) return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      const activePath = workspace.activeFilePath
      if (!activePath) return

      const isFile = allFiles.some(f => f.path === activePath)
      if (!isFile) return

      if (e.key === 'F2') {
        e.preventDefault()
        setRenamingPath(activePath)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        handleDelete(activePath)
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        // Only copy path if focus is within the panel (not in code editor etc.)
        if (panelRef.current?.contains(target)) {
          e.preventDefault()
          handleCopyPath(activePath)
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [activePanel, workspace.activeFilePath, allFiles, renamingPath])

  const toggleDir = (dirPath: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev)
      if (next.has(dirPath)) next.delete(dirPath)
      else next.add(dirPath)
      return next
    })
  }

  const openFile = (path: string) => {
    const name = path.split('/').pop() ?? path
    const ext = name.split('.').pop()?.toLowerCase() ?? ''
    const icon = getFileIcon(ext)
    const tab: ViewerTab = {
      id: `file:${path}`,
      type: 'file',
      label: name,
      icon,
      resourceId: path,
    }
    workspace.addViewerTab(tab)
  }

  const openTable = (table: engine.SorTable) => {
    const tab: ViewerTab = {
      id: `data-table:${table.id}`,
      type: 'data-table',
      label: table.name,
      icon: 'table_chart',
      resourceId: table.id,
    }
    workspace.addViewerTab(tab)
  }

  const handleContextMenu = (e: React.MouseEvent, path: string, isDir: boolean) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, path, isDir })
  }

  const handleRename = async (oldPath: string, newName: string) => {
    const parts = oldPath.split('/')
    parts[parts.length - 1] = newName
    const newPath = parts.join('/')
    if (newPath === oldPath) {
      setRenamingPath(null)
      return
    }
    try {
      await engine.renameFile(oldPath, newPath)
      // Update any open viewer tab pointing to the old path
      const tab = workspace.viewerTabs.find(t => t.type === 'file' && t.resourceId === oldPath)
      if (tab) workspace.updateViewerTab(tab.id, { label: newName, resourceId: newPath })
      await loadFiles()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to rename file')
    }
    setRenamingPath(null)
  }

  const handleDelete = async (path: string) => {
    const name = path.split('/').pop() ?? path
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    try {
      await engine.deleteFile(path)
      // Close any open viewer tab for this file
      const tab = workspace.viewerTabs.find(t => t.type === 'file' && t.resourceId === path)
      if (tab) workspace.closeViewerTab(tab.id)
      await loadFiles()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete file')
    }
  }

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path)
  }

  const handleDownloadFile = async (path: string) => {
    try {
      const res = await engine.readFile(path)
      const name = path.split('/').pop() ?? path
      downloadTextFile(name, res.content)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to download file')
    }
  }

  const handleDownloadDirZip = async (dirPath: string) => {
    try {
      const dirFiles = allFiles.filter(f => f.path.startsWith(dirPath + '/'))
      if (dirFiles.length === 0) return
      const contents = await Promise.all(
        dirFiles.map(async (f) => {
          const res = await engine.readFile(f.path)
          // Strip the directory prefix so paths are relative inside the ZIP
          const relativePath = f.path.slice(dirPath.length + 1)
          return { path: relativePath, content: res.content }
        }),
      )
      const dirName = dirPath.split('/').pop() ?? dirPath
      await downloadAsZip(contents, `${dirName}.zip`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to download directory')
    }
  }

  const [exporting, setExporting] = useState(false)

  const handleExportAllFiles = async () => {
    if (allFiles.length === 0) return
    setExporting(true)
    try {
      const contents = await Promise.all(
        allFiles.map(async (f) => {
          const res = await engine.readFile(f.path)
          return { path: f.path, content: res.content }
        }),
      )
      await downloadAsZip(contents, 'workspace-files.zip')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to export files')
    }
    setExporting(false)
  }

  const handleExportAllTables = async (format: 'csv' | 'json') => {
    if (tables.length === 0) return
    setExporting(true)
    try {
      const allTableData = await Promise.all(
        tables.map(async (t) => {
          const rows = await engine.listSorRows(t.id)
          const columns = t.columns.sort((a, b) => a.position - b.position).map(c => c.name)
          return { table: t, columns, rows }
        }),
      )
      if (format === 'json') {
        const combined = allTableData.map(({ table, columns, rows }) => ({
          table: table.name,
          columns,
          rows: rows.map(r => r.data),
        }))
        downloadTextFile('tables.json', JSON.stringify(combined, null, 2), 'application/json')
      } else {
        const files = allTableData.map(({ table, columns, rows }) => ({
          path: `${table.name}.csv`,
          content: tableToCsv(columns, rows.map(r => r.data)),
        }))
        await downloadAsZip(files, 'tables.zip')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to export tables')
    }
    setExporting(false)
  }

  // Search: filter flat file list
  const searchResults = search
    ? allFiles.filter(f => f.path.toLowerCase().includes(search.toLowerCase()))
    : null

  // Search: filter tables
  const filteredTables = search
    ? tables.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    : tables

  return (
    <div ref={panelRef} className="flex flex-col h-full">
      {/* Files / Data tab header — single line */}
      <div className="flex items-center gap-1 px-2 py-2 border-b border-border-subtle shrink-0">
        <button
          onClick={() => setActivePanel('files')}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
            activePanel === 'files'
              ? 'bg-forest-green/10 text-forest-green'
              : 'text-text-muted hover:bg-light-surface-alt hover:text-text-main'
          }`}
        >
          <span className="material-symbols-outlined text-[14px]">folder_open</span>
          Files
          {unreadFileIds && unreadFileIds.size > 0 && activePanel === 'files' && (
            <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-forest-green px-1 text-[9px] font-bold text-white">
              {unreadFileIds.size}
            </span>
          )}
        </button>
        <button
          onClick={() => setActivePanel('data')}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
            activePanel === 'data'
              ? 'bg-forest-green/10 text-forest-green'
              : 'text-text-muted hover:bg-light-surface-alt hover:text-text-main'
          }`}
        >
          <span className="material-symbols-outlined text-[14px]">table_chart</span>
          Data
        </button>
      </div>

      {/* Search */}
      <div className="px-2 py-1.5 shrink-0">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={activePanel === 'files' ? 'Search files...' : 'Search tables...'}
          className="w-full rounded-lg border border-border-subtle px-2.5 py-1.5 text-xs focus:border-forest-green focus:outline-none"
        />
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-1">
        {activePanel === 'files' ? (
          // FILES panel
          searchResults ? (
            <>
              {searchResults.length === 0 && (
                <p className="px-3 py-6 text-center text-xs text-text-muted">No files match your search</p>
              )}
              {searchResults.map(file => (
                <button
                  key={file.path}
                  onClick={() => openFile(file.path)}
                  onContextMenu={(e) => handleContextMenu(e, file.path, false)}
                  className="group flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-light-surface-alt"
                >
                  <span className="material-symbols-outlined text-[16px] text-text-muted shrink-0">
                    {getFileIcon(file.name.split('.').pop()?.toLowerCase() ?? '')}
                  </span>
                  <span className="flex-1 truncate text-text-main">{file.path}</span>
                  <span className="text-[10px] text-text-muted shrink-0">{formatSize(file.size)}</span>
                </button>
              ))}
            </>
          ) : (
            <>
              {tree.length === 0 && (
                <p className="px-3 py-6 text-center text-xs text-text-muted">No files yet</p>
              )}
              {tree.map(node => (
                <TreeNodeRow
                  key={node.path}
                  node={node}
                  level={0}
                  expandedDirs={expandedDirs}
                  toggleDir={toggleDir}
                  openFile={openFile}
                  unreadFileIds={unreadFileIds}
                  activeFilePath={workspace.activeFilePath}
                  onContextMenu={handleContextMenu}
                  renamingPath={renamingPath}
                  onRenameSubmit={handleRename}
                  onRenameCancel={() => setRenamingPath(null)}
                />
              ))}
            </>
          )
        ) : (
          // DATA panel
          tablesLoading ? (
            <p className="px-3 py-6 text-center text-xs text-text-muted">Loading tables...</p>
          ) : filteredTables.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-text-muted">
              {search ? 'No tables match your search' : 'No data tables yet'}
            </p>
          ) : (
            filteredTables.map(table => {
              const isActive = workspace.viewerTabs.some(t => t.type === 'data-table' && t.resourceId === table.id && t.id === workspace.activeTabId)
              return (
                <button
                  key={table.id}
                  onClick={() => openTable(table)}
                  className={`group flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                    isActive ? 'bg-forest-green/10 text-forest-green' : 'hover:bg-light-surface-alt'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px] text-text-muted shrink-0">table_chart</span>
                  <span className="flex-1 truncate text-text-main">{table.name}</span>
                  <span className="text-[10px] text-text-muted shrink-0">{table.rowCount} row{table.rowCount !== 1 ? 's' : ''}</span>
                </button>
              )
            })
          )
        )}
      </div>

      {/* Export footer */}
      <div className="border-t border-border-subtle px-2 py-1.5 shrink-0">
        {activePanel === 'files' ? (
          <button
            onClick={handleExportAllFiles}
            disabled={allFiles.length === 0 || exporting}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-medium text-text-main hover:bg-light-surface-alt transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[14px]">download</span>
            {exporting ? 'Exporting...' : `Export ${allFiles.length} file${allFiles.length !== 1 ? 's' : ''}`}
          </button>
        ) : (
          <ExportTablesDropdown
            tableCount={tables.length}
            exporting={exporting}
            onExport={handleExportAllTables}
          />
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          filePath={contextMenu.path}
          isDirectory={contextMenu.isDir}
          onClose={() => setContextMenu(null)}
          onRename={(path) => setRenamingPath(path)}
          onDelete={handleDelete}
          onCopyPath={handleCopyPath}
          onOpenInTab={openFile}
          onDownload={handleDownloadFile}
          onDownloadZip={handleDownloadDirZip}
        />
      )}
    </div>
  )
}

function TreeNodeRow({
  node,
  level,
  expandedDirs,
  toggleDir,
  openFile,
  unreadFileIds,
  activeFilePath,
  onContextMenu,
  renamingPath,
  onRenameSubmit,
  onRenameCancel,
}: {
  node: TreeNode
  level: number
  expandedDirs: Set<string>
  toggleDir: (path: string) => void
  openFile: (path: string) => void
  unreadFileIds?: Set<string>
  activeFilePath?: string | null
  onContextMenu: (e: React.MouseEvent, path: string, isDir: boolean) => void
  renamingPath: string | null
  onRenameSubmit: (oldPath: string, newName: string) => void
  onRenameCancel: () => void
}) {
  const isExpanded = expandedDirs.has(node.path)
  const isUnread = !node.isDirectory && unreadFileIds?.has(node.path)
  const isActive = !node.isDirectory && node.path === activeFilePath
  const isRenaming = node.path === renamingPath

  return (
    <>
      {isRenaming ? (
        <InlineRenameRow
          node={node}
          level={level}
          isExpanded={isExpanded}
          onSubmit={(newName) => onRenameSubmit(node.path, newName)}
          onCancel={onRenameCancel}
        />
      ) : (
        <button
          onClick={() => node.isDirectory ? toggleDir(node.path) : openFile(node.path)}
          onContextMenu={(e) => onContextMenu(e, node.path, node.isDirectory)}
          className={`group flex w-full items-center gap-1.5 rounded-lg py-1 pr-2 text-left text-xs transition-colors ${
            isActive
              ? 'bg-forest-green/10 text-forest-green'
              : 'hover:bg-light-surface-alt'
          }`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
        >
          {/* Expand/collapse chevron for dirs */}
          {node.isDirectory ? (
            <span className="material-symbols-outlined text-[16px] text-text-muted shrink-0 transition-transform" style={{ transform: isExpanded ? 'rotate(90deg)' : undefined }}>
              chevron_right
            </span>
          ) : (
            <span className="w-4 shrink-0" /> // spacer for alignment
          )}

          {/* Icon */}
          <span className="material-symbols-outlined text-[16px] text-text-muted shrink-0">
            {node.isDirectory
              ? (isExpanded ? 'folder_open' : 'folder')
              : getFileIcon(node.name.split('.').pop()?.toLowerCase() ?? '')}
          </span>

          {/* Unread dot */}
          {isUnread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />}

          {/* Name */}
          <span className={`flex-1 truncate ${isUnread ? 'font-semibold text-text-main' : 'text-text-main'}`}>
            {node.name}
          </span>

          {/* File size (files only) */}
          {!node.isDirectory && (
            <span className="text-[10px] text-text-muted shrink-0 opacity-0 group-hover:opacity-100">
              {formatSize(node.size)}
            </span>
          )}
        </button>
      )}

      {/* Children (if expanded) */}
      {node.isDirectory && isExpanded && node.children.map(child => (
        <TreeNodeRow
          key={child.path}
          node={child}
          level={level + 1}
          expandedDirs={expandedDirs}
          toggleDir={toggleDir}
          openFile={openFile}
          unreadFileIds={unreadFileIds}
          activeFilePath={activeFilePath}
          onContextMenu={onContextMenu}
          renamingPath={renamingPath}
          onRenameSubmit={onRenameSubmit}
          onRenameCancel={onRenameCancel}
        />
      ))}
    </>
  )
}

function InlineRenameRow({
  node,
  level,
  isExpanded,
  onSubmit,
  onCancel,
}: {
  node: TreeNode
  level: number
  isExpanded: boolean
  onSubmit: (newName: string) => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(node.name)

  useEffect(() => {
    if (!inputRef.current) return
    inputRef.current.focus()
    // Select just the filename without extension for files
    if (!node.isDirectory) {
      const dotIdx = node.name.lastIndexOf('.')
      if (dotIdx > 0) {
        inputRef.current.setSelectionRange(0, dotIdx)
      } else {
        inputRef.current.select()
      }
    } else {
      inputRef.current.select()
    }
  }, [node.name, node.isDirectory])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (value.trim() && value !== node.name) {
        onSubmit(value.trim())
      } else {
        onCancel()
      }
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <div
      className="flex w-full items-center gap-1.5 rounded-lg py-0.5 pr-2"
      style={{ paddingLeft: `${level * 16 + 8}px` }}
    >
      {node.isDirectory ? (
        <span className="material-symbols-outlined text-[16px] text-text-muted shrink-0 transition-transform" style={{ transform: isExpanded ? 'rotate(90deg)' : undefined }}>
          chevron_right
        </span>
      ) : (
        <span className="w-4 shrink-0" />
      )}
      <span className="material-symbols-outlined text-[16px] text-text-muted shrink-0">
        {node.isDirectory
          ? (isExpanded ? 'folder_open' : 'folder')
          : getFileIcon(node.name.split('.').pop()?.toLowerCase() ?? '')}
      </span>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={onCancel}
        className="flex-1 rounded border border-forest-green bg-white px-1 py-0.5 text-xs text-text-main outline-none"
      />
    </div>
  )
}

function getFileIcon(ext: string): string {
  switch (ext) {
    case 'md': return 'description'
    case 'pdf': return 'picture_as_pdf'
    case 'csv': return 'table_chart'
    case 'jpg': case 'jpeg': case 'png': case 'gif': case 'webp': case 'svg': return 'image'
    case 'json': return 'data_object'
    case 'ts': case 'js': case 'tsx': case 'jsx': return 'code'
    default: return 'draft'
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function ExportTablesDropdown({
  tableCount,
  exporting,
  onExport,
}: {
  tableCount: number
  exporting: boolean
  onExport: (format: 'csv' | 'json') => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={tableCount === 0 || exporting}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-medium text-text-main hover:bg-light-surface-alt transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <span className="material-symbols-outlined text-[14px]">download</span>
        {exporting ? 'Exporting...' : `Export ${tableCount} table${tableCount !== 1 ? 's' : ''}`}
        <span className="material-symbols-outlined text-[12px] ml-auto">expand_more</span>
      </button>
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-border-subtle bg-white shadow-lg py-1 z-50">
          <button
            onClick={() => { setOpen(false); onExport('csv') }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text-main hover:bg-light-surface-alt transition-colors"
          >
            <span className="material-symbols-outlined text-[14px] text-text-muted">table_chart</span>
            Export as CSV (ZIP)
          </button>
          <button
            onClick={() => { setOpen(false); onExport('json') }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text-main hover:bg-light-surface-alt transition-colors"
          >
            <span className="material-symbols-outlined text-[14px] text-text-muted">data_object</span>
            Export as JSON
          </button>
        </div>
      )}
    </div>
  )
}

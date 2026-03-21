import { useState, useEffect, useCallback, useRef } from 'react'
import type { WorkspaceState, ViewerTab } from '@/pages/WorkspacePage'
import * as engine from '@/lib/engine'
import { FileContextMenu } from './FileContextMenu'
import { downloadTextFile, downloadBinaryFile, downloadAsZip, tableToCsv } from '@/lib/export-utils'

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
  onMarkFileRead?: (path: string) => void
  onMarkAllFilesRead?: () => void
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

export function FilesPanel({ workspace, unreadFileIds, onMarkFileRead, onMarkAllFilesRead }: FilesPanelProps) {
  const [activePanel, setActivePanel] = useState<'files' | 'data'>('files')
  const [tree, setTree] = useState<TreeNode[]>([])
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('workspace-expanded-dirs')
    return saved ? new Set(JSON.parse(saved)) : new Set<string>()
  })
  const [search, setSearch] = useState('')

  // Browser sessions state
  const [browserSessions, setBrowserSessions] = useState<Array<{ id: string; currentUrl: string; mode: string; createdAt: string }>>([])
  const [browserExpanded, setBrowserExpanded] = useState(true)
  const [creatingBrowser, setCreatingBrowser] = useState(false)
  const [vaultSessions, setVaultSessions] = useState<engine.VaultSessionInfo[]>([])

  // Section expand/collapse + resizable heights (persisted to localStorage)
  const [sandboxExpanded, setSandboxExpanded] = useState(false)
  const [browserHeight, setBrowserHeight] = useState(() => {
    const saved = localStorage.getItem('workspace-browser-height')
    return saved ? Number(saved) : 160
  })
  const [sandboxHeight, setSandboxHeight] = useState(() => {
    const saved = localStorage.getItem('workspace-sandbox-height')
    return saved ? Number(saved) : 192
  })

  const handleBrowserResize = useCallback((delta: number) => {
    setBrowserHeight(h => {
      const next = Math.max(60, Math.min(400, h + delta))
      localStorage.setItem('workspace-browser-height', String(next))
      return next
    })
  }, [])

  const handleSandboxResize = useCallback((delta: number) => {
    setSandboxHeight(h => {
      const next = Math.max(60, Math.min(400, h + delta))
      localStorage.setItem('workspace-sandbox-height', String(next))
      return next
    })
  }, [])

  const loadBrowserSessions = useCallback(async () => {
    try {
      const [active, vault] = await Promise.all([
        engine.listBrowserSessions(),
        engine.listVaultSessions(),
      ])
      setBrowserSessions(active)
      setVaultSessions(vault)
    } catch { /* offline */ }
  }, [])

  useEffect(() => { loadBrowserSessions() }, [loadBrowserSessions])
  // Refresh browser sessions periodically
  useEffect(() => {
    const interval = setInterval(loadBrowserSessions, 10000)
    return () => clearInterval(interval)
  }, [loadBrowserSessions])

  const handleNewBrowser = useCallback(async () => {
    setCreatingBrowser(true)
    try {
      const result = await engine.createBrowserSession()
      workspace.addViewerTab({
        id: `browser:${result.sessionId}`,
        type: 'browser',
        label: 'Browser',
        icon: 'language',
        resourceId: result.sessionId,
      })
      loadBrowserSessions()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create browser session')
    }
    setCreatingBrowser(false)
  }, [workspace, loadBrowserSessions])

  const openBrowserSession = useCallback((sessionId: string, url: string) => {
    const domain = url ? (() => { try { return new URL(url).hostname } catch { return 'Browser' } })() : 'Browser'
    workspace.addViewerTab({
      id: `browser:${sessionId}`,
      type: 'browser',
      label: domain,
      icon: 'language',
      resourceId: sessionId,
    })
  }, [workspace])

  const openVaultSession = useCallback(async (vaultSessionId: string, label: string) => {
    setCreatingBrowser(true)
    try {
      const result = await engine.createBrowserSession({ vaultSessionId })
      workspace.addViewerTab({
        id: `browser:${result.sessionId}`,
        type: 'browser',
        label,
        icon: 'language',
        resourceId: result.sessionId,
      })
      loadBrowserSessions()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to open session')
    }
    setCreatingBrowser(false)
  }, [workspace, loadBrowserSessions])
  const [allFiles, setAllFiles] = useState<FlatFile[]>([])

  // Data tables state
  const [tables, setTables] = useState<engine.SorTable[]>([])
  const [tablesLoading, setTablesLoading] = useState(false)

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string; isDir: boolean } | null>(null)

  // Inline rename state
  const [renamingPath, setRenamingPath] = useState<string | null>(null)

  // Upload state
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Drag-and-drop file move state
  const [dragOverDir, setDragOverDir] = useState<string | null>(null)
  const [movingFile, setMovingFile] = useState(false)

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

  const handleMoveFile = useCallback(async (sourcePath: string, targetDirPath: string) => {
    const fileName = sourcePath.split('/').pop() ?? sourcePath
    const newPath = targetDirPath ? `${targetDirPath}/${fileName}` : fileName
    if (newPath === sourcePath) return
    if (isChildPath(targetDirPath, sourcePath)) return
    setMovingFile(true)
    try {
      await engine.renameFile(sourcePath, newPath)
      const tab = workspace.viewerTabs.find(t => t.type === 'file' && t.resourceId === sourcePath)
      if (tab) workspace.updateViewerTab(tab.id, { label: fileName, resourceId: newPath })
      await loadFiles()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to move file')
    }
    setMovingFile(false)
  }, [workspace, loadFiles])

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
    // Always mark file as read when opened (even if not in unreadFileIds — covers race conditions)
    onMarkFileRead?.(path)
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
      const ext = name.split('.').pop()?.toLowerCase() ?? ''
      const BINARY_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'glb', 'gltf', 'pdf', 'mp3', 'wav', 'ogg'])
      if (res.binary && BINARY_EXTS.has(ext)) {
        const mimeMap: Record<string, string> = {
          jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
          webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm', pdf: 'application/pdf',
          glb: 'model/gltf-binary', gltf: 'model/gltf+json', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
        }
        const bytes = Uint8Array.from(atob(res.content), c => c.charCodeAt(0))
        downloadBinaryFile(name, bytes.buffer, mimeMap[ext] ?? 'application/octet-stream')
      } else {
        downloadTextFile(name, res.content)
      }
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

  const handleUploadFiles = async (files: FileList | File[]) => {
    if (uploading) return
    setUploading(true)
    let importedCsv = false
    try {
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) {
          alert(`"${file.name}" exceeds the 10MB limit`)
          continue
        }
        const result = await engine.uploadWorkspaceFile(file)
        if (result.importedAsTable) importedCsv = true
      }
      if (importedCsv) {
        setActivePanel('data')
        await loadTables()
      } else {
        await loadFiles()
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed')
    }
    setUploading(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      handleUploadFiles(e.dataTransfer.files)
    }
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
    <div
      ref={panelRef}
      data-testid="files-panel"
      className={`flex flex-col h-full ${dragOver ? 'ring-2 ring-inset ring-forest-green/40' : ''}`}
      onDragOver={(e) => { e.preventDefault(); if (activePanel === 'files') setDragOver(true) }}
      onDragLeave={(e) => { if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false) }}
      onDrop={activePanel === 'files' ? handleDrop : undefined}
    >
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
            <>
              <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-forest-green px-1 text-[9px] font-bold text-white">
                {unreadFileIds.size}
              </span>
              {onMarkAllFilesRead && (
                <button
                  onClick={(e) => { e.stopPropagation(); onMarkAllFilesRead() }}
                  className="ml-0.5 flex items-center rounded p-0.5 text-text-muted hover:bg-forest-green/10 hover:text-forest-green"
                  title="Mark all files as read"
                >
                  <span className="material-symbols-outlined text-[12px]">done_all</span>
                </button>
              )}
            </>
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
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files?.length) handleUploadFiles(e.target.files); e.target.value = '' }}
        />
      </div>

      {/* Search row */}
      <div className="flex items-center gap-1 px-1 py-1.5 shrink-0">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={activePanel === 'files' ? 'Search files...' : 'Search tables...'}
          className="flex-1 rounded-lg border border-border-subtle px-2.5 py-1.5 text-xs focus:border-forest-green focus:outline-none"
        />
      </div>

      {/* Content area */}
      <div
        className={`flex-1 overflow-y-auto px-1 relative ${dragOver ? 'bg-forest-green/5' : ''}`}
      >
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
                <div className="px-3 py-6 text-center text-xs text-text-muted">
                  <span className="material-symbols-outlined text-2xl mb-1 block text-text-muted/40">upload_file</span>
                  <p>No files yet</p>
                  <p className="mt-1 text-[10px]">Drop files here or click upload</p>
                </div>
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
                  dragOverDir={dragOverDir}
                  setDragOverDir={setDragOverDir}
                  onMoveFile={handleMoveFile}
                  movingFile={movingFile}
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

      {/* Upload + Export footer */}
      <div className="border-t border-border-subtle px-2 py-1.5 shrink-0 flex flex-col gap-1.5">
        {activePanel === 'files' && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-forest-green/30 bg-forest-green/5 px-3 py-1.5 text-xs font-medium text-forest-green hover:bg-forest-green/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[14px]">{uploading ? 'hourglass_top' : 'upload_file'}</span>
            {uploading ? 'Uploading...' : 'Upload Files'}
          </button>
        )}
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

      {/* Draggable divider: Files ↔ Browser */}
      <DragDivider
        collapsed={!browserExpanded}
        onHeightChange={handleBrowserResize}
      />

      {/* Browser Sessions Section */}
      <div className="shrink-0 flex flex-col" style={{ height: browserExpanded ? browserHeight : undefined }}>
        <button
          onClick={() => setBrowserExpanded(!browserExpanded)}
          className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-semibold text-text-muted hover:bg-light-surface-alt transition-colors shrink-0"
        >
          <span className="material-symbols-outlined text-[14px] transition-transform" style={{ transform: browserExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
            chevron_right
          </span>
          <span className="material-symbols-outlined text-[14px]">language</span>
          Browser
          {browserSessions.length > 0 && (
            <span className="ml-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-100 px-1 text-[9px] font-bold text-blue-700">
              {browserSessions.length}
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); handleNewBrowser() }}
            disabled={creatingBrowser}
            className="ml-auto flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-forest-green hover:bg-forest-green/10 disabled:opacity-40"
            title="New browser session"
          >
            <span className="material-symbols-outlined text-[12px]">add</span>
          </button>
        </button>
        {browserExpanded && (
          <div className="px-2 pb-2 overflow-y-auto flex-1 min-h-0">
            {browserSessions.length === 0 && vaultSessions.length === 0 && (
              <p className="px-2 py-2 text-center text-[10px] text-text-muted">No active sessions</p>
            )}
            {/* Active sessions */}
            {browserSessions.map(session => {
              const domain = (() => { try { return new URL(session.currentUrl).hostname } catch { return 'about:blank' } })()
              return (
                <button
                  key={session.id}
                  onClick={() => openBrowserSession(session.id, session.currentUrl)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-xs text-text-main hover:bg-light-surface-alt transition-colors"
                >
                  <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                  <span className="truncate flex-1 text-left">{domain}</span>
                  <span className="text-[10px] text-text-muted">{session.mode === 'agent_browser' ? 'Agent' : 'Live'}</span>
                </button>
              )
            })}
            {/* Saved vault sessions */}
            {vaultSessions.filter(v => v.status === 'active').slice(0, 5).map(vault => (
              <button
                key={vault.id}
                onClick={() => openVaultSession(vault.id, vault.serviceLabel)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-xs text-text-muted hover:bg-light-surface-alt transition-colors"
              >
                <span className="material-symbols-outlined text-[12px]">security</span>
                <span className="truncate flex-1 text-left">{vault.serviceLabel}</span>
                <span className="text-[10px]">{vault.domain}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Draggable divider: Browser ↔ Sandbox */}
      <DragDivider
        collapsed={!sandboxExpanded}
        onHeightChange={handleSandboxResize}
      />

      {/* Sandbox Section */}
      <SandboxSection workspace={workspace} height={sandboxHeight} expanded={sandboxExpanded} setExpanded={setSandboxExpanded} />

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
  dragOverDir,
  setDragOverDir,
  onMoveFile,
  movingFile,
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
  dragOverDir: string | null
  setDragOverDir: (path: string | null) => void
  onMoveFile: (sourcePath: string, targetDirPath: string) => void
  movingFile: boolean
}) {
  const isExpanded = expandedDirs.has(node.path)
  const isUnread = !node.isDirectory && unreadFileIds?.has(node.path)
  const isActive = !node.isDirectory && node.path === activeFilePath
  const isRenaming = node.path === renamingPath
  const isRecent = node.isDirectory ? hasRecentChild(node) : isRecentlyModified(node.modifiedAt)
  const isDragTarget = node.isDirectory && dragOverDir === node.path

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
          draggable={!movingFile}
          onDragStart={(e) => {
            e.dataTransfer.setData('application/yokebot-file', JSON.stringify({
              path: node.path,
              name: node.name,
              isDirectory: node.isDirectory,
            }))
            e.dataTransfer.setData('text/plain', node.path)
            e.dataTransfer.effectAllowed = 'copyMove'
            // Visual drag feedback
            if (e.currentTarget instanceof HTMLElement) {
              e.currentTarget.style.opacity = '0.5'
              requestAnimationFrame(() => {
                if (e.currentTarget instanceof HTMLElement) {
                  e.currentTarget.style.opacity = ''
                }
              })
            }
          }}
          onDragOver={(e) => {
            if (!node.isDirectory) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            setDragOverDir(node.path)
          }}
          onDragLeave={() => {
            if (dragOverDir === node.path) setDragOverDir(null)
          }}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setDragOverDir(null)
            if (!node.isDirectory) return
            const sourcePath = e.dataTransfer.getData('text/plain')
            if (sourcePath) onMoveFile(sourcePath, node.path)
          }}
          className={`group flex w-full items-center gap-1.5 rounded-lg py-1 pr-2 text-left text-xs transition-colors ${
            isDragTarget
              ? 'bg-blue-50 ring-1 ring-blue-400'
              : isActive
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
          {isUnread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />}

          {/* Recently modified dot (only if not already showing unread) */}
          {isRecent && !isUnread && (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" title={`Modified ${formatRelativeTime(node.modifiedAt)}`} />
          )}

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

          {/* Relative time (files only, on hover) */}
          {!node.isDirectory && isRecent && (
            <span className="text-[10px] text-amber-500 shrink-0 opacity-0 group-hover:opacity-100 ml-0.5">
              {formatRelativeTime(node.modifiedAt)}
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
          dragOverDir={dragOverDir}
          setDragOverDir={setDragOverDir}
          onMoveFile={onMoveFile}
          movingFile={movingFile}
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

function isRecentlyModified(modifiedAt: string): boolean {
  return Date.now() - new Date(modifiedAt).getTime() < 24 * 60 * 60 * 1000
}

function formatRelativeTime(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/** Check if any descendant of a directory was recently modified */
function hasRecentChild(node: TreeNode): boolean {
  if (!node.isDirectory) return isRecentlyModified(node.modifiedAt)
  return node.children.some(child => child.isDirectory ? hasRecentChild(child) : isRecentlyModified(child.modifiedAt))
}

/** Check if a path is a child (or self) of another path */
function isChildPath(childPath: string, parentPath: string): boolean {
  return childPath === parentPath || childPath.startsWith(parentPath + '/')
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

// ---- Sandbox file explorer section ----

/** Draggable horizontal divider for resizing sections vertically. */
function DragDivider({ onHeightChange, collapsed }: {
  onHeightChange: (delta: number) => void
  collapsed?: boolean
}) {
  const dragging = useRef(false)
  const lastY = useRef(0)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    lastY.current = e.clientY
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = lastY.current - e.clientY // negative = drag down = grow section below
      lastY.current = e.clientY
      onHeightChange(delta)
    }
    const onMouseUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [onHeightChange])

  if (collapsed) return <div className="border-t border-border-subtle" />

  return (
    <div
      onMouseDown={onMouseDown}
      className="group relative z-10 h-1.5 shrink-0 cursor-row-resize border-t border-border-subtle hover:bg-forest-green/20 active:bg-forest-green/40 transition-colors"
    >
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-0.5 w-8 rounded-full bg-border-subtle group-hover:bg-forest-green/50 transition-colors" />
    </div>
  )
}

function SandboxSection({ workspace, height, expanded, setExpanded }: {
  workspace: WorkspaceState
  height: number
  expanded: boolean
  setExpanded: (v: boolean) => void
}) {
  const [status, setStatus] = useState<engine.SandboxStatus | null>(null)
  const [files, setFiles] = useState<engine.SandboxFileEntry[]>([])
  const [currentDir, setCurrentDir] = useState('/')
  const [loading, setLoading] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [projects, setProjects] = useState<engine.SandboxProject[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)

  // Fetch sandbox status + projects on expand
  useEffect(() => {
    if (!expanded) return
    engine.getSandboxStatus().then(setStatus).catch(() => {})
    engine.listSandboxProjects().then(p => {
      setProjects(p)
      // Auto-select first project if none selected
      if (p.length > 0 && !activeProjectId) setActiveProjectId(p[0].id)
    }).catch(() => {})
  }, [expanded])

  const activeProject = projects.find(p => p.id === activeProjectId)

  // Fetch files when expanded and sandbox is running
  useEffect(() => {
    if (!expanded || status?.status !== 'running') return
    setLoading(true)
    // If we have an active project, browse its directory
    const dir = activeProject ? `${activeProject.directory}${currentDir === '/' ? '' : currentDir}` : currentDir
    engine.listSandboxFiles(dir)
      .then(setFiles)
      .catch(() => setFiles([]))
      .finally(() => setLoading(false))
  }, [expanded, status?.status, currentDir, activeProjectId])

  const openPreview = useCallback(() => {
    const projId = activeProject?.id ?? 'default'
    workspace.addViewerTab({
      id: `sandbox-preview:${projId}`,
      type: 'sandbox-preview' as import('@/pages/WorkspacePage').ViewerTabType,
      label: activeProject ? activeProject.name : 'Preview',
      icon: 'preview',
      resourceId: projId,
    })
  }, [workspace, status, activeProject])

  const openSandboxFile = useCallback((entry: engine.SandboxFileEntry) => {
    if (entry.isDirectory) {
      setCurrentDir(entry.path)
    } else {
      workspace.addViewerTab({
        id: `sandbox-file:${entry.path}`,
        type: 'file' as import('@/pages/WorkspacePage').ViewerTabType,
        label: entry.name,
        icon: 'code',
        resourceId: `__sandbox__${entry.path}`,
      })
    }
  }, [workspace])

  const handleImport = useCallback(async () => {
    if (!importUrl.trim()) return
    setImporting(true)
    setImportError(null)
    try {
      const result = await engine.importProject(importUrl.trim())
      setShowImport(false)
      setImportUrl('')
      // Refresh status + projects
      engine.getSandboxStatus().then(setStatus).catch(() => {})
      engine.listSandboxProjects().then(p => {
        setProjects(p)
        if (p.length > 0) setActiveProjectId(p[p.length - 1].id) // select newest
      }).catch(() => {})
      if (result.previewUrl) openPreview()
    } catch (err) {
      setImportError((err as Error).message)
    } finally {
      setImporting(false)
    }
  }, [importUrl, openPreview])

  // Refresh projects when sandbox status changes (agent may have created one)
  useEffect(() => {
    if (status?.status === 'running') {
      const interval = setInterval(() => {
        engine.listSandboxProjects().then(p => {
          setProjects(prev => {
            if (p.length !== prev.length) {
              if (p.length > 0 && !activeProjectId) setActiveProjectId(p[0].id)
              return p
            }
            return prev
          })
        }).catch(() => {})
      }, 10000)
      return () => clearInterval(interval)
    }
  }, [status?.status])

  return (
    <div className="shrink-0 flex flex-col" style={{ height: expanded ? height : undefined }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-semibold text-text-muted hover:bg-light-surface-alt transition-colors shrink-0"
      >
        <span className="material-symbols-outlined text-[14px] transition-transform" style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
          chevron_right
        </span>
        <span className="material-symbols-outlined text-[14px]">deployed_code</span>
        Sandbox
        {projects.length > 0 && (
          <span className="ml-0.5 text-[10px] text-text-muted font-normal">({projects.length} project{projects.length !== 1 ? 's' : ''})</span>
        )}
        {status?.status === 'running' && (
          <span className="ml-1 h-2 w-2 rounded-full bg-green-500" />
        )}
      </button>

      {expanded && (
        <div className="px-2 pb-2 overflow-y-auto flex-1 min-h-0">
          {/* Project tabs — shown when multiple projects exist */}
          {projects.length > 1 && (
            <div className="flex gap-0.5 px-1 py-1 overflow-x-auto">
              {projects.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setActiveProjectId(p.id); setCurrentDir('/') }}
                  className={`shrink-0 flex items-center gap-1 rounded-md px-2 py-1 text-[10px] transition-colors ${
                    p.id === activeProjectId
                      ? 'bg-forest-green/10 text-forest-green font-semibold border border-forest-green/20'
                      : 'text-text-muted hover:bg-light-surface-alt border border-transparent'
                  }`}
                >
                  <span className="material-symbols-outlined text-[12px]">folder_special</span>
                  {p.name}
                </button>
              ))}
            </div>
          )}

          {/* Single project header */}
          {projects.length === 1 && (
            <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-text-muted">
              <span className="material-symbols-outlined text-[12px] text-forest-green">folder_special</span>
              <span className="font-medium text-text-main">{projects[0].name}</span>
              {projects[0].framework && (
                <span className="rounded bg-forest-green/10 px-1 py-0.5 text-[9px] text-forest-green">{projects[0].framework}</span>
              )}
            </div>
          )}

          {/* Import Project button */}
          <div className="px-2 py-1">
            {!showImport ? (
              <button
                onClick={() => setShowImport(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-forest-green bg-forest-green/5 hover:bg-forest-green/10 border border-forest-green/20 transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">download</span>
                Import Project
              </button>
            ) : (
              <div className="space-y-1.5">
                <input
                  type="text"
                  value={importUrl}
                  onChange={e => setImportUrl(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleImport(); if (e.key === 'Escape') setShowImport(false) }}
                  placeholder="https://github.com/user/repo"
                  className="w-full px-2 py-1.5 rounded border border-border-subtle bg-light-surface text-[11px] text-text-main font-mono placeholder:text-text-muted/50 focus:outline-none focus:ring-1 focus:ring-forest-green"
                  autoFocus
                />
                {importError && (
                  <div className="text-[10px] text-red-400 bg-red-400/10 rounded px-2 py-1">{importError}</div>
                )}
                <div className="flex gap-1">
                  <button
                    onClick={handleImport}
                    disabled={importing || !importUrl.trim()}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] bg-forest-green text-white hover:bg-forest-green/90 disabled:opacity-50 transition-colors"
                  >
                    {importing ? (
                      <><span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span>Importing...</>
                    ) : (
                      <><span className="material-symbols-outlined text-[12px]">download</span>Import</>
                    )}
                  </button>
                  <button
                    onClick={() => { setShowImport(false); setImportError(null) }}
                    className="px-2 py-1 rounded text-[10px] text-text-muted hover:text-text-main hover:bg-light-surface-alt transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {!status || status.status === 'none' ? (
            <p className="px-2 py-2 text-center text-[10px] text-text-muted">
              No sandbox active. Ask BuilderBot to build something!
            </p>
          ) : status.status === 'stopped' ? (
            <div className="px-2 py-2 space-y-2">
              <div className="flex items-center gap-2 text-[10px] text-text-muted">
                <span className="h-2 w-2 rounded-full bg-yellow-500" />
                <span>Sandbox is stopped (idle timeout)</span>
              </div>
              <button
                onClick={async () => {
                  setStatus({ ...status, status: 'starting' as any })
                  try {
                    await engine.startSandbox()
                    for (let i = 0; i < 15; i++) {
                      await new Promise(r => setTimeout(r, 2000))
                      const s = await engine.getSandboxStatus()
                      setStatus(s)
                      if (s.status === 'running') {
                        openPreview()
                        break
                      }
                    }
                  } catch (err) {
                    setStatus({ ...status, status: 'stopped' })
                  }
                }}
                disabled={status.status === ('starting' as any)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs text-white bg-forest-green hover:bg-forest-green/90 disabled:opacity-50 transition-colors"
              >
                {status.status === ('starting' as any) ? (
                  <>
                    <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                    Waking up sandbox...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[14px]">play_arrow</span>
                    Start Sandbox
                  </>
                )}
              </button>
            </div>
          ) : (
            <>
              {/* Status bar */}
              <div className="flex items-center gap-2 px-2 py-1 text-[10px] text-text-muted">
                <span className={`h-2 w-2 rounded-full ${status.status === 'running' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                <span className="capitalize">{status.status}</span>
                {status.previewUrl && (
                  <button
                    onClick={openPreview}
                    className="ml-auto text-forest-green hover:underline"
                  >
                    Open Preview
                  </button>
                )}
              </div>

              {/* Breadcrumb */}
              {currentDir !== '/' && (
                <button
                  onClick={() => {
                    const parent = currentDir.split('/').slice(0, -1).join('/') || '/'
                    setCurrentDir(parent)
                  }}
                  className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-text-muted hover:text-text-main"
                >
                  <span className="material-symbols-outlined text-[12px]">arrow_back</span>
                  {currentDir}
                </button>
              )}

              {/* File list */}
              {loading ? (
                <p className="px-2 py-2 text-center text-[10px] text-text-muted">Loading...</p>
              ) : (
                files.map(f => (
                  <button
                    key={f.path}
                    onClick={() => openSandboxFile(f)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-xs text-text-main hover:bg-light-surface-alt transition-colors"
                  >
                    <span className="material-symbols-outlined text-[14px] text-text-muted">
                      {f.isDirectory ? 'folder' : 'description'}
                    </span>
                    <span className="truncate flex-1 text-left">{f.name}</span>
                    {!f.isDirectory && (
                      <span className="text-[10px] text-text-muted">{f.size > 1024 ? `${(f.size / 1024).toFixed(1)}K` : `${f.size}B`}</span>
                    )}
                  </button>
                ))
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

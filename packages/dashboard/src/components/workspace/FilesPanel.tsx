import { useState, useEffect, useCallback } from 'react'
import { PanelHeader } from './PanelHeader'
import type { WorkspaceState, ViewerTab } from '@/pages/WorkspacePage'
import * as engine from '@/lib/engine'

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
  const [tree, setTree] = useState<TreeNode[]>([])
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('workspace-expanded-dirs')
    return saved ? new Set(JSON.parse(saved)) : new Set<string>()
  })
  const [search, setSearch] = useState('')
  const [allFiles, setAllFiles] = useState<FlatFile[]>([])

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

  useEffect(() => { loadFiles() }, [loadFiles])

  // Persist expanded dirs
  useEffect(() => {
    localStorage.setItem('workspace-expanded-dirs', JSON.stringify([...expandedDirs]))
  }, [expandedDirs])

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

  // Search: filter flat file list
  const searchResults = search
    ? allFiles.filter(f => f.path.toLowerCase().includes(search.toLowerCase()))
    : null

  return (
    <div className="flex flex-col h-full">
      <PanelHeader
        icon="folder_open"
        title="Files"
        badge={unreadFileIds?.size}
        actions={
          <button
            onClick={() => loadFiles()}
            className="rounded p-1 text-text-muted hover:bg-light-surface-alt hover:text-text-main transition-colors"
            title="Refresh"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
          </button>
        }
      />

      {/* Search */}
      <div className="px-2 py-2 shrink-0">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search files..."
          className="w-full rounded-lg border border-border-subtle px-2.5 py-1.5 text-xs focus:border-forest-green focus:outline-none"
        />
      </div>

      {/* File tree or search results */}
      <div className="flex-1 overflow-y-auto px-1">
        {searchResults ? (
          // Search results: flat list
          <>
            {searchResults.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-text-muted">No files match your search</p>
            )}
            {searchResults.map(file => (
              <button
                key={file.path}
                onClick={() => openFile(file.path)}
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
          // Tree view
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
              />
            ))}
          </>
        )}
      </div>
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
}: {
  node: TreeNode
  level: number
  expandedDirs: Set<string>
  toggleDir: (path: string) => void
  openFile: (path: string) => void
  unreadFileIds?: Set<string>
}) {
  const isExpanded = expandedDirs.has(node.path)
  const isUnread = !node.isDirectory && unreadFileIds?.has(node.path)

  return (
    <>
      <button
        onClick={() => node.isDirectory ? toggleDir(node.path) : openFile(node.path)}
        className="group flex w-full items-center gap-1.5 rounded-lg py-1 pr-2 text-left text-xs transition-colors hover:bg-light-surface-alt"
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
        />
      ))}
    </>
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

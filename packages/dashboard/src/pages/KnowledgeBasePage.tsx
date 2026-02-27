import { useState, useEffect } from 'react'
import * as engine from '@/lib/engine'

interface FileNode {
  path: string
  name: string
  isDirectory: boolean
  size: number
  modifiedAt: string
  children?: FileNode[]
  expanded?: boolean
}

export function KnowledgeBasePage() {
  const [files, setFiles] = useState<FileNode[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [search, setSearch] = useState('')
  const [newFileName, setNewFileName] = useState('')
  const [showNewFile, setShowNewFile] = useState(false)

  const loadFiles = async (dir = '') => {
    try {
      const entries = await engine.listFiles(dir)
      return entries
    } catch {
      return []
    }
  }

  useEffect(() => {
    loadFiles().then(setFiles)
  }, [])

  const toggleDir = async (node: FileNode) => {
    if (!node.isDirectory) {
      setSelectedFile(node.path)
      try {
        const data = await engine.readFile(node.path)
        setFileContent(data.content)
        setEditContent(data.content)
        setEditing(false)
      } catch { /* offline */ }
      return
    }

    // Toggle expansion
    if (node.expanded) {
      node.expanded = false
      node.children = undefined
      setFiles([...files])
    } else {
      const children = await loadFiles(node.path)
      node.expanded = true
      node.children = children.map((c) => ({ ...c, expanded: false }))
      setFiles([...files])
    }
  }

  const saveFile = async () => {
    if (!selectedFile) return
    await engine.writeFile(selectedFile, editContent, 'user')
    setFileContent(editContent)
    setEditing(false)
  }

  const handleCreateFile = async () => {
    const name = newFileName.trim()
    if (!name) return
    const path = name.endsWith('.md') ? name : `${name}.md`
    await engine.writeFile(path, `# ${name.replace('.md', '')}\n\n`, 'user')
    setNewFileName('')
    setShowNewFile(false)
    await loadFiles().then(setFiles)
    setSelectedFile(path)
    const data = await engine.readFile(path)
    setFileContent(data.content)
    setEditContent(data.content)
    setEditing(true)
  }

  const filterNodes = (nodes: FileNode[], query: string): FileNode[] => {
    if (!query) return nodes
    const q = query.toLowerCase()
    return nodes.reduce<FileNode[]>((acc, node) => {
      if (node.isDirectory) {
        const filteredChildren = node.children ? filterNodes(node.children, query) : []
        if (filteredChildren.length > 0 || node.name.toLowerCase().includes(q)) {
          acc.push({ ...node, children: filteredChildren, expanded: true })
        }
      } else if (node.name.toLowerCase().includes(q)) {
        acc.push(node)
      }
      return acc
    }, [])
  }

  const displayFiles = search ? filterNodes(files, search) : files

  const renderTree = (nodes: FileNode[], depth = 0) => (
    <div>
      {nodes.map((node) => (
        <div key={node.path}>
          <button
            onClick={() => toggleDir(node)}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
              selectedFile === node.path
                ? 'bg-forest-green/10 text-forest-green font-medium'
                : 'text-text-secondary hover:bg-light-surface-alt'
            }`}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
          >
            <span className="material-symbols-outlined text-[16px] text-text-muted">
              {node.isDirectory
                ? node.expanded ? 'folder_open' : 'folder'
                : 'description'
              }
            </span>
            <span className="truncate">{node.name}</span>
          </button>
          {node.expanded && node.children && renderTree(node.children, depth + 1)}
        </div>
      ))}
    </div>
  )

  return (
    <div className="flex h-[calc(100vh-8rem)] -m-6">
      {/* File Tree */}
      <div className="w-72 shrink-0 border-r border-border-subtle bg-light-surface overflow-y-auto p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-text-main">Knowledge Base</h2>
          <button
            onClick={() => setShowNewFile(!showNewFile)}
            className="text-text-muted hover:text-forest-green"
            title="New file"
          >
            <span className="material-symbols-outlined text-[20px]">note_add</span>
          </button>
        </div>

        {showNewFile && (
          <div className="mb-3 flex items-center gap-1 rounded-lg border border-forest-green bg-white px-2 py-1.5">
            <input
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFile()
                if (e.key === 'Escape') { setShowNewFile(false); setNewFileName('') }
              }}
              placeholder="filename.md"
              className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-text-muted/50"
              autoFocus
            />
            <button
              onClick={handleCreateFile}
              disabled={!newFileName.trim()}
              className="rounded p-0.5 text-forest-green hover:bg-forest-green/10 disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[16px]">check</span>
            </button>
          </div>
        )}

        <div className="mb-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files..."
            className="w-full rounded-lg border border-border-subtle px-3 py-1.5 text-sm focus:border-forest-green focus:outline-none"
          />
        </div>
        {displayFiles.length > 0 ? (
          renderTree(displayFiles)
        ) : (
          <p className="py-8 text-center text-xs text-text-muted">No files yet. Create workspace files from the engine.</p>
        )}
      </div>

      {/* Editor */}
      <div className="flex flex-1 flex-col">
        {selectedFile ? (
          <>
            {/* Editor Header */}
            <div className="flex items-center justify-between border-b border-border-subtle bg-white px-6 py-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-mono text-text-muted">{selectedFile}</span>
              </div>
              <div className="flex gap-2">
                {editing ? (
                  <>
                    <button
                      onClick={() => { setEditing(false); setEditContent(fileContent) }}
                      className="rounded-lg border border-border-subtle px-3 py-1.5 text-sm text-text-secondary"
                    >
                      Cancel
                    </button>
                    <button onClick={saveFile} className="rounded-lg bg-forest-green px-3 py-1.5 text-sm text-white">
                      Save
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setEditing(true)}
                    className="flex items-center gap-1 rounded-lg border border-border-subtle px-3 py-1.5 text-sm text-text-secondary hover:bg-light-surface-alt"
                  >
                    <span className="material-symbols-outlined text-[16px]">edit</span>
                    Edit
                  </button>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {editing ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="h-full w-full resize-none rounded-lg border border-border-subtle p-4 font-mono text-sm focus:border-forest-green focus:outline-none"
                />
              ) : (
                <pre className="whitespace-pre-wrap font-mono text-sm text-text-main">{fileContent}</pre>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <span className="material-symbols-outlined mb-4 text-5xl text-text-muted">menu_book</span>
            <h2 className="font-display text-xl font-bold text-text-main">Knowledge Base</h2>
            <p className="mt-2 text-sm text-text-muted">Select a file to view or edit. SOPs, strategy docs, and agent notes live here.</p>
          </div>
        )}
      </div>
    </div>
  )
}

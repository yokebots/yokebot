import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router'
import * as engine from '@/lib/engine'
import type { KbDocument, KbSearchResult, KbChunk } from '@/lib/engine'

// ---- File tree types ----

interface FileNode {
  path: string
  name: string
  isDirectory: boolean
  size: number
  modifiedAt: string
  children?: FileNode[]
  expanded?: boolean
}

// ---- Constants ----

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md', '.csv']
const FILE_TYPE_ICONS: Record<string, string> = {
  pdf: 'picture_as_pdf',
  docx: 'description',
  txt: 'text_snippet',
  md: 'markdown',
  csv: 'table_chart',
}

// ---- Selection types ----

type Selection =
  | { type: 'document'; doc: KbDocument }
  | { type: 'file'; path: string }
  | null

// ---- Main Component ----

export function FilesPage() {
  const [searchParams] = useSearchParams()
  const fileParam = searchParams.get('file') || searchParams.get('doc')

  // KB Documents state
  const [documents, setDocuments] = useState<KbDocument[]>([])
  const [chunks, setChunks] = useState<KbChunk[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<KbSearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Workspace files state
  const [files, setFiles] = useState<FileNode[]>([])
  const [fileContent, setFileContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [newFileName, setNewFileName] = useState('')
  const [showNewFile, setShowNewFile] = useState(false)

  // Unified selection
  const [selection, setSelection] = useState<Selection>(null)

  // ---- Data loading ----

  const loadDocuments = useCallback(async () => {
    try {
      const docs = await engine.listKbDocuments()
      setDocuments(docs)
    } catch { /* offline */ }
  }, [])

  const loadFiles = async (dir = '') => {
    try {
      return await engine.listFiles(dir)
    } catch {
      return []
    }
  }

  useEffect(() => { loadDocuments() }, [loadDocuments])
  useEffect(() => { loadFiles().then(setFiles) }, [])

  // Poll for processing documents
  useEffect(() => {
    const hasProcessing = documents.some((d) => d.status === 'pending' || d.status === 'processing')
    if (!hasProcessing) return
    const interval = setInterval(loadDocuments, 3000)
    return () => clearInterval(interval)
  }, [documents, loadDocuments])

  // Handle URL param to auto-select a file
  useEffect(() => {
    if (!fileParam) return
    // Check if it matches a workspace file path
    const matchFile = flattenFiles(files).find((f) => f.path === fileParam)
    if (matchFile) {
      selectWorkspaceFile(matchFile.path)
      return
    }
    // Check if it matches a KB document id
    const matchDoc = documents.find((d) => d.id === fileParam)
    if (matchDoc) {
      selectDocument(matchDoc)
    }
  }, [fileParam, files.length, documents.length])

  // ---- KB Document handlers ----

  const handleUpload = async (fileList: FileList | File[]) => {
    setUploading(true)
    try {
      for (const file of fileList) {
        const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '')
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          alert(`Unsupported file type: ${ext}\nAllowed: ${ALLOWED_EXTENSIONS.join(', ')}`)
          continue
        }
        if (file.size > 10 * 1024 * 1024) {
          alert(`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Maximum: 10MB`)
          continue
        }
        await engine.uploadKbDocument(file)
      }
      await loadDocuments()
    } catch (err) {
      alert(`Upload failed: ${(err as Error).message}`)
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files)
    }
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) { setSearchResults(null); return }
    setSearching(true)
    try {
      const results = await engine.searchKb(searchQuery.trim())
      setSearchResults(results)
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  const handleDeleteDoc = async (id: string) => {
    if (!confirm('Delete this document and all its chunks?')) return
    await engine.deleteKbDocument(id)
    if (selection?.type === 'document' && selection.doc.id === id) {
      setSelection(null)
      setChunks([])
    }
    loadDocuments()
  }

  const selectDocument = async (doc: KbDocument) => {
    setSelection({ type: 'document', doc })
    setSearchResults(null)
    setEditing(false)
    if (doc.status === 'ready') {
      try {
        const data = await engine.getKbDocumentChunks(doc.id)
        setChunks(data.chunks)
      } catch { setChunks([]) }
    } else {
      setChunks([])
    }
  }

  // ---- Workspace file handlers ----

  const selectWorkspaceFile = async (path: string) => {
    setSelection({ type: 'file', path })
    setSearchResults(null)
    setEditing(false)
    try {
      const data = await engine.readFile(path)
      setFileContent(data.content)
      setEditContent(data.content)
    } catch { /* offline */ }
  }

  const toggleDir = async (node: FileNode) => {
    if (!node.isDirectory) {
      selectWorkspaceFile(node.path)
      return
    }
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
    if (selection?.type !== 'file') return
    await engine.writeFile(selection.path, editContent, 'user')
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
    selectWorkspaceFile(path)
    setEditing(true)
  }

  // ---- Helpers ----

  const flattenFiles = (nodes: FileNode[]): FileNode[] => {
    const result: FileNode[] = []
    for (const n of nodes) {
      result.push(n)
      if (n.children) result.push(...flattenFiles(n.children))
    }
    return result
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-700',
      processing: 'bg-blue-100 text-blue-700',
      ready: 'bg-green-100 text-green-700',
      failed: 'bg-red-100 text-red-700',
    }
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? 'bg-gray-100 text-gray-600'}`}>
        {(status === 'pending' || status === 'processing') && (
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-current" />
        )}
        {status}
      </span>
    )
  }

  const filterFiles = (nodes: FileNode[], query: string): FileNode[] => {
    if (!query) return nodes
    const q = query.toLowerCase()
    return nodes.reduce<FileNode[]>((acc, node) => {
      if (node.isDirectory) {
        const filteredChildren = node.children ? filterFiles(node.children, query) : []
        if (filteredChildren.length > 0 || node.name.toLowerCase().includes(q)) {
          acc.push({ ...node, children: filteredChildren, expanded: true })
        }
      } else if (node.name.toLowerCase().includes(q)) {
        acc.push(node)
      }
      return acc
    }, [])
  }

  const renderTree = (nodes: FileNode[], depth = 0) => (
    <div>
      {nodes.map((node) => (
        <div key={node.path}>
          <button
            onClick={() => toggleDir(node)}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
              selection?.type === 'file' && selection.path === node.path
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

  const filteredDocs = searchQuery
    ? documents.filter((d) => d.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : documents

  const filteredFiles = searchQuery ? filterFiles(files, searchQuery) : files

  // ---- Render ----

  return (
    <div className="flex h-[calc(100vh-8rem)] -m-6">
      {/* Left Sidebar */}
      <div className="w-80 shrink-0 border-r border-border-subtle bg-light-surface flex flex-col overflow-hidden">
        {/* Upload Drop Zone */}
        <div
          className={`m-4 rounded-xl border-2 border-dashed p-4 text-center transition-colors cursor-pointer ${
            dragOver
              ? 'border-forest-green bg-forest-green/5'
              : 'border-border-subtle hover:border-forest-green/40'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_EXTENSIONS.join(',')}
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleUpload(e.target.files)}
          />
          <span className="material-symbols-outlined text-3xl text-text-muted">cloud_upload</span>
          <p className="mt-1 text-sm text-text-secondary">
            {uploading ? 'Uploading...' : 'Drop files or click to upload'}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">PDF, DOCX, TXT, MD, CSV (max 10MB)</p>
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-white px-3 py-1.5">
            <span className="material-symbols-outlined text-[16px] text-text-muted">search</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search files..."
              className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-text-muted/50"
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setSearchResults(null) }} className="text-text-muted hover:text-text-secondary">
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            )}
          </div>
        </div>

        {/* Unified File List */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {/* Uploaded Documents Section */}
          {filteredDocs.length > 0 && (
            <>
              <h4 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                Uploaded Documents
              </h4>
              <div className="space-y-0.5 mb-4">
                {filteredDocs.map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => selectDocument(doc)}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors ${
                      selection?.type === 'document' && selection.doc.id === doc.id
                        ? 'bg-forest-green/10 text-forest-green'
                        : 'text-text-secondary hover:bg-light-surface-alt'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px] text-text-muted shrink-0">
                      {FILE_TYPE_ICONS[doc.fileType] ?? 'description'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{doc.title}</p>
                      <p className="text-xs text-text-muted">{formatSize(doc.fileSize)}</p>
                    </div>
                    <div className="shrink-0 flex items-center gap-1">
                      {statusBadge(doc.status)}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteDoc(doc.id) }}
                        className="rounded p-0.5 text-text-muted hover:text-red-500 hover:bg-red-50"
                      >
                        <span className="material-symbols-outlined text-[14px]">delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Workspace Files Section */}
          <div className="flex items-center justify-between mb-1.5">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
              Workspace Files
            </h4>
            <button
              onClick={() => setShowNewFile(!showNewFile)}
              className="text-text-muted hover:text-forest-green"
              title="New file"
            >
              <span className="material-symbols-outlined text-[16px]">note_add</span>
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

          {filteredFiles.length > 0 ? (
            renderTree(filteredFiles)
          ) : (
            <p className="py-4 text-center text-xs text-text-muted">
              {files.length === 0 ? 'No workspace files yet.' : 'No matching files.'}
            </p>
          )}

          {/* Empty state when nothing exists at all */}
          {documents.length === 0 && files.length === 0 && (
            <p className="py-4 text-center text-xs text-text-muted">
              Upload documents or create workspace files to get started.
            </p>
          )}
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 overflow-y-auto">
        {searchResults !== null ? (
          /* Search Results View */
          <div className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-text-main">
                Search Results ({searchResults.length})
              </h3>
              <button
                onClick={() => setSearchResults(null)}
                className="text-sm text-text-muted hover:text-text-secondary"
              >
                Clear results
              </button>
            </div>
            {searching ? (
              <p className="text-sm text-text-muted">Searching...</p>
            ) : searchResults.length === 0 ? (
              <p className="text-sm text-text-muted">No relevant results found.</p>
            ) : (
              <div className="space-y-4">
                {searchResults.map((result) => (
                  <div key={result.chunkId} className="rounded-xl border border-border-subtle bg-white p-4">
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="font-medium text-forest-green">{result.documentTitle}</span>
                      <span className="text-text-muted">Score: {result.score.toFixed(3)}</span>
                    </div>
                    <p className="text-sm text-text-main whitespace-pre-wrap line-clamp-6">{result.content}</p>
                    {result.l0Summary && (
                      <p className="mt-2 text-xs text-text-muted italic">{result.l0Summary}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : selection?.type === 'document' ? (
          /* Document Detail View */
          <div className="p-6">
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                <span className="material-symbols-outlined text-2xl text-text-muted">
                  {FILE_TYPE_ICONS[selection.doc.fileType] ?? 'description'}
                </span>
                <div>
                  <h3 className="font-display text-lg font-bold text-text-main">{selection.doc.title}</h3>
                  <p className="text-xs text-text-muted">
                    {selection.doc.fileName} &middot; {formatSize(selection.doc.fileSize)} &middot; {statusBadge(selection.doc.status)}
                    {selection.doc.chunkCount > 0 && ` · ${selection.doc.chunkCount} chunks`}
                  </p>
                </div>
              </div>

              {selection.doc.error && (
                <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  <strong>Error:</strong> {selection.doc.error}
                </div>
              )}

              {selection.doc.l0Summary && (
                <div className="mt-4 rounded-xl bg-light-surface p-4">
                  <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Summary</h4>
                  <p className="text-sm text-text-main">{selection.doc.l0Summary}</p>
                </div>
              )}

              {selection.doc.l1Overview && (
                <div className="mt-3 rounded-xl bg-light-surface p-4">
                  <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Overview</h4>
                  <p className="text-sm text-text-main whitespace-pre-wrap">{selection.doc.l1Overview}</p>
                </div>
              )}
            </div>

            {/* Chunk List */}
            {chunks.length > 0 && (
              <div>
                <h4 className="font-display text-sm font-bold text-text-main mb-3">
                  Chunks ({chunks.length})
                </h4>
                <div className="space-y-3">
                  {chunks.map((chunk) => (
                    <div key={chunk.id} className="rounded-lg border border-border-subtle bg-white p-3">
                      <div className="mb-1 flex items-center justify-between text-xs text-text-muted">
                        <span>Chunk #{chunk.chunkIndex + 1}</span>
                        <span>{chunk.tokenCount} tokens</span>
                      </div>
                      <p className="text-sm text-text-main whitespace-pre-wrap line-clamp-4">{chunk.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : selection?.type === 'file' ? (
          /* Workspace File Editor */
          <div className="flex flex-1 h-full flex-col">
            <div className="flex items-center justify-between border-b border-border-subtle bg-white px-6 py-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-mono text-text-muted">{selection.path}</span>
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
          </div>
        ) : (
          /* Empty State */
          <div className="flex flex-1 h-full flex-col items-center justify-center text-center p-6">
            <span className="material-symbols-outlined mb-4 text-5xl text-text-muted">folder_open</span>
            <h2 className="font-display text-xl font-bold text-text-main">Files</h2>
            <p className="mt-2 max-w-md text-sm text-text-muted">
              Upload documents to build your knowledge base, or browse workspace files created by your agents.
              Agents can search uploaded documents for relevant information during conversations.
            </p>
            <p className="mt-1 text-xs text-text-muted">Supported uploads: PDF, DOCX, TXT, Markdown, CSV</p>
          </div>
        )}
      </div>
    </div>
  )
}

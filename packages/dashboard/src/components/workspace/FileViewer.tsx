import { useState, useEffect, useCallback } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import * as engine from '@/lib/engine'
import { supabase } from '@/lib/supabase'

interface FileViewerProps {
  filePath: string
  onTaskClick?: (taskId: string) => void
}

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'])
const PDF_EXTS = new Set(['pdf'])
const CSV_EXTS = new Set(['csv'])

function getExt(path: string): string {
  const parts = path.split('.')
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''
}

export function FileViewer({ filePath, onTaskClick }: FileViewerProps) {
  const ext = getExt(filePath)
  const [content, setContent] = useState<string | null>(null)
  const [isBinary, setIsBinary] = useState(false)
  const [createdBy, setCreatedBy] = useState('')
  const [authorType, setAuthorType] = useState<'agent' | 'human'>('human')
  const [linkedTask, setLinkedTask] = useState<{ id: string; title: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [renderMarkdown, setRenderMarkdown] = useState(true)

  const loadFile = useCallback(async () => {
    setLoading(true)
    try {
      const res = await engine.readFile(filePath)
      setContent(res.content)
      setIsBinary(res.binary ?? false)
      setEditContent(res.content)
      setCreatedBy(res.createdBy ?? '')
      setAuthorType(res.authorType ?? 'human')
      setLinkedTask(res.task ?? null)
    } catch {
      setContent(null)
    }
    setLoading(false)
  }, [filePath])

  useEffect(() => { loadFile() }, [loadFile])

  // Mark file as read (persist to server + notify parent to update unread state)
  useEffect(() => {
    engine.markFileRead(filePath).catch(() => {})
    window.dispatchEvent(new CustomEvent('yokebot:file-read', { detail: { path: filePath } }))
  }, [filePath])

  const handleSave = async () => {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const authorName = (user?.user_metadata?.full_name as string) ?? user?.email?.split('@')[0] ?? 'User'
      await engine.writeFile(filePath, editContent, authorName)
      setContent(editContent)
      setCreatedBy(authorName)
      setEditing(false)
    } catch { /* ignore */ }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <span className="text-sm text-text-muted">Loading...</span>
      </div>
    )
  }

  if (content === null) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <span className="text-sm text-text-muted">File not found</span>
      </div>
    )
  }

  // Image preview
  if (IMAGE_EXTS.has(ext)) {
    const mimeType = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`
    const src = isBinary ? `data:${mimeType};base64,${content}` : `data:${mimeType};base64,${btoa(content)}`
    return (
      <div className="flex flex-1 items-center justify-center overflow-auto p-4 bg-gray-50">
        <img
          src={src}
          alt={filePath}
          className="max-w-full max-h-full object-contain rounded-lg shadow-sm"
        />
      </div>
    )
  }

  // PDF viewer
  if (PDF_EXTS.has(ext)) {
    const src = isBinary ? `data:application/pdf;base64,${content}` : `data:application/pdf;base64,${btoa(content)}`
    return (
      <div className="flex-1 overflow-hidden">
        <embed
          src={src}
          type="application/pdf"
          className="h-full w-full"
        />
      </div>
    )
  }

  // CSV table view
  if (CSV_EXTS.has(ext)) {
    return <CsvTable content={content} />
  }

  // Markdown rendered view
  if (ext === 'md' && renderMarkdown && !editing) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-subtle bg-light-surface shrink-0">
          <button
            onClick={() => setRenderMarkdown(false)}
            className="rounded px-2 py-0.5 text-xs text-text-muted hover:bg-light-surface-alt"
          >
            Raw
          </button>
          <button
            onClick={() => setEditing(true)}
            className="rounded px-2 py-0.5 text-xs text-text-muted hover:bg-light-surface-alt"
          >
            <span className="material-symbols-outlined text-[14px] align-middle mr-0.5">edit</span>
            Edit
          </button>
          {linkedTask && onTaskClick && (
            <button
              onClick={() => onTaskClick(linkedTask.id)}
              className="flex items-center gap-1 text-[11px] text-forest-green hover:underline"
            >
              <span className="material-symbols-outlined text-[14px]">task_alt</span>
              {linkedTask.title}
            </button>
          )}
          {createdBy && (
            <span className="ml-auto flex items-center gap-1 text-[11px] text-text-muted">
              <span className="material-symbols-outlined text-[14px]">{authorType === 'agent' ? 'smart_toy' : 'person'}</span>
              {createdBy}
            </span>
          )}
        </div>
        <div className="flex-1 overflow-auto p-4 prose prose-sm max-w-none">
          <MarkdownRenderer content={content} />
        </div>
      </div>
    )
  }

  // Text editor / raw view
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-subtle bg-light-surface shrink-0">
        {ext === 'md' && !editing && (
          <button
            onClick={() => setRenderMarkdown(true)}
            className="rounded px-2 py-0.5 text-xs text-text-muted hover:bg-light-surface-alt"
          >
            Rendered
          </button>
        )}
        {!editing ? (
          <button
            onClick={() => { setEditing(true); setEditContent(content) }}
            className="rounded px-2 py-0.5 text-xs text-text-muted hover:bg-light-surface-alt"
          >
            <span className="material-symbols-outlined text-[14px] align-middle mr-0.5">edit</span>
            Edit
          </button>
        ) : (
          <>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded bg-forest-green px-2.5 py-0.5 text-xs text-white hover:bg-forest-green/90 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => { setEditing(false); setEditContent(content) }}
              className="rounded px-2 py-0.5 text-xs text-text-muted hover:bg-light-surface-alt"
            >
              Cancel
            </button>
          </>
        )}
        {linkedTask && onTaskClick && (
          <button
            onClick={() => onTaskClick(linkedTask.id)}
            className="flex items-center gap-1 text-[11px] text-forest-green hover:underline"
          >
            <span className="material-symbols-outlined text-[14px]">task_alt</span>
            {linkedTask.title}
          </button>
        )}
        {createdBy && (
          <span className="ml-auto flex items-center gap-1 text-[11px] text-text-muted">
            <span className="material-symbols-outlined text-[14px]">{authorType === 'agent' ? 'smart_toy' : 'person'}</span>
            {createdBy}
          </span>
        )}
      </div>
      {editing ? (
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          className="flex-1 resize-none p-4 font-mono text-sm text-text-main focus:outline-none"
          spellCheck={false}
        />
      ) : (
        <pre className="flex-1 overflow-auto p-4 text-sm text-text-main whitespace-pre-wrap font-mono">
          {content}
        </pre>
      )}
    </div>
  )
}

/** Simple CSV → table renderer */
function CsvTable({ content }: { content: string }) {
  const lines = content.split('\n').filter(l => l.trim())
  if (lines.length === 0) return <p className="p-4 text-sm text-text-muted">Empty CSV</p>

  const parseRow = (line: string): string[] => {
    const cells: string[] = []
    let current = ''
    let inQuotes = false
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue }
      if (ch === ',' && !inQuotes) { cells.push(current.trim()); current = ''; continue }
      current += ch
    }
    cells.push(current.trim())
    return cells
  }

  const headers = parseRow(lines[0])
  const rows = lines.slice(1).map(parseRow)

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-light-surface border-b border-border-subtle">
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 text-left text-xs font-semibold text-text-muted uppercase tracking-wider whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-border-subtle/50 hover:bg-light-surface-alt/50">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-1.5 text-text-main whitespace-nowrap">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Markdown renderer using `marked` library */
function MarkdownRenderer({ content }: { content: string }) {
  const html = marked.parse(content, { breaks: true }) as string
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'a', 'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'span', 'div', 'del', 'sup', 'sub'],
    ALLOWED_ATTR: ['href', 'title', 'alt', 'src', 'class'],
    ALLOW_DATA_ATTR: false,
  })
  return <div dangerouslySetInnerHTML={{ __html: sanitized }} />
}

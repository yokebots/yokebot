import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { searchDocs, type SearchResult } from '@/lib/docs-search'

interface DocsSearchProps {
  onClose: () => void
}

export function DocsSearch({ onClose }: DocsSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Cmd+K global shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
      }
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    setResults(searchDocs(query))
    setSelected(0)
  }, [query])

  const goTo = (slug: string) => {
    navigate(`/docs/${slug}`)
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected(prev => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && results[selected]) {
      goTo(results[selected].doc.slug)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40" />
      <div
        className="relative z-10 w-full max-w-lg rounded-xl border border-border-subtle bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
          <span className="material-symbols-outlined text-[20px] text-text-muted">search</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search documentation..."
            className="flex-1 bg-transparent text-sm text-text-main placeholder-text-muted outline-none"
          />
          <kbd className="rounded border border-border-subtle bg-light-surface-alt px-1.5 py-0.5 font-mono text-[10px] text-text-muted">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {query && results.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-text-muted">
              No results for "{query}"
            </div>
          )}
          {results.map((r, i) => (
            <button
              key={r.doc.slug}
              onClick={() => goTo(r.doc.slug)}
              className={`flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors ${
                i === selected ? 'bg-forest-green-light' : 'hover:bg-light-surface-alt'
              }`}
            >
              <span className="material-symbols-outlined mt-0.5 shrink-0 text-[18px] text-text-muted">
                article
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${i === selected ? 'text-forest-green' : 'text-text-main'}`}>
                  {r.doc.title}
                </p>
                <p className="mt-0.5 truncate text-xs text-text-muted">{r.doc.description}</p>
              </div>
              <span className="mt-0.5 shrink-0 rounded bg-light-surface-alt px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                {r.doc.section}
              </span>
            </button>
          ))}
          {!query && (
            <div className="px-4 py-8 text-center text-sm text-text-muted">
              Type to search across all documentation pages
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

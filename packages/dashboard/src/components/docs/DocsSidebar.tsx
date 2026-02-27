import { NavLink, useParams } from 'react-router'
import { useState, useEffect } from 'react'
import { docsSections } from '@/lib/docs-content'

interface DocsSidebarProps {
  open: boolean
  onClose: () => void
}

export function DocsSidebar({ open, onClose }: DocsSidebarProps) {
  const { slug, section } = useParams()
  const currentSlug = section ? `${section}/${slug}` : (slug ?? 'getting-started')

  // Track which sections are expanded
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // Auto-expand the section containing the current page
  useEffect(() => {
    for (const sec of docsSections) {
      if (sec.slugs.includes(currentSlug)) {
        setExpanded(prev => ({ ...prev, [sec.title]: true }))
        break
      }
    }
  }, [currentSlug])

  const toggleSection = (title: string) => {
    setExpanded(prev => ({ ...prev, [title]: !prev[title] }))
  }

  const linkClass = (slug: string) => {
    const active = currentSlug === slug
    return `block rounded-lg px-3 py-1.5 text-sm transition-colors ${
      active
        ? 'bg-forest-green-light text-forest-green font-medium'
        : 'text-text-secondary hover:bg-light-surface-alt hover:text-text-main'
    }`
  }

  const slugToPath = (s: string) => `/docs/${s}`

  // Get display label from slug (last segment, humanized)
  const slugLabel = (s: string) => {
    const last = s.split('/').pop() ?? s
    return last
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  }

  const nav = (
    <nav className="flex-1 overflow-y-auto px-3 py-6 space-y-1 scrollbar-hide">
      {docsSections.map((sec) => (
        <div key={sec.title}>
          <button
            onClick={() => toggleSection(sec.title)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-text-main hover:bg-light-surface-alt transition-colors"
          >
            <span className="material-symbols-outlined text-[18px] text-text-muted">{sec.icon}</span>
            <span className="flex-1 text-left">{sec.title}</span>
            <span
              className={`material-symbols-outlined text-[16px] text-text-muted transition-transform ${
                expanded[sec.title] ? 'rotate-180' : ''
              }`}
            >
              expand_more
            </span>
          </button>

          {expanded[sec.title] && (
            <div className="ml-4 mt-1 space-y-0.5 border-l border-border-subtle pl-3">
              {sec.slugs.map((s) => (
                <NavLink
                  key={s}
                  to={slugToPath(s)}
                  className={() => linkClass(s)}
                  onClick={onClose}
                >
                  {slugLabel(s)}
                </NavLink>
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  )

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div className="fixed inset-0 z-20 bg-black/40 md:hidden" onClick={onClose} />
      )}

      {/* Sidebar */}
      <aside
        className={[
          'flex flex-col border-r border-border-subtle bg-light-surface h-full z-30 w-64 shrink-0 transition-transform duration-200',
          'fixed md:relative',
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        ].join(' ')}
      >
        {/* Mobile close button */}
        <div className="flex h-12 items-center justify-between px-4 md:hidden">
          <span className="font-display text-sm font-semibold text-text-main">Navigation</span>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted hover:bg-light-surface-alt hover:text-text-main transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {nav}
      </aside>
    </>
  )
}

import { Outlet } from 'react-router'
import { DocsSidebar } from '@/components/docs/DocsSidebar'
import { DocsSearch } from '@/components/docs/DocsSearch'
import { useState, useEffect } from 'react'

export function DocsLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  // Cmd+K shortcut to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-light-bg">
      {/* Header */}
      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-border-subtle bg-white/90 backdrop-blur-md px-4 md:px-6">
        <div className="flex items-center gap-3">
          {/* Mobile hamburger */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-1.5 text-text-muted hover:bg-light-surface-alt hover:text-text-main transition-colors md:hidden"
          >
            <span className="material-symbols-outlined text-[20px]">menu</span>
          </button>

          <a href="/" className="flex items-center gap-2">
            <img src="/logo-full-color.png" alt="YokeBot" className="h-7 object-contain" />
          </a>
          <span className="text-border-strong">/</span>
          <a href="/docs" className="font-display text-sm font-semibold text-forest-green">Docs</a>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-border-subtle bg-light-surface px-3 py-1.5 text-sm text-text-muted hover:border-border-strong hover:text-text-secondary transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">search</span>
            <span className="hidden sm:inline">Search docs...</span>
            <kbd className="hidden rounded border border-border-subtle bg-light-surface-alt px-1.5 py-0.5 font-mono text-[10px] text-text-muted sm:inline">⌘K</kbd>
          </button>
          <a
            href="/login"
            className="hidden text-sm font-medium text-text-secondary hover:text-forest-green transition-colors sm:block"
          >
            Sign In
          </a>
        </div>
      </header>

      {/* Sidebar + Content */}
      <div className="flex flex-1 overflow-hidden">
        <DocsSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 overflow-y-auto scrollbar-hide">
          <div className="mx-auto max-w-3xl px-4 py-8 md:px-8 lg:px-12">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Search overlay */}
      {searchOpen && <DocsSearch onClose={() => setSearchOpen(false)} />}
    </div>
  )
}

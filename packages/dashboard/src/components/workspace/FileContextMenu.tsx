import { useEffect, useRef } from 'react'

interface FileContextMenuProps {
  x: number
  y: number
  filePath: string
  isDirectory: boolean
  onClose: () => void
  onRename: (path: string) => void
  onDelete: (path: string) => void
  onCopyPath: (path: string) => void
  onOpenInTab: (path: string) => void
}

interface MenuItem {
  label: string
  icon: string
  action: () => void
  danger?: boolean
  hidden?: boolean
}

export function FileContextMenu({
  x,
  y,
  filePath,
  isDirectory,
  onClose,
  onRename,
  onDelete,
  onCopyPath,
  onOpenInTab,
}: FileContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on click outside, escape, or scroll
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const handleScroll = () => onClose()

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    document.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
      document.removeEventListener('scroll', handleScroll, true)
    }
  }, [onClose])

  // Adjust position if menu would overflow viewport
  useEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    if (rect.right > window.innerWidth) {
      menuRef.current.style.left = `${x - rect.width}px`
    }
    if (rect.bottom > window.innerHeight) {
      menuRef.current.style.top = `${y - rect.height}px`
    }
  }, [x, y])

  const items: MenuItem[] = [
    {
      label: 'Open',
      icon: 'description',
      action: () => { onOpenInTab(filePath); onClose() },
      hidden: isDirectory,
    },
    {
      label: 'Rename',
      icon: 'edit',
      action: () => { onRename(filePath); onClose() },
    },
    {
      label: 'Copy Path',
      icon: 'content_copy',
      action: () => { onCopyPath(filePath); onClose() },
    },
    {
      label: 'Delete',
      icon: 'delete',
      action: () => { onDelete(filePath); onClose() },
      danger: true,
    },
  ]

  const visibleItems = items.filter(i => !i.hidden)

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[160px] rounded-lg border border-border-subtle bg-white shadow-lg py-1"
      style={{ left: x, top: y }}
    >
      {visibleItems.map((item) => (
        <button
          key={item.label}
          onClick={item.action}
          className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-xs transition-colors hover:bg-light-surface-alt ${
            item.danger ? 'text-red-600 hover:bg-red-50' : 'text-text-main'
          }`}
        >
          <span className={`material-symbols-outlined text-[16px] ${item.danger ? 'text-red-500' : 'text-text-muted'}`}>
            {item.icon}
          </span>
          {item.label}
        </button>
      ))}
    </div>
  )
}

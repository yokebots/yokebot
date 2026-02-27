import { useState, useRef, useEffect, useCallback } from 'react'
import type { MentionCompletionData } from '@/lib/engine'

interface MentionInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  placeholder?: string
  completions: MentionCompletionData | null
  disabled?: boolean
}

interface MentionOption {
  type: 'agent' | 'user' | 'file'
  id: string
  label: string
  icon: string
  iconColor?: string | null
  status?: string
}

const FILE_ICONS: Record<string, string> = {
  pdf: 'picture_as_pdf',
  docx: 'description',
  txt: 'text_snippet',
  md: 'markdown',
  csv: 'table_chart',
}

export function MentionInput({ value, onChange, onSubmit, placeholder, completions, disabled }: MentionInputProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionStart, setMentionStart] = useState(-1)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Build flat list of all mention options
  const allOptions: MentionOption[] = completions ? [
    ...completions.agents.map((a) => ({
      type: 'agent' as const, id: a.id, label: a.name,
      icon: a.iconName ?? 'smart_toy', iconColor: a.iconColor, status: a.status,
    })),
    ...completions.users.map((u) => ({
      type: 'user' as const, id: u.userId, label: u.email,
      icon: 'person',
    })),
    ...completions.documents.map((d) => ({
      type: 'file' as const, id: d.id, label: d.title,
      icon: FILE_ICONS[d.fileType] ?? 'description',
    })),
  ] : []

  // Filter options based on query
  const filteredOptions = mentionQuery
    ? allOptions.filter((opt) => opt.label.toLowerCase().includes(mentionQuery.toLowerCase()))
    : allOptions

  // Clamp selected index
  useEffect(() => {
    if (selectedIndex >= filteredOptions.length) {
      setSelectedIndex(Math.max(0, filteredOptions.length - 1))
    }
  }, [filteredOptions.length, selectedIndex])

  // Scroll selected item into view
  useEffect(() => {
    if (!dropdownRef.current) return
    const selected = dropdownRef.current.querySelector('[data-selected="true"]')
    if (selected) selected.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const insertMention = useCallback((option: MentionOption) => {
    const before = value.slice(0, mentionStart)
    const after = value.slice(inputRef.current?.selectionStart ?? value.length)
    const mention = `@[${option.label}](${option.type}:${option.id}) `
    const newValue = before + mention + after
    onChange(newValue)
    setShowDropdown(false)
    setMentionQuery('')
    setMentionStart(-1)

    // Restore cursor position after React re-render
    requestAnimationFrame(() => {
      if (inputRef.current) {
        const pos = before.length + mention.length
        inputRef.current.selectionStart = pos
        inputRef.current.selectionEnd = pos
        inputRef.current.focus()
      }
    })
  }, [value, mentionStart, onChange])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    const cursorPos = e.target.selectionStart

    onChange(newValue)

    // Detect if we're in a mention context
    const textBeforeCursor = newValue.slice(0, cursorPos)
    const atIndex = textBeforeCursor.lastIndexOf('@')

    if (atIndex >= 0) {
      // Check that @ is at start of text or preceded by whitespace
      const charBefore = atIndex > 0 ? textBeforeCursor[atIndex - 1] : ' '
      if (charBefore === ' ' || charBefore === '\n' || atIndex === 0) {
        const query = textBeforeCursor.slice(atIndex + 1)
        // No spaces in query (stop matching after space)
        if (!query.includes(' ') && !query.includes('\n')) {
          setMentionStart(atIndex)
          setMentionQuery(query)
          setShowDropdown(true)
          setSelectedIndex(0)
          return
        }
      }
    }

    setShowDropdown(false)
    setMentionQuery('')
    setMentionStart(-1)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showDropdown && filteredOptions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => (i + 1) % filteredOptions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => (i - 1 + filteredOptions.length) % filteredOptions.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(filteredOptions[selectedIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowDropdown(false)
        return
      }
    }

    // Submit on Enter (without dropdown open, without Shift)
    if (e.key === 'Enter' && !e.shiftKey && !showDropdown) {
      e.preventDefault()
      onSubmit()
    }
  }

  const sectionLabel = (type: string) => {
    switch (type) {
      case 'agent': return 'Agents'
      case 'user': return 'Team Members'
      case 'file': return 'Documents'
      default: return ''
    }
  }

  // Group filtered options by type for section headers
  let lastType = ''

  return (
    <div className="relative w-full">
      <textarea
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className="w-full resize-none rounded-xl border border-border-subtle px-4 py-2.5 text-sm focus:border-forest-green focus:outline-none disabled:opacity-50"
        style={{ minHeight: '40px', maxHeight: '120px' }}
        onInput={(e) => {
          // Auto-resize textarea
          const target = e.target as HTMLTextAreaElement
          target.style.height = 'auto'
          target.style.height = Math.min(target.scrollHeight, 120) + 'px'
        }}
      />

      {/* Mention Dropdown */}
      {showDropdown && filteredOptions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute bottom-full left-0 right-0 mb-1 max-h-60 overflow-y-auto rounded-xl border border-border-subtle bg-white shadow-lg z-50"
        >
          {filteredOptions.map((option, i) => {
            const showHeader = option.type !== lastType
            lastType = option.type
            return (
              <div key={`${option.type}:${option.id}`}>
                {showHeader && (
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted bg-light-surface">
                    {sectionLabel(option.type)}
                  </div>
                )}
                <button
                  data-selected={i === selectedIndex}
                  onClick={() => insertMention(option)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${
                    i === selectedIndex
                      ? 'bg-forest-green/10 text-forest-green'
                      : 'text-text-secondary hover:bg-light-surface-alt'
                  }`}
                >
                  <span
                    className="material-symbols-outlined text-[16px] shrink-0"
                    style={option.iconColor ? { color: option.iconColor } : undefined}
                  >
                    {option.icon}
                  </span>
                  <span className="truncate">{option.label}</span>
                  {option.type === 'agent' && option.status && (
                    <span className={`ml-auto h-2 w-2 rounded-full shrink-0 ${
                      option.status === 'running' ? 'bg-green-500' : 'bg-gray-300'
                    }`} />
                  )}
                  <span className="ml-auto text-[10px] text-text-muted uppercase">
                    {option.type === 'file' ? 'doc' : option.type}
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      )}

      {showDropdown && filteredOptions.length === 0 && mentionQuery && (
        <div className="absolute bottom-full left-0 right-0 mb-1 rounded-xl border border-border-subtle bg-white shadow-lg z-50 px-3 py-3 text-sm text-text-muted">
          No matches for "@{mentionQuery}"
        </div>
      )}
    </div>
  )
}

/**
 * Parse message content and render mention tokens as styled chips.
 * Returns an array of React elements (text spans + mention chips).
 */
export function renderMentionContent(
  content: string,
  onAgentClick?: (agentId: string) => void,
  onFileClick?: (docId: string) => void,
): React.ReactNode[] {
  const regex = /@\[([^\]]+)\]\((agent|user|file):([^)]+)\)/g
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match

  while ((match = regex.exec(content)) !== null) {
    // Add text before the mention
    if (match.index > lastIndex) {
      parts.push(<span key={`t-${lastIndex}`}>{content.slice(lastIndex, match.index)}</span>)
    }

    const [, displayName, type, id] = match
    const key = `m-${match.index}`

    switch (type) {
      case 'agent':
        parts.push(
          <span
            key={key}
            className="inline-flex items-center gap-0.5 rounded bg-forest-green/10 text-forest-green px-1 text-[13px] font-medium cursor-pointer hover:bg-forest-green/20"
            onClick={() => onAgentClick?.(id)}
          >
            <span className="material-symbols-outlined text-[12px]">smart_toy</span>
            @{displayName}
          </span>,
        )
        break
      case 'user':
        parts.push(
          <span
            key={key}
            className="inline-flex items-center gap-0.5 rounded bg-blue-100 text-blue-700 px-1 text-[13px] font-medium"
          >
            <span className="material-symbols-outlined text-[12px]">person</span>
            @{displayName}
          </span>,
        )
        break
      case 'file':
        parts.push(
          <span
            key={key}
            className="inline-flex items-center gap-0.5 rounded bg-amber-100 text-amber-700 px-1 text-[13px] font-medium cursor-pointer hover:bg-amber-200"
            onClick={() => onFileClick?.(id)}
          >
            <span className="material-symbols-outlined text-[12px]">description</span>
            @{displayName}
          </span>,
        )
        break
    }

    lastIndex = match.index + match[0].length
  }

  // Add remaining text after last mention
  if (lastIndex < content.length) {
    parts.push(<span key={`t-${lastIndex}`}>{content.slice(lastIndex)}</span>)
  }

  return parts.length > 0 ? parts : [<span key="raw">{content}</span>]
}

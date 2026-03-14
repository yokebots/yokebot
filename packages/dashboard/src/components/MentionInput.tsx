import { useState, useRef, useEffect, useCallback } from 'react'
import type { MentionCompletionData } from '@/lib/engine'
import { filterCommands, type SlashCommand } from '@/lib/slash-commands'
import data from '@emoji-mart/data'
import Picker from '@emoji-mart/react'

interface MentionInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  placeholder?: string
  completions: MentionCompletionData | null
  disabled?: boolean
  onGifSelect?: (gifUrl: string, title: string) => void
  onFileAttach?: () => void
}

interface MentionOption {
  type: 'agent' | 'user' | 'file' | 'everyone'
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

const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY ?? ''

export function MentionInput({ value, onChange, onSubmit, placeholder, completions, disabled, onGifSelect, onFileAttach }: MentionInputProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionStart, setMentionStart] = useState(-1)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showGifPicker, setShowGifPicker] = useState(false)
  const [gifQuery, setGifQuery] = useState('')
  const [gifResults, setGifResults] = useState<Array<{ id: string; url: string; title: string }>>([])
  const [gifLoading, setGifLoading] = useState(false)
  const [showSlashDropdown, setShowSlashDropdown] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const pendingCursorRef = useRef<number | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const slashDropdownRef = useRef<HTMLDivElement>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)
  const gifPickerRef = useRef<HTMLDivElement>(null)
  const gifSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Map from display label → { type, id } for resolving mentions back to markdown
  const mentionsMapRef = useRef<Map<string, { type: string; id: string }>>(new Map())

  // Derive display text from the resolved markdown value (strip mention syntax for the textarea)
  const displayText = value.replace(/@\[([^\]]+)\]\((\w+):([^)]+)\)/g, (_match, label, type, id) => {
    mentionsMapRef.current.set(label, { type, id })
    return `@${label}`
  })

  // Convert display text back to resolved markdown
  const resolveText = useCallback((display: string) => {
    let resolved = display
    // Sort by label length descending to avoid partial-match collisions
    const entries = [...mentionsMapRef.current.entries()].sort((a, b) => b[0].length - a[0].length)
    for (const [label, { type, id }] of entries) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      resolved = resolved.replace(new RegExp(`@${escaped}(?!\\w)`, 'g'), `@[${label}](${type}:${id})`)
    }
    return resolved
  }, [])

  // Build flat list of all mention options — @Everyone first
  const allOptions: MentionOption[] = completions ? [
    { type: 'everyone' as const, id: 'all', label: 'Everyone', icon: 'groups', iconColor: '#6366f1' },
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

  // Slash command filtering
  const filteredSlashCommands = filterCommands(slashQuery)

  // Clamp selected index
  useEffect(() => {
    if (selectedIndex >= filteredOptions.length) {
      setSelectedIndex(Math.max(0, filteredOptions.length - 1))
    }
  }, [filteredOptions.length, selectedIndex])

  // Clamp slash selected index
  useEffect(() => {
    if (slashSelectedIndex >= filteredSlashCommands.length) {
      setSlashSelectedIndex(Math.max(0, filteredSlashCommands.length - 1))
    }
  }, [filteredSlashCommands.length, slashSelectedIndex])

  // Scroll selected item into view
  useEffect(() => {
    const ref = showSlashDropdown ? slashDropdownRef.current : dropdownRef.current
    if (!ref) return
    const selected = ref.querySelector('[data-selected="true"]')
    if (selected) selected.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex, slashSelectedIndex, showSlashDropdown])

  // Restore cursor after mention insertion
  useEffect(() => {
    if (pendingCursorRef.current !== null && inputRef.current) {
      const pos = pendingCursorRef.current
      inputRef.current.selectionStart = pos
      inputRef.current.selectionEnd = pos
      inputRef.current.focus()
      pendingCursorRef.current = null
    }
  }, [value])

  const selectSlashCommand = useCallback((cmd: SlashCommand) => {
    onChange(`/${cmd.name} `)
    setShowSlashDropdown(false)
    setSlashQuery('')
    setSlashSelectedIndex(0)
    requestAnimationFrame(() => {
      if (inputRef.current) {
        const pos = cmd.name.length + 2
        inputRef.current.selectionStart = pos
        inputRef.current.selectionEnd = pos
        inputRef.current.focus()
      }
    })
  }, [onChange])

  const insertMention = useCallback((option: MentionOption) => {
    const before = displayText.slice(0, mentionStart)
    const after = displayText.slice(inputRef.current?.selectionStart ?? displayText.length)
    const mentionDisplay = `@${option.label} `
    const newDisplayValue = before + mentionDisplay + after

    // Record the mention mapping so resolveText can reconstruct markdown
    mentionsMapRef.current.set(option.label, { type: option.type, id: option.id })

    const pos = before.length + mentionDisplay.length
    pendingCursorRef.current = pos
    onChange(resolveText(newDisplayValue))
    setShowDropdown(false)
    setMentionQuery('')
    setMentionStart(-1)
  }, [displayText, mentionStart, onChange, resolveText])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newDisplayValue = e.target.value
    const cursorPos = e.target.selectionStart

    // Clean up mentions map for any mentions the user deleted
    mentionsMapRef.current.forEach((_val, label) => {
      if (!newDisplayValue.includes(`@${label}`)) {
        mentionsMapRef.current.delete(label)
      }
    })

    onChange(resolveText(newDisplayValue))

    // Detect if we're in a slash command context (/ at start of input)
    if (newDisplayValue.startsWith('/') && !newDisplayValue.includes(' ')) {
      const query = newDisplayValue.slice(1)
      setSlashQuery(query)
      setShowSlashDropdown(true)
      setSlashSelectedIndex(0)
      setShowDropdown(false)
      return
    } else {
      setShowSlashDropdown(false)
      setSlashQuery('')
    }

    // Detect if we're in a mention context
    const textBeforeCursor = newDisplayValue.slice(0, cursorPos)
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
    // Slash command dropdown navigation
    if (showSlashDropdown && filteredSlashCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashSelectedIndex((i) => (i + 1) % filteredSlashCommands.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashSelectedIndex((i) => (i - 1 + filteredSlashCommands.length) % filteredSlashCommands.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        selectSlashCommand(filteredSlashCommands[slashSelectedIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowSlashDropdown(false)
        return
      }
    }

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

  // Close emoji/gif picker on outside click
  useEffect(() => {
    if (!showEmojiPicker && !showGifPicker) return
    const handler = (e: MouseEvent) => {
      if (showEmojiPicker && emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false)
      }
      if (showGifPicker && gifPickerRef.current && !gifPickerRef.current.contains(e.target as Node)) {
        setShowGifPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showEmojiPicker, showGifPicker])

  // Load trending GIFs when picker opens
  useEffect(() => {
    if (!showGifPicker) return
    const loadTrending = async () => {
      setGifLoading(true)
      try {
        const res = await fetch(`https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=20&rating=pg`)
        const data = await res.json()
        setGifResults(data.data.map((g: Record<string, unknown>) => ({
          id: (g as { id: string }).id,
          url: ((g as { images: { fixed_width: { url: string } } }).images.fixed_width.url),
          title: (g as { title: string }).title,
        })))
      } catch { /* ignore */ }
      setGifLoading(false)
    }
    loadTrending()
  }, [showGifPicker])

  const searchGifs = (query: string) => {
    setGifQuery(query)
    if (gifSearchTimer.current) clearTimeout(gifSearchTimer.current)
    if (!query.trim()) {
      // Reload trending
      setShowGifPicker(false)
      setTimeout(() => setShowGifPicker(true), 0)
      return
    }
    gifSearchTimer.current = setTimeout(async () => {
      setGifLoading(true)
      try {
        const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=20&rating=pg`)
        const data = await res.json()
        setGifResults(data.data.map((g: Record<string, unknown>) => ({
          id: (g as { id: string }).id,
          url: ((g as { images: { fixed_width: { url: string } } }).images.fixed_width.url),
          title: (g as { title: string }).title,
        })))
      } catch { /* ignore */ }
      setGifLoading(false)
    }, 300)
  }

  const handleEmojiSelect = (emoji: { native: string }) => {
    const cursorPos = inputRef.current?.selectionStart ?? displayText.length
    const newDisplayValue = displayText.slice(0, cursorPos) + emoji.native + displayText.slice(cursorPos)
    onChange(resolveText(newDisplayValue))
    setShowEmojiPicker(false)
    requestAnimationFrame(() => {
      if (inputRef.current) {
        const pos = cursorPos + emoji.native.length
        inputRef.current.selectionStart = pos
        inputRef.current.selectionEnd = pos
        inputRef.current.focus()
      }
    })
  }

  const sectionLabel = (type: string) => {
    switch (type) {
      case 'everyone': return ''
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
      <div className="relative">
        <textarea
          ref={inputRef}
          value={displayText}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="w-full resize-none rounded-xl border border-border-subtle px-4 py-2.5 pr-28 text-sm text-text-main focus:border-forest-green focus:ring-1 focus:ring-forest-green/30 focus:outline-none disabled:opacity-50"
          style={{ minHeight: '40px', maxHeight: '120px' }}
          onInput={(e) => {
            // Auto-resize textarea
            const target = e.target as HTMLTextAreaElement
            target.style.height = 'auto'
            target.style.height = Math.min(target.scrollHeight, 120) + 'px'
          }}
        />
        {/* GIF + Emoji buttons — z-[3] to stay above mention overlay */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 z-[3] flex items-center gap-0.5">
          {onFileAttach && (
            <button
              type="button"
              onClick={onFileAttach}
              className="rounded-md p-1 text-text-muted hover:text-text-main hover:bg-light-surface-alt transition-colors"
              title="Attach file"
            >
              <span className="material-symbols-outlined text-[18px]">attach_file</span>
            </button>
          )}
          {onGifSelect && (
            <button
              type="button"
              onClick={() => { setShowGifPicker(!showGifPicker); setShowEmojiPicker(false) }}
              className="rounded-md p-1 text-text-muted hover:text-text-main hover:bg-light-surface-alt transition-colors"
              title="Add GIF"
            >
              <span className="material-symbols-outlined text-[18px]">gif_box</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowGifPicker(false) }}
            className="rounded-md p-1 text-text-muted hover:text-text-main hover:bg-light-surface-alt transition-colors"
            title="Add emoji"
          >
            <span className="material-symbols-outlined text-[18px]">mood</span>
          </button>
        </div>
      </div>

      {/* Emoji Picker */}
      {showEmojiPicker && (
        <div ref={emojiPickerRef} className="absolute bottom-full right-0 mb-2 z-50">
          <Picker data={data} onEmojiSelect={handleEmojiSelect} theme="light" previewPosition="none" skinTonePosition="none" />
        </div>
      )}

      {/* GIF Picker */}
      {showGifPicker && (
        <div ref={gifPickerRef} className="absolute bottom-full right-0 mb-2 z-50 w-80 rounded-xl border border-border-subtle bg-white shadow-lg overflow-hidden">
          <div className="p-2 border-b border-border-subtle">
            <input
              type="text"
              value={gifQuery}
              onChange={(e) => searchGifs(e.target.value)}
              placeholder="Search GIFs..."
              className="w-full rounded-lg border border-border-subtle px-3 py-1.5 text-sm focus:border-forest-green focus:outline-none"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-1 p-2 max-h-64 overflow-y-auto">
            {gifLoading && <p className="col-span-2 py-4 text-center text-sm text-text-muted">Loading...</p>}
            {!gifLoading && gifResults.map((gif) => (
              <button
                key={gif.id}
                onClick={() => {
                  onGifSelect?.(gif.url, gif.title)
                  setShowGifPicker(false)
                  setGifQuery('')
                }}
                className="rounded-lg overflow-hidden hover:ring-2 hover:ring-forest-green transition-all"
              >
                <img src={gif.url} alt={gif.title} className="w-full h-24 object-cover" loading="lazy" />
              </button>
            ))}
            {!gifLoading && gifResults.length === 0 && gifQuery && (
              <p className="col-span-2 py-4 text-center text-sm text-text-muted">No GIFs found</p>
            )}
          </div>
          <div className="border-t border-border-subtle px-2 py-1">
            <p className="text-[9px] text-text-muted text-right">Powered by GIPHY</p>
          </div>
        </div>
      )}

      {/* Slash Command Dropdown */}
      {showSlashDropdown && filteredSlashCommands.length > 0 && (
        <div
          ref={slashDropdownRef}
          className="absolute bottom-full left-0 right-0 mb-1 max-h-60 overflow-y-auto rounded-xl border border-border-subtle bg-white shadow-lg z-50 py-1"
        >
          <div className="px-3 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            Commands
          </div>
          {filteredSlashCommands.map((cmd, i) => (
            <button
              key={cmd.name}
              data-selected={i === slashSelectedIndex}
              onClick={() => selectSlashCommand(cmd)}
              className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-sm transition-colors ${
                i === slashSelectedIndex
                  ? 'bg-forest-green/10'
                  : 'hover:bg-light-surface-alt'
              }`}
            >
              <span className="material-symbols-outlined text-[18px] shrink-0 text-forest-green">terminal</span>
              <div className="flex-1 min-w-0 text-left">
                <span className={`font-medium ${i === slashSelectedIndex ? 'text-forest-green' : 'text-text-main'}`}>
                  /{cmd.name}
                </span>
                <span className="ml-2 text-[11px] text-text-muted">{cmd.description}</span>
              </div>
              <span className="ml-auto text-[10px] text-text-muted/60 font-mono shrink-0">{cmd.usage}</span>
            </button>
          ))}
        </div>
      )}

      {showSlashDropdown && filteredSlashCommands.length === 0 && slashQuery && (
        <div className="absolute bottom-full left-0 right-0 mb-1 rounded-xl border border-border-subtle bg-white shadow-lg z-50 px-3 py-3 text-sm text-text-muted">
          No commands matching "/{slashQuery}"
        </div>
      )}

      {/* Mention Dropdown */}
      {showDropdown && filteredOptions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute bottom-full left-0 right-0 mb-1 max-h-60 overflow-y-auto rounded-xl border border-border-subtle bg-white shadow-lg z-50 py-1"
        >
          {filteredOptions.map((option, i) => {
            const showHeader = option.type !== lastType
            lastType = option.type
            return (
              <div key={`${option.type}:${option.id}`}>
                {showHeader && sectionLabel(option.type) && (
                  <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted first:pt-1">
                    {sectionLabel(option.type)}
                  </div>
                )}
                <button
                  data-selected={i === selectedIndex}
                  onClick={() => insertMention(option)}
                  className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-sm transition-colors ${
                    i === selectedIndex
                      ? 'bg-forest-green/10'
                      : 'hover:bg-light-surface-alt'
                  }`}
                >
                  <span
                    className="material-symbols-outlined text-[18px] shrink-0"
                    style={option.iconColor ? { color: option.iconColor } : undefined}
                  >
                    {option.icon}
                  </span>
                  <span className={`truncate font-medium ${i === selectedIndex ? 'text-forest-green' : 'text-text-main'}`}>
                    {option.label}
                  </span>
                  {option.type === 'agent' && option.status && (
                    <span className={`h-2 w-2 rounded-full shrink-0 ${
                      option.status === 'running' ? 'bg-green-500' : 'bg-gray-300'
                    }`} />
                  )}
                  {option.type !== 'everyone' && (
                    <span className="ml-auto text-[10px] text-text-muted uppercase tracking-wide shrink-0">
                      {option.type === 'file' ? 'doc' : option.type}
                    </span>
                  )}
                  {option.type === 'everyone' && (
                    <span className="ml-auto text-[10px] text-indigo-400 uppercase tracking-wide shrink-0">all agents</span>
                  )}
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
/** Render inline markdown: **bold**, *italic*, `code` */
function renderInlineMarkdown(text: string, keyPrefix: string): React.ReactNode {
  // Match **bold**, *italic*, `code` — in that order to avoid conflicts
  const inlineRegex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g
  const parts: React.ReactNode[] = []
  let last = 0
  let m
  while ((m = inlineRegex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if (m[2]) parts.push(<strong key={`${keyPrefix}-b-${m.index}`}>{m[2]}</strong>)
    else if (m[3]) parts.push(<em key={`${keyPrefix}-i-${m.index}`}>{m[3]}</em>)
    else if (m[4]) parts.push(<code key={`${keyPrefix}-c-${m.index}`} className="rounded bg-gray-100 px-1 py-0.5 text-[12px] font-mono">{m[4]}</code>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length === 1 ? parts[0] : <>{parts}</>
}

export function renderMentionContent(
  content: string,
  onAgentClick?: (agentId: string) => void,
  onFileClick?: (docId: string) => void,
  agentColorMap?: Map<string, { color: string; icon: string }>,
  onTaskClick?: (taskId: string) => void,
): React.ReactNode[] {
  const regex = /@\[([^\]]+)\]\((agent|user|file|task|everyone):([^)]+)\)/g
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match

  while ((match = regex.exec(content)) !== null) {
    // Add text before the mention (with inline markdown)
    if (match.index > lastIndex) {
      parts.push(<span key={`t-${lastIndex}`}>{renderInlineMarkdown(content.slice(lastIndex, match.index), `t-${lastIndex}`)}</span>)
    }

    const [, displayName, type, id] = match
    const key = `m-${match.index}`

    switch (type) {
      case 'agent': {
        const agentInfo = agentColorMap?.get(id)
        const color = agentInfo?.color ?? '#0F4D26'
        const icon = agentInfo?.icon ?? 'smart_toy'
        parts.push(
          <span
            key={key}
            className="inline-flex items-center align-middle gap-0.5 rounded px-1 text-[13px] font-medium cursor-pointer"
            style={{ backgroundColor: color + '18', color }}
            onClick={() => onAgentClick?.(id)}
          >
            <span className="material-symbols-outlined text-[12px]">{icon}</span>
            @{displayName}
          </span>,
        )
        break
      }
      case 'user':
        parts.push(
          <span
            key={key}
            className="inline-flex items-center align-middle gap-0.5 rounded bg-blue-100 text-blue-700 px-1 text-[13px] font-medium"
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
            className="inline-flex items-center align-middle gap-0.5 rounded bg-amber-100 text-amber-700 px-1 text-[13px] font-medium cursor-pointer hover:bg-amber-200"
            onClick={() => onFileClick?.(id)}
          >
            <span className="material-symbols-outlined text-[12px]">description</span>
            @{displayName}
          </span>,
        )
        break
      case 'task':
        parts.push(
          <span
            key={key}
            className="inline-flex items-center align-middle gap-0.5 rounded bg-emerald-100 text-emerald-700 px-1 text-[13px] font-medium cursor-pointer hover:bg-emerald-200"
            onClick={() => onTaskClick?.(id)}
          >
            <span className="material-symbols-outlined text-[12px]">task_alt</span>
            {displayName}
          </span>,
        )
        break
      case 'everyone':
        parts.push(
          <span
            key={key}
            className="inline-flex items-center align-middle gap-0.5 rounded bg-indigo-100 text-indigo-700 px-1 text-[13px] font-medium"
          >
            <span className="material-symbols-outlined text-[12px]">groups</span>
            @Everyone
          </span>,
        )
        break
    }

    lastIndex = match.index + match[0].length
  }

  // Add remaining text after last mention (with inline markdown)
  if (lastIndex < content.length) {
    parts.push(<span key={`t-${lastIndex}`}>{renderInlineMarkdown(content.slice(lastIndex), `t-${lastIndex}`)}</span>)
  }

  return parts.length > 0 ? parts : [<span key="raw">{content}</span>]
}

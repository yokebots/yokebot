/**
 * TagManager — Shared tag management component
 *
 * Shows current tags as colored pills with remove button.
 * "+" button opens dropdown to pick existing tags or create new ones.
 */

import { useState, useEffect, useRef } from 'react'
import * as engine from '@/lib/engine'
import type { Tag, TaskTag } from '@/lib/engine'

const TAG_COLORS = [
  { name: 'Red', hex: '#EF4444' },
  { name: 'Amber', hex: '#F59E0B' },
  { name: 'Green', hex: '#10B981' },
  { name: 'Blue', hex: '#3B82F6' },
  { name: 'Purple', hex: '#8B5CF6' },
  { name: 'Pink', hex: '#EC4899' },
  { name: 'Gray', hex: '#6B7280' },
  { name: 'Orange', hex: '#F97316' },
]

interface TagManagerProps {
  resourceType: string
  resourceId: string
  currentTags: TaskTag[]
  onTagsChange: (tags: TaskTag[]) => void
}

export default function TagManager({ resourceType, resourceId, currentTags, onTagsChange }: TagManagerProps) {
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [open, setOpen] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#3B82F6')
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    engine.listTags().then(setAllTags).catch(() => {})
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const currentIds = new Set(currentTags.map((t) => t.id))
  const available = allTags.filter((t) => !currentIds.has(t.id))

  async function addTag(tag: Tag) {
    const next = [...currentTags, { id: tag.id, name: tag.name, color: tag.color }]
    onTagsChange(next)
    await engine.setResourceTags(next.map((t) => t.id), resourceType, resourceId)
    setOpen(false)
  }

  async function removeTag(tagId: string) {
    const next = currentTags.filter((t) => t.id !== tagId)
    onTagsChange(next)
    await engine.setResourceTags(next.map((t) => t.id), resourceType, resourceId)
  }

  async function createAndAdd() {
    const name = newTagName.trim()
    if (!name) return
    const tag = await engine.createTag(name, newTagColor)
    setAllTags((prev) => [...prev, tag])
    setNewTagName('')
    await addTag(tag)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {currentTags.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
          style={{ backgroundColor: tag.color }}
        >
          {tag.name}
          <button
            onClick={() => removeTag(tag.id)}
            className="ml-0.5 hover:text-white/70 text-white/90"
            title="Remove tag"
          >
            ×
          </button>
        </span>
      ))}

      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setOpen(!open)}
          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-zinc-700 hover:bg-zinc-600 text-zinc-400 text-xs"
          title="Add tag"
        >
          +
        </button>

        {open && (
          <div className="absolute z-50 mt-1 left-0 w-56 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl p-2 space-y-1">
            {available.length > 0 && (
              <div className="space-y-0.5 max-h-36 overflow-y-auto">
                {available.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => addTag(tag)}
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-zinc-700 text-sm text-left"
                  >
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                    <span className="text-zinc-200 truncate">{tag.name}</span>
                  </button>
                ))}
              </div>
            )}

            {available.length > 0 && <div className="border-t border-zinc-700 my-1" />}

            <div className="space-y-2">
              <input
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createAndAdd()}
                placeholder="New tag name..."
                className="w-full px-2 py-1.5 text-sm bg-zinc-900 border border-zinc-700 rounded text-zinc-200 placeholder-zinc-500"
                autoFocus
              />
              <div className="flex items-center gap-1">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    onClick={() => setNewTagColor(c.hex)}
                    className={`w-5 h-5 rounded-full border-2 ${newTagColor === c.hex ? 'border-white' : 'border-transparent'}`}
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                  />
                ))}
              </div>
              {newTagName.trim() && (
                <button
                  onClick={createAndAdd}
                  className="w-full px-2 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 rounded text-white"
                >
                  Create "{newTagName.trim()}"
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * TagFilterBar — Horizontal row of tag chips for filtering
 *
 * Shows all team tags. Click to toggle active/inactive.
 * Parent receives selectedTags to apply server-side or client-side filter.
 */

import { useState, useEffect } from 'react'
import * as engine from '@/lib/engine'
import type { Tag } from '@/lib/engine'

interface TagFilterBarProps {
  selectedTags: string[]
  onSelectionChange: (tagNames: string[]) => void
}

export default function TagFilterBar({ selectedTags, onSelectionChange }: TagFilterBarProps) {
  const [tags, setTags] = useState<Tag[]>([])

  useEffect(() => {
    engine.listTags().then(setTags).catch(() => {})
  }, [])

  if (tags.length === 0) return null

  function toggle(name: string) {
    if (selectedTags.includes(name)) {
      onSelectionChange(selectedTags.filter((t) => t !== name))
    } else {
      onSelectionChange([...selectedTags, name])
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-zinc-500 mr-0.5">Tags:</span>
      {tags.map((tag) => {
        const active = selectedTags.includes(tag.name)
        return (
          <button
            key={tag.id}
            onClick={() => toggle(tag.name)}
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium transition-opacity ${
              active ? 'opacity-100' : 'opacity-40 hover:opacity-70'
            }`}
            style={{
              backgroundColor: active ? tag.color : undefined,
              color: active ? '#fff' : tag.color,
              border: active ? 'none' : `1px solid ${tag.color}`,
            }}
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
            {tag.name}
          </button>
        )
      })}
      {selectedTags.length > 0 && (
        <button
          onClick={() => onSelectionChange([])}
          className="text-xs text-zinc-500 hover:text-zinc-300 ml-1"
        >
          Clear
        </button>
      )}
    </div>
  )
}

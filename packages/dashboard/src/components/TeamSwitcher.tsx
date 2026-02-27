/**
 * TeamSwitcher.tsx — Dropdown for switching between teams
 */

import { useState, useRef, useEffect } from 'react'
import { useTeam } from '../lib/team-context'

export default function TeamSwitcher() {
  const { teams, activeTeam, switchTeam, createAndSwitchTeam } = useTeam()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleCreate() {
    if (!newName.trim()) return
    await createAndSwitchTeam(newName.trim())
    setNewName('')
    setCreating(false)
    setOpen(false)
  }

  if (!activeTeam) return null

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg hover:bg-gray-800 transition-colors text-left"
      >
        <span className="w-6 h-6 rounded bg-green-500/20 text-green-400 flex items-center justify-center text-xs font-bold">
          {activeTeam.name.charAt(0).toUpperCase()}
        </span>
        <span className="flex-1 truncate text-white font-medium">{activeTeam.name}</span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
          {teams.map((team) => (
            <button
              key={team.id}
              onClick={() => { switchTeam(team.id); setOpen(false) }}
              className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-gray-700 transition-colors ${team.id === activeTeam.id ? 'bg-gray-700/50 text-green-400' : 'text-gray-300'}`}
            >
              <span className="w-5 h-5 rounded bg-green-500/20 text-green-400 flex items-center justify-center text-[10px] font-bold">
                {team.name.charAt(0).toUpperCase()}
              </span>
              <span className="flex-1 truncate">{team.name}</span>
              {team.role && <span className="text-[10px] text-gray-500 uppercase">{team.role}</span>}
            </button>
          ))}

          <div className="border-t border-gray-700">
            {creating ? (
              <div className="p-2 flex gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  placeholder="Team name..."
                  className="flex-1 px-2 py-1 text-sm bg-gray-900 border border-gray-600 rounded text-white focus:outline-none focus:border-green-500"
                  autoFocus
                />
                <button onClick={handleCreate} className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-500">
                  Create
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
              >
                <span className="w-5 h-5 rounded border border-dashed border-gray-500 flex items-center justify-center text-xs">+</span>
                Create Team
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

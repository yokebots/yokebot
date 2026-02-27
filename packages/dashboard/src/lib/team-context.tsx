/**
 * team-context.tsx — Team context provider
 *
 * Loads the user's teams, persists the active team in localStorage,
 * and sets the X-Team-Id header on all API requests.
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { listTeams, createTeam, setActiveTeamId, type Team } from './engine'
import { supabase } from './supabase'

interface TeamContextValue {
  teams: Team[]
  activeTeam: Team | null
  loading: boolean
  switchTeam: (teamId: string) => void
  refresh: () => Promise<void>
  createAndSwitchTeam: (name: string) => Promise<Team>
}

const TeamContext = createContext<TeamContextValue | null>(null)

const STORAGE_KEY = 'yokebot_active_team_id'

export function TeamProvider({ children }: { children: ReactNode }) {
  const [teams, setTeams] = useState<Team[]>([])
  const [activeTeam, setActiveTeam] = useState<Team | null>(null)
  const [loading, setLoading] = useState(true)

  const loadTeams = useCallback(async () => {
    try {
      const userTeams = await listTeams()

      // If user has no teams, auto-create one
      if (userTeams.length === 0) {
        const { data: { user } } = await supabase.auth.getUser()
        const name = user?.user_metadata?.full_name
          ? `${user.user_metadata.full_name}'s Team`
          : 'My Team'
        const newTeam = await createTeam(name)
        userTeams.push({ ...newTeam, role: 'admin' })
      }

      setTeams(userTeams)

      // Restore active team from localStorage
      const stored = localStorage.getItem(STORAGE_KEY)
      const match = userTeams.find((t) => t.id === stored)
      const team = match ?? userTeams[0]

      setActiveTeam(team)
      setActiveTeamId(team.id)
    } catch (err) {
      console.error('[team-context] Failed to load teams:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTeams()
  }, [loadTeams])

  const switchTeam = useCallback((teamId: string) => {
    const team = teams.find((t) => t.id === teamId)
    if (!team) return
    setActiveTeam(team)
    setActiveTeamId(team.id)
    localStorage.setItem(STORAGE_KEY, teamId)
  }, [teams])

  const createAndSwitchTeam = useCallback(async (name: string) => {
    const newTeam = await createTeam(name)
    const teamWithRole = { ...newTeam, role: 'admin' }
    setTeams((prev) => [...prev, teamWithRole])
    setActiveTeam(teamWithRole)
    setActiveTeamId(teamWithRole.id)
    localStorage.setItem(STORAGE_KEY, teamWithRole.id)
    return teamWithRole
  }, [])

  return (
    <TeamContext.Provider value={{ teams, activeTeam, loading, switchTeam, refresh: loadTeams, createAndSwitchTeam }}>
      {children}
    </TeamContext.Provider>
  )
}

export function useTeam() {
  const ctx = useContext(TeamContext)
  if (!ctx) throw new Error('useTeam must be used within TeamProvider')
  return ctx
}

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import * as engine from '@/lib/engine'

export function TeamPage() {
  const { user } = useAuth()
  const [teams, setTeams] = useState<engine.Team[]>([])
  const [members, setMembers] = useState<engine.TeamMember[]>([])
  const [selectedTeam, setSelectedTeam] = useState<engine.Team | null>(null)
  const [newTeamName, setNewTeamName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadTeams = async () => {
    try {
      const data = await engine.listTeams()
      setTeams(data)
      if (data.length > 0 && !selectedTeam) {
        setSelectedTeam(data[0])
      }
    } catch { setError('Failed to load teams') }
    setLoading(false)
  }

  const loadMembers = async (teamId: string) => {
    try {
      const data = await engine.getTeamMembers(teamId)
      setMembers(data)
    } catch { /* ignore */ }
  }

  useEffect(() => { loadTeams() }, [])
  useEffect(() => { if (selectedTeam) loadMembers(selectedTeam.id) }, [selectedTeam?.id])

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return
    try {
      const team = await engine.createTeam(newTeamName.trim())
      setNewTeamName('')
      setSelectedTeam(team)
      await loadTeams()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to create team') }
  }

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !selectedTeam) return
    try {
      // Backend will look up the real user ID by email if they already exist
      await engine.addTeamMember(selectedTeam.id, inviteEmail.trim(), inviteEmail.trim())
      setInviteEmail('')
      setError('')
      await loadMembers(selectedTeam.id)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to invite member') }
  }

  const handleRoleChange = async (userId: string, role: string) => {
    if (!selectedTeam) return
    await engine.updateTeamMemberRole(selectedTeam.id, userId, role)
    await loadMembers(selectedTeam.id)
  }

  const handleRemove = async (userId: string) => {
    if (!selectedTeam) return
    await engine.removeTeamMember(selectedTeam.id, userId)
    await loadMembers(selectedTeam.id)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="material-symbols-outlined animate-spin text-3xl text-text-muted">progress_activity</span>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-text-main">Team</h1>
        <p className="mt-1 text-sm text-text-muted">Manage your team members and roles.</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError('')} className="ml-2 font-bold">×</button>
        </div>
      )}

      {/* Create team (if none exist) */}
      {teams.length === 0 && (
        <div className="rounded-xl border border-border-subtle bg-white p-8 text-center shadow-soft">
          <span className="material-symbols-outlined mb-4 text-5xl text-text-muted">group_add</span>
          <h2 className="font-display text-lg font-bold text-text-main">Create your team</h2>
          <p className="mt-1 text-sm text-text-muted">Get started by creating a team to collaborate with others.</p>
          <div className="mt-6 flex items-center justify-center gap-2">
            <input
              type="text"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateTeam()}
              placeholder="Team name"
              className="rounded-lg border border-border-subtle bg-white px-4 py-2 text-sm focus:border-forest-green focus:outline-none"
            />
            <button
              onClick={handleCreateTeam}
              className="rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white hover:bg-forest-green/90 transition-colors"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {/* Team selector (if multiple) */}
      {teams.length > 1 && (
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-text-secondary">Team:</label>
          <select
            value={selectedTeam?.id ?? ''}
            onChange={(e) => setSelectedTeam(teams.find((t) => t.id === e.target.value) ?? null)}
            className="rounded-lg border border-border-subtle bg-white px-3 py-1.5 text-sm focus:border-forest-green focus:outline-none"
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name} {t.role ? `(${t.role})` : ''}</option>
            ))}
          </select>
        </div>
      )}

      {/* Members list */}
      {selectedTeam && (
        <div className="rounded-xl border border-border-subtle bg-white shadow-soft">
          <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
            <div>
              <h2 className="font-display text-lg font-bold text-text-main">{selectedTeam.name}</h2>
              <p className="text-xs text-text-muted">{members.length} member{members.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          <div className="divide-y divide-border-subtle">
            {members.map((m) => {
              const isCurrentUser = m.email === user?.email || m.userId === user?.id
              return (
                <div key={m.userId} className="flex items-center gap-4 px-6 py-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-forest-green/10 text-sm font-bold text-forest-green">
                    {m.email[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-main">
                      {m.email}
                      {isCurrentUser && <span className="ml-2 text-xs text-text-muted">(you)</span>}
                    </p>
                    <p className="text-xs text-text-muted">Joined {new Date(m.joinedAt).toLocaleDateString()}</p>
                  </div>
                  <select
                    value={m.role}
                    onChange={(e) => handleRoleChange(m.userId, e.target.value)}
                    disabled={isCurrentUser}
                    className="rounded-lg border border-border-subtle bg-white px-2 py-1 text-xs focus:border-forest-green focus:outline-none disabled:opacity-50"
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  {!isCurrentUser && (
                    <button
                      onClick={() => handleRemove(m.userId)}
                      className="rounded-lg p-1.5 text-text-muted hover:bg-red-50 hover:text-red-500 transition-colors"
                      title="Remove member"
                    >
                      <span className="material-symbols-outlined text-[18px]">person_remove</span>
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* Invite form */}
          <div className="border-t border-border-subtle px-6 py-4">
            <p className="mb-2 text-sm font-medium text-text-secondary">Invite a member</p>
            <div className="flex gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                placeholder="email@example.com"
                className="flex-1 rounded-lg border border-border-subtle bg-white px-4 py-2 text-sm focus:border-forest-green focus:outline-none"
              />
              <button
                onClick={handleInvite}
                disabled={!inviteEmail.trim()}
                className="rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white hover:bg-forest-green/90 transition-colors disabled:opacity-50"
              >
                Invite
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create additional team */}
      {teams.length > 0 && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateTeam()}
            placeholder="New team name"
            className="rounded-lg border border-border-subtle bg-white px-4 py-2 text-sm focus:border-forest-green focus:outline-none"
          />
          <button
            onClick={handleCreateTeam}
            disabled={!newTeamName.trim()}
            className="rounded-lg border border-border-subtle px-4 py-2 text-sm font-medium text-text-secondary hover:bg-light-surface-alt transition-colors disabled:opacity-50"
          >
            + Create Team
          </button>
        </div>
      )}
    </div>
  )
}

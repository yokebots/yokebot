import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@/lib/auth'
import * as engine from '@/lib/engine'
import { SettingsLayout } from '@/components/SettingsLayout'

export function TeamPage() {
  const { user } = useAuth()
  const [teams, setTeams] = useState<engine.Team[]>([])
  const [members, setMembers] = useState<engine.TeamMember[]>([])
  const [selectedTeam, setSelectedTeam] = useState<engine.Team | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hasSubscription, setHasSubscription] = useState(false)

  // Inline rename state
  const [editingName, setEditingName] = useState(false)
  const [editName, setEditName] = useState('')
  const renameRef = useRef<HTMLInputElement>(null)

  // New team creation state
  const [showNewTeam, setShowNewTeam] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')

  // Team logo upload state
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  const loadTeams = async () => {
    try {
      const data = await engine.listTeams()
      setTeams(data)
      if (data.length > 0 && !selectedTeam) {
        setSelectedTeam(data[0])
      } else if (selectedTeam) {
        const updated = data.find((t) => t.id === selectedTeam.id)
        if (updated) setSelectedTeam(updated)
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

  useEffect(() => {
    loadTeams()
    engine.getBillingStatus().then((s) => {
      setHasSubscription(!!s.subscription)
    }).catch(() => {})
  }, [])
  useEffect(() => { if (selectedTeam) loadMembers(selectedTeam.id) }, [selectedTeam?.id])

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return
    try {
      const team = await engine.createTeam(newTeamName.trim())
      setNewTeamName('')
      setShowNewTeam(false)
      setSelectedTeam(team)
      await loadTeams()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to create team') }
  }

  const handleRename = async () => {
    if (!editName.trim() || !selectedTeam || editName.trim() === selectedTeam.name) {
      setEditingName(false)
      return
    }
    try {
      await engine.updateTeam(selectedTeam.id, { name: editName.trim() })
      setEditingName(false)
      await loadTeams()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to rename team') }
  }

  const startRename = () => {
    if (!selectedTeam) return
    setEditName(selectedTeam.name)
    setEditingName(true)
    requestAnimationFrame(() => renameRef.current?.focus())
  }

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !selectedTeam) return
    try {
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

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedTeam) return
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setError('Only PNG and JPG images are supported')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Logo must be under 2MB')
      return
    }
    setUploadingLogo(true)
    try {
      await engine.uploadTeamLogo(selectedTeam.id, file)
      await loadTeams()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload logo')
    } finally {
      setUploadingLogo(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  if (loading) {
    return (
      <SettingsLayout activeTab="team">
        <div className="flex items-center justify-center py-24">
          <span className="material-symbols-outlined animate-spin text-3xl text-text-muted">progress_activity</span>
        </div>
      </SettingsLayout>
    )
  }

  return (
    <SettingsLayout activeTab="team">
      <div className="max-w-3xl space-y-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
            <button onClick={() => setError('')} className="ml-2 font-bold">&times;</button>
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

        {/* Team card with logo + members */}
        {selectedTeam && (
          <div className="rounded-xl border border-border-subtle bg-white shadow-soft">
            <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
              <div className="flex items-center gap-4">
                {/* Team logo */}
                <div className="group relative">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border-subtle bg-light-surface-alt overflow-hidden">
                    <TeamLogoDisplay teamId={selectedTeam.id} fallbackName={selectedTeam.name} />
                  </div>
                  <button
                    onClick={() => logoInputRef.current?.click()}
                    className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="Change logo"
                  >
                    <span className="material-symbols-outlined text-[16px] text-white">
                      {uploadingLogo ? 'progress_activity' : 'photo_camera'}
                    </span>
                  </button>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                </div>

                <div className="group">
                  {editingName ? (
                    <div className="flex items-center gap-2">
                      <input
                        ref={renameRef}
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename()
                          if (e.key === 'Escape') setEditingName(false)
                        }}
                        onBlur={handleRename}
                        className="rounded-lg border border-forest-green bg-white px-2.5 py-1 font-display text-lg font-bold text-text-main focus:outline-none"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h2 className="font-display text-lg font-bold text-text-main">{selectedTeam.name}</h2>
                      <button
                        onClick={startRename}
                        className="rounded p-0.5 text-text-muted opacity-0 hover:bg-light-surface-alt hover:text-text-main group-hover:opacity-100 transition-all"
                        title="Rename team"
                      >
                        <span className="material-symbols-outlined text-[16px]">edit</span>
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-text-muted">{members.length} member{members.length !== 1 ? 's' : ''}</p>
                </div>
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

        {/* Create additional team — only for subscribers */}
        {teams.length > 0 && hasSubscription && !showNewTeam && (
          <button
            onClick={() => setShowNewTeam(true)}
            className="flex items-center gap-1.5 text-sm text-text-muted hover:text-forest-green transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            New Team
          </button>
        )}

        {/* Upgrade prompt for free users */}
        {teams.length > 0 && !hasSubscription && (
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <span className="material-symbols-outlined text-[16px]">lock</span>
            <span>
              <Link to="/settings/billing" className="text-forest-green hover:underline">Upgrade your plan</Link>
              {' '}to create additional teams.
            </span>
          </div>
        )}

        {showNewTeam && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateTeam()
                if (e.key === 'Escape') { setShowNewTeam(false); setNewTeamName('') }
              }}
              placeholder="New team name"
              className="rounded-lg border border-border-subtle bg-white px-4 py-2 text-sm focus:border-forest-green focus:outline-none"
              autoFocus
            />
            <button
              onClick={handleCreateTeam}
              disabled={!newTeamName.trim()}
              className="rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white hover:bg-forest-green/90 transition-colors disabled:opacity-50"
            >
              Create
            </button>
            <button
              onClick={() => { setShowNewTeam(false); setNewTeamName('') }}
              className="rounded-lg px-3 py-2 text-sm text-text-muted hover:text-text-main transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </SettingsLayout>
  )
}

function TeamLogoDisplay({ teamId, fallbackName }: { teamId: string; fallbackName: string }) {
  const [hasLogo, setHasLogo] = useState(true)
  const logoUrl = engine.getTeamLogoUrl(teamId)

  if (hasLogo) {
    return (
      <img
        src={logoUrl}
        alt={fallbackName}
        className="h-full w-full object-cover"
        onError={() => setHasLogo(false)}
      />
    )
  }

  return (
    <span className="text-lg font-bold text-text-muted">
      {fallbackName[0]?.toUpperCase() ?? 'T'}
    </span>
  )
}

export { TeamLogoDisplay }

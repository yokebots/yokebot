import { useAuth } from '@/lib/auth'
import { useTeam } from '@/lib/team-context'

export function ProfilePage() {
  const { user, signOut } = useAuth()
  const { activeTeam } = useTeam()

  const displayName = user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'User'
  const email = user?.email ?? ''
  const initial = email[0]?.toUpperCase() ?? 'U'
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-text-main">Profile</h1>
        <p className="text-sm text-text-muted">Your account details.</p>
      </div>

      {/* Profile Card */}
      <div className="rounded-lg border border-border-subtle bg-white p-6">
        <div className="flex items-center gap-5">
          {avatarUrl ? (
            <img src={avatarUrl} alt={displayName} className="h-16 w-16 rounded-full" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-tr from-forest-green to-green-300 text-xl font-bold text-white">
              {initial}
            </div>
          )}
          <div>
            <h2 className="text-lg font-bold text-text-main">{displayName}</h2>
            <p className="text-sm text-text-muted">{email}</p>
            {activeTeam && (
              <p className="mt-1 text-xs text-text-muted">
                {activeTeam.name} &middot; {activeTeam.role ? activeTeam.role.charAt(0).toUpperCase() + activeTeam.role.slice(1) : 'Member'}
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 border-t border-border-subtle pt-6 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Display Name</label>
            <p className="text-sm text-text-main">{displayName}</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Email</label>
            <p className="text-sm text-text-main">{email}</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Auth Provider</label>
            <p className="text-sm text-text-main capitalize">{user?.app_metadata?.provider ?? 'email'}</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Account Created</label>
            <p className="text-sm text-text-main">{user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}</p>
          </div>
        </div>

        <div className="mt-6 border-t border-border-subtle pt-6">
          <button
            onClick={signOut}
            className="flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}

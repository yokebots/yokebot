import { useState } from 'react'
import { useAuth } from '@/lib/auth'
import { useTeam } from '@/lib/team-context'
import { Link } from 'react-router'
import { SettingsLayout } from '@/components/SettingsLayout'
import { updateUserProfile } from '@/lib/engine'
import { supabase } from '@/lib/supabase'

const AVATAR_COLORS = [
  { id: 'green',  bg: 'bg-green-100',  text: 'text-green-600',  border: 'border-green-200', ring: 'ring-green-400' },
  { id: 'blue',   bg: 'bg-blue-100',   text: 'text-blue-600',   border: 'border-blue-200', ring: 'ring-blue-400' },
  { id: 'purple', bg: 'bg-purple-100', text: 'text-purple-600', border: 'border-purple-200', ring: 'ring-purple-400' },
  { id: 'amber',  bg: 'bg-amber-100',  text: 'text-amber-600',  border: 'border-amber-200', ring: 'ring-amber-400' },
  { id: 'red',    bg: 'bg-red-100',    text: 'text-red-600',    border: 'border-red-200', ring: 'ring-red-400' },
  { id: 'pink',   bg: 'bg-pink-100',   text: 'text-pink-600',   border: 'border-pink-200', ring: 'ring-pink-400' },
  { id: 'cyan',   bg: 'bg-cyan-100',   text: 'text-cyan-600',   border: 'border-cyan-200', ring: 'ring-cyan-400' },
  { id: 'indigo', bg: 'bg-indigo-100', text: 'text-indigo-600', border: 'border-indigo-200', ring: 'ring-indigo-400' },
] as const

const AVATAR_ICONS = [
  'person', 'face', 'face_2', 'face_3', 'face_4', 'face_5', 'face_6',
  'sentiment_satisfied', 'sentiment_very_satisfied', 'mood',
  'emoji_people', 'self_improvement', 'directions_run', 'hiking',
  'surfing', 'skateboarding', 'sports_martial_arts', 'rowing',
  'elderly', 'pregnant_woman',
]

const COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = Object.fromEntries(
  AVATAR_COLORS.map((c) => [c.id, { bg: c.bg, text: c.text, border: c.border }])
)

function getUserAvatar(user: { user_metadata?: Record<string, unknown>; email?: string } | null) {
  const iconName = user?.user_metadata?.icon_name as string | undefined
  const iconColor = user?.user_metadata?.icon_color as string | undefined
  if (iconName && iconColor && COLOR_MAP[iconColor]) {
    return { type: 'icon' as const, symbol: iconName, ...COLOR_MAP[iconColor] }
  }
  return { type: 'initial' as const, letter: (user?.email?.[0]?.toUpperCase() ?? 'U') }
}

export { getUserAvatar, COLOR_MAP, AVATAR_COLORS, AVATAR_ICONS }

export function ProfilePage() {
  const { user, signOut } = useAuth()
  const { activeTeam } = useTeam()

  const displayName = user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'User'
  const email = user?.email ?? ''
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined

  const currentIcon = (user?.user_metadata?.icon_name as string | undefined) ?? null
  const currentColor = (user?.user_metadata?.icon_color as string | undefined) ?? null

  const [showModal, setShowModal] = useState(false)
  const [selectedIcon, setSelectedIcon] = useState<string | null>(currentIcon)
  const [selectedColor, setSelectedColor] = useState<string | null>(currentColor)
  const [saving, setSaving] = useState(false)

  const avatar = getUserAvatar(user)

  const handleSave = async (icon: string, color: string) => {
    setSaving(true)
    try {
      await updateUserProfile({ iconName: icon, iconColor: color })
      await supabase.auth.refreshSession()
      setShowModal(false)
    } catch (err) {
      console.error('Failed to update avatar:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleSelect = (icon: string | null, color: string | null) => {
    const newIcon = icon ?? selectedIcon
    const newColor = color ?? selectedColor
    if (icon) setSelectedIcon(icon)
    if (color) setSelectedColor(color)
    if (newIcon && newColor) {
      handleSave(newIcon, newColor)
    }
  }

  const openModal = () => {
    setSelectedIcon(currentIcon)
    setSelectedColor(currentColor)
    setShowModal(true)
  }

  return (
    <SettingsLayout activeTab="user">
      <div className="max-w-2xl">
        {/* Profile Card */}
        <div className="rounded-lg border border-border-subtle bg-white p-6">
          <div className="flex items-center gap-5">
            {/* Avatar with edit overlay */}
            <div className="group relative cursor-pointer" onClick={avatarUrl ? undefined : openModal}>
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName} className="h-16 w-16 rounded-full" />
              ) : avatar.type === 'icon' ? (
                <div className={`flex h-16 w-16 items-center justify-center rounded-full ${avatar.bg} ${avatar.border} border`}>
                  <span className={`material-symbols-outlined text-3xl ${avatar.text}`}>{avatar.symbol}</span>
                </div>
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-tr from-forest-green to-green-300 text-xl font-bold text-white">
                  {avatar.letter}
                </div>
              )}
              {/* Edit overlay — hidden for OAuth avatars */}
              {!avatarUrl && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="material-symbols-outlined text-[20px] text-white">edit</span>
                </div>
              )}
            </div>

            <div>
              <h2 className="text-lg font-bold text-text-main">{displayName}</h2>
              <p className="text-sm text-text-muted">{email}</p>
              {activeTeam && (
                <Link to="/settings/team" className="mt-1 flex items-center gap-1 text-xs text-text-muted hover:text-forest-green transition-colors group">
                  {activeTeam.name} &middot; {activeTeam.role ? activeTeam.role.charAt(0).toUpperCase() + activeTeam.role.slice(1) : 'Member'}
                  <span className="material-symbols-outlined text-[12px] opacity-0 group-hover:opacity-100 transition-opacity">arrow_forward</span>
                </Link>
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

      {/* Avatar Picker Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowModal(false)}>
          <div className="mx-4 w-full max-w-md rounded-xl border border-border-subtle bg-white p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-lg font-bold text-text-main">Customize Avatar</h3>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-1 text-text-muted hover:text-text-main transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Preview */}
            <div className="flex justify-center mb-5">
              {selectedIcon && selectedColor && COLOR_MAP[selectedColor] ? (
                <div className={`flex h-20 w-20 items-center justify-center rounded-full ${COLOR_MAP[selectedColor].bg} ${COLOR_MAP[selectedColor].border} border-2`}>
                  <span className={`material-symbols-outlined text-4xl ${COLOR_MAP[selectedColor].text}`}>{selectedIcon}</span>
                </div>
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-tr from-forest-green to-green-300 text-2xl font-bold text-white">
                  {email[0]?.toUpperCase() ?? 'U'}
                </div>
              )}
            </div>

            {/* Color Picker */}
            <div className="mb-5">
              <label className="mb-2 block text-xs font-medium text-text-secondary">Color</label>
              <div className="flex justify-center gap-3">
                {AVATAR_COLORS.map((color) => (
                  <button
                    key={color.id}
                    onClick={() => handleSelect(null, color.id)}
                    className={`h-8 w-8 rounded-full ${color.bg} border-2 transition-all ${
                      selectedColor === color.id
                        ? `${color.border} ring-2 ring-offset-2 ${color.ring} scale-110`
                        : 'border-transparent hover:scale-110'
                    }`}
                    title={color.id}
                  />
                ))}
              </div>
            </div>

            {/* Icon Picker */}
            <div>
              <label className="mb-2 block text-xs font-medium text-text-secondary">Icon</label>
              <div className="grid grid-cols-10 gap-1.5">
                {AVATAR_ICONS.map((icon) => {
                  const colorStyles = selectedColor && COLOR_MAP[selectedColor]
                    ? COLOR_MAP[selectedColor]
                    : { bg: 'bg-gray-100', text: 'text-gray-500', border: 'border-gray-200' }
                  return (
                    <button
                      key={icon}
                      onClick={() => handleSelect(icon, null)}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg transition-all ${
                        selectedIcon === icon
                          ? `${colorStyles.bg} ${colorStyles.border} border-2 scale-110 ${colorStyles.text}`
                          : 'border border-transparent hover:bg-gray-50 text-gray-400 hover:text-gray-600 hover:scale-105'
                      }`}
                      title={icon.replace(/_/g, ' ')}
                    >
                      <span className="material-symbols-outlined text-[20px]">{icon}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {saving && (
              <div className="mt-4 flex items-center justify-center gap-2 text-sm text-text-muted">
                <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                Saving...
              </div>
            )}
          </div>
        </div>
      )}
    </SettingsLayout>
  )
}

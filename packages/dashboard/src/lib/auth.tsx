import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signInWithGitHub: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/** Generate a random nonce, store the raw value, and return the SHA-256 hash for Google. */
async function generateNonce(): Promise<{ raw: string; hashed: string }> {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  const raw = Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('')
  sessionStorage.setItem('google_oauth_nonce', raw)

  // Google receives the hashed nonce in the JWT; Supabase hashes the raw nonce to compare
  const encoder = new TextEncoder()
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(raw))
  const hashed = Array.from(new Uint8Array(hashBuffer), (b) => b.toString(16).padStart(2, '0')).join('')

  return { raw, hashed }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  /**
   * Direct Google OAuth — bypasses Supabase's hosted auth screen.
   * Redirects straight to Google's consent screen, then the callback
   * page feeds the id_token back into Supabase via signInWithIdToken().
   */
  const signInWithGoogle = async () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId) {
      console.error('VITE_GOOGLE_CLIENT_ID not configured')
      return
    }

    const { hashed } = await generateNonce()
    const redirectUri = `${window.location.origin}/auth/callback`

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'id_token',
      scope: 'openid email profile',
      nonce: hashed,
      prompt: 'select_account',
    })

    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  }

  /** GitHub OAuth via Supabase (fallback / secondary provider). */
  const signInWithGitHub = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: `${window.location.origin}/` },
    })
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, signInWithGoogle, signInWithGitHub, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

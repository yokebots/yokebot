import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '@/lib/supabase'

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    const handleCallback = async () => {
      // Extract id_token from URL hash fragment (#id_token=...&...)
      const hash = window.location.hash.substring(1)
      const params = new URLSearchParams(hash)
      const idToken = params.get('id_token')

      if (!idToken) {
        setError('No authentication token received from Google.')
        return
      }

      // Retrieve the nonce we stored before redirecting
      const nonce = sessionStorage.getItem('google_oauth_nonce')
      sessionStorage.removeItem('google_oauth_nonce')

      if (!nonce) {
        setError('Authentication session expired. Please try again.')
        return
      }

      // Exchange the Google id_token for a Supabase session
      const { error: authError } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
        nonce,
      })

      if (authError) {
        setError(authError.message)
        return
      }

      // Success — redirect to dashboard
      navigate('/dashboard', { replace: true })
    }

    handleCallback()
  }, [navigate])

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-light-bg">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600 mb-4">
          <span className="material-symbols-outlined">error</span>
        </div>
        <h1 className="font-display text-xl font-bold text-text-main mb-2">Sign-in Failed</h1>
        <p className="text-sm text-text-muted mb-6 max-w-md text-center">{error}</p>
        <button
          onClick={() => navigate('/', { replace: true })}
          className="rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white hover:bg-forest-green/90"
        >
          Back to Home
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-screen items-center justify-center bg-light-bg">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-forest-green text-white shadow-md">
          <span className="text-2xl">🐂</span>
        </div>
        <span className="font-display text-xl font-bold tracking-tight text-text-main">Signing you in...</span>
      </div>
    </div>
  )
}

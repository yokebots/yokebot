import { useSearchParams } from 'react-router'
import { BrowserPanel } from '@/components/workspace/BrowserPanel'

/**
 * Minimal full-screen page for the browser panel pop-out window.
 * Renders just the BrowserPanel with no dashboard chrome.
 */
export function BrowserPopoutPage() {
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('session')

  if (!sessionId) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-100 text-text-muted text-sm">
        No browser session specified.
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-white">
      <BrowserPanel sessionId={sessionId} popout />
    </div>
  )
}

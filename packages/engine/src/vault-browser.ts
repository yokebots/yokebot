/**
 * vault-browser.ts — DEPRECATED: Legacy vault recording via separate Playwright browser
 *
 * This module is kept for backward compatibility with the existing vault
 * recording API endpoints. New code should use browser-sessions.ts directly:
 * users record logins in the Take Control browser panel and click "Save Login"
 * which uses CDP-based extraction (saveSessionToVault).
 *
 * The recording flow now delegates to browser-sessions.ts under the hood:
 * a recording session is just a browser session in take_control mode.
 */

import {
  createBrowserSession,
  interactWithSession,
  getSessionScreenshot,
  closeBrowserSession,
  getSessionInfo,
  saveSessionToVault as cdpSaveToVault,
  type InteractionAction,
} from './browser-sessions.ts'

export type { InteractionAction }

// ---- State ----

// Map recordingSessionId → browserSessionId (the underlying shared session)
const recordingToBrowser = new Map<string, string>()
const teamRecordings = new Map<string, string>() // teamId → recordingSessionId

// ---- Public API ----

export function hasActiveRecording(teamId: string): boolean {
  return teamRecordings.has(teamId)
}

export async function startRecording(
  sessionId: string,
  teamId: string,
  userId: string,
  targetUrl: string,
): Promise<{ screenshot: string; url: string }> {
  if (teamRecordings.has(teamId)) {
    throw new Error('This team already has an active recording session. Cancel or finish it first.')
  }

  // Create a shared browser session in take_control mode
  const result = await createBrowserSession(teamId, userId, {
    startUrl: targetUrl,
    mode: 'take_control',
  })

  recordingToBrowser.set(sessionId, result.sessionId)
  teamRecordings.set(teamId, sessionId)

  return {
    screenshot: result.screenshot,
    url: result.url,
  }
}

export async function sendInteraction(
  sessionId: string,
  action: InteractionAction,
): Promise<{ screenshot: string; url: string }> {
  const browserSessionId = recordingToBrowser.get(sessionId)
  if (!browserSessionId) throw new Error('Recording session not found')

  return interactWithSession(browserSessionId, action)
}

export async function captureScreenshot(
  sessionId: string,
): Promise<{ screenshot: string; url: string }> {
  const browserSessionId = recordingToBrowser.get(sessionId)
  if (!browserSessionId) throw new Error('Recording session not found')

  return getSessionScreenshot(browserSessionId)
}

/**
 * Finish recording — extract state via CDP and clean up.
 * Returns the vault state (cookies + localStorage + sessionStorage) as JSON.
 */
export async function finishRecording(
  sessionId: string,
): Promise<{ storageState: string; domain: string; finalUrl: string }> {
  const browserSessionId = recordingToBrowser.get(sessionId)
  if (!browserSessionId) throw new Error('Recording session not found')

  const session = getSessionInfo(browserSessionId)
  if (!session) throw new Error('Browser session not found')

  const currentUrl = session.page.url()
  const domain = new URL(currentUrl).hostname

  // Extract state via CDP
  const cdpSession = await session.context.newCDPSession(session.page)
  let storageState: string
  try {
    const cookieResult = await cdpSession.send('Network.getAllCookies') as { cookies: unknown[] }
    const storageResult = await cdpSession.send('Runtime.evaluate', {
      expression: `JSON.stringify({
        localStorage: Object.fromEntries(
          Array.from({ length: localStorage.length }, (_, i) => {
            const key = localStorage.key(i);
            return [key, localStorage.getItem(key)];
          })
        ),
        sessionStorage: Object.fromEntries(
          Array.from({ length: sessionStorage.length }, (_, i) => {
            const key = sessionStorage.key(i);
            return [key, sessionStorage.getItem(key)];
          })
        )
      })`,
      returnByValue: true,
    }) as { result: { value: string } }

    const webStorage = JSON.parse(storageResult.result.value)
    storageState = JSON.stringify({
      cookies: cookieResult.cookies,
      localStorage: webStorage.localStorage,
      sessionStorage: webStorage.sessionStorage,
      domain,
      url: currentUrl,
    })
  } finally {
    await cdpSession.detach()
  }

  // Clean up the browser session
  await closeBrowserSession(browserSessionId)
  cleanup(sessionId)

  return { storageState, domain, finalUrl: currentUrl }
}

export async function cancelRecording(sessionId: string): Promise<void> {
  const browserSessionId = recordingToBrowser.get(sessionId)
  if (browserSessionId) {
    await closeBrowserSession(browserSessionId)
  }
  cleanup(sessionId)
}

export function getRecordingSession(sessionId: string): { sessionId: string; teamId: string; userId: string; currentUrl: string } | undefined {
  const browserSessionId = recordingToBrowser.get(sessionId)
  if (!browserSessionId) return undefined

  const session = getSessionInfo(browserSessionId)
  if (!session) return undefined

  return {
    sessionId,
    teamId: session.teamId,
    userId: session.userId,
    currentUrl: session.currentUrl,
  }
}

export async function cleanupAllRecordings(): Promise<void> {
  for (const [recordingId, browserSessionId] of recordingToBrowser) {
    await closeBrowserSession(browserSessionId)
    cleanup(recordingId)
  }
}

export function getActiveRecordingIds(): string[] {
  return Array.from(recordingToBrowser.keys())
}

// ---- Internal ----

function cleanup(recordingId: string): void {
  const browserSessionId = recordingToBrowser.get(recordingId)
  recordingToBrowser.delete(recordingId)

  // Find and remove teamRecording entry
  for (const [teamId, recId] of teamRecordings) {
    if (recId === recordingId) {
      teamRecordings.delete(teamId)
      break
    }
  }
}

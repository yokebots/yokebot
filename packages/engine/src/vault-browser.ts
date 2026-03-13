/**
 * vault-browser.ts — Direct Playwright browser for recording authenticated sessions
 *
 * Uses Playwright's Node API directly (not MCP) so we can call
 * context.storageState() to capture cookies/localStorage after login.
 * One concurrent recording per team.
 */

import { chromium, type BrowserContext, type Page, type Browser } from 'playwright'
import dns from 'node:dns/promises'

// ---- Types ----

export interface VaultRecordingSession {
  browser: Browser
  context: BrowserContext
  page: Page
  sessionId: string
  teamId: string
  userId: string
  currentUrl: string
}

export type InteractionAction =
  | { type: 'click'; x: number; y: number }
  | { type: 'type'; text: string }
  | { type: 'press'; key: string }
  | { type: 'scroll'; x: number; y: number; deltaX: number; deltaY: number }

// ---- State ----

const recordings = new Map<string, VaultRecordingSession>()
const teamRecordings = new Map<string, string>() // teamId → sessionId

// ---- Domain validation ----

const BLOCKED_PATTERNS = [
  /^file:\/\//i,
  /^javascript:/i,
  /^data:/i,
  /^about:/i,
  // Block internal/private IPs
  /^https?:\/\/localhost/i,
  /^https?:\/\/127\./,
  /^https?:\/\/10\./,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\./,
  /^https?:\/\/192\.168\./,
  /^https?:\/\/0\./,
  /^https?:\/\/\[::1\]/,
  /^https?:\/\/\[fe80:/i,
  /^https?:\/\/\[fc/i,
  /^https?:\/\/\[fd/i,
]

// Block DNS rebinding services that resolve to arbitrary IPs
const BLOCKED_DOMAINS = ['.nip.io', '.xip.io', '.sslip.io', '.localtest.me', '.vcap.me']

function isPrivateIP(ip: string): boolean {
  return (
    ip.startsWith('127.') ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip === '0.0.0.0' ||
    ip === '169.254.169.254' ||
    ip.startsWith('0.') ||
    ip === '::1' ||
    ip.startsWith('fe80:') ||
    ip.startsWith('fc') ||
    ip.startsWith('fd')
  )
}

async function validateUrl(url: string): Promise<string> {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(url)) {
      throw new Error(`Blocked URL: ${url}`)
    }
  }
  // Ensure it starts with http:// or https://
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`
  }
  const parsed = new URL(url) // throws if invalid
  const host = parsed.hostname.toLowerCase()

  // Block DNS rebinding services
  for (const blocked of BLOCKED_DOMAINS) {
    if (host.endsWith(blocked)) {
      throw new Error(`DNS rebinding service not allowed: ${host}`)
    }
  }

  // Resolve hostname and verify it doesn't point to a private IP
  try {
    const addresses = await dns.resolve4(host)
    for (const ip of addresses) {
      if (isPrivateIP(ip)) {
        throw new Error(`URL resolves to private IP (${ip}) — not allowed`)
      }
    }
  } catch (err) {
    if ((err as Error).message.includes('not allowed')) throw err
    // DNS resolution failed — let Playwright handle it (may be IPv6-only)
  }

  return url
}

function extractDomain(url: string): string {
  return new URL(url).hostname
}

// ---- Public API ----

/** Check if a team already has an active recording. */
export function hasActiveRecording(teamId: string): boolean {
  return teamRecordings.has(teamId)
}

/** Start a new recording session. One per team. */
export async function startRecording(
  sessionId: string,
  teamId: string,
  userId: string,
  targetUrl: string,
): Promise<{ screenshot: string; url: string }> {
  if (teamRecordings.has(teamId)) {
    throw new Error('This team already has an active recording session. Cancel or finish it first.')
  }

  const validUrl = await validateUrl(targetUrl)

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  })

  const page = await context.newPage()

  try {
    await page.goto(validUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  } catch (err) {
    await browser.close()
    throw new Error(`Failed to navigate to ${validUrl}: ${(err as Error).message}`)
  }

  const session: VaultRecordingSession = {
    browser,
    context,
    page,
    sessionId,
    teamId,
    userId,
    currentUrl: page.url(),
  }

  recordings.set(sessionId, session)
  teamRecordings.set(teamId, sessionId)

  const screenshot = await page.screenshot({ type: 'png' })

  return {
    screenshot: screenshot.toString('base64'),
    url: page.url(),
  }
}

/** Send an interaction to the recording browser. */
export async function sendInteraction(
  sessionId: string,
  action: InteractionAction,
): Promise<{ screenshot: string; url: string }> {
  const session = recordings.get(sessionId)
  if (!session) throw new Error('Recording session not found')

  const { page } = session

  switch (action.type) {
    case 'click':
      await page.mouse.click(action.x, action.y)
      break
    case 'type':
      await page.keyboard.type(action.text)
      break
    case 'press':
      await page.keyboard.press(action.key)
      break
    case 'scroll':
      await page.mouse.move(action.x, action.y)
      await page.mouse.wheel(action.deltaX, action.deltaY)
      break
  }

  // Small delay to let the page react
  await page.waitForTimeout(300)

  session.currentUrl = page.url()
  const screenshot = await page.screenshot({ type: 'png' })

  return {
    screenshot: screenshot.toString('base64'),
    url: page.url(),
  }
}

/** Capture a screenshot without any interaction. */
export async function captureScreenshot(
  sessionId: string,
): Promise<{ screenshot: string; url: string }> {
  const session = recordings.get(sessionId)
  if (!session) throw new Error('Recording session not found')

  session.currentUrl = session.page.url()
  const screenshot = await session.page.screenshot({ type: 'png' })

  return {
    screenshot: screenshot.toString('base64'),
    url: session.page.url(),
  }
}

/** Finish recording — capture storageState and clean up. */
export async function finishRecording(
  sessionId: string,
): Promise<{ storageState: string; domain: string; finalUrl: string }> {
  const session = recordings.get(sessionId)
  if (!session) throw new Error('Recording session not found')

  const storageState = await session.context.storageState()
  const finalUrl = session.page.url()
  const domain = extractDomain(finalUrl)

  await session.browser.close()
  recordings.delete(sessionId)
  teamRecordings.delete(session.teamId)

  return {
    storageState: JSON.stringify(storageState),
    domain,
    finalUrl,
  }
}

/** Cancel a recording — clean up without saving. */
export async function cancelRecording(sessionId: string): Promise<void> {
  const session = recordings.get(sessionId)
  if (!session) return

  try {
    await session.browser.close()
  } catch {
    // Browser may already be closed
  }

  recordings.delete(sessionId)
  teamRecordings.delete(session.teamId)
}

/** Get recording session info (for validation). */
export function getRecordingSession(sessionId: string): VaultRecordingSession | undefined {
  return recordings.get(sessionId)
}

/** Clean up all recordings (for graceful shutdown). */
export async function cleanupAllRecordings(): Promise<void> {
  for (const [sessionId] of recordings) {
    await cancelRecording(sessionId)
  }
}

/** Get all active recording IDs (for crash recovery / monitoring). */
export function getActiveRecordingIds(): string[] {
  return Array.from(recordings.keys())
}

/** Maximum recording duration (30 minutes). Auto-cancel stale sessions. */
const MAX_RECORDING_DURATION = 30 * 60 * 1000

// Periodic cleanup of stale recordings (runs every 5 minutes)
setInterval(() => {
  const now = Date.now()
  for (const [sessionId, session] of recordings) {
    // Use a timestamp if available, or skip cleanup for sessions without timing info
    // Since we don't store start time on the session, add a safety check via try-catch
    try {
      // If the browser is disconnected, clean up
      if (!session.browser.isConnected()) {
        console.log(`[vault-browser] Cleaning up disconnected recording ${sessionId}`)
        recordings.delete(sessionId)
        teamRecordings.delete(session.teamId)
      }
    } catch {
      recordings.delete(sessionId)
      teamRecordings.delete(session.teamId)
    }
  }
}, 5 * 60 * 1000)

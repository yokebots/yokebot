/**
 * browser-sessions.ts — Multi-purpose browser session manager with CDP Screencast
 *
 * Launches Chromium with --remote-debugging-port to expose a CDP WebSocket.
 * Both Playwright (for agent automation) and the WebSocket proxy (for human
 * streaming) connect to the same Chromium instance via connectOverCDP().
 *
 * Supports two modes:
 *   - take_control: human drives the browser via CDP Screencast + input events
 *   - agent_browser: agent drives via Playwright, human observes CDP frames
 *
 * Max 2 concurrent sessions per team (~150MB per Chromium instance).
 * 10-min idle timeout, 30-min max duration, auto-cleanup.
 */

import { chromium, type BrowserContext, type Page, type Browser } from 'playwright'
import { spawn, type ChildProcess } from 'node:child_process'
import crypto from 'node:crypto'
import WebSocket from 'ws'
import type { Db } from './db/types.ts'
import { createVaultSession, getVaultSession, logVaultEvent } from './session-vault.ts'

// Reuse SSRF validation logic
import dns from 'node:dns/promises'

// ---- Types ----

export type BrowserSessionMode = 'take_control' | 'agent_browser'
export type SessionController = 'agent' | 'human'

export interface BrowserSessionState {
  id: string
  browser: Browser
  context: BrowserContext
  page: Page
  teamId: string
  userId: string
  mode: BrowserSessionMode
  controlledBy: SessionController
  currentUrl: string
  createdAt: number
  lastActivity: number
  /** Internal CDP WebSocket URL (ws://127.0.0.1:<port>/devtools/...) */
  cdpWsUrl: string
  /** The raw Chromium child process */
  chromiumProcess: ChildProcess
}

export type InteractionAction =
  | { type: 'click'; x: number; y: number }
  | { type: 'type'; text: string }
  | { type: 'press'; key: string }
  | { type: 'scroll'; x: number; y: number; deltaX: number; deltaY: number }
  | { type: 'back' }
  | { type: 'forward' }

export interface BrowserSessionInfo {
  id: string
  currentUrl: string
  mode: BrowserSessionMode
  controlledBy: SessionController
  createdAt: string
  teamId: string
}

// ---- State ----

const sessions = new Map<string, BrowserSessionState>()
const teamSessionCount = new Map<string, number>() // teamId → active count

const MAX_SESSIONS_PER_TEAM = 2
const MAX_GLOBAL_SESSIONS = 50 // hard cap on total Chromium processes across all teams
const IDLE_TIMEOUT_MS = 10 * 60 * 1000   // 10 minutes
const MAX_DURATION_MS = 30 * 60 * 1000   // 30 minutes
const AWAIT_HUMAN_IDLE_MS = 15 * 60 * 1000 // 15 min when waiting for human response

// ---- SSRF Validation ----

const BLOCKED_PATTERNS = [
  /^file:\/\//i,
  /^javascript:/i,
  /^data:/i,
  /^about:/i,
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
    // IPv6 private/reserved ranges
    ip === '::1' ||
    ip === '::' ||
    ip.startsWith('fe80:') ||
    ip.startsWith('fc') ||
    ip.startsWith('fd') ||
    ip.startsWith('ff') ||  // multicast
    ip.startsWith('::ffff:127.') ||  // IPv4-mapped loopback
    ip.startsWith('::ffff:10.') ||   // IPv4-mapped private
    ip.startsWith('::ffff:192.168.') ||
    /^::ffff:172\.(1[6-9]|2\d|3[01])\./.test(ip)
  )
}

export async function validateUrl(url: string): Promise<string> {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(url)) {
      throw new Error('This URL is not allowed.')
    }
  }
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`
  }
  const parsed = new URL(url)
  const host = parsed.hostname.toLowerCase()

  for (const blocked of BLOCKED_DOMAINS) {
    if (host.endsWith(blocked)) {
      throw new Error('This URL is not allowed.')
    }
  }

  // Validate both IPv4 and IPv6 DNS resolution — fail closed on errors
  // Use a 3s timeout to prevent slow IPv6 lookups from blocking navigation
  try {
    const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
      Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('DNS timeout')), ms))])
    const [v4Addresses, v6Addresses] = await Promise.allSettled([
      withTimeout(dns.resolve4(host), 3000),
      withTimeout(dns.resolve6(host), 3000),
    ])
    const allAddresses: string[] = []
    if (v4Addresses.status === 'fulfilled') allAddresses.push(...v4Addresses.value)
    if (v6Addresses.status === 'fulfilled') allAddresses.push(...v6Addresses.value)

    for (const ip of allAddresses) {
      if (isPrivateIP(ip)) {
        throw new Error('This URL is not allowed.')
      }
    }

    // If both failed with non-ENOTFOUND errors, block (fail closed)
    if (allAddresses.length === 0) {
      const v4Err = v4Addresses.status === 'rejected' ? (v4Addresses.reason as NodeJS.ErrnoException).code : null
      const v6Err = v6Addresses.status === 'rejected' ? (v6Addresses.reason as NodeJS.ErrnoException).code : null
      const isNotFound = v4Err === 'ENOTFOUND' || v6Err === 'ENOTFOUND'
      if (!isNotFound) {
        throw new Error('Unable to verify URL safety — please try again.')
      }
    }
  } catch (err) {
    if ((err as Error).message.includes('not allowed') || (err as Error).message.includes('Unable to verify')) throw err
  }

  return url
}

// ---- CDP Launch ----

/**
 * Resolve the Chromium executable path. Checks env var first,
 * then falls back to Playwright's bundled Chromium.
 */
function getChromiumPath(): string {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  }
  return chromium.executablePath()
}

/**
 * Launch Chromium with --remote-debugging-port=0 and parse the CDP WebSocket
 * URL from stderr. Returns the child process and the CDP endpoint URL.
 */
function launchChromiumWithCDP(): Promise<{ proc: ChildProcess; cdpWsUrl: string }> {
  return new Promise((resolve, reject) => {
    const execPath = getChromiumPath()
    const proc = spawn(execPath, [
      '--headless=new',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--remote-debugging-port=0', // OS assigns free port
      '--window-size=1280,800',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-sync',
      '--no-first-run',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stderrData = ''
    const timeout = setTimeout(() => {
      proc.kill('SIGKILL')
      reject(new Error('Chromium launch timed out — no CDP WebSocket URL received within 10s'))
    }, 10_000)

    proc.stderr?.on('data', (chunk) => {
      stderrData += chunk.toString()
      // Chrome prints: "DevTools listening on ws://127.0.0.1:PORT/devtools/browser/UUID"
      const match = stderrData.match(/DevTools listening on (ws:\/\/[^\s]+)/)
      if (match) {
        clearTimeout(timeout)
        resolve({ proc, cdpWsUrl: match[1] })
      }
    })

    proc.on('error', (err) => {
      clearTimeout(timeout)
      reject(new Error(`Failed to launch Chromium: ${err.message}`))
    })

    proc.on('exit', (code) => {
      clearTimeout(timeout)
      if (code !== null) {
        reject(new Error(`Chromium exited with code ${code} before CDP was ready. stderr: ${stderrData.slice(0, 500)}`))
      }
    })
  })
}

// ---- Helpers ----

function getTeamCount(teamId: string): number {
  return teamSessionCount.get(teamId) ?? 0
}

function incrementTeamCount(teamId: string): void {
  teamSessionCount.set(teamId, getTeamCount(teamId) + 1)
}

function decrementTeamCount(teamId: string): void {
  const count = getTeamCount(teamId)
  if (count <= 1) {
    teamSessionCount.delete(teamId)
  } else {
    teamSessionCount.set(teamId, count - 1)
  }
}

// ---- Public API ----

/**
 * Create a new browser session with CDP support.
 * Launches Chromium with --remote-debugging-port, then connects Playwright
 * via connectOverCDP() for full browser control. The cdpWsUrl is stored
 * for the WebSocket proxy to connect to for screencast streaming.
 */
export async function createBrowserSession(
  teamId: string,
  userId: string,
  options?: { vaultSessionId?: string; startUrl?: string; db?: Db; mode?: BrowserSessionMode },
): Promise<{ sessionId: string; screenshot: string; url: string }> {
  if (sessions.size >= MAX_GLOBAL_SESSIONS) {
    throw new Error('Server is at maximum browser capacity. Please try again later.')
  }
  if (getTeamCount(teamId) >= MAX_SESSIONS_PER_TEAM) {
    throw new Error(`Maximum ${MAX_SESSIONS_PER_TEAM} concurrent browser sessions per team. Close an existing session first.`)
  }

  const sessionId = crypto.randomUUID()

  // Optionally load vault storage state
  let storageState: string | undefined
  if (options?.vaultSessionId && options.db) {
    const vault = await getVaultSession(options.db, options.vaultSessionId, teamId)
    if (vault) {
      storageState = vault.storageState
    }
  }

  // 1. Launch Chromium with CDP debugging exposed
  const { proc, cdpWsUrl } = await launchChromiumWithCDP()

  // 2. Connect Playwright to the running Chromium via CDP
  let browser: Browser
  try {
    browser = await chromium.connectOverCDP(cdpWsUrl)
  } catch (err) {
    proc.kill('SIGKILL')
    throw new Error(`Failed to connect Playwright to CDP: ${(err as Error).message}`)
  }

  // 3. Create context + page via Playwright
  const contextOptions: Record<string, unknown> = {
    viewport: { width: 1280, height: 800 },
  }

  if (storageState) {
    contextOptions.storageState = JSON.parse(storageState)
  }

  const context = await browser.newContext(contextOptions)
  const page = await context.newPage()

  const startUrl = options?.startUrl
  if (startUrl) {
    const validUrl = await validateUrl(startUrl)
    try {
      await page.goto(validUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    } catch (err) {
      proc.kill('SIGKILL')
      throw new Error(`Failed to navigate to ${validUrl}: ${(err as Error).message}`)
    }
  } else {
    // Navigate to about:blank to avoid Chrome's incognito new-tab page showing in the screencast
    await page.goto('about:blank').catch(() => {})
  }

  const mode = options?.mode ?? 'take_control'

  const session: BrowserSessionState = {
    id: sessionId,
    browser,
    context,
    page,
    teamId,
    userId,
    mode,
    controlledBy: mode === 'agent_browser' ? 'agent' : 'human',
    currentUrl: page.url(),
    createdAt: Date.now(),
    lastActivity: Date.now(),
    cdpWsUrl,
    chromiumProcess: proc,
  }

  sessions.set(sessionId, session)
  incrementTeamCount(teamId)

  const screenshot = await page.screenshot({ type: 'png' })

  return {
    sessionId,
    screenshot: screenshot.toString('base64'),
    url: page.url(),
  }
}

/**
 * Send an interaction to a browser session (legacy HTTP path — kept for backward compat).
 */
export async function interactWithSession(
  sessionId: string,
  action: InteractionAction,
): Promise<{ screenshot: string; url: string }> {
  const session = sessions.get(sessionId)
  if (!session) throw new Error('Browser session not found')

  const { page } = session
  session.lastActivity = Date.now()

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
    case 'back':
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => {})
      break
    case 'forward':
      await page.goForward({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => {})
      break
  }

  await page.waitForTimeout(300)

  session.currentUrl = page.url()
  const screenshot = await page.screenshot({ type: 'png' })

  return {
    screenshot: screenshot.toString('base64'),
    url: page.url(),
  }
}

/**
 * Capture a screenshot of the current session state (legacy HTTP path).
 */
export async function getSessionScreenshot(
  sessionId: string,
): Promise<{ screenshot: string; url: string }> {
  const session = sessions.get(sessionId)
  if (!session) throw new Error('Browser session not found')

  session.currentUrl = session.page.url()
  const screenshot = await session.page.screenshot({ type: 'png' })

  return {
    screenshot: screenshot.toString('base64'),
    url: session.page.url(),
  }
}

/**
 * Navigate a session to a URL with SSRF validation (legacy HTTP path).
 */
export async function navigateSession(
  sessionId: string,
  url: string,
): Promise<{ screenshot: string; url: string }> {
  const session = sessions.get(sessionId)
  if (!session) throw new Error('Browser session not found')

  const validUrl = await validateUrl(url)
  session.lastActivity = Date.now()

  await session.page.goto(validUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  session.currentUrl = session.page.url()
  const screenshot = await session.page.screenshot({ type: 'png' })

  return {
    screenshot: screenshot.toString('base64'),
    url: session.page.url(),
  }
}

/**
 * Save current session auth state to the vault via CDP.
 * Extracts cookies via CDP Network.getAllCookies and localStorage/sessionStorage
 * via Runtime.evaluate for a richer capture than Playwright's storageState().
 */
export async function saveSessionToVault(
  sessionId: string,
  db: Db,
  teamId: string,
  label: string,
): Promise<{ session: { id: string; domain: string; serviceLabel: string } }> {
  const session = sessions.get(sessionId)
  if (!session) throw new Error('Browser session not found')
  if (session.teamId !== teamId) throw new Error('Forbidden')

  const currentUrl = session.page.url()
  const domain = new URL(currentUrl).hostname

  // Extract state via CDP for richer capture
  const cdpSession = await session.context.newCDPSession(session.page)
  try {
    // Get all cookies
    const cookieResult = await cdpSession.send('Network.getAllCookies') as { cookies: unknown[] }

    // Get localStorage + sessionStorage from the page
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

    const vaultState = JSON.stringify({
      cookies: cookieResult.cookies,
      localStorage: webStorage.localStorage,
      sessionStorage: webStorage.sessionStorage,
      domain,
      url: currentUrl,
    })

    const vaultSession = await createVaultSession(db, teamId, label, domain, vaultState, session.userId)
    await logVaultEvent(db, vaultSession.id, teamId, 'recorded', undefined, session.userId, `Saved from browser session ${sessionId}`)

    return {
      session: {
        id: vaultSession.id,
        domain: vaultSession.domain,
        serviceLabel: vaultSession.serviceLabel,
      },
    }
  } finally {
    await cdpSession.detach()
  }
}

/**
 * Restore vault state to a session via CDP.
 * Sets cookies via Network.setCookies and writes localStorage/sessionStorage
 * via Runtime.evaluate, then navigates to the saved URL.
 */
export async function restoreVaultToSession(
  sessionId: string,
  db: Db,
  teamId: string,
  vaultSessionId: string,
): Promise<void> {
  const session = sessions.get(sessionId)
  if (!session) throw new Error('Browser session not found')

  const vault = await getVaultSession(db, vaultSessionId, teamId)
  if (!vault) throw new Error('Vault session not found')

  const state = JSON.parse(vault.storageState)

  const cdpSession = await session.context.newCDPSession(session.page)
  try {
    // Restore cookies
    if (state.cookies?.length) {
      await cdpSession.send('Network.setCookies', { cookies: state.cookies })
    }

    // Navigate to the saved URL first (so localStorage/sessionStorage target the right origin)
    if (state.url) {
      const validUrl = await validateUrl(state.url)
      await session.page.goto(validUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    }

    // Restore localStorage
    if (state.localStorage && Object.keys(state.localStorage).length > 0) {
      const entries = JSON.stringify(state.localStorage)
      await cdpSession.send('Runtime.evaluate', {
        expression: `Object.entries(${entries}).forEach(([k,v]) => localStorage.setItem(k, v))`,
      })
    }

    // Restore sessionStorage
    if (state.sessionStorage && Object.keys(state.sessionStorage).length > 0) {
      const entries = JSON.stringify(state.sessionStorage)
      await cdpSession.send('Runtime.evaluate', {
        expression: `Object.entries(${entries}).forEach(([k,v]) => sessionStorage.setItem(k, v))`,
      })
    }

    // Reload to pick up restored state
    await session.page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
    session.currentUrl = session.page.url()
  } finally {
    await cdpSession.detach()
  }
}

/**
 * Close a browser session and clean up.
 */
export async function closeBrowserSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId)
  if (!session) return

  try {
    await session.browser.close()
  } catch {
    // Browser may already be closed
  }

  try {
    session.chromiumProcess.kill('SIGKILL')
  } catch {
    // Process may already be dead
  }

  sessions.delete(sessionId)
  decrementTeamCount(session.teamId)
}

/**
 * Set who controls the session (agent or human).
 */
export function setSessionController(sessionId: string, controller: SessionController): void {
  const session = sessions.get(sessionId)
  if (session) {
    session.controlledBy = controller
    session.lastActivity = Date.now()
  }
}

/**
 * List active sessions for a team.
 */
export function listActiveSessions(teamId: string): BrowserSessionInfo[] {
  const result: BrowserSessionInfo[] = []
  for (const [, session] of sessions) {
    if (session.teamId === teamId) {
      result.push({
        id: session.id,
        currentUrl: session.currentUrl,
        mode: session.mode,
        controlledBy: session.controlledBy,
        createdAt: new Date(session.createdAt).toISOString(),
        teamId: session.teamId,
      })
    }
  }
  return result
}

/**
 * Get session info (for validation / ownership checks).
 */
export function getSessionInfo(sessionId: string): BrowserSessionState | undefined {
  return sessions.get(sessionId)
}

/**
 * Get the CDP WebSocket URL for a session (used by the proxy).
 */
export function getSessionCdpUrl(sessionId: string): string | undefined {
  return sessions.get(sessionId)?.cdpWsUrl
}

/**
 * Extend idle timeout (e.g. when waiting for human response via browser_ask_human).
 */
export function extendSessionIdle(sessionId: string): void {
  const session = sessions.get(sessionId)
  if (session) {
    session.lastActivity = Date.now() + (AWAIT_HUMAN_IDLE_MS - IDLE_TIMEOUT_MS)
  }
}

/**
 * Touch session activity timestamp.
 */
export function touchSession(sessionId: string): void {
  const session = sessions.get(sessionId)
  if (session) {
    session.lastActivity = Date.now()
  }
}

/**
 * Clean up all sessions (for graceful shutdown).
 */
export async function cleanupAllBrowserSessions(): Promise<void> {
  for (const [sessionId] of sessions) {
    await closeBrowserSession(sessionId)
  }
}

// ---- Periodic cleanup of idle/expired sessions ----

setInterval(() => {
  const now = Date.now()
  for (const [sessionId, session] of sessions) {
    const idle = now - session.lastActivity > IDLE_TIMEOUT_MS
    const expired = now - session.createdAt > MAX_DURATION_MS
    const disconnected = !session.browser.isConnected()

    if (idle || expired || disconnected) {
      const reason = disconnected ? 'disconnected' : idle ? 'idle timeout' : 'max duration'
      console.log(`[browser-sessions] Cleaning up session ${sessionId}: ${reason}`)
      closeBrowserSession(sessionId).catch(() => {})
    }
  }
}, 60 * 1000) // Check every minute

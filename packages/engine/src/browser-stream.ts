/**
 * browser-stream.ts — WebSocket proxy for CDP Screencast streaming
 *
 * Proxies Chrome DevTools Protocol screencast frames from a browser session's
 * internal CDP WebSocket to the dashboard client. Also forwards human input
 * events (click, type, scroll, navigate) from the client back to CDP.
 *
 * Protocol (client ↔ engine):
 *   Server → Client:
 *     { type: 'frame', data: base64jpeg, sessionId: number, timestamp: number }
 *     { type: 'url', url: string }
 *     { type: 'error', message: string }
 *   Client → Server:
 *     { type: 'click', x, y }
 *     { type: 'type', text }
 *     { type: 'press', key }
 *     { type: 'scroll', x, y, deltaX, deltaY }
 *     { type: 'navigate', url }
 *     { type: 'back' }
 *     { type: 'forward' }
 *     { type: 'control', controller: 'agent' | 'human' }
 */

import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'node:http'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { verifyJwtToken } from './auth-middleware.ts'
import {
  getSessionInfo,
  getSessionCdpUrl,
  validateUrl,
  setSessionController,
  touchSession,
  type SessionController,
} from './browser-sessions.ts'

// Team membership check — injected from index.ts to avoid circular deps
let _checkTeamMembership: ((userId: string, teamId: string) => Promise<boolean>) | null = null

export function setBrowserStreamTeamCheck(fn: (userId: string, teamId: string) => Promise<boolean>): void {
  _checkTeamMembership = fn
}

// ---- Rate limiting & viewer caps ----

const MAX_VIEWERS_PER_SESSION = 5
const MAX_WS_CONNECTIONS_PER_USER = 3
const WS_CONNECT_WINDOW_MS = 60_000 // 1 minute
const MAX_WS_CONNECTS_PER_WINDOW = 10 // max 10 connection attempts per minute per IP

// Track active viewers per session
const sessionViewerCount = new Map<string, number>()
// Track active connections per user
const userConnectionCount = new Map<string, number>()
// Track connection attempts per IP for rate limiting
const ipConnectAttempts = new Map<string, { count: number; resetAt: number }>()

function checkIpRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = ipConnectAttempts.get(ip)
  if (!entry || now > entry.resetAt) {
    ipConnectAttempts.set(ip, { count: 1, resetAt: now + WS_CONNECT_WINDOW_MS })
    return true
  }
  entry.count++
  return entry.count <= MAX_WS_CONNECTS_PER_WINDOW
}

// CDP message ID counter per connection
let cdpIdCounter = 0
function nextCdpId(): number {
  return ++cdpIdCounter
}

// Map of keyName → CDP key info
const KEY_MAP: Record<string, { key: string; code: string; keyCode: number; text?: string }> = {
  Enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  Tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  Backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  Escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  Delete: { key: 'Delete', code: 'Delete', keyCode: 46 },
  Home: { key: 'Home', code: 'Home', keyCode: 36 },
  End: { key: 'End', code: 'End', keyCode: 35 },
  ' ': { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
}

/**
 * Install the WebSocket upgrade handler on the HTTP server.
 * Listens for connections to /api/browser-sessions/:id/stream
 */
export function installBrowserStreamHandler(server: Server): void {
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? '', 'http://localhost')
    const match = url.pathname.match(/^\/api\/browser-sessions\/([^/]+)\/stream$/)
    if (!match) return // Not our route — let other upgrade handlers take it

    const sessionId = match[1]
    const token = url.searchParams.get('token')

    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }

    // Rate limit by IP
    const ip = req.socket.remoteAddress ?? 'unknown'
    if (!checkIpRateLimit(ip)) {
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n')
      socket.destroy()
      return
    }

    // Authenticate and authorize, then upgrade
    void handleUpgrade(wss, req, socket, head, sessionId, token)
  })
}

async function handleUpgrade(
  wss: WebSocketServer,
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  sessionId: string,
  token: string,
): Promise<void> {
  // 1. Verify JWT
  const user = await verifyJwtToken(token)
  if (!user) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }

  // 2. Check per-user connection limit
  const userConns = userConnectionCount.get(user.id) ?? 0
  if (userConns >= MAX_WS_CONNECTIONS_PER_USER) {
    socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n')
    socket.destroy()
    return
  }

  // 3. Verify session exists
  const session = getSessionInfo(sessionId)
  if (!session) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
    socket.destroy()
    return
  }

  // 4. Check per-session viewer limit
  const viewers = sessionViewerCount.get(sessionId) ?? 0
  if (viewers >= MAX_VIEWERS_PER_SESSION) {
    socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n')
    socket.destroy()
    return
  }

  // 5. Verify team membership
  if (_checkTeamMembership) {
    const isMember = await _checkTeamMembership(user.id, session.teamId)
    if (!isMember) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
      socket.destroy()
      return
    }
  }

  // 6. Get CDP WebSocket URL
  const cdpWsUrl = getSessionCdpUrl(sessionId)
  if (!cdpWsUrl) {
    socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n')
    socket.destroy()
    return
  }

  // 7. Upgrade the connection and track counts
  wss.handleUpgrade(req, socket, head, (clientWs) => {
    wss.emit('connection', clientWs, req)

    // Increment viewer + user counts
    sessionViewerCount.set(sessionId, (sessionViewerCount.get(sessionId) ?? 0) + 1)
    userConnectionCount.set(user.id, (userConnectionCount.get(user.id) ?? 0) + 1)

    // Decrement on close
    clientWs.on('close', () => {
      const vc = (sessionViewerCount.get(sessionId) ?? 1) - 1
      if (vc <= 0) sessionViewerCount.delete(sessionId)
      else sessionViewerCount.set(sessionId, vc)

      const uc = (userConnectionCount.get(user.id) ?? 1) - 1
      if (uc <= 0) userConnectionCount.delete(user.id)
      else userConnectionCount.set(user.id, uc)
    })

    void startStreamProxy(clientWs, sessionId, cdpWsUrl)
  })
}

/**
 * Connect to the internal CDP WebSocket, start screencast,
 * and proxy frames/input between client and Chromium.
 */
async function startStreamProxy(
  clientWs: WebSocket,
  sessionId: string,
  cdpWsUrl: string,
): Promise<void> {
  // Find the page target ID (needed for Target.attachToTarget)
  let pageTargetId: string
  try {
    pageTargetId = await getPageTargetId(cdpWsUrl)
  } catch (err) {
    sendToClient(clientWs, { type: 'error', message: `Failed to find page target: ${(err as Error).message}` })
    clientWs.close()
    return
  }

  // Connect to the BROWSER-level CDP WebSocket (not page-level).
  // Browser-level connections survive cross-origin navigations.
  const cdpWs = new WebSocket(cdpWsUrl)
  const pendingCallbacks = new Map<number, (result: unknown) => void>()
  let cdpSessionId: string | undefined // CDP session ID for the attached page target

  // Wait for CDP connection
  await new Promise<void>((resolve, reject) => {
    cdpWs.on('open', resolve)
    cdpWs.on('error', reject)
    setTimeout(() => reject(new Error('CDP connection timeout')), 5000)
  })

  // Helper to send CDP command and await result
  function cdpCall(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return new Promise((resolve) => {
      const id = nextCdpId()
      pendingCallbacks.set(id, resolve)
      // If we have a session ID, route commands through it
      const msg = cdpSessionId
        ? { id, method, params, sessionId: cdpSessionId }
        : { id, method, params }
      cdpWs.send(JSON.stringify(msg))
      // Timeout after 10s
      setTimeout(() => {
        if (pendingCallbacks.has(id)) {
          pendingCallbacks.delete(id)
          resolve(undefined)
        }
      }, 10_000)
    })
  }

  // Helper to fire-and-forget a CDP command to the attached page session
  function cdpSendToPage(method: string, params: Record<string, unknown> = {}): void {
    if (!cdpSessionId) return
    cdpWs.send(JSON.stringify({ id: nextCdpId(), method, params, sessionId: cdpSessionId }))
  }

  // Handle CDP messages
  cdpWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString())

      // Handle method responses
      if (msg.id && pendingCallbacks.has(msg.id)) {
        const cb = pendingCallbacks.get(msg.id)!
        pendingCallbacks.delete(msg.id)
        cb(msg.result)
        return
      }

      // Handle events from the attached page session
      // When using flatten: true, events come with a sessionId field
      if (msg.method === 'Page.screencastFrame') {
        const { data: frameData, metadata, sessionId: frameSessionId } = msg.params
        sendToClient(clientWs, {
          type: 'frame',
          data: frameData,
          sessionId: frameSessionId,
          timestamp: metadata?.timestamp,
        })
        // Acknowledge the frame (required for backpressure)
        cdpSendToPage('Page.screencastFrameAck', { sessionId: frameSessionId })
        return
      }

      // Forward URL changes
      if (msg.method === 'Page.frameNavigated' && msg.params?.frame?.parentId === undefined) {
        sendToClient(clientWs, { type: 'url', url: msg.params.frame.url })
      }

      // Handle target destroyed — page navigated cross-origin, target replaced
      if (msg.method === 'Target.targetDestroyed' && msg.params?.targetId === pageTargetId) {
        // The old page target is gone — try to re-attach to the new page target
        void reattachToPage()
      }

      // Handle new target created (cross-origin navigation creates a new page target)
      if (msg.method === 'Target.targetCreated' && msg.params?.targetInfo?.type === 'page') {
        pageTargetId = msg.params.targetInfo.targetId
      }
    } catch { /* ignore parse errors */ }
  })

  // Attach to the page target using flatten mode (events come through browser WS)
  async function attachToPage(): Promise<void> {
    const result = await cdpCall('Target.attachToTarget', {
      targetId: pageTargetId,
      flatten: true,
    }) as { sessionId?: string } | undefined
    cdpSessionId = result?.sessionId
    if (!cdpSessionId) {
      sendToClient(clientWs, { type: 'error', message: 'Failed to attach to page target' })
      return
    }

    // Enable page events and start screencast on the attached session
    cdpSendToPage('Page.enable', {})
    cdpSendToPage('Page.startScreencast', {
      format: 'jpeg',
      quality: 60,
      maxWidth: 1280,
      maxHeight: 800,
      everyNthFrame: 1,
    })
  }

  // Re-attach after cross-origin navigation
  async function reattachToPage(): Promise<void> {
    // Wait a moment for the new target to settle
    await new Promise(r => setTimeout(r, 200))
    // Find the new page target
    try {
      pageTargetId = await getPageTargetId(cdpWsUrl)
    } catch { /* use whatever pageTargetId we last saw */ }
    await attachToPage()
  }

  // Listen for target lifecycle events at the browser level
  await cdpCall('Target.setDiscoverTargets', { discover: true })
  // Initial attach
  await attachToPage()

  // Handle client input messages
  clientWs.on('message', (raw) => {
    try {
      // Reject oversized messages (max 10KB — no legitimate input message is larger)
      if (raw.toString().length > 10_240) return

      const msg = JSON.parse(raw.toString())
      touchSession(sessionId)

      switch (msg.type) {
        case 'click': {
          const x = Number(msg.x)
          const y = Number(msg.y)
          if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > 5000 || y > 5000) break
          cdpSendToPage('Input.dispatchMouseEvent', {
            type: 'mousePressed', x, y, button: 'left', clickCount: 1,
          })
          cdpSendToPage('Input.dispatchMouseEvent', {
            type: 'mouseReleased', x, y, button: 'left', clickCount: 1,
          })
          break
        }

        case 'type': {
          const text = typeof msg.text === 'string' ? msg.text.slice(0, 1000) : ''
          for (const char of text) {
            cdpSendToPage('Input.dispatchKeyEvent', {
              type: 'keyDown', text: char, key: char, unmodifiedText: char,
            })
            cdpSendToPage('Input.dispatchKeyEvent', {
              type: 'keyUp', key: char,
            })
          }
          break
        }

        case 'press': {
          if (typeof msg.key !== 'string' || msg.key.length > 50) break
          const keyInfo = KEY_MAP[msg.key]
          if (keyInfo) {
            cdpSendToPage('Input.dispatchKeyEvent', {
              type: 'keyDown',
              key: keyInfo.key,
              code: keyInfo.code,
              windowsVirtualKeyCode: keyInfo.keyCode,
              nativeVirtualKeyCode: keyInfo.keyCode,
              text: keyInfo.text,
            })
            cdpSendToPage('Input.dispatchKeyEvent', {
              type: 'keyUp',
              key: keyInfo.key,
              code: keyInfo.code,
              windowsVirtualKeyCode: keyInfo.keyCode,
              nativeVirtualKeyCode: keyInfo.keyCode,
            })
          } else {
            // Generic key press
            cdpSendToPage('Input.dispatchKeyEvent', { type: 'keyDown', key: msg.key })
            cdpSendToPage('Input.dispatchKeyEvent', { type: 'keyUp', key: msg.key })
          }
          break
        }

        case 'scroll': {
          const sx = Number(msg.x ?? 640)
          const sy = Number(msg.y ?? 400)
          const dx = Number(msg.deltaX ?? 0)
          const dy = Number(msg.deltaY ?? 0)
          if (!Number.isFinite(sx) || !Number.isFinite(sy) || sx < 0 || sy < 0 || sx > 5000 || sy > 5000) break
          if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) > 10000 || Math.abs(dy) > 10000) break
          cdpSendToPage('Input.dispatchMouseEvent', {
            type: 'mouseWheel', x: sx, y: sy, deltaX: dx, deltaY: dy,
          })
          break
        }

        case 'navigate':
          if (typeof msg.url !== 'string' || msg.url.length > 2048) break
          sendToClient(clientWs, { type: 'navigating', url: msg.url })
          void handleNavigate(msg.url, cdpWs, clientWs, cdpSessionId)
          break

        case 'back':
          void handleHistoryNav(cdpCall, cdpWs, 'back', cdpSessionId)
          break

        case 'forward':
          void handleHistoryNav(cdpCall, cdpWs, 'forward', cdpSessionId)
          break

        case 'control':
          if (msg.controller === 'agent' || msg.controller === 'human') {
            setSessionController(sessionId, msg.controller as SessionController)
          }
          break
      }
    } catch { /* ignore bad messages */ }
  })

  // Cleanup on disconnect
  clientWs.on('close', () => {
    // Stop screencast but DON'T close the browser (agent may still be using it)
    try {
      cdpSendToPage('Page.stopScreencast', {})
    } catch { /* best effort */ }
    setTimeout(() => {
      try { cdpWs.close() } catch { /* best effort */ }
    }, 100)
  })

  cdpWs.on('close', () => {
    if (clientWs.readyState === WebSocket.OPEN) {
      sendToClient(clientWs, { type: 'error', message: 'Browser session ended' })
      clientWs.close()
    }
  })

  cdpWs.on('error', () => {
    if (clientWs.readyState === WebSocket.OPEN) {
      sendToClient(clientWs, { type: 'error', message: 'CDP connection error' })
      clientWs.close()
    }
  })
}

/** Get the first page's target ID from the browser endpoint. */
async function getPageTargetId(browserWsUrl: string): Promise<string> {
  const httpUrl = browserWsUrl.replace('ws://', 'http://').replace(/\/devtools\/browser\/.*/, '/json')
  const response = await fetch(httpUrl)
  const targets = await response.json() as Array<{ type: string; id: string; webSocketDebuggerUrl: string }>
  const page = targets.find(t => t.type === 'page')
  if (!page?.id) {
    throw new Error('No page target found in Chromium')
  }
  return page.id
}

/** Send a CDP command (fire and forget). */
function cdpSend(ws: WebSocket, method: string, params: Record<string, unknown>, sessionId?: string): void {
  if (ws.readyState === WebSocket.OPEN) {
    const msg = sessionId
      ? { id: nextCdpId(), method, params, sessionId }
      : { id: nextCdpId(), method, params }
    ws.send(JSON.stringify(msg))
  }
}

/** Send a message to the dashboard client. */
function sendToClient(ws: WebSocket, msg: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

/** Handle navigate command with SSRF validation. */
async function handleNavigate(url: string, cdpWs: WebSocket, clientWs: WebSocket, sessionId?: string): Promise<void> {
  try {
    const validUrl = await validateUrl(url)
    cdpSend(cdpWs, 'Page.navigate', { url: validUrl }, sessionId)
  } catch (err) {
    sendToClient(clientWs, { type: 'error', message: (err as Error).message })
  }
}

/** Handle back/forward navigation via CDP history API. */
async function handleHistoryNav(
  cdpCall: (method: string, params?: Record<string, unknown>) => Promise<unknown>,
  cdpWs: WebSocket,
  direction: 'back' | 'forward',
  sessionId?: string,
): Promise<void> {
  const history = await cdpCall('Page.getNavigationHistory') as {
    currentIndex: number
    entries: Array<{ id: number; url: string }>
  } | undefined
  if (!history) return

  const targetIndex = direction === 'back' ? history.currentIndex - 1 : history.currentIndex + 1
  if (targetIndex < 0 || targetIndex >= history.entries.length) return

  cdpSend(cdpWs, 'Page.navigateToHistoryEntry', { entryId: history.entries[targetIndex].id }, sessionId)
}

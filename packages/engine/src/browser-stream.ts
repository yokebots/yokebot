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

  // 2. Verify session exists
  const session = getSessionInfo(sessionId)
  if (!session) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
    socket.destroy()
    return
  }

  // 3. Verify team membership
  if (_checkTeamMembership) {
    const isMember = await _checkTeamMembership(user.id, session.teamId)
    if (!isMember) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
      socket.destroy()
      return
    }
  }

  // 4. Get CDP WebSocket URL
  const cdpWsUrl = getSessionCdpUrl(sessionId)
  if (!cdpWsUrl) {
    socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n')
    socket.destroy()
    return
  }

  // 5. Upgrade the connection
  wss.handleUpgrade(req, socket, head, (clientWs) => {
    wss.emit('connection', clientWs, req)
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
  // Connect to the browser page's CDP endpoint
  // First, get the page's target ID from the browser CDP endpoint
  let pageWsUrl: string
  try {
    pageWsUrl = await getPageCdpUrl(cdpWsUrl)
  } catch (err) {
    sendToClient(clientWs, { type: 'error', message: `Failed to find page target: ${(err as Error).message}` })
    clientWs.close()
    return
  }

  const cdpWs = new WebSocket(pageWsUrl)
  const pendingCallbacks = new Map<number, (result: unknown) => void>()

  // Wait for CDP connection
  await new Promise<void>((resolve, reject) => {
    cdpWs.on('open', resolve)
    cdpWs.on('error', reject)
    setTimeout(() => reject(new Error('CDP connection timeout')), 5000)
  })

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

      // Handle screencast frames
      if (msg.method === 'Page.screencastFrame') {
        const { data: frameData, metadata, sessionId: frameSessionId } = msg.params
        // Send frame to client
        sendToClient(clientWs, {
          type: 'frame',
          data: frameData,
          sessionId: frameSessionId,
          timestamp: metadata?.timestamp,
        })
        // Acknowledge the frame (required for backpressure)
        cdpSend(cdpWs, 'Page.screencastFrameAck', { sessionId: frameSessionId })
        return
      }

      // Forward URL changes
      if (msg.method === 'Page.frameNavigated' && msg.params?.frame?.parentId === undefined) {
        sendToClient(clientWs, { type: 'url', url: msg.params.frame.url })
      }
    } catch { /* ignore parse errors */ }
  })

  // Enable page events and start screencast
  cdpSend(cdpWs, 'Page.enable', {})
  cdpSend(cdpWs, 'Page.startScreencast', {
    format: 'jpeg',
    quality: 60,
    maxWidth: 1280,
    maxHeight: 800,
  })

  // Helper to send CDP command and await result
  function cdpCall(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return new Promise((resolve) => {
      const id = nextCdpId()
      pendingCallbacks.set(id, resolve)
      cdpWs.send(JSON.stringify({ id, method, params }))
      // Timeout after 10s
      setTimeout(() => {
        if (pendingCallbacks.has(id)) {
          pendingCallbacks.delete(id)
          resolve(undefined)
        }
      }, 10_000)
    })
  }

  // Handle client input messages
  clientWs.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString())
      touchSession(sessionId)

      switch (msg.type) {
        case 'click':
          cdpSend(cdpWs, 'Input.dispatchMouseEvent', {
            type: 'mousePressed', x: msg.x, y: msg.y, button: 'left', clickCount: 1,
          })
          cdpSend(cdpWs, 'Input.dispatchMouseEvent', {
            type: 'mouseReleased', x: msg.x, y: msg.y, button: 'left', clickCount: 1,
          })
          break

        case 'type':
          for (const char of msg.text ?? '') {
            cdpSend(cdpWs, 'Input.dispatchKeyEvent', {
              type: 'keyDown', text: char, key: char, unmodifiedText: char,
            })
            cdpSend(cdpWs, 'Input.dispatchKeyEvent', {
              type: 'keyUp', key: char,
            })
          }
          break

        case 'press': {
          const keyInfo = KEY_MAP[msg.key]
          if (keyInfo) {
            cdpSend(cdpWs, 'Input.dispatchKeyEvent', {
              type: 'keyDown',
              key: keyInfo.key,
              code: keyInfo.code,
              windowsVirtualKeyCode: keyInfo.keyCode,
              nativeVirtualKeyCode: keyInfo.keyCode,
              text: keyInfo.text,
            })
            cdpSend(cdpWs, 'Input.dispatchKeyEvent', {
              type: 'keyUp',
              key: keyInfo.key,
              code: keyInfo.code,
              windowsVirtualKeyCode: keyInfo.keyCode,
              nativeVirtualKeyCode: keyInfo.keyCode,
            })
          } else {
            // Generic key press
            cdpSend(cdpWs, 'Input.dispatchKeyEvent', { type: 'keyDown', key: msg.key })
            cdpSend(cdpWs, 'Input.dispatchKeyEvent', { type: 'keyUp', key: msg.key })
          }
          break
        }

        case 'scroll':
          cdpSend(cdpWs, 'Input.dispatchMouseEvent', {
            type: 'mouseWheel',
            x: msg.x ?? 640,
            y: msg.y ?? 400,
            deltaX: msg.deltaX ?? 0,
            deltaY: msg.deltaY ?? 0,
          })
          break

        case 'navigate':
          void handleNavigate(msg.url, cdpWs, clientWs)
          break

        case 'back':
          void handleHistoryNav(cdpCall, cdpWs, 'back')
          break

        case 'forward':
          void handleHistoryNav(cdpCall, cdpWs, 'forward')
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
      cdpSend(cdpWs, 'Page.stopScreencast', {})
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

/** Get the first page's CDP WebSocket URL from the browser endpoint. */
async function getPageCdpUrl(browserWsUrl: string): Promise<string> {
  // Browser CDP URL: ws://127.0.0.1:PORT/devtools/browser/UUID
  // We need: ws://127.0.0.1:PORT/devtools/page/TARGET_ID
  // Get target list from the HTTP API
  const httpUrl = browserWsUrl.replace('ws://', 'http://').replace(/\/devtools\/browser\/.*/, '/json')
  const response = await fetch(httpUrl)
  const targets = await response.json() as Array<{ type: string; webSocketDebuggerUrl: string }>
  const page = targets.find(t => t.type === 'page')
  if (!page?.webSocketDebuggerUrl) {
    throw new Error('No page target found in Chromium')
  }
  return page.webSocketDebuggerUrl
}

/** Send a CDP command (fire and forget). */
function cdpSend(ws: WebSocket, method: string, params: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ id: nextCdpId(), method, params }))
  }
}

/** Send a message to the dashboard client. */
function sendToClient(ws: WebSocket, msg: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

/** Handle navigate command with SSRF validation. */
async function handleNavigate(url: string, cdpWs: WebSocket, clientWs: WebSocket): Promise<void> {
  try {
    const validUrl = await validateUrl(url)
    cdpSend(cdpWs, 'Page.navigate', { url: validUrl })
  } catch (err) {
    sendToClient(clientWs, { type: 'error', message: (err as Error).message })
  }
}

/** Handle back/forward navigation via CDP history API. */
async function handleHistoryNav(
  cdpCall: (method: string, params?: Record<string, unknown>) => Promise<unknown>,
  cdpWs: WebSocket,
  direction: 'back' | 'forward',
): Promise<void> {
  const history = await cdpCall('Page.getNavigationHistory') as {
    currentIndex: number
    entries: Array<{ id: number; url: string }>
  } | undefined
  if (!history) return

  const targetIndex = direction === 'back' ? history.currentIndex - 1 : history.currentIndex + 1
  if (targetIndex < 0 || targetIndex >= history.entries.length) return

  cdpSend(cdpWs, 'Page.navigateToHistoryEntry', { entryId: history.entries[targetIndex].id })
}

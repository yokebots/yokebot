/**
 * browser.ts — Browser-use via Playwright MCP server
 *
 * Spawns @playwright/mcp as a child process and communicates via
 * JSON-RPC over stdio. Provides agents with accessibility-tree-based
 * web browsing — no screenshots needed for most interactions.
 *
 * Session lifecycle:
 *  - Created lazily on first browser tool call
 *  - Auto-terminates after 5 min idle
 *  - One session per agent at a time
 */

import { spawn, type ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import { createInterface, type Interface } from 'readline'

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

interface BrowserSession {
  process: ChildProcess
  readline: Interface
  pending: Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>
  lastActivity: number
  idleTimer: ReturnType<typeof setTimeout>
}

// Active sessions keyed by agentId
const sessions = new Map<string, BrowserSession>()

const IDLE_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
const TOOL_TIMEOUT_MS = 30_000 // 30 seconds per tool call

/**
 * Send a JSON-RPC request to the MCP server and wait for the response.
 */
function sendRequest(session: BrowserSession, method: string, params?: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = randomUUID()
    const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }

    session.pending.set(id, { resolve, reject })

    // Timeout for individual requests
    const timer = setTimeout(() => {
      session.pending.delete(id)
      reject(new Error(`Browser MCP request timed out: ${method}`))
    }, TOOL_TIMEOUT_MS)

    session.pending.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v) },
      reject: (e) => { clearTimeout(timer); reject(e) },
    })

    session.process.stdin?.write(JSON.stringify(request) + '\n')
    session.lastActivity = Date.now()
  })
}

/**
 * Reset the idle timer for a session.
 */
function resetIdleTimer(agentId: string, session: BrowserSession) {
  clearTimeout(session.idleTimer)
  session.idleTimer = setTimeout(() => {
    closeBrowserSession(agentId)
  }, IDLE_TIMEOUT_MS)
}

/**
 * Start a browser session for an agent by spawning the Playwright MCP server.
 */
async function startBrowserSession(agentId: string): Promise<BrowserSession> {
  // Kill any existing session
  if (sessions.has(agentId)) {
    await closeBrowserSession(agentId)
  }

  const child = spawn('npx', ['@playwright/mcp@latest', '--headless'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  })

  const readline = createInterface({ input: child.stdout! })
  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

  const session: BrowserSession = {
    process: child,
    readline,
    pending,
    lastActivity: Date.now(),
    idleTimer: setTimeout(() => closeBrowserSession(agentId), IDLE_TIMEOUT_MS),
  }

  // Handle JSON-RPC responses from stdout
  readline.on('line', (line) => {
    try {
      const response = JSON.parse(line) as JsonRpcResponse
      if (response.id && pending.has(String(response.id))) {
        const { resolve, reject } = pending.get(String(response.id))!
        pending.delete(String(response.id))
        if (response.error) {
          reject(new Error(response.error.message))
        } else {
          resolve(response.result)
        }
      }
    } catch {
      // Not JSON or not a response — ignore
    }
  })

  // Handle process exit
  child.on('exit', (code) => {
    // Reject all pending requests
    for (const [, { reject }] of pending) {
      reject(new Error(`Browser process exited with code ${code}`))
    }
    pending.clear()
    sessions.delete(agentId)
    clearTimeout(session.idleTimer)
  })

  // Log stderr for debugging
  child.stderr?.on('data', (data) => {
    const msg = data.toString().trim()
    if (msg) console.warn(`[browser:${agentId.slice(0, 8)}] ${msg}`)
  })

  sessions.set(agentId, session)

  // Initialize the MCP connection
  try {
    await sendRequest(session, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'yokebot-browser', version: '1.0.0' },
    })
  } catch (err) {
    await closeBrowserSession(agentId)
    throw new Error(`Failed to initialize browser session: ${(err as Error).message}`)
  }

  return session
}

/**
 * Close a browser session and clean up resources.
 */
export async function closeBrowserSession(agentId: string): Promise<void> {
  const session = sessions.get(agentId)
  if (!session) return

  clearTimeout(session.idleTimer)
  session.readline.close()

  // Gracefully terminate
  try {
    session.process.kill('SIGTERM')
    // Give it 2 seconds to exit, then force kill
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        session.process.kill('SIGKILL')
        resolve()
      }, 2000)
      session.process.on('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  } catch {
    // Already dead
  }

  sessions.delete(agentId)
}

/**
 * Get or create a browser session for an agent.
 */
async function getSession(agentId: string): Promise<BrowserSession> {
  let session = sessions.get(agentId)
  if (!session || session.process.exitCode !== null) {
    session = await startBrowserSession(agentId)
  }
  resetIdleTimer(agentId, session)
  return session
}

/**
 * Execute a browser tool call for an agent.
 * Returns the result string or null if the tool name is not a browser tool.
 */
export async function executeBrowserTool(
  agentId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string | null> {
  // Map YokeBot tool names to Playwright MCP tool names
  const toolMap: Record<string, string> = {
    browser_navigate: 'browser_navigate',
    browser_snapshot: 'browser_snapshot',
    browser_click: 'browser_click',
    browser_type: 'browser_type',
    browser_select_option: 'browser_select_option',
    browser_press_key: 'browser_press_key',
    browser_evaluate: 'browser_evaluate',
    browser_close: 'browser_close',
  }

  const mcpToolName = toolMap[toolName]
  if (!mcpToolName) return null

  // Handle close explicitly
  if (toolName === 'browser_close') {
    await closeBrowserSession(agentId)
    return 'Browser session closed.'
  }

  try {
    const session = await getSession(agentId)

    // Call the MCP tool
    const result = await sendRequest(session, 'tools/call', {
      name: mcpToolName,
      arguments: args,
    }) as { content?: Array<{ type: string; text?: string }> }

    // Extract text content from MCP response
    if (result?.content) {
      return result.content
        .filter((c) => c.type === 'text' && c.text)
        .map((c) => c.text)
        .join('\n') || 'Action completed (no text output).'
    }

    return 'Action completed.'
  } catch (err) {
    const message = (err as Error).message
    // If the process died, clean up
    if (message.includes('exited') || message.includes('timed out')) {
      await closeBrowserSession(agentId)
    }
    return `Browser error: ${message}`
  }
}

/**
 * Check if a tool name is a browser tool.
 */
export function isBrowserTool(toolName: string): boolean {
  return toolName.startsWith('browser_')
}

/**
 * Get the number of active browser sessions (for monitoring).
 */
export function getActiveBrowserSessions(): number {
  return sessions.size
}

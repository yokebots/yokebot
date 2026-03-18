/**
 * browser.ts — Agent browser tools using shared CDP Chromium
 *
 * Agents use the same Chromium instance as humans (managed by browser-sessions.ts).
 * Browser tools (navigate, click, type, etc.) execute via Playwright connected
 * to the shared CDP session. This enables real-time observation: humans see
 * every agent action via CDP Screencast.
 *
 * Session lifecycle:
 *  - Created lazily on first browser tool call via createBrowserSession()
 *  - Shared with human viewers (same page, same cookies, same state)
 *  - Auto-cleanup via browser-sessions.ts idle/expiry timers
 */

import {
  createBrowserSession,
  getSessionInfo,
  closeBrowserSession,
  setSessionController,
  touchSession,
  type BrowserSessionState,
} from './browser-sessions.ts'

// Maps agentId → browser session ID (shared with browser-sessions.ts)
const agentSessions = new Map<string, string>()

// Broadcast callback — set by index.ts to push browser_frame SSE events
let broadcastFn: ((teamId: string, event: string, data: unknown) => void) | null = null

export function setBrowserBroadcast(fn: (teamId: string, event: string, data: unknown) => void): void {
  broadcastFn = fn
}

/**
 * Get or create a browser session for an agent.
 * Reuses an existing session if one is already active.
 */
async function getAgentSession(agentId: string, teamId?: string): Promise<BrowserSessionState> {
  // Check for existing session
  const existingId = agentSessions.get(agentId)
  if (existingId) {
    const session = getSessionInfo(existingId)
    if (session && session.browser.isConnected()) {
      return session
    }
    // Session is dead, clean up reference
    agentSessions.delete(agentId)
  }

  // Create a new shared session
  if (!teamId) throw new Error('Cannot create browser session without teamId')

  const result = await createBrowserSession(teamId, `agent:${agentId}`, {
    mode: 'agent_browser',
  })

  agentSessions.set(agentId, result.sessionId)
  const session = getSessionInfo(result.sessionId)
  if (!session) throw new Error('Failed to create browser session')

  // Notify dashboard so it auto-opens a browser tab for this agent
  if (broadcastFn) {
    broadcastFn(teamId, 'agent_browser_started', {
      agentId,
      sessionId: result.sessionId,
    })
  }

  return session
}

/**
 * Close a browser session for an agent.
 */
export async function closeBrowserSessionForAgent(agentId: string): Promise<void> {
  const sessionId = agentSessions.get(agentId)
  if (!sessionId) return

  agentSessions.delete(agentId)
  await closeBrowserSession(sessionId)
}

/**
 * Restart an agent's browser session with vault state.
 * Used by use_saved_login — restores cookies/storage via CDP.
 */
export async function restartWithVaultState(
  agentId: string,
  teamId: string,
  vaultSessionId: string,
  db: import('./db/types.ts').Db,
): Promise<void> {
  // Close existing session if any
  await closeBrowserSessionForAgent(agentId)

  // Create new session with vault state
  const result = await createBrowserSession(teamId, `agent:${agentId}`, {
    mode: 'agent_browser',
    vaultSessionId,
    db,
  })

  agentSessions.set(agentId, result.sessionId)
}

/**
 * Capture a screenshot from an agent's active browser session.
 * Returns base64 PNG or null if no active session.
 */
export async function captureAgentScreenshot(agentId: string): Promise<{ screenshot: string; url: string } | null> {
  const sessionId = agentSessions.get(agentId)
  if (!sessionId) return null

  const session = getSessionInfo(sessionId)
  if (!session || !session.browser.isConnected()) {
    agentSessions.delete(agentId)
    return null
  }

  try {
    const screenshot = await session.page.screenshot({ type: 'png' })
    return {
      screenshot: screenshot.toString('base64'),
      url: session.page.url(),
    }
  } catch {
    return null
  }
}

/**
 * Execute a browser tool call for an agent.
 * Returns the result string or null if the tool name is not a browser tool.
 * Uses Playwright directly connected to the shared CDP Chromium instance.
 */
export async function executeBrowserTool(
  agentId: string,
  toolName: string,
  args: Record<string, unknown>,
  teamId?: string,
): Promise<string | null> {
  // Handle close explicitly
  if (toolName === 'browser_close') {
    await closeBrowserSessionForAgent(agentId)
    return 'Browser session closed.'
  }

  // browser_ask_human — handled by runtime.ts, return a marker
  if (toolName === 'browser_ask_human') {
    return '__browser_ask_human__'
  }

  // browser_download_file — placeholder
  if (toolName === 'browser_download_file') {
    const description = (args.description as string) || 'unknown file'
    return `Download initiated: "${description}". Note: file downloads are captured automatically. Check the workspace files panel.`
  }

  // browser_start_recording / browser_stop_recording — recording via screenshots
  if (toolName === 'browser_start_recording') {
    return 'Recording started. Frames will be captured after each browser action. Call browser_stop_recording to save.'
  }
  if (toolName === 'browser_stop_recording') {
    return 'Recording stopped.'
  }

  // All other browser tools need an active session
  if (!toolName.startsWith('browser_')) return null

  console.log(`[browser] Agent ${agentId} calling ${toolName}`, JSON.stringify(args).slice(0, 200))

  try {
    const session = await getAgentSession(agentId, teamId)
    const { page } = session

    // Keep session alive while agent is actively using it
    touchSession(session.id)

    let output = ''
    let screenshotBase64: string | undefined

    switch (toolName) {
      case 'browser_navigate': {
        const url = args.url as string
        if (!url) return 'Error: url is required'
        // Use the page directly — SSRF validation is done in browser-sessions.ts on navigate
        const { validateUrl } = await import('./browser-sessions.ts')
        const validUrl = await validateUrl(url)
        await page.goto(validUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
        output = `Navigated to ${page.url()}`
        // Auto-include page snapshot so the agent sees the page immediately
        output += await capturePageSnapshot(session)
        break
      }

      case 'browser_snapshot': {
        // Return accessibility tree snapshot via CDP
        const url = page.url()
        const title = await page.title()
        output = `- url: ${url}\n- title: ${title}\n\n`
        try {
          const cdpSession = await session.context.newCDPSession(page)
          try {
            const tree = await cdpSession.send('Accessibility.getFullAXTree') as {
              nodes: Array<{ role?: { value: string }; name?: { value: string }; value?: { value: string }; childIds?: string[] }>
            }
            output += formatCdpAccessibilityTree(tree.nodes)
          } finally {
            await cdpSession.detach()
          }
        } catch {
          // Fallback: use aria snapshot from locator
          try {
            const ariaSnapshot = await page.locator('body').ariaSnapshot()
            output += ariaSnapshot
          } catch {
            output += '(could not capture accessibility tree)'
          }
        }
        break
      }

      case 'browser_click': {
        const ref = args.ref as string
        const element = args.element as string
        if (ref) {
          // Click by accessibility ref (text content / role)
          await clickByRef(page, ref)
        } else if (element) {
          await clickByRef(page, element)
        } else {
          return 'Error: ref or element is required'
        }
        output = `Clicked "${ref || element}"`
        // Auto-include updated page snapshot after click
        output += await capturePageSnapshot(session)
        break
      }

      case 'browser_type': {
        const text = args.text as string
        const ref = args.ref as string
        if (ref) {
          await clickByRef(page, ref)
        }
        if (text) {
          // Clear field first then type
          if (args.clear !== false) {
            await page.keyboard.press('Control+a')
            await page.keyboard.press('Backspace')
          }
          await page.keyboard.type(text)
        }
        output = `Typed "${text?.slice(0, 50)}${(text?.length ?? 0) > 50 ? '...' : ''}"${ref ? ` into "${ref}"` : ''}`
        // Auto-include updated page snapshot after typing
        output += await capturePageSnapshot(session)
        break
      }

      case 'browser_select_option': {
        const ref = args.ref as string
        const values = args.values as string[] ?? [args.value as string].filter(Boolean)
        if (ref && values.length) {
          try {
            await page.selectOption(`text=${ref}`, values)
          } catch {
            // Fallback: try clicking the select then option
            await clickByRef(page, ref)
            for (const v of values) {
              await clickByRef(page, v)
            }
          }
        }
        output = `Selected ${values.join(', ')} in "${ref}"`
        // Auto-include updated page snapshot after selection
        output += await capturePageSnapshot(session)
        break
      }

      case 'browser_press_key': {
        const key = (args.key as string) ?? ''
        await page.keyboard.press(key)
        output = `Pressed "${key}"`
        // Auto-include updated page snapshot after key press (Enter/Tab can change page state)
        output += await capturePageSnapshot(session)
        break
      }

      case 'browser_screenshot': {
        const screenshot = await page.screenshot({ type: 'png' })
        screenshotBase64 = screenshot.toString('base64')
        output = `Screenshot captured (${Math.round(screenshotBase64.length * 0.75 / 1024)}KB PNG)`
        break
      }

      case 'browser_fill_form': {
        const fields = args.fields as Array<{ selector: string; value: string }> | undefined
        if (!fields?.length) return 'No fields to fill.'
        const results: string[] = []
        for (const field of fields) {
          try {
            await clickByRef(page, field.selector)
            await page.keyboard.press('Control+a')
            await page.keyboard.press('Backspace')
            await page.keyboard.type(field.value)
            results.push(`OK ${field.selector}: "${field.value}"`)
          } catch (err) {
            results.push(`FAIL ${field.selector}: ${(err as Error).message}`)
          }
        }
        if (args.submit) {
          try {
            await page.keyboard.press('Enter')
            results.push('OK Form submitted')
          } catch (err) {
            results.push(`FAIL Submit: ${(err as Error).message}`)
          }
        }
        output = `Form fill results:\n${results.join('\n')}`
        // Auto-include updated page snapshot after form fill
        output += await capturePageSnapshot(session)
        break
      }

      default:
        return null
    }

    // Broadcast screenshot for live SSE viewers (fallback for non-WebSocket clients)
    if (broadcastFn && teamId && toolName !== 'browser_screenshot') {
      try {
        const snap = await page.screenshot({ type: 'png' })
        broadcastFn(teamId, 'browser_frame', {
          agentId,
          screenshot: snap.toString('base64'),
          tool: toolName,
        })
      } catch { /* silent — viewer frames are best-effort */ }
    }

    console.log(`[browser] Agent ${agentId} ${toolName} → ${(output || 'Action completed.').slice(0, 100)}`)
    return output || 'Action completed.'
  } catch (err) {
    const message = (err as Error).message
    console.error(`[browser] Agent ${agentId} ${toolName} error: ${message}`)
    if (message.includes('Target closed') || message.includes('Browser has been closed')) {
      agentSessions.delete(agentId)
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
  return agentSessions.size
}

/**
 * Get the session ID for an agent (used for linking agent → shared session).
 */
export function getAgentSessionId(agentId: string): string | undefined {
  return agentSessions.get(agentId)
}

// ---- Helpers ----

/**
 * Capture a compact page snapshot (accessibility tree + url + title).
 * Used to auto-include page state after navigate/click/type actions
 * so small models don't need to call browser_snapshot separately.
 */
async function capturePageSnapshot(session: BrowserSessionState): Promise<string> {
  const { page, context } = session
  try {
    const url = page.url()
    const title = await page.title()
    let snapshot = `\n\n--- Page snapshot ---\n- url: ${url}\n- title: ${title}\n\n`
    try {
      const cdpSession = await context.newCDPSession(page)
      try {
        const tree = await cdpSession.send('Accessibility.getFullAXTree') as {
          nodes: Array<{ role?: { value: string }; name?: { value: string }; value?: { value: string }; childIds?: string[] }>
        }
        snapshot += formatCdpAccessibilityTree(tree.nodes)
      } finally {
        await cdpSession.detach()
      }
    } catch {
      try {
        const ariaSnapshot = await page.locator('body').ariaSnapshot()
        snapshot += ariaSnapshot
      } catch {
        snapshot += '(could not capture accessibility tree)'
      }
    }
    return snapshot
  } catch {
    return '\n\n--- Page snapshot ---\n(could not capture page state)'
  }
}

/**
 * Click an element by accessible name or text content.
 * Tries multiple strategies: getByRole, getByText, CSS selector.
 */
async function clickByRef(page: import('playwright').Page, ref: string): Promise<void> {
  // Parse bracket notation from accessibility tree: [role "name"] or [role "name" value="val"]
  let parsedName = ref
  let parsedRole: string | undefined
  const bracketMatch = ref.match(/^\[(\w+)\s+"([^"]+)"/)
  if (bracketMatch) {
    parsedRole = bracketMatch[1].toLowerCase()
    parsedName = bracketMatch[2]
  }

  // If we extracted a role, try role-aware matching first
  if (parsedRole) {
    const roleMap: Record<string, string> = {
      link: 'link', button: 'button', textbox: 'textbox', heading: 'heading',
      menuitem: 'menuitem', tab: 'tab', checkbox: 'checkbox', radio: 'radio',
      combobox: 'combobox',
    }
    const pwRole = roleMap[parsedRole]
    if (pwRole) {
      try {
        await page.getByRole(pwRole as any, { name: parsedName }).first().click({ timeout: 3000 })
        return
      } catch { /* try next */ }
    }
  }

  // Try text selector (most common from accessibility tree)
  try {
    await page.getByText(parsedName, { exact: false }).first().click({ timeout: 3000 })
    return
  } catch { /* try next */ }

  // Try role-based selectors
  try {
    await page.getByRole('button', { name: parsedName }).first().click({ timeout: 2000 })
    return
  } catch { /* try next */ }

  try {
    await page.getByRole('link', { name: parsedName }).first().click({ timeout: 2000 })
    return
  } catch { /* try next */ }

  try {
    await page.getByRole('textbox', { name: parsedName }).first().click({ timeout: 2000 })
    return
  } catch { /* try next */ }

  // Fallback: try as CSS selector
  try {
    await page.locator(parsedName).first().click({ timeout: 2000 })
    return
  } catch { /* try next */ }

  throw new Error(`Could not find element: "${ref}" (parsed as "${parsedName}")`)
}

/**
 * Format CDP accessibility tree nodes into a readable string.
 */
function formatCdpAccessibilityTree(
  nodes: Array<{ role?: { value: string }; name?: { value: string }; value?: { value: string }; childIds?: string[] }>,
): string {
  if (!nodes.length) return '(empty page)'

  const lines: string[] = []
  // Build a flat list, skipping generic/none roles
  for (const node of nodes.slice(0, 200)) { // Cap at 200 nodes to avoid huge output
    const role = node.role?.value ?? ''
    const name = node.name?.value ?? ''
    const value = node.value?.value ?? ''

    if (!role || role === 'none' || role === 'generic' || role === 'InlineTextBox') continue

    const parts = [role]
    if (name) parts.push(`"${name}"`)
    if (value) parts.push(`value="${value}"`)
    lines.push(`[${parts.join(' ')}]`)
  }

  return lines.join('\n') || '(empty page)'
}

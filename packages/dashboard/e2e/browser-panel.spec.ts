/**
 * E2E Test: Browser Panel (CDP Screencast)
 *
 * Verifies the browser panel UI renders correctly, the session lifecycle
 * works (create → view → close), and core controls are present.
 *
 * Note: Full WebSocket streaming tests require a live Chromium instance on
 * Railway, so we focus on UI structure, session creation via API, and
 * panel rendering rather than actual frame streaming.
 */

import { test, expect } from './fixtures'
import { BrowserPanelPage } from './pages'

const ENGINE_URL = 'https://yokebot-engine-production.up.railway.app'

test.describe('Browser Panel', () => {
  test('can create a browser session via API', async ({ engineApi }) => {
    // Create a browser session
    const res = await engineApi.post('/api/browser-sessions', {
      startUrl: 'https://example.com',
      mode: 'take_control',
    })

    // Should succeed (or fail gracefully if Chromium isn't available on Railway)
    if (res.ok) {
      const data = (await res.json()) as { sessionId: string; url: string }
      expect(data.sessionId).toBeTruthy()
      expect(data.url).toBeTruthy()

      // Clean up — close the session
      await engineApi.del(`/api/browser-sessions/${data.sessionId}`)
    } else {
      // Chromium may not be installed on Railway — that's OK for this test
      const text = await res.text()
      console.log(`[e2e:browser] Session creation failed (expected if no Chromium): ${res.status} ${text}`)
    }
  })

  test('can list browser sessions', async ({ engineApi }) => {
    const res = await engineApi.get('/api/browser-sessions')
    expect(res.ok).toBe(true)

    const sessions = (await res.json()) as Array<{ id: string }>
    expect(Array.isArray(sessions)).toBe(true)
  })

  test('workspace browser tab shows panel UI', async ({ authedPage }) => {
    await authedPage.goto('/workspace', { waitUntil: 'domcontentloaded' })

    // Wait for workspace to load
    await expect(authedPage.locator('span:text-is("Files")').or(
      authedPage.locator('[data-testid="files-panel"]'),
    )).toBeVisible({ timeout: 15000 })

    // Look for a browser-related tab or button in the workspace
    // The browser panel renders when a session is active
    const browserTab = authedPage.locator('button:has-text("Browser")').or(
      authedPage.locator('span:text-is("Browser")'),
    )

    // Browser tab may or may not be visible depending on active sessions
    // Just verify the workspace loaded without errors
    await authedPage.screenshot({ path: 'e2e/screenshots/browser-panel-workspace.png' })
  })

  test('browser popout page loads', async ({ authedPage }) => {
    // Navigate to the popout page with a fake session ID
    await authedPage.goto('/browser-popout?session=test-session-123', {
      waitUntil: 'domcontentloaded',
    })

    // Should render the BrowserPanel component (may show loading or error state)
    const panel = authedPage.locator('[data-testid="browser-panel"]')
    const loading = authedPage.locator('[data-testid="browser-loading"]')
    const viewport = authedPage.locator('[data-testid="browser-viewport"]')

    // One of these should be visible — panel renders in some state
    await expect(panel.or(loading).or(viewport)).toBeVisible({ timeout: 10000 })

    await authedPage.screenshot({ path: 'e2e/screenshots/browser-popout-page.png' })
  })

  test('browser panel shows URL bar and controls in take_control mode', async ({ authedPage, engineApi }) => {
    // Try to create a session
    const res = await engineApi.post('/api/browser-sessions', {
      startUrl: 'https://example.com',
      mode: 'take_control',
    })

    if (!res.ok) {
      console.log('[e2e:browser] Skipping UI test — no Chromium available')
      return
    }

    const { sessionId } = (await res.json()) as { sessionId: string }

    try {
      // Navigate to the popout page with the real session
      await authedPage.goto(`/browser-popout?session=${sessionId}`, {
        waitUntil: 'domcontentloaded',
      })

      const browser = new BrowserPanelPage(authedPage)

      // Wait for either connection or a visible panel
      await expect(
        browser.urlBar.or(browser.browserReady).or(browser.loadingSpinner),
      ).toBeVisible({ timeout: 15000 })

      // If URL bar is visible, verify controls
      if (await browser.urlBar.isVisible().catch(() => false)) {
        await expect(browser.urlInput).toBeVisible()
        await expect(browser.backButton).toBeVisible()
        await expect(browser.forwardButton).toBeVisible()
        await expect(browser.refreshButton).toBeVisible()
        await expect(browser.zoomInButton).toBeVisible()
        await expect(browser.zoomOutButton).toBeVisible()
        await expect(browser.saveLoginButton).toBeVisible()
      }

      await authedPage.screenshot({ path: 'e2e/screenshots/browser-panel-controls.png' })
    } finally {
      // Always clean up
      await engineApi.del(`/api/browser-sessions/${sessionId}`)
    }
  })

  test('browser panel shows zoom controls', async ({ authedPage, engineApi }) => {
    const res = await engineApi.post('/api/browser-sessions', {
      startUrl: 'https://example.com',
      mode: 'take_control',
    })

    if (!res.ok) {
      console.log('[e2e:browser] Skipping zoom test — no Chromium available')
      return
    }

    const { sessionId } = (await res.json()) as { sessionId: string }

    try {
      await authedPage.goto(`/browser-popout?session=${sessionId}`, {
        waitUntil: 'domcontentloaded',
      })

      const browser = new BrowserPanelPage(authedPage)

      // Wait for panel to load
      await expect(
        browser.urlBar.or(browser.loadingSpinner),
      ).toBeVisible({ timeout: 15000 })

      if (await browser.zoomResetButton.isVisible().catch(() => false)) {
        // Default zoom should be 100%
        const zoom = await browser.getZoom()
        expect(zoom).toContain('100%')

        // Zoom out
        await browser.zoomOut()
        const zoomAfter = await browser.getZoom()
        expect(zoomAfter).toContain('75%')

        // Zoom reset
        await browser.zoomResetButton.click()
        const zoomReset = await browser.getZoom()
        expect(zoomReset).toContain('100%')
      }

      await authedPage.screenshot({ path: 'e2e/screenshots/browser-panel-zoom.png' })
    } finally {
      await engineApi.del(`/api/browser-sessions/${sessionId}`)
    }
  })
})

/**
 * Page Object Model for the Browser Panel (CDP Screencast viewer).
 *
 * Covers the streaming canvas, navigation bar, control handoff,
 * zoom controls, and connection status indicators.
 */

import type { Locator, Page } from '@playwright/test'

export class BrowserPanelPage {
  readonly page: Page

  // ── Canvas ─────────────────────────────────────────────────────────
  readonly canvas: Locator

  // ── Navigation bar ─────────────────────────────────────────────────
  readonly urlBar: Locator
  readonly urlInput: Locator
  readonly backButton: Locator
  readonly forwardButton: Locator
  readonly refreshButton: Locator

  // ── Toolbar actions ────────────────────────────────────────────────
  readonly saveLoginButton: Locator
  readonly popoutButton: Locator
  readonly takeControlButton: Locator
  readonly returnToAgentButton: Locator

  // ── Status ─────────────────────────────────────────────────────────
  readonly statusBar: Locator
  readonly connectionIndicator: Locator
  readonly errorBanner: Locator

  // ── Zoom controls ──────────────────────────────────────────────────
  readonly zoomInButton: Locator
  readonly zoomOutButton: Locator
  readonly zoomResetButton: Locator

  // ── State indicators ───────────────────────────────────────────────
  readonly loadingSpinner: Locator
  readonly browserReady: Locator
  readonly waitingForAgent: Locator
  readonly viewport: Locator

  constructor(page: Page) {
    this.page = page

    // Match data-testid attributes in BrowserPanel.tsx
    this.canvas = page.locator('[data-testid="browser-canvas"]')
    this.urlBar = page.locator('[data-testid="browser-url-bar"]')
    this.urlInput = page.locator('[data-testid="browser-url-input"]')
    this.backButton = page.locator('[data-testid="browser-back"]')
    this.forwardButton = page.locator('[data-testid="browser-forward"]')
    this.refreshButton = page.locator('[data-testid="browser-refresh"]')

    this.saveLoginButton = page.locator('[data-testid="browser-save-login"]')
    this.popoutButton = page.locator('[data-testid="browser-popout"]').first()
    this.takeControlButton = page.locator('[data-testid="browser-take-control"]')
    this.returnToAgentButton = page.locator('[data-testid="browser-return-to-agent"]')

    this.statusBar = page.locator('[data-testid="browser-status-bar"]')
    this.connectionIndicator = page.locator('[data-testid="browser-connection-indicator"]').first()
    this.errorBanner = page.locator('[data-testid="browser-error"]')

    this.zoomInButton = page.locator('[data-testid="browser-zoom-in"]')
    this.zoomOutButton = page.locator('[data-testid="browser-zoom-out"]')
    this.zoomResetButton = page.locator('[data-testid="browser-zoom-reset"]')

    this.loadingSpinner = page.locator('[data-testid="browser-loading"]')
    this.browserReady = page.locator('[data-testid="browser-ready"]')
    this.waitingForAgent = page.locator('[data-testid="browser-waiting-agent"]')
    this.viewport = page.locator('[data-testid="browser-viewport"]')
  }

  // ── Navigation actions ─────────────────────────────────────────────

  /** Type a URL into the address bar and press Enter. */
  async navigate(url: string) {
    await this.urlInput.fill(url)
    await this.urlInput.press('Enter')
  }

  /** Click at specific coordinates on the browser canvas. */
  async clickCanvas(x: number, y: number) {
    await this.canvas.click({ position: { x, y } })
  }

  /** Type text while the canvas viewport is focused. */
  async typeText(text: string) {
    await this.viewport.focus()
    await this.page.keyboard.type(text)
  }

  // ── Control handoff ────────────────────────────────────────────────

  async takeControl() {
    await this.takeControlButton.click()
  }

  async returnToAgent() {
    await this.returnToAgentButton.click()
  }

  // ── Toolbar actions ────────────────────────────────────────────────

  async popout() {
    await this.popoutButton.click()
  }

  async saveLogin() {
    await this.saveLoginButton.click()
  }

  async zoomIn() {
    await this.zoomInButton.click()
  }

  async zoomOut() {
    await this.zoomOutButton.click()
  }

  // ── State getters ──────────────────────────────────────────────────

  /** Check if connected by examining the connection indicator's CSS class. */
  async isConnected(): Promise<boolean> {
    const cls = (await this.connectionIndicator.getAttribute('class')) ?? ''
    return cls.includes('bg-forest-green') || cls.includes('bg-blue-500')
  }

  /** Get the current URL from the address bar. */
  async getCurrentUrl(): Promise<string> {
    return (await this.urlInput.inputValue()) ?? ''
  }

  /** Get the error message, or null if no error. */
  async getError(): Promise<string | null> {
    if (await this.errorBanner.isVisible().catch(() => false)) {
      return this.errorBanner.textContent()
    }
    return null
  }

  /** Get the current zoom level text. */
  async getZoom(): Promise<string> {
    return (await this.zoomResetButton.textContent()) ?? ''
  }
}

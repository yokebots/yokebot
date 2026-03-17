/**
 * Page Object Model for the Settings page (/settings).
 *
 * Covers the settings navigation tabs and sub-page selectors,
 * including the Session Vault tab.
 */

import type { Locator, Page } from '@playwright/test'

export class SettingsPage {
  readonly page: Page

  // ── Top-level elements ─────────────────────────────────────────────
  readonly heading: Locator
  readonly navTabs: Locator

  // ── Vault tab selectors ────────────────────────────────────────────
  readonly vaultEmptyState: Locator
  readonly vaultRecordButton: Locator

  constructor(page: Page) {
    this.page = page

    this.heading = page.locator('[data-testid="settings-heading"]').or(
      page.getByRole('heading', { level: 1 }),
    )
    this.navTabs = page.locator('[data-testid="settings-nav-tabs"]').or(
      page.locator('nav').filter({ has: page.locator('button') }),
    )

    this.vaultEmptyState = page.locator('[data-testid="vault-empty-state"]').or(
      page.locator('text=No saved sessions yet'),
    )
    this.vaultRecordButton = page.locator('[data-testid="vault-record-button"]').or(
      page.locator('text=Record Your First Login').or(page.locator('text=Record New Login')),
    )
  }

  /**
   * Navigate to the settings page, optionally to a specific tab.
   * @param tab - e.g. 'vault', 'usage', 'billing'. Omit for /settings root.
   */
  async goto(tab?: string) {
    const path = tab ? `/settings/${tab}` : '/settings'
    await this.page.goto(path, { waitUntil: 'domcontentloaded' })
  }

  /** Click a settings navigation tab by its visible label. */
  async clickTab(name: string) {
    const tab = this.page
      .locator('[data-testid="settings-nav-tabs"] button', { hasText: name })
      .or(this.page.locator('button', { hasText: name }))
    await tab.first().click()
  }
}

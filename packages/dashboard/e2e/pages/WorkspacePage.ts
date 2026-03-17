/**
 * Page Object Model for the Workspace page (/workspace).
 *
 * Encapsulates the 3-panel layout: Files/Data panel, Tasks panel, and Team Chat panel.
 */

import type { Locator, Page } from '@playwright/test'

export class WorkspacePage {
  readonly page: Page

  // ── Layout ─────────────────────────────────────────────────────────
  readonly layout: Locator

  // ── Panels ─────────────────────────────────────────────────────────
  readonly filesPanel: Locator
  readonly tasksPanel: Locator
  readonly teamChatPanel: Locator

  // ── Inputs ─────────────────────────────────────────────────────────
  readonly searchInput: Locator
  readonly messageInput: Locator

  // ── Tab switchers (Files / Data) ───────────────────────────────────
  readonly filesTab: Locator
  readonly dataTab: Locator

  // ── View toggles (List / Kanban) ───────────────────────────────────
  readonly listViewButton: Locator
  readonly kanbanViewButton: Locator

  constructor(page: Page) {
    this.page = page

    this.layout = page.locator('[data-testid="workspace-layout"]')

    this.filesPanel = page.locator('[data-testid="files-panel"]')
    this.tasksPanel = page.locator('[data-testid="tasks-panel"]')
    this.teamChatPanel = page.locator('[data-testid="team-chat-panel"]')

    this.searchInput = page.locator(
      '[data-testid="files-search-input"], input[placeholder="Search files..."], input[placeholder="Search tables..."]',
    )
    this.messageInput = page.locator(
      '[data-testid="message-input"], input[placeholder*="Message your team"], textarea[placeholder*="Message your team"]',
    )

    this.filesTab = page.locator('[data-testid="files-tab"]').or(page.locator('button:has-text("Files")').first())
    this.dataTab = page.locator('[data-testid="data-tab"]').or(page.locator('button:has-text("Data")').first())

    this.listViewButton = page.locator('[data-testid="list-view-button"]').or(
      page.locator('button:has(span:text("view_list"))'),
    )
    this.kanbanViewButton = page.locator('[data-testid="kanban-view-button"]').or(
      page.locator('button:has(span:text("view_kanban"))'),
    )
  }

  /** Navigate to /workspace and wait for the DOM to be ready. */
  async goto() {
    await this.page.goto('/workspace', { waitUntil: 'domcontentloaded' })
  }

  /** Wait for the workspace layout container to become visible. */
  async waitForLoad(timeout = 15_000) {
    await this.layout.waitFor({ state: 'visible', timeout })
  }

  // ── Tab actions ────────────────────────────────────────────────────

  async clickFilesTab() {
    await this.filesTab.click()
  }

  async clickDataTab() {
    await this.dataTab.click()
  }

  // ── View toggle actions ────────────────────────────────────────────

  async clickListView() {
    await this.listViewButton.click()
  }

  async clickKanbanView() {
    await this.kanbanViewButton.click()
  }

  // ── Cmd+K ──────────────────────────────────────────────────────────

  /** Open the universal search overlay via Cmd+K (Mac) / Ctrl+K. */
  async openCmdK() {
    await this.page.keyboard.press('Meta+k')
  }
}

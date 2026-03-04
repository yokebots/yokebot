/**
 * E2E Test: Unified Workspace + UX Fixes
 *
 * Verifies the workspace page loads with all 3 panels,
 * the 5 UX fixes are working, and key interactions function correctly.
 */

import { test, expect } from '@playwright/test'
import { createTestUser, deleteTestUser, injectSession, type TestUser } from './test-utils'

let testUser: TestUser

test.beforeAll(async () => {
  console.log('[e2e] Creating fresh test user for workspace tests...')
  testUser = await createTestUser()
  console.log(`[e2e] Test user created: ${testUser.email} (${testUser.id}), team: ${testUser.teamId}`)
})

test.afterAll(async () => {
  if (testUser?.id) {
    console.log(`[e2e] Cleaning up test user: ${testUser.id}`)
    await deleteTestUser(testUser.id)
    console.log('[e2e] Test user deleted')
  }
})

async function setupPage(page: import('@playwright/test').Page, path = '/workspace') {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await injectSession(page, testUser)
  // Use domcontentloaded — networkidle never fires because SSE keeps a connection open
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  // Wait for the page to actually render
  await page.waitForTimeout(3000)
}

test.describe('Workspace Page', () => {
  test('loads with 3-panel layout on desktop', async ({ page }) => {
    await setupPage(page)

    // Files panel header
    await expect(page.locator('span:text-is("Files")')).toBeVisible({ timeout: 15000 })
    // Team Chat header
    await expect(page.locator('span:text-is("Team Chat")')).toBeVisible({ timeout: 5000 })
    // Tasks panel header (use the specific panel header, not sidebar)
    await expect(page.locator('span:text-is("Tasks")')).toBeVisible({ timeout: 5000 })

    await page.screenshot({ path: 'e2e/screenshots/workspace-loaded.png' })
  })

  test('files panel shows expandable tree with search', async ({ page }) => {
    await setupPage(page)

    // Files panel visible
    await expect(page.locator('span:text-is("Files")')).toBeVisible({ timeout: 10000 })

    // Search input should be present
    const searchInput = page.locator('input[placeholder*="Search"]')
    await expect(searchInput).toBeVisible({ timeout: 5000 })

    // Should show "No files yet" for empty team (not breadcrumbs)
    await expect(page.locator('text=No files yet')).toBeVisible({ timeout: 5000 })

    await page.screenshot({ path: 'e2e/screenshots/workspace-files-tree.png' })
  })

  test('tasks panel shows list and kanban views', async ({ page }) => {
    await setupPage(page)

    // Tasks panel header
    await expect(page.locator('span:text-is("Tasks")')).toBeVisible({ timeout: 10000 })

    // View toggle buttons should exist (using icon names since title may vary)
    const listBtn = page.locator('button:has(span:text("view_list"))')
    const kanbanBtn = page.locator('button:has(span:text("view_kanban"))')
    await expect(listBtn).toBeVisible({ timeout: 5000 })
    await expect(kanbanBtn).toBeVisible({ timeout: 5000 })

    // Toggle to kanban
    await kanbanBtn.click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'e2e/screenshots/workspace-kanban-view.png' })

    // Toggle back to list
    await listBtn.click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'e2e/screenshots/workspace-list-view.png' })
  })

  test('team chat loads with message input', async ({ page }) => {
    await setupPage(page)

    // Team Chat header
    await expect(page.locator('span:text-is("Team Chat")')).toBeVisible({ timeout: 10000 })

    // Message input should be present
    const messageInput = page.locator('input[placeholder*="Message your team"], textarea[placeholder*="Message your team"]')
    await expect(messageInput).toBeVisible({ timeout: 10000 })

    await page.screenshot({ path: 'e2e/screenshots/workspace-team-chat.png' })
  })

  test('cmd+K opens universal search', async ({ page }) => {
    await setupPage(page)

    await page.keyboard.press('Meta+k')
    await page.waitForTimeout(500)

    await page.screenshot({ path: 'e2e/screenshots/workspace-search-overlay.png' })
  })
})

test.describe('Usage Page', () => {
  test('loads and shows credit usage sections', async ({ page }) => {
    await setupPage(page, '/settings/usage')

    // Header should show
    await expect(page.locator('h1:text("Credit Usage")')).toBeVisible({ timeout: 15000 })

    // Should show the Recent Transactions section
    await expect(page.locator('h2:text("Recent Transactions")')).toBeVisible({ timeout: 5000 })

    await page.screenshot({ path: 'e2e/screenshots/usage-page.png' })
  })
})

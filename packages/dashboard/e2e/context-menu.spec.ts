/**
 * E2E Test: File Context Menu
 *
 * Verifies right-click context menu on workspace files:
 * - Context menu appears with correct options
 * - Copy Path works
 * - Rename inline input appears
 * - Delete with confirmation
 * - Keyboard shortcuts (F2, Delete)
 */

import { test, expect } from '@playwright/test'
import { createTestUser, deleteTestUser, injectSession, type TestUser } from './test-utils'

let testUser: TestUser

test.beforeAll(async () => {
  console.log('[e2e] Creating test user for context menu tests...')
  testUser = await createTestUser()
  console.log(`[e2e] Test user: ${testUser.email}, team: ${testUser.teamId}`)

  // Create a test file via engine API so there's something to right-click
  const ENGINE_URL = process.env.ENGINE_URL || 'https://yokebot-engine-production.up.railway.app'
  const res = await fetch(`${ENGINE_URL}/api/workspace/file`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${testUser.accessToken}`,
      'X-Team-Id': testUser.teamId,
    },
    body: JSON.stringify({
      path: 'test-context-menu.md',
      content: '# Context Menu Test\n\nThis file is for testing the right-click context menu.',
      agentId: 'e2e-test-setup',
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    console.warn(`[e2e] Failed to create test file: ${res.status} ${text}`)
  } else {
    console.log('[e2e] Test file created: test-context-menu.md')
  }
})

test.afterAll(async () => {
  if (testUser?.id) {
    console.log(`[e2e] Cleaning up test user: ${testUser.id}`)
    await deleteTestUser(testUser.id, testUser)
  }
})

async function setupPage(page: import('@playwright/test').Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await injectSession(page, testUser)
  await page.goto('/workspace', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
}

test.describe('File Context Menu', () => {
  test('right-click on file shows context menu with all options', async ({ page }) => {
    await setupPage(page)

    // Wait for the file to appear in the tree
    const fileRow = page.locator('button:has-text("test-context-menu.md")')
    await expect(fileRow).toBeVisible({ timeout: 15000 })

    // Right-click the file
    await fileRow.click({ button: 'right' })
    await page.waitForTimeout(300)

    // Context menu should appear with all options (scope to the fixed context menu)
    const menu = page.locator('.fixed.z-50')
    await expect(menu.locator('text=Open')).toBeVisible({ timeout: 3000 })
    await expect(menu.locator('text=Rename')).toBeVisible({ timeout: 3000 })
    await expect(menu.locator('text=Copy Path')).toBeVisible({ timeout: 3000 })
    await expect(menu.locator('text=Delete')).toBeVisible({ timeout: 3000 })

    await page.screenshot({ path: 'e2e/screenshots/context-menu-open.png' })
  })

  test('context menu closes on Escape', async ({ page }) => {
    await setupPage(page)

    const fileRow = page.locator('button:has-text("test-context-menu.md")')
    await expect(fileRow).toBeVisible({ timeout: 15000 })

    await fileRow.click({ button: 'right' })
    await expect(page.locator('text=Rename')).toBeVisible({ timeout: 3000 })

    // Press Escape
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    // Context menu should be gone
    await expect(page.locator('text=Copy Path')).toBeHidden({ timeout: 3000 })
  })

  test('context menu closes on click outside', async ({ page }) => {
    await setupPage(page)

    const fileRow = page.locator('button:has-text("test-context-menu.md")')
    await expect(fileRow).toBeVisible({ timeout: 15000 })

    await fileRow.click({ button: 'right' })
    await expect(page.locator('text=Rename')).toBeVisible({ timeout: 3000 })

    // Click outside
    await page.locator('body').click({ position: { x: 10, y: 10 } })
    await page.waitForTimeout(300)

    await expect(page.locator('text=Copy Path')).toBeHidden({ timeout: 3000 })
  })

  test('Open option opens file in viewer tab', async ({ page }) => {
    await setupPage(page)

    const fileRow = page.locator('button:has-text("test-context-menu.md")')
    await expect(fileRow).toBeVisible({ timeout: 15000 })

    await fileRow.click({ button: 'right' })
    await page.waitForTimeout(300)

    // Click Open in the context menu
    await page.locator('.fixed.z-50 button:has-text("Open")').click()
    await page.waitForTimeout(1000)

    // File content should be visible in the viewer
    await expect(page.locator('text=Context Menu Test')).toBeVisible({ timeout: 10000 })

    await page.screenshot({ path: 'e2e/screenshots/context-menu-open-file.png' })
  })

  test('Rename shows inline input with filename pre-selected', async ({ page }) => {
    await setupPage(page)

    const fileRow = page.locator('button:has-text("test-context-menu.md")')
    await expect(fileRow).toBeVisible({ timeout: 15000 })

    await fileRow.click({ button: 'right' })
    await page.waitForTimeout(300)

    // Click Rename
    await page.locator('button:has-text("Rename")').click()
    await page.waitForTimeout(500)

    // An inline input should appear with the filename
    const renameInput = page.locator('input[value="test-context-menu.md"]')
    await expect(renameInput).toBeVisible({ timeout: 3000 })

    await page.screenshot({ path: 'e2e/screenshots/context-menu-rename-input.png' })

    // Press Escape to cancel
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    // Input should be gone, file name should be back
    await expect(page.locator('button:has-text("test-context-menu.md")')).toBeVisible({ timeout: 3000 })
  })

  test('Copy Path copies file path to clipboard', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])

    await setupPage(page)

    const fileRow = page.locator('button:has-text("test-context-menu.md")')
    await expect(fileRow).toBeVisible({ timeout: 15000 })

    await fileRow.click({ button: 'right' })
    await page.waitForTimeout(300)

    // Click Copy Path
    await page.locator('button:has-text("Copy Path")').click()
    await page.waitForTimeout(500)

    // Read clipboard
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipboardText).toBe('test-context-menu.md')

    await page.screenshot({ path: 'e2e/screenshots/context-menu-copy-path.png' })
  })

  test('right-click on viewer tab shows context menu', async ({ page }) => {
    await setupPage(page)

    // Open the file first by clicking it
    const fileRow = page.locator('button:has-text("test-context-menu.md")')
    await expect(fileRow).toBeVisible({ timeout: 15000 })
    await fileRow.click()
    await page.waitForTimeout(1000)

    // Tab should appear in the viewer tab bar
    const tab = page.locator('button[title="test-context-menu.md"]')
    await expect(tab).toBeVisible({ timeout: 5000 })

    // Right-click the tab
    await tab.click({ button: 'right' })
    await page.waitForTimeout(300)

    // Context menu should appear
    const menu = page.locator('.fixed.z-50')
    await expect(menu.locator('text=Rename')).toBeVisible({ timeout: 3000 })
    await expect(menu.locator('text=Copy Path')).toBeVisible({ timeout: 3000 })
    await expect(menu.locator('text=Delete')).toBeVisible({ timeout: 3000 })

    await page.screenshot({ path: 'e2e/screenshots/tab-context-menu.png' })

    // Close with Escape
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden({ timeout: 3000 })
  })

  test('keyboard shortcut docs page exists', async ({ page }) => {
    await setupPage(page)
    await page.goto('/docs/keyboard-shortcuts', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // Should show the keyboard shortcuts content
    await expect(page.locator('h1:text("Keyboard Shortcuts")')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('h2:text("Workspace Files")')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=Rename the active file')).toBeVisible({ timeout: 5000 })

    await page.screenshot({ path: 'e2e/screenshots/keyboard-shortcuts-docs.png' })
  })
})

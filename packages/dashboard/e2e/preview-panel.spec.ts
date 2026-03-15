/**
 * E2E Test: Preview Panel — Visual Editing, Annotations, Project Import
 *
 * Tests the new sandbox Import Project UI, workspace stability after
 * PreviewPanel/FilesPanel changes, and verifies no console errors.
 */

import { test, expect } from '@playwright/test'
import { createTestUser, deleteTestUser, injectSession, type TestUser } from './test-utils'

let testUser: TestUser

test.beforeAll(async () => {
  console.log('[e2e] Creating fresh test user for preview panel tests...')
  testUser = await createTestUser()
  console.log(`[e2e] Test user created: ${testUser.email} (${testUser.id}), team: ${testUser.teamId}`)
})

test.afterAll(async () => {
  if (testUser?.id) {
    console.log(`[e2e] Cleaning up test user: ${testUser.id}`)
    await deleteTestUser(testUser.id, testUser)
    console.log('[e2e] Test user deleted')
  }
})

async function setupWorkspace(page: import('@playwright/test').Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await injectSession(page, testUser)
  // Use domcontentloaded — networkidle never fires because SSE keeps a connection open
  await page.goto('/workspace', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)

  // Dismiss welcome tour if present
  const skipTour = page.locator('text=Skip tour')
  if (await skipTour.isVisible({ timeout: 2000 }).catch(() => false)) {
    await skipTour.click()
    await page.waitForTimeout(500)
  }

  // If redirected to dashboard, click Workspace in sidebar
  if (page.url().includes('/dashboard') || !page.url().includes('/workspace')) {
    const workspaceLink = page.locator('a:has-text("Workspace")').first()
    if (await workspaceLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await workspaceLink.click()
      await page.waitForTimeout(3000)
    }
  }

  // Wait for workspace content — look for the search input in files panel
  await expect(page.locator('input[placeholder="Search files..."]')).toBeVisible({ timeout: 15000 })
}

test.describe('Preview Panel — Sandbox Import UI', () => {
  test('sandbox section visible with Import Project button', async ({ page }) => {
    await setupWorkspace(page)

    // Sandbox toggle should be visible at bottom of left panel
    const sandboxToggle = page.locator('button').filter({ hasText: 'Sandbox' }).last()
    await expect(sandboxToggle).toBeVisible({ timeout: 10000 })

    // Expand sandbox section
    await sandboxToggle.click()
    await page.waitForTimeout(500)

    // Import Project button should appear
    const importBtn = page.locator('button').filter({ hasText: 'Import Project' })
    await expect(importBtn).toBeVisible({ timeout: 5000 })

    await page.screenshot({ path: 'e2e/screenshots/preview-01-sandbox-import-btn.png' })
  })

  test('import button shows URL input, cancel dismisses it', async ({ page }) => {
    await setupWorkspace(page)

    // Expand sandbox
    await page.locator('button').filter({ hasText: 'Sandbox' }).last().click()
    await page.waitForTimeout(500)

    // Click Import Project
    await page.locator('button').filter({ hasText: 'Import Project' }).click()
    await page.waitForTimeout(300)

    // URL input visible
    const urlInput = page.locator('input[placeholder="https://github.com/user/repo"]')
    await expect(urlInput).toBeVisible({ timeout: 3000 })

    await page.screenshot({ path: 'e2e/screenshots/preview-02-import-url-input.png' })

    // Cancel hides it
    await page.locator('button').filter({ hasText: 'Cancel' }).click()
    await page.waitForTimeout(300)
    await expect(urlInput).not.toBeVisible()

    await page.screenshot({ path: 'e2e/screenshots/preview-03-import-cancelled.png' })
  })
})

test.describe('Preview Panel — Regression', () => {
  test('workspace loads with 3-panel layout, no console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await setupWorkspace(page)

    // Verify 3-panel layout
    await expect(page.locator('text=Team Chat')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=No tasks yet')).toBeVisible({ timeout: 5000 })

    // No critical console errors
    const criticalErrors = errors.filter(
      e => !e.includes('Failed to fetch') && !e.includes('NetworkError') &&
           !e.includes('AbortError') && !e.includes('Load failed')
    )
    expect(criticalErrors).toEqual([])

    await page.screenshot({ path: 'e2e/screenshots/preview-04-workspace-clean.png' })
  })

  test('sandbox section is visible at bottom of files panel', async ({ page }) => {
    await setupWorkspace(page)

    // Sandbox toggle at bottom of left panel
    const sandboxToggle = page.locator('button').filter({ hasText: 'Sandbox' }).last()
    await expect(sandboxToggle).toBeVisible({ timeout: 10000 })

    await page.screenshot({ path: 'e2e/screenshots/preview-05-sandbox-visible.png' })
  })
})

import { test, expect } from '@playwright/test'
import { createTestUser, deleteTestUser, injectSession, type TestUser } from './test-utils'

test.describe('Session Vault Page', () => {
  let testUser: TestUser
  let userId: string

  test.beforeAll(async () => {
    testUser = await createTestUser()
    userId = testUser.id
  })

  test.afterAll(async () => {
    if (userId && testUser) {
      await deleteTestUser(userId, testUser)
    }
  })

  test('loads Session Vault settings page', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await injectSession(page, testUser)
    await page.goto('/settings/vault')
    await page.waitForLoadState('networkidle')

    // Should show the Session Vault heading
    await expect(page.locator('text=Session Vault')).toBeVisible({ timeout: 15000 })

    // Should show empty state
    await expect(page.locator('text=No saved sessions yet')).toBeVisible({ timeout: 10000 })

    // Should show the "Record Your First Login" button
    await expect(page.locator('text=Record Your First Login')).toBeVisible()

    // Take a screenshot for visual verification
    await page.screenshot({ path: 'e2e/screenshots/session-vault-empty.png' })
  })

  test('Session Vault tab appears in settings navigation', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await injectSession(page, testUser)
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')

    // The "Session Vault" tab should be visible in the settings nav
    const vaultTab = page.locator('button', { hasText: 'Session Vault' })
    await expect(vaultTab).toBeVisible({ timeout: 15000 })

    // Click on it and verify navigation
    await vaultTab.click()
    await page.waitForURL('**/settings/vault')
    await expect(page.locator('text=Session Vault')).toBeVisible()

    await page.screenshot({ path: 'e2e/screenshots/session-vault-nav.png' })
  })

  test('Record New Login button opens recorder form', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await injectSession(page, testUser)
    await page.goto('/settings/vault')
    await page.waitForLoadState('networkidle')

    // Click "Record Your First Login" (empty state) or "Record New Login" (header button)
    const recordBtn = page.locator('text=Record Your First Login').or(page.locator('text=Record New Login')).first()
    await expect(recordBtn).toBeVisible({ timeout: 15000 })
    await recordBtn.click()

    // Should show the recording form modal
    await expect(page.locator('text=Record a Login')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=Your password is never stored')).toBeVisible()

    // Should have service name and URL inputs
    await expect(page.locator('input[placeholder*="HubSpot"]')).toBeVisible()
    await expect(page.locator('input[placeholder*="https://"]')).toBeVisible()

    await page.screenshot({ path: 'e2e/screenshots/session-vault-recorder-form.png' })

    // Cancel should close
    await page.locator('button', { hasText: 'Cancel' }).last().click()
    // Should go back to the vault page
    await expect(page.locator('text=No saved sessions yet')).toBeVisible({ timeout: 5000 })
  })
})

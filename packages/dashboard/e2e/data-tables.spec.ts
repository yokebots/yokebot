import { test, expect } from '@playwright/test'
import { createTestUser, injectSession, type TestUser } from './test-utils'

let testUser: TestUser

test.beforeAll(async () => {
  testUser = await createTestUser()
  console.log(`[e2e:data-tables] Test user: ${testUser.email} (${testUser.id})`)
})

test('Data Tables — create table with fields, add row, verify', async ({ page }) => {
  // 1. Navigate & inject auth
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await injectSession(page, testUser)
  await page.goto('/data-tables', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)

  // Skip onboarding if we landed there
  if (page.url().includes('/onboarding')) {
    console.log('[e2e:data-tables] On onboarding, clicking Continue without audio')
    const skipBtn = page.getByText('Continue without audio')
    if (await skipBtn.isVisible()) {
      await skipBtn.click()
      await page.waitForTimeout(2000)
    }
    // After skipping, try to navigate to data-tables
    await page.goto('/data-tables', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)
  }

  // If still on onboarding/dashboard, force navigate
  if (!page.url().includes('/data-tables')) {
    console.log(`[e2e:data-tables] Current URL: ${page.url()}, forcing nav to /data-tables`)
    await page.goto('/data-tables', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)
  }

  await page.screenshot({ path: 'e2e/screenshots/data-tables-01-initial.png', fullPage: true })

  // 2. Look for the "Create Your First Table" button or the + tab
  const createFirstBtn = page.getByRole('button', { name: 'Create Your First Table' })
  const plusTab = page.locator('button').filter({ has: page.locator('span.material-symbols-outlined') }).filter({ hasText: '' })

  if (await createFirstBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await createFirstBtn.click()
  } else {
    // Click last button in the tab bar (the + button)
    const tabBar = page.locator('div.flex.flex-wrap.gap-1.border-b')
    const buttons = tabBar.locator('button')
    const count = await buttons.count()
    await buttons.nth(count - 1).click()
  }
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'e2e/screenshots/data-tables-02-create-panel.png', fullPage: true })

  // 3. Fill table name
  await page.getByPlaceholder('e.g. Contacts, Leads, Customers...').fill('Test Contacts')

  // 4. Add fields
  const fieldInput = page.getByPlaceholder('Field name (e.g. Name, Email, Phone...)')
  const addFieldBtn = page.getByRole('button', { name: 'Add Field' })

  for (const name of ['Name', 'Email', 'Phone', 'Status']) {
    await fieldInput.fill(name)
    await addFieldBtn.click()
    await page.waitForTimeout(200)
  }

  await page.screenshot({ path: 'e2e/screenshots/data-tables-03-fields-defined.png', fullPage: true })

  // 5. Create the table
  await page.getByRole('button', { name: 'Create Table' }).click()
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'e2e/screenshots/data-tables-04-table-created.png', fullPage: true })

  // 6. Verify columns are visible in the table header
  await expect(page.locator('th:has-text("NAME")')).toBeVisible()
  await expect(page.locator('th:has-text("EMAIL")')).toBeVisible()

  // 7. Click Add Row
  await page.getByRole('button', { name: 'Add Row' }).click()
  await page.waitForTimeout(500)

  // 8. Fill row data
  await page.getByPlaceholder('Name').fill('John Doe')
  await page.getByPlaceholder('Email').fill('john@example.com')
  await page.getByPlaceholder('Phone').fill('555-1234')
  await page.getByPlaceholder('Status').fill('New')
  await page.screenshot({ path: 'e2e/screenshots/data-tables-05-add-row-form.png', fullPage: true })

  // 9. Submit the row (click green check button)
  await page.locator('button.text-forest-green').first().click()
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'e2e/screenshots/data-tables-06-row-added.png', fullPage: true })

  // 10. Verify the row data
  await expect(page.locator('td:has-text("John Doe")')).toBeVisible()
  await expect(page.locator('td:has-text("john@example.com")')).toBeVisible()
  await expect(page.locator('td:has-text("555-1234")')).toBeVisible()

  console.log('[e2e:data-tables] PASSED — Table created with fields, row added and verified')
})

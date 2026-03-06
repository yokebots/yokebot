import { test, expect } from '@playwright/test'
import { createTestUser, deleteTestUser, injectSession, type TestUser } from './test-utils'

const ENGINE_URL = 'https://yokebot-engine-production.up.railway.app'

let testUser: TestUser

test.beforeAll(async () => {
  testUser = await createTestUser()
  console.log(`[e2e:data-tables] Test user: ${testUser.email} (${testUser.id})`)

  // Create a team for the test user
  const createTeamRes = await fetch(`${ENGINE_URL}/api/teams`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${testUser.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: 'E2E Test Team' }),
  })
  const team = await createTeamRes.json()
  console.log(`[e2e:data-tables] Created team:`, JSON.stringify(team))
  const teamId = team.id

  if (teamId) {
    // Set onboardedAt to skip onboarding guard
    const profileRes = await fetch(`${ENGINE_URL}/api/teams/${teamId}/profile`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${testUser.accessToken}`,
        'Content-Type': 'application/json',
        'X-Team-Id': teamId,
      },
      body: JSON.stringify({ onboardedAt: new Date().toISOString() }),
    })
    console.log(`[e2e:data-tables] Set onboarded, status: ${profileRes.status}`)
  }
})

test.afterAll(async () => {
  if (testUser) {
    await deleteTestUser(testUser.id, testUser)
    console.log(`[e2e:data-tables] Deleted test user ${testUser.id}`)
  }
})

test('Data Tables — create table with fields, add row, verify', async ({ page }) => {
  // 1. Navigate & inject auth
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await injectSession(page, testUser)
  await page.goto('/data-tables', { waitUntil: 'networkidle' })
  await page.waitForTimeout(3000)

  // If redirected to onboarding, wait and try again
  if (page.url().includes('/onboarding')) {
    console.log(`[e2e:data-tables] Stuck on onboarding, URL: ${page.url()}`)
    await page.screenshot({ path: 'e2e/screenshots/dt-00-onboarding.png', fullPage: true })
    // Try clicking skip
    const skipBtn = page.getByText('Continue without audio')
    if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipBtn.click()
      await page.waitForTimeout(3000)
    }
    await page.goto('/data-tables', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)
  }

  console.log(`[e2e:data-tables] Current URL: ${page.url()}`)
  await page.screenshot({ path: 'e2e/screenshots/dt-01-initial.png', fullPage: true })

  // 2. Click "Create Your First Table" or the + tab
  const createFirstBtn = page.getByRole('button', { name: 'Create Your First Table' })
  if (await createFirstBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await createFirstBtn.click()
  } else {
    // Click the + tab in the table tabs bar
    const tabButtons = page.locator('.border-b.border-border-subtle button')
    const count = await tabButtons.count()
    if (count > 0) await tabButtons.nth(count - 1).click()
  }
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'e2e/screenshots/dt-02-create-panel.png', fullPage: true })

  // 3. Fill table name
  await page.getByPlaceholder('e.g. Contacts, Leads, Customers...').fill('Test Contacts')

  // 4. Add fields
  const fieldInput = page.getByPlaceholder('Field name (e.g. Name, Email, Phone...)')

  for (const fieldName of ['Name', 'Email', 'Phone', 'Status']) {
    await fieldInput.fill(fieldName)
    // Click the "Add Field" button inside the create panel (not the header one)
    await page.locator('.bg-forest-green\\/5 button:has-text("Add Field")').click()
    await page.waitForTimeout(200)
  }

  await page.screenshot({ path: 'e2e/screenshots/dt-03-fields-defined.png', fullPage: true })

  // 5. Create the table
  await page.getByRole('button', { name: 'Create Table' }).click()
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'e2e/screenshots/dt-04-table-created.png', fullPage: true })

  // 6. Verify columns are visible in the table header
  await expect(page.locator('th').filter({ hasText: 'NAME' })).toBeVisible({ timeout: 5000 })
  await expect(page.locator('th').filter({ hasText: 'EMAIL' })).toBeVisible()
  await expect(page.locator('th').filter({ hasText: 'PHONE' })).toBeVisible()
  await expect(page.locator('th').filter({ hasText: 'STATUS' })).toBeVisible()
  console.log('[e2e:data-tables] Table created with 4 columns')

  // 7. Click Add Row
  await page.getByRole('button', { name: 'Add Row' }).click()
  await page.waitForTimeout(500)

  // 8. Fill row data
  await page.getByPlaceholder('Name').fill('John Doe')
  await page.getByPlaceholder('Email').fill('john@example.com')
  await page.getByPlaceholder('Phone').fill('555-1234')
  await page.getByPlaceholder('Status').fill('New')
  await page.screenshot({ path: 'e2e/screenshots/dt-05-add-row-form.png', fullPage: true })

  // 9. Submit the row — press Enter on the last field (triggers handleAddRow via onKeyDown)
  await page.getByPlaceholder('Status').press('Enter')
  await page.waitForTimeout(3000)
  await page.screenshot({ path: 'e2e/screenshots/dt-06-row-added.png', fullPage: true })

  // 10. Verify the row data appears in the table
  await expect(page.locator('td').filter({ hasText: 'John Doe' })).toBeVisible({ timeout: 5000 })
  await expect(page.locator('td').filter({ hasText: 'john@example.com' })).toBeVisible()
  await expect(page.locator('td').filter({ hasText: '555-1234' })).toBeVisible()
  console.log('[e2e:data-tables] Row added and verified')

  // 11. Test Add Field on existing table
  await page.getByRole('button', { name: 'Add Field' }).click()
  await page.waitForTimeout(300)
  await page.getByPlaceholder('Field name...').fill('Company')
  await page.locator('button:has(span:text("check"))').first().click()
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'e2e/screenshots/dt-07-field-added.png', fullPage: true })
  await expect(page.locator('th').filter({ hasText: 'COMPANY' })).toBeVisible({ timeout: 5000 })
  console.log('[e2e:data-tables] Add Field to existing table works')

  // 12. Test inline cell editing — double-click a cell
  const nameCell = page.locator('td').filter({ hasText: 'John Doe' })
  await nameCell.dblclick()
  await page.waitForTimeout(300)
  const editInput = page.locator('td input[type="text"]').first()
  await editInput.fill('Jane Doe')
  await editInput.press('Enter')
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'e2e/screenshots/dt-08-cell-edited.png', fullPage: true })
  await expect(page.locator('td').filter({ hasText: 'Jane Doe' })).toBeVisible({ timeout: 5000 })
  console.log('[e2e:data-tables] Inline cell editing works')

  // 13. Test search
  await page.getByPlaceholder('Search records...').fill('Jane')
  await page.waitForTimeout(500)
  await expect(page.locator('td').filter({ hasText: 'Jane Doe' })).toBeVisible()
  await page.getByPlaceholder('Search records...').fill('nonexistent12345')
  await page.waitForTimeout(500)
  await expect(page.locator('text=No matching records')).toBeVisible()
  await page.getByPlaceholder('Search records...').clear()
  console.log('[e2e:data-tables] Search/filter works')

  await page.screenshot({ path: 'e2e/screenshots/dt-09-final.png', fullPage: true })
  console.log('[e2e:data-tables] ALL TESTS PASSED')
})

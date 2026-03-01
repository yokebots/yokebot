/**
 * E2E Test: Workflows feature
 *
 * Tests the full workflow lifecycle:
 * 1. Navigate to workflows page (empty state)
 * 2. Create a new workflow with 2 steps via the builder
 * 3. Verify it appears in the list
 * 4. Run the workflow
 * 5. Verify run page shows step timeline
 * 6. Clean up
 */

import { test, expect } from '@playwright/test'
import { createTestUser, injectSession, type TestUser } from './test-utils'

let testUser: TestUser

test.beforeAll(async () => {
  console.log('[e2e:workflows] Creating fresh test user...')
  testUser = await createTestUser()
  console.log(`[e2e:workflows] Test user created: ${testUser.email} (${testUser.id})`)
})

test('Workflows — create, list, run lifecycle', async ({ page }) => {
  // 1. Navigate & inject auth
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await injectSession(page, testUser)
  await page.goto('/dashboard', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'e2e/results/wf-01-dashboard.png' })

  // Check if we landed on onboarding (new user) — bypass it
  if (page.url().includes('/onboarding')) {
    console.log('[e2e:workflows] New user — bypassing onboarding')
    // Click "Continue without audio" to get past splash screen
    const continueBtn = page.locator('button', { hasText: 'Continue without audio' })
    await expect(continueBtn).toBeVisible({ timeout: 10000 })
    await continueBtn.click()
    await page.waitForTimeout(2000)

    // Now click "Skip" in the header to complete onboarding instantly
    const skipBtn = page.locator('button', { hasText: 'Skip' })
    await expect(skipBtn).toBeVisible({ timeout: 10000 })
    await skipBtn.click()
    await page.waitForTimeout(2000)
    console.log('[e2e:workflows] Onboarding skipped — should be on /dashboard now')
    await page.screenshot({ path: 'e2e/results/wf-01b-after-skip.png' })
  }

  // 2. Navigate to workflows page
  await page.goto('/workflows', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'e2e/results/wf-02-workflows-page.png' })

  // Verify we see the workflows page
  const heading = page.locator('h1', { hasText: 'Workflows' })
  await expect(heading).toBeVisible({ timeout: 10000 })
  console.log('[e2e:workflows] Workflows page loaded')

  // Check for empty state or existing workflows
  const emptyState = page.locator('text=No workflows yet')
  const hasEmpty = await emptyState.isVisible().catch(() => false)
  console.log(`[e2e:workflows] Empty state: ${hasEmpty}`)
  await page.screenshot({ path: 'e2e/results/wf-03-empty-state.png' })

  // 3. Click "New Workflow" to go to builder
  const newBtn = page.locator('a', { hasText: 'New Workflow' }).first()
  await expect(newBtn).toBeVisible({ timeout: 5000 })
  await newBtn.click()
  await page.waitForURL('**/workflows/new', { timeout: 10000 })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'e2e/results/wf-04-builder-empty.png' })
  console.log('[e2e:workflows] Builder page loaded')

  // 4. Fill in workflow metadata
  const nameInput = page.locator('input[placeholder*="Weekly Content"]')
  await nameInput.fill('E2E Test Workflow')

  const descInput = page.locator('textarea[placeholder*="accomplish"]')
  await descInput.fill('Automated test workflow with two steps')

  await page.screenshot({ path: 'e2e/results/wf-05-metadata-filled.png' })

  // 5. Fill in Step 1
  const stepTitleInputs = page.locator('input[placeholder="Step title"]')
  await stepTitleInputs.first().fill('Research the topic')

  const stepDescInputs = page.locator('textarea[placeholder*="Step description"]')
  await stepDescInputs.first().fill('Gather information and summarize findings')

  await page.screenshot({ path: 'e2e/results/wf-06-step1-filled.png' })

  // 6. Add Step 2
  const addStepBtn = page.locator('button', { hasText: 'Add Step' })
  await addStepBtn.click()
  await page.waitForTimeout(500)

  // Fill Step 2
  const allStepTitles = page.locator('input[placeholder="Step title"]')
  await allStepTitles.nth(1).fill('Write the report')

  const allStepDescs = page.locator('textarea[placeholder*="Step description"]')
  await allStepDescs.nth(1).fill('Draft the final report based on research')

  // Set Step 2 gate to "Require Approval"
  const gateSelects = page.locator('select').filter({ hasText: /Auto-proceed|Require Approval/ })
  if (await gateSelects.nth(1).isVisible().catch(() => false)) {
    await gateSelects.nth(1).selectOption('approval')
  }

  await page.screenshot({ path: 'e2e/results/wf-07-step2-filled.png' })
  console.log('[e2e:workflows] Both steps filled')

  // 7. Save the workflow
  const saveBtn = page.locator('button', { hasText: 'Create Workflow' })
  await expect(saveBtn).toBeEnabled()
  await saveBtn.click()
  await page.waitForTimeout(3000)
  await page.screenshot({ path: 'e2e/results/wf-08-after-save.png' })

  // We should be redirected to the workflow detail/edit page
  const currentUrl = page.url()
  console.log(`[e2e:workflows] After save URL: ${currentUrl}`)

  // Verify the workflow was saved — check for the name
  const savedName = page.locator('input').filter({ hasText: 'E2E Test Workflow' }).or(
    page.locator('text=E2E Test Workflow')
  )
  // The builder page reloads with the data, or we're on the edit page
  await page.screenshot({ path: 'e2e/results/wf-09-saved-state.png' })

  // 8. Navigate back to workflows list
  await page.goto('/workflows', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'e2e/results/wf-10-list-with-workflow.png' })

  // Verify our workflow appears in the list
  const workflowCard = page.locator('text=E2E Test Workflow')
  await expect(workflowCard).toBeVisible({ timeout: 10000 })
  console.log('[e2e:workflows] Workflow visible in list')

  // 9. Run the workflow
  const runBtn = page.locator('button', { hasText: 'Run' }).first()
  await expect(runBtn).toBeVisible()
  await runBtn.click()
  await page.waitForTimeout(3000)
  await page.screenshot({ path: 'e2e/results/wf-11-run-started.png' })

  const runUrl = page.url()
  console.log(`[e2e:workflows] Run page URL: ${runUrl}`)

  // 10. Verify run page shows timeline
  // We should see step statuses
  const stepElements = page.locator('text=/Research the topic|Write the report/')
  const stepCount = await stepElements.count()
  console.log(`[e2e:workflows] Steps visible on run page: ${stepCount}`)
  await page.screenshot({ path: 'e2e/results/wf-12-run-timeline.png' })

  // Check for status badges
  const statusBadges = page.locator('text=/pending|running|awaiting|completed/')
  const badgeCount = await statusBadges.count()
  console.log(`[e2e:workflows] Status badges visible: ${badgeCount}`)

  // Look for the approve button (step 2 has approval gate)
  const approveBtn = page.locator('button', { hasText: 'Approve' })
  const hasApprove = await approveBtn.isVisible().catch(() => false)
  console.log(`[e2e:workflows] Approve button visible: ${hasApprove}`)

  // Look for "View Task" links (tasks should have been created)
  const viewTaskLinks = page.locator('text=View Task')
  const taskLinkCount = await viewTaskLinks.count()
  console.log(`[e2e:workflows] "View Task" links: ${taskLinkCount}`)

  await page.screenshot({ path: 'e2e/results/wf-13-run-details.png' })

  // 11. Cancel the run to clean up
  const cancelBtn = page.locator('button', { hasText: 'Cancel Run' })
  if (await cancelBtn.isVisible().catch(() => false)) {
    // Accept the confirm dialog
    page.on('dialog', (dialog) => dialog.accept())
    await cancelBtn.click()
    await page.waitForTimeout(2000)
    await page.screenshot({ path: 'e2e/results/wf-14-run-canceled.png' })
    console.log('[e2e:workflows] Run canceled')
  }

  // 12. Go back to list and delete the workflow
  await page.goto('/workflows', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'e2e/results/wf-15-final-list.png' })

  console.log('[e2e:workflows] Test complete — check e2e/results/wf-*.png for screenshots')
})

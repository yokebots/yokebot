/**
 * E2E: Security hardening + integrations page verification
 *
 * Tests:
 * 1. Integrations page does NOT show Brave, Tavily, Firecrawl, NewsAPI (hosted mode)
 * 2. Homepage CTA says "1,250 credits" (not 500)
 */

import { test, expect } from '@playwright/test'
import { createTestUser, deleteTestUser, injectSession, type TestUser } from './test-utils'

let testUser: TestUser

test.beforeAll(async () => {
  testUser = await createTestUser()
})

test.afterAll(async () => {
  await deleteTestUser(testUser.id, testUser)
})

test.describe('Security Hardening', () => {
  test('Integrations page hides search services in hosted mode', async ({ page }) => {
    // Navigate first so localStorage is accessible
    await page.goto('https://yokebot.com')
    await injectSession(page, testUser)
    await page.goto('https://yokebot.com/settings/integrations')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    const content = await page.textContent('body')

    // These should be hidden in hosted mode
    expect(content).not.toContain('Brave Search')
    expect(content).not.toContain('Tavily')
    expect(content).not.toContain('Firecrawl')
    expect(content).not.toContain('NewsAPI')

    // These should still be visible
    expect(content).toContain('Slack')
    expect(content).toContain('Resend')
    expect(content).toContain('GitHub')

    await page.screenshot({ path: 'e2e/screenshots/integrations-hosted.png' })
  })

  test('Homepage CTA says 1,250 credits free to start', async ({ page }) => {
    await page.goto('https://yokebot.com')
    await page.waitForLoadState('networkidle')

    // Scroll to bottom CTA
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(500)

    const content = await page.textContent('body')
    expect(content).toContain('1,250 credits free to start')

    await page.screenshot({ path: 'e2e/screenshots/homepage-cta-credits.png', fullPage: true })
  })
})

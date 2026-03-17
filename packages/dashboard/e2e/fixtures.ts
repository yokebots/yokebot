/**
 * Custom Playwright fixtures for YokeBot E2E tests.
 *
 * Provides `authedPage`, `testUser`, and `engineApi` fixtures so every
 * test gets a pre-authenticated browser session with automatic cleanup.
 *
 * Usage:
 *   import { test, expect } from './fixtures'
 *
 *   test('loads workspace', async ({ authedPage }) => {
 *     await authedPage.goto('/workspace', { waitUntil: 'domcontentloaded' })
 *     await expect(authedPage.locator('[data-testid="workspace-layout"]')).toBeVisible()
 *   })
 */

import { test as base, expect, type Page } from '@playwright/test'
import { createTestUser, deleteTestUser, injectSession, type TestUser } from './test-utils'

const ENGINE_URL = 'https://yokebot-engine-production.up.railway.app'

/** Helper for making authenticated requests to the engine API. */
export interface EngineApi {
  get(path: string): Promise<Response>
  post(path: string, body?: unknown): Promise<Response>
  put(path: string, body?: unknown): Promise<Response>
  del(path: string): Promise<Response>
}

function buildEngineApi(user: TestUser): EngineApi {
  const headers = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${user.accessToken}`,
    'X-Team-Id': user.teamId,
  })

  return {
    get: (path: string) =>
      fetch(`${ENGINE_URL}${path}`, { method: 'GET', headers: headers() }),
    post: (path: string, body?: unknown) =>
      fetch(`${ENGINE_URL}${path}`, {
        method: 'POST',
        headers: headers(),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }),
    put: (path: string, body?: unknown) =>
      fetch(`${ENGINE_URL}${path}`, {
        method: 'PUT',
        headers: headers(),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }),
    del: (path: string) =>
      fetch(`${ENGINE_URL}${path}`, { method: 'DELETE', headers: headers() }),
  }
}

type Fixtures = {
  /** A fully authenticated Page — user created, session injected, ready to navigate. */
  authedPage: Page
  /** The raw TestUser object (user created, team provisioned). */
  testUser: TestUser
  /** Authenticated helper for calling the engine REST API. */
  engineApi: EngineApi
}

export const test = base.extend<Fixtures>({
  // ── testUser fixture ────────────────────────────────────────────────
  // Creates an ephemeral user + team before the test, deletes both after.
  testUser: async ({}, use) => {
    const user = await createTestUser()
    await use(user)
    await deleteTestUser(user.id, user)
  },

  // ── authedPage fixture ──────────────────────────────────────────────
  // Depends on `testUser` and the built-in `page`.
  // Navigates to '/' (so localStorage is on the right origin), injects the
  // Supabase session, then reloads so the app picks it up.
  authedPage: async ({ page, testUser }, use) => {
    // Navigate to the base URL to set the origin for localStorage
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await injectSession(page, testUser)
    // Reload so the app reads the freshly-injected session
    await page.reload({ waitUntil: 'domcontentloaded' })
    await use(page)
  },

  // ── engineApi fixture ───────────────────────────────────────────────
  engineApi: async ({ testUser }, use) => {
    await use(buildEngineApi(testUser))
  },
})

export { expect }

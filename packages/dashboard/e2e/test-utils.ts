/**
 * E2E Test Utilities — Supabase test user lifecycle
 *
 * Creates ephemeral test users via the Supabase Admin API and
 * mints HS256 session tokens using the JWT secret (no email login needed).
 * Requires SUPABASE_SERVICE_ROLE_KEY and SUPABASE_JWT_SECRET in packages/engine/.env
 */

import { createClient } from '@supabase/supabase-js'
import jwt from 'jsonwebtoken'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load dashboard env for Supabase URL + anon key
const dashEnvPath = path.resolve(__dirname, '../.env')
if (fs.existsSync(dashEnvPath)) {
  dotenv.config({ path: dashEnvPath, override: true })
}

// Load engine env for secrets (service role key, JWT secret) — override wins
const engineEnvPath = path.resolve(__dirname, '../../engine/.env')
if (fs.existsSync(engineEnvPath)) {
  dotenv.config({ path: engineEnvPath, override: true })
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET || ''

if (!SUPABASE_URL) throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_URL')
if (!SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in packages/engine/.env')
if (!JWT_SECRET) throw new Error('Missing SUPABASE_JWT_SECRET in packages/engine/.env')

// Admin client with service role key — full access
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

export interface TestUser {
  id: string
  email: string
  accessToken: string
  refreshToken: string
}

/**
 * Create a fresh test user and mint a valid session token.
 * Uses the Admin API to create the user and HS256 JWT secret to mint tokens
 * — no email login required.
 */
export async function createTestUser(): Promise<TestUser> {
  const timestamp = Date.now()
  const email = `e2e-test-${timestamp}@yokebot.test`

  // Create user via Admin API (confirmed, no email verification)
  const { data: userData, error: createError } = await adminClient.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: 'E2E Test User' },
  })

  if (createError || !userData.user) {
    throw new Error(`Failed to create test user: ${createError?.message}`)
  }

  const userId = userData.user.id

  // Mint an HS256 JWT that both the engine and Supabase will accept
  const now = Math.floor(Date.now() / 1000)
  const accessToken = jwt.sign(
    {
      sub: userId,
      email,
      aud: 'authenticated',
      role: 'authenticated',
      iss: `${SUPABASE_URL}/auth/v1`,
      iat: now,
      exp: now + 3600,
      user_metadata: { full_name: 'E2E Test User' },
    },
    JWT_SECRET,
    { algorithm: 'HS256' },
  )

  // Use a dummy refresh token (we won't actually refresh)
  const refreshToken = `e2e-refresh-${timestamp}`

  return { id: userId, email, accessToken, refreshToken }
}

/**
 * Delete a test user and all associated data.
 */
export async function deleteTestUser(userId: string): Promise<void> {
  const { error } = await adminClient.auth.admin.deleteUser(userId)
  if (error) {
    console.error(`Failed to delete test user ${userId}: ${error.message}`)
  }
}

/**
 * Inject a valid Supabase session into a Playwright page's localStorage.
 * Must be called after page.goto() to a page on the target domain.
 */
export async function injectSession(
  page: import('@playwright/test').Page,
  testUser: TestUser,
  supabaseUrl: string = SUPABASE_URL,
): Promise<void> {
  // Supabase stores sessions under: sb-{project-ref}-auth-token
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\./)?.[1] || ''
  const storageKey = `sb-${projectRef}-auth-token`

  const sessionData = {
    access_token: testUser.accessToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: testUser.refreshToken,
    user: {
      id: testUser.id,
      email: testUser.email,
      aud: 'authenticated',
      role: 'authenticated',
      email_confirmed_at: new Date().toISOString(),
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { full_name: 'E2E Test User' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  }

  await page.evaluate(
    ({ key, value }) => {
      localStorage.setItem(key, JSON.stringify(value))
    },
    { key: storageKey, value: sessionData },
  )
}

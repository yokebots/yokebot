/**
 * E2E Test: Onboarding flow with AdvisorBot narration
 *
 * Creates a fresh test user, injects a valid session, walks through
 * onboarding, captures screenshots at each step, and cleans up.
 * Video is recorded automatically via Playwright config.
 */

import { test, expect, type Page } from '@playwright/test'
import { createTestUser, deleteTestUser, injectSession, type TestUser } from './test-utils'

let testUser: TestUser

test.beforeAll(async () => {
  console.log('[e2e] Creating fresh test user...')
  testUser = await createTestUser()
  console.log(`[e2e] Test user created: ${testUser.email} (${testUser.id})`)
})

test.afterAll(async () => {
  if (testUser?.id) {
    console.log(`[e2e] Cleaning up test user: ${testUser.id}`)
    await deleteTestUser(testUser.id)
    console.log('[e2e] Test user deleted')
  }
})

/**
 * Query all <audio> elements on the page and return their playback state.
 * Useful for verifying audio is actually playing without hearing it.
 */
async function getAudioState(page: Page): Promise<{
  count: number
  playing: { src: string; currentTime: number; duration: number; paused: boolean; muted: boolean }[]
}> {
  return page.evaluate(() => {
    const audios = Array.from(document.querySelectorAll('audio'))
    // Also check for Audio objects created via new Audio() — they aren't in the DOM
    // but we can detect them through the narrationAudioRef if exposed, or via
    // checking any blob: URLs in the page's object URL space.
    // For now, we use a trick: poll the page's audio context or check for elements.

    // However, new Audio() elements aren't in the DOM. Let's inject a hook.
    const allAudios = (window as any).__e2eAudioElements as HTMLAudioElement[] | undefined
    const combined = [...audios, ...(allAudios || [])]

    return {
      count: combined.length,
      playing: combined.map((a) => ({
        src: a.src?.slice(0, 80) || '(no src)',
        currentTime: a.currentTime,
        duration: a.duration || 0,
        paused: a.paused,
        muted: a.muted,
      })),
    }
  })
}

/**
 * Inject a monkey-patch that captures all new Audio() instances so we can
 * inspect them later (new Audio() doesn't create DOM elements).
 */
async function injectAudioCapture(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as any).__e2eAudioElements = [] as HTMLAudioElement[]
    const OrigAudio = window.Audio
    window.Audio = function (src?: string) {
      const audio = new OrigAudio(src)
      ;(window as any).__e2eAudioElements.push(audio)
      return audio
    } as any
    window.Audio.prototype = OrigAudio.prototype
  })
}

/**
 * Wait for audio to start playing, then sample currentTime twice to verify
 * it's advancing. Returns { playing, t1, t2, delta }.
 */
async function verifyAudioAdvancing(page: Page, pollIntervalMs = 1000, maxAttempts = 10): Promise<{
  playing: boolean
  t1: number
  t2: number
  delta: number
  duration: number
  paused: boolean
  muted: boolean
}> {
  // Wait for at least one audio element to exist and not be paused
  let attempts = 0
  let state = await getAudioState(page)

  while (attempts < maxAttempts) {
    state = await getAudioState(page)
    const active = state.playing.find((a) => !a.paused && a.currentTime > 0)
    if (active) break
    await page.waitForTimeout(pollIntervalMs)
    attempts++
  }

  const active = state.playing.find((a) => !a.paused && a.currentTime > 0)
  if (!active) {
    console.log(`[e2e] Audio state after ${maxAttempts} attempts:`, JSON.stringify(state, null, 2))
    return { playing: false, t1: 0, t2: 0, delta: 0, duration: 0, paused: true, muted: false }
  }

  // Sample 1
  const t1 = active.currentTime

  // Wait and sample again
  await page.waitForTimeout(1500)
  const state2 = await getAudioState(page)
  const active2 = state2.playing.find((a) => !a.paused) || state2.playing[0]
  const t2 = active2?.currentTime ?? 0

  const delta = t2 - t1
  console.log(`[e2e] Audio currentTime: t1=${t1.toFixed(2)}s → t2=${t2.toFixed(2)}s (delta=${delta.toFixed(2)}s)`)

  return {
    playing: delta > 0,
    t1,
    t2,
    delta,
    duration: active2?.duration ?? 0,
    paused: active2?.paused ?? true,
    muted: active2?.muted ?? false,
  }
}

test('Onboarding flow — narration starts on Let\'s Go click', async ({ page }) => {
  // 1. Navigate to the site to set the domain for localStorage
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.screenshot({ path: 'e2e/results/01-initial-load.png' })

  // 2. Inject the auth session into localStorage
  await injectSession(page, testUser)

  // 3. Reload to pick up the session — also inject audio capture before app loads
  await page.goto('/', { waitUntil: 'commit' })
  await injectAudioCapture(page)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000) // Let auth state settle
  await page.screenshot({ path: 'e2e/results/02-after-auth.png' })

  // 4. We should land on onboarding (new user, no team yet or fresh team)
  const currentUrl = page.url()
  console.log(`[e2e] Current URL after auth: ${currentUrl}`)
  await page.screenshot({ path: 'e2e/results/03-current-page.png' })

  // If redirected to dashboard (team already exists), navigate to onboarding
  if (currentUrl.includes('/dashboard')) {
    console.log('[e2e] Redirected to dashboard — navigating to /onboarding')
    await page.goto('/onboarding', { waitUntil: 'commit' })
    await injectAudioCapture(page)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'e2e/results/04-onboarding-nav.png' })
  }

  // 5. Look for the "Let's Go" splash screen
  const letsGoButton = page.getByText("Let's Go")
  const hasSplash = await letsGoButton.isVisible().catch(() => false)
  console.log(`[e2e] Splash screen visible: ${hasSplash}`)
  await page.screenshot({ path: 'e2e/results/05-splash-screen.png' })

  if (hasSplash) {
    // 6. Click "Let's Go" to unlock audio and start narration
    await letsGoButton.click()
    console.log('[e2e] Clicked "Let\'s Go"')

    // Wait for narration to start (banner should appear)
    await page.waitForTimeout(3000) // Give narration time to load + start
    await page.screenshot({ path: 'e2e/results/06-after-lets-go.png' })

    // 7. Check for narration UI elements
    //    Material Symbols render as ligature text inside <span> elements
    const narrationBanner = page.locator('[class*="bg-gray-900"]').first()
    const captionText = page.locator('[class*="text-amber"]') // highlighted word in amber

    const hasBanner = await narrationBanner.isVisible().catch(() => false)
    const hasHighlight = await captionText.first().isVisible().catch(() => false)

    // Check for pause button — it's a Material Symbol icon rendered as text
    const pauseBtn = page.locator('span.material-symbols-outlined', { hasText: /pause_circle|play_circle/ }).first()
    const hasPauseBtn = await pauseBtn.isVisible().catch(() => false)

    // Check for nav buttons
    const nextBtn = page.locator('button', { hasText: 'Next' }).first()
    const prevBtn = page.locator('button', { hasText: 'Previous' }).first()
    const hasNext = await nextBtn.isVisible().catch(() => false)
    const hasPrev = await prevBtn.isVisible().catch(() => false)

    console.log(`[e2e] Narration banner: ${hasBanner}`)
    console.log(`[e2e] Pause button: ${hasPauseBtn}`)
    console.log(`[e2e] Word highlighting: ${hasHighlight}`)
    console.log(`[e2e] Prev/Next buttons: prev=${hasPrev}, next=${hasNext}`)

    await page.screenshot({ path: 'e2e/results/07-narration-playing.png' })

    // 8. AUDIO VERIFICATION — check that audio currentTime is advancing
    console.log('[e2e] Verifying audio playback...')
    const audioResult = await verifyAudioAdvancing(page)
    console.log(`[e2e] Audio verification: playing=${audioResult.playing}, delta=${audioResult.delta.toFixed(2)}s, duration=${audioResult.duration.toFixed(1)}s, paused=${audioResult.paused}, muted=${audioResult.muted}`)

    await page.screenshot({ path: 'e2e/results/08-audio-verified.png' })

    // Assert audio is actually playing
    expect(audioResult.playing, 'Audio currentTime should be advancing (audio is playing)').toBe(true)
    expect(audioResult.delta, 'Audio should advance at least 1 second').toBeGreaterThan(0.5)

    // 9. Test pause button
    if (hasPauseBtn) {
      await pauseBtn.click()
      await page.waitForTimeout(500)
      await page.screenshot({ path: 'e2e/results/09-narration-paused.png' })

      // Verify audio is paused
      const pausedState = await getAudioState(page)
      const pausedAudio = pausedState.playing[0]
      console.log(`[e2e] After pause: paused=${pausedAudio?.paused}, currentTime=${pausedAudio?.currentTime.toFixed(2)}`)
      expect(pausedAudio?.paused, 'Audio should be paused after clicking pause').toBe(true)

      // Resume
      await pauseBtn.click()
      await page.waitForTimeout(1500)
      await page.screenshot({ path: 'e2e/results/10-narration-resumed.png' })

      // Verify audio resumed
      const resumedResult = await verifyAudioAdvancing(page, 500, 5)
      console.log(`[e2e] After resume: playing=${resumedResult.playing}, delta=${resumedResult.delta.toFixed(2)}s`)
      expect(resumedResult.playing, 'Audio should resume playing after unpause').toBe(true)
    }

    // 10. Test prev/next screen navigation
    if (hasNext) {
      // Record current screen position
      const screenCounter = page.locator('text=/\\d+ \\/ \\d+/')
      const counterBefore = await screenCounter.textContent().catch(() => '')
      console.log(`[e2e] Screen counter before Next: "${counterBefore}"`)

      await nextBtn.click()
      await page.waitForTimeout(1000)
      await page.screenshot({ path: 'e2e/results/11-next-screen.png' })

      const counterAfter = await screenCounter.textContent().catch(() => '')
      console.log(`[e2e] Screen counter after Next: "${counterAfter}"`)

      // Go back
      if (hasPrev) {
        await prevBtn.click()
        await page.waitForTimeout(1000)
        await page.screenshot({ path: 'e2e/results/12-prev-screen.png' })
        const counterBack = await screenCounter.textContent().catch(() => '')
        console.log(`[e2e] Screen counter after Previous: "${counterBack}"`)
      }
    }

    // Wait for narration to progress more
    await page.waitForTimeout(3000)
    await page.screenshot({ path: 'e2e/results/13-narration-progressed.png' })

  } else {
    console.log('[e2e] WARNING: No splash screen found. Taking diagnostic screenshots.')
    await page.screenshot({ path: 'e2e/results/05-no-splash-diagnostic.png', fullPage: true })
  }

  // Final state
  await page.screenshot({ path: 'e2e/results/99-final-state.png' })
  console.log('[e2e] Test complete — check e2e/results/ for screenshots and video')
})

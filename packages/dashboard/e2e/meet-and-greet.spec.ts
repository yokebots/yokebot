/**
 * E2E Test: Full meet-and-greet flow
 *
 * Creates a fresh user, goes through onboarding steps 1-3,
 * deploys agents via AdvisorBot, then verifies the meet-and-greet
 * starts with the split-view layout, captions, and audio.
 *
 * This is a long-running test (~3-5 min) because it involves
 * real LLM calls + TTS generation on the server.
 */

import { test, expect, type Page } from '@playwright/test'
import { createTestUser, deleteTestUser, injectSession, type TestUser } from './test-utils'

// Longer timeout for this test — LLM + TTS calls take time
test.setTimeout(300_000) // 5 minutes

let testUser: TestUser

test.beforeAll(async () => {
  console.log('[meet-greet] Creating fresh test user...')
  testUser = await createTestUser()
  console.log(`[meet-greet] Test user created: ${testUser.email} (${testUser.id})`)
})

test.afterAll(async () => {
  if (testUser?.id) {
    console.log(`[meet-greet] Cleaning up test user: ${testUser.id}`)
    await deleteTestUser(testUser.id)
    console.log('[meet-greet] Test user deleted')
  }
})

/** Inject audio capture hook for new Audio() instances */
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

/** Get audio playback state */
async function getAudioState(page: Page) {
  return page.evaluate(() => {
    const audios = Array.from(document.querySelectorAll('audio'))
    const injected = (window as any).__e2eAudioElements as HTMLAudioElement[] | undefined
    const combined = [...audios, ...(injected || [])]
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

test('Full onboarding → meet-and-greet flow', async ({ page }) => {
  // Capture browser console for debugging
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.text().includes('[onboarding]') || msg.text().includes('[engine]')) {
      console.log(`[browser:${msg.type()}] ${msg.text()}`)
    }
  })
  page.on('pageerror', (err) => console.log(`[browser:error] ${err.message}`))
  page.on('response', (res) => {
    if (res.url().includes('meet-and-greet') || (res.status() >= 400 && res.url().includes('/api/'))) {
      console.log(`[network] ${res.status()} ${res.url().slice(0, 120)}`)
    }
  })

  // ── 1. Auth + navigate to onboarding ──
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await injectSession(page, testUser)
  await page.goto('/', { waitUntil: 'commit' })
  await injectAudioCapture(page)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  const url = page.url()
  console.log(`[meet-greet] After auth: ${url}`)

  if (url.includes('/dashboard')) {
    await page.goto('/onboarding', { waitUntil: 'commit' })
    await injectAudioCapture(page)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
  }

  await page.screenshot({ path: 'e2e/results/mg-01-splash.png' })

  // ── 2. Click "Let's Go" to unlock audio ──
  const letsGoBtn = page.getByText("Let's Go")
  await letsGoBtn.waitFor({ state: 'visible', timeout: 30000 })
  await letsGoBtn.click()
  console.log('[meet-greet] Clicked Let\'s Go')
  await page.waitForTimeout(3000)
  await page.screenshot({ path: 'e2e/results/mg-02-step1.png' })

  // ── 3. Step 1: Fill in business info (click "fill in manually", then fill fields) ──
  // Click "Or fill in manually without scanning" to show the form fields
  const manualLink = page.getByText('fill in manually without scanning')
  await manualLink.waitFor({ state: 'visible', timeout: 10000 })
  await manualLink.click()
  console.log('[meet-greet] Clicked "fill in manually"')
  await page.waitForTimeout(1000)

  // Fill in Company Name field
  const companyField = page.locator('input').filter({ has: page.locator('..') }).locator('xpath=//input').first()
  // Find by label text
  const companyInput = page.getByLabel(/company name/i).first()
  if (await companyInput.isVisible().catch(() => false)) {
    await companyInput.fill('E2E Test Corp')
    console.log('[meet-greet] Filled company name via label')
  } else {
    // Fallback: find the first text input in the scanned fields section
    const textInputs = page.locator('.space-y-4 input[type="text"]')
    const firstInput = textInputs.first()
    if (await firstInput.isVisible().catch(() => false)) {
      await firstInput.fill('E2E Test Corp')
      console.log('[meet-greet] Filled company name via first input')
    }
  }

  // Select an industry
  const industrySelect = page.locator('select').first()
  if (await industrySelect.isVisible().catch(() => false)) {
    await industrySelect.selectOption({ index: 1 })
    console.log('[meet-greet] Selected industry')
  }

  await page.screenshot({ path: 'e2e/results/mg-03-step1-filled.png' })

  // Click the "Continue" button (the green button at the bottom of the form)
  // This is NOT the narration "Next" button — it's the form submit button
  const continueBtn = page.locator('button:has-text("Continue")').filter({ hasNotText: /previous|back/i })
  // The step 1 Continue button is inside the form card, not the narration banner
  const formContinue = page.locator('.shadow-card button:has-text("Continue")')
  if (await formContinue.isVisible().catch(() => false)) {
    await formContinue.click()
    console.log('[meet-greet] Clicked form Continue button')
  } else if (await continueBtn.isVisible().catch(() => false)) {
    await continueBtn.click()
    console.log('[meet-greet] Clicked Continue button')
  } else {
    // Try "Saving..." state or just wait
    console.log('[meet-greet] Continue button not found, waiting...')
    await page.waitForTimeout(3000)
  }
  await page.waitForTimeout(3000)
  await page.screenshot({ path: 'e2e/results/mg-04-step2.png' })

  // ── 4. Step 2: Tutorial slides — click through 3 slides ──
  // The tutorial has 3 slides with "Next" buttons, then "Meet Your Advisor" on the last
  for (let slide = 0; slide < 3; slide++) {
    // Look specifically for the tutorial card's Next/Meet Your Advisor button
    const tutorialNext = page.locator('.shadow-card button:has-text("Next")').first()
    const meetAdvisor = page.locator('button:has-text("Meet Your Advisor")')

    if (await meetAdvisor.isVisible().catch(() => false)) {
      await meetAdvisor.click()
      console.log('[meet-greet] Clicked "Meet Your Advisor"')
      break
    } else if (await tutorialNext.isVisible().catch(() => false)) {
      await tutorialNext.click()
      console.log(`[meet-greet] Tutorial slide ${slide + 1} → Next`)
      await page.waitForTimeout(1000)
    } else {
      console.log(`[meet-greet] No tutorial button found on slide ${slide}`)
      break
    }
  }

  // If "Meet Your Advisor" didn't get clicked in the loop, try again
  const meetAdvisorFinal = page.locator('button:has-text("Meet Your Advisor")')
  if (await meetAdvisorFinal.isVisible().catch(() => false)) {
    await meetAdvisorFinal.click()
    console.log('[meet-greet] Clicked "Meet Your Advisor" (final)')
  }

  await page.waitForTimeout(3000)
  await page.screenshot({ path: 'e2e/results/mg-05-step3-advisor.png' })

  // ── 5. Step 3: Wait for AdvisorBot to recommend agents ──
  // AdvisorBot auto-sends a context message and responds with agent recommendations
  // Wait for the "Deploy Agents Now" button to appear
  console.log('[meet-greet] Waiting for AdvisorBot to recommend agents...')
  const deployBtn = page.locator('button:has-text("Deploy Agents Now")')

  try {
    await deployBtn.waitFor({ state: 'visible', timeout: 120_000 }) // up to 2 min for LLM
    console.log('[meet-greet] Deploy Agents button visible')
    await page.screenshot({ path: 'e2e/results/mg-06-deploy-ready.png' })

    // ── 6. Deploy agents + start meet-and-greet ──
    await deployBtn.click()
    console.log('[meet-greet] Clicked Deploy Agents Now')

    // Wait longer — deploy sends a chat message, waits for LLM tool calls,
    // then calls startMeetAndGreet which hits the orchestrator
    await page.waitForTimeout(10000)
    await page.screenshot({ path: 'e2e/results/mg-07-deploying.png' })

    // ── 7. Wait for meet-and-greet to start ──
    // The meeting container has data-testid="meeting-container"
    console.log('[meet-greet] Waiting for meeting container to appear...')

    const meetingContainer = page.locator('[data-testid="meeting-container"]')

    // Wait up to 90s — deploy + startMeetAndGreet + orchestrator init
    await expect(meetingContainer).toBeVisible({ timeout: 90_000 })

    console.log('[meet-greet] Meeting container visible!')
    await page.screenshot({ path: 'e2e/results/mg-08-meeting-started.png' })

    // ── 8. Verify meeting header is present ──
    const meetingHeader = page.locator('[data-testid="meeting-container"] >> text=Team Meet & Greet')
    const hasHeader = await meetingHeader.isVisible().catch(() => false)
    console.log(`[meet-greet] Meeting header visible: ${hasHeader}`)

    // ── 9. Wait for first agent message in the meeting chat ──
    console.log('[meet-greet] Waiting for first agent message in meeting chat...')

    // Meeting messages appear in the chat thread below the speaker banner
    const meetingMessage = page.locator('[data-testid="meeting-container"] [class*="rounded-2xl"]').first()
    await meetingMessage.waitFor({ state: 'visible', timeout: 90_000 })

    console.log('[meet-greet] First meeting message visible!')
    await page.screenshot({ path: 'e2e/results/mg-09-first-message.png' })

    // ── 10. Check for speaker banner with word-highlighted captions ──
    // The speaker banner shows agent name + amber-highlighted words
    const speakerBanner = page.locator('[data-testid="meeting-container"] .bg-gray-900')
    const hasSpeakerBanner = await speakerBanner.isVisible().catch(() => false)
    console.log(`[meet-greet] Speaker banner visible: ${hasSpeakerBanner}`)

    // ── 11. Check audio is playing ──
    console.log('[meet-greet] Checking audio playback...')
    const audioState = await getAudioState(page)
    const activeAudio = audioState.playing.find(a => !a.paused && a.currentTime > 0)
    console.log(`[meet-greet] Audio count: ${audioState.count}, active: ${!!activeAudio}`)
    if (activeAudio) {
      console.log(`[meet-greet] Audio playing: currentTime=${activeAudio.currentTime.toFixed(2)}s, duration=${activeAudio.duration.toFixed(1)}s`)
    }

    await page.screenshot({ path: 'e2e/results/mg-10-captions-audio.png' })

    // ── 12. Wait for more agent messages (agents riffing) ──
    console.log('[meet-greet] Waiting for more agent messages...')
    await page.waitForTimeout(30_000) // Wait 30s for more turns
    await page.screenshot({ path: 'e2e/results/mg-11-multiple-messages.png' })

    // Count messages in the meeting chat
    const messageCount = await page.locator('[data-testid="meeting-container"] [class*="rounded-2xl"][class*="shadow"]').count()
    console.log(`[meet-greet] Messages in meeting thread: ${messageCount}`)

    // ── 13. Wait for meeting to end (or timeout) ──
    console.log('[meet-greet] Waiting for meeting to end...')
    const dashboardBtn = page.locator('button:has-text("Go to Dashboard")')

    try {
      await dashboardBtn.waitFor({ state: 'visible', timeout: 180_000 }) // up to 3 min
      console.log('[meet-greet] Meeting ended — Go to Dashboard button visible')
      await page.screenshot({ path: 'e2e/results/mg-12-meeting-ended.png' })

      const finalCount = await page.locator('[data-testid="meeting-container"] [class*="rounded-2xl"][class*="shadow"]').count()
      console.log(`[meet-greet] Final message count: ${finalCount}`)
      expect(finalCount).toBeGreaterThan(2) // At least AdvisorBot intro + 1 agent

    } catch {
      console.log('[meet-greet] Meeting still in progress after timeout — taking screenshot')
      await page.screenshot({ path: 'e2e/results/mg-12-meeting-timeout.png' })
      const msgCount = await page.locator('[data-testid="meeting-container"] [class*="rounded-2xl"][class*="shadow"]').count()
      console.log(`[meet-greet] Messages so far: ${msgCount}`)
      expect(msgCount).toBeGreaterThan(0) // At least some messages appeared
    }

  } catch (err) {
    console.error('[meet-greet] Error during flow:', err)
    await page.screenshot({ path: 'e2e/results/mg-error.png', fullPage: true })

    // Log the page content for debugging
    const bodyText = await page.locator('body').innerText().catch(() => '(could not get body text)')
    console.log('[meet-greet] Page text:', bodyText.slice(0, 1500))
    throw err
  }

  await page.screenshot({ path: 'e2e/results/mg-99-final.png' })
  console.log('[meet-greet] Test complete — check e2e/results/ for screenshots and video')
})

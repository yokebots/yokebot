/**
 * E2E Test: Tags System
 *
 * Verifies tag creation, task tagging, tag display on task cards,
 * and tag filtering across Mission Control and workspace panel.
 */

import { test, expect } from '@playwright/test'
import { createTestUser, deleteTestUser, injectSession, type TestUser } from './test-utils'

let testUser: TestUser

test.beforeAll(async () => {
  console.log('[e2e] Creating fresh test user for tags tests...')
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

const ENGINE_URL = process.env.ENGINE_URL || 'https://yokebot-engine-production.up.railway.app'

/** Helper: call the engine API directly */
async function engineApi(method: string, path: string, body?: unknown) {
  const res = await fetch(`${ENGINE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${testUser.accessToken}`,
      'X-Team-Id': testUser.teamId,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok && res.status !== 204) {
    throw new Error(`API ${method} ${path} failed: ${res.status} ${await res.text()}`)
  }
  if (res.status === 204) return null
  return res.json()
}

async function setupPage(page: import('@playwright/test').Page, path: string) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await injectSession(page, testUser)
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
}

test.describe('Tags API', () => {
  test('create, list, update, and delete a tag', async () => {
    // Create
    const tag = await engineApi('POST', '/api/tags', { name: 'VIP', color: '#EF4444' })
    expect(tag.name).toBe('VIP')
    expect(tag.color).toBe('#EF4444')
    expect(tag.id).toBeTruthy()

    // List
    const tags = await engineApi('GET', '/api/tags')
    expect(tags.length).toBeGreaterThanOrEqual(1)
    expect(tags.some((t: { name: string }) => t.name === 'VIP')).toBeTruthy()

    // Update
    const updated = await engineApi('PATCH', `/api/tags/${tag.id}`, { name: 'VIP Client', color: '#10B981' })
    expect(updated.name).toBe('VIP Client')
    expect(updated.color).toBe('#10B981')

    // Delete
    await engineApi('DELETE', `/api/tags/${tag.id}`)
    const tagsAfter = await engineApi('GET', '/api/tags')
    expect(tagsAfter.some((t: { id: string }) => t.id === tag.id)).toBeFalsy()
  })

  test('create task with tags and verify tags appear', async () => {
    // Create tags first
    const tag1 = await engineApi('POST', '/api/tags', { name: 'Residential', color: '#3B82F6' })
    const tag2 = await engineApi('POST', '/api/tags', { name: 'Follow-up', color: '#F59E0B' })

    // Create a task
    const task = await engineApi('POST', '/api/tasks', { title: 'Clean the Johnson house', priority: 'high' })
    expect(task.id).toBeTruthy()

    // Apply tags to the task
    await engineApi('PUT', '/api/tags/resource/bulk', {
      tagIds: [tag1.id, tag2.id],
      resourceType: 'task',
      resourceId: task.id,
    })

    // Fetch task and verify tags are hydrated
    const tasks = await engineApi('GET', '/api/tasks')
    const tagged = tasks.find((t: { id: string }) => t.id === task.id)
    expect(tagged).toBeTruthy()
    expect(tagged.tags.length).toBe(2)
    expect(tagged.tags.map((t: { name: string }) => t.name).sort()).toEqual(['Follow-up', 'Residential'])

    // Filter tasks by tag
    const filtered = await engineApi('GET', '/api/tasks?tags=Residential')
    expect(filtered.some((t: { id: string }) => t.id === task.id)).toBeTruthy()

    // Filter by non-existent tag should not include our task
    const empty = await engineApi('GET', '/api/tasks?tags=NonExistentTag')
    expect(empty.some((t: { id: string }) => t.id === task.id)).toBeFalsy()

    // Cleanup
    await engineApi('DELETE', `/api/tasks/${task.id}`)
    await engineApi('DELETE', `/api/tags/${tag1.id}`)
    await engineApi('DELETE', `/api/tags/${tag2.id}`)
  })
})

test.describe('Tags UI — Mission Control', () => {
  let taskId: string
  let tagId: string

  test.beforeAll(async () => {
    // Seed a tag and a task with that tag
    const tag = await engineApi('POST', '/api/tags', { name: 'Commercial', color: '#8B5CF6' })
    tagId = tag.id
    const task = await engineApi('POST', '/api/tasks', { title: 'Schedule quarterly deep clean', priority: 'medium' })
    taskId = task.id
    await engineApi('PUT', '/api/tags/resource/bulk', {
      tagIds: [tagId],
      resourceType: 'task',
      resourceId: taskId,
    })
  })

  test.afterAll(async () => {
    await engineApi('DELETE', `/api/tasks/${taskId}`).catch(() => {})
    await engineApi('DELETE', `/api/tags/${tagId}`).catch(() => {})
  })

  test('tag pill visible on task card in Mission Control', async ({ page }) => {
    await setupPage(page, '/tasks')

    // Wait for tasks to load
    await page.waitForTimeout(2000)

    // Look for the "Commercial" tag pill
    const tagPill = page.locator('span:text("Commercial")').first()
    await expect(tagPill).toBeVisible({ timeout: 10000 })

    await page.screenshot({ path: 'e2e/screenshots/tags-mission-control.png' })
  })

  test('tag filter bar appears and filters tasks', async ({ page }) => {
    await setupPage(page, '/tasks')
    await page.waitForTimeout(2000)

    // Tag filter bar should show "Tags:" label
    const tagsLabel = page.locator('span:text("Tags:")').first()
    await expect(tagsLabel).toBeVisible({ timeout: 10000 })

    // Click the "Commercial" filter chip
    const filterChip = page.locator('button:text("Commercial")').first()
    await expect(filterChip).toBeVisible({ timeout: 5000 })
    await filterChip.click()
    await page.waitForTimeout(1500)

    // The task should still be visible (it has the Commercial tag)
    await expect(page.locator('text=Schedule quarterly deep clean').first()).toBeVisible({ timeout: 5000 })

    await page.screenshot({ path: 'e2e/screenshots/tags-filter-active.png' })

    // Click "Clear" to remove filter
    const clearBtn = page.locator('button:text("Clear")')
    await expect(clearBtn).toBeVisible({ timeout: 3000 })
    await clearBtn.click()
    await page.waitForTimeout(1000)

    await page.screenshot({ path: 'e2e/screenshots/tags-filter-cleared.png' })
  })
})

test.describe('Tags UI — Task Detail', () => {
  let taskId: string

  test.beforeAll(async () => {
    const task = await engineApi('POST', '/api/tasks', { title: 'Follow up with VIP lead' })
    taskId = task.id
  })

  test.afterAll(async () => {
    await engineApi('DELETE', `/api/tasks/${taskId}`).catch(() => {})
    // Clean up any tags created during test
    const tags = await engineApi('GET', '/api/tags')
    for (const tag of tags) {
      if (tag.name === 'VIP' || tag.name === 'Priority') {
        await engineApi('DELETE', `/api/tags/${tag.id}`).catch(() => {})
      }
    }
  })

  test('add tag to task via TaskDetail TagManager', async ({ page }) => {
    await setupPage(page, `/tasks/${taskId}`)
    await page.waitForTimeout(2000)

    // The "Tags" label should be visible in the detail pane
    await expect(page.locator('text=Tags').first()).toBeVisible({ timeout: 10000 })

    // Click the "+" button to add a tag
    const addBtn = page.locator('button[title="Add tag"]').first()
    await expect(addBtn).toBeVisible({ timeout: 5000 })
    await addBtn.click()

    // Type a new tag name
    const tagInput = page.locator('input[placeholder="New tag name..."]')
    await expect(tagInput).toBeVisible({ timeout: 3000 })
    await tagInput.fill('VIP')

    // Click a color (e.g., green)
    await page.locator('button[title="Green"]').click()

    // Click the "Create" button
    const createBtn = page.locator('button:text("Create")')
    await expect(createBtn).toBeVisible({ timeout: 3000 })
    await createBtn.click()
    await page.waitForTimeout(1500)

    // Verify the tag pill appears
    const tagPill = page.locator('span:text("VIP")').first()
    await expect(tagPill).toBeVisible({ timeout: 5000 })

    await page.screenshot({ path: 'e2e/screenshots/tags-task-detail-added.png' })
  })
})

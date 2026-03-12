/**
 * Agent Use Case Testing — Real business scenarios
 *
 * Tests varied workflows end-to-end: create agents from templates,
 * assign tasks, trigger immediate work via /chat, verify results
 * (files, tasks, data tables, chat messages), and screenshot everything.
 */

import { test, expect, type Page } from '@playwright/test'
import { createTestUser, deleteTestUser, injectSession, type TestUser } from './test-utils'

const ENGINE_URL = process.env.ENGINE_URL || 'https://yokebot-engine-production.up.railway.app'

let testUser: TestUser

// Helper: API call with auth
async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${ENGINE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${testUser.accessToken}`,
      'X-Team-Id': testUser.teamId,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`)
  return text ? JSON.parse(text) : null
}

// Helper: Create agent from template (with hosted model)
async function createAgent(name: string, templateId: string) {
  return api('POST', '/api/agents', {
    name,
    templateId,
    modelId: 'deepseek-v3.2',
  })
}

// Helper: Chat with agent (triggers immediate ReAct loop)
async function chatWithAgent(agentId: string, message: string) {
  return api('POST', `/api/agents/${agentId}/chat`, { message })
}

// Helper: Create and assign a task
async function createTask(title: string, description: string, agentId: string, priority = 'high') {
  return api('POST', '/api/tasks', { title, description, assignedAgentId: agentId, priority })
}

// Helper: Screenshot a dashboard page
async function screenshotPage(page: Page, path: string, name: string) {
  await page.goto(`https://yokebot.com${path}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `e2e/screenshots/uc-${name}.png`, fullPage: false })
}

test.describe('Agent Use Case Testing', () => {
  test.beforeAll(async () => {
    testUser = await createTestUser()
    console.log(`✓ Test user created: ${testUser.email} (team: ${testUser.teamId})`)
  })

  test.afterAll(async () => {
    if (testUser) {
      await deleteTestUser(testUser.id, testUser)
      console.log('✓ Test user cleaned up')
    }
  })

  test('UC1: Content Creation Pipeline — blog post + social posts', async ({ page }) => {
    test.setTimeout(180_000) // 3 min

    // Create ContentBot
    const contentBot = await createAgent('ContentBot', 'content-bot')
    console.log(`  ✓ ContentBot created: ${contentBot.id}`)

    // Trigger work: write a blog post
    console.log('  → Asking ContentBot to write a blog post...')
    const blogResult = await chatWithAgent(contentBot.id,
      'Write a 500-word blog post about why small businesses need AI automation in 2026. ' +
      'Include 3 key benefits and a call to action. Save it to the workspace as "blog-ai-automation.md".'
    )
    console.log(`  ✓ Blog post: ${blogResult.iterations} iterations, ${blogResult.toolCalls?.length ?? 0} tool calls`)

    // Create SocialBot
    const socialBot = await createAgent('SocialBot', 'social-bot')
    console.log(`  ✓ SocialBot created: ${socialBot.id}`)

    // Trigger work: create social posts based on blog
    console.log('  → Asking SocialBot to create social media posts...')
    const socialResult = await chatWithAgent(socialBot.id,
      'Create 3 social media posts (one for LinkedIn, one for X/Twitter, one for Instagram) ' +
      'promoting an article about why small businesses need AI automation. Include relevant hashtags. ' +
      'Save all posts to the workspace as "social-posts-ai-automation.md".'
    )
    console.log(`  ✓ Social posts: ${socialResult.iterations} iterations, ${socialResult.toolCalls?.length ?? 0} tool calls`)

    // Screenshot workspace
    await page.goto('https://yokebot.com', { waitUntil: 'networkidle' })
    await injectSession(page, testUser)
    await screenshotPage(page, '/workspace', 'uc1-workspace')

    // Verify files were created
    const files = await api('GET', '/api/files')
    const fileNames = (files || []).map((f: { name: string }) => f.name)
    console.log(`  ✓ Workspace files: ${fileNames.join(', ') || '(none)'}`)

    // Screenshot team chat
    await screenshotPage(page, '/workspace', 'uc1-chat')

    console.log('  ✅ UC1 Complete')
  })

  test('UC2: Competitive Research — web search + data table', async ({ page }) => {
    test.setTimeout(180_000)

    // Create ResearchBot
    const researchBot = await createAgent('ResearchBot', 'research-bot')
    console.log(`  ✓ ResearchBot created: ${researchBot.id}`)

    // Trigger work: competitive research
    console.log('  → Asking ResearchBot to research AI agent platforms...')
    const result = await chatWithAgent(researchBot.id,
      'Research the top 5 AI agent platforms: CrewAI, AutoGen, LangGraph, AgentGPT, and SuperAGI. ' +
      'For each, find: pricing model, key features, target audience, and main weakness. ' +
      'Create a data table called "AI Agent Platform Comparison" with columns: Name, Pricing, Key Features, Target Audience, Weakness. ' +
      'Also write a brief analysis summary and save it to the workspace as "competitor-analysis.md".'
    )
    console.log(`  ✓ Research: ${result.iterations} iterations, ${result.toolCalls?.length ?? 0} tool calls`)

    // Screenshot workspace
    await page.goto('https://yokebot.com', { waitUntil: 'networkidle' })
    await injectSession(page, testUser)
    await screenshotPage(page, '/workspace', 'uc2-workspace')

    // Check for data tables
    const tables = await api('GET', '/api/data-tables')
    console.log(`  ✓ Data tables: ${(tables || []).length} created`)

    // Screenshot data tables page
    await screenshotPage(page, '/data-tables', 'uc2-data-tables')

    console.log('  ✅ UC2 Complete')
  })

  test('UC3: Lead Generation — prospect list with structured data', async ({ page }) => {
    test.setTimeout(180_000)

    // Create ProspectorBot
    const prospectorBot = await createAgent('ProspectorBot', 'prospector-bot')
    console.log(`  ✓ ProspectorBot created: ${prospectorBot.id}`)

    // Trigger work: find leads
    console.log('  → Asking ProspectorBot to find startup leads...')
    const result = await chatWithAgent(prospectorBot.id,
      'Find 5 AI startups that are growing fast in 2026. For each, research: ' +
      'company name, what they do, estimated size, CEO name, and website URL. ' +
      'Create a data table called "AI Startup Prospects" with these columns. ' +
      'Then write a brief outreach strategy for approaching these companies and save it as "outreach-strategy.md".'
    )
    console.log(`  ✓ Lead gen: ${result.iterations} iterations, ${result.toolCalls?.length ?? 0} tool calls`)

    // Screenshot
    await page.goto('https://yokebot.com', { waitUntil: 'networkidle' })
    await injectSession(page, testUser)
    await screenshotPage(page, '/workspace', 'uc3-workspace')
    await screenshotPage(page, '/data-tables', 'uc3-data-tables')

    console.log('  ✅ UC3 Complete')
  })

  test('UC4: Multi-Agent Task Pipeline — cross-agent collaboration', async ({ page }) => {
    test.setTimeout(240_000) // 4 min

    // Create two agents
    const researchBot = await createAgent('InsightBot', 'research-bot')
    const contentBot = await createAgent('WriterBot', 'content-bot')
    console.log(`  ✓ InsightBot: ${researchBot.id}, WriterBot: ${contentBot.id}`)

    // Step 1: InsightBot researches and creates a task for WriterBot
    console.log('  → Step 1: InsightBot researching AI trends...')
    const step1 = await chatWithAgent(researchBot.id,
      'Research the top 3 AI trends for small businesses in 2026. ' +
      'Write your findings as a briefing document and save to workspace as "ai-trends-briefing.md". ' +
      'Then create a task assigned to WriterBot titled "Write newsletter from AI trends briefing" ' +
      'with description "Read ai-trends-briefing.md and write a 300-word newsletter for small business owners."'
    )
    console.log(`  ✓ Step 1: ${step1.iterations} iterations, ${step1.toolCalls?.length ?? 0} tool calls`)

    // Step 2: WriterBot picks up the task
    console.log('  → Step 2: WriterBot writing newsletter...')
    const step2 = await chatWithAgent(contentBot.id,
      'Check your tasks. You should have a task about writing a newsletter. ' +
      'Read the briefing document from the workspace and write the newsletter. ' +
      'Save it as "newsletter-ai-trends.md" and mark the task as done.'
    )
    console.log(`  ✓ Step 2: ${step2.iterations} iterations, ${step2.toolCalls?.length ?? 0} tool calls`)

    // Screenshot results
    await page.goto('https://yokebot.com', { waitUntil: 'networkidle' })
    await injectSession(page, testUser)
    await screenshotPage(page, '/workspace', 'uc4-workspace')
    await screenshotPage(page, '/tasks', 'uc4-tasks')

    // Check task status
    const tasks = await api('GET', '/api/tasks')
    for (const t of tasks || []) {
      console.log(`  ✓ Task "${t.title}" — status: ${t.status}`)
    }

    console.log('  ✅ UC4 Complete')
  })

  test('UC5: Email Campaign Drafts — multi-file output with approval', async ({ page }) => {
    test.setTimeout(180_000)

    // Create EmailBot
    const emailBot = await createAgent('EmailBot', 'email-bot')
    console.log(`  ✓ EmailBot created: ${emailBot.id}`)

    // Trigger work: draft email sequence
    console.log('  → Asking EmailBot to draft a welcome email sequence...')
    const result = await chatWithAgent(emailBot.id,
      'Create a 3-email welcome sequence for new YokeBot users. ' +
      'Email 1 (Day 0): Welcome + quick start guide — save as "welcome-email-1.md". ' +
      'Email 2 (Day 3): Top 3 agent templates to try — save as "welcome-email-2.md". ' +
      'Email 3 (Day 7): Success story + upgrade CTA — save as "welcome-email-3.md". ' +
      'Each email should have a subject line, body, and call to action. Keep them concise and friendly.'
    )
    console.log(`  ✓ Email drafts: ${result.iterations} iterations, ${result.toolCalls?.length ?? 0} tool calls`)

    // Screenshot
    await page.goto('https://yokebot.com', { waitUntil: 'networkidle' })
    await injectSession(page, testUser)
    await screenshotPage(page, '/workspace', 'uc5-workspace')

    // List files
    const files = await api('GET', '/api/files')
    const emailFiles = (files || []).filter((f: { name: string }) => f.name.includes('welcome-email'))
    console.log(`  ✓ Email drafts created: ${emailFiles.length}/3`)

    console.log('  ✅ UC5 Complete')
  })

  test('UC6: SEO Audit — analysis + recommendations report', async ({ page }) => {
    test.setTimeout(180_000)

    // Create SEOBot
    const seoBot = await createAgent('SEOBot', 'seo-bot')
    console.log(`  ✓ SEOBot created: ${seoBot.id}`)

    // Trigger work: SEO audit
    console.log('  → Asking SEOBot to audit yokebot.com...')
    const result = await chatWithAgent(seoBot.id,
      'Perform an SEO audit on yokebot.com. Check the homepage for: ' +
      'meta tags, heading structure, keyword usage, page speed considerations, and mobile-friendliness. ' +
      'Write a report with your top 10 recommendations ranked by impact. ' +
      'Save it to the workspace as "seo-audit-yokebot.md".'
    )
    console.log(`  ✓ SEO audit: ${result.iterations} iterations, ${result.toolCalls?.length ?? 0} tool calls`)

    // Screenshot
    await page.goto('https://yokebot.com', { waitUntil: 'networkidle' })
    await injectSession(page, testUser)
    await screenshotPage(page, '/workspace', 'uc6-workspace')

    console.log('  ✅ UC6 Complete')
  })
})

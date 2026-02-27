/**
 * skill-handlers.ts — Dynamic skill handler registry
 *
 * Each skill tool maps to a handler function that receives parsed args,
 * credentials (from team_credentials), and a context object. LLM-only
 * skills return formatted prompt text for the agent to process.
 */

import type { Db } from './db/types.ts'
import { getCredentials } from './credentials.ts'

export interface SkillHandlerContext {
  db: Db
  agentId: string
  teamId: string
}

export type SkillHandler = (
  args: Record<string, unknown>,
  credentials: Record<string, string>,
  ctx: SkillHandlerContext,
) => Promise<string>

interface HandlerEntry {
  handler: SkillHandler
  requiredCredentials: string[]
}

const registry = new Map<string, HandlerEntry>()

/** Register a skill handler for a tool name. */
export function registerHandler(toolName: string, handler: SkillHandler, requiredCredentials: string[] = []): void {
  registry.set(toolName, { handler, requiredCredentials })
}

/** Check if a handler exists for a tool name. */
export function hasHandler(toolName: string): boolean {
  return registry.has(toolName)
}

/**
 * Execute a skill handler. Fetches required credentials from team_credentials,
 * returns a helpful error if any are missing.
 */
export async function executeSkillHandler(
  toolName: string,
  args: Record<string, unknown>,
  ctx: SkillHandlerContext,
): Promise<string | null> {
  const entry = registry.get(toolName)
  if (!entry) return null

  const { handler, requiredCredentials } = entry

  // Fetch credentials from team_credentials (BYOK store)
  let credentials: Record<string, string> = {}
  if (requiredCredentials.length > 0) {
    credentials = await getCredentials(ctx.db, ctx.teamId, requiredCredentials)

    // Fall back to env vars for backward compatibility (self-hosted)
    const envFallbacks: Record<string, string> = {
      brave: 'BRAVE_API_KEY',
      slack: 'SLACK_WEBHOOK_URL',
      sendgrid: 'SENDGRID_API_KEY',
      twilio: 'TWILIO_AUTH',
      discord: 'DISCORD_WEBHOOK_URL',
      hubspot: 'HUBSPOT_API_KEY',
      apollo: 'APOLLO_API_KEY',
      hunter: 'HUNTER_API_KEY',
      google: 'GOOGLE_SERVICE_ACCOUNT_KEY',
      'google-analytics': 'GOOGLE_ANALYTICS_KEY',
      'google-places': 'GOOGLE_PLACES_API_KEY',
      notion: 'NOTION_API_KEY',
      github: 'GITHUB_TOKEN',
      stripe: 'STRIPE_SECRET_KEY',
      openai: 'OPENAI_API_KEY',
      firecrawl: 'FIRECRAWL_API_KEY',
      newsapi: 'NEWSAPI_KEY',
      eventbrite: 'EVENTBRITE_API_KEY',
    }
    for (const svcId of requiredCredentials) {
      if (!credentials[svcId]) {
        const envKey = envFallbacks[svcId]
        const envVal = envKey ? process.env[envKey] : undefined
        if (envVal) credentials[svcId] = envVal
      }
    }

    // Check for missing credentials
    const missing = requiredCredentials.filter((id) => !credentials[id])
    if (missing.length > 0) {
      return `This skill requires credentials that haven't been configured: ${missing.join(', ')}. ` +
        `Ask a team admin to add them in Settings → Integrations.`
    }
  }

  try {
    return await handler(args, credentials, ctx)
  } catch (err) {
    return `Skill error (${toolName}): ${err instanceof Error ? err.message : 'Unknown error'}`
  }
}

// ============================================================
// Built-in handlers
// ============================================================

// ---- Web Search (Brave) ----
registerHandler('web_search', async (args, creds) => {
  const apiKey = creds.brave
  const query = encodeURIComponent(args.query as string)
  const count = Math.min((args.count as number) ?? 5, 20)
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${query}&count=${count}`, {
    headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': apiKey },
  })
  if (!res.ok) return `Search failed: ${res.status} ${res.statusText}`
  const data = await res.json() as { web?: { results?: Array<{ title: string; url: string; description: string }> } }
  const results = data.web?.results ?? []
  if (results.length === 0) return 'No results found.'
  return results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.description}`).join('\n\n')
}, ['brave'])

// ---- Slack Send Message ----
registerHandler('slack_send_message', async (args, creds) => {
  const webhookUrl = creds.slack
  const payload: Record<string, unknown> = { text: args.text as string }
  if (args.username) payload.username = args.username
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) return `Slack error: ${res.status} ${res.statusText}`
  return 'Message sent to Slack successfully.'
}, ['slack'])

// ---- Send Email (SendGrid) ----
registerHandler('send_email', async (args, creds) => {
  const apiKey = creds.sendgrid
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: args.to as string }], subject: args.subject as string }],
      from: { email: args.from as string },
      content: [{ type: 'text/html', value: args.body as string }],
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    return `SendGrid error: ${res.status} — ${err.slice(0, 200)}`
  }
  return `Email sent to ${args.to as string}`
}, ['sendgrid'])

// ---- Send SMS (Twilio) ----
registerHandler('send_sms', async (args, creds) => {
  const [accountSid, authToken] = creds.twilio.split(':')
  if (!accountSid || !authToken) return 'Twilio credential must be in format SID:TOKEN'
  const body = new URLSearchParams({
    To: args.to as string,
    From: args.from as string,
    Body: args.body as string,
  })
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })
  if (!res.ok) return `Twilio error: ${res.status}`
  const data = await res.json() as { sid: string }
  return `SMS sent (SID: ${data.sid})`
}, ['twilio'])

// ---- Discord Post (Webhook) ----
registerHandler('discord_post', async (args, creds) => {
  const webhookUrl = creds.discord
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: args.content as string,
      username: (args.username as string) ?? 'YokeBot',
    }),
  })
  if (!res.ok) return `Discord error: ${res.status}`
  return 'Message posted to Discord.'
}, ['discord'])

// ---- Scrape Webpage (Firecrawl) ----
registerHandler('scrape_webpage', async (args, creds) => {
  const apiKey = creds.firecrawl
  const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: args.url as string, formats: ['markdown'] }),
  })
  if (!res.ok) return `Firecrawl error: ${res.status}`
  const data = await res.json() as { data?: { markdown?: string } }
  const md = data.data?.markdown
  if (!md) return 'Scrape returned no content.'
  // Truncate very long pages
  return md.length > 8000 ? md.slice(0, 8000) + '\n\n[...truncated]' : md
}, ['firecrawl'])

// ---- Monitor News (NewsAPI) ----
registerHandler('monitor_news', async (args, creds) => {
  const apiKey = creds.newsapi
  const query = encodeURIComponent(args.query as string)
  const pageSize = Math.min((args.count as number) ?? 5, 10)
  const res = await fetch(`https://newsapi.org/v2/everything?q=${query}&pageSize=${pageSize}&sortBy=publishedAt&apiKey=${apiKey}`)
  if (!res.ok) return `NewsAPI error: ${res.status}`
  const data = await res.json() as { articles?: Array<{ title: string; url: string; source: { name: string }; publishedAt: string; description: string }> }
  const articles = data.articles ?? []
  if (articles.length === 0) return 'No news articles found.'
  return articles.map((a, i) => `${i + 1}. ${a.title}\n   ${a.source.name} — ${a.publishedAt?.slice(0, 10)}\n   ${a.url}\n   ${a.description ?? ''}`).join('\n\n')
}, ['newsapi'])

// ---- HubSpot Contacts ----
registerHandler('hubspot_search_contacts', async (args, creds) => {
  const apiKey = creds.hubspot
  const query = args.query as string
  const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filterGroups: [{
        filters: [{ propertyName: 'email', operator: 'CONTAINS_TOKEN', value: query }],
      }],
      properties: ['email', 'firstname', 'lastname', 'company', 'phone'],
      limit: 10,
    }),
  })
  if (!res.ok) return `HubSpot error: ${res.status}`
  const data = await res.json() as { results?: Array<{ id: string; properties: Record<string, string> }> }
  const contacts = data.results ?? []
  if (contacts.length === 0) return 'No contacts found.'
  return contacts.map((c) => `${c.properties.firstname ?? ''} ${c.properties.lastname ?? ''} <${c.properties.email ?? ''}> — ${c.properties.company ?? ''} (ID: ${c.id})`).join('\n')
}, ['hubspot'])

// ---- HubSpot Deals ----
registerHandler('hubspot_list_deals', async (args, creds) => {
  const apiKey = creds.hubspot
  const limit = Math.min((args.limit as number) ?? 10, 50)
  const res = await fetch(`https://api.hubapi.com/crm/v3/objects/deals?limit=${limit}&properties=dealname,amount,dealstage,closedate`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  })
  if (!res.ok) return `HubSpot error: ${res.status}`
  const data = await res.json() as { results?: Array<{ id: string; properties: Record<string, string> }> }
  const deals = data.results ?? []
  if (deals.length === 0) return 'No deals found.'
  return deals.map((d) => `${d.properties.dealname} — $${d.properties.amount ?? '0'} — Stage: ${d.properties.dealstage} — Close: ${d.properties.closedate ?? 'n/a'} (ID: ${d.id})`).join('\n')
}, ['hubspot'])

// ---- Enrich Lead (Apollo) ----
registerHandler('enrich_lead', async (args, creds) => {
  const apiKey = creds.apollo
  const res = await fetch('https://api.apollo.io/api/v1/people/match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
    body: JSON.stringify({
      email: args.email as string | undefined,
      first_name: args.firstName as string | undefined,
      last_name: args.lastName as string | undefined,
      organization_name: args.company as string | undefined,
    }),
  })
  if (!res.ok) return `Apollo error: ${res.status}`
  const data = await res.json() as { person?: Record<string, unknown> }
  if (!data.person) return 'No match found.'
  const p = data.person as Record<string, unknown>
  return JSON.stringify({
    name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
    title: p.title,
    company: (p.organization as Record<string, unknown>)?.name,
    email: p.email,
    linkedin: p.linkedin_url,
    city: p.city,
    state: p.state,
  }, null, 2)
}, ['apollo'])

// ---- Find Contact (Hunter.io) ----
registerHandler('find_contact', async (args, creds) => {
  const apiKey = creds.hunter
  const params = new URLSearchParams({ api_key: apiKey })
  if (args.domain) params.set('domain', args.domain as string)
  if (args.company) params.set('company', args.company as string)
  if (args.firstName) params.set('first_name', args.firstName as string)
  if (args.lastName) params.set('last_name', args.lastName as string)
  const res = await fetch(`https://api.hunter.io/v2/email-finder?${params.toString()}`)
  if (!res.ok) return `Hunter error: ${res.status}`
  const data = await res.json() as { data?: { email?: string; score?: number; first_name?: string; last_name?: string } }
  if (!data.data?.email) return 'No email found.'
  return `Found: ${data.data.first_name ?? ''} ${data.data.last_name ?? ''} <${data.data.email}> (confidence: ${data.data.score ?? 0}%)`
}, ['hunter'])

// ---- GitHub Issues ----
registerHandler('github_issues', async (args, creds) => {
  const token = creds.github
  const repo = args.repo as string
  const action = (args.action as string) ?? 'list'
  const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json' }

  if (action === 'create') {
    const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: args.title as string, body: args.body as string }),
    })
    if (!res.ok) return `GitHub error: ${res.status}`
    const issue = await res.json() as { number: number; html_url: string }
    return `Issue #${issue.number} created: ${issue.html_url}`
  }

  // Default: list
  const state = (args.state as string) ?? 'open'
  const res = await fetch(`https://api.github.com/repos/${repo}/issues?state=${state}&per_page=10`, { headers })
  if (!res.ok) return `GitHub error: ${res.status}`
  const issues = await res.json() as Array<{ number: number; title: string; state: string; html_url: string }>
  if (issues.length === 0) return `No ${state} issues found.`
  return issues.map((i) => `#${i.number} [${i.state}] ${i.title}\n  ${i.html_url}`).join('\n')
}, ['github'])

// ---- Stripe Customers ----
registerHandler('stripe_customers', async (args, creds) => {
  const apiKey = creds.stripe
  const action = (args.action as string) ?? 'list'
  const headers = { 'Authorization': `Bearer ${apiKey}` }

  if (action === 'search' && args.email) {
    const res = await fetch(`https://api.stripe.com/v1/customers/search?query=email:"${args.email as string}"`, { headers })
    if (!res.ok) return `Stripe error: ${res.status}`
    const data = await res.json() as { data: Array<{ id: string; email: string; name: string }> }
    return data.data.length === 0
      ? 'No customers found.'
      : data.data.map((c) => `${c.name ?? 'N/A'} <${c.email}> (ID: ${c.id})`).join('\n')
  }

  const limit = Math.min((args.limit as number) ?? 10, 100)
  const res = await fetch(`https://api.stripe.com/v1/customers?limit=${limit}`, { headers })
  if (!res.ok) return `Stripe error: ${res.status}`
  const data = await res.json() as { data: Array<{ id: string; email: string; name: string; created: number }> }
  return data.data.map((c) => `${c.name ?? 'N/A'} <${c.email ?? ''}> — Created: ${new Date(c.created * 1000).toISOString().slice(0, 10)} (ID: ${c.id})`).join('\n')
}, ['stripe'])

// ---- Notion Pages ----
registerHandler('notion_create_page', async (args, creds) => {
  const apiKey = creds.notion
  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({
      parent: { page_id: args.parentPageId as string },
      properties: { title: { title: [{ text: { content: args.title as string } }] } },
      children: [{
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [{ text: { content: args.content as string } }] },
      }],
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    return `Notion error: ${res.status} — ${err.slice(0, 200)}`
  }
  const data = await res.json() as { id: string; url: string }
  return `Page created: ${data.url}`
}, ['notion'])

// ---- Google Calendar (list events) ----
registerHandler('google_calendar_list', async (args, creds) => {
  // Google service account JSON key
  // For simplicity, this uses an API key or OAuth token stored directly
  const apiKey = creds.google
  const calendarId = (args.calendarId as string) ?? 'primary'
  const timeMin = (args.timeMin as string) ?? new Date().toISOString()
  const maxResults = Math.min((args.maxResults as number) ?? 10, 50)
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${timeMin}&maxResults=${maxResults}&orderBy=startTime&singleEvents=true`,
    { headers: { 'Authorization': `Bearer ${apiKey}` } },
  )
  if (!res.ok) return `Google Calendar error: ${res.status}`
  const data = await res.json() as { items?: Array<{ summary: string; start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string }; htmlLink: string }> }
  const events = data.items ?? []
  if (events.length === 0) return 'No upcoming events found.'
  return events.map((e) => `${e.start.dateTime ?? e.start.date} — ${e.summary}\n  ${e.htmlLink}`).join('\n')
}, ['google'])

// ---- Transcribe Audio (OpenAI Whisper) ----
registerHandler('transcribe_audio', async (args, creds) => {
  const apiKey = creds.openai
  const audioUrl = args.audioUrl as string
  // Download the audio file first
  const audioRes = await fetch(audioUrl)
  if (!audioRes.ok) return `Failed to download audio: ${audioRes.status}`
  const audioBlob = await audioRes.blob()

  const formData = new FormData()
  formData.append('file', audioBlob, 'audio.mp3')
  formData.append('model', 'whisper-1')
  if (args.language) formData.append('language', args.language as string)
  formData.append('response_format', 'verbose_json')

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: formData,
  })
  if (!res.ok) return `Whisper error: ${res.status}`
  const data = await res.json() as { text: string; segments?: Array<{ start: number; end: number; text: string }> }
  if (data.segments && data.segments.length > 0) {
    return data.segments.map((s) => `[${Math.floor(s.start / 60)}:${String(Math.floor(s.start % 60)).padStart(2, '0')}] ${s.text.trim()}`).join('\n')
  }
  return data.text
}, ['openai'])

// ============================================================
// LLM-only handlers — return formatted prompts for the agent
// ============================================================

function llmHandler(promptBuilder: (args: Record<string, unknown>) => string): SkillHandler {
  return async (args) => promptBuilder(args)
}

registerHandler('summarize_text', llmHandler((args) =>
  `Please summarize the following text concisely, preserving key points and structure:\n\n---\n${args.text as string}\n---\n\nFormat: ${(args.format as string) ?? 'bullet points'}\nLength: ${(args.length as string) ?? 'medium'}`
))

registerHandler('generate_blog_post', llmHandler((args) =>
  `Write an SEO-optimized blog post about: ${args.topic as string}\n\nTarget keywords: ${(args.keywords as string) ?? 'none specified'}\nTone: ${(args.tone as string) ?? 'professional'}\nLength: ${(args.wordCount as string) ?? '800-1200'} words\nInclude: headline, subheadings, intro, body sections, conclusion, meta description`
))

registerHandler('edit_document', llmHandler((args) =>
  `Edit the following document for clarity, grammar, and readability. Preserve the original meaning and tone.\n\nEditing focus: ${(args.focus as string) ?? 'general improvement'}\n\n---\n${args.text as string}\n---`
))

registerHandler('translate_text', llmHandler((args) =>
  `Translate the following text from ${(args.sourceLanguage as string) ?? 'auto-detect'} to ${args.targetLanguage as string}. Preserve tone, formatting, and meaning.\n\n---\n${args.text as string}\n---`
))

registerHandler('generate_email_draft', llmHandler((args) =>
  `Draft a professional email:\nTo: ${args.to as string}\nSubject: ${args.subject as string}\nContext: ${args.context as string}\nTone: ${(args.tone as string) ?? 'professional'}\n\nInclude: subject line, greeting, body, sign-off`
))

registerHandler('generate_social_post', llmHandler((args) =>
  `Create a social media post for ${args.platform as string}.\n\nTopic: ${args.topic as string}\nTone: ${(args.tone as string) ?? 'engaging'}\nInclude hashtags: ${(args.hashtags as string) ?? 'yes'}\nCall to action: ${(args.cta as string) ?? 'none'}\n\nFollow platform best practices for character limits and formatting.`
))

registerHandler('write_press_release', llmHandler((args) =>
  `Write a press release:\n\nHeadline topic: ${args.topic as string}\nKey facts: ${args.facts as string}\nQuotes from: ${(args.spokesperson as string) ?? 'company spokesperson'}\nCompany: ${(args.company as string) ?? 'the company'}\n\nFollow AP style. Include: headline, dateline, lead paragraph, body, boilerplate, contact info placeholder.`
))

registerHandler('proofread', llmHandler((args) =>
  `Proofread the following text. Check for:\n- Grammar and spelling errors\n- Punctuation issues\n- Consistency in style and tone\n- Unclear or awkward phrasing\n\nReturn the corrected version with a list of changes made.\n\n---\n${args.text as string}\n---`
))

registerHandler('generate_ad_copy', llmHandler((args) =>
  `Write ${(args.variations as string) ?? '3'} ad copy variations:\n\nProduct/Service: ${args.product as string}\nPlatform: ${(args.platform as string) ?? 'Google Ads'}\nTarget audience: ${(args.audience as string) ?? 'general'}\nUSP: ${(args.usp as string) ?? 'not specified'}\nCTA: ${(args.cta as string) ?? 'Learn more'}\n\nInclude headlines and descriptions within platform character limits.`
))

registerHandler('write_sop', llmHandler((args) =>
  `Create a Standard Operating Procedure (SOP) document:\n\nProcess: ${args.process as string}\nDepartment: ${(args.department as string) ?? 'General'}\nAudience: ${(args.audience as string) ?? 'team members'}\n\nInclude: purpose, scope, responsibilities, step-by-step procedure, references, revision history placeholder.`
))

registerHandler('analyze_csv', llmHandler((args) =>
  `Analyze the following CSV data and provide insights:\n\n\`\`\`csv\n${args.data as string}\n\`\`\`\n\nAnalysis requested: ${(args.analysis as string) ?? 'summary statistics, trends, and actionable insights'}\nFormat output as: ${(args.format as string) ?? 'structured report with bullet points'}`
))

registerHandler('extract_data', llmHandler((args) =>
  `Extract structured data from the following text:\n\n---\n${args.text as string}\n---\n\nExtract: ${args.fields as string}\nOutput format: ${(args.format as string) ?? 'JSON'}`
))

registerHandler('compare_documents', llmHandler((args) =>
  `Compare these two documents and highlight differences, gaps, and key changes:\n\nDocument A:\n---\n${args.documentA as string}\n---\n\nDocument B:\n---\n${args.documentB as string}\n---\n\nFocus on: ${(args.focus as string) ?? 'content differences, missing sections, and tone changes'}`
))

registerHandler('sentiment_analysis', llmHandler((args) =>
  `Analyze the sentiment of the following text. Provide:\n- Overall sentiment (positive/negative/neutral/mixed)\n- Sentiment score (-1 to 1)\n- Key phrases driving sentiment\n- Emotional tones detected\n\n---\n${args.text as string}\n---`
))

registerHandler('keyword_extraction', llmHandler((args) =>
  `Extract keywords and topics from the following text:\n\n---\n${args.text as string}\n---\n\nPurpose: ${(args.purpose as string) ?? 'SEO optimization'}\nReturn: primary keywords, secondary keywords, long-tail phrases, and topic clusters.`
))

registerHandler('expand_insights', llmHandler((args) =>
  `Take the following brief idea or note and expand it into a detailed analysis with actionable insights:\n\n---\n${args.idea as string}\n---\n\nContext: ${(args.context as string) ?? 'business strategy'}\nDepth: ${(args.depth as string) ?? 'comprehensive'}\n\nInclude: background, analysis, implications, recommendations, and next steps.`
))

registerHandler('annotate_video_transcript', llmHandler((args) =>
  `Analyze and annotate this video transcript. Identify:\n- Key moments and timestamps\n- Topic changes\n- Important quotes\n- Action items mentioned\n- Summary of each section\n\nTranscript:\n---\n${args.transcript as string}\n---`
))

registerHandler('brainstorm', llmHandler((args) =>
  `Brainstorm ideas for: ${args.topic as string}\n\nConstraints: ${(args.constraints as string) ?? 'none'}\nNumber of ideas: ${(args.count as string) ?? '10'}\nThinking approach: ${(args.approach as string) ?? 'diverse — combine practical, creative, and unconventional ideas'}\n\nFor each idea, provide: the idea, a brief explanation, pros, and potential challenges.`
))

registerHandler('generate_report', llmHandler((args) =>
  `Generate a formatted business report:\n\nTitle: ${args.title as string}\nData/Context: ${args.data as string}\nReport type: ${(args.type as string) ?? 'executive summary'}\nAudience: ${(args.audience as string) ?? 'leadership team'}\n\nInclude: executive summary, key metrics, analysis, charts/tables (markdown), recommendations.`
))

registerHandler('create_meeting_agenda', llmHandler((args) =>
  `Create a structured meeting agenda:\n\nMeeting title: ${args.title as string}\nTopics to cover: ${args.topics as string}\nDuration: ${(args.duration as string) ?? '60 minutes'}\nAttendees: ${(args.attendees as string) ?? 'team'}\n\nInclude: time allocations, discussion items, action item review, and next steps section.`
))

registerHandler('write_proposal', llmHandler((args) =>
  `Draft a business proposal:\n\nClient/Recipient: ${args.recipient as string}\nProject/Service: ${args.project as string}\nKey details: ${args.details as string}\nBudget range: ${(args.budget as string) ?? 'to be discussed'}\n\nInclude: executive summary, scope, approach, timeline, pricing, terms, and next steps.`
))

registerHandler('competitor_analysis', llmHandler((args) =>
  `Analyze competitor positioning:\n\nOur company: ${(args.company as string) ?? 'our company'}\nCompetitors: ${args.competitors as string}\nAnalysis focus: ${(args.focus as string) ?? 'pricing, features, positioning, strengths, weaknesses'}\n\nProvide: SWOT for each, competitive matrix, key differentiators, and strategic recommendations.`
))

registerHandler('create_job_posting', llmHandler((args) =>
  `Write a job description:\n\nRole: ${args.title as string}\nDepartment: ${(args.department as string) ?? 'not specified'}\nLevel: ${(args.level as string) ?? 'mid-level'}\nKey responsibilities: ${args.responsibilities as string}\nRequirements: ${(args.requirements as string) ?? 'relevant experience'}\n\nInclude: title, about the company section, responsibilities, qualifications, benefits, and equal opportunity statement.`
))

registerHandler('score_resume', llmHandler((args) =>
  `Evaluate this resume against the job criteria:\n\nJob requirements:\n${args.requirements as string}\n\nResume:\n---\n${args.resume as string}\n---\n\nProvide: overall score (0-100), category scores (skills match, experience, education, culture fit), strengths, gaps, and recommendation.`
))

registerHandler('generate_faq', llmHandler((args) =>
  `Generate FAQ content:\n\nProduct/Service: ${args.subject as string}\nContext: ${(args.context as string) ?? ''}\nNumber of Q&As: ${(args.count as string) ?? '10'}\n\nGenerate realistic customer questions with clear, helpful answers. Organize by category.`
))

registerHandler('create_onboarding_checklist', llmHandler((args) =>
  `Create an onboarding checklist:\n\nRole: ${args.role as string}\nDepartment: ${(args.department as string) ?? 'General'}\nTimeline: ${(args.timeline as string) ?? 'first 90 days'}\n\nInclude: pre-start, day 1, week 1, month 1, and month 2-3 sections. Add specific tasks, owners, and completion criteria.`
))

registerHandler('generate_design_brief', llmHandler((args) =>
  `Create a design brief:\n\nProject: ${args.project as string}\nObjective: ${args.objective as string}\nTarget audience: ${(args.audience as string) ?? 'general'}\nBrand guidelines: ${(args.brandGuidelines as string) ?? 'none specified'}\n\nInclude: background, objectives, target audience, deliverables, timeline, inspiration/references, technical requirements.`
))

registerHandler('brand_check', llmHandler((args) =>
  `Review the following content against brand guidelines:\n\nContent:\n---\n${args.content as string}\n---\n\nBrand guidelines: ${args.guidelines as string}\n\nCheck: voice/tone, messaging, terminology, visual direction, compliance. Flag any deviations and suggest corrections.`
))

registerHandler('create_quiz', llmHandler((args) =>
  `Generate a training quiz:\n\nTopic: ${args.topic as string}\nSource material: ${(args.material as string) ?? 'general knowledge'}\nNumber of questions: ${(args.count as string) ?? '10'}\nDifficulty: ${(args.difficulty as string) ?? 'medium'}\n\nInclude: mix of multiple choice, true/false, and short answer. Provide answer key with explanations.`
))

registerHandler('create_training_guide', llmHandler((args) =>
  `Build a step-by-step training guide:\n\nProcedure: ${args.procedure as string}\nAudience: ${(args.audience as string) ?? 'new employees'}\nFormat: ${(args.format as string) ?? 'numbered steps with screenshots placeholders'}\n\nInclude: prerequisites, step-by-step instructions, tips, common mistakes, troubleshooting, and knowledge check questions.`
))

registerHandler('generate_show_notes', llmHandler((args) =>
  `Create podcast show notes from this transcript:\n\n---\n${args.transcript as string}\n---\n\nInclude: episode title suggestions, summary, key topics discussed, timestamps, guest bio (if applicable), quotes, resources mentioned, and social media snippets.`
))

registerHandler('create_survey', llmHandler((args) =>
  `Generate a survey:\n\nResearch goal: ${args.goal as string}\nTarget audience: ${(args.audience as string) ?? 'general'}\nNumber of questions: ${(args.count as string) ?? '10'}\n\nInclude: mix of question types (multiple choice, rating scale, open-ended, matrix). Add logic branching notes. Ensure unbiased phrasing.`
))

// ---- SEO Audit (LLM + fetch) ----
registerHandler('seo_audit', async (args) => {
  const url = args.url as string
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'YokeBot-SEO/1.0' } })
    if (!res.ok) return `Failed to fetch ${url}: ${res.status}`
    const html = await res.text()
    // Extract key SEO elements
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i)
    const metaDesc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["'](.*?)["']/i)
    const h1s = [...html.matchAll(/<h1[^>]*>(.*?)<\/h1>/gi)].map((m) => m[1].replace(/<[^>]+>/g, ''))
    const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["'](.*?)["']/i)
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["'](.*?)["']/i)
    const imgsMissingAlt = (html.match(/<img(?![^>]*alt=)[^>]*>/gi) ?? []).length

    return `SEO Audit for ${url}:\n\n` +
      `Title: ${titleMatch?.[1] ?? 'MISSING'} (${titleMatch?.[1]?.length ?? 0} chars)\n` +
      `Meta Description: ${metaDesc?.[1] ?? 'MISSING'} (${metaDesc?.[1]?.length ?? 0} chars)\n` +
      `H1 Tags: ${h1s.length > 0 ? h1s.join(', ') : 'NONE FOUND'}\n` +
      `Canonical: ${canonicalMatch?.[1] ?? 'MISSING'}\n` +
      `OG Title: ${ogTitle?.[1] ?? 'MISSING'}\n` +
      `Images missing alt: ${imgsMissingAlt}\n` +
      `Page size: ${(html.length / 1024).toFixed(1)}KB\n\n` +
      `Analyze the above data and provide specific SEO recommendations.`
  } catch (err) {
    return `Could not audit ${url}: ${err instanceof Error ? err.message : 'Unknown error'}`
  }
})

// ---- Create Invoice PDF (built-in) ----
registerHandler('create_invoice_pdf', llmHandler((args) =>
  `Generate an invoice in structured format:\n\nFrom: ${args.from as string}\nTo: ${args.to as string}\nItems: ${JSON.stringify(args.items)}\nDue date: ${(args.dueDate as string) ?? '30 days from today'}\nNotes: ${(args.notes as string) ?? ''}\n\nFormat as a clean, professional invoice with line items, subtotal, tax, and total. Use markdown table format.`
))

// ---- Scan Dependencies (built-in) ----
registerHandler('scan_dependencies', llmHandler((args) =>
  `Analyze the following dependency file for known vulnerabilities, outdated packages, and security risks:\n\n\`\`\`\n${args.dependencies as string}\n\`\`\`\n\nProvide: risk assessment, specific CVEs if known, recommended updates, and priority ranking.`
))

// ---- Audit Permissions (built-in) ----
registerHandler('audit_permissions', llmHandler((args) =>
  `Review the following access permissions and security configuration:\n\n\`\`\`\n${args.config as string}\n\`\`\`\n\nCheck for: over-privileged accounts, unused permissions, policy violations, best practice deviations. Provide a risk-ranked report with remediation steps.`
))

// ---- Monitor Competitors (built-in, uses web_search) ----
registerHandler('monitor_competitors', llmHandler((args) =>
  `Analyze the competitive landscape for: ${args.company as string}\n\nCompetitors to monitor: ${args.competitors as string}\nFocus areas: ${(args.focus as string) ?? 'pricing, features, product launches, hiring, news'}\n\nProvide a structured competitive intelligence brief with findings and strategic implications.`
))

// ---- Read Email (Gmail — simplified) ----
registerHandler('read_email', async (args, creds) => {
  const token = creds.google
  const query = encodeURIComponent((args.query as string) ?? 'is:unread')
  const maxResults = Math.min((args.maxResults as number) ?? 10, 20)
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=${maxResults}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (!res.ok) return `Gmail error: ${res.status}`
  const data = await res.json() as { messages?: Array<{ id: string }> }
  if (!data.messages?.length) return 'No messages found.'

  // Fetch first 5 message details
  const details = []
  for (const msg of data.messages.slice(0, 5)) {
    const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    if (msgRes.ok) {
      const msgData = await msgRes.json() as { payload?: { headers?: Array<{ name: string; value: string }> }; snippet?: string }
      const headers = msgData.payload?.headers ?? []
      const from = headers.find((h) => h.name === 'From')?.value ?? 'unknown'
      const subject = headers.find((h) => h.name === 'Subject')?.value ?? '(no subject)'
      const date = headers.find((h) => h.name === 'Date')?.value ?? ''
      details.push(`From: ${from}\nSubject: ${subject}\nDate: ${date}\nSnippet: ${msgData.snippet ?? ''}`)
    }
  }
  return details.join('\n---\n')
}, ['google'])

// ---- Google Search Console ----
registerHandler('google_search_console', async (args, creds) => {
  const token = creds.google
  const siteUrl = args.siteUrl as string
  const startDate = (args.startDate as string) ?? new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10)
  const endDate = (args.endDate as string) ?? new Date().toISOString().slice(0, 10)
  const res = await fetch('https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(siteUrl) + '/searchAnalytics/query', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startDate, endDate,
      dimensions: ['query'],
      rowLimit: 20,
    }),
  })
  if (!res.ok) return `Search Console error: ${res.status}`
  const data = await res.json() as { rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }> }
  const rows = data.rows ?? []
  if (rows.length === 0) return 'No search analytics data found.'
  return rows.map((r) => `"${r.keys[0]}" — ${r.clicks} clicks, ${r.impressions} impressions, CTR: ${(r.ctr * 100).toFixed(1)}%, Avg Position: ${r.position.toFixed(1)}`).join('\n')
}, ['google'])

// ---- Google Analytics (GA4) ----
registerHandler('google_analytics_report', async (args, creds) => {
  const token = creds['google-analytics']
  const propertyId = args.propertyId as string
  const startDate = (args.startDate as string) ?? '28daysAgo'
  const endDate = (args.endDate as string) ?? 'today'
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'date' }],
      metrics: [
        { name: 'activeUsers' },
        { name: 'sessions' },
        { name: 'screenPageViews' },
        { name: 'bounceRate' },
      ],
    }),
  })
  if (!res.ok) return `GA4 error: ${res.status}`
  const data = await res.json() as { rows?: Array<{ dimensionValues: Array<{ value: string }>; metricValues: Array<{ value: string }> }> }
  const rows = data.rows ?? []
  if (rows.length === 0) return 'No analytics data found.'
  return `Date | Users | Sessions | Page Views | Bounce Rate\n` +
    rows.map((r) => `${r.dimensionValues[0].value} | ${r.metricValues[0].value} | ${r.metricValues[1].value} | ${r.metricValues[2].value} | ${(Number(r.metricValues[3].value) * 100).toFixed(1)}%`).join('\n')
}, ['google-analytics'])

// ---- Monitor Reviews (Google Places) ----
registerHandler('monitor_reviews', async (args, creds) => {
  const apiKey = creds['google-places']
  const placeId = args.placeId as string
  const res = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,rating,user_ratings_total,reviews&key=${apiKey}`)
  if (!res.ok) return `Google Places error: ${res.status}`
  const data = await res.json() as { result?: { name: string; rating: number; user_ratings_total: number; reviews?: Array<{ author_name: string; rating: number; text: string; time: number }> } }
  const place = data.result
  if (!place) return 'Place not found.'
  const reviews = place.reviews ?? []
  return `${place.name} — ${place.rating}/5 (${place.user_ratings_total} reviews)\n\nRecent reviews:\n` +
    reviews.slice(0, 5).map((r) => `${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)} ${r.author_name}\n${r.text.slice(0, 200)}`).join('\n---\n')
}, ['google-places'])

// ---- Respond to Review (LLM-only — drafts response) ----
registerHandler('respond_to_review', llmHandler((args) =>
  `Draft a professional response to this customer review:\n\nRating: ${args.rating as string}/5\nReview: ${args.reviewText as string}\nBusiness: ${(args.businessName as string) ?? 'our business'}\n\nTone: ${(args.tone as string) ?? 'warm, professional, solution-oriented'}\nIf negative, acknowledge the concern and offer resolution.`
))

// ---- Eventbrite Manage ----
registerHandler('eventbrite_manage', async (args, creds) => {
  const apiKey = creds.eventbrite
  const action = (args.action as string) ?? 'list'
  const headers = { 'Authorization': `Bearer ${apiKey}` }

  if (action === 'list') {
    const res = await fetch('https://www.eventbriteapi.com/v3/users/me/events/?status=live&order_by=start_asc', { headers })
    if (!res.ok) return `Eventbrite error: ${res.status}`
    const data = await res.json() as { events?: Array<{ id: string; name: { text: string }; start: { local: string }; url: string }> }
    const events = data.events ?? []
    if (events.length === 0) return 'No live events found.'
    return events.map((e) => `${e.name.text} — ${e.start.local}\n  ${e.url} (ID: ${e.id})`).join('\n')
  }
  return `Unknown eventbrite action: ${action}`
}, ['eventbrite'])

// ============================================================
// AdvisorBot Tools — Meta-tools that manage the YokeBot platform
// HOSTED ONLY: These tools are gated to hosted mode.
// ============================================================

import { listTemplates, getTemplate } from './templates.ts'
import { createAgent, listAgents, type AgentConfig } from './agent.ts'
import { loadSkillsFromDir, installSkill, getAgentSkills } from './skills.ts'
import { resolveModelConfig, getAvailableModels } from './model.ts'
import { listCredentials } from './credentials.ts'

const ADVISOR_HOSTED_GUARD = 'This feature requires YokeBot Cloud. AdvisorBot and its tools are not available in self-hosted mode.'

// ---- List Available Templates ----
registerHandler('list_templates', async (_args, _creds, ctx) => {
  if (process.env.YOKEBOT_HOSTED_MODE !== 'true') return ADVISOR_HOSTED_GUARD
  const templates = listTemplates()
  const agents = await listAgents(ctx.db, ctx.teamId)
  const deployedTemplateIds = new Set(agents.map((a) => a.templateId).filter(Boolean))

  const summary = templates.map((t) => {
    const deployed = deployedTemplateIds.has(t.id) ? ' [DEPLOYED]' : ''
    return `**${t.name}**${deployed} — ${t.title}\n  ${t.description}\n  Department: ${t.department} | Model: ${t.recommendedModel} | Skills: ${t.defaultSkills.join(', ') || 'none'}`
  })

  return `Available Agent Templates (${templates.length} total, ${deployedTemplateIds.size} deployed):\n\n${summary.join('\n\n')}`
})

// ---- Recommend Agents ----
registerHandler('recommend_agents', async (args, _creds, ctx) => {
  if (process.env.YOKEBOT_HOSTED_MODE !== 'true') return ADVISOR_HOSTED_GUARD
  const goal = args.goal as string
  const templates = listTemplates()
  const agents = await listAgents(ctx.db, ctx.teamId)
  const creds = await listCredentials(ctx.db, ctx.teamId)
  const connectedServices = creds.filter((c) => c.hasValue).map((c) => c.serviceId)

  return `The user's goal: "${goal}"\n\n` +
    `Currently deployed agents (${agents.length}):\n${agents.map((a) => `- ${a.name} (${a.status})`).join('\n') || '(none)'}\n\n` +
    `Connected integrations: ${connectedServices.join(', ') || '(none)'}\n\n` +
    `Available templates:\n${templates.map((t) => `- ${t.name}: ${t.title} [${t.department}] (skills: ${t.defaultSkills.join(', ') || 'none'})`).join('\n')}\n\n` +
    `Based on this information, recommend which agents to deploy to achieve the user's goal. ` +
    `Consider which integrations they have connected, what's already deployed, and what combination of agents would work best together. ` +
    `Be specific about WHY each agent helps and what order to set them up.`
})

// ---- Deploy Agent from Template ----
registerHandler('deploy_agent', async (args, _creds, ctx) => {
  if (process.env.YOKEBOT_HOSTED_MODE !== 'true') return ADVISOR_HOSTED_GUARD
  const templateId = args.templateId as string
  const customName = args.name as string | undefined
  const template = getTemplate(templateId)
  if (!template) return `Template not found: ${templateId}. Use list_templates to see available options.`

  // Resolve model config
  const modelConfig = await resolveModelConfig(ctx.db, template.recommendedModel)
  if (!modelConfig) return `Could not resolve model config for ${template.recommendedModel}. The recommended model may not be available.`

  // Create the agent
  const config: AgentConfig = {
    name: customName ?? template.name,
    department: template.department,
    iconName: template.icon,
    iconColor: template.iconColor,
    systemPrompt: template.systemPrompt,
    modelId: template.recommendedModel,
    modelConfig,
    heartbeatSeconds: 1800,
    templateId: template.id,
  }

  const agent = await createAgent(ctx.db, ctx.teamId, config)

  // Auto-install default skills
  const installed: string[] = []
  const failed: string[] = []
  for (const skill of template.defaultSkills) {
    try {
      await installSkill(ctx.db, agent.id, skill)
      installed.push(skill)
    } catch {
      failed.push(skill)
    }
  }

  return `Agent deployed successfully!\n\n` +
    `Name: ${agent.name}\n` +
    `ID: ${agent.id}\n` +
    `Template: ${template.title}\n` +
    `Model: ${template.recommendedModel}\n` +
    `Department: ${template.department}\n` +
    `Skills installed: ${installed.join(', ') || 'none'}` +
    (failed.length > 0 ? `\nSkills failed to install: ${failed.join(', ')}` : '') +
    `\n\nThe agent is now ready. It will start working on its next heartbeat cycle.`
})

// ---- List My Agents ----
registerHandler('list_my_agents', async (_args, _creds, ctx) => {
  if (process.env.YOKEBOT_HOSTED_MODE !== 'true') return ADVISOR_HOSTED_GUARD
  const agents = await listAgents(ctx.db, ctx.teamId)
  if (agents.length === 0) return 'No agents deployed yet. Use recommend_agents to get suggestions or deploy_agent to set one up.'

  const summaries = await Promise.all(agents.map(async (a) => {
    const skills = await getAgentSkills(ctx.db, a.id)
    return `**${a.name}** (${a.status})\n  Model: ${a.modelId} | Department: ${a.department ?? 'General'}\n  Skills: ${skills.map((s) => s.skillName).join(', ') || 'none'}\n  ID: ${a.id}`
  }))

  return `Your agents (${agents.length}):\n\n${summaries.join('\n\n')}`
})

// ---- Install Skill on Agent ----
registerHandler('install_agent_skill', async (args, _creds, ctx) => {
  if (process.env.YOKEBOT_HOSTED_MODE !== 'true') return ADVISOR_HOSTED_GUARD
  const agentId = args.agentId as string
  const skillName = args.skillName as string

  // Verify agent belongs to team
  const agents = await listAgents(ctx.db, ctx.teamId)
  const agent = agents.find((a) => a.id === agentId)
  if (!agent) return `Agent not found: ${agentId}. Use list_my_agents to see your agents.`

  try {
    await installSkill(ctx.db, agentId, skillName)
    return `Skill "${skillName}" installed on ${agent.name} successfully.`
  } catch (err) {
    return `Failed to install skill: ${(err as Error).message}`
  }
})

// ---- Check Integrations Status ----
registerHandler('check_integrations', async (_args, _creds, ctx) => {
  if (process.env.YOKEBOT_HOSTED_MODE !== 'true') return ADVISOR_HOSTED_GUARD
  const creds = await listCredentials(ctx.db, ctx.teamId)
  const connected = creds.filter((c) => c.hasValue)
  const missing = creds.filter((c) => !c.hasValue)

  // Import services list
  const { listServices } = await import('./services.ts')
  const services = listServices()
  const serviceMap = new Map(services.map((s) => [s.id, s]))

  const connectedList = connected.map((c) => {
    const svc = serviceMap.get(c.serviceId)
    return `  ✓ ${svc?.name ?? c.serviceId} — Connected`
  }).join('\n')

  const availableList = services
    .filter((s) => !connected.find((c) => c.serviceId === s.id))
    .map((s) => `  ○ ${s.name} — Not connected (${s.description})`)
    .join('\n')

  return `Integration Status:\n\nConnected (${connected.length}):\n${connectedList || '  (none)'}\n\nAvailable (${services.length - connected.length}):\n${availableList}\n\n` +
    `To connect a service, guide the user to Settings → Integrations in the dashboard.`
})

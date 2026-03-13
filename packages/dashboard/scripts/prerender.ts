/**
 * Post-build SSG (Static Site Generation) script.
 * Generates pre-rendered HTML for all public pages so crawlers get real content
 * and users see content instantly on first load (no JS-hydration wait).
 *
 * Uses react-dom/server.renderToString() — no browser binary needed.
 * Works everywhere: local, Vercel, CI.
 *
 * Run via: tsx --tsconfig tsconfig.app.json scripts/prerender.ts
 */
import { renderToString } from 'react-dom/server'
import { createElement } from 'react'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { docsContent } from '../src/lib/docs-content.ts'

const DIST = join(import.meta.dirname, '..', 'dist')

const SITE_NAME = 'YokeBot'
const SITE_URL = 'https://yokebot.com'

// Marketing pages — correct meta tags (content rendered client-side)
const marketingPages: Array<{ path: string; title: string; description: string }> = [
  { path: '/', title: 'YokeBot — AI Agent Workforce Platform', description: 'Deploy a team of AI agents that plan, collaborate, and execute autonomously. Manage your entire AI workforce from one unified dashboard.' },
  { path: '/pricing', title: 'Pricing', description: 'Simple, transparent pricing for teams of every size. Start free with 1,250 credits, upgrade when you need more.' },
  { path: '/features', title: 'Features', description: 'Everything you need to deploy, manage, and scale your AI agent workforce — agents, tasks, chat, goals, workspace, and meetings.' },
  { path: '/features/agents', title: 'AI Agents', description: 'Create intelligent agents with unique personalities, skills, and autonomous heartbeat-driven behavior.' },
  { path: '/features/tasks', title: 'Task Management', description: 'Assign tasks to agents with priorities, deadlines, and automated sprint cycles.' },
  { path: '/features/team-chat', title: 'Team Chat', description: 'Real-time messaging between humans and AI agents in shared channels.' },
  { path: '/features/goals', title: 'Goals & OKRs', description: 'Set team goals and let AI agents track progress automatically.' },
  { path: '/features/workspace', title: 'Workspace', description: 'A unified workspace with chat, tasks, files, and data tables side by side.' },
  { path: '/features/meetings', title: 'Voice Meetings', description: 'Hold voice meetings with your AI agents using real-time text-to-speech.' },
  { path: '/contact', title: 'Contact Us', description: 'Get in touch with the YokeBot team for questions, partnerships, or support.' },
  { path: '/terms', title: 'Terms of Service', description: 'Terms and conditions for using the YokeBot platform.' },
  { path: '/privacy', title: 'Privacy Policy', description: 'How YokeBot collects, uses, and protects your data.' },
]

/** Replace meta tags in the HTML template with page-specific values. */
function injectMeta(html: string, page: { path: string; title: string; description: string }): string {
  const fullTitle = page.path === '/' ? page.title : `${page.title} — ${SITE_NAME}`
  const fullUrl = `${SITE_URL}${page.path}`
  const desc = page.description.replace(/"/g, '&quot;')

  return html
    .replace(/<title>.*?<\/title>/, `<title>${fullTitle}</title>`)
    .replace(/(<meta\s+name="description"\s+content=").*?"/, `$1${desc}"`)
    .replace(/(<meta\s+property="og:title"\s+content=").*?"/, `$1${fullTitle}"`)
    .replace(/(<meta\s+property="og:description"\s+content=").*?"/, `$1${desc}"`)
    .replace(/(<meta\s+property="og:url"\s+content=").*?"/, `$1${fullUrl}"`)
    .replace(/(<meta\s+name="twitter:title"\s+content=").*?"/, `$1${fullTitle}"`)
    .replace(/(<meta\s+name="twitter:description"\s+content=").*?"/, `$1${desc}"`)
    .replace(/(<link\s+rel="canonical"\s+href=").*?"/, `$1${fullUrl}"`)
}

/** Inject pre-rendered HTML inside <div id="root">. React replaces it on hydration. */
function injectContent(html: string, contentHtml: string): string {
  return html.replace(
    '<div id="root"></div>',
    `<div id="root"><div class="ssg-shell">${contentHtml}</div></div>`,
  )
}

function writePage(route: string, html: string): void {
  const outDir = route === '/' ? DIST : join(DIST, route.slice(1))
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'index.html'), html)
}

/**
 * Wrapper component that calls content() inside React's render context.
 * This ensures hooks (useState in CodeBlock) have an active dispatcher.
 */
function ContentRenderer({ contentFn, title, description }: {
  contentFn: () => unknown; title: string; description: string
}) {
  return createElement('div', null,
    createElement('h1', null, title),
    createElement('p', null, description),
    contentFn(),
  )
}

async function main() {
  const template = readFileSync(join(DIST, 'index.html'), 'utf-8')
  let rendered = 0

  // ── Docs pages: full content pre-render ──────────────────────────────────
  for (const [slug, doc] of Object.entries(docsContent)) {
    const path = `/docs/${slug}`
    let pageHtml = injectMeta(template, { path, title: doc.title, description: doc.description })

    try {
      const contentHtml = renderToString(
        createElement(ContentRenderer, {
          contentFn: doc.content,
          title: doc.title,
          description: doc.description,
        }),
      )
      pageHtml = injectContent(pageHtml, contentHtml)
    } catch (e) {
      console.log(`  ⚠ Content render failed for ${slug}: ${(e as Error).message}`)
    }

    writePage(path, pageHtml)
    rendered++
    console.log(`  ✓ ${path}`)
  }

  // /docs index → renders getting-started content
  const gs = docsContent['getting-started']
  if (gs) {
    let indexHtml = injectMeta(template, { path: '/docs', title: 'Documentation', description: gs.description })
    try {
      const contentHtml = renderToString(
        createElement(ContentRenderer, {
          contentFn: gs.content,
          title: 'Documentation',
          description: gs.description,
        }),
      )
      indexHtml = injectContent(indexHtml, contentHtml)
    } catch { /* meta-only fallback */ }
    writePage('/docs', indexHtml)
    rendered++
    console.log(`  ✓ /docs`)
  }

  // ── Marketing pages: meta tags ───────────────────────────────────────────
  for (const page of marketingPages) {
    const pageHtml = injectMeta(template, page)
    writePage(page.path, pageHtml)
    rendered++
    console.log(`  ✓ ${page.path} (meta)`)
  }

  console.log(`\nPre-rendered ${rendered} pages.`)
}

main().catch((err) => {
  console.error('SSG failed:', err)
  // Don't fail the build — graceful fallback to client-side rendering
  process.exit(0)
})

/**
 * Post-build prerender script.
 * Spins up a static server for dist/, visits each public route with Playwright,
 * and writes the fully-rendered HTML back to dist/ so crawlers get real content.
 * Skips gracefully if Playwright browsers aren't installed (e.g. on Vercel).
 */
let chromium: typeof import('@playwright/test')['chromium']
try {
  chromium = (await import('@playwright/test')).chromium
  // Quick check that the browser binary exists
  await chromium.launch({ headless: true }).then(b => b.close())
} catch {
  console.log('Prerender skipped: Playwright browsers not available (CI/Vercel). SEO pages will use client-side rendering.')
  process.exit(0)
}
import { createServer } from 'http'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'

const DIST = join(import.meta.dirname, '..', 'dist')
const PORT = 4173

const routes = [
  '/',
  '/pricing',
  '/features',
  '/features/agents',
  '/features/tasks',
  '/features/team-chat',
  '/features/goals',
  '/features/workspace',
  '/features/meetings',
  '/contact',
  '/terms',
  '/privacy',
  '/docs',
]

async function serve(): Promise<ReturnType<typeof createServer>> {
  const { handler } = await import('serve-handler' as string)
  const server = createServer((req, res) => {
    handler(req, res, {
      public: DIST,
      rewrites: [{ source: '**', destination: '/index.html' }],
    })
  })
  return new Promise((resolve) => {
    server.listen(PORT, () => {
      console.log(`Static server on http://localhost:${PORT}`)
      resolve(server)
    })
  })
}

async function main() {
  // Use a simple static file server
  const indexHtml = readFileSync(join(DIST, 'index.html'), 'utf-8')

  // Start a basic server that serves dist/ with SPA fallback
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
    let filePath = join(DIST, url.pathname)

    // Check if file exists, otherwise serve index.html (SPA fallback)
    if (!existsSync(filePath) || !filePath.includes('.')) {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(indexHtml)
      return
    }

    const ext = filePath.split('.').pop()
    const mimeTypes: Record<string, string> = {
      html: 'text/html', js: 'application/javascript', css: 'text/css',
      png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml',
      json: 'application/json', woff2: 'font/woff2', woff: 'font/woff',
    }
    const contentType = mimeTypes[ext ?? ''] ?? 'application/octet-stream'
    try {
      const content = readFileSync(filePath)
      res.writeHead(200, { 'Content-Type': contentType })
      res.end(content)
    } catch {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(indexHtml)
    }
  })

  await new Promise<void>((resolve) => server.listen(PORT, resolve))
  console.log(`Static server on http://localhost:${PORT}`)

  const browser = await chromium.launch()
  const context = await browser.newContext()

  let rendered = 0
  for (const route of routes) {
    const page = await context.newPage()
    await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'networkidle' })
    // Wait a bit for React to fully render
    await page.waitForTimeout(1500)

    const html = await page.content()
    await page.close()

    // Write rendered HTML to the correct path in dist/
    const outDir = route === '/' ? DIST : join(DIST, route)
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
    const outPath = join(outDir, 'index.html')
    writeFileSync(outPath, html)
    rendered++
    console.log(`  ✓ ${route} → ${outPath.replace(DIST, 'dist')}`)
  }

  await browser.close()
  server.close()
  console.log(`\nPrerendered ${rendered} routes.`)
}

main().catch((err) => {
  console.error('Prerender failed:', err)
  process.exit(1)
})

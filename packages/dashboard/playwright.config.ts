import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: 'https://yokebot.com',
    screenshot: 'on',            // Screenshot after every test
    video: 'on',                 // Record video of every test
    trace: 'on-first-retry',
    viewport: { width: 1440, height: 900 },
  },
  outputDir: './e2e/results',
  reporter: [['list'], ['html', { outputFolder: './e2e/report', open: 'never' }]],
})

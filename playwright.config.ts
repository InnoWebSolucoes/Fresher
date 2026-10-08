import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5196',
    // The suites assert English labels; the app defaults to Portuguese (e2e/pt.spec.ts covers it).
    storageState: { cookies: [], origins: [{ origin: 'http://localhost:5196', localStorage: [{ name: 'ib-lang', value: 'en' }] }] },
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5196',
    reuseExistingServer: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
})

import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

/** Every static page path from the route registry (no :params). */
const registry = readFileSync(new URL('../src/app/routeRegistry.ts', import.meta.url), 'utf8')
const PATHS = [...registry.matchAll(/p\('[^']+', '([^']+)'/g)].map((m) => m[1]).filter((p) => !p.includes(':'))

async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill('owner@demo.app')
  await page.getByLabel('Password', { exact: true }).fill('demo1234')
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 })
}

test('every page renders without crashing or placeholders', async ({ page }) => {
  test.setTimeout(300_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`))
  await login(page)
  for (const path of PATHS) {
    // Client-side navigation (a full reload would re-read IndexedDB every time).
    await page.evaluate((to) => {
      window.history.pushState({}, '', to)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }, path)
    await page.waitForTimeout(250)
    await expect(page.getByTestId('error-page'), path).toHaveCount(0)
    await expect(page.getByTestId('stub-page'), path).toHaveCount(0)
  }
  expect(errors).toEqual([])
})

test('every left-menu link opens its page', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  for (const id of ['sales', 'clients', 'catalog', 'online', 'marketing', 'team']) {
    await page.getByTestId('rail-home').click()
    await page.getByTestId(`rail-${id}`).click()
    const count = await page.getByTestId('section-flyout').getByRole('link').count()
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      await page.getByTestId('rail-home').click()
      await page.getByTestId(`rail-${id}`).click()
      await page.getByTestId('section-flyout').getByRole('link').nth(i).click()
      await expect(page.getByTestId('error-page')).toHaveCount(0)
      await expect(page.locator('main h1, h1').first()).toBeVisible({ timeout: 15_000 })
    }
  }
})

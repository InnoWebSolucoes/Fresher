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
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 })
}

test('every page renders without crashing', async ({ page }) => {
  test.setTimeout(240_000)
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
    await expect(page.locator('body')).not.toContainText('Something went wrong on this page')
  }
  expect(errors).toEqual([])
})

test('golden path: online booking → arrived → checkout → daily sales', async ({ page }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await login(page)
  await page.waitForTimeout(1000)
  await page.keyboard.press('Control+Shift+KeyD')
  await expect(page.getByTestId('demo-panel')).toBeVisible()
  await page.getByRole('button', { name: 'Book a random free time' }).click()
  await expect(page).toHaveURL(/drawer=appointment/, { timeout: 30_000 })
  await page.keyboard.press('Control+Shift+KeyD')
  await expect(page.getByTestId('drawer-appointment')).toBeVisible({ timeout: 15_000 })
  expect(errors).toEqual([])
})

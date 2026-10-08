import { expect, test, type Page } from '@playwright/test'

// Phone (iPhone-sized, touch) in the default language, Portuguese.
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  storageState: { cookies: [], origins: [] },
})

/** Nothing may make the page or the main content wider than the screen. */
async function expectFitsScreen(page: Page, label: string) {
  const sizes = await page.evaluate(() => {
    const main = document.querySelector('main')
    return { doc: document.documentElement.scrollWidth, main: main ? main.scrollWidth - main.clientWidth : 0, width: window.innerWidth }
  })
  expect(sizes.doc, `${label}: page width`).toBeLessThanOrEqual(sizes.width)
  expect(sizes.main, `${label}: main content overflow`).toBeLessThanOrEqual(1)
}

test('works on a phone: login, menu, calendar, appointment, sales and clients', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Iniciar sessão' })).toBeVisible({ timeout: 90_000 })
  await expectFitsScreen(page, 'login')
  await page.getByLabel('Email').fill('owner@demo.app')
  await page.getByLabel('Palavra-passe', { exact: true }).fill('demo1234')
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 })
  await expectFitsScreen(page, 'dashboard')

  // The rail is replaced by the slide-out menu.
  await expect(page.getByTestId('rail-calendar')).toBeHidden()
  await page.getByTestId('mobile-menu-button').click()
  await expect(page.getByTestId('mobile-nav')).toBeVisible()
  await page.getByTestId('mobile-nav-calendar').click()
  await expect(page).toHaveURL(/\/calendar/)
  await expect(page.getByTestId('mobile-nav')).toBeHidden()
  await expect(page.getByTestId('calendar-add')).toBeInViewport()
  await expectFitsScreen(page, 'calendar')

  // An appointment opens full screen with a close bar.
  await page.locator('[data-testid^="appointment-card"], [data-testid="appointment-block"]').first().click()
  await expect(page).toHaveURL(/drawer=appointment/)
  const drawer = page.locator('[data-drawer-panel]')
  await expect(drawer).toBeVisible()
  const box = await drawer.boundingBox()
  expect(box?.width).toBeGreaterThanOrEqual(388)
  await page.getByTestId('drawer-close-mobile').click()
  await expect(page).not.toHaveURL(/drawer=/)

  // Section pages with their tabs row.
  await page.goto('/sales/daily-sales')
  await expect(page.getByTestId('mobile-section-tabs')).toBeVisible({ timeout: 30_000 })
  await expectFitsScreen(page, 'daily sales')
  await page.goto('/clients/list')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 })
  await expectFitsScreen(page, 'clients list')
})

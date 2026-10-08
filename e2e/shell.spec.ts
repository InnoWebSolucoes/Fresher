import { expect, test } from '@playwright/test'

test('owner logs in and walks every main-menu item', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('owner@demo.app')
  await page.getByLabel('Password', { exact: true }).fill('demo1234')
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/dashboard/)

  for (const [id, path] of [['home', /\/dashboard/], ['calendar', /\/calendar/], ['reports', /\/reports/], ['addons', /\/add-ons/], ['settings', /\/setup/]] as const) {
    await page.getByTestId(`rail-${id}`).click()
    await expect(page).toHaveURL(path)
    await expect(page.getByTestId('error-page')).toHaveCount(0)
  }
  for (const id of ['sales', 'clients', 'catalog', 'online', 'marketing', 'team']) {
    await page.getByTestId('rail-home').click()
    await expect(page).toHaveURL(/\/dashboard/)
    await page.getByTestId(`rail-${id}`).click()
    const links = page.getByTestId('section-flyout').getByRole('link')
    const count = await links.count()
    expect(count).toBeGreaterThan(0)
    await links.first().click()
    await expect(page.getByTestId('section-panel')).toBeVisible()
  }
})

test('front-desk staff cannot open Settings', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('staff@demo.app')
  await page.getByLabel('Password', { exact: true }).fill('demo1234')
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/calendar/)
  await expect(page.getByTestId('rail-settings')).toHaveCount(0)
  await page.goto('/setup')
  await expect(page.getByTestId('forbidden')).toBeVisible()
})

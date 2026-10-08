import { expect, test } from '@playwright/test'

// No stored language: the app must open in Portuguese.
test.use({ storageState: { cookies: [], origins: [] } })

test('opens in Portuguese and switches to English and back', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Iniciar sessão' })).toBeVisible({ timeout: 90_000 })
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-PT')

  // Switching on the login screen.
  await page.getByTestId('language-en').click()
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible()
  await page.getByTestId('language-pt').click()

  await page.getByLabel('Email').fill('owner@demo.app')
  await page.getByLabel('Palavra-passe', { exact: true }).fill('demo1234')
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 })

  await page.goto('/sales/daily-sales')
  await expect(page.getByRole('heading', { name: 'Vendas diárias' })).toBeVisible({ timeout: 30_000 })
  // Portuguese money format with the symbol after the amount.
  await expect(page.getByText(/\d+,\d{2}\u00a0€/).first()).toBeVisible()

  // The top-bar toggle switches the whole page and is remembered after a reload.
  await page.getByTestId('language-toggle').getByTestId('language-en').click()
  await expect(page.getByRole('heading', { name: 'Daily sales' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-IE')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Daily sales' })).toBeVisible({ timeout: 30_000 })

  await page.getByTestId('language-pt').click()
  await expect(page.getByRole('heading', { name: 'Vendas diárias' })).toBeVisible()
})

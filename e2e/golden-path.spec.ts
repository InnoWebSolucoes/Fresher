import { expect, test, type Page } from '@playwright/test'

/**
 * SPEC §9 phase 6 golden path: a simulated online booking appears in the
 * calendar → client marked Arrived → checked out → the sale shows in Daily
 * sales, Sales and Reports → the client's profile is updated.
 */

async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill('owner@demo.app')
  await page.getByLabel('Password', { exact: true }).fill('demo1234')
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 })
  await page.waitForTimeout(1000)
}

/** Client-side navigation (a full reload re-reads IndexedDB). */
async function go(page: Page, to: string) {
  await page.evaluate((path) => {
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, to)
  await page.waitForTimeout(600)
}

/** Read the persisted demo data straight from IndexedDB. */
async function readDb(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ appointments: { id: string; clientId: string | null; status: string; saleId?: string }[]; sales: { id: string; number: number; clientId: string | null; status: string }[] }>((resolve) => {
        const req = indexedDB.open('keyval-store')
        req.onsuccess = () => {
          const get = req.result.transaction('keyval').objectStore('keyval').get('ib-db')
          get.onsuccess = () => resolve(JSON.parse(get.result).state)
        }
      }),
  )
}

test('online booking → arrived → checkout → sales, reports and client profile', async ({ page }) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const started = Date.now()
  await login(page)

  // 1. A client books online (presenter panel).
  await page.keyboard.press('Control+Shift+KeyD')
  await expect(page.getByTestId('demo-panel')).toBeVisible()
  await page.getByRole('button', { name: 'Book a random free time' }).click()
  await expect(page).toHaveURL(/drawer=appointment&id=/, { timeout: 30_000 })
  const appointmentUrl = new URL(page.url())
  const appointmentId = appointmentUrl.searchParams.get('id')!
  await page.keyboard.press('Control+Shift+KeyD')
  await expect(page.getByTestId('demo-panel')).toBeHidden()

  // 2. It is in the calendar with a notification.
  await expect(page.getByTestId('drawer-appointment')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('notifications-badge')).toBeVisible()

  // 3. Front desk marks the client as arrived.
  await page.getByTestId('status-menu').click()
  await page.getByRole('menuitem', { name: 'Arrived' }).click()
  await expect.poll(async () => (await readDb(page)).appointments.find((a) => a.id === appointmentId)?.status, { timeout: 15_000 }).toBe('arrived')
  if (!(await page.getByTestId('drawer-appointment').isVisible())) await go(page, `${appointmentUrl.pathname}${appointmentUrl.search}`)

  // 4. Checkout: tip step → cash → pay now.
  await page.getByTestId('appointment-checkout').click()
  await expect(page.getByTestId('drawer-checkout')).toBeVisible({ timeout: 20_000 })
  const toPayment = page.getByTestId('continue-to-payment')
  if (await toPayment.isVisible()) await toPayment.click()
  await page.getByTestId('pay-cash').click()
  await page.getByTestId('cash-add').click()
  await page.getByTestId('pay-now').click()
  await expect(page.getByTestId('sale-drawer')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('sale-status')).toContainText('Completed')

  const data = await readDb(page)
  const appt = data.appointments.find((a) => a.id === appointmentId)!
  expect(appt.status).toBe('completed')
  const sale = data.sales.find((s) => s.id === appt.saleId)!
  expect(sale.status).toBe('completed')

  // 5. The sale shows in Daily sales, the Sales list and the Sales list report.
  await go(page, '/sales/daily-sales')
  await expect(page.getByText('Transaction summary')).toBeVisible()
  await go(page, '/sales/sales-list')
  await expect(page.getByRole('main').getByText(String(sale.number), { exact: true }).first()).toBeVisible({ timeout: 15_000 })
  await go(page, '/reports/table/sales-list')
  await expect(page.getByRole('main').getByText(String(sale.number), { exact: true }).first()).toBeVisible({ timeout: 20_000 })

  // 6. The client's profile shows the sale.
  await go(page, `/clients/list?drawer=client&id=${appt.clientId}&tab=sales`)
  await expect(page.getByTestId('drawer-client')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('drawer-client').getByText(new RegExp(`#?${sale.number}\\b`)).first()).toBeVisible()

  expect(errors).toEqual([])
  // SPEC §10: the golden path runs in under 3 minutes.
  expect(Date.now() - started).toBeLessThan(180_000)
})

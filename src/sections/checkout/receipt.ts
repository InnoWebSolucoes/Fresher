import { parseISO } from 'date-fns'
import i18n from 'i18next'
import { format } from '@/lib/dates'
import { computeTotals, lineTotal, saleBalance } from '@/api/sales'
import { db } from '@/store/db'
import { downloadBlob } from '@/lib/export'
import { fullName, money2 } from '@/lib/format'
import type { ID } from '@/types'

/**
 * Everything printed on a sale receipt (screenshots/files/sale-1-receipt.pdf).
 * Labels are translated when the receipt is built: the English receipt matches
 * the captured file, a Portuguese one is fully in Portuguese.
 */
export interface ReceiptData {
  business: string
  /** Address and the custom lines from Settings › Sales › Receipts, under the business name. */
  businessLines: string[]
  title: string
  date: string
  client?: { name: string; email: string; lines: string[] }
  items: { name: string; sub?: string; amount: string }[]
  rows: { label: string; amount: string }[]
  total: string
  tips?: string
  payments: { label: string; amount: string; at: string }[]
  change?: string
  balance: string
  note?: string
  footer?: string
  /** Fixed labels of the receipt layout, in the language it was built in. */
  labels: { client: string; total: string; tips: string; change: string; balance: string; comment: string }
}

const longDate = (iso: string) => i18n.t('calendar.update.when', { date: format(parseISO(iso), 'EEEE, d MMM yyyy'), time: format(parseISO(iso), 'HH:mm') })

export function receiptData(saleId: ID): ReceiptData | undefined {
  const data = db()
  const sale = data.sales.find((s) => s.id === saleId)
  if (!sale) return undefined
  const client = data.clients.find((c) => c.id === sale.clientId)
  const totals = computeTotals(sale)
  const payments = data.payments.filter((p) => sale.paymentIds.includes(p.id) && p.status === 'succeeded')
  const change = payments.reduce((s, p) => s + (p.change ?? 0), 0)
  const settings = data.settings.receipts
  const location = data.locations.find((l) => l.id === sale.locationId)
  // Per-location receipt details (Settings › Location › Sales › Receipt details).
  const locationReceipt = (data.settings.extras?.['biz.locationExtras'] as Record<ID, { receipt?: { source: 'billing' | 'location' | 'custom'; companyName: string; address: string; note: string } }> | undefined)?.[sale.locationId]?.receipt
  const billing = data.workspace.plan.billingDetails
  const business =
    locationReceipt?.source === 'custom' && locationReceipt.companyName
      ? locationReceipt.companyName
      : locationReceipt?.source === 'billing' && billing?.businessName
        ? billing.businessName
        : data.workspace.name
  const address =
    locationReceipt?.source === 'custom' && locationReceipt.address
      ? locationReceipt.address
      : locationReceipt?.source === 'billing' && billing?.address
        ? billing.address
        : location
          ? `${location.address.line1}, ${location.address.postcode} ${location.address.city}`
          : ''
  const businessLines = [address, billing?.vatNumber && locationReceipt?.source === 'billing' ? `NIF ${billing.vatNumber}` : '', settings.line1, settings.line2].filter(Boolean)
  const prefix = location?.receiptPrefix && location.receiptPrefix !== '-' ? `${location.receiptPrefix}-` : ''
  const memberName = (id: ID | null) => {
    const m = data.teamMembers.find((x) => x.id === id)
    return m ? `${m.firstName} ${m.lastName}` : ''
  }
  const items = sale.items.map((item) => {
    const appt = item.appointmentId ? data.appointments.find((a) => a.id === item.appointmentId) : undefined
    const apptItem = appt?.items.find((i) => i.id === item.appointmentItemId)
    const card = item.giftCardId ? data.giftCards.find((g) => g.id === item.giftCardId) : undefined
    const team = settings.showTeam && item.teamMemberId ? i18n.t('checkout.receipt.with', { name: memberName(item.teamMemberId) }) : ''
    const sub = [apptItem && appt ? `${apptItem.start}, ${format(parseISO(appt.date), 'd MMM yyyy')}` : card ? card.code : item.detail, team, item.benefitNote].filter(Boolean).join(' • ') || undefined
    const name = card ? `${money2(card.value)} - ${item.name}` : item.name
    return { name: item.quantity > 1 ? `${name} × ${item.quantity}` : name, sub, amount: money2(lineTotal(item)) }
  })
  const rows: ReceiptData['rows'] = []
  if (totals.cartDiscount) rows.push({ label: i18n.t('checkout.totals.cartDiscount'), amount: `-${money2(totals.cartDiscount)}` })
  rows.push({ label: i18n.t('checkout.totals.subtotal'), amount: money2(totals.subtotal) })
  for (const c of sale.serviceCharges) rows.push({ label: c.name, amount: money2(c.amount) })
  if (totals.tax) rows.push({ label: data.workspace.taxCalculation === 'exclusive' ? i18n.t('checkout.receipt.tax') : i18n.t('checkout.receipt.ofWhichTax'), amount: money2(totals.tax) })
  const clientLines = client
    ? [
        settings.showContact ? client.phone : '',
        settings.showAddress && client.addresses[0] ? `${client.addresses[0].line1}, ${client.addresses[0].postcode} ${client.addresses[0].city}` : '',
      ].filter(Boolean)
    : []
  return {
    business,
    businessLines,
    title: `${sale.kind === 'refund' ? i18n.t('checkout.sale.refundTitle') : settings.title || i18n.t('checkout.sale.title')} ${prefix}${sale.number}`,
    date: longDate(sale.completedAt ?? sale.createdAt),
    client: client ? { name: fullName(client), email: settings.showContact ? client.email : '', lines: clientLines } : undefined,
    items,
    rows,
    total: money2(totals.total),
    tips: totals.tips ? money2(totals.tips) : undefined,
    payments: payments.map((p) => ({ label: i18n.t(p.kind === 'refund' ? 'checkout.receipt.refundWith' : 'checkout.receipt.paymentWith', { method: p.methodLabel }), amount: money2(p.amount + (p.change ?? 0)), at: longDate(p.at) })),
    change: change ? money2(change) : undefined,
    balance: money2(sale.status === 'voided' || sale.kind === 'refund' ? 0 : Math.max(0, saleBalance(sale))),
    note: [sale.receiptNote, locationReceipt?.note].filter(Boolean).join('\n') || undefined,
    footer: settings.footer || undefined,
    labels: {
      client: i18n.t('checkout.receipt.client'),
      total: i18n.t('checkout.totals.total'),
      tips: i18n.t('checkout.sale.tips'),
      change: i18n.t('checkout.sale.change'),
      balance: i18n.t('checkout.sale.balance'),
      comment: i18n.t('checkout.sale.receiptComment'),
    },
  }
}

/** PDF laid out like the captured receipt (screenshots/files/sale-1-receipt.pdf: US Letter, 612 × 792 pt). */
export async function buildReceiptPdf(r: ReceiptData): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const left = 36
  const right = 576
  const center = 306
  const grey = () => doc.setTextColor(110)
  const ink = () => doc.setTextColor(13)
  const small = (text: string, x: number, y: number, align: 'left' | 'center' = 'left') => {
    doc.setFontSize(7.5)
    grey()
    doc.text(text, x, y, { align })
    ink()
    doc.setFontSize(10)
  }
  const rule = (y: number) => {
    doc.setDrawColor(200)
    doc.setLineWidth(0.8)
    doc.line(left, y, right, y)
  }
  const row = (label: string, amount: string, y: number) => {
    doc.text(label, left + 1, y)
    doc.text(amount, right, y, { align: 'right' })
  }
  ink()
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(r.business, center, 80, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  r.businessLines.forEach((line, i) => small(line, center, 92 + i * 10, 'center'))
  const titleY = 113 + Math.max(0, r.businessLines.length * 10 - 10)
  doc.setFont('helvetica', 'bold')
  doc.text(r.title, center, titleY, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.text(r.date, center, titleY + 13, { align: 'center' })

  let y = titleY + 37
  if (r.client) {
    doc.text(r.labels.client, left + 5, y)
    rule(y + 9)
    doc.text(r.client.name, left + 5, y + 23)
    const details = [r.client.email, ...r.client.lines].filter(Boolean)
    details.forEach((line, i) => small(line, left + 5, y + 36 + i * 10))
    y += 64 + Math.max(0, details.length - 1) * 10
  }
  rule(y)
  r.items.forEach((item, i) => {
    const text = y + 16
    doc.text(String(i + 1), left, text)
    doc.text(item.name, left + 40, text, { maxWidth: 400 })
    doc.text(item.amount, right, text, { align: 'right' })
    if (item.sub) small(item.sub, left + 40, text + 10)
    y = text + 23
    rule(y)
  })
  for (const line of [...r.rows, { label: r.labels.total, amount: r.total }]) {
    const text = y + 17
    row(line.label, line.amount, text)
    y = text + 16
    rule(y)
  }
  y += 20
  if (r.tips) {
    row(r.labels.tips, r.tips, y)
    y += 20
  }
  for (const p of r.payments) {
    row(p.label, p.amount, y)
    small(p.at, 274, y + 15, 'center')
    y += 34
  }
  rule(y)
  y += 16
  if (r.change) {
    row(r.labels.change, r.change, y)
    y += 14
  }
  doc.setFontSize(13)
  row(r.labels.balance, r.balance, y + (r.change ? 0 : 2))
  doc.setFontSize(10)
  y += 34
  if (r.note) {
    doc.setFont('helvetica', 'bold')
    doc.text(r.labels.comment, left + 1, y)
    doc.setFont('helvetica', 'normal')
    doc.text(r.note, left + 1, y + 14, { maxWidth: right - left })
    y += 44
  }
  if (r.footer) {
    grey()
    doc.setFontSize(9)
    doc.text(r.footer, center, y + 10, { align: 'center', maxWidth: right - left })
  }
  return doc.output('blob')
}

/** Download PDF → invoice_<saleId>.pdf */
export async function downloadReceipt(saleId: ID): Promise<void> {
  const r = receiptData(saleId)
  if (!r) return
  downloadBlob(await buildReceiptPdf(r), `invoice_${saleId}.pdf`)
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] ?? ch)

/** Print-friendly receipt in a new window (same layout as the PDF). */
export function receiptHtml(r: ReceiptData): string {
  const row = (label: string, amount: string, cls = '') => `<div class="row ${cls}"><span>${esc(label)}</span><span>${esc(amount)}</span></div>`
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.title)}</title><style>
  body{font-family:Helvetica,Arial,sans-serif;color:#0d0d0d;font-size:13px;max-width:720px;margin:48px auto;padding:0 24px}
  h1{font-size:13px;text-align:center;margin:0 0 36px}.head{text-align:center;margin-bottom:24px}.head b{display:block}
  .rule{border-top:1px solid #c8c8c8;margin:10px 0}.row{display:flex;justify-content:space-between;padding:6px 0}
  .muted{color:#6e6e6e;font-size:10px}.item{display:flex;gap:40px;padding:8px 0}.item .n{width:14px}.item .name{flex:1}
  .balance{font-size:17px}.center{text-align:center}@media print{body{margin:24px auto}}
  </style></head><body>
  <h1>${esc(r.business)}${r.businessLines.map((l) => `<div class="muted" style="font-weight:400">${esc(l)}</div>`).join('')}</h1>
  <div class="head"><b>${esc(r.title)}</b>${esc(r.date)}</div>
  ${r.client ? `<div style="padding-left:6px">${esc(r.labels.client)}</div><div class="rule"></div><div style="padding-left:6px">${esc(r.client.name)}${[r.client.email, ...r.client.lines].filter(Boolean).map((l) => `<div class="muted">${esc(l)}</div>`).join('')}</div><br>` : ''}
  <div class="rule"></div>
  ${r.items.map((it, i) => `<div class="item"><span class="n">${i + 1}</span><span class="name">${esc(it.name)}${it.sub ? `<div class="muted">${esc(it.sub)}</div>` : ''}</span><span>${esc(it.amount)}</span></div><div class="rule"></div>`).join('')}
  ${r.rows.map((x) => row(x.label, x.amount) + '<div class="rule"></div>').join('')}
  ${row(r.labels.total, r.total)}<div class="rule"></div>
  ${r.tips ? row(r.labels.tips, r.tips) : ''}
  ${r.payments.map((p) => row(p.label, p.amount) + `<div class="muted center">${esc(p.at)}</div>`).join('')}
  <div class="rule"></div>
  ${r.change ? row(r.labels.change, r.change) : ''}
  ${row(r.labels.balance, r.balance, 'balance')}
  ${r.note ? `<p><b>${esc(r.labels.comment)}</b><br>${esc(r.note)}</p>` : ''}
  ${r.footer ? `<p class="muted center">${esc(r.footer)}</p>` : ''}
  <script>window.onload=function(){window.print()}</script>
  </body></html>`
}

/** Open a print-friendly page in a new window. Returns false when the browser blocked the pop-up. */
export function printHtml(html: string): boolean {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  const win = window.open(url, '_blank', 'width=820,height=900')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return Boolean(win)
}

export function printReceipt(saleId: ID): boolean {
  const r = receiptData(saleId)
  return r ? printHtml(receiptHtml(r)) : false
}

import { format, parseISO } from 'date-fns'
import { computeTotals, lineTotal, saleBalance } from '@/api/sales'
import { db } from '@/store/db'
import { downloadBlob } from '@/lib/export'
import { fullName, money2 } from '@/lib/format'
import type { ID } from '@/types'

/** Everything printed on a sale receipt (screenshots/files/sale-1-receipt.pdf). */
export interface ReceiptData {
  business: string
  title: string
  date: string
  client?: { name: string; email: string }
  items: { name: string; sub?: string; amount: string }[]
  rows: { label: string; amount: string }[]
  total: string
  tips?: string
  payments: { label: string; amount: string; at: string }[]
  change?: string
  balance: string
  note?: string
  footer?: string
}

const longDate = (iso: string) => `${format(parseISO(iso), 'EEEE, d MMM yyyy')} at ${format(parseISO(iso), 'HH:mm')}`

export function receiptData(saleId: ID): ReceiptData | undefined {
  const data = db()
  const sale = data.sales.find((s) => s.id === saleId)
  if (!sale) return undefined
  const client = data.clients.find((c) => c.id === sale.clientId)
  const totals = computeTotals(sale)
  const payments = data.payments.filter((p) => sale.paymentIds.includes(p.id) && p.status === 'succeeded')
  const change = payments.reduce((s, p) => s + (p.change ?? 0), 0)
  const items = sale.items.map((item) => {
    const appt = item.appointmentId ? data.appointments.find((a) => a.id === item.appointmentId) : undefined
    const apptItem = appt?.items.find((i) => i.id === item.appointmentItemId)
    const card = item.giftCardId ? data.giftCards.find((g) => g.id === item.giftCardId) : undefined
    const sub = apptItem && appt ? `${apptItem.start}, ${format(parseISO(appt.date), 'd MMM yyyy')}` : card ? card.code : item.detail
    const name = card ? `${money2(card.value)} - ${item.name}` : item.name
    return { name: item.quantity > 1 ? `${name} × ${item.quantity}` : name, sub, amount: money2(lineTotal(item)) }
  })
  const rows: ReceiptData['rows'] = []
  if (totals.cartDiscount) rows.push({ label: 'Cart discount', amount: `-${money2(totals.cartDiscount)}` })
  rows.push({ label: 'Subtotal', amount: money2(totals.subtotal) })
  for (const c of sale.serviceCharges) rows.push({ label: c.name, amount: money2(c.amount) })
  return {
    business: data.workspace.name,
    title: `${sale.kind === 'refund' ? 'Refund' : 'Sale'} ${sale.number}`,
    date: longDate(sale.completedAt ?? sale.createdAt),
    client: client ? { name: fullName(client), email: client.email } : undefined,
    items,
    rows,
    total: money2(totals.total),
    tips: totals.tips ? money2(totals.tips) : undefined,
    payments: payments.map((p) => ({ label: `${p.kind === 'refund' ? 'Refund' : 'Payment'} with ${p.methodLabel}`, amount: money2(p.amount + (p.change ?? 0)), at: longDate(p.at) })),
    change: change ? money2(change) : undefined,
    balance: money2(sale.status === 'voided' || sale.kind === 'refund' ? 0 : Math.max(0, saleBalance(sale))),
    note: sale.receiptNote,
    footer: data.settings.receipts.footer || undefined,
  }
}

/** A4 PDF laid out like the captured receipt. */
export async function buildReceiptPdf(r: ReceiptData): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const left = 35
  const right = 551
  const grey = () => doc.setTextColor(110)
  const ink = () => doc.setTextColor(13)
  const rule = (y: number) => {
    doc.setDrawColor(200)
    doc.setLineWidth(0.8)
    doc.line(left, y, right, y)
  }
  const center = 595.28 / 2
  ink()
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(r.business, center, 78, { align: 'center' })
  doc.text(r.title, center, 110, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.text(r.date, center, 122, { align: 'center' })

  let y = 145
  if (r.client) {
    doc.text('Client', left + 5, y)
    rule(y + 8)
    doc.text(r.client.name, left + 5, y + 22)
    if (r.client.email) {
      doc.setFontSize(7.5)
      grey()
      doc.text(r.client.email, left + 5, y + 34)
      ink()
      doc.setFontSize(10)
    }
    y += 60
  }
  rule(y)
  y += 15
  r.items.forEach((item, i) => {
    doc.text(String(i + 1), left, y)
    doc.text(item.name, left + 38, y, { maxWidth: 380 })
    doc.text(item.amount, right, y, { align: 'right' })
    if (item.sub) {
      doc.setFontSize(7.5)
      grey()
      doc.text(item.sub, left + 38, y + 10)
      ink()
      doc.setFontSize(10)
    }
    y += 22
    rule(y)
    y += 16
  })
  for (const row of r.rows) {
    doc.text(row.label, left + 1, y)
    doc.text(row.amount, right, y, { align: 'right' })
    y += 15
    rule(y)
    y += 16
  }
  doc.text('Total', left + 1, y)
  doc.text(r.total, right, y, { align: 'right' })
  y += 15
  rule(y)
  y += 20
  if (r.tips) {
    doc.text('Tips', left + 1, y)
    doc.text(r.tips, right, y, { align: 'right' })
    y += 20
  }
  for (const p of r.payments) {
    doc.text(p.label, left + 1, y)
    doc.text(p.amount, right, y, { align: 'right' })
    doc.setFontSize(7.5)
    grey()
    doc.text(p.at, 262, y + 13, { align: 'center' })
    ink()
    doc.setFontSize(10)
    y += 32
  }
  rule(y)
  y += 16
  if (r.change) {
    doc.text('Change', left + 1, y)
    doc.text(r.change, right, y, { align: 'right' })
    y += 13
  }
  doc.setFontSize(13)
  doc.text('Balance', left + 1, y)
  doc.text(r.balance, right, y, { align: 'right' })
  doc.setFontSize(10)
  y += 30
  if (r.note) {
    doc.setFont('helvetica', 'bold')
    doc.text('Receipt comment', left + 1, y)
    doc.setFont('helvetica', 'normal')
    doc.text(r.note, left + 1, y + 14, { maxWidth: right - left })
    y += 40
  }
  if (r.footer) {
    grey()
    doc.setFontSize(9)
    doc.text(r.footer, center, y + 10, { align: 'center' })
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
  <h1>${esc(r.business)}</h1>
  <div class="head"><b>${esc(r.title)}</b>${esc(r.date)}</div>
  ${r.client ? `<div style="padding-left:6px">Client</div><div class="rule"></div><div style="padding-left:6px">${esc(r.client.name)}<div class="muted">${esc(r.client.email)}</div></div><br>` : ''}
  <div class="rule"></div>
  ${r.items.map((it, i) => `<div class="item"><span class="n">${i + 1}</span><span class="name">${esc(it.name)}${it.sub ? `<div class="muted">${esc(it.sub)}</div>` : ''}</span><span>${esc(it.amount)}</span></div><div class="rule"></div>`).join('')}
  ${r.rows.map((x) => row(x.label, x.amount) + '<div class="rule"></div>').join('')}
  ${row('Total', r.total)}<div class="rule"></div>
  ${r.tips ? row('Tips', r.tips) : ''}
  ${r.payments.map((p) => row(p.label, p.amount) + `<div class="muted center">${esc(p.at)}</div>`).join('')}
  <div class="rule"></div>
  ${r.change ? row('Change', r.change) : ''}
  ${row('Balance', r.balance, 'balance')}
  ${r.note ? `<p><b>Receipt comment</b><br>${esc(r.note)}</p>` : ''}
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

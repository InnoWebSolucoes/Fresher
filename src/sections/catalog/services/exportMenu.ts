import { format } from 'date-fns'
import type { Bundle, DbData, Service } from '@/types'
import { downloadBlob, exportCsv, exportXlsx, type Cell, type ExportTable } from '@/lib/export'
import { now } from '@/lib/time'
import { bundleDuration, bundlePrice, durationShort, numericId, totalExtra } from '../lib'

/**
 * Service menu export, matching
 * reference/screenshots/files/service-menu-export_service_list_2026-10-08.pdf:
 * landscape "Services List", "All time, all staff, generated …" and one row
 * per service, variant ("Haircut - Short hair") and bundle.
 */
const HEADERS = ['Service Name', 'Retail Price', 'Duration', 'Extra Time', 'Tax', 'Description', 'Category Name', 'Treatment Type', 'Resource', 'Online Booking', 'Available For', 'Voucher Sales', 'Commissions', 'Service ID', 'SKU']

type Data = Pick<DbData, 'services' | 'bundles' | 'serviceCategories' | 'settings'>

const euros = (n: number) => `€${n.toFixed(2)}`
const availableFor = (v: Service['availableFor']) => (v === 'female' ? 'Females only' : v === 'male' ? 'Males only' : 'Everyone')

export function serviceMenuRows(data: Data): Cell[][] {
  const category = (id: string) => data.serviceCategories.find((c) => c.id === id)?.name ?? ''
  const tax = (id: string | null) => (id ? (data.settings.taxRates.find((r) => r.id === id)?.name ?? 'No tax') : 'No tax')
  const catOrder = (id: string) => data.serviceCategories.find((c) => c.id === id)?.order ?? 99
  const rows: Cell[][] = []
  const services = data.services.filter((s) => !s.archived).sort((a, b) => catOrder(a.categoryId) - catOrder(b.categoryId) || a.order - b.order)
  const bundles = data.bundles.filter((b) => !b.archived)
  const serviceRow = (s: Service, name: string, price: number, duration: number, sku?: string): Cell[] => [
    name,
    euros(price),
    durationShort(duration),
    totalExtra(s.extraTime) ? durationShort(totalExtra(s.extraTime)) : '',
    tax(s.taxRateId),
    s.description,
    category(s.categoryId),
    s.treatmentType,
    s.resourceTypeIds.length ? 'Required' : 'Not required',
    s.onlineBooking ? 'Enabled' : 'Disabled',
    availableFor(s.availableFor),
    'Enabled',
    s.commissionEnabled ? 'Enabled' : 'Disabled',
    numericId(s.id),
    sku ?? s.sku ?? '',
  ]
  const bundleRow = (b: Bundle): Cell[] => [b.name, euros(bundlePrice(b, data.services)), durationShort(bundleDuration(b, data.services)), '', 'Inherited from services', b.description, category(b.categoryId), 'Inherited from services', '', b.onlineBooking ? 'Enabled' : 'Disabled', availableFor(b.availableFor), 'Disabled', '', '', '']
  ;[...new Set([...data.serviceCategories].sort((a, b) => a.order - b.order).map((c) => c.id))].forEach((cid) => {
    bundles.filter((b) => b.categoryId === cid).forEach((b) => rows.push(bundleRow(b)))
    services
      .filter((s) => s.categoryId === cid)
      .forEach((s) => {
        s.variants.forEach((v) => rows.push(serviceRow(s, `${s.name} - ${v.name}`, v.price, v.durationMin, v.sku)))
        rows.push(serviceRow(s, s.name, s.price, s.durationMin))
      })
  })
  return rows
}

const fileName = () => `service_list_${format(now(), 'yyyy-MM-dd')}`

export function exportServiceMenu(kind: 'csv' | 'xlsx', data: Data): Promise<void> | void {
  const table: ExportTable = { headers: HEADERS, rows: serviceMenuRows(data) }
  if (kind === 'csv') return exportCsv(fileName(), [table])
  return exportXlsx(fileName(), [table])
}

/** Landscape PDF in the captured layout (plain table, grey header text). */
export async function exportServiceMenuPdf(data: Data): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(20)
  doc.setTextColor(20)
  doc.text('Services List', 24, 44)
  doc.setFontSize(7.5)
  doc.text(`All time, all staff, generated ${format(now(), "EEEE, d MMM yyyy 'at' HH:mm")}`, 24, 72)
  autoTable(doc, {
    startY: 92,
    head: [HEADERS],
    body: serviceMenuRows(data).map((r) => r.map((c) => String(c ?? ''))),
    theme: 'plain',
    styles: { fontSize: 6.5, cellPadding: { top: 4, bottom: 4, left: 5, right: 5 }, textColor: [100, 100, 100], overflow: 'linebreak' },
    headStyles: { fontStyle: 'bold', textColor: [100, 100, 100], lineWidth: { bottom: 0.5 }, lineColor: [200, 200, 200] },
    columnStyles: { 1: { halign: 'right' }, 5: { cellWidth: 220 } },
    margin: { left: 24, right: 24 },
  })
  downloadBlob(doc.output('blob'), `${fileName()}.pdf`)
}

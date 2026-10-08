import i18n from 'i18next'
import { format } from '@/lib/dates'
import type { Bundle, DbData, Service } from '@/types'
import { downloadBlob, exportCsv, exportXlsx, type Cell, type ExportTable } from '@/lib/export'
import { money2 } from '@/lib/format'
import { now } from '@/lib/time'
import { isOffMenu } from '@/api/catalog'
import { bundleBasePrice, bundleDuration, durationShort, numericId, totalExtra, treatmentLabel } from '../lib'

/**
 * Service menu export, matching
 * reference/screenshots/files/service-menu-export_service_list_2026-10-08.pdf:
 * landscape "Services List", "All time, all staff, generated …" and one row
 * per service, variant ("Haircut - Short hair") and bundle.
 * Text is written in the current language (English output is the captured one).
 */
const HEADER_KEYS = ['serviceName', 'retailPrice', 'duration', 'extraTime', 'tax', 'description', 'categoryName', 'treatmentType', 'resource', 'onlineBooking', 'availableFor', 'voucherSales', 'commissions', 'serviceId', 'sku'] as const
const headers = () => HEADER_KEYS.map((key) => i18n.t(`catalog.export.headers.${key}`))

type Data = Pick<DbData, 'services' | 'bundles' | 'serviceCategories' | 'settings'>

const availableFor = (v: Service['availableFor']) => i18n.t(`catalog.export.availableFor.${v === 'female' || v === 'male' ? v : 'everyone'}`)
const onOff = (on: boolean) => (on ? i18n.t('catalog.common.enabled') : i18n.t('catalog.common.disabled'))

export function serviceMenuRows(data: Data): Cell[][] {
  const noTax = i18n.t('catalog.common.noTax')
  const inherited = i18n.t('catalog.export.inherited')
  const category = (id: string) => data.serviceCategories.find((c) => c.id === id)?.name ?? ''
  const tax = (id: string | null) => (id ? (data.settings.taxRates.find((r) => r.id === id)?.name ?? noTax) : noTax)
  const catOrder = (id: string) => data.serviceCategories.find((c) => c.id === id)?.order ?? 99
  const rows: Cell[][] = []
  const services = data.services.filter((s) => !isOffMenu(s, data.serviceCategories)).sort((a, b) => catOrder(a.categoryId) - catOrder(b.categoryId) || a.order - b.order)
  const bundles = data.bundles.filter((b) => !isOffMenu(b, data.serviceCategories))
  const serviceRow = (s: Service, name: string, price: number, duration: number, sku?: string): Cell[] => [
    name,
    money2(price),
    durationShort(duration),
    totalExtra(s.extraTime) ? durationShort(totalExtra(s.extraTime)) : '',
    tax(s.taxRateId),
    s.description,
    category(s.categoryId),
    treatmentLabel(s.treatmentType),
    s.resourceTypeIds.length ? i18n.t('catalog.common.required') : i18n.t('catalog.common.notRequired'),
    onOff(s.onlineBooking),
    availableFor(s.availableFor),
    onOff(true),
    onOff(s.commissionEnabled),
    numericId(s.id),
    sku ?? s.sku ?? '',
  ]
  const bundleRow = (b: Bundle): Cell[] => [b.name, money2(bundleBasePrice(b, data.services)), durationShort(bundleDuration(b, data.services)), '', inherited, b.description, category(b.categoryId), inherited, '', onOff(b.onlineBooking), availableFor(b.availableFor), onOff(false), '', '', '']
  ;[...data.serviceCategories].filter((c) => !c.archived).sort((a, b) => a.order - b.order).forEach(({ id: cid }) => {
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
  const table: ExportTable = { headers: headers(), rows: serviceMenuRows(data) }
  if (kind === 'csv') return exportCsv(fileName(), [table])
  return exportXlsx(fileName(), [table])
}

/** Landscape PDF in the captured layout (plain table, grey header text). */
export async function exportServiceMenuPdf(data: Data): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(20)
  doc.setTextColor(20)
  doc.text(i18n.t('catalog.export.title'), 24, 44)
  doc.setFontSize(7.5)
  doc.text(i18n.t('catalog.export.generated', { date: format(now(), "EEEE, d MMM yyyy 'at' HH:mm") }), 24, 72)
  autoTable(doc, {
    startY: 92,
    head: [headers()],
    body: serviceMenuRows(data).map((r) => r.map((c) => String(c ?? ''))),
    theme: 'plain',
    styles: { fontSize: 6.5, cellPadding: { top: 4, bottom: 4, left: 5, right: 5 }, textColor: [100, 100, 100], overflow: 'linebreak' },
    headStyles: { fontStyle: 'bold', textColor: [100, 100, 100], lineWidth: { bottom: 0.5 }, lineColor: [200, 200, 200] },
    columnStyles: { 1: { halign: 'right' }, 5: { cellWidth: 220 } },
    margin: { left: 24, right: 24 },
  })
  downloadBlob(doc.output('blob'), `${fileName()}.pdf`)
}

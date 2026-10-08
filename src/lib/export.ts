import i18n from 'i18next'
import { format } from '@/lib/dates'
import { now } from './time'

/**
 * File exports matching reference/screenshots/files:
 * - CSV: every cell double-quoted, comma separated, numbers unformatted
 *   ("112.50" in daily sales, "100" in reports), blank `""` line between tables.
 * - Excel: one sheet, header row + rows (SheetJS, loaded on demand).
 * - PDF: A4 title, "Generated …" line, then each table (jsPDF + autotable).
 */
export type Cell = string | number | null | undefined
export interface ExportTable {
  title?: string
  headers: string[]
  rows: Cell[][]
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const quote = (cell: Cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`

/**
 * Sales exports separate tables with a `""` line and end with one; report
 * exports are a single table with no trailing line (pass trailingBlank: false).
 */
export function toCsv(tables: ExportTable[], options: { trailingBlank?: boolean } = {}): string {
  const body = tables.map((t) => [t.headers, ...t.rows].map((row) => row.map(quote).join(',')).join('\n')).join('\n""\n')
  return options.trailingBlank === false ? `${body}\n` : `${body}\n""\n`
}

/** `exported_file_2026-10-07-11-53-53-pm` (Sales exports). */
export const exportedFileName = () => `exported_file_${format(now(), 'yyyy-MM-dd-hh-mm-ss-aaa')}`
/** `report_sales-summary_2026-10-08` (Reports exports). */
export const reportFileName = (slug: string) => `report_${slug}_${format(now(), 'yyyy-MM-dd')}`

export function exportCsv(filename: string, tables: ExportTable[], options: { trailingBlank?: boolean } = {}): void {
  downloadBlob(new Blob([toCsv(tables, options)], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`)
}

export async function exportXlsx(filename: string, tables: ExportTable[], options: { sheetName?: string; columnWidths?: number[] } = {}): Promise<void> {
  const XLSX = await import('xlsx')
  const aoa: Cell[][] = []
  tables.forEach((t, i) => {
    if (i > 0) aoa.push([])
    if (t.title && tables.length > 1) aoa.push([t.title])
    aoa.push(t.headers, ...t.rows)
  })
  const sheet = XLSX.utils.aoa_to_sheet(aoa)
  // Column widths: given, or fitted to the longest value (as in the captured export).
  const columns = Math.max(...aoa.map((row) => row.length), 0)
  sheet['!cols'] = Array.from({ length: columns }, (_, c) => ({
    wch: options.columnWidths?.[c] ?? Math.min(48, Math.max(8, ...aoa.map((row) => String(row[c] ?? '').length + 2))),
  }))
  const book = XLSX.utils.book_new()
  // Sheet names: max 31 characters, none of : \ / ? * [ ]
  const sheetName = (options.sheetName ?? i18n.t('common.export.sheet')).replace(/[:\\/?*[\]]/g, ' ').slice(0, 31)
  XLSX.utils.book_append_sheet(book, sheet, sheetName)
  const data = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  downloadBlob(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${filename}.xlsx`)
}

export async function exportPdf(filename: string, options: { title: string; subtitle?: string; tables: ExportTable[]; orientation?: 'portrait' | 'landscape' }): Promise<void> {
  const blob = await buildPdf(options)
  downloadBlob(blob, `${filename}.pdf`)
}

/** Build a tables PDF (also used for previews). */
export async function buildPdf({ title, subtitle, tables, orientation = 'portrait' }: { title: string; subtitle?: string; tables: ExportTable[]; orientation?: 'portrait' | 'landscape' }): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ orientation, unit: 'pt', format: 'a4' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(title, 40, 50)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(90)
  doc.text(subtitle ?? i18n.t('reports.export.generated', { date: format(now(), "EEEE, d MMM yyyy 'at' HH:mm") }), 40, 68)
  let y = 90
  for (const t of tables) {
    if (t.title) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.setTextColor(20)
      doc.text(t.title, 40, y)
      y += 8
    }
    autoTable(doc, {
      startY: y,
      head: [t.headers],
      body: t.rows.map((r) => r.map((c) => String(c ?? ''))),
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [14, 110, 106], textColor: 255 },
      margin: { left: 40, right: 40 },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 28
  }
  return doc.output('blob')
}

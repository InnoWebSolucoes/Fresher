import { parseISO } from 'date-fns'
import { format } from '@/lib/dates'
import i18next from 'i18next'
import { downloadBlob, exportCsv, exportXlsx, reportFileName, type ExportTable } from '@/lib/export'
import { now } from '@/lib/time'
import { exportCell, formatCell, isNumeric } from './format'
import type { Cell, Col, ColType, Result, Row } from './types'

/**
 * Report exports matching reference/screenshots/files/report-sales-summary-*:
 * - CSV and Excel: header row + data rows (no Total row), numbers unformatted;
 *   the Excel sheet is named after the report.
 * - PDF: A3 portrait, title, "From … to …", "Grouped by: …", "Generated …",
 *   then the table with a bold Total row and thin grey rules between rows.
 */
export interface ExportInput {
  slug: string
  name: string
  columns: Col[]
  rows: Row[]
  total: Result['total']
  range: { from: string; to: string } | null
  groupedBy: string | null
}

const cellType = (row: Row, col: Col, index: number): ColType => (row.type && index > 0 ? row.type : col.type)

function dataTable(input: ExportInput, formatted: boolean): ExportTable {
  const value = (v: Cell, type: ColType, first: boolean, row?: Row) => {
    if (first) return String(v ?? '')
    if (row?.kind === 'section') return ''
    return formatted ? formatCell(v, type) : exportCell(v, type)
  }
  return {
    headers: input.columns.map((c) => c.label),
    rows: input.rows.map((r) => input.columns.map((c, i) => value(r.cells[c.key], cellType(r, c, i), i === 0, r))),
  }
}

export function exportReportCsv(input: ExportInput): void {
  exportCsv(reportFileName(input.slug), [dataTable(input, false)], { trailingBlank: false })
}

export async function exportReportXlsx(input: ExportInput): Promise<void> {
  await exportXlsx(reportFileName(input.slug), [dataTable(input, false)], { sheetName: input.name })
}

const stamp = (d: Date) => format(d, 'dd MMM yyyy, h:mmaaa')

export async function exportReportPdf(input: ExportInput): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const landscape = input.columns.length > 10
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a3' })
  const left = 42
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(0)
  doc.setFontSize(25)
  doc.text(input.name, left, 80)
  doc.setFontSize(10)
  let y = 160
  if (input.range) {
    const from = parseISO(`${input.range.from}T00:00:00`)
    const to = parseISO(`${input.range.to}T23:59:00`)
    doc.text(i18next.t('reports.export.range', { from: stamp(from), to: stamp(to) }), left, y)
    y += 26
  }
  if (input.groupedBy) {
    doc.text(i18next.t('reports.export.groupedBy', { name: input.groupedBy }), left, y)
    y += 26
  }
  doc.text(i18next.t('reports.export.generated', { date: stamp(now()) }), left, y)
  const table = dataTable(input, true)
  const total = input.total && input.rows.length ? [input.columns.map((c, i) => (i === 0 ? String(input.total![c.key] ?? '') : input.total![c.key] === undefined || input.total![c.key] === null ? '' : formatCell(input.total![c.key], c.type)))] : []
  const boldRows = new Set<number>()
  if (total.length) boldRows.add(0)
  input.rows.forEach((r, i) => r.kind && boldRows.add(i + total.length))
  autoTable(doc, {
    startY: y + 22,
    head: [table.headers],
    body: [...total, ...table.rows.map((r) => r.map((c) => String(c ?? '')))],
    theme: 'plain',
    margin: { left, right: left },
    styles: { font: 'helvetica', fontSize: 10, textColor: 0, cellPadding: { top: 16, bottom: 16, left: 2, right: 6 }, lineColor: [128, 128, 128], lineWidth: { bottom: 0.5 }, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fontStyle: 'bold' },
    didParseCell: (data) => {
      if (data.section === 'body' && boldRows.has(data.row.index)) data.cell.styles.fontStyle = 'bold'
      const col = input.columns[data.column.index]
      if (col && data.column.index > 0 && isNumeric(col.type)) data.cell.styles.halign = 'left'
    },
  })
  downloadBlob(doc.output('blob'), `${reportFileName(input.slug)}.pdf`)
}

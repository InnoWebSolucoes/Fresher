import clsx from 'clsx'
import { addDays, parseISO } from 'date-fns'
import { format } from '@/lib/dates'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { Button, Page, PageHeader, PageSkeleton, usePageLoading } from '@/components/ui'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { todayISO, toISODate, useNow } from '@/lib/time'
import { money2 } from '@/lib/format'
import { exportCsv, exportedFileName, exportPdf, exportXlsx, type ExportTable } from '@/lib/export'
import { DayPicker, ExportMenu, type ExportFormat } from '../shared/ui'
import { computeDailySummary, type DailySummary } from './summary'

type Translate = (key: string, options?: Record<string, unknown>) => string

/** Rows of both tables, shared by the page and the exports. */
function tableRows(summary: DailySummary, t: Translate) {
  const transactions = summary.transactions.map((r) => ({ label: t(`sales.daily.rows.${r.key}`), salesQty: r.salesQty, refundQty: r.refundQty, gross: r.gross, strong: false }))
  transactions.push({ label: t('sales.daily.rows.totalSales'), ...summary.total, strong: true })
  const cash = [
    { label: t('sales.daily.rows.cash'), collected: summary.cash.collected, refunded: summary.cash.refunded as number | null, strong: false },
    ...summary.methods.map((m) => ({ label: m.label, collected: m.collected, refunded: m.refunded as number | null, strong: false })),
    { label: t('sales.daily.rows.giftCardRedemptions'), collected: summary.giftCards.collected, refunded: summary.giftCards.refunded as number | null, strong: false },
    { label: t('sales.daily.rows.paymentsCollected'), collected: summary.payments.collected, refunded: summary.payments.refunded as number | null, strong: true },
    { label: t('sales.daily.rows.ofWhichTips'), collected: summary.tips.collected, refunded: summary.tips.refunded as number | null, strong: true },
    { label: t('sales.daily.rows.outstanding'), collected: summary.outstanding, refunded: null, strong: true },
  ]
  return { transactions, cash }
}

/** Export tables matching reference/screenshots/files/daily-sales-exported_file_*. */
function exportTables(summary: DailySummary, t: Translate, format: ExportFormat): ExportTable[] {
  const { transactions, cash } = tableRows(summary, t)
  const amount = (n: number) => (format === 'pdf' ? money2(n) : format === 'xlsx' ? n : n.toFixed(2))
  return [
    {
      title: t('sales.daily.export.transactionTitle'),
      headers: [t('sales.daily.export.itemType'), t('sales.daily.export.salesQty'), t('sales.daily.export.refundQty'), t('sales.daily.export.grossTotal')],
      rows: transactions.map((r) => [r.label, r.salesQty, r.refundQty, amount(r.gross)]),
    },
    {
      title: t('sales.daily.export.cashTitle'),
      headers: [t('sales.daily.export.paymentType'), t('sales.daily.export.paymentsCollected'), t('sales.daily.export.refundsPaid')],
      rows: cash.map((r) => [r.label, amount(r.collected), r.refunded === null ? '' : amount(r.refunded)]),
    },
  ]
}

/** Numeric columns sit closer together so Portuguese headers stay on one line (on phones they wrap so the table fits). */
const cellPad = (i: number, count: number) => (i === 0 ? 'pl-4 pr-1 md:pl-6 md:pr-3' : i === count - 1 ? 'pl-1.5 pr-4 md:pl-3 md:pr-6' : 'px-1.5 md:px-3')

function SummaryCard({ title, headers, children }: { title: string; headers: string[]; children: ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <h2 className="px-4 pb-1 pt-5 font-display text-title-3 text-ink md:px-6 md:pb-2 md:pt-6">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-body md:min-w-[420px]">
          <thead>
            <tr className="border-b border-line">
              {headers.map((h, i) => (
                <th key={h} scope="col" className={clsx('py-3 align-bottom text-body-strong text-ink md:py-4 md:align-middle', cellPad(i, headers.length), i === 0 ? 'text-left' : 'text-right md:whitespace-nowrap')}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </section>
  )
}

function Row({ cells, strong }: { cells: ReactNode[]; strong?: boolean }) {
  return (
    <tr className="border-b border-line last:border-0">
      {cells.map((c, i) => (
        <td key={i} className={clsx('py-3 md:py-4', cellPad(i, cells.length), i === 0 ? 'text-left' : 'whitespace-nowrap text-right tabular', strong ? 'font-semibold text-ink' : 'text-ink')}>
          {c}
        </td>
      ))}
    </tr>
  )
}

export function DailySalesPage() {
  const { t } = useTranslation()
  const loading = usePageLoading()
  const drawer = useDrawer()
  useNow()
  const today = todayISO()
  const [params, setParams] = useSearchParams()
  const requested = params.get('report-date')
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= today ? requested : today
  const [picker, setPicker] = useState(false)

  const sales = useDb((s) => s.sales)
  const payments = useDb((s) => s.payments)
  const summary = useMemo(() => computeDailySummary(sales, payments, date), [sales, payments, date])
  const rows = useMemo(() => tableRows(summary, t), [summary, t])

  const setDate = (next: string) => {
    setPicker(false)
    setParams((prev) => {
      const p = new URLSearchParams(prev)
      if (next === today) p.delete('report-date')
      else p.set('report-date', next)
      return p
    })
  }
  const shift = (days: number) => setDate(toISODate(addDays(parseISO(date), days)))
  const dayLabel = format(parseISO(date), 'EEEE, d MMM yyyy')
  const shortDayLabel = format(parseISO(date), 'EEE, d MMM yyyy')

  const onExport = async (fmt: ExportFormat) => {
    const name = exportedFileName()
    const tables = exportTables(summary, t, fmt)
    if (fmt === 'csv') exportCsv(name, tables)
    else if (fmt === 'xlsx') await exportXlsx(name, tables, { sheetName: t('sales.daily.title') })
    else await exportPdf(name, { title: t('sales.daily.export.pdfTitle', { date: dayLabel }), tables })
  }

  if (loading)
    return (
      <Page wide>
        <PageSkeleton rows={8} />
      </Page>
    )

  const navButton = 'flex h-10 items-center justify-center px-3 text-body-strong text-ink hover:bg-sunken disabled:cursor-not-allowed disabled:text-subtle disabled:hover:bg-transparent'
  return (
    <Page wide>
      <PageHeader
        title={t('sales.daily.title')}
        subtitle={t('sales.daily.subtitle')}
        actions={
          <>
            <ExportMenu onExport={onExport} />
            <Button variant="primary" onClick={() => drawer.open('checkout', {})}>
              {t('sales.common.addNew')}
            </Button>
          </>
        }
      />

      <div className="relative mb-5 inline-flex max-w-full md:mb-6">
        <div className="inline-flex max-w-full items-stretch divide-x divide-line overflow-hidden rounded-full border border-line-strong bg-surface">
          <button type="button" className={clsx(navButton, 'w-11 shrink-0')} onClick={() => shift(-1)} aria-label={t('sales.daily.previousDay')}>
            <ChevronLeft size={18} aria-hidden />
          </button>
          <button type="button" className={clsx(navButton, 'shrink-0 px-4')} onClick={() => setDate(today)}>
            {t('sales.daily.today')}
          </button>
          <button type="button" className={clsx(navButton, 'min-w-0 whitespace-nowrap px-4 md:px-5', picker && 'bg-sunken')} onClick={() => setPicker((o) => !o)} aria-haspopup="dialog" aria-expanded={picker}>
            {/* Phones show the short weekday so the navigator fits on one line. */}
            <span className="md:hidden">{shortDayLabel}</span>
            <span className="hidden md:inline">{dayLabel}</span>
          </button>
          <button type="button" className={clsx(navButton, 'w-11 shrink-0')} onClick={() => shift(1)} disabled={date >= today} aria-label={t('sales.daily.nextDay')}>
            <ChevronRight size={18} aria-hidden />
          </button>
        </div>
        {picker && <DayPicker value={date} max={today} onPick={setDate} onClose={() => setPicker(false)} />}
      </div>

      <div className="grid items-start gap-4 md:gap-6 xl:grid-cols-2">
        <SummaryCard title={t('sales.daily.transactionSummary')} headers={[t('sales.daily.cols.itemType'), t('sales.daily.cols.salesQty'), t('sales.daily.cols.refundQty'), t('sales.daily.cols.grossTotal')]}>
          {rows.transactions.map((r) => (
            <Row key={r.label} strong={r.strong} cells={[r.label, r.salesQty, r.refundQty, money2(r.gross)]} />
          ))}
        </SummaryCard>
        <SummaryCard title={t('sales.daily.cashMovementSummary')} headers={[t('sales.daily.cols.paymentType'), t('sales.daily.cols.paymentsCollected'), t('sales.daily.cols.refundsPaid')]}>
          {rows.cash.map((r) => (
            <Row key={r.label} strong={r.strong} cells={[r.label, money2(r.collected), r.refunded === null ? '' : money2(r.refunded)]} />
          ))}
        </SummaryCard>
      </div>
    </Page>
  )
}

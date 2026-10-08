import clsx from 'clsx'
import { ArrowLeft, SlidersHorizontal, Star, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { REPORTS } from '@/app/reportCatalog'
import { Button, DateRangeButton, EmptyState, Menu, MenuButton, PageSkeleton, resolvePreset, Select, usePageLoading, type DateRangeValue } from '@/components/ui'
import { downloadBlob, exportPdf, exportXlsx, reportFileName, type ExportTable } from '@/lib/export'
import { useDrawer } from '@/lib/drawer'
import { useUiStore } from '@/store/ui'
import { findAddOn, isAddOnOn } from '@/api/addons'
import { useDb } from '@/store/db'
import { FiltersDrawer } from './components/FiltersDrawer'
import { DashboardPage, DASHBOARDS } from './dashboards/DashboardPage'
import { useCtx } from './engine/context'
import { optionLabel } from './engine/filters'
import { exportCell, formatCell, isNumeric } from './engine/format'
import { L } from './engine/labels'
import type { Cell, ColType, Link, RangeFilters, Result } from './engine/types'
import { SPECS } from './specs'

const PRESETS = ['today', 'yesterday', 'last_7_days', 'last_30_days', 'last_90_days', 'last_week', 'last_month', 'last_3_months', 'last_6_months', 'last_year', 'week_to_date', 'month_to_date', 'quarter_to_date', 'year_to_date', 'all_time'] as const

/** Premium reports without Insights show blurred sample data (reports.md §2.9). */
function sampleData(result: Result): Result {
  let seed = 7
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }
  const scramble = (cells: Record<string, Cell>) => Object.fromEntries(Object.entries(cells).map(([k, v], i) => [k, i > 0 && typeof v === 'number' ? Math.round(rand() * 90000) / 10 : v]))
  return { ...result, rows: result.rows.map((r) => ({ ...r, cells: scramble(r.cells) })), total: result.total ? scramble(result.total) : null }
}

/** /reports/table/:slug — a dashboard (reports.md §3) or a table report (§2). */
export function ReportTablePage() {
  const { slug = '' } = useParams()
  if (DASHBOARDS.includes(slug)) return <DashboardPage key={slug} slug={slug} />
  return <ReportTable key={slug} slug={slug} />
}

/** Report page (reports.md §2): toolbar, filters, table with Total row, export. */
function ReportTable({ slug }: { slug: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const drawer = useDrawer()
  const loading = usePageLoading()
  const ctx = useCtx()
  const def = REPORTS.find((r) => r.slug === slug)
  const spec = SPECS[slug]
  const insights = isAddOnOn(findAddOn(useDb((s) => s.addOns), 'insights'))
  const favourites = useUiStore((s) => s.favouriteReports)
  const toggleFav = useUiStore((s) => s.toggleFavouriteReport)
  const [range, setRange] = useState<DateRangeValue>(() => resolvePreset(spec?.range ?? 'all_time'))
  const [groupBy, setGroupBy] = useState(spec?.groupings?.[0]?.key ?? '')
  const [filters, setFilters] = useState<Record<string, string[]>>({})
  const [ranges, setRanges] = useState<RangeFilters>({})
  const [extra, setExtra] = useState<Record<string, string>>(() => Object.fromEntries((spec?.selectors ?? []).map((s) => [s.key, s.default])))
  const [filtersOpen, setFiltersOpen] = useState(false)
  const locked = Boolean(def?.premium && !insights)

  const result = useMemo(() => {
    if (!spec) return null
    const built = spec.build(ctx, { range: spec.range ? range : resolvePreset('all_time'), groupBy, filters, ranges, extra })
    return locked ? sampleData(built) : built
  }, [spec, ctx, range, groupBy, filters, ranges, extra, locked])
  const columns = result?.columns.filter((c) => !c.hidden) ?? []

  if (loading) return <div className="mx-auto max-w-[1400px] px-8 py-8"><PageSkeleton /></div>
  const fav = favourites.includes(slug)
  const activeFilters = Object.entries(filters).flatMap(([key, values]) => values.map((value) => ({ key, value })))
  const activeRanges = Object.entries(ranges).filter(([, r]) => r && (r.min !== undefined || r.max !== undefined))
  const filterCount = activeFilters.length + activeRanges.length

  const follow = (link: Link) => {
    if (link.kind === 'sale') drawer.open('sale', { id: link.id })
    else if (link.kind === 'appointment') drawer.open('appointment', { id: link.id })
    else if (link.kind === 'client') drawer.open('client', { id: link.id })
    else if (link.kind === 'report' && link.to) navigate(`/reports/table/${link.to}`)
    else if (link.kind === 'drill' && link.drill) {
      if (link.drill.filter) setFilters((f) => ({ ...f, [link.drill!.filter!.key]: [link.drill!.filter!.value] }))
      if (link.drill.range) setRange({ preset: 'custom', ...link.drill.range })
      if (link.drill.groupBy) setGroupBy(link.drill.groupBy)
    }
  }

  const exportCsv = () => {
    if (!result) return
    const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
    const lines = [columns.map((c) => q(c.label)).join(','), ...result.rows.filter((r) => !r.kind).map((r) => columns.map((c) => q(exportCell(r.cells[c.key], r.type && c !== columns[0] ? r.type : c.type))).join(','))]
    downloadBlob(new Blob([`${lines.join('\n')}\n`], { type: 'text/csv;charset=utf-8' }), `${reportFileName(slug)}.csv`)
  }

  /** Header + Total row + rows; numbers raw for Excel, formatted for PDF. */
  const exportTable = (formatted: boolean): ExportTable => {
    const cell = (v: Cell, type: ColType, first: boolean) => (first ? String(v ?? '') : formatted ? formatCell(v, type) : exportCell(v, type))
    const rows = (result?.rows ?? []).filter((r) => r.kind !== 'section').map((r) => columns.map((c, i) => cell(r.cells[c.key], r.type && i > 0 ? r.type : c.type, i === 0)))
    const total = result?.total && result.rows.length ? [columns.map((c, i) => (result.total![c.key] === undefined || result.total![c.key] === null ? '' : cell(result.total![c.key], c.type, i === 0)))] : []
    return { headers: columns.map((c) => c.label), rows: [...total, ...rows] }
  }
  const exportExcel = () => void exportXlsx(reportFileName(slug), [exportTable(false)])
  const exportPdfFile = () => void exportPdf(reportFileName(slug), { title: def?.name ?? slug, subtitle: spec?.range ? `${range.from} - ${range.to}` : undefined, tables: [exportTable(true)], orientation: columns.length > 6 ? 'landscape' : 'portrait' })

  const removeFilter = (key: string, value: string) =>
    setFilters((all) => {
      const next = { ...all, [key]: all[key].filter((v) => v !== value) }
      if (!next[key].length) delete next[key]
      return next
    })
  const removeRange = (key: string) =>
    setRanges((all) => {
      const next = { ...all }
      delete next[key]
      return next
    })

  return (
    <div className="mx-auto w-full max-w-[1400px] px-8 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Button icon={<ArrowLeft size={16} />} onClick={() => navigate('/reports/report-group/1?category=all')}>{t('reports.page.back')}</Button>
        <span className="text-body text-muted">{t('reports.groups.1')} · <span className="text-ink">{def?.name ?? slug}</span></span>
      </div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 font-display text-title-1 text-ink">
            {def?.name ?? slug}
            <button type="button" className="icon-btn h-8 w-8" aria-label={t(fav ? 'reports.removeFavourite' : 'reports.addFavourite')} aria-pressed={fav} onClick={() => toggleFav(slug)}>
              <Star size={20} className={fav ? 'fill-accent text-accent' : 'text-muted'} aria-hidden />
            </button>
            {def?.premium && <span className="chip bg-primary-subtle text-primary">{t('reports.premium')}</span>}
          </h1>
          <p className="mt-1 text-body-lg text-muted">{def?.description} {t('reports.page.dataFrom', { count: 1 })}</p>
        </div>
        <Menu
          trigger={({ open, toggle }) => <MenuButton open={open} toggle={toggle}>{t('reports.page.options')}</MenuButton>}
          groups={[
            { items: [{ label: t('reports.page.duplicate'), onSelect: () => navigate('/add-ons/add-on/insights/intro') }, { label: t(fav ? 'reports.removeFavourite' : 'reports.addFavourite'), onSelect: () => toggleFav(slug) }] },
            {
              heading: t('reports.page.export'),
              items: [
                { label: 'CSV', onSelect: exportCsv, disabled: locked || !spec },
                { label: 'Excel', onSelect: exportExcel, disabled: locked || !spec },
                { label: 'PDF', onSelect: exportPdfFile, disabled: locked || !spec },
              ],
            },
          ]}
        />
      </div>
      {spec && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {spec.groupBy && spec.groupings && (
            <Select aria-label={t('reports.page.groupBy')} className="h-10 w-56 rounded-full" value={groupBy} onChange={(e) => setGroupBy(e.target.value)} options={spec.groupings.filter((g) => !g.hidden).map((g) => ({ value: g.key, label: L(`dim.${g.key}`) }))} />
          )}
          {(spec.selectors ?? []).map((sel) => (
            <Select key={sel.key} aria-label={sel.key} className="h-10 w-48 rounded-full" value={extra[sel.key] ?? sel.default} onChange={(e) => setExtra((x) => ({ ...x, [sel.key]: e.target.value }))} options={sel.options.map((o) => ({ value: o, label: L(`${sel.key}.${o}`) }))} />
          ))}
          {spec.range && <DateRangeButton value={range} onChange={setRange} presets={[...PRESETS]} />}
          {(spec.filters.length > 0 || (spec.premiumFilters?.length ?? 0) > 0) && (
            <Button icon={<SlidersHorizontal size={16} />} className="rounded-full" onClick={() => setFiltersOpen(true)}>
              {t('reports.page.filters')}
              {filterCount > 0 && <span className="ml-1 rounded-full bg-primary px-2 text-caption text-on-primary">{filterCount}</span>}
            </Button>
          )}
          {activeFilters.map((f) => (
            <span key={`${f.key}:${f.value}`} className="chip gap-1 bg-primary-subtle text-primary">
              {optionLabel(ctx, f.key, f.value)}
              <button type="button" aria-label={t('reports.page.removeFilter')} onClick={() => removeFilter(f.key, f.value)}>
                <X size={14} aria-hidden />
              </button>
            </span>
          ))}
          {activeRanges.map(([key, r]) => (
            <span key={key} className="chip gap-1 bg-primary-subtle text-primary">
              {t(`reports.filterName.${key}`, { defaultValue: key })} {r.min ?? 0} - {r.max ?? '∞'}
              <button type="button" aria-label={t('reports.page.removeFilter')} onClick={() => removeRange(key)}>
                <X size={14} aria-hidden />
              </button>
            </span>
          ))}
          {filterCount > 0 && <Button variant="ghost" onClick={() => { setFilters({}); setRanges({}) }}>{t('reports.page.clearFilters')}</Button>}
        </div>
      )}
      {spec && (
        <FiltersDrawer
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          ctx={ctx}
          keys={spec.filters}
          premiumKeys={spec.premiumFilters}
          locked={!insights}
          filters={filters}
          ranges={ranges}
          onApply={(f, r) => {
            setFilters(f)
            setRanges(r)
          }}
        />
      )}
      {!spec || !result ? (
        <div className="card"><EmptyState title={t('reports.page.premiumTitle')} body={t('reports.page.premiumBody')} action={<Button variant="primary" onClick={() => navigate('/add-ons/add-on/insights/intro')}>{t('reports.page.upgrade')}</Button>} /></div>
      ) : (
        <div className="relative overflow-hidden rounded-lg border border-line bg-surface">
          <div className={clsx('overflow-x-auto', locked && 'pointer-events-none select-none blur-[3px]')} aria-hidden={locked || undefined}>
            <table className="w-full min-w-max border-collapse text-left text-body">
              <thead>
                <tr className="border-b border-line">
                  {columns.map((c) => <th key={c.key} className={clsx('whitespace-nowrap px-4 py-3 text-body-strong', isNumeric(c.type) && 'text-right')}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {result.total && result.rows.length > 0 && (
                  <tr className="border-b border-line bg-sunken font-semibold">
                    {columns.map((c, i) => <td key={c.key} className={clsx('whitespace-nowrap px-4 py-3', isNumeric(c.type) && 'text-right tabular')}>{i === 0 ? String(result.total![c.key] ?? '') : result.total![c.key] === undefined || result.total![c.key] === null ? '' : formatCell(result.total![c.key], c.type)}</td>)}
                  </tr>
                )}
                {result.rows.slice(0, 200).map((r) => (
                  <tr key={r.key} className={clsx('border-b border-line last:border-0', r.kind === 'bold' && 'bg-sunken font-semibold')}>
                    {columns.map((c, i) => {
                      const type = r.type && i > 0 ? r.type : c.type
                      const link = r.links?.[c.key]
                      const text = r.kind === 'section' && i > 0 ? '' : i === 0 && r.kind ? String(r.cells[c.key] ?? '') : formatCell(r.cells[c.key], type)
                      return (
                        <td key={c.key} className={clsx('whitespace-nowrap px-4 py-3', isNumeric(type) && 'text-right tabular', r.indent && i === 0 && 'pl-8', r.kind === 'section' && 'pt-6 font-semibold')}>
                          {link && !locked ? <button type="button" className="text-primary hover:underline" onClick={() => follow(link)}>{text}</button> : text}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                {result.rows.length === 0 && (
                  <tr><td colSpan={columns.length} className="px-6 py-10 text-center"><p className="text-body-strong text-ink">{t('reports.page.noResults')}</p><p className="text-body text-muted">{t('reports.page.noResultsBody')}</p></td></tr>
                )}
              </tbody>
            </table>
          </div>
          {result.rows.length > 0 && <p className="border-t border-line px-4 py-3 text-center text-small text-muted">{t('reports.page.viewing', { from: 1, to: Math.min(200, result.rows.length), total: result.rows.length })}</p>}
          {locked && (
            <div className="absolute inset-x-0 top-24 flex flex-col items-center gap-2 text-center">
              <p className="font-display text-title-3 text-ink">{t('reports.page.premiumTitle')}</p>
              <p className="text-body text-muted">{t('reports.page.premiumBody')}</p>
              <div className="mt-2 flex gap-2">
                <Button variant="primary" onClick={() => navigate('/add-ons/add-on/insights/intro')}>{t('reports.page.upgrade')}</Button>
                <Button onClick={() => drawer.open('resources', { tab: 'help', view: 'help-center', d_q: 'Insights' })}>{t('reports.page.learnMore')}</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

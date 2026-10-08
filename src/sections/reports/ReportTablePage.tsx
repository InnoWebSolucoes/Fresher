import clsx from 'clsx'
import { ArrowLeft, Star } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { REPORTS } from '@/app/reportCatalog'
import { Button, DateRangeButton, EmptyState, Menu, MenuButton, PageSkeleton, resolvePreset, Select, usePageLoading, type DateRangeValue } from '@/components/ui'
import { downloadBlob, reportFileName } from '@/lib/export'
import { useDrawer } from '@/lib/drawer'
import { useUiStore } from '@/store/ui'
import { findAddOn, isAddOnOn } from '@/api/addons'
import { useDb } from '@/store/db'
import { useCtx } from './engine/context'
import { exportCell, formatCell, isNumeric } from './engine/format'
import { L } from './engine/labels'
import type { Link } from './engine/types'
import { SPECS } from './specs'

const PRESETS = ['today', 'yesterday', 'last_7_days', 'last_30_days', 'last_90_days', 'last_week', 'last_month', 'last_3_months', 'last_6_months', 'last_year', 'week_to_date', 'month_to_date', 'quarter_to_date', 'year_to_date', 'all_time'] as const

/** Report page (reports.md §2): toolbar, table with Total row, export. */
export function ReportTablePage() {
  const { t } = useTranslation()
  const { slug = '' } = useParams()
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

  const result = useMemo(() => (spec ? spec.build(ctx, { range: spec.range ? range : resolvePreset('all_time'), groupBy, filters, ranges: {}, extra: {} }) : null), [spec, ctx, range, groupBy, filters])
  const columns = result?.columns.filter((c) => !c.hidden) ?? []

  if (loading) return <div className="mx-auto max-w-[1400px] px-8 py-8"><PageSkeleton /></div>
  const fav = favourites.includes(slug)
  const locked = Boolean(def?.premium && !insights)

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
            { heading: t('reports.page.export'), items: [{ label: 'CSV', onSelect: exportCsv, disabled: locked || !spec }] },
          ]}
        />
      </div>
      {spec && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {spec.groupBy && spec.groupings && (
            <Select aria-label={t('reports.page.groupBy')} className="h-10 w-56 rounded-full" value={groupBy} onChange={(e) => setGroupBy(e.target.value)} options={spec.groupings.filter((g) => !g.hidden).map((g) => ({ value: g.key, label: L(`dim.${g.key}`) }))} />
          )}
          {spec.range && <DateRangeButton value={range} onChange={setRange} presets={[...PRESETS]} />}
          {Object.keys(filters).length > 0 && <Button variant="ghost" onClick={() => setFilters({})}>{t('reports.page.clearFilters')}</Button>}
        </div>
      )}
      {!spec || !result ? (
        <div className="card"><EmptyState title={t('reports.page.premiumTitle')} body={t('reports.page.premiumBody')} action={<Button variant="primary" onClick={() => navigate('/add-ons/add-on/insights/intro')}>{t('reports.page.upgrade')}</Button>} /></div>
      ) : (
        <div className="relative overflow-hidden rounded-lg border border-line bg-surface">
          <div className={clsx('overflow-x-auto', locked && 'pointer-events-none select-none blur-[3px]')}>
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
              <Button variant="primary" onClick={() => navigate('/add-ons/add-on/insights/intro')}>{t('reports.page.upgrade')}</Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

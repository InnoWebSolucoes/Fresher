import clsx from 'clsx'
import { BarChart3, LineChart, Search, Star } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, NavLink, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { REPORTS, type ReportDef } from '@/app/reportCatalog'
import { PageHeader } from '@/components/ui/PageHeader'
import { useUiStore } from '@/store/ui'

// Group ids and category tabs from reference/reports.md §1.1–1.2.
const GROUPS = ['1', '2', '6', '3', '4', '5'] as const
const CATEGORIES = ['all', 'salesPerformance', 'finances', 'appointments', 'team', 'clients', 'inventory'] as const

function inGroup(report: ReportDef, group: string, favourites: string[]): boolean {
  switch (group) {
    case '2':
      return favourites.includes(report.slug)
    case '6':
      return report.group === 'dashboards'
    case '3':
      return !report.premium
    case '4':
      return report.premium
    case '5':
      return false
    default:
      return true
  }
}

/** Reports landing (Phase 0 navigation; report pages are built in Phase 5). */
export function ReportGroupPage() {
  const { t } = useTranslation()
  const { groupId = '1' } = useParams()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const favourites = useUiStore((s) => s.favouriteReports)
  const toggleFavourite = useUiStore((s) => s.toggleFavouriteReport)
  const category = params.get('category') ?? 'all'

  const visible = useMemo(
    () =>
      REPORTS.filter((r) => inGroup(r, groupId, favourites))
        .filter((r) => category === 'all' || r.group === category || (r.group === 'premium' && category === 'salesPerformance'))
        .filter((r) => `${r.name} ${r.description}`.toLowerCase().includes(query.trim().toLowerCase())),
    [groupId, favourites, category, query],
  )

  return (
    <div className="mx-auto flex max-w-[1180px] gap-8 px-8 py-8">
      <aside className="w-60 shrink-0">
        <nav className="card p-3" aria-label={t('nav.reports')}>
          <h2 className="px-3 pb-2 font-display text-title-3">{t('nav.reports')}</h2>
          {GROUPS.map((group) => {
            const count = REPORTS.filter((r) => inGroup(r, group, favourites)).length
            return (
              <NavLink
                key={group}
                to={`/reports/report-group/${group}?category=all`}
                className={clsx(
                  'flex h-10 items-center justify-between rounded-md px-3 text-body',
                  group === groupId ? 'bg-primary-subtle font-semibold text-primary' : 'text-ink hover:bg-sunken',
                )}
              >
                {t(`reports.groups.${group}`)}
                <span className="chip bg-sunken text-muted">{count}</span>
              </NavLink>
            )
          })}
          <div className="mt-3 border-t border-line pt-3">
            <Link to="/reports/data-connector" className="flex h-10 items-center rounded-md px-3 text-body text-ink hover:bg-sunken">
              {t('reports.dataConnector')}
            </Link>
          </div>
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <PageHeader title={t('reports.title')} subtitle={t('reports.subtitle')} count={REPORTS.length} />
        <label className="relative mb-4 block">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('reports.search')}
            className="input pl-10"
          />
        </label>
        <div className="mb-5 flex flex-wrap gap-2" role="tablist">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={category === c}
              onClick={() => setParams({ category: c })}
              className={clsx('chip h-9 px-4 text-body-strong', category === c ? 'bg-ink text-canvas' : 'bg-surface text-ink ring-1 ring-line hover:bg-sunken')}
            >
              {t(`reports.categories.${c}`)}
            </button>
          ))}
        </div>
        <ul className="flex flex-col gap-2">
          {visible.map((report) => {
            const fav = favourites.includes(report.slug)
            const Icon = report.group === 'dashboards' ? BarChart3 : LineChart
            return (
              <li key={report.id} className="card flex items-center gap-4 p-4 hover:border-primary/40">
                <span className={clsx('flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-sunken', report.group === 'dashboards' ? 'text-success' : 'text-primary')}>
                  <Icon size={20} aria-hidden />
                </span>
                <Link to={`/reports/table/${report.slug}`} className="min-w-0 flex-1">
                  <span className="block text-body-strong text-ink">{report.name}</span>
                  <span className="block text-body text-muted">{report.description}</span>
                </Link>
                {report.premium && <span className="chip text-primary ring-1 ring-primary/50">{t('reports.premium')}</span>}
                <button
                  type="button"
                  aria-pressed={fav}
                  aria-label={t(fav ? 'reports.removeFavourite' : 'reports.addFavourite')}
                  onClick={() => toggleFavourite(report.slug)}
                  className="icon-btn"
                >
                  <Star size={18} className={fav ? 'fill-accent text-accent' : 'text-muted'} aria-hidden />
                </button>
              </li>
            )
          })}
          {visible.length === 0 && (
            <li className="card p-10 text-center">
              <p className="font-display text-title-3">{t('reports.emptyTitle')}</p>
              <p className="mt-1 text-body text-muted">{t('reports.emptyBody')}</p>
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}

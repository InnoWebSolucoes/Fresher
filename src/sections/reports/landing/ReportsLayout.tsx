import clsx from 'clsx'
import { Folder, Link2, Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { REPORTS } from '@/app/reportCatalog'
import { useUiStore } from '@/store/ui'
import { useCustomReports, useFolders, useInsights, useInsightsGate } from '../data'
import { GROUPS, type GroupKey } from './catalog'
import { FolderModal } from './modals'

/** Report counts per left-panel group (reports.md §1.1). */
export function useGroupCounts(): Record<GroupKey, number> {
  const favourites = useUiStore((s) => s.favouriteReports)
  const custom = useCustomReports()
  const insights = useInsights()
  return useMemo(() => {
    const customCount = insights ? custom.length : 0
    const known = new Set([...REPORTS.map((r) => r.slug), ...(insights ? custom.map((c) => `custom_${c.id}`) : [])])
    return {
      all: REPORTS.length + customCount,
      favourites: favourites.filter((s) => known.has(s)).length,
      dashboards: REPORTS.filter((r) => r.group === 'dashboards').length,
      standard: REPORTS.filter((r) => !r.premium).length,
      premium: REPORTS.filter((r) => r.premium).length,
      custom: customCount,
    }
  }, [favourites, custom, insights])
}

/**
 * Reports landing shell: the white left panel with groups, folders and the
 * Data connector link (reports.md §1.1), and the page content on the right.
 */
export function ReportsLayout({ active, children }: { active: string; children: ReactNode }) {
  const { t } = useTranslation()
  const counts = useGroupCounts()
  const folders = useFolders()
  const insights = useInsights()
  const gate = useInsightsGate()
  const [folderOpen, setFolderOpen] = useState(false)
  const navigate = useNavigate()
  const row = (selected: boolean) => clsx('flex h-11 items-center gap-3 rounded-md px-3 text-body transition-colors', selected ? 'bg-primary-subtle font-semibold text-ink' : 'text-ink hover:bg-sunken')
  const chip = (selected: boolean) =>
    clsx('inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-body-strong transition-colors', selected ? 'bg-ink text-canvas' : 'bg-surface text-ink ring-1 ring-line hover:bg-sunken')
  const count = (selected: boolean) => clsx('rounded-full px-1.5 text-caption', selected ? 'bg-canvas/20' : 'bg-sunken text-muted')
  const strip = useRef<HTMLElement>(null)
  // Phones: bring the current group's chip into view in the sideways strip.
  useEffect(() => {
    strip.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [active])

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 py-5 md:flex-row md:gap-8 md:px-8 md:py-8">
      {/* Phones: groups, folders and the Data connector as one sideways-scrolling row above the page. */}
      <nav ref={strip} className="-mx-4 flex gap-2 overflow-x-auto overflow-y-hidden px-4 py-px [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden" aria-label={t('reports.landing.navLabel')}>
        {GROUPS.map(({ id, key, icon: Icon }) => (
          <NavLink key={id} to={`/reports/report-group/${id}?category=all`} className={chip(active === id)} aria-current={active === id ? 'page' : undefined}>
            <Icon size={16} aria-hidden className="shrink-0" />
            {t(`reports.landing.groups.${key}`)}
            <span className={count(active === id)}>{counts[key]}</span>
          </NavLink>
        ))}
        {folders.map((f) => {
          const id = `f_${f.id}`
          return (
            <NavLink key={f.id} to={`/reports/report-group/${id}?category=all`} className={chip(active === id)} aria-current={active === id ? 'page' : undefined}>
              <Folder size={16} aria-hidden className="shrink-0" />
              {f.name}
              <span className={count(active === id)}>{insights ? f.items.length : 0}</span>
            </NavLink>
          )
        })}
        <button type="button" className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-surface px-3.5 text-body-strong text-primary ring-1 ring-line transition-colors hover:bg-sunken" onClick={() => (insights ? setFolderOpen(true) : gate())}>
          <Plus size={16} aria-hidden />
          {t('reports.landing.addFolder')}
        </button>
        <NavLink to="/reports/data-connector" className={chip(active === 'dc')} aria-current={active === 'dc' ? 'page' : undefined}>
          <span className="flex h-5 w-5 items-center justify-center rounded-xs bg-success text-white">
            <Link2 size={12} aria-hidden />
          </span>
          {t('reports.landing.dataConnector')}
        </NavLink>
      </nav>
      <aside className="hidden w-[280px] shrink-0 md:block">
        <nav className="card sticky top-6 p-4" aria-label={t('reports.landing.navLabel')}>
          <h2 className="px-3 pb-2 pt-1 font-display text-title-3 text-ink">{t('reports.landing.reports')}</h2>
          <ul className="flex flex-col gap-0.5">
            {GROUPS.map(({ id, key, icon: Icon }) => (
              <li key={id}>
                <NavLink to={`/reports/report-group/${id}?category=all`} className={row(active === id)} aria-current={active === id ? 'page' : undefined}>
                  <Icon size={18} aria-hidden className="shrink-0" />
                  <span className="flex-1 truncate">{t(`reports.landing.groups.${key}`)}</span>
                  <span className="chip h-6 min-w-[28px] justify-center bg-sunken px-2 text-caption text-muted">{counts[key]}</span>
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="mx-3 my-3 border-t border-line" />
          <h3 className="px-3 pb-1 pt-1 text-body-strong text-ink">{t('reports.landing.folders')}</h3>
          {folders.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {folders.map((f) => {
                const id = `f_${f.id}`
                return (
                  <li key={f.id}>
                    <NavLink to={`/reports/report-group/${id}?category=all`} className={row(active === id)} aria-current={active === id ? 'page' : undefined}>
                      <Folder size={18} aria-hidden className="shrink-0" />
                      <span className="flex-1 truncate">{f.name}</span>
                      <span className="chip h-6 min-w-[28px] justify-center bg-sunken px-2 text-caption text-muted">{insights ? f.items.length : 0}</span>
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          )}
          <button type="button" className="flex h-10 items-center gap-2 rounded-md px-3 text-body-strong text-primary hover:bg-sunken" onClick={() => (insights ? setFolderOpen(true) : gate())}>
            <Plus size={18} aria-hidden />
            {t('reports.landing.addFolder')}
          </button>
          <div className="mx-3 my-3 border-t border-line" />
          <NavLink to="/reports/data-connector" className={row(active === 'dc')} aria-current={active === 'dc' ? 'page' : undefined}>
            <span className="flex h-6 w-6 items-center justify-center rounded-xs bg-success text-white">
              <Link2 size={14} aria-hidden />
            </span>
            {t('reports.landing.dataConnector')}
          </NavLink>
        </nav>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
      <FolderModal open={folderOpen} onClose={() => setFolderOpen(false)} onSaved={(f) => navigate(`/reports/report-group/f_${f.id}?category=all`)} />
    </div>
  )
}

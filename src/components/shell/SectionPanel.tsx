import clsx from 'clsx'
import { ChevronLeft } from 'lucide-react'
import { NavLink as RouterLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { matchesPrefix, type NavLink, type RailItem } from '@/app/navigation'
import { useDb } from '@/store/db'

interface SectionPanelProps {
  item: RailItem
  onCollapse: () => void
  onNavigate?: () => void
}

function isLinkActive(link: NavLink, pathname: string, search: string): boolean {
  const [path, query] = link.to.split('?')
  if (query) return pathname === path && search.includes(query)
  return matchesPrefix(pathname, [path, ...(link.match ?? [])])
}

/** Left menu panel: section title, sub-page links and group headings (SPEC §6). */
export function SectionPanel({ item, onCollapse, onNavigate }: SectionPanelProps) {
  const { t } = useTranslation()
  const { pathname, search } = useLocation()
  const sessions = useDb((s) => s.registerSessions)
  const openRegisters = sessions.filter((x) => !x.closedAt).length
  if (!item.panel) return null

  return (
    <div className="relative flex h-full w-panel shrink-0 flex-col border-r border-line bg-surface" data-testid="section-panel">
      <button
        type="button"
        onClick={onCollapse}
        aria-label={t('nav.collapsePanel')}
        className="absolute -right-4 top-5 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-sm hover:bg-sunken"
      >
        <ChevronLeft size={16} aria-hidden />
      </button>
      <nav aria-label={t(item.panel.title)} className="overflow-y-auto px-3 py-5">
        {item.panel.groups.map((group, index) => (
          <div key={group.heading + index} className={clsx(index > 0 && 'mt-4 border-t border-line pt-4')}>
            <h2 className={clsx('px-3 pb-2', index === 0 ? 'font-display text-title-3 text-ink' : 'text-caption uppercase tracking-wide text-muted')}>
              {t(group.heading)}
            </h2>
            <ul className="flex flex-col gap-0.5">
              {group.links.map((link) => {
                const active = isLinkActive(link, pathname, search)
                return (
                  <li key={link.to}>
                    <RouterLink
                      to={link.to}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={clsx(
                        'flex min-h-10 items-center rounded-md px-3 py-1.5 text-body transition-colors duration-fast',
                        active ? 'bg-primary-subtle font-semibold text-primary' : 'text-ink hover:bg-sunken',
                      )}
                    >
                      <span className="flex flex-col">
                        {t(link.label)}
                        {link.hint === 'openRegisters' && openRegisters > 0 && <span className="text-caption font-normal text-muted">{t('nav.openRegisters', { count: openRegisters })}</span>}
                      </span>
                    </RouterLink>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  )
}

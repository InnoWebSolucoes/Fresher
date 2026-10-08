import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { Link, NavLink as RouterLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { HELP_ICON, RAIL_ITEMS, matchesPrefix, railItemForPath, type RailItem } from '@/app/navigation'
import { canAccess, usePermissionRoles } from '@/lib/permissions'
import { useCurrentUser } from '@/store/session'
import { useDrawer } from '@/lib/drawer'
import { Wordmark } from './Wordmark'
import { LanguageToggle } from './LanguageToggle'

/** Phone navigation: the main menu and every section's pages in one slide-out sheet. */
export function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const user = useCurrentUser()
  usePermissionRoles()
  const drawer = useDrawer()
  const current = railItemForPath(pathname)
  const [expanded, setExpanded] = useState<string | null>(current?.id ?? null)

  useEffect(() => {
    if (open) setExpanded(railItemForPath(pathname)?.id ?? null)
  }, [open, pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !user) return null
  const items = RAIL_ITEMS.filter((item) => canAccess(user.role, item.id))

  const row = (item: RailItem, active: boolean) => (
    <>
      <span className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-md', active ? 'bg-accent text-on-accent' : 'bg-sunken text-ink')}>
        <item.icon size={19} strokeWidth={1.75} aria-hidden />
      </span>
      <span className="min-w-0 flex-1 text-left text-body-strong text-ink">{t(item.label)}</span>
    </>
  )

  return (
    <div className="fixed inset-0 z-[60] md:hidden" data-testid="mobile-nav">
      <button type="button" aria-label={t('common.close')} className="absolute inset-0 bg-ink/40" onClick={onClose} tabIndex={-1} />
      <nav aria-label={t('nav.mainMenu')} className="relative flex h-full w-[86vw] max-w-[360px] flex-col bg-surface shadow-lg animate-[slideInLeft_var(--dur-slow)_var(--ease)]">
        <div className="flex h-topbar shrink-0 items-center justify-between gap-3 border-b border-line px-4">
          <Wordmark />
          <button type="button" className="icon-btn" aria-label={t('common.close')} onClick={onClose}>
            <X size={20} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <ul className="flex flex-col gap-1">
            {items.map((item) => {
              const active = matchesPrefix(pathname, item.match)
              const isOpen = expanded === item.id
              return (
                <li key={item.id}>
                  {item.panel ? (
                    <>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setExpanded(isOpen ? null : item.id)}
                        className={clsx('flex w-full items-center gap-3 rounded-md px-2 py-1.5', active ? 'bg-primary-subtle' : 'hover:bg-sunken')}
                        data-testid={`mobile-nav-${item.id}`}
                      >
                        {row(item, active)}
                        <ChevronDown size={18} className={clsx('shrink-0 text-muted transition-transform', isOpen && 'rotate-180')} aria-hidden />
                      </button>
                      {isOpen && (
                        <div className="mb-2 ml-[22px] border-l border-line pl-4 pt-1">
                          {item.panel.groups.map((group, index) => (
                            <div key={group.heading + index} className={clsx(index > 0 && 'mt-2')}>
                              {index > 0 && <p className="px-2 pb-1 pt-1 text-caption uppercase tracking-wide text-muted">{t(group.heading)}</p>}
                              <ul className="flex flex-col">
                                {group.links.map((link) => (
                                  <li key={link.to}>
                                    <RouterLink
                                      to={link.to}
                                      onClick={onClose}
                                      className={({ isActive }) =>
                                        clsx('flex min-h-10 items-center rounded-md px-2 py-1.5 text-body', isActive ? 'bg-primary-subtle font-semibold text-primary' : 'text-ink hover:bg-sunken')
                                      }
                                    >
                                      {t(link.label)}
                                    </RouterLink>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <Link
                      to={item.to}
                      onClick={onClose}
                      className={clsx('flex w-full items-center gap-3 rounded-md px-2 py-1.5', active ? 'bg-primary-subtle' : 'hover:bg-sunken')}
                      data-testid={`mobile-nav-${item.id}`}
                    >
                      {row(item, active)}
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-4 py-3">
          <button
            type="button"
            className="flex items-center gap-2 text-body text-ink"
            onClick={() => {
              onClose()
              drawer.open('resources', { tab: 'help' })
            }}
          >
            <HELP_ICON size={20} strokeWidth={1.75} aria-hidden />
            {t('nav.help')}
          </button>
          <LanguageToggle />
        </div>
      </nav>
    </div>
  )
}

/** Keeps the active chip of a sideways-scrolling row in view. */
export function useActiveChipInView(key: string) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const active = ref.current?.querySelector<HTMLElement>('[aria-current="page"]')
    const row = ref.current
    if (active && row) row.scrollLeft = active.offsetLeft - (row.clientWidth - active.offsetWidth) / 2
  }, [key])
  return ref
}

/** Phones and tablets: the current section's pages as a scrollable row of tabs under the top bar. */
export function MobileSectionTabs({ item }: { item: RailItem }) {
  const { t } = useTranslation()
  const { pathname, search } = useLocation()
  const rowRef = useActiveChipInView(pathname + search)
  if (!item.panel) return null
  const links = item.panel.groups.flatMap((group) => group.links)
  return (
    <div className="sticky top-0 z-20 border-b border-line bg-surface lg:hidden" data-testid="mobile-section-tabs">
      <div ref={rowRef} className="relative flex gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none]">
        {links.map((link) => (
          <RouterLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              clsx('shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-small font-semibold', isActive ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface text-ink')
            }
          >
            {t(link.label)}
          </RouterLink>
        ))}
      </div>
    </div>
  )
}

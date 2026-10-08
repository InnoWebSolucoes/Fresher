import clsx from 'clsx'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { HELP_ICON, RAIL_ITEMS, matchesPrefix, type RailItem } from '@/app/navigation'
import { canAccess, usePermissionRoles } from '@/lib/permissions'
import { useCurrentUser } from '@/store/session'
import { useDrawer } from '@/lib/drawer'

interface RailProps {
  flyoutId: string | null
  onPanelItem: (item: RailItem) => void
}

const itemClass = (active: boolean, open: boolean) =>
  clsx(
    'group relative flex h-11 w-11 items-center justify-center rounded-md transition-colors duration-fast',
    active ? 'bg-accent text-on-accent' : open ? 'bg-rail-hover text-white' : 'text-rail-icon hover:bg-rail-hover hover:text-white',
  )

function Tooltip({ label }: { label: string }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-sm bg-ink px-2.5 py-1.5 text-small text-canvas opacity-0 shadow-md transition-opacity duration-fast group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      {label}
    </span>
  )
}

/** Icon-only main menu (SPEC §6, reference home.md §1.2). */
export function Rail({ flyoutId, onPanelItem }: RailProps) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const user = useCurrentUser()
  usePermissionRoles()
  const drawer = useDrawer()
  const items = RAIL_ITEMS.filter((item) => user && canAccess(user.role, item.id))

  return (
    <nav aria-label={t('nav.mainMenu')} className="flex w-rail shrink-0 flex-col items-center bg-rail py-3">
      <ul className="flex flex-col items-center gap-1.5">
        {items.map((item) => {
          const Icon = item.icon
          const active = matchesPrefix(pathname, item.match)
          const label = t(item.label)
          return (
            <li key={item.id}>
              {item.panel ? (
                <button
                  type="button"
                  data-testid={`rail-${item.id}`}
                  aria-label={label}
                  aria-expanded={flyoutId === item.id}
                  aria-current={active ? 'page' : undefined}
                  className={itemClass(active, flyoutId === item.id)}
                  onClick={() => onPanelItem(item)}
                >
                  <Icon size={22} strokeWidth={1.75} aria-hidden />
                  <Tooltip label={label} />
                </button>
              ) : (
                <Link
                  to={item.to}
                  data-testid={`rail-${item.id}`}
                  aria-label={label}
                  aria-current={active ? 'page' : undefined}
                  className={itemClass(active, false)}
                >
                  <Icon size={22} strokeWidth={1.75} aria-hidden />
                  <Tooltip label={label} />
                </Link>
              )}
            </li>
          )
        })}
      </ul>
      <div className="mt-auto">
        <button
          type="button"
          data-testid="rail-help"
          aria-label={t('nav.help')}
          className={itemClass(false, drawer.name === 'resources' && drawer.tab === 'help')}
          onClick={() => drawer.open('resources', { tab: 'help' })}
        >
          <HELP_ICON size={22} strokeWidth={1.75} aria-hidden />
          <Tooltip label={t('nav.help')} />
        </button>
      </div>
    </nav>
  )
}

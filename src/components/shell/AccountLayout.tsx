import clsx from 'clsx'
import { ArrowLeft } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useActiveChipInView } from './MobileNav'
import { ACCOUNT_LINKS } from '@/app/navigation'
import { TopBar } from './TopBar'
import { DrawerHost } from './DrawerHost'
import { Toaster } from './Toaster'

/** Below the large breakpoint the side card becomes a scrollable row of links. */
function LinkChips({ links }: { links: { to: string; label: string; active: boolean }[] }) {
  const ref = useActiveChipInView(links.find((link) => link.active)?.to ?? '')
  return (
    <div ref={ref} className="relative -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:hidden">
      {links.map((link) => (
        <Link
          key={link.to}
          to={link.to}
          aria-current={link.active ? 'page' : undefined}
          className={clsx(
            'shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-small font-semibold',
            link.active ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface text-ink',
          )}
        >
          {link.label}
        </Link>
      ))}
    </div>
  )
}

/** "Your account" area: its own left card, no main menu (profile-and-personal-settings.md §2). */
export function AccountLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  return (
    <div className="flex h-full flex-col">
      <TopBar minimal />
      <div className="flex min-h-0 flex-1 gap-8 overflow-y-auto overflow-x-hidden px-4 py-4 md:px-8 md:py-8">
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="card sticky top-0 p-3">
            <button type="button" onClick={() => navigate('/')} className="btn-secondary mb-3 h-9 px-3">
              <ArrowLeft size={16} aria-hidden />
              {t('common.back')}
            </button>
            <h2 className="px-3 pb-2 font-display text-title-3">{t('account.yourAccount')}</h2>
            <nav>
              {ACCOUNT_LINKS.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    clsx('flex h-10 items-center rounded-md px-3 text-body', isActive ? 'bg-primary-subtle font-semibold text-primary' : 'text-ink hover:bg-sunken')
                  }
                >
                  {t(link.label)}
                </NavLink>
              ))}
            </nav>
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <div className="mb-3 lg:hidden">
            <button type="button" onClick={() => navigate('/')} className="btn-secondary h-9 px-3">
              <ArrowLeft size={16} aria-hidden />
              {t('common.back')}
            </button>
          </div>
          <LinkChips links={ACCOUNT_LINKS.map((link) => ({ to: link.to, label: t(link.label), active: pathname.startsWith(link.to) }))} />
          <Outlet />
        </div>
      </div>
      <DrawerHost />
      <Toaster />
    </div>
  )
}

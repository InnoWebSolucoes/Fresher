import clsx from 'clsx'
import { ArrowLeft } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ACCOUNT_LINKS } from '@/app/navigation'
import { TopBar } from './TopBar'
import { DrawerHost } from './DrawerHost'
import { Toaster } from './Toaster'

/** "Your account" area: its own left card, no main menu (profile-and-personal-settings.md §2). */
export function AccountLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <div className="flex h-full flex-col">
      <TopBar minimal />
      <div className="flex min-h-0 flex-1 gap-8 overflow-y-auto px-8 py-8">
        <aside className="w-64 shrink-0">
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
          <Outlet />
        </div>
      </div>
      <DrawerHost />
      <Toaster />
    </div>
  )
}

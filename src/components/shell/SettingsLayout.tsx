import clsx from 'clsx'
import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { matchesPrefix, settingsCategoryForPath } from '@/app/navigation'

/** Shared settings sub-page layout (reference settings-business-setup.md §0). */
export function SettingsLayout() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const category = settingsCategoryForPath(pathname)

  return (
    <div className="mx-auto max-w-[1180px] px-8 py-6">
      <div className="mb-6 flex items-center gap-3">
        <Link to="/setup" className="btn-secondary h-9 px-3">
          <ArrowLeft size={16} aria-hidden />
          {t('common.back')}
        </Link>
        <p className="text-body text-muted">
          {t('settings.breadcrumb')}
          {category && <span className="text-ink"> · {t(category.title)}</span>}
        </p>
      </div>
      <div className="flex gap-8">
        {category && (
          <aside className="w-64 shrink-0">
            <nav className="card p-3" aria-label={t(category.title)}>
              <h2 className="px-3 pb-2 pt-1 font-display text-title-3">{t(category.title)}</h2>
              {category.groups.map((group, index) => (
                <div key={index} className={clsx(index > 0 && 'mt-2')}>
                  {group.heading && <p className="px-3 pb-1 pt-2 text-caption uppercase tracking-wide text-muted">{t(group.heading)}</p>}
                  {group.links.map((link) => {
                    const active = matchesPrefix(pathname, [link.to, ...(link.match ?? [])])
                    return (
                      <NavLink
                        key={link.to}
                        to={link.to}
                        aria-current={active ? 'page' : undefined}
                        className={clsx(
                          'flex h-10 items-center rounded-md px-3 text-body',
                          active ? 'bg-primary-subtle font-semibold text-primary' : 'text-ink hover:bg-sunken',
                        )}
                      >
                        {t(link.label)}
                      </NavLink>
                    )
                  })}
                </div>
              ))}
              {category.shortcuts.length > 0 && (
                <div className="mt-3 border-t border-line pt-3">
                  {category.shortcuts.map((link) => (
                    <Link key={link.to} to={link.to} className="flex h-10 items-center justify-between rounded-md px-3 text-body text-ink hover:bg-sunken">
                      {t(link.label)}
                      <ArrowUpRight size={16} className="text-muted" aria-hidden />
                    </Link>
                  ))}
                </div>
              )}
            </nav>
          </aside>
        )}
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

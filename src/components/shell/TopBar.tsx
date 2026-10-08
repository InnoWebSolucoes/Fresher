import { useMemo, useRef, useState } from 'react'
import { Bell, ChartColumn, ChevronRight, Menu, MessageCircle, Rocket, Search, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Wordmark } from './Wordmark'
import { UserMenu } from './UserMenu'
import { LanguageToggle } from './LanguageToggle'
import { useDrawer } from '@/lib/drawer'
import { canAccess, usePermissionRoles } from '@/lib/permissions'
import { initials, useCurrentUser } from '@/store/session'
import { useDismiss } from '@/lib/useDismiss'
import { useDb } from '@/store/db'

/** Full-width top bar (reference home.md §1.1, top-bar.md). */
export function TopBar({ minimal = false, onMenu }: { minimal?: boolean; onMenu?: () => void }) {
  const { t } = useTranslation()
  const user = useCurrentUser()
  usePermissionRoles()
  const drawer = useDrawer()
  const [menuOpen, setMenuOpen] = useState(false)
  const avatarRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  useDismiss([avatarRef, menuRef], menuOpen, () => setMenuOpen(false))
  const notifications = useDb((s) => s.notifications)
  const conversations = useDb((s) => s.conversations)
  const payouts = useDb((s) => s.payouts)
  const unreadNotifications = useMemo(() => notifications.filter((n) => !n.read).length, [notifications])
  const unreadMessages = useMemo(() => conversations.some((c) => c.unread && c.status === 'open'), [conversations])
  const payoutsInTransit = useMemo(() => payouts.filter((p) => p.status === 'in_transit').length, [payouts])

  if (!user) return null
  const isManager = canAccess(user.role, 'settings')

  return (
    <header className="relative z-40 flex h-topbar shrink-0 items-center justify-between gap-2 border-b border-line bg-surface px-2 md:px-4">
      <div className="flex min-w-0 items-center gap-1">
        {onMenu && (
          <button type="button" className="icon-btn md:hidden" aria-label={t('nav.mainMenu')} onClick={onMenu} data-testid="mobile-menu-button">
            <Menu size={22} strokeWidth={1.75} aria-hidden />
          </button>
        )}
        <Link to="/calendar" aria-label={t('topbar.goToCalendar')} className="min-w-0 rounded-md">
          <Wordmark compact />
        </Link>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 md:gap-1">
        {!minimal && (
          <>
            {isManager && (
              <button type="button" className="btn-primary mr-2 hidden h-9 pl-3 pr-2.5 lg:inline-flex" onClick={() => drawer.open('resources', { tab: 'guides' })}>
                <Rocket size={17} aria-hidden />
                {t('topbar.continueSetup')}
                <ChevronRight size={16} aria-hidden />
              </button>
            )}
            <button type="button" className="icon-btn" aria-label={t('topbar.search')} onClick={() => drawer.open('search')}>
              <Search size={21} strokeWidth={1.75} aria-hidden />
            </button>
            {isManager && (
              <button
                type="button"
                className="icon-btn hidden md:inline-flex"
                aria-label={t('topbar.performanceInsights')}
                onClick={() => drawer.open('performance-insights')}
              >
                <ChartColumn size={21} strokeWidth={1.75} aria-hidden />
              </button>
            )}
            <button type="button" className="icon-btn relative" aria-label={t('topbar.notifications')} onClick={() => drawer.open('notifications', { tab: 'appointments' })}>
              <Bell size={21} strokeWidth={1.75} aria-hidden />
              {unreadNotifications > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white" data-testid="notifications-badge">
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </span>
              )}
            </button>
            {canAccess(user.role, 'connect') && (
              <Link to="/connect" className="icon-btn relative hidden md:inline-flex" aria-label={t('topbar.inbox')}>
                <MessageCircle size={21} strokeWidth={1.75} aria-hidden />
                {unreadMessages && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent ring-2 ring-surface" aria-hidden />}
              </Link>
            )}
            {isManager && (
              <button type="button" className="icon-btn relative hidden md:inline-flex" aria-label={t('topbar.wallet')} onClick={() => drawer.open('wallet', { tab: 'accounts' })}>
                <Wallet size={21} strokeWidth={1.75} aria-hidden />
                {payoutsInTransit > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{payoutsInTransit}</span>
                )}
              </button>
            )}
          </>
        )}
        <LanguageToggle className="ml-2 hidden md:inline-flex" />
        <div className="relative ml-1 md:ml-2">
          <button
            ref={avatarRef}
            type="button"
            data-testid="user-menu-button"
            aria-label={t('topbar.openUserMenu')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-subtle font-display text-body-strong text-primary hover:ring-2 hover:ring-primary/30"
          >
            {initials(user)}
          </button>
          {menuOpen && (
            <div ref={menuRef}>
              <UserMenu onClose={() => setMenuOpen(false)} />
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

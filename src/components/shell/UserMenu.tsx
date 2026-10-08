import { Gift, Languages, LifeBuoy, LogOut, ShieldCheck, Settings2, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { logout } from '@/api/auth'
import { LanguageToggle } from './LanguageToggle'
import { useDrawer } from '@/lib/drawer'
import { initials, useCurrentUser } from '@/store/session'
import { toast } from '@/store/toast'

function MenuItem({ icon, children, onClick }: { icon: ReactNode; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-body text-ink hover:bg-sunken">
      <span className="text-muted">{icon}</span>
      {children}
    </button>
  )
}

/** Avatar menu (reference profile-and-personal-settings.md §1). */
export function UserMenu({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const user = useCurrentUser()
  const navigate = useNavigate()
  const drawer = useDrawer()
  if (!user) return null

  const go = (to: string) => {
    onClose()
    navigate(to)
  }

  return (
    <div role="menu" className="absolute right-0 top-12 w-80 rounded-lg border border-line bg-raised p-2 shadow-md">
      <div className="flex flex-col items-center gap-2 px-3 pb-3 pt-4 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-subtle font-display text-title-3 text-primary">{initials(user)}</span>
        <div>
          <p className="text-body-strong text-ink">
            {user.firstName} {user.lastName}
          </p>
          <p className="text-small text-muted">{t('topbar.noReviewsYet')}</p>
        </div>
      </div>
      <button
        type="button"
        role="menuitem"
        onClick={() => go('/user-account/personal-settings/personal-info')}
        className="mb-1 flex w-full items-center gap-3 rounded-md bg-accent-subtle px-3 py-2.5 text-left"
      >
        <ShieldCheck size={18} className="text-warning" aria-hidden />
        <span>
          <span className="block text-body-strong text-ink">{t('topbar.verifyMobile')}</span>
          <span className="block text-small text-muted">{t('topbar.verifyMobileSub')}</span>
        </span>
      </button>
      <div className="border-t border-line py-1">
        <MenuItem icon={<UserRound size={18} />} onClick={() => go('/user-account/profile')}>
          {t('topbar.myProfile')}
        </MenuItem>
        <MenuItem icon={<Settings2 size={18} />} onClick={() => go('/user-account/personal-settings')}>
          {t('topbar.personalSettings')}
        </MenuItem>
      </div>
      <div className="border-t border-line pt-1">
        <MenuItem
          icon={<Gift size={18} />}
          onClick={() => {
            onClose()
            drawer.open('referral')
          }}
        >
          {t('topbar.referral')}
        </MenuItem>
        <MenuItem
          icon={<LifeBuoy size={18} />}
          onClick={() => {
            onClose()
            drawer.open('resources', { tab: 'help' })
          }}
        >
          {t('topbar.helpAndSupport')}
        </MenuItem>
        <div className="flex items-center gap-3 px-3 py-2 text-body text-ink">
          <Languages size={18} className="shrink-0 text-muted" aria-hidden />
          <span className="flex-1">{t('language.label')}</span>
          <LanguageToggle />
        </div>
        <MenuItem
          icon={<LogOut size={18} />}
          onClick={async () => {
            onClose()
            await logout()
            toast(t('topbar.loggedOut'))
            navigate('/login', { replace: true })
          }}
        >
          {t('topbar.logOut')}
        </MenuItem>
      </div>
    </div>
  )
}

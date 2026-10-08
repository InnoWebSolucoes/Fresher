import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Star } from 'lucide-react'
import clsx from 'clsx'
import { Button, Modal } from '@/components/ui'
import { useDb } from '@/store/db'
import { useCurrentUser } from '@/store/session'
import { defaultProfile, usePanels, type OnlineProfile } from '@/api/panels'
import type { ID } from '@/types'

/** The logged-in user's team member record (may be missing). */
export function useMyTeamMember() {
  const user = useCurrentUser()
  const members = useDb((s) => s.teamMembers)
  return useMemo(() => members.find((m) => m.id === user?.teamMemberId) ?? null, [members, user?.teamMemberId])
}

/** The user's online profile (stored in the panels store, defaulted from the user). */
export function useOnlineProfile(userId: ID | undefined): OnlineProfile {
  const stored = usePanels((s) => (userId ? s.profiles[userId] : undefined))
  const users = useDb((s) => s.users)
  return useMemo(() => stored ?? (userId ? defaultProfile(userId) : defaultProfile('')),
    // users: the default display name follows the user's name
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stored, userId, users])
}

/** True once the persisted panels store has loaded from browser storage. */
export function usePanelsHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => usePanels.persist.hasHydrated())
  useEffect(() => {
    if (usePanels.persist.hasHydrated()) setHydrated(true)
    return usePanels.persist.onFinishHydration(() => setHydrated(true))
  }, [])
  return hydrated
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Five stars, filled up to `value`. */
export function Stars({ value, size = 16, className }: { value: number; size?: number; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-0.5', className)} aria-label={`${value} / 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} aria-hidden className={i <= Math.round(value) ? 'fill-warning text-warning' : 'text-line-strong'} />
      ))}
    </span>
  )
}

/** "This is disabled in the demo" explanation for irreversible account actions. */
export function DisabledInDemoModal({ action, open, onClose }: { action: string; open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={t('account.common.disabledTitle')}
      footer={
        <Button variant="primary" onClick={onClose}>
          {t('account.common.gotIt')}
        </Button>
      }
    >
      <p className="text-body text-muted">{t('account.common.disabledBody', { action })}</p>
    </Modal>
  )
}

/** Section card with a heading, description and optional action on the right. */
export function SettingsCard({ title, body, action, children, className }: { title: ReactNode; body?: ReactNode; action?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <section className={clsx('card p-6', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-title-3 text-ink">{title}</h2>
          {body && <p className="mt-1 text-body text-muted">{body}</p>}
        </div>
        {action}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </section>
  )
}

/** Image collage used on the portfolio intro (original artwork, no stock photos). */
export function CollageArt() {
  const tiles = ['bg-primary/25', 'bg-accent/40', 'bg-primary-subtle', 'bg-info-subtle', 'bg-accent-subtle', 'bg-primary/15', 'bg-success-subtle']
  const spans = ['row-span-2', '', '', 'row-span-2', '', '', 'col-span-2']
  return (
    <div className="grid aspect-[4/3] grid-cols-3 grid-rows-4 gap-3" aria-hidden>
      {tiles.map((c, i) => (
        <div key={i} className={clsx('relative overflow-hidden rounded-lg', c, spans[i])}>
          <span className="absolute bottom-3 left-3 h-2 w-10 rounded-full bg-surface/70" />
          <span className="absolute right-3 top-3 h-6 w-6 rounded-full bg-surface/60" />
        </div>
      ))}
    </div>
  )
}

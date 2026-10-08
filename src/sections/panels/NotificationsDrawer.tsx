import clsx from 'clsx'
import { Bell, CalendarDays, Coins, Filter, Settings, ShoppingBag, Star, Zap, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { DrawerProps } from '@/app/sectionRegistry'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { Button, EmptyState, Menu, MenuButton } from '@/components/ui'
import { markNotificationsRead } from '@/api/messaging'
import { markNotificationRead } from '@/api/panels'
import type { AppNotification } from '@/types'
import { BottomTabs, useTimeAgo } from './shared'

type Tab = 'appointments' | 'reviews' | 'tips' | 'online-sales' | 'actions'
const TABS: { value: Tab; db: AppNotification['tab']; icon: LucideIcon }[] = [
  { value: 'appointments', db: 'appointments', icon: CalendarDays },
  { value: 'reviews', db: 'reviews', icon: Star },
  { value: 'tips', db: 'tips', icon: Coins },
  { value: 'online-sales', db: 'online_sales', icon: ShoppingBag },
  { value: 'actions', db: 'actions', icon: Zap },
]

type ActionFilter = 'all' | 'messages' | 'inventory' | 'payouts' | 'other'
const actionKind = (n: AppNotification): Exclude<ActionFilter, 'all'> => {
  const title = n.title.toLowerCase()
  // Titles are stored in the language they were created in (English or Portuguese).
  if (/message|mensagem/.test(title)) return 'messages'
  if (title.includes('stock')) return 'inventory'
  if (/payout|transferência/.test(title)) return 'payouts'
  return 'other'
}

/** Notifications drawer with a bottom tab bar (top-bar.md §4). */
export function NotificationsDrawer({ params }: DrawerProps) {
  const { t } = useTranslation()
  const drawer = useDrawer()
  const navigate = useNavigate()
  const notifications = useDb((s) => s.notifications)
  const workspaceId = useDb((s) => s.workspace.id)
  const raw = params.get('tab')
  const tab = TABS.find((x) => x.value === raw) ?? TABS[0]
  const [filter, setFilter] = useState<ActionFilter>('all')

  const unread = useMemo(() => {
    const map: Partial<Record<AppNotification['tab'], number>> = {}
    notifications.forEach((n) => {
      if (!n.read) map[n.tab] = (map[n.tab] ?? 0) + 1
    })
    return map
  }, [notifications])

  const title = t(`panels.notifications.tabs.${tab.value}`)

  return (
    <div className="flex h-full flex-col" aria-label={t('drawers.notifications')}>
      <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4 md:px-6 md:pt-6">
        <h2 className="min-w-0 font-display text-title-2 text-ink md:text-title-1">{title}</h2>
        <div className="flex shrink-0 items-center gap-2">
          {tab.value === 'reviews' && (
            <Button size="sm" variant="link" onClick={() => navigate('/clients/online-reputation?tab=all')}>
              {t('panels.notifications.seeAllReviews')}
            </Button>
          )}
          <button
            type="button"
            className="icon-btn rounded-full border border-line"
            aria-label={t('panels.notifications.settings')}
            title={t('panels.notifications.settings')}
            onClick={() => navigate(`/user-account/workspaces/${workspaceId}/settings?d_prefs=1`)}
          >
            <Settings size={18} aria-hidden />
          </button>
        </div>
      </div>
      {tab.value === 'actions' && (
        <div className="px-4 pb-2 md:px-6">
          <Menu
            align="left"
            trigger={({ open, toggle }) => (
              <MenuButton open={open} toggle={toggle}>
                <Filter size={16} aria-hidden />
                {t(`panels.notifications.filters.${filter}`)}
              </MenuButton>
            )}
            groups={[{ items: (['all', 'messages', 'inventory', 'payouts', 'other'] as const).map((f) => ({ label: t(`panels.notifications.filters.${f}`), checked: filter === f, onSelect: () => setFilter(f) })) }]}
          />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 md:px-6">
        <NotificationList key={tab.value} tab={tab.value} dbTab={tab.db} icon={tab.icon} filter={tab.value === 'actions' ? filter : 'all'} />
      </div>
      <BottomTabs<Tab>
        value={tab.value}
        onChange={(v) => drawer.update({ tab: v })}
        items={TABS.map((x) => ({ value: x.value, label: t(`panels.notifications.tabs.${x.value}`), icon: x.icon, badge: x.value === tab.value ? 0 : unread[x.db] }))}
      />
    </div>
  )
}

const EMPTY_ACTION: Record<Tab, { label: string; to: string }> = {
  appointments: { label: 'openCalendar', to: '/calendar' },
  reviews: { label: 'seeAllReviews', to: '/clients/online-reputation?tab=all' },
  tips: { label: 'viewSales', to: '/sales/sales-list' },
  'online-sales': { label: 'viewOrders', to: '/sales/store-orders' },
  actions: { label: 'openHome', to: '/dashboard' },
}

function NotificationList({ tab, dbTab, icon: Icon, filter }: { tab: Tab; dbTab: AppNotification['tab']; icon: LucideIcon; filter: ActionFilter }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const timeAgo = useTimeAgo()
  const notifications = useDb((s) => s.notifications)
  const [fresh, setFresh] = useState<string[]>([])

  const list = useMemo(
    () => notifications.filter((n) => n.tab === dbTab && (filter === 'all' || actionKind(n) === filter)).sort((a, b) => b.at.localeCompare(a.at)),
    [notifications, dbTab, filter],
  )
  const unreadKey = notifications
    .filter((n) => n.tab === dbTab && !n.read)
    .map((n) => n.id)
    .join(',')

  // Opening a tab marks its notifications as read; keep them under "New" while the drawer stays open.
  useEffect(() => {
    if (!unreadKey) return
    const ids = unreadKey.split(',')
    setFresh((prev) => Array.from(new Set([...prev, ...ids])))
    void markNotificationsRead(dbTab)
  }, [unreadKey, dbTab])

  if (list.length === 0) {
    const action = EMPTY_ACTION[tab]
    return (
      <EmptyState
        className="mt-10"
        icon={<Bell size={24} />}
        title={t('panels.notifications.emptyTitle')}
        body={t('panels.notifications.emptyBody')}
        action={
          <Button size="sm" onClick={() => navigate(action.to)}>
            {t(`panels.notifications.emptyActions.${action.label}`)}
          </Button>
        }
      />
    )
  }

  const groups = [
    { key: 'new', items: list.filter((n) => fresh.includes(n.id)) },
    { key: 'read', items: list.filter((n) => !fresh.includes(n.id)) },
  ].filter((g) => g.items.length)

  const open = (n: AppNotification) => {
    if (!n.read) void markNotificationRead(n.id)
    if (n.link) navigate(n.link)
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <section key={g.key}>
          <h3 className="mb-3 font-display text-title-3 text-ink">{t(`panels.notifications.groups.${g.key}`)}</h3>
          <ul className="flex flex-col gap-3">
            {g.items.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => open(n)} className={clsx('card flex w-full items-start gap-3 p-4 text-left transition-colors hover:border-line-strong', g.key === 'new' && 'border-primary/40 bg-primary-subtle/30')}>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      {g.key === 'new' && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label={t('panels.common.unread')} />}
                      <span className="text-body-strong text-ink">{n.title}</span>
                    </span>
                    <span className="block text-caption text-muted">{timeAgo(n.at)}</span>
                    <span className="mt-1.5 block text-body text-ink">{n.body}</span>
                  </span>
                  <span className="relative shrink-0">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-subtle text-small font-semibold text-primary" aria-hidden>
                      {n.initials ?? <Icon size={18} />}
                    </span>
                    <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-on-primary ring-2 ring-surface" aria-hidden>
                      <Icon size={11} />
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

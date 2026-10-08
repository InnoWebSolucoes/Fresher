import clsx from 'clsx'
import { parseISO } from 'date-fns'
import { format } from '@/lib/dates'
import { ArrowRight, Check, ChevronRight, CreditCard, Rocket, Star, Store, type LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { todayISO } from '@/lib/time'
import { Button, toast } from '@/components/ui'
import { completeGuide, usePanels } from '@/api/panels'
import type { DbData } from '@/types'

type GuideId = 'legendary-learner' | 'setup-superstar' | 'bookings-boss' | 'payments-pro'
type GuideData = Pick<DbData, 'services' | 'teamMembers' | 'shiftPatterns' | 'clients' | 'products' | 'appointments' | 'sales' | 'settings' | 'locations' | 'automations' | 'reviews' | 'addOns' | 'giftCards' | 'payouts'>

interface Task {
  key: string
  done: (d: GuideData, today: string) => boolean
  /** Page to open, or a drawer with params. */
  to: string | { drawer: string; params?: Record<string, string> }
}

interface Guide {
  id: GuideId
  icon: LucideIcon
  /** Gradient for the header and badge. */
  gradient: string
  tasks: Task[]
}

const dayOf = (iso?: string) => (iso ? format(parseISO(iso), 'yyyy-MM-dd') : '')

export const GUIDES: Guide[] = [
  {
    id: 'legendary-learner',
    icon: Star,
    gradient: 'from-[#2D4FA8] to-[#3B82D6]',
    tasks: [
      { key: 'createAccount', done: () => true, to: '/user-account/profile' },
      { key: 'firstAppointment', done: (d) => d.appointments.length > 0, to: { drawer: 'new-appointment' } },
      { key: 'checkoutAppointment', done: (d) => d.sales.some((s) => s.appointmentId && s.status === 'completed'), to: '/calendar' },
    ],
  },
  {
    id: 'setup-superstar',
    icon: Rocket,
    gradient: 'from-primary-active to-primary',
    tasks: [
      { key: 'serviceMenu', done: (d) => d.services.some((s) => !s.archived), to: '/catalogue/services' },
      { key: 'teamMembers', done: (d) => d.teamMembers.filter((m) => !m.archived).length > 1, to: '/team/team-members' },
      { key: 'workingHours', done: (d) => d.shiftPatterns.length > 0, to: '/team/scheduled-shifts' },
      { key: 'clientList', done: (d) => d.clients.some((c) => !c.deletedAt), to: '/clients/list' },
      { key: 'productList', done: (d) => d.products.some((p) => !p.archived), to: '/catalogue/products' },
    ],
  },
  {
    id: 'bookings-boss',
    icon: Store,
    gradient: 'from-[#B26B00] to-[#E0A21C]',
    tasks: [
      { key: 'onlineBookings', done: (d) => d.settings.onlineBookingsEnabled, to: '/online-presence/locations' },
      { key: 'marketplace', done: (d) => d.locations.some((l) => l.marketplace.listed), to: '/online-presence/locations' },
      { key: 'bookToday', done: (d, today) => d.appointments.some((a) => dayOf(a.createdAt) === today), to: { drawer: 'new-appointment' } },
      { key: 'reminders', done: (d) => d.automations.some((a) => a.section === 'reminders' && a.enabled), to: '/marketing/automated-messages' },
      { key: 'firstReview', done: (d) => d.reviews.length > 0, to: '/clients/online-reputation' },
    ],
  },
  {
    id: 'payments-pro',
    icon: CreditCard,
    gradient: 'from-[#4B1B63] to-[#9B4BC0]',
    tasks: [
      { key: 'activatePayments', done: (d) => d.addOns.some((a) => a.slug === 'payments' && a.status === 'active'), to: '/payments/payment-processing' },
      { key: 'paymentPolicy', done: (d) => d.settings.paymentPolicy.depositsEnabled, to: '/setup/payments/payment-policy' },
      { key: 'saleToday', done: (d, today) => d.sales.some((s) => s.kind === 'sale' && s.status === 'completed' && dayOf(s.completedAt ?? s.createdAt) === today), to: { drawer: 'checkout' } },
      { key: 'giftCard', done: (d) => d.giftCards.length > 0, to: { drawer: 'checkout', params: { d_add: 'gift_card' } } },
      { key: 'payout', done: (d) => d.payouts.length > 0, to: { drawer: 'wallet', params: { tab: 'accounts' } } },
    ],
  },
]

function useGuideData(): GuideData {
  const services = useDb((s) => s.services)
  const teamMembers = useDb((s) => s.teamMembers)
  const shiftPatterns = useDb((s) => s.shiftPatterns)
  const clients = useDb((s) => s.clients)
  const products = useDb((s) => s.products)
  const appointments = useDb((s) => s.appointments)
  const sales = useDb((s) => s.sales)
  const settings = useDb((s) => s.settings)
  const locations = useDb((s) => s.locations)
  const automations = useDb((s) => s.automations)
  const reviews = useDb((s) => s.reviews)
  const addOns = useDb((s) => s.addOns)
  const giftCards = useDb((s) => s.giftCards)
  const payouts = useDb((s) => s.payouts)
  return useMemo(
    () => ({ services, teamMembers, shiftPatterns, clients, products, appointments, sales, settings, locations, automations, reviews, addOns, giftCards, payouts }),
    [services, teamMembers, shiftPatterns, clients, products, appointments, sales, settings, locations, automations, reviews, addOns, giftCards, payouts],
  )
}

/** Task completion for every guide, computed from the workspace data. */
export function useGuideProgress() {
  const data = useGuideData()
  return useMemo(() => {
    const today = todayISO()
    return Object.fromEntries(GUIDES.map((g) => [g.id, g.tasks.map((task) => task.done(data, today))])) as Record<GuideId, boolean[]>
  }, [data])
}

const hexClip = { clipPath: 'polygon(50% 0, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)' }

function HexBadge({ guide, size, done, active }: { guide: Guide; size: number; done?: boolean; active?: boolean }) {
  const Icon = guide.icon
  return (
    <span className={clsx('relative inline-flex shrink-0', active && 'drop-shadow-md')} style={{ width: size, height: size }}>
      <span className={clsx('absolute inset-0 bg-gradient-to-br', guide.gradient)} style={hexClip} />
      <span className="relative m-auto text-white">
        <Icon size={Math.round(size * 0.42)} aria-hidden />
      </span>
      {done && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-success text-white ring-2 ring-surface">
          <Check size={12} aria-hidden />
        </span>
      )}
    </span>
  )
}

/** Guides tab: "Guides to Greatness" overview and each guide's task list (top-bar.md §1). */
export function GuidesPanel({ params }: { params: URLSearchParams }) {
  const progress = useGuideProgress()
  const completed = usePanels((s) => s.guidesCompleted)
  const param = params.get('d_guide')
  const firstOpen = GUIDES.find((g) => !completed.includes(g.id) && progress[g.id].some((x) => !x)) ?? GUIDES[1]
  if (param === 'overview') return <GuidesOverview progress={progress} completed={completed} next={firstOpen.id} />
  const guide = GUIDES.find((g) => g.id === param) ?? firstOpen
  return <GuideView guide={guide} progress={progress} completed={completed} />
}

function GuidesOverview({ progress, completed, next }: { progress: Record<GuideId, boolean[]>; completed: string[]; next: GuideId }) {
  const { t } = useTranslation()
  const drawer = useDrawer()
  return (
    <div className="flex min-h-full flex-col px-4 pb-6 pt-8 md:px-6">
      <h2 className="text-center font-display text-title-2 text-ink">{t('panels.guides.overviewTitle')}</h2>
      <ol className="mx-auto mt-8 flex w-full max-w-sm flex-col gap-3">
        {GUIDES.map((g, i) => {
          const done = completed.includes(g.id) || progress[g.id].every(Boolean)
          const count = progress[g.id].filter(Boolean).length
          return (
            <li key={g.id} className={clsx('flex', i % 2 === 1 && 'justify-end')}>
              <button type="button" onClick={() => drawer.update({ d_guide: g.id })} className="flex w-56 flex-col items-center gap-2 rounded-lg p-3 text-center hover:bg-sunken">
                <HexBadge guide={g} size={84} done={done} />
                <span className="text-body-strong text-ink">{t(`panels.guides.${g.id}.name`)}</span>
                <span className="text-caption text-muted">{t('panels.guides.progress', { done: count, total: g.tasks.length })}</span>
              </button>
            </li>
          )
        })}
      </ol>
      <Button variant="primary" size="lg" className="mt-auto w-full rounded-full" onClick={() => drawer.update({ d_guide: next })}>
        {t('common.continue')}
      </Button>
    </div>
  )
}

function GuideView({ guide, progress, completed }: { guide: Guide; progress: Record<GuideId, boolean[]>; completed: string[] }) {
  const { t } = useTranslation()
  const drawer = useDrawer()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const states = progress[guide.id]
  const allDone = states.every(Boolean)
  const isCompleted = completed.includes(guide.id)

  const go = (task: Task) => {
    if (typeof task.to === 'string') navigate(task.to)
    else drawer.open(task.to.drawer, task.to.params ?? {})
  }

  const complete = async () => {
    if (!allDone) {
      const nextTask = guide.tasks.find((_, i) => !states[i])
      toast(t('panels.guides.finishFirst'))
      if (nextTask) go(nextTask)
      return
    }
    setBusy(true)
    try {
      await completeGuide(guide.id)
      toast(t('panels.guides.completedToast', { name: t(`panels.guides.${guide.id}.name`) }))
      const next = GUIDES.find((g) => g.id !== guide.id && !completed.includes(g.id))
      if (next) drawer.update({ d_guide: next.id })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pb-8">
      <div className={clsx('bg-gradient-to-br px-4 pb-5 pt-5 text-white md:px-6', guide.gradient)}>
        <button type="button" onClick={() => drawer.update({ d_guide: 'overview' })} className="mb-3 inline-flex h-8 items-center gap-1.5 rounded-full bg-white/15 px-3 text-small hover:bg-white/25">
          <ArrowRight size={14} className="rotate-180" aria-hidden />
          {t('common.back')}
        </button>
        <p className="text-body-strong opacity-90">{t(`panels.guides.${guide.id}.name`)}</p>
        <h2 className="font-display text-title-2">{t(`panels.guides.${guide.id}.subtitle`)}</h2>
        <div className="mt-4 flex gap-2" role="tablist" aria-label={t('panels.guides.overviewTitle')}>
          {GUIDES.map((g) => (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={g.id === guide.id}
              aria-label={t(`panels.guides.${g.id}.name`)}
              title={t(`panels.guides.${g.id}.name`)}
              onClick={() => drawer.update({ d_guide: g.id })}
              className={clsx('rounded-md p-0.5 transition-opacity', g.id === guide.id ? 'opacity-100 ring-2 ring-white/80' : 'opacity-70 hover:opacity-100')}
            >
              <HexBadge guide={g} size={40} done={completed.includes(g.id) || progress[g.id].every(Boolean)} />
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-5 md:px-6">
        <p className="mb-3 text-small text-muted">{t('panels.guides.progress', { done: states.filter(Boolean).length, total: states.length })}</p>
        <ol className="flex flex-col gap-3">
          {guide.tasks.map((task, i) => {
            const done = states[i]
            return (
              <li key={task.key}>
                <button type="button" onClick={() => go(task)} className="card flex w-full items-center gap-4 px-5 py-4 text-left hover:border-line-strong">
                  <span className={clsx('flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-body-strong', done ? 'border-success text-success' : 'border-primary text-primary')}>{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-body-strong text-ink">{t(`panels.guides.tasks.${task.key}.title`)}</span>
                    {!done && <span className="block text-small text-muted">{t(`panels.guides.tasks.${task.key}.hint`)}</span>}
                  </span>
                  {done ? (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-success text-white" aria-label={t('panels.guides.done')}>
                      <Check size={16} aria-hidden />
                    </span>
                  ) : (
                    <ChevronRight size={18} className="text-muted" aria-label={t('panels.guides.start')} />
                  )}
                </button>
              </li>
            )
          })}
        </ol>
        {isCompleted ? (
          <p className="mt-4 inline-flex items-center gap-2 text-body-strong text-success">
            <Check size={16} aria-hidden /> {t('panels.guides.guideCompleted')}
          </p>
        ) : (
          <Button variant="link" className="mt-4" loading={busy} iconRight={<ArrowRight size={16} />} onClick={complete}>
            {t('panels.guides.complete')}
          </Button>
        )}

        <div className="card mt-6 p-5">
          <h3 className="font-display text-title-3 text-ink">{t('panels.guides.helpCenter.title')}</h3>
          <p className="mt-1 text-body text-muted">{t('panels.guides.helpCenter.body')}</p>
          <Button className="mt-4" onClick={() => drawer.update({ tab: 'help', d_view: 'help-center', d_guide: undefined })}>
            {t('panels.guides.helpCenter.cta')}
          </Button>
        </div>
      </div>
    </div>
  )
}

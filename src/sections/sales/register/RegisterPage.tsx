import clsx from 'clsx'
import { endOfMonth, format, parseISO, startOfMonth, startOfWeek, startOfYear, subDays, subMonths } from 'date-fns'
import { ArrowRight, Minus, Plus, Store, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button, Chip, EmptyState, IntroPage, LearnMore, Menu, Page, PageHeader, PageSkeleton, usePageLoading } from '@/components/ui'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { now, toISODate, useNow } from '@/lib/time'
import { fmtDate, money } from '@/lib/format'
import type { CashRegister, RegisterSession } from '@/types'
import { OptionsMenu, PILL } from '../shared/ui'
import { dayOf } from '../shared/data'
import { RegisterFlowHost, type RegisterFlow } from './flows'
import { closedBalance, registerBreakdown, sessionTimeRange } from './math'

type Period = 'today' | 'week' | 'month' | 'lastMonth' | 'year' | 'all'
const PERIODS: Period[] = ['today', 'week', 'month', 'lastMonth', 'year', 'all']
const PAGE_SIZE = 20

function periodRange(period: Period): [string, string] | null {
  const today = now()
  const iso = toISODate
  switch (period) {
    case 'today':
      return [iso(today), iso(today)]
    case 'week':
      return [iso(startOfWeek(today, { weekStartsOn: 1 })), iso(today)]
    case 'month':
      return [iso(startOfMonth(today)), iso(today)]
    case 'lastMonth':
      return [iso(startOfMonth(subMonths(today, 1))), iso(endOfMonth(subMonths(today, 1)))]
    case 'year':
      return [iso(startOfYear(today)), iso(today)]
    default:
      return null
  }
}

function RegisterArt() {
  const { t } = useTranslation()
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-primary-subtle p-8">
      <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-accent/40" aria-hidden />
      <div className="relative mx-auto max-w-[280px] rounded-xl bg-surface p-5 shadow-md">
        <div className="flex items-center justify-between">
          <p className="text-small text-muted">{t('sales.register.balance', { name: t('sales.register.setup.namePlaceholder') })}</p>
          <Chip tone="success">{t('sales.register.open.status')}</Chip>
        </div>
        <p className="mt-1 font-display text-title-1 text-ink">€325.50</p>
        <div className="mt-4 flex flex-col gap-2">
          {[
            ['€160', true],
            ['-€20', false],
            ['€30', true],
          ].map(([amount, plus]) => (
            <div key={String(amount)} className="flex items-center gap-3 rounded-md bg-sunken px-3 py-2">
              <span className={clsx('flex h-7 w-7 items-center justify-center rounded-full', plus ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger')}>{plus ? <Plus size={14} aria-hidden /> : <Minus size={14} aria-hidden />}</span>
              <span className="h-2 flex-1 rounded-full bg-line" />
              <span className="text-small font-semibold text-ink">{amount}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function RegisterPage() {
  const { t } = useTranslation()
  const loading = usePageLoading()
  const drawer = useDrawer()
  const navigate = useNavigate()
  useNow()
  const registers = useDb((s) => s.registers)
  const sessions = useDb((s) => s.registerSessions)
  const payments = useDb((s) => s.payments)
  const sales = useDb((s) => s.sales)
  const locations = useDb((s) => s.locations)
  const customMethods = useDb((s) => s.settings.customPaymentMethods)
  const [period, setPeriod] = useState<Period>('all')
  const [page, setPage] = useState(0)
  const [flow, setFlow] = useState<RegisterFlow | null>(null)

  const active = useMemo(() => registers.filter((r) => !r.archived).sort((a, b) => a.order - b.order), [registers])
  const registerById = useMemo(() => new Map(registers.map((r) => [r.id, r])), [registers])
  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? ''
  const missing = locations.filter((l) => !active.some((r) => r.locationId === l.id))

  const closed = useMemo(() => {
    const range = periodRange(period)
    return sessions
      .filter((s) => s.closedAt && registerById.has(s.registerId))
      .filter((s) => !range || (dayOf(s.openedAt) >= range[0] && dayOf(s.openedAt) <= range[1]))
      .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
      .map((s) => {
        const register = registerById.get(s.registerId)
        const breakdown = registerBreakdown(s, register, payments, sales, customMethods)
        return { session: s, register, balance: closedBalance(s, breakdown.cash.expected) }
      })
  }, [sessions, registerById, period, payments, sales, customMethods])

  const openedText = (session: RegisterSession) => {
    const at = parseISO(session.openedAt)
    const name = session.openedBy.split(' ')[0]
    const time = format(at, 'HH:mm')
    const day = dayOf(session.openedAt)
    if (day === toISODate(now())) return t('sales.register.openedToday', { name, time })
    if (day === toISODate(subDays(now(), 1))) return t('sales.register.openedYesterday', { name, time })
    return t('sales.register.openedOn', { name, date: fmtDate(at), time })
  }

  if (loading)
    return (
      <Page wide>
        <PageSkeleton rows={4} />
      </Page>
    )

  if (!active.length)
    return (
      <Page wide>
        <IntroPage
          title={t('sales.register.intro.title')}
          body={t('sales.register.intro.body')}
          bullets={[t('sales.register.intro.bullet1'), t('sales.register.intro.bullet2'), t('sales.register.intro.bullet3')]}
          primary={{ label: t('sales.register.intro.start'), onClick: () => setFlow({ kind: 'setup' }) }}
          art={<RegisterArt />}
        />
        <RegisterFlowHost flow={flow} onClose={() => setFlow(null)} />
      </Page>
    )

  const card = (register: CashRegister) => {
    const session = sessions.find((s) => s.registerId === register.id && !s.closedAt)
    const balance = session ? registerBreakdown(session, register, payments, sales, customMethods).cash.expected : 0
    return (
      <section key={register.id} className="card p-8" data-testid="register-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-body-lg text-ink">{t('sales.register.balance', { name: register.name })}</p>
            {locations.length > 1 && <p className="text-small text-muted">{locationName(register.locationId)}</p>}
          </div>
          <Chip tone={session ? 'success' : 'warning'} className="h-8 px-4 text-body-strong">
            {session ? t('sales.register.open.status') : t('sales.register.closed')}
          </Chip>
        </div>
        <p className={clsx('mt-2 font-display text-[40px] font-bold leading-[48px] tabular', session ? 'text-ink' : 'text-subtle')}>{money(balance)}</p>
        {session && <p className="mt-1 text-body-lg text-muted">{openedText(session)}</p>}
        <div className="mt-6 flex flex-wrap gap-2">
          {session ? (
            <>
              <Button className="rounded-full" onClick={() => drawer.open('register-period', { id: session.id })}>
                {t('sales.register.view')}
              </Button>
              <Button className="rounded-full" icon={<Plus size={16} aria-hidden />} onClick={() => setFlow({ kind: 'cash_in', sessionId: session.id })}>
                {t('sales.register.cashIn')}
              </Button>
              <Button className="rounded-full" icon={<Minus size={16} aria-hidden />} onClick={() => setFlow({ kind: 'cash_out', sessionId: session.id })}>
                {t('sales.register.cashOut')}
              </Button>
            </>
          ) : (
            <Button variant="primary" className="rounded-full" iconRight={<ArrowRight size={16} aria-hidden />} onClick={() => setFlow({ kind: 'open', registerId: register.id })}>
              {t('sales.register.openRegister')}
            </Button>
          )}
        </div>
      </section>
    )
  }

  const pages = Math.max(1, Math.ceil(closed.length / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const visible = closed.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)

  return (
    <Page wide>
      <PageHeader
        title={t('sales.register.title')}
        subtitle={
          <>
            {t('sales.register.subtitle')} <LearnMore topic="registers" />
          </>
        }
        actions={
          <OptionsMenu
            groups={[
              {
                items: [
                  { label: t('sales.register.options.report'), onSelect: () => navigate('/reports/table/cash-register-summary') },
                  { label: t('sales.register.options.settings'), onSelect: () => navigate('/setup/sales/registers') },
                ],
              },
            ]}
          />
        }
      />

      <div className="mb-6">
        <Menu
          align="left"
          width={220}
          trigger={({ open, toggle }) => (
            <button type="button" className={PILL} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
              {t(`sales.register.periods.${period}`)}
              <span aria-hidden className="text-[10px]">
                ▼
              </span>
            </button>
          )}
          groups={[
            {
              items: PERIODS.map((p) => ({
                label: t(`sales.register.periods.${p}`),
                checked: p === period,
                onSelect: () => {
                  setPeriod(p)
                  setPage(0)
                },
              })),
            },
          ]}
        />
      </div>

      <div className="flex flex-col gap-4">
        {active.map(card)}
        {missing.map((l) => (
          <section key={l.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-dashed border-line-strong p-6">
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-md bg-sunken text-muted">
                <Store size={22} aria-hidden />
              </span>
              <div>
                <p className="text-body-strong text-ink">{t('sales.register.noRegisterAt', { location: l.name })}</p>
                <p className="text-small text-muted">{t('sales.register.noRegisterHint')}</p>
              </div>
            </div>
            <Button onClick={() => setFlow({ kind: 'setup', locationId: l.id })}>{t('sales.register.setUpRegister')}</Button>
          </section>
        ))}
      </div>

      <h2 className="mb-4 mt-10 font-display text-title-2 text-ink">{t('sales.register.closedRegisters')}</h2>
      {closed.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Wallet size={24} aria-hidden />} title={t('sales.register.noClosed')} body={t('sales.register.noClosedHint')} />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {visible.map(({ session, register, balance }) => (
              <div
                key={session.id}
                role="button"
                tabIndex={0}
                onClick={() => drawer.open('register-period', { id: session.id })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') drawer.open('register-period', { id: session.id })
                }}
                className="card flex cursor-pointer items-center gap-4 p-5 hover:bg-sunken/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-sunken text-ink">
                  <Wallet size={22} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-body-strong text-ink">{fmtDate(session.openedAt)}</p>
                  <p className="text-body text-muted">{sessionTimeRange(session)}</p>
                  {locations.length > 1 && register && (
                    <p className="text-small text-subtle">
                      {register.name} • {locationName(register.locationId)}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-small text-muted">{t('sales.register.balanceLabel')}</p>
                  <p className="text-body-lg font-semibold text-ink tabular">{money(balance)}</p>
                </div>
                <Chip tone="outline">{t('sales.register.closed')}</Chip>
                <Menu label={t('sales.common.actions')} groups={[{ items: [{ label: t('sales.register.view'), onSelect: () => drawer.open('register-period', { id: session.id }) }] }]} />
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-center gap-4 border-t border-line pt-4 text-small text-muted">
            {pages > 1 && (
              <Button variant="ghost" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>
                {t('sales.common.previous')}
              </Button>
            )}
            <span>{t('sales.common.viewing', { from: current * PAGE_SIZE + 1, to: Math.min(closed.length, (current + 1) * PAGE_SIZE), total: closed.length })}</span>
            {pages > 1 && (
              <Button variant="ghost" size="sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
                {t('sales.common.next')}
              </Button>
            )}
          </div>
        </>
      )}
      <RegisterFlowHost
        flow={flow}
        onClose={() => setFlow(null)}
        onViewActivity={(id) => {
          setFlow(null)
          drawer.open('register-period', { id, tab: 'activity' })
        }}
      />
    </Page>
  )
}

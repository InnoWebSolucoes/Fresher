import clsx from 'clsx'
import { format, parseISO } from 'date-fns'
import { Activity, ArrowDownLeft, ArrowUpRight, Banknote, Check, Info, List, Minus, MoreVertical, Plus, Receipt, Wallet } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { DrawerProps } from '@/app/sectionRegistry'
import { Button, EmptyState, Menu, toast } from '@/components/ui'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { fmtDate, fmtDateTimeUS, money } from '@/lib/format'
import { exportedFileName, exportPdf } from '@/lib/export'
import type { Payment, RegisterMovement } from '@/types'
import { PILL } from '../shared/ui'
import { dayOf } from '../shared/data'
import { RegisterFlowHost, type RegisterFlow } from './flows'
import { closedBalance, countedFor, registerBreakdown, type BreakdownLine } from './math'

type ActivityKind = 'all' | 'payments' | 'cash_in' | 'cash_out' | 'events'

interface ActivityItem {
  id: string
  at: string
  kind: Exclude<ActivityKind, 'all'>
  title: string
  by: string
  detail?: string
  amount: number
  tone: 'in' | 'out' | 'event'
}

/** Register period drawer (sales.md §2): Summary and Activity of one register session. */
export function RegisterPeriodDrawer({ id, params }: DrawerProps) {
  const { t } = useTranslation()
  const drawer = useDrawer()
  const sessions = useDb((s) => s.registerSessions)
  const registers = useDb((s) => s.registers)
  const locations = useDb((s) => s.locations)
  const payments = useDb((s) => s.payments)
  const sales = useDb((s) => s.sales)
  const clients = useDb((s) => s.clients)
  const customMethods = useDb((s) => s.settings.customPaymentMethods)
  const [flow, setFlow] = useState<RegisterFlow | null>(null)
  const [kind, setKind] = useState<ActivityKind>('all')
  const [member, setMember] = useState<string>('all')
  const tab = params.get('tab') === 'activity' ? 'activity' : 'summary'

  // The id is a register session; a register id (e.g. from Settings › Registers) shows its open or latest session.
  const session = useMemo(() => {
    const direct = sessions.find((s) => s.id === id)
    if (direct) return direct
    const forRegister = sessions.filter((s) => s.registerId === id).sort((a, b) => b.openedAt.localeCompare(a.openedAt))
    return forRegister.find((s) => !s.closedAt) ?? forRegister[0]
  }, [sessions, id])
  const register = registers.find((r) => r.id === (session?.registerId ?? id))
  const location = locations.find((l) => l.id === register?.locationId)
  const breakdown = useMemo(() => (session ? registerBreakdown(session, register, payments, sales, customMethods) : null), [session, register, payments, sales, customMethods])

  const activity = useMemo<ActivityItem[]>(() => {
    if (!session || !breakdown) return []
    const saleById = new Map(sales.map((s) => [s.id, s]))
    const clientById = new Map(clients.map((c) => [c.id, c]))
    const items: ActivityItem[] = [{ id: `${session.id}_opened`, at: session.openedAt, kind: 'events', title: t('sales.register.activity.opened'), by: session.openedBy, amount: 0, tone: 'event' }]
    const movementTitle: Record<RegisterMovement['type'], string> = {
      opening_float: t('sales.register.activity.openingFloat'),
      cash_in: t('sales.register.cashIn'),
      cash_out: t('sales.register.cashOut'),
      count: t('sales.register.activity.counted'),
      closed: t('sales.register.activity.closed'),
    }
    for (const m of session.movements) {
      const kindOf: ActivityItem['kind'] = m.type === 'cash_in' || m.type === 'opening_float' ? 'cash_in' : m.type === 'cash_out' ? 'cash_out' : 'events'
      const detail = m.type === 'cash_in' || m.type === 'cash_out' ? [m.reason, m.note].filter(Boolean).join(' • ') : m.note
      items.push({ id: m.id, at: m.at, kind: kindOf, title: movementTitle[m.type], by: m.by, detail, amount: m.type === 'cash_out' ? -m.amount : m.amount, tone: m.type === 'cash_out' ? 'out' : m.type === 'opening_float' || m.type === 'cash_in' ? 'in' : 'event' })
    }
    breakdown.cashPayments.forEach((p: Payment) => {
      const sale = saleById.get(p.saleId)
      const client = clientById.get(p.clientId ?? '')
      items.push({
        id: p.id,
        at: p.at,
        kind: 'payments',
        title: p.kind === 'refund' ? t('sales.register.activity.cashRefund') : t('sales.register.activity.cashPayment'),
        by: p.by,
        detail: [sale ? t('sales.register.activity.saleNumber', { number: sale.number }) : '', client ? `${client.firstName} ${client.lastName}` : t('sales.common.walkIn')].filter(Boolean).join(' • '),
        amount: p.amount,
        tone: p.amount < 0 ? 'out' : 'in',
      })
    })
    // Newest first; on the same minute the later entry (e.g. Opening float after Register opened) comes first.
    return items
      .map((item, index) => ({ item, index }))
      .sort((a, b) => b.item.at.localeCompare(a.item.at) || b.index - a.index)
      .map(({ item }) => item)
  }, [session, breakdown, sales, clients, t])

  if (!session || !register || !breakdown) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState icon={<Wallet size={24} aria-hidden />} title={t('sales.register.drawer.notFound')} body={t('sales.register.drawer.notFoundHint')} action={<Button onClick={drawer.close}>{t('sales.common.close')}</Button>} />
      </div>
    )
  }

  const open = !session.closedAt
  const headerBalance = open ? breakdown.cash.expected : closedBalance(session, breakdown.cash.expected)
  const lineLabel = (l: BreakdownLine) => l.label ?? t(`sales.register.lines.${l.labelKey}`)
  const counted = (key: string, expected: number) => countedFor(session, key, expected)
  const countedTotal = breakdown.groups.reduce((s, g) => s + g.lines.reduce((x, l) => x + counted(l.key, l.expected), 0), 0) + counted('cash', breakdown.cash.expected)
  const meta = open
    ? t('sales.register.drawer.openedMeta', { location: location?.name ?? '', date: fmtDateTimeUS(session.openedAt), name: session.openedBy })
    : `${location?.name ?? ''} • ${fmtDateTimeUS(session.openedAt)} – ${dayOf(session.openedAt) === dayOf(session.closedAt!) ? format(parseISO(session.closedAt!), 'HH:mm') : fmtDateTimeUS(session.closedAt!)}`

  const downloadReport = async () => {
    const rows: (string | number)[][] = []
    breakdown.groups.forEach((g) => {
      const c = g.lines.reduce((s, l) => s + counted(l.key, l.expected), 0)
      rows.push([t(`sales.register.groups.${g.key}`), money(g.expected), money(c), money(c - g.expected)])
      g.lines.forEach((l) => rows.push([`   ${lineLabel(l)}`, money(l.expected), money(counted(l.key, l.expected)), money(counted(l.key, l.expected) - l.expected)]))
    })
    const cashCounted = counted('cash', breakdown.cash.expected)
    rows.push([t('sales.register.lines.cash'), money(breakdown.cash.expected), money(cashCounted), money(cashCounted - breakdown.cash.expected)])
    await exportPdf(exportedFileName(), {
      title: `${t('sales.register.balance', { name: register.name })}: ${fmtDate(session.openedAt)}`,
      tables: [{ title: meta, headers: [t('sales.register.countFlow.paymentTypes'), t('sales.register.expected'), t('sales.register.counted'), t('sales.register.difference')], rows }],
    })
    toast(t('sales.common.reportGenerated'))
  }

  const moreItems = open
    ? [
        { label: t('sales.register.drawer.newSale'), onSelect: () => drawer.open('checkout', {}) },
        { label: t('sales.register.cashIn'), onSelect: () => setFlow({ kind: 'cash_in', sessionId: session.id }) },
        { label: t('sales.register.cashOut'), onSelect: () => setFlow({ kind: 'cash_out', sessionId: session.id }) },
        ...(register.settings.middayCounts ? [{ label: t('sales.register.drawer.countRegister'), onSelect: () => setFlow({ kind: 'count', sessionId: session.id }) }] : []),
      ]
    : [{ label: t('sales.register.drawer.downloadReport'), onSelect: () => void downloadReport() }]

  const amountCols = (expected: number, key: string | null, opts: { strong?: boolean; showCounted?: boolean } = {}) => {
    const c = key ? counted(key, expected) : null
    return (
      <>
        <td className={clsx('py-1.5 pl-4 text-right tabular', opts.strong ? 'font-semibold text-ink' : 'text-muted')}>{money(expected)}</td>
        {!open && <td className={clsx('py-1.5 pl-4 text-right tabular', opts.strong ? 'font-semibold text-ink' : 'text-muted')}>{c !== null && opts.showCounted !== false ? money(c) : ''}</td>}
        {!open && (
          <td className={clsx('py-1.5 pl-4 text-right tabular', opts.strong ? 'font-semibold' : '', c !== null && c - expected < 0 ? 'text-danger' : opts.strong ? 'text-ink' : 'text-muted')}>{c !== null && opts.showCounted !== false ? money(c - expected) : ''}</td>
        )}
      </>
    )
  }

  const groupBlock = (key: string, title: ReactNode, expected: number, countedKey: string | null, children: ReactNode, groupCounted?: number) => (
    <tbody key={key} className="border-b border-line last:border-0">
      <tr>
        <th scope="row" className="pt-4 text-left text-body-strong text-ink">
          {title}
        </th>
        {groupCounted !== undefined && !open ? (
          <>
            <td className="pl-4 pt-4 text-right font-semibold tabular text-ink">{money(expected)}</td>
            <td className="pl-4 pt-4 text-right font-semibold tabular text-ink">{money(groupCounted)}</td>
            <td className={clsx('pl-4 pt-4 text-right font-semibold tabular', groupCounted - expected < 0 ? 'text-danger' : 'text-ink')}>{money(groupCounted - expected)}</td>
          </>
        ) : (
          <>{amountCols(expected, countedKey, { strong: true })}</>
        )}
      </tr>
      {children}
      <tr>
        <td className="pb-3" colSpan={open ? 2 : 4} />
      </tr>
    </tbody>
  )

  const summary = (
    <>
      {open && (
        <div className="mb-6 flex gap-2">
          <Button className="rounded-full" icon={<Plus size={16} aria-hidden />} onClick={() => setFlow({ kind: 'cash_in', sessionId: session.id })}>
            {t('sales.register.cashIn')}
          </Button>
          <Button className="rounded-full" icon={<Minus size={16} aria-hidden />} onClick={() => setFlow({ kind: 'cash_out', sessionId: session.id })}>
            {t('sales.register.cashOut')}
          </Button>
        </div>
      )}
      <section className="card p-6">
        <table className="w-full text-body">
          <thead>
            <tr>
              <th scope="col" className="pb-2 text-left align-top">
                <span className="flex items-center gap-1.5 text-body-lg font-semibold text-ink">
                  {t('sales.register.drawer.payments')}
                  <Info size={14} className="text-subtle" aria-label={t('sales.register.drawer.paymentsInfo')} />
                </span>
                <span className="block text-body font-normal text-muted">{t('sales.register.drawer.collectedThrough')}</span>
              </th>
              <th scope="col" className="pb-2 pl-4 text-right align-top text-body-lg font-semibold text-ink">
                {t('sales.register.expected')}
              </th>
              {!open && (
                <>
                  <th scope="col" className="pb-2 pl-4 text-right align-top text-body-lg font-semibold text-ink">
                    {t('sales.register.counted')}
                  </th>
                  <th scope="col" className="pb-2 pl-4 text-right align-top text-body-lg font-semibold text-ink">
                    {t('sales.register.difference')}
                  </th>
                </>
              )}
            </tr>
          </thead>
          {breakdown.groups.map((g) =>
            groupBlock(
              g.key,
              t(`sales.register.groups.${g.key}`),
              g.expected,
              null,
              g.lines.map((l) => (
                <tr key={l.key}>
                  <td className="py-1.5 pl-4 text-muted">{lineLabel(l)}</td>
                  {amountCols(l.expected, l.key)}
                </tr>
              )),
              g.lines.reduce((s, l) => s + counted(l.key, l.expected), 0),
            ),
          )}
          {groupBlock(
            'cash',
            t('sales.register.lines.cash'),
            breakdown.cash.expected,
            'cash',
            [
              ['openingFloat', breakdown.cash.openingFloat],
              ['cashPayments', breakdown.cash.cashPayments],
              ['cashIn', breakdown.cash.cashIn],
              ['cashOut', breakdown.cash.cashOut],
            ].map(([key, value]) => (
              <tr key={key as string}>
                <td className="py-1.5 pl-4 text-muted">{t(`sales.register.drawer.cash.${key}`)}</td>
                {amountCols(value as number, null)}
              </tr>
            )),
          )}
          <tbody>
            <tr className="border-t border-line">
              <th scope="row" className="pt-4 text-left text-body-lg font-semibold text-ink">
                {t('sales.register.totalBalance')}
              </th>
              <td className="pl-4 pt-4 text-right font-semibold tabular text-ink">{money(breakdown.total)}</td>
              {!open && (
                <>
                  <td className="pl-4 pt-4 text-right font-semibold tabular text-ink">{money(countedTotal)}</td>
                  <td className={clsx('pl-4 pt-4 text-right font-semibold tabular', countedTotal - breakdown.total < 0 ? 'text-danger' : 'text-ink')}>{money(countedTotal - breakdown.total)}</td>
                </>
              )}
            </tr>
            <tr>
              <th scope="row" className="pt-2 text-left font-normal text-muted">
                {t('sales.register.ofWhichTips')}
              </th>
              <td className="pl-4 pt-2 text-right tabular text-muted">{money(breakdown.tips)}</td>
              {!open && <td colSpan={2} />}
            </tr>
          </tbody>
        </table>
      </section>
      {!open && (
        <section className="card mt-4 p-6">
          <dl className="grid grid-cols-2 gap-4 text-body">
            <div>
              <dt className="text-muted">{t('sales.register.countFlow.closingFloat')}</dt>
              <dd className="font-semibold text-ink tabular">{money(session.closingFloat ?? 0)}</dd>
            </div>
            <div>
              <dt className="text-muted">{t('sales.register.countFlow.cashToBank')}</dt>
              <dd className="font-semibold text-ink tabular">{money(session.cashToBank ?? 0)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted">{t('sales.register.drawer.closedBy')}</dt>
              <dd className="text-ink">{session.closedBy ?? '-'}</dd>
            </div>
            {session.note && (
              <div className="col-span-2">
                <dt className="text-muted">{t('sales.register.note')}</dt>
                <dd className="text-ink">{session.note}</dd>
              </div>
            )}
          </dl>
        </section>
      )}
      <p className="mt-4 text-small text-muted">{t('sales.register.drawer.footnote')}</p>
    </>
  )

  const people = [...new Set(activity.map((a) => a.by))].sort()
  const visibleActivity = activity.filter((a) => (kind === 'all' || a.kind === kind) && (member === 'all' || a.by === member))
  const pill = (label: string, items: { value: string; label: string }[], value: string, onChange: (v: string) => void) => (
    <Menu
      align="left"
      width={240}
      trigger={({ open: o, toggle }) => (
        <button type="button" className={PILL} aria-haspopup="menu" aria-expanded={o} onClick={toggle}>
          {label}
          <span aria-hidden className="text-[10px]">
            ▼
          </span>
        </button>
      )}
      groups={[{ items: items.map((i) => ({ label: i.label, checked: i.value === value, onSelect: () => onChange(i.value) })) }]}
    />
  )
  const kinds: ActivityKind[] = ['all', 'payments', 'cash_in', 'cash_out', 'events']
  const activityView = (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        {pill(
          t(`sales.register.activity.kinds.${kind}`),
          kinds.map((k) => ({ value: k, label: t(`sales.register.activity.kinds.${k}`) })),
          kind,
          (v) => setKind(v as ActivityKind),
        )}
        {pill(member === 'all' ? t('sales.register.activity.allMembers') : member, [{ value: 'all', label: t('sales.register.activity.allMembers') }, ...people.map((p) => ({ value: p, label: p }))], member, setMember)}
      </div>
      {visibleActivity.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Activity size={24} aria-hidden />} title={t('sales.register.activity.empty')} body={t('sales.register.activity.emptyHint')} />
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {visibleActivity.map((a) => {
            const Icon = a.kind === 'payments' ? Receipt : a.kind === 'events' ? Wallet : Banknote
            const Badge = a.tone === 'in' ? ArrowDownLeft : a.tone === 'out' ? ArrowUpRight : Check
            return (
              <li key={a.id} className="card flex items-center gap-4 p-5">
                <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-sunken text-ink">
                  <Icon size={20} aria-hidden />
                  <span className={clsx('absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-white ring-2 ring-surface', a.tone === 'out' ? 'bg-danger' : 'bg-success')}>
                    <Badge size={12} aria-hidden />
                  </span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-body-strong text-ink">{a.title}</p>
                  <p className="truncate text-body text-muted">{[a.by, a.detail].filter(Boolean).join(' • ')}</p>
                </div>
                <div className="text-right">
                  <p className={clsx('text-body-strong tabular', a.tone === 'in' && a.amount !== 0 ? 'text-success' : a.tone === 'out' ? 'text-danger' : 'text-ink')}>{money(a.amount)}</p>
                  <p className="text-small text-muted">{dayOf(a.at) === dayOf(session.openedAt) ? format(parseISO(a.at), 'HH:mm') : format(parseISO(a.at), 'MMM d, HH:mm')}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )

  const tabs = [
    { value: 'summary', label: t('sales.register.drawer.summary'), icon: List },
    { value: 'activity', label: t('sales.register.drawer.activity'), icon: Activity },
  ] as const

  return (
    <div className="flex h-full min-h-0">
      <nav aria-label={t('sales.register.drawer.sections')} className="w-40 shrink-0 border-r border-line bg-surface py-6">
        {tabs.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            aria-current={tab === value ? 'page' : undefined}
            onClick={() => drawer.update({ tab: value })}
            className={clsx('relative mx-2 mb-1 flex w-[calc(100%-1rem)] flex-col items-start gap-1.5 rounded-md px-4 py-3 text-left text-body', tab === value ? 'bg-primary-subtle font-semibold text-primary' : 'text-muted hover:bg-sunken hover:text-ink')}
          >
            {tab === value && <span className="absolute -left-2 top-0 h-full w-1 rounded-r bg-primary" aria-hidden />}
            <Icon size={20} aria-hidden />
            {label}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1 overflow-y-auto bg-canvas px-8 py-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <span className={clsx('chip h-9 gap-1.5 whitespace-nowrap px-4 text-body-strong', open ? 'bg-success text-white' : 'bg-warning text-ink')}>
            {open && <Check size={16} aria-hidden />}
            {open ? t('sales.register.open.status') : t('sales.register.closed')}
          </span>
          <div className="flex items-center gap-2">
            {open && (
              <Button className="rounded-full" onClick={() => setFlow({ kind: 'close', sessionId: session.id })}>
                {t('sales.register.closeRegister')}
              </Button>
            )}
            <Menu
              width={220}
              trigger={({ open: o, toggle }) => (
                <button type="button" aria-label={t('sales.register.drawer.moreOptions')} aria-haspopup="menu" aria-expanded={o} onClick={toggle} className="icon-btn rounded-full border border-line-strong bg-surface">
                  <MoreVertical size={18} aria-hidden />
                </button>
              )}
              groups={[{ items: moreItems }]}
            />
          </div>
        </div>
        <p className="text-body-lg text-ink">{t('sales.register.balance', { name: register.name })}</p>
        <h1 className="font-display text-[40px] font-bold leading-[48px] text-ink tabular">{money(headerBalance)}</h1>
        <p className="mb-6 mt-1 text-body text-muted">{meta}</p>
        {tab === 'summary' ? summary : activityView}
      </div>
      <RegisterFlowHost
        flow={flow}
        onClose={() => setFlow(null)}
        onViewActivity={() => {
          setFlow(null)
          drawer.update({ tab: 'activity' })
        }}
      />
    </div>
  )
}

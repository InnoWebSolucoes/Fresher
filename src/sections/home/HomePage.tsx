import { addDays, endOfMonth, parseISO, startOfMonth, subDays, subMonths } from 'date-fns'
import { format } from '@/lib/dates'
import { BarChart3, CalendarClock, Heart, LineChart as LineIcon, MoreVertical } from 'lucide-react'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts'
import { useShallow } from 'zustand/react/shallow'
import { Button, Skeleton, StatusChip, usePageLoading } from '@/components/ui'
import { computeTotals, lineTotal } from '@/api/sales'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { useDismiss } from '@/lib/useDismiss'
import { durationLabel, toISODate, toMinutes, useNow } from '@/lib/time'
import { fullName, money, money2, round2 } from '@/lib/format'
import type { Appointment } from '@/types'

/** Chart colours come from the design tokens so light and dark themes both read well. */
const C = {
  sales: 'rgb(var(--primary))',
  appointments: 'rgb(var(--accent))',
  cancelled: 'rgb(var(--danger) / 0.75)',
  grid: 'rgb(var(--border))',
  axis: 'rgb(var(--border-strong))',
  tick: 'rgb(var(--text-muted))',
  surface: 'rgb(var(--surface))',
}
const TICK = { fontSize: 11, fill: C.tick }

const apptValue = (a: Appointment) => a.items.reduce((s, i) => s + i.price + i.addOns.reduce((x, o) => x + o.price, 0), 0)
const apptDuration = (a: Appointment) => a.items.reduce((s, i) => s + i.durationMin + i.addOns.reduce((x, o) => x + o.durationMin, 0), 0)

function HomeCard({ title, subtitle, action, children, className = '', testId }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string; testId?: string }) {
  return (
    <section className={`card flex min-w-0 flex-col p-5 md:p-7 ${className}`} data-testid={testId}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-title-3 text-ink">{title}</h2>
          {subtitle && <p className="text-body text-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/** ⋮ "Filters" popover: Time period select, Close / Apply changes (home.md §2.7). Not saved across reloads. */
function PeriodFilter({ value, options, onApply }: { value: string; options: { value: string; label: string }[]; onApply: (v: string) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss([ref], open, () => setOpen(false))
  const id = useRef(`period-${Math.random().toString(36).slice(2, 8)}`).current
  return (
    <div ref={ref} className="relative -mr-2 -mt-1">
      <button
        type="button"
        aria-label={t('home.filters')}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="icon-btn"
        onClick={() => {
          setDraft(value)
          setOpen((o) => !o)
        }}
      >
        <MoreVertical size={18} aria-hidden />
      </button>
      {open && (
        <div role="dialog" aria-label={t('home.filters')} className="absolute right-0 top-full z-20 mt-1 w-[calc(100vw-3rem)] max-w-[340px] rounded-lg border border-line bg-raised p-5 shadow-md">
          <label className="label" htmlFor={id}>
            {t('home.timePeriod')}
          </label>
          <select id={id} className="input" value={draft} onChange={(e) => setDraft(e.target.value)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="mt-4 flex gap-3">
            <Button className="rounded-full px-5" onClick={() => setOpen(false)}>
              {t('home.close')}
            </Button>
            <Button
              variant="primary"
              className="flex-1 rounded-full"
              onClick={() => {
                onApply(draft)
                setOpen(false)
              }}
            >
              {t('home.apply')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function Empty({ icon, title, body }: { icon: ReactNode; title: string; body: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <span className="mb-2 text-primary">{icon}</span>
      <p className="font-display text-title-3 text-ink">{title}</p>
      <p className="text-body text-muted">{body}</p>
    </div>
  )
}

interface Series {
  key: string
  label: string
  color: string
  format: (v: number) => string
}

/** Dark tooltip box: the date, then one ● row per series (home.md §2.1, home-08). */
function ChartTooltip({ active, payload, series }: TooltipProps<number, string> & { series: Series[] }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload as { full: string } & Record<string, number>
  return (
    <div className="rounded-sm bg-ink px-3.5 py-2.5 text-small text-surface shadow-md">
      <p className="font-medium">{point.full}</p>
      {series.map((s) => (
        <p key={s.key} className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
          {s.label} {s.format(point[s.key] ?? 0)}
        </p>
      ))}
    </div>
  )
}

function ChartLegend({ series }: { series: Series[] }) {
  return (
    <ul className="mt-2 flex flex-wrap items-center gap-6 text-body text-ink">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  )
}

/** Home dashboard (home.md §2): six cards computed live from the store. */
export function HomePage() {
  const { t } = useTranslation()
  const loading = usePageLoading()
  const navigate = useNavigate()
  const drawer = useDrawer()
  const now = useNow()
  const data = useDb(useShallow((s) => ({ appointments: s.appointments, sales: s.sales, clients: s.clients, teamMembers: s.teamMembers })))
  const [salesDays, setSalesDays] = useState('7')
  const [upDays, setUpDays] = useState('7')
  const today = toISODate(now)
  const walkIn = t('home.walkIn')

  const recent = useMemo(() => {
    const n = Number(salesDays)
    const days = Array.from({ length: n + 1 }, (_, i) => toISODate(subDays(now, n - i)))
    const first = days[0]
    // Sales made in the period (refunds and voided sales are left out).
    const sales = data.sales.filter((s) => s.kind === 'sale' && s.status !== 'voided' && s.status !== 'draft' && s.createdAt.slice(0, 10) >= first && s.createdAt.slice(0, 10) <= today)
    const appts = data.appointments.filter((a) => a.date >= first && a.date <= today && a.status !== 'cancelled')
    const salesByDay = new Map<string, number>()
    for (const s of sales) salesByDay.set(s.createdAt.slice(0, 10), (salesByDay.get(s.createdAt.slice(0, 10)) ?? 0) + computeTotals(s).total)
    const points = days.map((d) => ({
      label: format(parseISO(d), 'd EEE'),
      full: format(parseISO(d), 'EEE, MMM d'),
      sales: round2(salesByDay.get(d) ?? 0),
      appointments: round2(appts.filter((a) => a.date === d).reduce((x, a) => x + apptValue(a), 0)),
    }))
    const max = Math.max(0, ...points.map((p) => Math.max(p.sales, p.appointments)))
    return { points, max, total: round2(points.reduce((s, p) => s + p.sales, 0)), count: appts.length, value: round2(appts.reduce((s, a) => s + apptValue(a), 0)) }
  }, [data.sales, data.appointments, salesDays, now, today])

  const upcoming = useMemo(() => {
    const n = Number(upDays)
    const days = Array.from({ length: n + 1 }, (_, i) => toISODate(addDays(now, i)))
    const last = days[days.length - 1]
    const appts = data.appointments.filter((a) => a.date >= today && a.date <= last)
    const points = days.map((d) => ({
      label: format(parseISO(d), 'd EEE'),
      full: format(parseISO(d), 'EEE, MMM d'),
      confirmed: appts.filter((a) => a.date === d && a.status !== 'cancelled' && a.status !== 'no_show').length,
      cancelled: appts.filter((a) => a.date === d && a.status === 'cancelled').length,
    }))
    return { points, booked: points.reduce((s, p) => s + p.confirmed, 0), cancelled: points.reduce((s, p) => s + p.cancelled, 0) }
  }, [data.appointments, upDays, now, today])

  const nowIso = now.toISOString()
  // Newest bookings first (home.md §2.3).
  const activity = useMemo(() => data.appointments.filter((a) => a.createdAt <= nowIso).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30), [data.appointments, nowIso])
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const todayNext = useMemo(() => data.appointments.filter((a) => a.date === today && a.status !== 'cancelled' && toMinutes(a.items[0].start) + apptDuration(a) > nowMin).sort((a, b) => a.items[0].start.localeCompare(b.items[0].start)), [data.appointments, today, nowMin])

  const thisStart = toISODate(startOfMonth(now))
  const thisEnd = toISODate(endOfMonth(now))
  const lastStart = toISODate(startOfMonth(subMonths(now, 1)))
  const lastEnd = toISODate(endOfMonth(subMonths(now, 1)))

  // Services booked in the calendar month (cancellations and no-shows left out).
  const topServices = useMemo(() => {
    const map = new Map<string, { id: string; name: string; thisMonth: number; lastMonth: number }>()
    for (const a of data.appointments) {
      if (a.status === 'cancelled' || a.status === 'no_show') continue
      const inThis = a.date >= thisStart && a.date <= thisEnd
      const inLast = a.date >= lastStart && a.date <= lastEnd
      if (!inThis && !inLast) continue
      for (const i of a.items) {
        const row = map.get(i.serviceId) ?? { id: i.serviceId, name: i.name, thisMonth: 0, lastMonth: 0 }
        if (inThis) row.thisMonth++
        else row.lastMonth++
        map.set(i.serviceId, row)
      }
    }
    return [...map.values()].filter((r) => r.thisMonth > 0).sort((a, b) => b.thisMonth - a.thisMonth || b.lastMonth - a.lastMonth).slice(0, 5)
  }, [data.appointments, thisStart, thisEnd, lastStart, lastEnd])

  // Sales value per team member: their items (after discounts) plus their tips.
  const topTeam = useMemo(() => {
    const map = new Map<string, { thisMonth: number; lastMonth: number }>()
    const add = (id: string, value: number, inThis: boolean) => {
      const row = map.get(id) ?? { thisMonth: 0, lastMonth: 0 }
      if (inThis) row.thisMonth += value
      else row.lastMonth += value
      map.set(id, row)
    }
    for (const s of data.sales) {
      if (s.kind !== 'sale' || (s.status !== 'completed' && s.status !== 'part_paid')) continue
      const d = s.createdAt.slice(0, 10)
      const inThis = d >= thisStart && d <= thisEnd
      const inLast = d >= lastStart && d <= lastEnd
      if (!inThis && !inLast) continue
      for (const i of s.items) if (i.teamMemberId) add(i.teamMemberId, lineTotal(i), inThis)
      for (const tip of s.tips) add(tip.teamMemberId, tip.amount, inThis)
    }
    return [...map.entries()]
      .map(([id, r]) => ({ id, member: data.teamMembers.find((m) => m.id === id), thisMonth: round2(r.thisMonth), lastMonth: round2(r.lastMonth) }))
      .filter((r) => r.member && r.thisMonth > 0)
      .sort((a, b) => b.thisMonth - a.thisMonth)
      .slice(0, 5)
  }, [data.sales, data.teamMembers, thisStart, thisEnd, lastStart, lastEnd])

  const salesSeries: Series[] = [
    { key: 'sales', label: t('home.sales'), color: C.sales, format: (v) => money(v) },
    { key: 'appointments', label: t('home.appointments'), color: C.appointments, format: (v) => money(v) },
  ]
  const upcomingSeries: Series[] = [
    { key: 'confirmed', label: t('home.confirmed'), color: C.sales, format: (v) => String(v) },
    { key: 'cancelled', label: t('home.cancelled'), color: C.cancelled, format: (v) => String(v) },
  ]

  const apptRow = (a: Appointment, long: boolean) => {
    const client = data.clients.find((c) => c.id === a.clientId)
    const item = a.items[0]
    const member = data.teamMembers.find((m) => m.id === item.teamMemberId)
    const d = parseISO(a.date)
    const requested = a.requested || a.items.some((i) => i.preferred)
    const services = a.items.map((i) => i.name).join(', ')
    return (
      <li key={a.id}>
        <button
          type="button"
          onClick={() => drawer.open('appointment', { id: a.id })}
          className="flex w-full gap-4 border-b border-line px-2 py-4 text-left hover:bg-sunken/60"
          aria-label={`${services}, ${format(d, 'EEE, d MMM yyyy')} ${item.start}`}
          data-testid="home-appointment-row"
        >
          <span className="w-9 shrink-0 pt-3 text-ink">
            <span className="block text-body-lg font-semibold leading-6">{format(d, 'dd')}</span>
            <span className="block text-body">{format(d, 'MMM')}</span>
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2 text-body text-muted">
              {long ? `${format(d, 'EEE, d MMM yyyy')} ${item.start}` : `${format(d, 'EEE')} ${item.start}`}
              <StatusChip status={a.status} />
            </span>
            <span className="block text-body-lg font-semibold text-ink">{services}</span>
            <span className="flex flex-wrap items-center gap-1 text-body text-muted">
              {a.status === 'cancelled' ? (
                fullName(client, walkIn)
              ) : (
                <>
                  <span>{t('home.with', { client: fullName(client, walkIn), duration: durationLabel(apptDuration(a)) })}</span>
                  {requested && <Heart size={13} className="fill-danger text-danger" aria-label={t('home.requested')} />}
                  <span>{member?.firstName ?? ''}</span>
                </>
              )}
            </span>
          </span>
        </button>
      </li>
    )
  }

  if (loading)
    return (
      <div className="mx-auto grid max-w-[1088px] gap-x-8 gap-y-4 px-4 py-5 md:px-8 md:py-8 lg:grid-cols-2" aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[380px] w-full rounded-lg" />
        ))}
      </div>
    )

  return (
    <div className="mx-auto grid max-w-[1088px] gap-x-8 gap-y-4 px-4 py-5 md:px-8 md:py-8 lg:grid-cols-2" data-testid="home">
      <HomeCard
        testId="home-recent-sales"
        className="min-h-[540px]"
        title={t('home.recentSales')}
        subtitle={salesDays === '7' ? t('home.last7') : t('home.last30')}
        action={<PeriodFilter value={salesDays} onApply={setSalesDays} options={[{ value: '7', label: t('home.last7') }, { value: '30', label: t('home.last30') }]} />}
      >
        <button type="button" className="self-start text-left font-display text-title-1 text-ink hover:underline" onClick={() => navigate('/sales/sales-list')}>
          {money(recent.total)}
        </button>
        <button type="button" className="mt-4 self-start text-left text-body text-muted hover:underline" onClick={() => navigate('/sales/appointments-list')}>
          {t('home.appointments')} <b className="text-ink">{recent.count}</b>
          <br />
          {t('home.appointmentsValue')} <b className="text-ink">{money(recent.value)}</b>
        </button>
        <div className="mt-5 h-[300px]" role="img" aria-label={t('home.salesChart', { period: salesDays === '7' ? t('home.last7') : t('home.last30') })}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={recent.points} margin={{ left: -6, right: 10, top: 8, bottom: 0 }}>
              <CartesianGrid stroke={C.grid} />
              <XAxis dataKey="label" interval={salesDays === '30' ? 2 : 0} angle={-45} textAnchor="end" height={46} tick={TICK} stroke={C.axis} tickLine={false} />
              <YAxis domain={recent.max > 0 ? [0, 'auto'] : [0, 100]} ticks={recent.max > 0 ? undefined : [0, 25, 50, 75, 100]} allowDecimals={false} tickFormatter={(v: number) => money(v)} tick={TICK} stroke={C.axis} width={56} />
              <Tooltip content={<ChartTooltip series={salesSeries} />} cursor={{ stroke: C.axis }} />
              {salesSeries.map((s) => (
                <Line key={s.key} type="linear" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={{ r: 3, fill: s.color, stroke: s.color }} activeDot={{ r: 5, fill: C.surface, stroke: s.color, strokeWidth: 2 }} isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <ChartLegend series={salesSeries} />
      </HomeCard>

      <HomeCard
        testId="home-upcoming"
        className="min-h-[540px]"
        title={t('home.upcoming')}
        subtitle={upDays === '7' ? t('home.next7') : t('home.next30')}
        action={<PeriodFilter value={upDays} onApply={setUpDays} options={[{ value: '7', label: t('home.next7') }, { value: '30', label: t('home.next30') }]} />}
      >
        {upcoming.booked + upcoming.cancelled === 0 ? (
          <Empty icon={<BarChart3 size={52} strokeWidth={1.5} aria-hidden />} title={t('home.emptySchedule')} body={t('home.emptyScheduleBody')} />
        ) : (
          <>
            <button type="button" className="self-start text-left font-display text-title-1 text-ink hover:underline" onClick={() => navigate('/calendar')}>
              {t('home.booked', { count: upcoming.booked })}
            </button>
            <p className="mt-4 text-body text-muted">
              {t('home.confirmed')} <b className="text-ink">{upcoming.booked}</b>
              <br />
              {t('home.cancelled')} <b className="text-ink">{upcoming.cancelled}</b>
            </p>
            <div className="mt-5 h-[300px]" role="img" aria-label={t('home.upcomingChart', { period: upDays === '7' ? t('home.next7') : t('home.next30') })}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={upcoming.points} margin={{ left: -14, right: 10, top: 8, bottom: 0 }}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="label" interval={upDays === '30' ? 2 : 0} angle={-45} textAnchor="end" height={46} tick={TICK} stroke={C.axis} tickLine={false} />
                  <YAxis allowDecimals={false} tick={TICK} stroke={C.axis} />
                  <Tooltip content={<ChartTooltip series={upcomingSeries} />} cursor={{ fill: 'rgb(var(--surface-sunken))' }} />
                  <Bar dataKey="confirmed" name={t('home.confirmed')} stackId="a" fill={C.sales} isAnimationActive={false} />
                  <Bar dataKey="cancelled" name={t('home.cancelled')} stackId="a" fill={C.cancelled} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ChartLegend series={upcomingSeries} />
          </>
        )}
      </HomeCard>

      <HomeCard testId="home-activity" className="h-[468px]" title={t('home.activity')}>
        {activity.length ? (
          <ul className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2">{activity.map((a) => apptRow(a, true))}</ul>
        ) : (
          <Empty icon={<CalendarClock size={52} strokeWidth={1.5} aria-hidden />} title={t('home.noActivity')} body={t('home.noActivityBody')} />
        )}
      </HomeCard>

      <HomeCard testId="home-today" className="h-[468px]" title={t('home.todayNext')}>
        {todayNext.length ? (
          <ul className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2">{todayNext.map((a) => apptRow(a, false))}</ul>
        ) : (
          <Empty
            icon={<CalendarClock size={52} strokeWidth={1.5} aria-hidden />}
            title={t('home.noToday')}
            body={
              <>
                {t('home.noTodayVisit')}{' '}
                <button type="button" className="text-primary hover:underline" onClick={() => navigate('/calendar')}>
                  {t('home.calendar')}
                </button>{' '}
                {t('home.noTodayRest')}
              </>
            }
          />
        )}
      </HomeCard>

      <HomeCard testId="home-top-services" className="min-h-[233px]" title={t('home.topServices')}>
        <table className="-mx-5 w-[calc(100%+2.5rem)] text-body md:-mx-7 md:w-[calc(100%+3.5rem)]">
          <thead>
            <tr className="border-b border-line text-left text-body-strong text-ink">
              <th scope="col" className="py-3 pl-5 font-semibold md:pl-7">
                {t('home.service')}
              </th>
              <th scope="col" className="py-3 text-right font-semibold">
                {t('home.thisMonth')}
              </th>
              <th scope="col" className="py-3 pr-5 text-right font-semibold md:pr-7">
                {t('home.lastMonth')}
              </th>
            </tr>
          </thead>
          <tbody>
            {topServices.map((r) => (
              <tr key={r.id} className="cursor-pointer border-b border-line last:border-b-0 hover:bg-sunken/60" onClick={() => navigate(`/catalogue/services/service/edit/${r.id}`)}>
                <td className="py-5 pl-5 md:pl-7">
                  <button
                    type="button"
                    className="text-left text-ink hover:underline"
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate(`/catalogue/services/service/edit/${r.id}`)
                    }}
                  >
                    {r.name}
                  </button>
                </td>
                <td className="py-5 text-right tabular">{r.thisMonth}</td>
                <td className="py-5 pr-5 text-right tabular md:pr-7">{r.lastMonth}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!topServices.length && <Empty icon={<LineIcon size={48} strokeWidth={1.5} aria-hidden />} title={t('home.noServices')} body={t('home.noServicesBody')} />}
      </HomeCard>

      <HomeCard testId="home-top-team" className="min-h-[233px]" title={t('home.topTeam')}>
        <table className="-mx-5 w-[calc(100%+2.5rem)] text-body md:-mx-7 md:w-[calc(100%+3.5rem)]">
          <thead>
            <tr className="border-b border-line text-left text-body-strong text-ink">
              <th scope="col" className="py-3 pl-5 font-semibold md:pl-7">
                {t('home.teamMember')}
              </th>
              <th scope="col" className="py-3 text-right font-semibold">
                {t('home.thisMonth')}
              </th>
              <th scope="col" className="py-3 pr-5 text-right font-semibold md:pr-7">
                {t('home.lastMonth')}
              </th>
            </tr>
          </thead>
          <tbody>
            {topTeam.map((r) => (
              <tr key={r.id} className="cursor-pointer border-b border-line last:border-b-0 hover:bg-sunken/60" onClick={() => drawer.open('team-member', { id: r.id })}>
                <td className="py-5 pl-5 md:pl-7">
                  <button
                    type="button"
                    className="text-left text-ink hover:underline"
                    onClick={(e) => {
                      e.stopPropagation()
                      drawer.open('team-member', { id: r.id })
                    }}
                  >
                    {fullName(r.member)}
                  </button>
                </td>
                <td className="py-5 text-right tabular">{money2(r.thisMonth)}</td>
                <td className="py-5 pr-5 text-right tabular md:pr-7">{money2(r.lastMonth)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!topTeam.length && <Empty icon={<LineIcon size={48} strokeWidth={1.5} aria-hidden />} title={t('home.noSales')} body={t('home.noSalesBody')} />}
      </HomeCard>
    </div>
  )
}

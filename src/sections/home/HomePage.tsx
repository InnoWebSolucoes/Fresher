import { addDays, endOfMonth, format, parseISO, startOfMonth, subDays, subMonths } from 'date-fns'
import { BarChart3, CalendarClock, LineChart as LineIcon, MoreVertical } from 'lucide-react'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useShallow } from 'zustand/react/shallow'
import { Button, Skeleton, StatusChip, usePageLoading } from '@/components/ui'
import { computeTotals } from '@/api/sales'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { useDismiss } from '@/lib/useDismiss'
import { durationLabel, toISODate, toMinutes, useNow } from '@/lib/time'
import { fullName, money, money2 } from '@/lib/format'
import type { Appointment } from '@/types'

const SALES_COLOR = '#0E6E6A'
const APPT_COLOR = '#E0A21C'
const apptValue = (a: Appointment) => a.items.reduce((s, i) => s + i.price + i.addOns.reduce((x, o) => x + o.price, 0), 0)
const apptDuration = (a: Appointment) => a.items.reduce((s, i) => s + i.durationMin + i.addOns.reduce((x, o) => x + o.durationMin, 0), 0)

function HomeCard({ title, subtitle, action, children, className = '' }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card flex flex-col p-7 ${className}`}>
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

function PeriodFilter({ value, options, onApply }: { value: string; options: { value: string; label: string }[]; onApply: (v: string) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss([ref], open, () => setOpen(false))
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label={t('home.filters')} aria-expanded={open} className="icon-btn" onClick={() => { setDraft(value); setOpen((o) => !o) }}>
        <MoreVertical size={18} aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-[320px] rounded-lg border border-line bg-raised p-5 shadow-md">
          <label className="label" htmlFor="home-period">{t('home.timePeriod')}</label>
          <select id="home-period" className="input" value={draft} onChange={(e) => setDraft(e.target.value)}>
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <div className="mt-4 flex gap-2">
            <Button className="rounded-full" onClick={() => setOpen(false)}>{t('home.close')}</Button>
            <Button variant="primary" className="flex-1 rounded-full" onClick={() => { onApply(draft); setOpen(false) }}>{t('home.apply')}</Button>
          </div>
        </div>
      )}
    </div>
  )
}

function Empty({ icon, title, body }: { icon: ReactNode; title: string; body: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
      <span className="text-primary">{icon}</span>
      <p className="font-display text-title-3 text-ink">{title}</p>
      <p className="text-body text-muted">{body}</p>
    </div>
  )
}

/** Home dashboard (home.md §2): six cards computed live from the store. */
export function HomePage() {
  const { t } = useTranslation()
  const loading = usePageLoading()
  const navigate = useNavigate()
  const drawer = useDrawer()
  const now = useNow()
  const data = useDb(useShallow((s) => ({ appointments: s.appointments, sales: s.sales, clients: s.clients, teamMembers: s.teamMembers, services: s.services })))
  const [salesDays, setSalesDays] = useState('7')
  const [upDays, setUpDays] = useState('7')
  const today = toISODate(now)

  const recent = useMemo(() => {
    const n = Number(salesDays)
    const days = Array.from({ length: n + 1 }, (_, i) => toISODate(subDays(now, n - i)))
    const valid = data.sales.filter((s) => s.status !== 'voided' && s.status !== 'draft')
    const appts = data.appointments.filter((a) => days.includes(a.date) && a.status !== 'cancelled')
    const points = days.map((d) => ({
      label: format(parseISO(d), 'd EEE'),
      full: format(parseISO(d), 'EEE, MMM d'),
      sales: Math.round(valid.filter((s) => s.createdAt.slice(0, 10) === d).reduce((x, s) => x + computeTotals(s).total, 0) * 100) / 100,
      appointments: Math.round(appts.filter((a) => a.date === d).reduce((x, a) => x + apptValue(a), 0) * 100) / 100,
    }))
    return { points, total: points.reduce((s, p) => s + p.sales, 0), count: appts.length, value: appts.reduce((s, a) => s + apptValue(a), 0) }
  }, [data.sales, data.appointments, salesDays, now])

  const upcoming = useMemo(() => {
    const n = Number(upDays)
    const days = Array.from({ length: n + 1 }, (_, i) => toISODate(addDays(now, i)))
    const appts = data.appointments.filter((a) => days.includes(a.date))
    const points = days.map((d) => ({ label: format(parseISO(d), 'd EEE'), confirmed: appts.filter((a) => a.date === d && a.status !== 'cancelled' && a.status !== 'no_show').length, cancelled: appts.filter((a) => a.date === d && a.status === 'cancelled').length }))
    return { points, booked: points.reduce((s, p) => s + p.confirmed, 0), cancelled: points.reduce((s, p) => s + p.cancelled, 0) }
  }, [data.appointments, upDays, now])

  const nowIso = now.toISOString()
  const activity = useMemo(() => data.appointments.filter((a) => a.createdAt <= nowIso).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30), [data.appointments, nowIso])
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const todayNext = useMemo(() => data.appointments.filter((a) => a.date === today && a.status !== 'cancelled' && toMinutes(a.items[0].start) + apptDuration(a) > nowMin).sort((a, b) => a.items[0].start.localeCompare(b.items[0].start)), [data.appointments, today, nowMin])

  const thisStart = toISODate(startOfMonth(now))
  const lastStart = toISODate(startOfMonth(subMonths(now, 1)))
  const lastEnd = toISODate(endOfMonth(subMonths(now, 1)))
  const topServices = useMemo(() => {
    const map = new Map<string, { id: string; name: string; thisMonth: number; lastMonth: number }>()
    for (const a of data.appointments) {
      if (a.status === 'cancelled' || a.status === 'no_show') continue
      const inThis = a.date >= thisStart && a.date <= today
      const inLast = a.date >= lastStart && a.date <= lastEnd
      if (!inThis && !inLast) continue
      for (const i of a.items) {
        const row = map.get(i.serviceId) ?? { id: i.serviceId, name: i.name, thisMonth: 0, lastMonth: 0 }
        if (inThis) row.thisMonth++
        else row.lastMonth++
        map.set(i.serviceId, row)
      }
    }
    return [...map.values()].filter((r) => r.thisMonth > 0).sort((a, b) => b.thisMonth - a.thisMonth).slice(0, 5)
  }, [data.appointments, thisStart, lastStart, lastEnd, today])

  const topTeam = useMemo(() => {
    const map = new Map<string, { thisMonth: number; lastMonth: number }>()
    for (const s of data.sales) {
      if (s.status !== 'completed' && s.status !== 'part_paid') continue
      const d = s.createdAt.slice(0, 10)
      const inThis = d >= thisStart
      const inLast = d >= lastStart && d <= lastEnd
      if (!inThis && !inLast) continue
      for (const i of s.items) {
        if (!i.teamMemberId) continue
        const row = map.get(i.teamMemberId) ?? { thisMonth: 0, lastMonth: 0 }
        const v = i.unitPrice * i.quantity
        if (inThis) row.thisMonth += v
        else row.lastMonth += v
        map.set(i.teamMemberId, row)
      }
    }
    return [...map.entries()].map(([id, r]) => ({ id, member: data.teamMembers.find((m) => m.id === id), ...r })).filter((r) => r.member && r.thisMonth > 0).sort((a, b) => b.thisMonth - a.thisMonth).slice(0, 5)
  }, [data.sales, data.teamMembers, thisStart, lastStart, lastEnd])

  const apptRow = (a: Appointment, long: boolean) => {
    const client = data.clients.find((c) => c.id === a.clientId)
    const member = data.teamMembers.find((m) => m.id === a.items[0].teamMemberId)
    const d = parseISO(a.date)
    return (
      <li key={a.id}>
        <button type="button" onClick={() => drawer.open('appointment', { id: a.id })} className="flex w-full gap-4 border-b border-line px-2 py-4 text-left hover:bg-sunken/60" data-testid="home-appointment-row">
          <span className="w-10 shrink-0 text-center">
            <span className="block font-display text-title-3 text-ink">{format(d, 'dd')}</span>
            <span className="block text-body text-muted">{format(d, 'MMM')}</span>
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2 text-body text-muted">
              {long ? `${format(d, 'EEE, d MMM yyyy')} ${a.items[0].start}` : `${format(d, 'EEE')} ${a.items[0].start}`}
              <StatusChip status={a.status} />
            </span>
            <span className="block text-body-lg font-semibold text-ink">{a.items.map((i) => i.name).join(', ')}</span>
            <span className="block text-body text-muted">{t('home.with', { client: fullName(client), duration: durationLabel(apptDuration(a)), member: member?.firstName ?? '' })}</span>
          </span>
        </button>
      </li>
    )
  }

  if (loading)
    return (
      <div className="mx-auto grid max-w-[1060px] gap-6 px-8 py-8 lg:grid-cols-2" aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[380px] w-full rounded-lg" />)}
      </div>
    )

  return (
    <div className="mx-auto grid max-w-[1060px] gap-6 px-8 py-8 lg:grid-cols-2" data-testid="home">
      <HomeCard title={t('home.recentSales')} subtitle={salesDays === '7' ? t('home.last7') : t('home.last30')} action={<PeriodFilter value={salesDays} onApply={setSalesDays} options={[{ value: '7', label: t('home.last7') }, { value: '30', label: t('home.last30') }]} />}>
        <button type="button" className="text-left font-display text-title-1 text-ink hover:underline" onClick={() => navigate('/sales/sales-list')}>{money(recent.total)}</button>
        <button type="button" className="mt-3 text-left text-body text-muted hover:underline" onClick={() => navigate('/sales/appointments-list')}>
          {t('home.appointments')} <b className="text-ink">{recent.count}</b>
          <br />
          {t('home.appointmentsValue')} <b className="text-ink">{money(recent.value)}</b>
        </button>
        <div className="mt-4 h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={recent.points} margin={{ left: -10, right: 8, top: 8 }}>
              <CartesianGrid stroke="#DCE4E2" vertical={false} />
              <XAxis dataKey="label" interval={salesDays === '30' ? 2 : 0} angle={-45} textAnchor="end" height={50} tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v: number) => `€${v}`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => money(Number(v))} labelFormatter={(_, p) => (p?.[0]?.payload as { full?: string } | undefined)?.full ?? ''} />
              <Legend />
              <Line type="linear" dataKey="sales" name={t('home.sales')} stroke={SALES_COLOR} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="linear" dataKey="appointments" name={t('home.appointments')} stroke={APPT_COLOR} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </HomeCard>

      <HomeCard title={t('home.upcoming')} subtitle={upDays === '7' ? t('home.next7') : t('home.next30')} action={<PeriodFilter value={upDays} onApply={setUpDays} options={[{ value: '7', label: t('home.next7') }, { value: '30', label: t('home.next30') }]} />}>
        {upcoming.booked + upcoming.cancelled === 0 ? (
          <Empty icon={<BarChart3 size={44} aria-hidden />} title={t('home.emptySchedule')} body={t('home.emptyScheduleBody')} />
        ) : (
          <>
            <button type="button" className="text-left font-display text-title-1 text-ink hover:underline" onClick={() => navigate('/calendar')}>{t('home.booked', { count: upcoming.booked })}</button>
            <p className="mt-3 text-body text-muted">
              {t('home.confirmed')} <b className="text-ink">{upcoming.booked}</b>
              <br />
              {t('home.cancelled')} <b className="text-ink">{upcoming.cancelled}</b>
            </p>
            <div className="mt-4 h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={upcoming.points} margin={{ left: -20, right: 8, top: 8 }}>
                  <CartesianGrid stroke="#DCE4E2" vertical={false} />
                  <XAxis dataKey="label" interval={upDays === '30' ? 2 : 0} angle={-45} textAnchor="end" height={50} tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="confirmed" name={t('home.confirmed')} stackId="a" fill={SALES_COLOR} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="cancelled" name={t('home.cancelled')} stackId="a" fill={APPT_COLOR} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </HomeCard>

      <HomeCard title={t('home.activity')}>
        {activity.length ? <ul className="max-h-[380px] overflow-y-auto pr-1">{activity.map((a) => apptRow(a, true))}</ul> : <Empty icon={<CalendarClock size={44} aria-hidden />} title={t('home.noActivity')} body={t('home.noActivityBody')} />}
      </HomeCard>

      <HomeCard title={t('home.todayNext')}>
        {todayNext.length ? (
          <ul className="max-h-[380px] overflow-y-auto pr-1">{todayNext.map((a) => apptRow(a, false))}</ul>
        ) : (
          <Empty
            icon={<CalendarClock size={44} aria-hidden />}
            title={t('home.noToday')}
            body={
              <>
                {t('home.noTodayVisit')}{' '}
                <button type="button" className="text-primary hover:underline" onClick={() => navigate('/calendar')}>{t('home.calendar')}</button> {t('home.noTodayRest')}
              </>
            }
          />
        )}
      </HomeCard>

      <HomeCard title={t('home.topServices')}>
        <table className="w-full text-body">
          <thead>
            <tr className="border-b border-line text-left text-body-strong text-ink">
              <th className="py-3">{t('home.service')}</th>
              <th className="py-3 text-right">{t('home.thisMonth')}</th>
              <th className="py-3 text-right">{t('home.lastMonth')}</th>
            </tr>
          </thead>
          <tbody>
            {topServices.map((r) => (
              <tr key={r.id} className="cursor-pointer border-b border-line hover:bg-sunken/60" onClick={() => navigate(`/catalogue/services/service/edit/${r.id}`)}>
                <td className="py-4">{r.name}</td>
                <td className="py-4 text-right tabular">{r.thisMonth}</td>
                <td className="py-4 text-right tabular">{r.lastMonth}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!topServices.length && <Empty icon={<LineIcon size={40} aria-hidden />} title={t('home.noServices')} body={t('home.noServicesBody')} />}
      </HomeCard>

      <HomeCard title={t('home.topTeam')}>
        <table className="w-full text-body">
          <thead>
            <tr className="border-b border-line text-left text-body-strong text-ink">
              <th className="py-3">{t('home.teamMember')}</th>
              <th className="py-3 text-right">{t('home.thisMonth')}</th>
              <th className="py-3 text-right">{t('home.lastMonth')}</th>
            </tr>
          </thead>
          <tbody>
            {topTeam.map((r) => (
              <tr key={r.id} className="cursor-pointer border-b border-line hover:bg-sunken/60" onClick={() => drawer.open('team-member', { id: r.id })}>
                <td className="py-4">{fullName(r.member)}</td>
                <td className="py-4 text-right tabular">{money2(r.thisMonth)}</td>
                <td className="py-4 text-right tabular">{money2(r.lastMonth)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!topTeam.length && <Empty icon={<LineIcon size={40} aria-hidden />} title={t('home.noSales')} body={t('home.noSalesBody')} />}
      </HomeCard>
    </div>
  )
}

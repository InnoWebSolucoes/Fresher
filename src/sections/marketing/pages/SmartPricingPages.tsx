import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useShallow } from 'zustand/react/shallow'
import { useDb } from '@/store/db'
import type { ID, SmartPricing, SmartPricingRule, Weekday } from '@/types'
import { Avatar, Button, Checkbox, Chip, DateRangeButton, EmptyState, IntroPage, LearnMore, Menu, MenuButton, Modal, Page, PageHeader, PageSkeleton, Select, TextInput, confirm, resolvePreset, toast, usePageLoading, type DateRangeValue } from '@/components/ui'
import { clearSmartPricing, saveSmartPricing, setSmartPricingStatus } from '@/api/marketing'
import { toClock, toMinutes, weekdayOf } from '@/lib/time'
import { money, num } from '@/lib/format'
import { StatCard, SuccessBadge, UnitToggle, WizardFrame, WizardTitle } from '../components/kit'
import { ScopeModal } from './DealWizardPage'

const WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6]
const TIMES = Array.from({ length: 288 }, (_, i) => toClock(i * 5))
const INCREASE = '#E8833A'
const DECREASE = '#23A26D'

function ruleFor(sp: SmartPricing, day: Weekday, start: string): SmartPricingRule | undefined {
  const m = toMinutes(start)
  return sp.rules[day]?.find((r) => m >= toMinutes(r.start) && m < toMinutes(r.end))
}

export function ruleLabel(r: SmartPricingRule, t: TFunction) {
  return t(`marketing.smartPricing.change.${r.direction}`, { value: r.unit === 'percent' ? `${num(r.value)}%` : money(r.value) })
}

export function SmartPricingIntroPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const configured = useDb((s) => s.smartPricing.configured)
  if (configured) return <Navigate to="/marketing/peak-pricing/details" replace />
  return (
    <Page wide>
      <IntroPage
        badge={t('marketing.smartPricing.intro.badge')}
        title={t('marketing.smartPricing.intro.title')}
        body={t('marketing.smartPricing.intro.body')}
        bullets={[t('marketing.smartPricing.intro.b1'), t('marketing.smartPricing.intro.b2'), t('marketing.smartPricing.intro.b3')]}
        primary={{ label: t('marketing.smartPricing.intro.start'), onClick: () => navigate('/marketing/peak-pricing/setup/team') }}
      />
    </Page>
  )
}

export function SmartPricingDetailsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loading = usePageLoading()
  const { smartPricing: sp, appointments, sales, teamMembers, services, workspace } = useDb(
    useShallow((s) => ({ smartPricing: s.smartPricing, appointments: s.appointments, sales: s.sales, teamMembers: s.teamMembers, services: s.services, workspace: s.workspace })),
  )
  const [range, setRange] = useState<DateRangeValue>(() => resolvePreset('last_7_days'))
  const [metric, setMetric] = useState<'appointments' | 'sales'>('appointments')
  const [servicesOpen, setServicesOpen] = useState(false)

  const stats = useMemo(() => {
    const byDay = WEEKDAYS.map((d) => ({ day: d, increased: 0, decreased: 0 }))
    let apptValue = 0
    let apptCount = 0
    let salesValue = 0
    let salesCount = 0
    const memberOk = (id: ID) => sp.teamMemberIds === 'all' || sp.teamMemberIds.includes(id)
    const serviceOk = (id: ID) => sp.serviceIds === 'all' || sp.serviceIds.includes(id)
    const saleByAppt = new Map(sales.filter((s) => s.appointmentId && s.status === 'completed').map((s) => [s.appointmentId!, s]))
    for (const a of appointments) {
      if (a.date < range.from || a.date > range.to || a.status === 'cancelled') continue
      const day = weekdayOf(a.date)
      let matched = false
      for (const item of a.items) {
        if (!memberOk(item.teamMemberId) || !serviceOk(item.serviceId)) continue
        const rule = ruleFor(sp, day, item.start)
        if (!rule) continue
        matched = true
        apptValue += item.price
        const sale = saleByAppt.get(a.id)
        if (metric === 'appointments') byDay[day][rule.direction === 'increase' ? 'increased' : 'decreased'] += 1
        if (sale) {
          const v = sale.items.filter((si) => si.appointmentItemId === item.id).reduce((s, si) => s + si.unitPrice * si.quantity, 0) || item.price
          salesValue += v
          if (metric === 'sales') byDay[day][rule.direction === 'increase' ? 'increased' : 'decreased'] += v
        }
      }
      if (matched) {
        apptCount++
        if (saleByAppt.has(a.id)) salesCount++
      }
    }
    return { byDay, apptValue, apptCount, salesValue, salesCount }
  }, [sp, appointments, sales, range, metric])

  if (loading) {
    return (
      <Page wide>
        <PageSkeleton />
      </Page>
    )
  }
  if (!sp.configured) return <Navigate to="/marketing/peak-pricing" replace />

  const members = teamMembers.filter((m) => !m.archived && m.bookable && (sp.teamMemberIds === 'all' || sp.teamMemberIds.includes(m.id)))
  const serviceList = services.filter((s) => !s.archived && (sp.serviceIds === 'all' || sp.serviceIds.includes(s.id)))
  const chart = stats.byDay.map((d) => ({ name: t(`marketing.smartPricing.daysShort.${d.day}`), increased: Math.round(d.increased * 100) / 100, decreased: Math.round(d.decreased * 100) / 100 }))

  const clear = async () => {
    if (!(await confirm({ title: t('marketing.smartPricing.clear.title'), body: t('marketing.smartPricing.clear.body'), confirmLabel: t('marketing.smartPricing.clear.confirm'), tone: 'danger' }))) return
    await clearSmartPricing()
    toast(t('marketing.smartPricing.clear.done'))
    navigate('/marketing/peak-pricing')
  }
  const toggle = async () => {
    const next = sp.status === 'active' ? 'paused' : 'active'
    await setSmartPricingStatus(next)
    toast(next === 'paused' ? t('marketing.smartPricing.toast.paused') : t('marketing.smartPricing.toast.resumed'))
  }

  return (
    <Page wide>
      <PageHeader
        title={t('marketing.smartPricing.title')}
        subtitle={
          <>
            {t('marketing.smartPricing.subtitle')} <LearnMore topic={t('marketing.common.topics.smartPricing')}>{t('marketing.common.learnMore')}</LearnMore>
          </>
        }
      />
      <div className="mb-6">
        <DateRangeButton value={range} onChange={setRange} presets={['last_7_days', 'last_30_days', 'last_90_days', 'next_7_days', 'next_30_days']} />
      </div>
      <div className="mb-8 grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <StatCard label={t('marketing.smartPricing.apptValue')} value={money(stats.apptValue)} hint={t('marketing.smartPricing.apptCount', { count: stats.apptCount })} />
          <StatCard label={t('marketing.smartPricing.salesValue')} value={money(stats.salesValue)} hint={t('marketing.smartPricing.salesCount', { count: stats.salesCount })} />
        </div>
        <section className="card p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-display text-title-3 text-ink">{t('marketing.smartPricing.dayOfWeek')}</h2>
            <Select
              aria-label={t('marketing.smartPricing.metric')}
              className="h-10 w-48 rounded-full"
              value={metric}
              onChange={(e) => setMetric(e.target.value as typeof metric)}
              options={[
                { value: 'appointments', label: t('marketing.smartPricing.metrics.appointments') },
                { value: 'sales', label: t('marketing.smartPricing.metrics.sales') },
              ]}
            />
          </div>
          <div className="h-60" data-testid="smart-pricing-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ left: -16, right: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#DCE4E2" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#84938F" />
                <YAxis allowDecimals={metric === 'sales'} tick={{ fontSize: 12 }} stroke="#84938F" />
                <Tooltip formatter={(v: number) => (metric === 'sales' ? money(v) : v)} />
                <Legend iconType="circle" />
                <Bar dataKey="increased" name={t('marketing.smartPricing.increased')} fill={INCREASE} radius={[4, 4, 0, 0]} />
                <Bar dataKey="decreased" name={t('marketing.smartPricing.decreased')} fill={DECREASE} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="card p-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-lg bg-sunken p-5">
          <div>
            <p className="flex items-center gap-3 text-body-lg font-semibold text-ink">
              {workspace.name}
              <Chip tone={sp.status === 'active' ? 'success' : 'warning'}>{sp.status === 'active' ? t('marketing.common.active') : t('marketing.common.paused')}</Chip>
            </p>
            <div className="mt-2 flex items-center gap-2 text-body text-ink">
              <span className="flex -space-x-2">
                {members.slice(0, 5).map((m) => (
                  <Avatar key={m.id} name={`${m.firstName} ${m.lastName}`} color={m.color} size={30} className="ring-2 ring-sunken" />
                ))}
              </span>
              {t('marketing.smartPricing.for')}{' '}
              <button type="button" className="text-primary hover:underline" onClick={() => setServicesOpen(true)}>
                {sp.serviceIds === 'all' ? t('marketing.smartPricing.allServices') : t('marketing.smartPricing.nServices', { count: serviceList.length })}
              </button>
            </div>
          </div>
          <Menu
            width={180}
            trigger={({ open, toggle: tg }) => (
              <MenuButton open={open} toggle={tg}>
                {t('marketing.smartPricing.actions')}
              </MenuButton>
            )}
            groups={[
              {
                items: [
                  { label: t('marketing.common.edit'), onSelect: () => navigate('/marketing/peak-pricing/setup/team') },
                  { label: sp.status === 'active' ? t('marketing.smartPricing.pause') : t('marketing.smartPricing.resume'), onSelect: () => void toggle() },
                  { label: t('marketing.common.clear'), danger: true, onSelect: () => void clear() },
                ],
              },
            ]}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {WEEKDAYS.map((d) => {
            const rules = sp.rules[d] ?? []
            return (
              <div key={d} className="overflow-hidden rounded-lg border border-line">
                <p className="bg-primary-subtle py-3 text-center text-body-strong text-primary">{t(`marketing.smartPricing.days.${d}`)}</p>
                <div className="flex min-h-[110px] flex-col justify-center divide-y divide-line">
                  {rules.length ? (
                    rules.map((r, i) => (
                      <div key={i} className="px-2 py-3 text-center">
                        <p className="text-body text-ink">
                          {r.start} – {r.end}
                        </p>
                        <p className="text-small text-muted">{ruleLabel(r, t)}</p>
                      </div>
                    ))
                  ) : (
                    <p className="px-2 text-center text-body text-muted">{t('marketing.smartPricing.standard')}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <Modal open={servicesOpen} onClose={() => setServicesOpen(false)} title={t('marketing.smartPricing.servicesTitle')}>
        <ul className="flex flex-col divide-y divide-line pb-3">
          {serviceList.map((s) => (
            <li key={s.id} className="flex justify-between py-2.5 text-body">
              <span className="text-ink">{s.name}</span>
              <span className="text-muted">{money(s.price)}</span>
            </li>
          ))}
        </ul>
      </Modal>
    </Page>
  )
}

const STEPS = ['team', 'services', 'rules'] as const

export function SmartPricingSetupPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { step = 'team' } = useParams()
  const sp = useDb((s) => s.smartPricing)
  const teamMembers = useDb((s) => s.teamMembers)
  const [draft, setDraft] = useState<Pick<SmartPricing, 'teamMemberIds' | 'serviceIds' | 'rules'>>(() =>
    sp.configured
      ? { teamMemberIds: sp.teamMemberIds, serviceIds: sp.serviceIds, rules: JSON.parse(JSON.stringify(sp.rules)) as SmartPricing['rules'] }
      : { teamMemberIds: 'all', serviceIds: 'all', rules: { 1: [{ start: '09:00', end: '11:00', direction: 'increase', value: 10, unit: 'percent' }, { start: '16:00', end: '17:00', direction: 'decrease', value: 10, unit: 'percent' }] } },
  )
  const [error, setError] = useState('')
  const [servicesOpen, setServicesOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const index = STEPS.indexOf(step as (typeof STEPS)[number])
  const members = teamMembers.filter((m) => !m.archived && m.bookable)
  const selected = draft.teamMemberIds === 'all' ? members.map((m) => m.id) : draft.teamMemberIds

  if (step === 'done') {
    const days = (dir: SmartPricingRule['direction']) => WEEKDAYS.filter((d) => draft.rules[d]?.some((r) => r.direction === dir)).map((d) => t(`marketing.smartPricing.days.${d}`))
    const inc = days('increase')
    const dec = days('decrease')
    const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} ${t('marketing.smartPricing.and')} ${xs[xs.length - 1]}` : xs[0])
    return (
      <WizardFrame
        actions={
          <Button variant="primary" onClick={() => navigate('/marketing/peak-pricing/details')} data-testid="smart-pricing-done">
            {t('marketing.common.done')}
          </Button>
        }
      >
        <div className="flex flex-col items-center pt-8 text-center">
          <SuccessBadge />
          <h1 className="mt-6 font-display text-[30px] font-bold text-ink">{t('marketing.smartPricing.done.title')}</h1>
        </div>
        <ul className="card mt-8 flex flex-col gap-3 p-8 text-body-lg text-ink">
          <li>{sp.serviceIds === 'all' ? t('marketing.smartPricing.done.allServices') : t('marketing.smartPricing.done.someServices', { count: sp.serviceIds.length })}</li>
          {inc.length > 0 && (
            <li className="flex items-center gap-2">
              <ArrowUp size={18} className="text-[#E8833A]" aria-hidden />
              {t('marketing.smartPricing.done.increase', { days: list(inc) })}
            </li>
          )}
          {dec.length > 0 && (
            <li className="flex items-center gap-2">
              <ArrowDown size={18} className="text-success" aria-hidden />
              {t('marketing.smartPricing.done.decrease', { days: list(dec) })}
            </li>
          )}
        </ul>
      </WizardFrame>
    )
  }

  const validateRules = (): string => {
    const active = WEEKDAYS.filter((d) => draft.rules[d]?.length)
    if (!active.length) return t('marketing.smartPricing.errors.noRules')
    for (const d of active) {
      const ranges = [...(draft.rules[d] ?? [])].sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
      for (let i = 0; i < ranges.length; i++) {
        const r = ranges[i]
        if (toMinutes(r.end) <= toMinutes(r.start)) return t('marketing.smartPricing.errors.endAfterStart', { day: t(`marketing.smartPricing.days.${d}`) })
        if (!(r.value > 0) || (r.unit === 'percent' && r.value > 100)) return t('marketing.smartPricing.errors.value', { day: t(`marketing.smartPricing.days.${d}`) })
        if (i > 0 && toMinutes(r.start) < toMinutes(ranges[i - 1].end)) return t('marketing.smartPricing.errors.overlap', { day: t(`marketing.smartPricing.days.${d}`) })
      }
    }
    return ''
  }

  const next = async () => {
    if (step === 'team' && !selected.length) {
      setError(t('marketing.smartPricing.errors.team'))
      return
    }
    if (step === 'services' && draft.serviceIds !== 'all' && !draft.serviceIds.length) {
      setError(t('marketing.smartPricing.errors.services'))
      return
    }
    if (step === 'rules') {
      const msg = validateRules()
      setError(msg)
      if (msg) return
      setSaving(true)
      try {
        await saveSmartPricing(draft)
        toast(t('marketing.smartPricing.toast.saved'))
        navigate('/marketing/peak-pricing/setup/done', { replace: true })
      } finally {
        setSaving(false)
      }
      return
    }
    setError('')
    navigate(`/marketing/peak-pricing/setup/${STEPS[index + 1]}`)
  }

  const setDay = (d: Weekday, rules: SmartPricingRule[]) => setDraft((x) => ({ ...x, rules: { ...x.rules, [d]: rules } }))
  const updateRange = (d: Weekday, i: number, patch: Partial<SmartPricingRule>) => setDay(d, (draft.rules[d] ?? []).map((r, j) => (j === i ? { ...r, ...patch } : r)))

  return (
    <WizardFrame
      segments={STEPS.map((_, i) => (i <= index ? 1 : 0))}
      onBack={index > 0 ? () => navigate(`/marketing/peak-pricing/setup/${STEPS[index - 1]}`) : undefined}
      maxWidth={step === 'rules' ? 'max-w-[1040px]' : undefined}
      actions={
        <>
          <Button onClick={() => navigate(sp.configured ? '/marketing/peak-pricing/details' : '/marketing/peak-pricing')}>{t('marketing.common.close')}</Button>
          <Button variant="primary" loading={saving} onClick={() => void next()} data-testid="smart-pricing-next">
            {step === 'rules' ? t('marketing.smartPricing.finish') : t('marketing.common.nextStep')}
          </Button>
        </>
      }
    >
      {step === 'team' && (
        <>
          <WizardTitle eyebrow={t('marketing.smartPricing.setupEyebrow')} title={t('marketing.smartPricing.team.title')} subtitle={t('marketing.smartPricing.team.subtitle')} />
          <div className="card flex flex-col gap-3 p-6">
            <Checkbox label={<span className="font-semibold">{t('marketing.common.selectAll')}</span>} checked={selected.length === members.length} onChange={(v) => setDraft({ ...draft, teamMemberIds: v ? 'all' : [] })} />
            <div className="flex flex-col gap-3 border-t border-line pt-3">
              {members.map((m) => (
                <Checkbox
                  key={m.id}
                  label={`${m.firstName} ${m.lastName}`}
                  hint={m.jobTitle}
                  checked={selected.includes(m.id)}
                  onChange={(v) => {
                    const ids = v ? [...selected, m.id] : selected.filter((x) => x !== m.id)
                    setDraft({ ...draft, teamMemberIds: ids.length === members.length ? 'all' : ids })
                  }}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {step === 'services' && (
        <>
          <WizardTitle eyebrow={t('marketing.smartPricing.setupEyebrow')} title={t('marketing.smartPricing.services.title')} subtitle={t('marketing.smartPricing.services.subtitle')} />
          <div className="card flex items-center justify-between gap-4 p-6">
            <div>
              <p className="text-body-strong text-ink">{t('marketing.smartPricing.services.applyTo')}</p>
              <p className="text-body text-muted">{draft.serviceIds === 'all' ? t('marketing.smartPricing.allServices') : t('marketing.smartPricing.nServices', { count: draft.serviceIds.length })}</p>
            </div>
            <Button size="sm" className="rounded-full" onClick={() => setServicesOpen(true)}>
              {t('marketing.common.edit')}
            </Button>
          </div>
          <p className="mt-4 text-body text-muted">{t('marketing.smartPricing.services.note')}</p>
          {servicesOpen && (
            <ScopeModal
              open
              scopeKey="services"
              value={draft.serviceIds}
              onClose={() => setServicesOpen(false)}
              onApply={(v) => {
                setDraft({ ...draft, serviceIds: v })
                setServicesOpen(false)
              }}
            />
          )}
        </>
      )}

      {step === 'rules' && (
        <>
          <WizardTitle
            eyebrow={t('marketing.smartPricing.setupEyebrow')}
            title={t('marketing.smartPricing.rules.title')}
            subtitle={
              <>
                {t('marketing.smartPricing.rules.subtitle')} <LearnMore topic={t('marketing.common.topics.smartPricingRules')}>{t('marketing.common.learnMore')}</LearnMore>
              </>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-body">
              <thead>
                <tr className="border-b border-line text-body-strong text-ink">
                  <th className="w-44 py-3">{t('marketing.smartPricing.rules.day')}</th>
                  <th className="py-3">{t('marketing.smartPricing.rules.interval')}</th>
                  <th className="py-3">{t('marketing.smartPricing.rules.change')}</th>
                  <th className="py-3">{t('marketing.smartPricing.rules.by')}</th>
                  <th className="w-12 py-3" />
                </tr>
              </thead>
              <tbody>
                {WEEKDAYS.map((d) => {
                  const ranges = draft.rules[d] ?? []
                  const on = ranges.length > 0
                  return (
                    <tr key={d} className="border-b border-line align-top">
                      <td className="py-5">
                        <Checkbox label={<span className="font-semibold">{t(`marketing.smartPricing.days.${d}`)}</span>} checked={on} onChange={(v) => setDay(d, v ? [{ start: '09:00', end: '11:00', direction: 'increase', value: 10, unit: 'percent' }] : [])} />
                      </td>
                      {!on ? (
                        <td colSpan={4} className="py-5 text-muted">
                          {t('marketing.smartPricing.rules.none')}
                        </td>
                      ) : (
                        <td colSpan={4} className="py-4">
                          <div className="flex flex-col gap-2">
                            {ranges.map((r, i) => (
                              <div key={i} className="flex flex-wrap items-center gap-2">
                                <Select aria-label={t('marketing.smartPricing.rules.start')} className="w-28" value={r.start} onChange={(e) => updateRange(d, i, { start: e.target.value })} options={TIMES} />
                                <span className="text-muted">-</span>
                                <Select aria-label={t('marketing.smartPricing.rules.end')} className="w-28" value={r.end} onChange={(e) => updateRange(d, i, { end: e.target.value })} options={[...TIMES.slice(1), '23:59']} />
                                <Select
                                  aria-label={t('marketing.smartPricing.rules.change')}
                                  className="w-40"
                                  value={r.direction}
                                  onChange={(e) => updateRange(d, i, { direction: e.target.value as SmartPricingRule['direction'] })}
                                  options={[
                                    { value: 'increase', label: `↑ ${t('marketing.smartPricing.rules.increase')}` },
                                    { value: 'decrease', label: `↓ ${t('marketing.smartPricing.rules.decrease')}` },
                                  ]}
                                />
                                <TextInput aria-label={t('marketing.smartPricing.rules.by')} className="w-32" type="number" min={0} prefix={r.unit === 'percent' ? '%' : '€'} value={Number.isFinite(r.value) ? r.value : ''} onChange={(e) => updateRange(d, i, { value: Number(e.target.value) })} />
                                <UnitToggle value={r.unit} onChange={(unit) => updateRange(d, i, { unit })} labels={{ percent: t('marketing.dealWizard.percentage'), amount: t('marketing.dealWizard.amount') }} />
                                <button type="button" className="icon-btn" aria-label={t('marketing.smartPricing.rules.delete')} onClick={() => setDay(d, ranges.filter((_, j) => j !== i))}>
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            ))}
                            <Button
                              variant="link"
                              className="self-start"
                              onClick={() => {
                                const last = ranges[ranges.length - 1]
                                const start = Math.min(toMinutes(last.end) + 60, 22 * 60)
                                setDay(d, [...ranges, { start: toClock(start), end: toClock(start + 60), direction: 'decrease', value: 10, unit: 'percent' }])
                              }}
                            >
                              {t('marketing.smartPricing.rules.addHours')}
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-md bg-danger-subtle px-4 py-3 text-body text-danger">
          {error}
        </p>
      )}
      {index === -1 && <EmptyState title={t('marketing.smartPricing.unknownStep')} />}
    </WizardFrame>
  )
}

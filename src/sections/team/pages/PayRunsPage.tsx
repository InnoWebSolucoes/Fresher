import { parseISO } from 'date-fns'
import { format } from '@/lib/dates'
import { FileClock, SlidersHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import type { PayRun } from '@/types'
import { useDb } from '@/store/db'
import { todayISO } from '@/lib/time'
import { money, round2 } from '@/lib/format'
import { Button, Chip, DataTable, EmptyState, Field, IntroPage, LearnMore, Menu, MenuButton, Modal, Page, PageHeader, PageSkeleton, SearchInput, Select, Toolbar, UnderlineTabs, confirm, toast, usePageLoading, type Column } from '@/components/ui'
import { deletePayRunDraft, enablePayRuns, usePayRunMeta, type PayRunMeta } from '@/api/team'
import { ActionsPill, MemberAvatar, PortalMenu, StatCard, Tour } from '../components/common'
import { AdjustmentModal } from '../components/AdjustmentModal'
import { BreakdownModal } from '../components/BreakdownModal'
import { RangePicker, resolveRange, type RangeValue } from '../components/RangePicker'
import { computeEarnings, payMembers, periodsList, salesInPeriod, usePayData, type PayPeriod } from '../lib/pay'
import { memberName } from '../lib/members'
import { rangeLabel } from '../lib/shifts'

interface SettleFilters {
  location: string
  method: 'all' | PayRun['method']
}
const NO_SETTLE_FILTERS: SettleFilters = { location: 'all', method: 'all' }

/** Pay runs: Pay periods and Settlements tabs (team.md §6). */
export function PayRunsPage({ tab = 'periods' }: { tab?: 'periods' | 'settlements' }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loading = usePageLoading()
  const pay = usePayData()
  const data = useDb(useShallow((s) => ({ cfg: s.settings.payRuns, payRuns: s.payRuns, teamMembers: s.teamMembers, locations: s.locations, registers: s.registers })))
  const metas = usePayRunMeta()
  const periods = useMemo(() => periodsList(todayISO(), data.cfg), [data.cfg])
  const [periodStart, setPeriodStart] = useState(periods[0].start)
  const period = periods.find((p) => p.start === periodStart) ?? periods[0]
  const [q, setQ] = useState('')
  const [breakdownId, setBreakdownId] = useState<string | null>(null)
  const [adjust, setAdjust] = useState<{ id: string; period: PayPeriod } | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [tour, setTour] = useState(false)
  const [range, setRange] = useState<RangeValue>(() => resolveRange('last_30_days'))
  const [settleFilters, setSettleFilters] = useState<SettleFilters>(NO_SETTLE_FILTERS)
  const [filtersDraft, setFiltersDraft] = useState<SettleFilters | null>(null)

  const cards = useMemo(() => {
    const sales = salesInPeriod(pay.sales, period)
    return payMembers(data.teamMembers).map((m) => computeEarnings(pay, m, period, sales))
  }, [pay, data.teamMembers, period])
  // Saved pay runs (Save and exit, Needs review, Skip) to resume.
  const drafts = useMemo(() => data.payRuns.filter((r) => r.status !== 'completed').sort((a, b) => (metas[b.id]?.updatedAt ?? b.createdAt).localeCompare(metas[a.id]?.updatedAt ?? a.createdAt)), [data.payRuns, metas])
  const visible = cards.filter((c) => memberName(c.member).toLowerCase().includes(q.trim().toLowerCase()))
  const sum = (f: (c: (typeof cards)[number]) => number) => cards.reduce((s, c) => s + f(c), 0)

  const settlements = useMemo(() => {
    const rows: { id: string; memberId: string; run: PayRun; meta?: PayRunMeta; amount: number; includes: string }[] = []
    for (const run of data.payRuns) {
      if (run.status !== 'completed') continue
      const day = format(parseISO(run.completedAt ?? run.createdAt), 'yyyy-MM-dd')
      if (day < range.from || day > range.to) continue
      for (const l of run.lines) {
        if (l.paid <= 0) continue
        const inc = (['wages', 'commissions', 'tips', 'other'] as const).filter((k) => l[k] !== 0).map((k) => t(`team.pay.kinds.${k}`))
        rows.push({ id: `${run.id}_${l.teamMemberId}`, memberId: l.teamMemberId, run, meta: metas[run.id], amount: l.paid, includes: inc.join(', ') })
      }
    }
    const locationOf = (r: (typeof rows)[number]) => r.meta?.locationId ?? data.teamMembers.find((m) => m.id === r.memberId)?.locationIds[0]
    const methodOf = (r: (typeof rows)[number]) => r.meta?.memberMethods[r.memberId] ?? r.run.method
    return rows
      .filter((r) => settleFilters.location === 'all' || locationOf(r) === settleFilters.location)
      .filter((r) => settleFilters.method === 'all' || methodOf(r) === settleFilters.method)
      .filter((r) => memberName(data.teamMembers.find((m) => m.id === r.memberId) ?? { firstName: '', lastName: '' }).toLowerCase().includes(q.trim().toLowerCase()))
  }, [data.payRuns, data.teamMembers, metas, range, q, t, settleFilters])
  const filterCount = (settleFilters.location !== 'all' ? 1 : 0) + (settleFilters.method !== 'all' ? 1 : 0)

  if (loading) return <Page><PageSkeleton /></Page>
  if (!data.cfg.enabled) {
    return (
      <Page>
        <IntroPage
          title={t('team.pay.introTitle')}
          body={t('team.pay.introBody')}
          bullets={[t('team.pay.intro1'), t('team.pay.intro2'), t('team.pay.intro3')]}
          primary={{
            label: t('team.common.startNow'),
            loading: starting,
            onClick: async () => {
              setStarting(true)
              await enablePayRuns()
              setStarting(false)
              setTour(true)
            },
          }}
        />
      </Page>
    )
  }

  const settlementCols: Column<(typeof settlements)[number]>[] = [
    { key: 'member', header: t('team.pay.cols.member'), cell: (r) => memberName(data.teamMembers.find((m) => m.id === r.memberId) ?? { firstName: '-', lastName: '' }) },
    { key: 'location', header: t('team.pay.cols.location'), cell: (r) => data.locations.find((l) => l.id === (r.meta?.locationId ?? data.teamMembers.find((m) => m.id === r.memberId)?.locationIds[0]))?.name ?? '-' },
    { key: 'date', header: t('team.pay.cols.date'), sortValue: (r) => r.run.completedAt ?? '', cell: (r) => format(parseISO(r.run.completedAt ?? r.run.createdAt), 'MMM d, yyyy') },
    { key: 'by', header: t('team.pay.cols.paidBy'), cell: (r) => r.meta?.createdBy ?? '-' },
    { key: 'method', header: t('team.pay.cols.method'), cell: (r) => t(`team.pay.methods.${r.meta?.memberMethods[r.memberId] ?? r.run.method}`) },
    { key: 'includes', header: t('team.pay.cols.includes'), cell: (r) => r.includes },
    { key: 'amount', header: t('team.pay.cols.amount'), align: 'right', sortValue: (r) => r.amount, cell: (r) => money(r.amount) },
  ]

  return (
    <Page wide>
      <PageHeader
        title={t('team.pay.title')}
        subtitle={
          <>
            {t('team.pay.subtitle')} <LearnMore topic={t('team.topics.payRuns')} />
          </>
        }
        actions={
          <Menu
            align="right"
            groups={[{ items: [{ label: t('team.pay.settings'), onSelect: () => navigate('/setup/team/pay-runs') }] }]}
            trigger={({ open, toggle }) => (
              <MenuButton open={open} toggle={toggle}>
                {t('team.common.options')}
              </MenuButton>
            )}
          />
        }
      />
      <UnderlineTabs
        className="mb-5"
        value={tab}
        onChange={(v) => navigate(v === 'periods' ? '/team/payrun/overview' : '/team/payrun/settlements')}
        items={[
          { value: 'periods', label: t('team.pay.periodsTab') },
          { value: 'settlements', label: t('team.pay.settlementsTab') },
        ]}
      />
      {tab === 'periods' ? (
        <>
          <Toolbar>
            <Select aria-label={t('team.pay.period')} value={period.start} onChange={(e) => setPeriodStart(e.target.value)} className="w-auto rounded-full" options={periods.map((p, i) => ({ value: p.start, label: `${rangeLabel(p.start, p.end)}${i === 0 ? ` · ${t('team.pay.current')}` : ''}` }))} />
            <SearchInput value={q} onChange={setQ} placeholder={t('team.pay.searchName')} className="md:max-w-[280px]" />
          </Toolbar>
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.6fr)]">
            <StatCard label={t('team.pay.earnings')} value={money(sum((c) => c.earnings))} />
            <StatCard label={t('team.pay.kinds.other')} value={money(sum((c) => c.other.total))} />
            <StatCard label={t('team.pay.total')} value={money(sum((c) => c.total))} />
            <StatCard label={t('team.pay.paid')} value={money(sum((c) => c.paid))} />
            <StatCard label={t('team.pay.toPay')} value={money(sum((c) => c.toPay))} strong className="col-span-2 md:col-span-1">
              <Button variant="primary" disabled={sum((c) => c.toPay) <= 0} onClick={() => navigate(`/team/payrun/new?period=${period.start}`)}>
                {t('team.pay.payTeam')}
              </Button>
            </StatCard>
          </div>
          {drafts.length > 0 && (
            <section aria-labelledby="saved-pay-runs" className="mb-6">
              <h2 id="saved-pay-runs" className="mb-3 font-display text-title-3 text-ink">
                {t('team.pay.drafts.title')}
              </h2>
              <div className="flex flex-col gap-3">
                {drafts.map((run) => {
                  const meta = metas[run.id]
                  const amount = round2(run.lines.reduce((s, l) => s + l.paid, 0))
                  const register = data.registers.find((r) => r.id === meta?.registerId)
                  const resume = () => navigate(`/team/payrun/new?draft=${run.id}`)
                  return (
                    <div key={run.id} className="card flex flex-wrap items-center gap-4 p-5">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-primary" aria-hidden>
                        <FileClock size={22} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-body-strong text-ink">
                          {run.source === 'register_tips' ? t('team.pay.drafts.tipsName', { register: register?.name ?? '' }) : t('team.pay.drafts.name')} · {rangeLabel(run.periodStart, run.periodEnd)}
                          <Chip tone={run.status === 'needs_review' ? 'warning' : 'neutral'}>{t(`team.pay.drafts.status.${run.status}`)}</Chip>
                        </p>
                        <p className="text-small text-muted">
                          {t('team.payRunNew.members', { count: run.lines.length })} · {money(amount)} · {t('team.pay.drafts.saved', { by: meta?.createdBy ?? '-', at: format(parseISO(meta?.updatedAt ?? run.createdAt), 'MMM d, yyyy, HH:mm') })}
                        </p>
                      </div>
                      <Button variant="primary" onClick={resume}>
                        {t('team.pay.drafts.resume')}
                      </Button>
                      <Menu
                        align="right"
                        label={t('team.common.actions')}
                        groups={[
                          {
                            items: [
                              { label: t('team.pay.drafts.resume'), onSelect: resume },
                              {
                                label: t('team.pay.drafts.delete'),
                                danger: true,
                                disabled: deleting === run.id,
                                onSelect: async () => {
                                  if (!(await confirm({ title: t('team.pay.drafts.deleteTitle'), body: t('team.pay.drafts.deleteBody'), confirmLabel: t('team.common.delete'), tone: 'danger' }))) return
                                  setDeleting(run.id)
                                  await deletePayRunDraft(run.id)
                                  setDeleting(null)
                                  toast(t('team.pay.drafts.toastDeleted'))
                                },
                              },
                            ],
                          },
                        ]}
                      />
                    </div>
                  )
                })}
              </div>
            </section>
          )}
          {visible.length === 0 ? (
            <div className="card">
              <EmptyState title={t('team.pay.emptyTitle')} body={t('team.pay.emptyBody')} action={<Button onClick={() => navigate('/team/team-members')}>{t('team.timesheets.viewMembers')}</Button>} />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {visible.map((c) => (
                <div key={c.member.id} onClick={() => setBreakdownId(c.member.id)} className="card grid cursor-pointer items-center gap-4 p-5 hover:border-line-strong md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.6fr)_minmax(0,2.4fr)]">
                  <div className="flex items-center gap-3">
                    <MemberAvatar member={c.member} size={56} />
                    <div className="min-w-0">
                      <button
                        type="button"
                        className="block truncate text-left text-body-strong text-ink hover:underline"
                        onClick={(e) => {
                          e.stopPropagation()
                          setBreakdownId(c.member.id)
                        }}
                      >
                        {memberName(c.member)}
                      </button>
                      <PortalMenu
                        align="left"
                        groups={[
                          {
                            items: [
                              { label: t('team.pay.viewBreakdown'), onSelect: () => setBreakdownId(c.member.id) },
                              { label: t('team.pay.pay'), disabled: c.toPay <= 0, onSelect: () => navigate(`/team/payrun/new?period=${period.start}&member=${c.member.id}`) },
                              { label: t('team.actions.edit'), onSelect: () => navigate(`/team/team-members/edit/${c.member.id}?section=payruns`) },
                              { label: t('team.pay.addAdjustment'), onSelect: () => setAdjust({ id: c.member.id, period }) },
                            ],
                          },
                        ]}
                        trigger={({ open, toggle }) => <ActionsPill variant="link" open={open} toggle={toggle} label={t('team.common.actions')} />}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 md:border-l md:border-line md:pl-6">
                    <Figure label={t('team.pay.earnings')} value={c.earnings} />
                    <Figure label={t('team.pay.kinds.other')} value={c.other.total} />
                  </div>
                  <div className="grid grid-cols-3 gap-4 md:border-l md:border-line md:pl-6">
                    <Figure label={t('team.pay.total')} value={c.total} />
                    <Figure label={t('team.pay.paid')} value={c.paid} />
                    <Figure label={t('team.pay.toPay')} value={c.toPay} strong />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <Toolbar>
            <RangePicker value={range} onChange={setRange} presets={['today', 'this_week', 'last_week', 'last_30_days', 'month_to_date', 'year_to_date']} />
            <Button className="rounded-full" icon={<SlidersHorizontal size={16} aria-hidden />} onClick={() => setFiltersDraft(settleFilters)}>
              {t('team.common.filters')}
              {filterCount > 0 && <span className="chip h-5 bg-primary px-1.5 text-caption text-on-primary">{filterCount}</span>}
            </Button>
            <SearchInput value={q} onChange={setQ} placeholder={t('team.pay.searchMember')} className="md:max-w-[280px]" />
          </Toolbar>
          <Modal
            open={filtersDraft !== null}
            onClose={() => setFiltersDraft(null)}
            title={t('team.common.filters')}
            footer={
              <>
                <Button onClick={() => setFiltersDraft(NO_SETTLE_FILTERS)}>{t('team.common.clearFilters')}</Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    setSettleFilters(filtersDraft ?? NO_SETTLE_FILTERS)
                    setFiltersDraft(null)
                  }}
                >
                  {t('team.common.apply')}
                </Button>
              </>
            }
          >
            {filtersDraft && (
              <div className="flex flex-col gap-5 pb-2">
                <Field label={t('team.pay.cols.location')}>
                  {(id) => <Select id={id} value={filtersDraft.location} onChange={(e) => setFiltersDraft({ ...filtersDraft, location: e.target.value })} options={[{ value: 'all', label: t('team.pay.allLocations') }, ...data.locations.map((l) => ({ value: l.id, label: l.name }))]} />}
                </Field>
                <Field label={t('team.pay.cols.method')}>
                  {(id) => (
                    <Select
                      id={id}
                      value={filtersDraft.method}
                      onChange={(e) => setFiltersDraft({ ...filtersDraft, method: e.target.value as SettleFilters['method'] })}
                      options={[{ value: 'all', label: t('team.pay.allMethods') }, ...(['manual', 'cash_register', 'wallet'] as const).map((m) => ({ value: m, label: t(`team.pay.methods.${m}`) }))]}
                    />
                  )}
                </Field>
              </div>
            )}
          </Modal>
          <DataTable columns={settlementCols} rows={settlements} rowKey={(r) => r.id} empty={<EmptyState title={t('team.pay.noSettlementsTitle')} body={t('team.pay.noSettlementsBody')} />} />
        </>
      )}
      <BreakdownModal memberId={breakdownId} period={period} onClose={() => setBreakdownId(null)} onPay={(id, p) => navigate(`/team/payrun/new?period=${p.start}&member=${id}`)} onAdjust={(id, p) => setAdjust({ id, period: p })} />
      <AdjustmentModal memberId={adjust?.id ?? null} period={adjust?.period ?? period} onClose={() => setAdjust(null)} />
      {tour && (
        <Tour
          onClose={() => {
            setTour(false)
            toast(t('team.pay.toastEnabled'))
          }}
          steps={[{ body: t('team.pay.tour1') }, { body: t('team.pay.tour2') }, { body: t('team.pay.tour3') }, { body: t('team.pay.tour4') }]}
        />
      )}
    </Page>
  )
}

export const SettlementsPage = () => <PayRunsPage tab="settlements" />
export const PayPeriodsPage = () => <PayRunsPage tab="periods" />

function Figure({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={strong ? 'text-right' : undefined}>
      <p className="text-small text-muted">{label}</p>
      <p className={strong ? 'text-body-strong tabular text-ink' : 'text-body tabular text-ink'}>{money(value)}</p>
    </div>
  )
}

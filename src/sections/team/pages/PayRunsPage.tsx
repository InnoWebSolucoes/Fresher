import { format, parseISO } from 'date-fns'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { useDb } from '@/store/db'
import { todayISO } from '@/lib/time'
import { money } from '@/lib/format'
import { Button, DataTable, EmptyState, IntroPage, LearnMore, Menu, MenuButton, Page, PageHeader, PageSkeleton, SearchInput, Select, Toolbar, UnderlineTabs, toast, usePageLoading, type Column } from '@/components/ui'
import { enablePayRuns, type PayRunRecord } from '@/api/team'
import { ActionsPill, MemberAvatar, PortalMenu, StatCard, Tour } from '../components/common'
import { AdjustmentModal } from '../components/AdjustmentModal'
import { BreakdownModal } from '../components/BreakdownModal'
import { RangePicker, resolveRange, type RangeValue } from '../components/RangePicker'
import { computeEarnings, payMembers, periodsList, salesInPeriod } from '../lib/pay'
import { memberName } from '../lib/members'
import { rangeLabel } from '../lib/shifts'

/** Pay runs: Pay periods and Settlements tabs (team.md §6). */
export function PayRunsPage({ tab = 'periods' }: { tab?: 'periods' | 'settlements' }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loading = usePageLoading()
  const data = useDb(useShallow((s) => ({ cfg: s.settings.payRuns, timesheets: s.timesheets, blockedTimeTypes: s.blockedTimeTypes, sales: s.sales, payments: s.payments, payAdjustments: s.payAdjustments, payRuns: s.payRuns, clients: s.clients, teamMembers: s.teamMembers, locations: s.locations })))
  const periods = useMemo(() => periodsList(todayISO(), data.cfg), [data.cfg])
  const [periodStart, setPeriodStart] = useState(periods[0].start)
  const period = periods.find((p) => p.start === periodStart) ?? periods[0]
  const [q, setQ] = useState('')
  const [breakdownId, setBreakdownId] = useState<string | null>(null)
  const [adjustId, setAdjustId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [tour, setTour] = useState(false)
  const [range, setRange] = useState<RangeValue>(() => resolveRange('last_30_days'))

  const cards = useMemo(() => {
    const sales = salesInPeriod(data.sales, period)
    return payMembers(data.teamMembers).map((m) => computeEarnings(data, m, period, sales))
  }, [data, period])
  const visible = cards.filter((c) => memberName(c.member).toLowerCase().includes(q.trim().toLowerCase()))
  const sum = (f: (c: (typeof cards)[number]) => number) => cards.reduce((s, c) => s + f(c), 0)

  const settlements = useMemo(() => {
    const rows: { id: string; memberId: string; run: PayRunRecord; amount: number; includes: string }[] = []
    for (const run of data.payRuns as PayRunRecord[]) {
      if (run.status !== 'completed') continue
      const day = format(parseISO(run.completedAt ?? run.createdAt), 'yyyy-MM-dd')
      if (day < range.from || day > range.to) continue
      for (const l of run.lines) {
        if (l.paid <= 0) continue
        const inc = (['wages', 'commissions', 'tips', 'other'] as const).filter((k) => l[k] !== 0).map((k) => t(`team.pay.kinds.${k}`))
        rows.push({ id: `${run.id}_${l.teamMemberId}`, memberId: l.teamMemberId, run, amount: l.paid, includes: inc.join(', ') })
      }
    }
    return rows.filter((r) => memberName(data.teamMembers.find((m) => m.id === r.memberId) ?? { firstName: '', lastName: '' }).toLowerCase().includes(q.trim().toLowerCase()))
  }, [data.payRuns, data.teamMembers, range, q, t])

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
    { key: 'location', header: t('team.pay.cols.location'), cell: (r) => data.locations.find((l) => l.id === (r.run.locationId ?? data.teamMembers.find((m) => m.id === r.memberId)?.locationIds[0]))?.name ?? '-' },
    { key: 'date', header: t('team.pay.cols.date'), sortValue: (r) => r.run.completedAt ?? '', cell: (r) => format(parseISO(r.run.completedAt ?? r.run.createdAt), 'MMM d, yyyy') },
    { key: 'by', header: t('team.pay.cols.paidBy'), cell: (r) => r.run.createdBy ?? '-' },
    { key: 'method', header: t('team.pay.cols.method'), cell: (r) => t(`team.pay.methods.${r.run.memberMethods?.[r.memberId] ?? r.run.method}`) },
    { key: 'includes', header: t('team.pay.cols.includes'), cell: (r) => r.includes },
    { key: 'amount', header: t('team.pay.cols.amount'), align: 'right', sortValue: (r) => r.amount, cell: (r) => money(r.amount) },
  ]

  return (
    <Page wide>
      <PageHeader
        title={t('team.pay.title')}
        subtitle={
          <>
            {t('team.pay.subtitle')} <LearnMore topic="pay runs" />
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
            <SearchInput value={q} onChange={setQ} placeholder={t('team.pay.searchName')} className="max-w-[280px]" />
          </Toolbar>
          <div className="mb-5 grid gap-3 md:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.6fr)]">
            <StatCard label={t('team.pay.earnings')} value={money(sum((c) => c.earnings))} />
            <StatCard label={t('team.pay.kinds.other')} value={money(sum((c) => c.other.total))} />
            <StatCard label={t('team.pay.total')} value={money(sum((c) => c.total))} />
            <StatCard label={t('team.pay.paid')} value={money(sum((c) => c.paid))} />
            <StatCard label={t('team.pay.toPay')} value={money(sum((c) => c.toPay))} strong>
              <Button variant="primary" disabled={sum((c) => c.toPay) <= 0} onClick={() => navigate(`/team/payrun/new?period=${period.start}`)}>
                {t('team.pay.payTeam')}
              </Button>
            </StatCard>
          </div>
          {visible.length === 0 ? (
            <div className="card">
              <EmptyState title={t('team.pay.emptyTitle')} body={t('team.pay.emptyBody')} action={<Button onClick={() => navigate('/team/team-members')}>{t('team.timesheets.viewMembers')}</Button>} />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {visible.map((c) => (
                <div key={c.member.id} role="button" tabIndex={0} onClick={() => setBreakdownId(c.member.id)} onKeyDown={(e) => e.key === 'Enter' && setBreakdownId(c.member.id)} className="card grid cursor-pointer items-center gap-4 p-5 hover:border-line-strong md:grid-cols-[minmax(0,1.4fr)_1fr_1fr_1fr_1fr_1fr]">
                  <div className="flex items-center gap-3">
                    <MemberAvatar member={c.member} size={52} />
                    <div>
                      <p className="text-body-strong text-ink">{memberName(c.member)}</p>
                      <PortalMenu
                        align="left"
                        groups={[
                          {
                            items: [
                              { label: t('team.pay.viewBreakdown'), onSelect: () => setBreakdownId(c.member.id) },
                              { label: t('team.pay.pay'), disabled: c.toPay <= 0, onSelect: () => navigate(`/team/payrun/new?period=${period.start}&member=${c.member.id}`) },
                              { label: t('team.actions.edit'), onSelect: () => navigate(`/team/team-members/edit/${c.member.id}?section=payruns`) },
                              { label: t('team.pay.addAdjustment'), onSelect: () => setAdjustId(c.member.id) },
                            ],
                          },
                        ]}
                        trigger={({ open, toggle }) => <ActionsPill variant="link" open={open} toggle={toggle} label={t('team.common.actions')} />}
                      />
                    </div>
                  </div>
                  {[
                    [t('team.pay.earnings'), c.earnings],
                    [t('team.pay.kinds.other'), c.other.total],
                    [t('team.pay.total'), c.total],
                    [t('team.pay.paid'), c.paid],
                    [t('team.pay.toPay'), c.toPay],
                  ].map(([label, value], i) => (
                    <div key={i} className={i === 4 ? 'md:text-right' : ''}>
                      <p className="text-small text-muted">{label}</p>
                      <p className={i === 4 ? 'text-body-strong text-ink' : 'text-body text-ink'}>{money(value as number)}</p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <Toolbar>
            <RangePicker value={range} onChange={setRange} presets={['today', 'this_week', 'last_week', 'last_30_days', 'month_to_date', 'year_to_date']} />
            <SearchInput value={q} onChange={setQ} placeholder={t('team.pay.searchMember')} className="max-w-[280px]" />
          </Toolbar>
          <DataTable columns={settlementCols} rows={settlements} rowKey={(r) => r.id} empty={<EmptyState title={t('team.pay.noSettlementsTitle')} body={t('team.pay.noSettlementsBody')} />} />
        </>
      )}
      <BreakdownModal memberId={breakdownId} period={period} onClose={() => setBreakdownId(null)} onPay={(id) => navigate(`/team/payrun/new?period=${period.start}&member=${id}`)} onAdjust={(id) => { setBreakdownId(null); setAdjustId(id) }} />
      <AdjustmentModal memberId={adjustId} period={period} onClose={() => setAdjustId(null)} />
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

import { format, parseISO } from 'date-fns'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import type { ID } from '@/types'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { durationLong } from '@/lib/time'
import { money } from '@/lib/format'
import { DataTable, Menu, MenuButton, Modal, PillTabs, Select, type Column } from '@/components/ui'
import { MemberAvatar, Row, StatCard } from './common'
import { ACTIVITY_TYPE_GROUPS, computeEarnings, type ActivityRow, type PayKind, type PayPeriod } from '../lib/pay'
import { memberName } from '../lib/members'
import { rangeLabel } from '../lib/shifts'

/** Pay breakdown for a member and period: Overview and Activity tabs (team.md §6.1). */
export function BreakdownModal({ memberId, period, onClose, onPay, onAdjust }: { memberId: ID | null; period: PayPeriod; onClose: () => void; onPay?: (id: ID) => void; onAdjust: (id: ID) => void }) {
  if (!memberId) return null
  return <Breakdown key={memberId} memberId={memberId} period={period} onClose={onClose} onPay={onPay} onAdjust={onAdjust} />
}

function Breakdown({ memberId, period, onClose, onPay, onAdjust }: { memberId: ID; period: PayPeriod; onClose: () => void; onPay?: (id: ID) => void; onAdjust: (id: ID) => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const drawer = useDrawer()
  const data = useDb(useShallow((s) => ({ timesheets: s.timesheets, blockedTimeTypes: s.blockedTimeTypes, sales: s.sales, payments: s.payments, payAdjustments: s.payAdjustments, payRuns: s.payRuns, clients: s.clients, member: s.teamMembers.find((m) => m.id === memberId), locations: s.locations })))
  const [tab, setTab] = useState<'overview' | 'activity'>('overview')
  const [kind, setKind] = useState<'all' | PayKind | 'paid'>('all')
  const [type, setType] = useState('all')
  const [sort, setSort] = useState('dateDesc')
  const e = useMemo(() => (data.member ? computeEarnings(data, data.member, period) : null), [data, period])
  const rows = useMemo(() => {
    if (!e) return []
    const list = e.activity.filter((r) => (kind === 'all' || r.kind === kind) && (type === 'all' || r.type === type))
    const sorters: Record<string, (a: ActivityRow, b: ActivityRow) => number> = {
      dateDesc: (a, b) => b.at.localeCompare(a.at),
      dateAsc: (a, b) => a.at.localeCompare(b.at),
      totalDesc: (a, b) => b.total - a.total,
      totalAsc: (a, b) => a.total - b.total,
      paidDesc: (a, b) => b.paid - a.paid,
      paidAsc: (a, b) => a.paid - b.paid,
    }
    return [...list].sort(sorters[sort])
  }, [e, kind, type, sort])
  if (!data.member || !e) return null
  const member = data.member
  const location = data.locations.find((l) => l.id === member.locationIds[0])

  const openRef = (r: ActivityRow) => {
    if (!r.link) return
    if (r.link.kind === 'timesheet') {
      onClose()
      drawer.open('timesheet', { id: r.link.id })
    } else if (r.link.kind === 'sale') {
      onClose()
      drawer.open('sale', { id: r.link.id })
    }
  }
  const columns: Column<ActivityRow>[] = [
    { key: 'date', header: t('team.pay.cols.date'), cell: (r) => format(parseISO(r.at), 'MMM d, yyyy, HH:mm') },
    { key: 'activity', header: t('team.pay.cols.activity'), cell: (r) => t(`team.pay.activity.${r.activity}`) },
    {
      key: 'reference',
      header: t('team.pay.cols.reference'),
      cell: (r) =>
        r.link && (r.link.kind === 'timesheet' || r.link.kind === 'sale') ? (
          <button type="button" className="text-primary hover:underline" onClick={() => openRef(r)}>
            {r.reference}
          </button>
        ) : (
          <span className="text-muted">{r.reference || '-'}</span>
        ),
    },
    { key: 'type', header: t('team.pay.cols.type'), cell: (r) => (r.type === 'timesheet' && r.detail ? `${t('team.pay.types.timesheet')} • ${durationLong(Number(r.detail))}` : t(`team.pay.types.${r.type}`)) },
    { key: 'total', header: t('team.pay.cols.total'), align: 'right', cell: (r) => (r.total ? money(r.total) : '-') },
    { key: 'paid', header: t('team.pay.cols.paid'), align: 'right', cell: (r) => (r.paid ? money(r.paid) : '-') },
  ]
  const sumTotal = rows.reduce((s, r) => s + r.total, 0)
  const sumPaid = rows.reduce((s, r) => s + r.paid, 0)

  return (
    <Modal
      open
      size="xl"
      onClose={onClose}
      title={t('team.pay.breakdown')}
      className="bg-canvas"
    >
      <div className="pb-4">
        <div className="mb-4 flex justify-end">
          <Menu
            align="right"
            groups={[
              {
                items: [
                  ...(onPay && e.toPay > 0 ? [{ label: t('team.pay.payNow'), onSelect: () => onPay(member.id) }] : []),
                  { label: t('team.pay.addAdjustment'), onSelect: () => onAdjust(member.id) },
                ],
              },
              { items: [{ label: t('team.pay.memberSettings'), onSelect: () => navigate(`/team/team-members/edit/${member.id}?section=payruns`) }] },
            ]}
            trigger={({ open, toggle }) => (
              <MenuButton open={open} toggle={toggle}>
                {t('team.common.options')}
              </MenuButton>
            )}
          />
        </div>
        <div className="card flex items-center gap-4 p-4">
          <MemberAvatar member={member} size={52} />
          <div>
            <p className="text-body-strong text-ink">{memberName(member)}</p>
            <p className="text-body text-ink">{location?.name}</p>
            <p className="text-small text-muted">{rangeLabel(period.start, period.end)}</p>
          </div>
        </div>
        <PillTabs
          className="mt-5"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'overview', label: t('team.pay.overview') },
            { value: 'activity', label: t('team.pay.activityTab') },
          ]}
        />
        {tab === 'overview' ? (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <StatCard label={t('team.pay.earnings')} value={money(e.earnings)} />
              <StatCard label={t('team.pay.kinds.other')} value={money(e.other.total)} />
              <StatCard label={t('team.pay.paid')} value={money(e.paid)} />
              <StatCard label={t('team.pay.toPay')} value={money(e.toPay)} strong />
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-4">
                <section className="card p-6">
                  <h3 className="mb-3 font-display text-title-3 text-ink">{t('team.pay.earnings')}</h3>
                  <Row label={t('team.pay.kinds.wages')} value={money(e.wages.total)} strong />
                  <Row label={t('team.pay.hourlyRate')} value={money(e.wages.rate)} />
                  <Row label={t('team.pay.regularHours')} value={durationLong(e.wages.regularMin)} />
                  <Row label={t('team.pay.regularTotal')} value={money(e.wages.regularTotal)} />
                  <Row label={t('team.pay.overtimeRate')} value={money(e.wages.overtimeRate)} />
                  <Row label={t('team.pay.overtimeHours')} value={durationLong(e.wages.overtimeMin)} />
                  <Row label={t('team.pay.overtimeTotal')} value={money(e.wages.overtimeTotal)} />
                  {e.wages.adjustment !== 0 && <Row label={t('team.pay.types.wageAdjustment')} value={money(e.wages.adjustment)} />}
                  <div className="my-3 border-t border-line" />
                  <Row label={t('team.pay.kinds.commissions')} value={money(e.commissions.total)} strong />
                  {(['service', 'addons', 'product', 'giftCard', 'voucher', 'membership', 'package', 'noShow', 'cancellation'] as const).map((k) => (
                    <Row key={k} label={t(`team.pay.commission.${k}`)} value={money(e.commissions[k])} />
                  ))}
                  {e.commissions.adjustment !== 0 && <Row label={t('team.pay.types.commissionAdjustment')} value={money(e.commissions.adjustment)} />}
                  <div className="my-3 border-t border-line" />
                  <Row label={t('team.pay.kinds.tips')} value={money(e.tips.total)} strong />
                  {(['checkout', 'app', 'terminal', 'after'] as const).map((k) => (
                    <Row key={k} label={t(`team.pay.tips.${k}`)} value={money(e.tips[k])} />
                  ))}
                  {e.tips.adjustment !== 0 && <Row label={t('team.pay.types.tipAdjustment')} value={money(e.tips.adjustment)} />}
                  <div className="my-3 border-t border-line" />
                  <Row label={t('team.pay.earningsTotal')} value={money(e.earnings)} strong className="text-body-lg" />
                </section>
                <section className="card p-6">
                  <h3 className="mb-3 font-display text-title-3 text-ink">{t('team.pay.kinds.other')}</h3>
                  <Row label={t('team.pay.kinds.other')} value={money(e.other.total)} strong />
                  <Row label={t('team.pay.processingFees')} value={money(e.other.processing)} />
                  <Row label={t('team.pay.newClientFees')} value={money(e.other.newClient)} />
                  {e.other.adjustment !== 0 && <Row label={t('team.pay.otherAdjustments')} value={money(e.other.adjustment)} />}
                  <div className="my-3 border-t border-line" />
                  <Row label={t('team.pay.otherTotal')} value={money(e.other.total)} strong className="text-body-lg" />
                </section>
              </div>
              <section className="card h-fit p-6">
                <h3 className="mb-3 font-display text-title-3 text-ink">{t('team.pay.paid')}</h3>
                {e.paid > 0 ? (
                  e.activity
                    .filter((r) => r.kind === 'paid')
                    .map((r) => <Row key={r.id} label={`${t(`team.pay.types.${r.type}`)} · ${format(parseISO(r.at), 'MMM d, yyyy')}`} value={money(r.paid)} />)
                ) : (
                  <p className="text-body text-muted">{t('team.pay.noPayments')}</p>
                )}
              </section>
            </div>
          </>
        ) : (
          <>
            <div className="mb-3 mt-5 flex flex-wrap gap-2">
              <Select aria-label={t('team.pay.cols.activity')} value={kind} onChange={(ev) => setKind(ev.target.value as typeof kind)} className="w-auto rounded-full" options={(['all', 'wages', 'commissions', 'tips', 'other', 'paid'] as const).map((k) => ({ value: k, label: t(`team.pay.filterKinds.${k}`) }))} />
              <select aria-label={t('team.pay.allTypes')} value={type} onChange={(ev) => setType(ev.target.value)} className="input w-auto rounded-full">
                <option value="all">{t('team.pay.allTypes')}</option>
                {ACTIVITY_TYPE_GROUPS.map((group, gi) => (
                  <optgroup key={gi} label={t(`team.pay.typeGroups.${gi}`)}>
                    {group.map((ty) => (
                      <option key={ty} value={ty}>
                        {t(`team.pay.types.${ty}`)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <Select aria-label={t('team.pay.sortLabel')} value={sort} onChange={(ev) => setSort(ev.target.value)} className="ml-auto w-auto rounded-full" options={['dateDesc', 'dateAsc', 'totalDesc', 'totalAsc', 'paidDesc', 'paidAsc'].map((s) => ({ value: s, label: t(`team.pay.sort.${s}`) }))} />
            </div>
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(r) => r.id}
              totalRow={{ date: t('team.pay.cols.total'), total: money(sumTotal), paid: sumPaid ? money(sumPaid) : '-' }}
              empty={<p className="px-6 py-10 text-center text-body text-muted">{t('team.pay.noActivity')}</p>}
            />
          </>
        )}
      </div>
    </Modal>
  )
}

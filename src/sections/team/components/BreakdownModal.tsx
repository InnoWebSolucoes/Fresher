import clsx from 'clsx'
import { format, parseISO } from 'date-fns'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { ID, PayAdjustment } from '@/types'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { durationLong, todayISO } from '@/lib/time'
import { money } from '@/lib/format'
import { Button, DataTable, Menu, MenuButton, Modal, PillTabs, Select, confirm, toast, type Column } from '@/components/ui'
import { deletePayAdjustment } from '@/api/team'
import { MemberAvatar, Row, SortMenu, StatCard } from './common'
import { ACTIVITY_TYPE_GROUPS, COMMISSION_KEYS, computeEarnings, periodsList, usePayData, type ActivityRow, type PayKind, type PayPeriod } from '../lib/pay'
import { memberName } from '../lib/members'
import { rangeLabel } from '../lib/shifts'

type Tab = 'overview' | 'activity'
const CHEVRON = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%23586A68' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")"
type KindFilter = 'all' | PayKind | 'paid'

interface BreakdownProps {
  memberId: ID | null
  period: PayPeriod
  initialTab?: Tab
  /** Activity filter to start with (amount links in the pay run summary). */
  initialKind?: PayKind
  onClose: () => void
  onPay?: (id: ID, period: PayPeriod) => void
  onAdjust: (id: ID, period: PayPeriod) => void
}

/** Pay breakdown for a member and period: Overview and Activity tabs (team.md §6.1, team-108/110). */
export function BreakdownModal(props: BreakdownProps) {
  if (!props.memberId) return null
  return <Breakdown key={`${props.memberId}_${props.initialTab ?? ''}_${props.initialKind ?? ''}`} {...props} memberId={props.memberId} />
}

function Breakdown({ memberId, period: initialPeriod, initialTab = 'overview', initialKind, onClose, onPay, onAdjust }: BreakdownProps & { memberId: ID }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const drawer = useDrawer()
  const data = usePayData()
  const member = useDb((s) => s.teamMembers.find((m) => m.id === memberId))
  const locations = useDb((s) => s.locations)
  const cfg = useDb((s) => s.settings.payRuns)
  const [tab, setTab] = useState<Tab>(initialTab)
  const [period, setPeriod] = useState<PayPeriod>(initialPeriod)
  const [kind, setKind] = useState<KindFilter>(initialKind ?? 'all')
  const [type, setType] = useState('all')
  const [sort, setSort] = useState('dateDesc')
  const [viewing, setViewing] = useState<PayAdjustment | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const periods = useMemo(() => {
    const list = periodsList(todayISO(), cfg, 12)
    return list.some((p) => p.start === initialPeriod.start) ? list : [initialPeriod, ...list]
  }, [cfg, initialPeriod])

  // Full-screen view: Escape closes it unless a dialog is open on top.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const dialogs = document.querySelectorAll('[aria-modal="true"]')
      if (dialogs[dialogs.length - 1] !== panel.current) return
      e.stopPropagation()
      onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [])

  const e = useMemo(() => (member ? computeEarnings(data, member, period) : null), [data, member, period])
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
  if (!member || !e) return null
  const location = locations.find((l) => l.id === member.locationIds[0])

  const openRef = (r: ActivityRow) => {
    if (!r.link) return
    if (r.link.kind === 'timesheet') {
      onClose()
      drawer.open('timesheet', { id: r.link.id })
    } else if (r.link.kind === 'sale') {
      onClose()
      drawer.open('sale', { id: r.link.id })
    } else if (r.link.kind === 'adjustment') {
      setViewing(e.adjustments.find((a) => a.id === r.link?.id) ?? null)
    } else if (r.link.kind === 'payRun') {
      onClose()
      navigate('/team/payrun/settlements')
    }
  }
  const activityLabel = (r: ActivityRow) => (r.activity.endsWith('Adjustment') ? t(`team.pay.types.${r.activity}`) : t(`team.pay.activity.${r.activity}`))
  const columns: Column<ActivityRow>[] = [
    { key: 'date', header: t('team.pay.cols.date'), cell: (r) => format(parseISO(r.at), 'MMM d, yyyy, HH:mm') },
    { key: 'activity', header: t('team.pay.cols.activity'), cell: activityLabel },
    {
      key: 'reference',
      header: t('team.pay.cols.reference'),
      cell: (r) =>
        r.link ? (
          <button type="button" className="text-primary hover:underline" onClick={() => openRef(r)}>
            {r.link.kind === 'adjustment' ? t('team.pay.view') : r.reference}
          </button>
        ) : (
          <span className="text-muted">{r.reference || '-'}</span>
        ),
    },
    {
      key: 'type',
      header: t('team.pay.cols.type'),
      cell: (r) => (r.type === 'timesheet' && r.detail ? `${t('team.pay.types.timesheet')} • ${durationLong(Number(r.detail))}` : r.detail && r.kind === 'commissions' ? `${t(`team.pay.types.${r.type}`)} • ${r.detail}` : t(`team.pay.types.${r.type}`)),
    },
    { key: 'total', header: t('team.pay.cols.total'), align: 'right', cell: (r) => (r.total ? money(r.total) : '-') },
    { key: 'paid', header: t('team.pay.cols.paid'), align: 'right', cell: (r) => (r.paid ? money(r.paid) : '-') },
  ]
  const sumTotal = rows.reduce((s, r) => s + r.total, 0)
  const sumPaid = rows.reduce((s, r) => s + r.paid, 0)
  const paidRows = e.activity.filter((r) => r.kind === 'paid')

  return createPortal(
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="breakdown-title" className="fixed inset-0 z-[70] overflow-y-auto bg-canvas">
      <div className="sticky top-0 z-10 flex justify-end gap-2 bg-canvas/95 px-6 py-4 backdrop-blur">
        <Menu
          align="right"
          groups={[
            {
              items: [
                ...(onPay ? [{ label: t('team.pay.payNow'), disabled: e.toPay <= 0, onSelect: () => onPay(member.id, period) }] : []),
                { label: t('team.pay.addAdjustment'), onSelect: () => onAdjust(member.id, period) },
              ],
            },
            {
              items: [
                {
                  label: t('team.pay.memberSettings'),
                  onSelect: () => {
                    onClose()
                    navigate(`/team/team-members/edit/${member.id}?section=payruns`)
                  },
                },
              ],
            },
          ]}
          trigger={({ open, toggle }) => (
            <MenuButton open={open} toggle={toggle}>
              {t('team.common.options')}
            </MenuButton>
          )}
        />
        <Button ref={closeRef} onClick={onClose}>
          {t('team.common.close')}
        </Button>
      </div>
      <div className="mx-auto max-w-6xl px-6 pb-16">
        <h1 id="breakdown-title" className="font-display text-display text-ink">
          {t('team.pay.breakdown')}
        </h1>
        <div className="card mt-6 flex items-center gap-4 p-5">
          <MemberAvatar member={member} size={60} />
          <div>
            <p className="text-body-lg font-semibold text-ink">{memberName(member)}</p>
            <p className="text-body text-ink">{location?.name}</p>
            <p className="text-body text-muted">{rangeLabel(period.start, period.end)}</p>
          </div>
        </div>
        <PillTabs
          className="mt-6"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'overview', label: t('team.pay.overview') },
            { value: 'activity', label: t('team.pay.activityTab') },
          ]}
        />
        {tab === 'overview' ? (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label={t('team.pay.earnings')} value={money(e.earnings)} />
              <StatCard label={t('team.pay.kinds.other')} value={money(e.other.total)} />
              <StatCard label={t('team.pay.paid')} value={money(e.paid)} />
              <StatCard label={t('team.pay.toPay')} value={money(e.toPay)} strong />
            </div>
            <div className="mt-6 grid items-start gap-6 md:grid-cols-2">
              <div className="flex flex-col gap-6">
                <section className="card p-8">
                  <h2 className="mb-4 font-display text-title-3 text-ink">{t('team.pay.earnings')}</h2>
                  <Row label={t('team.pay.kinds.wages')} value={money(e.wages.total)} strong />
                  <Row label={t('team.pay.hourlyRate')} value={money(e.wages.rate)} />
                  <Row label={t('team.pay.regularHours')} value={durationLong(e.wages.regularMin)} />
                  <Row label={t('team.pay.regularTotal')} value={money(e.wages.regularTotal)} />
                  <Row label={t('team.pay.overtimeRate')} value={money(e.wages.overtimeRate)} />
                  <Row label={t('team.pay.overtimeHours')} value={durationLong(e.wages.overtimeMin)} />
                  <Row label={t('team.pay.overtimeTotal')} value={money(e.wages.overtimeTotal)} />
                  {e.wages.adjustment !== 0 && <Row label={t('team.pay.types.wageAdjustment')} value={money(e.wages.adjustment)} />}
                  <div className="my-4 border-t border-line" />
                  <Row label={t('team.pay.kinds.commissions')} value={money(e.commissions.total)} strong />
                  {COMMISSION_KEYS.map((k) => (
                    <Row key={k} label={t(`team.pay.commission.${k}`)} value={money(e.commissions[k])} />
                  ))}
                  {e.commissions.adjustment !== 0 && <Row label={t('team.pay.types.commissionAdjustment')} value={money(e.commissions.adjustment)} />}
                  <div className="my-4 border-t border-line" />
                  <Row label={t('team.pay.kinds.tips')} value={money(e.tips.total)} strong />
                  {(['checkout', 'app', 'terminal', 'after'] as const).map((k) => (
                    <Row key={k} label={t(`team.pay.tips.${k}`)} value={money(e.tips[k])} />
                  ))}
                  {e.tips.adjustment !== 0 && <Row label={t('team.pay.types.tipAdjustment')} value={money(e.tips.adjustment)} />}
                  <div className="my-4 border-t border-line" />
                  <Row label={t('team.pay.earningsTotal')} value={money(e.earnings)} strong className="text-body-lg" />
                </section>
                <section className="card p-8">
                  <h2 className="mb-4 font-display text-title-3 text-ink">{t('team.pay.kinds.other')}</h2>
                  <Row label={t('team.pay.kinds.other')} value={money(e.other.total)} strong />
                  <Row label={t('team.pay.processingFees')} value={money(e.other.processing)} />
                  <Row label={t('team.pay.newClientFees')} value={money(e.other.newClient)} />
                  {e.other.adjustment !== 0 && <Row label={t('team.pay.otherAdjustments')} value={money(e.other.adjustment)} />}
                  <div className="my-4 border-t border-line" />
                  <Row label={t('team.pay.otherTotal')} value={money(e.other.total)} strong className="text-body-lg" />
                </section>
              </div>
              <section className="card p-8">
                <h2 className="mb-4 font-display text-title-3 text-ink">{t('team.pay.paid')}</h2>
                {paidRows.length ? (
                  paidRows.map((r) => <Row key={r.id} label={`${t(`team.pay.types.${r.type}`)} · ${format(parseISO(r.at), 'MMM d, yyyy')}`} value={money(r.paid)} />)
                ) : (
                  <p className="text-body text-muted">{t('team.pay.noPayments')}</p>
                )}
              </section>
            </div>
          </>
        ) : (
          <>
            <div className="mb-4 mt-6 flex flex-wrap items-center gap-2">
              <Select aria-label={t('team.pay.filterKindsLabel')} value={kind} onChange={(ev) => setKind(ev.target.value as KindFilter)} className="h-10 w-auto rounded-full" options={(['all', 'wages', 'commissions', 'tips', 'other', 'paid'] as const).map((k) => ({ value: k, label: t(`team.pay.filterKinds.${k}`) }))} />
              <select aria-label={t('team.pay.allTypes')} value={type} onChange={(ev) => setType(ev.target.value)} className="input h-10 w-auto appearance-none rounded-full bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9" style={{ backgroundImage: CHEVRON }}>
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
              <Select aria-label={t('team.pay.period')} value={period.start} onChange={(ev) => setPeriod(periods.find((p) => p.start === ev.target.value) ?? period)} className="h-10 w-auto rounded-full" options={periods.map((p) => ({ value: p.start, label: rangeLabel(p.start, p.end) }))} />
              <div className="ml-auto">
                <SortMenu label={t('team.pay.sortLabel')} value={sort} onChange={setSort} options={['dateDesc', 'dateAsc', 'totalDesc', 'totalAsc', 'paidDesc', 'paidAsc'].map((s) => ({ value: s, label: t(`team.pay.sort.${s}`) }))} />
              </div>
            </div>
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(r) => r.id}
              totalRow={{ date: t('team.pay.cols.total'), total: money(sumTotal), paid: money(sumPaid) }}
              empty={<p className="px-6 py-10 text-center text-body text-muted">{t('team.pay.noActivity')}</p>}
            />
          </>
        )}
      </div>
      <AdjustmentDetail adjustment={viewing} onClose={() => setViewing(null)} />
    </div>,
    document.body,
  )
}

/** Adjustment "View": amount, type, note and date, with Delete. */
function AdjustmentDetail({ adjustment, onClose }: { adjustment: PayAdjustment | null; onClose: () => void }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  if (!adjustment) return null
  const type = { wages: 'wageAdjustment', commissions: 'commissionAdjustment', tips: 'tipAdjustment', other: 'otherAdjustment' }[adjustment.kind]
  const remove = async () => {
    if (!(await confirm({ title: t('team.pay.deleteAdjustmentTitle'), body: t('team.pay.deleteAdjustmentBody'), confirmLabel: t('team.common.delete'), tone: 'danger' }))) return
    setBusy(true)
    await deletePayAdjustment(adjustment.id)
    setBusy(false)
    toast(t('team.pay.toastAdjustmentDeleted'))
    onClose()
  }
  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title={t(`team.pay.types.${type}`)}
      footer={
        <>
          <Button variant="danger" className="mr-auto" loading={busy} onClick={() => void remove()}>
            {t('team.common.delete')}
          </Button>
          <Button onClick={onClose}>{t('team.common.close')}</Button>
        </>
      }
    >
      <div className="pb-2">
        <Row label={t('team.pay.amount')} value={<span className={clsx(adjustment.amount < 0 && 'text-danger')}>{`${adjustment.amount < 0 ? '-' : '+'} ${money(Math.abs(adjustment.amount))}`}</span>} strong />
        <Row label={t('team.pay.cols.date')} value={format(parseISO(adjustment.at), 'MMM d, yyyy, HH:mm')} />
        <div className="mt-3 rounded-lg bg-sunken p-4">
          <p className="text-small text-muted">{t('team.pay.note')}</p>
          <p className="whitespace-pre-wrap text-body text-ink">{adjustment.note || t('team.pay.noNote')}</p>
        </div>
      </div>
    </Modal>
  )
}

import { NotebookPen } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import type { ID } from '@/types'
import { useDb } from '@/store/db'
import { money, round2 } from '@/lib/format'
import { Button, Field, Menu, Modal, MoneyInput, PillTabs, Segmented, TextArea, toast } from '@/components/ui'
import { addPayAdjustment } from '@/api/team'
import { Row } from './common'
import { computeEarnings, PAY_KINDS, type PayKind, type PayPeriod } from '../lib/pay'
import { memberName } from '../lib/members'

/** "Adjustments for <name>" (team.md §6.2). */
export function AdjustmentModal({ memberId, period, initialKind = 'wages', onClose }: { memberId: ID | null; period: PayPeriod; initialKind?: PayKind; onClose: () => void }) {
  if (!memberId) return null
  return <AdjustmentForm key={memberId} memberId={memberId} period={period} initialKind={initialKind} onClose={onClose} />
}

function AdjustmentForm({ memberId, period, initialKind, onClose }: { memberId: ID; period: PayPeriod; initialKind: PayKind; onClose: () => void }) {
  const { t } = useTranslation()
  const data = useDb(useShallow((s) => ({ timesheets: s.timesheets, blockedTimeTypes: s.blockedTimeTypes, sales: s.sales, payments: s.payments, payAdjustments: s.payAdjustments, payRuns: s.payRuns, clients: s.clients, member: s.teamMembers.find((m) => m.id === memberId) })))
  const [kind, setKind] = useState<PayKind>(initialKind)
  const [amount, setAmount] = useState<number | ''>('')
  const [sign, setSign] = useState<'add' | 'deduct'>('add')
  const [note, setNote] = useState('')
  const [noteDraft, setNoteDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const earnings = useMemo(() => (data.member ? computeEarnings(data, data.member, period) : null), [data, period])
  if (!data.member || !earnings) return null
  const delta = round2((sign === 'add' ? 1 : -1) * Number(amount || 0))
  const withDelta = (k: PayKind, base: number) => (k === kind ? round2(base + delta) : base)
  const wages = withDelta('wages', earnings.wages.total)
  const commissions = withDelta('commissions', earnings.commissions.total)
  const tips = withDelta('tips', earnings.tips.total)
  const otherAdj = withDelta('other', earnings.other.adjustment)
  const otherTotal = round2(earnings.other.processing + earnings.other.newClient + otherAdj)
  const earningsTotal = round2(wages + commissions + tips)
  const toPay = round2(Math.max(0, earningsTotal + otherTotal - earnings.paid))
  const adjLine = (k: PayKind) => k === kind && delta !== 0 && <Row label={t('team.pay.adjustment')} value={`${delta > 0 ? '+' : '-'} ${money(Math.abs(delta))}`} className="pl-3 text-small" />

  const apply = async () => {
    if (!amount || Number(amount) <= 0) return
    setBusy(true)
    await addPayAdjustment({ teamMemberId: memberId, periodStart: period.start, kind, amount: delta, note: note.trim() })
    setBusy(false)
    toast(t('team.pay.toastAdjustment'))
    onClose()
  }

  return (
    <>
      <Modal
        open
        size="xl"
        onClose={onClose}
        title={t('team.pay.adjustTitle', { name: memberName(data.member) })}
        footer={
          <>
            <Button onClick={onClose}>{t('team.common.cancel')}</Button>
            <Button variant="primary" loading={busy} disabled={!amount || Number(amount) <= 0} onClick={apply}>
              {t('team.common.apply')}
            </Button>
          </>
        }
      >
        <div className="grid gap-8 pb-2 md:grid-cols-[1fr_340px]">
          <div>
            <PillTabs value={kind} onChange={setKind} items={PAY_KINDS.map((k) => ({ value: k, label: t(`team.pay.kinds.${k}`) }))} />
            <Field className="mt-6" label={t('team.pay.amount')}>
              {(id) => (
                <div className="flex gap-2">
                  <MoneyInput id={id} value={amount} placeholder="0" onChange={setAmount} />
                  <Segmented
                    value={sign}
                    onChange={setSign}
                    className="h-11 shrink-0 items-center"
                    items={[
                      { value: 'add', label: t('team.pay.add') },
                      { value: 'deduct', label: t('team.pay.deduct') },
                    ]}
                  />
                </div>
              )}
            </Field>
            <div className="mt-6 border-t border-line pt-6">
              {note ? (
                <div className="flex items-start justify-between gap-3 rounded-lg bg-sunken p-4">
                  <p className="whitespace-pre-wrap text-body text-ink">{note}</p>
                  <Menu
                    align="right"
                    width={160}
                    groups={[{ items: [{ label: t('team.common.edit'), onSelect: () => setNoteDraft(note) }, { label: t('team.common.remove'), danger: true, onSelect: () => setNote('') }] }]}
                  />
                </div>
              ) : (
                <Button className="rounded-full" icon={<NotebookPen size={16} />} onClick={() => setNoteDraft('')}>
                  {t('team.pay.addNote')}
                </Button>
              )}
            </div>
          </div>
          <div className="border-line md:border-l md:pl-8">
            <p className="text-body-strong text-ink">{t('team.pay.earnings')}</p>
            <Row label={t('team.pay.kinds.wages')} value={money(wages)} />
            {adjLine('wages')}
            <Row label={t('team.pay.kinds.commissions')} value={money(commissions)} />
            {adjLine('commissions')}
            <Row label={t('team.pay.kinds.tips')} value={money(tips)} />
            {adjLine('tips')}
            <p className="mt-4 text-body-strong text-ink">{t('team.pay.kinds.other')}</p>
            <Row label={t('team.pay.processingFees')} value={money(earnings.other.processing)} />
            <Row label={t('team.pay.newClientFees')} value={money(earnings.other.newClient)} />
            <Row label={t('team.pay.otherAdjustments')} value={money(otherAdj)} />
            <div className="mt-3 border-t border-line pt-3">
              <Row label={t('team.pay.earnings')} value={money(earningsTotal)} strong />
              <Row label={t('team.pay.kinds.other')} value={money(otherTotal)} strong />
              <Row label={t('team.pay.paid')} value={money(earnings.paid)} strong />
            </div>
            <div className="mt-3 border-t border-line pt-3">
              <Row label={t('team.pay.toPay')} value={money(toPay)} strong className="text-body-lg" />
            </div>
          </div>
        </div>
      </Modal>
      <Modal
        open={noteDraft !== null}
        onClose={() => setNoteDraft(null)}
        title={t('team.pay.noteTitle')}
        size="sm"
        footer={
          <>
            <Button onClick={() => setNoteDraft(null)}>{t('team.common.cancel')}</Button>
            <Button
              variant="primary"
              onClick={() => {
                setNote((noteDraft ?? '').trim())
                setNoteDraft(null)
              }}
            >
              {t('team.common.save')}
            </Button>
          </>
        }
      >
        <Field label={t('team.pay.note')} counter={{ value: (noteDraft ?? '').length, max: 185 }}>
          {(id) => <TextArea id={id} maxLength={185} value={noteDraft ?? ''} onChange={(e) => setNoteDraft(e.target.value)} />}
        </Field>
      </Modal>
    </>
  )
}

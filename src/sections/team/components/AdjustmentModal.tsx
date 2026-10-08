import { NotebookPen } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ID } from '@/types'
import { useDb } from '@/store/db'
import { money, round2 } from '@/lib/format'
import { Button, Field, Menu, Modal, MoneyInput, PillTabs, Segmented, TextArea, toast } from '@/components/ui'
import { addPayAdjustment } from '@/api/team'
import { Row } from './common'
import { computeEarnings, PAY_KINDS, usePayData, type PayKind, type PayPeriod } from '../lib/pay'
import { memberName } from '../lib/members'

/** "Adjustments for <name>" (team.md §6.2). */
export function AdjustmentModal({ memberId, period, initialKind, onClose }: { memberId: ID | null; period: PayPeriod; initialKind?: PayKind; onClose: () => void }) {
  if (!memberId) return null
  return <AdjustmentForm key={memberId} memberId={memberId} period={period} initialKind={initialKind ?? 'wages'} onClose={onClose} />
}

function AdjustmentForm({ memberId, period, initialKind, onClose }: { memberId: ID; period: PayPeriod; initialKind: PayKind; onClose: () => void }) {
  const { t } = useTranslation()
  const data = usePayData()
  const member = useDb((s) => s.teamMembers.find((m) => m.id === memberId))
  const [kind, setKind] = useState<PayKind>(initialKind)
  const [amount, setAmount] = useState<number | ''>('')
  const [sign, setSign] = useState<'add' | 'deduct'>('add')
  const [note, setNote] = useState('')
  const [noteDraft, setNoteDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const earnings = useMemo(() => (member ? computeEarnings(data, member, period) : null), [data, member, period])
  if (!member || !earnings) return null
  const delta = round2((sign === 'add' ? 1 : -1) * Number(amount || 0))
  // Each type shows its current amount; the new adjustment is its own line under it.
  const withDelta = (k: PayKind, base: number) => (k === kind ? round2(base + delta) : base)
  const wages = earnings.wages.total
  const commissions = earnings.commissions.total
  const tips = earnings.tips.total
  const otherAdj = earnings.other.adjustment
  const otherTotal = withDelta('other', earnings.other.total)
  const earningsTotal = round2(withDelta('wages', wages) + withDelta('commissions', commissions) + withDelta('tips', tips))
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
        title={t('team.pay.adjustTitle', { name: memberName(member) })}
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
                <div className="inline-flex max-w-full items-start justify-between gap-6 rounded-lg border border-line p-4">
                  <div className="min-w-0">
                    <p className="text-body-strong text-ink">{t('team.pay.note')}</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-body text-ink">{note}</p>
                  </div>
                  <Menu
                    label={t('team.payRunNew.noteActions')}
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
            {adjLine('other')}
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

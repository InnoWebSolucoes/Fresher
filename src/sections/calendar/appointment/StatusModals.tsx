import { Info } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Checkbox, Field, Select, toast } from '@/components/ui'
import { appointmentTotal, cancelAppointment, isLateCancellation, markNoShow } from '@/api/appointments'
import { useDb } from '@/store/db'
import { money, round2 } from '@/lib/format'
import type { Appointment } from '@/types'
import { usePaymentsActive } from '../hooks'
import { FullScreen } from '../ui'

function PolicyBanner({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary-subtle px-4 py-4 text-body text-ink">
      <Info size={20} className="shrink-0 text-primary" aria-hidden />
      {text}
    </div>
  )
}

function DetailsCard({ title, total, fee, feeLabel, action }: { title: string; total: number; fee: number; feeLabel: string; action: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-xl border border-line bg-canvas p-8">
      <h2 className="text-title-3 font-semibold text-ink">{title}</h2>
      <div className="mt-4 flex justify-between text-body-lg text-ink">
        <span>{t('calendar.status.appointmentTotal')}</span>
        <span>{money(total)}</span>
      </div>
      <div className="my-4 border-t border-line" />
      {fee > 0 ? (
        <div className="flex justify-between text-body-lg font-semibold text-ink">
          <span>{feeLabel}</span>
          <span>{money(fee)}</span>
        </div>
      ) : (
        <p className="text-body-lg text-muted">{t('calendar.status.noFee')}</p>
      )}
      <div className="mt-8">{action}</div>
    </div>
  )
}

/** "Are you sure you want to mark as no-show?" (calendar.md §11). */
export function NoShowScreen({ appointment, open, onClose, onDone }: { appointment: Appointment; open: boolean; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation()
  const policy = useDb((s) => s.settings.paymentPolicy)
  const payments = usePaymentsActive()
  const [notify, setNotify] = useState(true)
  const [charge, setCharge] = useState(true)
  const [busy, setBusy] = useState(false)
  const total = appointmentTotal(appointment)
  const feeApplies = payments && Boolean(appointment.clientId) && policy.noShowFeePct > 0
  const fee = feeApplies && charge ? round2((total * policy.noShowFeePct) / 100) : 0

  const submit = async () => {
    setBusy(true)
    try {
      await markNoShow(appointment.id, { notify: Boolean(appointment.clientId) && notify, chargeFee: fee > 0 })
      toast(t('calendar.toasts.noShow'))
      onDone()
    } catch (err) {
      toast(err instanceof Error ? err.message : t('calendar.toasts.error'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <FullScreen open={open} onClose={onClose} closeLabel={t('calendar.common.close')}>
      <h1 className="font-display text-[44px] font-bold leading-[52px] text-ink">{t('calendar.status.noShowTitle')}</h1>
      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_440px]">
        <div className="flex flex-col gap-6">
          <PolicyBanner text={feeApplies ? t('calendar.status.noShowPolicy', { pct: policy.noShowFeePct }) : t('calendar.status.noPolicy')} />
          {feeApplies && <Checkbox checked={charge} onChange={setCharge} label={t('calendar.status.chargeNoShow')} hint={t('calendar.status.chargeHint')} />}
          {appointment.clientId && <Checkbox checked={notify} onChange={setNotify} label={t('calendar.status.noShowNotify')} hint={t('calendar.status.noShowNotifyHint')} />}
        </div>
        <DetailsCard
          title={t('calendar.status.noShowDetails')}
          total={total}
          fee={fee}
          feeLabel={t('calendar.status.noShowFee', { pct: policy.noShowFeePct })}
          action={
            <Button variant="danger" size="lg" className="w-full" loading={busy} onClick={submit} data-testid="confirm-no-show">
              {t('calendar.status.setNoShow')}
            </Button>
          }
        />
      </div>
    </FullScreen>
  )
}

/** "Are you sure you want to cancel?" with reason and late-cancellation fee (calendar.md §11). */
export function CancelScreen({ appointment, open, onClose, onDone }: { appointment: Appointment; open: boolean; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation()
  const policy = useDb((s) => s.settings.paymentPolicy)
  const reasons = useDb((s) => s.settings.cancellationReasons)
  const payments = usePaymentsActive()
  const [reasonId, setReasonId] = useState(reasons[0]?.id ?? 'cr_none')
  const [notify, setNotify] = useState(true)
  const [charge, setCharge] = useState(true)
  const [busy, setBusy] = useState(false)
  const total = appointmentTotal(appointment)
  const late = isLateCancellation(appointment)
  const feeApplies = late && payments && Boolean(appointment.clientId) && policy.lateCancelFeePct > 0
  const fee = feeApplies && charge ? round2((total * policy.lateCancelFeePct) / 100) : 0

  const submit = async () => {
    setBusy(true)
    try {
      await cancelAppointment(appointment.id, { reasonId, notify: Boolean(appointment.clientId) && notify, chargeFee: fee > 0 })
      toast(t('calendar.toasts.cancelled'))
      onDone()
    } catch (err) {
      toast(err instanceof Error ? err.message : t('calendar.toasts.error'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <FullScreen open={open} onClose={onClose} closeLabel={t('calendar.common.close')}>
      <h1 className="font-display text-[44px] font-bold leading-[52px] text-ink">{t('calendar.status.cancelTitle')}</h1>
      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_440px]">
        <div className="flex flex-col gap-6">
          <PolicyBanner text={feeApplies ? t('calendar.status.latePolicy', { hours: policy.cancellationWindowHours, pct: policy.lateCancelFeePct }) : t('calendar.status.noPolicy')} />
          <Field label={t('calendar.status.reason')}>
            {(id) => <Select id={id} value={reasonId} onChange={(e) => setReasonId(e.target.value)} options={[...reasons].sort((a, b) => a.order - b.order).map((r) => ({ value: r.id, label: r.name }))} data-testid="cancel-reason" />}
          </Field>
          {feeApplies && <Checkbox checked={charge} onChange={setCharge} label={t('calendar.status.chargeLate')} hint={t('calendar.status.chargeHint')} />}
          {appointment.clientId && <Checkbox checked={notify} onChange={setNotify} label={t('calendar.status.cancelNotify')} hint={t('calendar.status.cancelNotifyHint')} />}
        </div>
        <DetailsCard
          title={t('calendar.status.cancelDetails')}
          total={total}
          fee={fee}
          feeLabel={t('calendar.status.lateFee', { pct: policy.lateCancelFeePct })}
          action={
            <Button variant="danger" size="lg" className="w-full" loading={busy} onClick={submit} data-testid="confirm-cancel">
              {t('calendar.status.cancelAppointment')}
            </Button>
          }
        />
      </div>
    </FullScreen>
  )
}

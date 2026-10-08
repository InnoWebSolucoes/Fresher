import clsx from 'clsx'
import { CreditCard } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDb } from '@/store/db'
import { Button, Field, Modal, MoneyInput, Select, Switch, TextInput, toast } from '@/components/ui'
import { IVA, saveAdvancedOptions, setAutoTopUp, topUpBalance, useMarketingSettings } from '@/api/marketing'
import { money, money2, round2 } from '@/lib/format'

const AMOUNTS = [20, 50, 100, 200]

export function TopUpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const workspace = useDb((s) => s.workspace)
  const settings = useMarketingSettings()
  const [amount, setAmount] = useState<number | 'custom'>(50)
  const [custom, setCustom] = useState<number | ''>('')
  const [busy, setBusy] = useState(false)
  const value = amount === 'custom' ? Number(custom || 0) : amount
  const card = settings.billingCard ?? workspace.plan.card
  const pay = async () => {
    if (!(value >= 5)) {
      toast(t('marketing.balance.minAmount'), 'error')
      return
    }
    setBusy(true)
    try {
      await topUpBalance(value)
      toast(t('marketing.balance.toppedUp', { value: money(value) }))
      onClose()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('marketing.balance.topUpTitle')}
      subtitle={t('marketing.balance.topUpHint')}
      footer={
        <>
          <Button onClick={onClose}>{t('marketing.common.cancel')}</Button>
          <Button variant="primary" loading={busy} onClick={() => void pay()} data-testid="topup-pay">
            {t('marketing.balance.pay', { value: money2(round2(value * (1 + IVA))) })}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[...AMOUNTS, 'custom' as const].map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={amount === a}
              onClick={() => setAmount(a)}
              className={clsx('h-12 rounded-md border text-body-strong transition-colors', amount === a ? 'border-primary bg-primary-subtle text-primary ring-1 ring-primary' : 'border-line-strong text-ink hover:bg-sunken')}
            >
              {a === 'custom' ? t('marketing.balance.custom') : money(a)}
            </button>
          ))}
        </div>
        {amount === 'custom' && (
          <Field label={t('marketing.balance.customAmount')}>
            {(id) => <MoneyInput id={id} value={custom} onChange={setCustom} />}
          </Field>
        )}
        <dl className="grid grid-cols-2 gap-2 rounded-lg bg-sunken p-4 text-body">
          <dt className="text-muted">{t('marketing.balance.credit')}</dt>
          <dd className="text-right text-ink">{money2(value)}</dd>
          <dt className="text-muted">{t('marketing.balance.iva')}</dt>
          <dd className="text-right text-ink">{money2(round2(value * IVA))}</dd>
          <dt className="font-semibold text-ink">{t('marketing.balance.total')}</dt>
          <dd className="text-right font-semibold text-ink">{money2(round2(value * (1 + IVA)))}</dd>
        </dl>
        {card && (
          <p className="flex items-center gap-2 text-body text-muted">
            <CreditCard size={16} aria-hidden />
            {t('marketing.balance.cardOnFile', { brand: card.brand, last4: card.last4 })}
          </p>
        )}
      </div>
    </Modal>
  )
}

export function AutoTopUpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const settings = useMarketingSettings()
  const [enabled, setEnabled] = useState(true)
  const [threshold, setThreshold] = useState(String(settings.autoTopUp.threshold))
  const [amount, setAmount] = useState(String(settings.autoTopUp.amount))
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      await setAutoTopUp(enabled, { threshold: Number(threshold), amount: Number(amount) })
      toast(enabled ? t('marketing.balance.autoOn') : t('marketing.balance.autoOff'))
      onClose()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('marketing.balance.autoTitle')}
      subtitle={t('marketing.balance.autoHint')}
      footer={
        <>
          <Button onClick={onClose}>{t('marketing.common.cancel')}</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()} data-testid="autotopup-save">
            {t('marketing.common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Switch checked={enabled} onChange={setEnabled} label={t('marketing.balance.autoToggle')} hint={t('marketing.balance.autoToggleHint')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('marketing.balance.threshold')}>
            {(id) => <Select id={id} disabled={!enabled} value={threshold} onChange={(e) => setThreshold(e.target.value)} options={[5, 10, 20, 50].map((v) => ({ value: String(v), label: money(v) }))} />}
          </Field>
          <Field label={t('marketing.balance.amount')}>
            {(id) => <Select id={id} disabled={!enabled} value={amount} onChange={(e) => setAmount(e.target.value)} options={[20, 50, 100, 200].map((v) => ({ value: String(v), label: money(v) }))} />}
          </Field>
        </div>
      </div>
    </Modal>
  )
}

export function AdvancedOptionsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const settings = useMarketingSettings()
  const [form, setForm] = useState(settings.advanced)
  const [busy, setBusy] = useState(false)
  const hours = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`)
  const save = async () => {
    setBusy(true)
    try {
      await saveAdvancedOptions({ ...form, senderName: form.senderName.trim().slice(0, 11) })
      toast(t('marketing.balance.advancedSaved'))
      onClose()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('marketing.balance.advancedTitle')}
      footer={
        <>
          <Button onClick={onClose}>{t('marketing.common.cancel')}</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            {t('marketing.common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label={t('marketing.balance.sender')} hint={t('marketing.balance.senderHint')} counter={{ value: form.senderName.length, max: 11 }}>
          {(id) => <TextInput id={id} value={form.senderName} maxLength={11} onChange={(e) => setForm({ ...form, senderName: e.target.value.replace(/[^A-Za-z0-9 ]/g, '') })} />}
        </Field>
        <Switch checked={form.quietHours} onChange={(quietHours) => setForm({ ...form, quietHours })} label={t('marketing.balance.quiet')} hint={t('marketing.balance.quietHint')} />
        {form.quietHours && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('marketing.balance.quietFrom')}>{(id) => <Select id={id} value={form.quietFrom} onChange={(e) => setForm({ ...form, quietFrom: e.target.value })} options={hours} />}</Field>
            <Field label={t('marketing.balance.quietTo')}>{(id) => <Select id={id} value={form.quietTo} onChange={(e) => setForm({ ...form, quietTo: e.target.value })} options={hours} />}</Field>
          </div>
        )}
      </div>
    </Modal>
  )
}

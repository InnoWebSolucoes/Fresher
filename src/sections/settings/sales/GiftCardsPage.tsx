import { Gift } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, EmptyState, Field, MoneyInput, Select } from '@/components/ui'
import { updateSettings } from '@/api/settings'
import { money } from '@/lib/format'
import type { Settings } from '@/types'
import { Banner, EditCard, InfoGrid, PillMenu, PromoCard, SettingsPage } from '../components/ui'
import { FullModal } from '../components/FullModal'
import { useAction } from '../components/useAction'
import { useSettings } from '../hooks'
import { FormCard, SwitchRow, ToggleCard, ValueRowsEditor, newValueRow, usePaymentsActive, valueRows, type ValueDraft } from './shared'

type GiftCards = Settings['giftCards']

/** Expiration values stored in settings.giftCards.expiry (data, shown translated). */
export const EXPIRY_OPTIONS = ['14 days', ...Array.from({ length: 11 }, (_, i) => `${i + 1} month${i ? 's' : ''}`), ...Array.from({ length: 5 }, (_, i) => `${i + 1} year${i ? 's' : ''}`), 'Never']
const MAX_VALUES = 8

/** Translated label of an expiry value ("14 days", "3 months", "1 year", "Never"). */
export function useExpiryLabel() {
  const { t } = useTranslation()
  return (value: string) => {
    if (value === 'Never') return t('settings.sale.gift.never')
    const [n, unit] = value.split(' ')
    const count = Number(n)
    if (unit?.startsWith('day')) return t('settings.sale.gift.days', { count })
    if (unit?.startsWith('month')) return t('settings.sale.gift.months', { count })
    if (unit?.startsWith('year')) return t('settings.sale.gift.years', { count })
    return value
  }
}

/** Settings › Sales › Gift cards (settings-sales.md §7). */
export function GiftCardsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const gift = useSettings().giftCards
  const payments = usePaymentsActive()
  const expiryLabel = useExpiryLabel()
  const [open, setOpen] = useState(false)
  const [busy, run] = useAction()
  const online = payments && gift.online

  const sellOnline = () =>
    void run(
      () =>
        updateSettings((s) => {
          s.giftCards.online = true
        }),
      t('settings.sale.gift.saved'),
    )

  return (
    <SettingsPage
      title={t('settings.sale.gift.title')}
      description={t('settings.sale.gift.description')}
      learnMore={t('settings.sale.gift.title')}
      actions={<PillMenu label={t('settings.common.options')} width={220} groups={[{ items: [{ label: t('settings.sale.gift.sold'), onSelect: () => navigate('/sales/gift-cards') }] }]} />}
    >
      {!payments ? (
        <PromoCard
          art="phone"
          title={t('settings.sale.gift.paymentsPromoTitle')}
          body={t('settings.sale.gift.paymentsPromoBody')}
          action={
            <Button variant="accent" onClick={() => navigate('/setup/payments/payment-policy')}>
              {t('settings.sale.gift.paymentsPromoAction')}
            </Button>
          }
        />
      ) : gift.enabled && !gift.online ? (
        <PromoCard
          art="phone"
          title={t('settings.sale.gift.onlinePromoTitle')}
          body={t('settings.sale.gift.onlinePromoBody')}
          action={
            <Button variant="accent" loading={busy} onClick={sellOnline} data-testid="gift-sell-online">
              {t('settings.sale.gift.onlinePromoAction')}
            </Button>
          }
        />
      ) : gift.enabled ? (
        <Banner tone="success" title={t('settings.sale.gift.onlineActiveTitle')}>
          {t('settings.sale.gift.onlineActiveBody')}
        </Banner>
      ) : null}

      {gift.enabled ? (
        <EditCard title={t('settings.sale.gift.availabilityTitle')} description={t('settings.sale.gift.availabilityDescription')} onEdit={() => setOpen(true)} testId="gift-availability-card">
          <InfoGrid
            rows={[
              { key: 'sale', label: t('settings.sale.gift.availableForSale'), value: online ? t('settings.sale.gift.inStoreOnline') : t('settings.sale.gift.inStoreOnly') },
              { key: 'expiry', label: t('settings.sale.gift.expiryLabel'), value: expiryLabel(gift.expiry) },
              { key: 'values', label: t('settings.sale.gift.values'), value: gift.values.map((v) => money(v)).join(', ') },
              { key: 'custom', label: t('settings.sale.gift.customAmounts'), value: t('settings.sale.gift.customRange', { min: money(gift.customMin), max: money(gift.customMax) }) },
            ]}
          />
        </EditCard>
      ) : (
        <div className="card">
          <EmptyState
            icon={<Gift size={26} aria-hidden />}
            title={t('settings.sale.gift.inactiveTitle')}
            body={t('settings.sale.gift.inactiveBody')}
            action={
              <Button variant="primary" onClick={() => setOpen(true)} data-testid="gift-set-up">
                {t('settings.sale.gift.setUp')}
              </Button>
            }
            className="py-20"
          />
        </div>
      )}
      <GiftCardSettingsModal open={open} onClose={() => setOpen(false)} value={gift} payments={payments} />
    </SettingsPage>
  )
}

/** "Gift card settings" full-screen form. */
function GiftCardSettingsModal({ open, onClose, value, payments }: { open: boolean; onClose: () => void; value: GiftCards; payments: boolean }) {
  const { t } = useTranslation()
  const expiryLabel = useExpiryLabel()
  const [enabled, setEnabled] = useState(value.enabled)
  const [rows, setRows] = useState<ValueDraft[]>([])
  const [min, setMin] = useState<number | ''>(value.customMin)
  const [max, setMax] = useState<number | ''>(value.customMax)
  const [online, setOnline] = useState(value.online)
  const [expiry, setExpiry] = useState(value.expiry)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [wasOpen, setWasOpen] = useState(false)
  const [saving, run] = useAction()
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setEnabled(value.enabled)
      setRows(value.values.length ? valueRows(value.values) : [newValueRow()])
      setMin(value.customMin)
      setMax(value.customMax)
      setOnline(value.online)
      setExpiry(value.expiry)
      setErrors({})
    }
  }

  const save = () => {
    const errs: Record<string, string> = {}
    const seen = new Set<number>()
    rows.forEach((r) => {
      const n = Number(r.value)
      if (r.value.trim() === '' || Number.isNaN(n) || n <= 0) errs[r.key] = t('settings.sale.gift.valueRequired')
      else if (n > 10000) errs[r.key] = t('settings.sale.gift.valueMax')
      else if (seen.has(n)) errs[r.key] = t('settings.sale.gift.valueDuplicate')
      else seen.add(n)
    })
    if (min === '' || min <= 0) errs.min = t('settings.sale.gift.minRequired')
    if (max === '' || max <= 0) errs.max = t('settings.sale.gift.maxRequired')
    else if (min !== '' && max <= min) errs.max = t('settings.sale.gift.maxAboveMin')
    setErrors(errs)
    if (Object.keys(errs).length) return
    const next: GiftCards = {
      enabled,
      values: rows.map((r) => Math.round(Number(r.value) * 100) / 100).sort((a, b) => a - b),
      expiry,
      online: payments ? online : false,
      customMin: Number(min),
      customMax: Number(max),
    }
    void run(
      () =>
        updateSettings((s) => {
          s.giftCards = next
        }),
      t('settings.sale.gift.saved'),
      onClose,
    )
  }

  return (
    <FullModal open={open} onClose={onClose} title={t('settings.sale.gift.settingsTitle')} onSave={save} saving={saving} testId="gift-card-settings-modal">
      <div className="flex flex-col gap-8">
        <ToggleCard title={t('settings.sale.gift.cardTitle')} description={t('settings.sale.gift.cardDescription')} checked={enabled} onChange={setEnabled} testId="gift-enabled" />

        <FormCard title={t('settings.sale.gift.valuesTitle')} description={t('settings.sale.gift.valuesDescription')}>
          <ValueRowsEditor
            rows={rows}
            onChange={(next) => {
              setRows(next)
              setErrors((e) => ({ min: e.min ?? '', max: e.max ?? '' }))
            }}
            prefix="€"
            step="0.01"
            label={t('settings.sale.gift.valueLabel')}
            addLabel={t('settings.sale.gift.addValue')}
            deleteLabel={t('settings.sale.gift.deleteValue')}
            errors={errors}
            max={MAX_VALUES}
            min={1}
            testId="gift-values"
          />
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            <Field label={t('settings.sale.gift.minCustom')} error={errors.min}>
              {(id) => (
                <MoneyInput
                  id={id}
                  value={min}
                  onChange={(v) => {
                    setMin(v)
                    setErrors((e) => ({ ...e, min: '' }))
                  }}
                />
              )}
            </Field>
            <Field label={t('settings.sale.gift.maxCustom')} error={errors.max}>
              {(id) => (
                <MoneyInput
                  id={id}
                  value={max}
                  onChange={(v) => {
                    setMax(v)
                    setErrors((e) => ({ ...e, max: '' }))
                  }}
                />
              )}
            </Field>
          </div>
          <p className="mt-3 text-small text-muted">{t('settings.sale.gift.customHelp')}</p>
        </FormCard>

        <FormCard title={t('settings.sale.gift.onlineTitle')} description={payments ? t('settings.sale.gift.onlineDescription') : t('settings.sale.gift.onlineNeedsPayments')}>
          <SwitchRow label={t('settings.sale.gift.sellOnline')} hint={t('settings.sale.gift.sellOnlineHint')} checked={payments && online} disabled={!payments} onChange={setOnline} testId="gift-online" />
        </FormCard>

        <FormCard title={t('settings.sale.gift.expirationTitle')} description={t('settings.sale.gift.expirationDescription')}>
          <Field label={t('settings.sale.gift.expiryLabel')} hint={expiry === 'Never' ? t('settings.sale.gift.neverHint') : t('settings.sale.gift.expiryHint')}>
            {(id) => <Select id={id} value={expiry} options={EXPIRY_OPTIONS.map((v) => ({ value: v, label: expiryLabel(v) }))} onChange={(e) => setExpiry(e.target.value)} />}
          </Field>
        </FormCard>
      </div>
    </FullModal>
  )
}

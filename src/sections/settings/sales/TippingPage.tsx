import clsx from 'clsx'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Checkbox, Field, LearnMore, Select } from '@/components/ui'
import { updateSettings, updateSettingsExtra, useSettingsExtra } from '@/api/settings'
import { num } from '@/lib/format'
import type { Settings } from '@/types'
import { Banner, CardButton, FormCard, PromoCard, Rule, SettingsPage } from '../components/ui'
import { FullModal } from '../components/FullModal'
import { useAction, usePending } from '../components/useAction'
import { useSettings } from '../hooks'
import { SwitchRow, ValueRowsEditor, newValueRow, usePaymentsActive, valueRows, type ValueDraft } from './shared'

type Tipping = Settings['tipping']
type Include = Tipping['include']

/** Extras key 'sales.tippingAdvanced'. */
export interface TippingAdvanced {
  customAmounts: boolean
  roundUp: boolean
  noTipButton: boolean
}
export const TIPPING_ADVANCED_KEY = 'sales.tippingAdvanced'
const ADVANCED_DEFAULTS: TippingAdvanced = { customAmounts: true, roundUp: false, noTipButton: true }

const CART_ITEMS = ['services', 'addons', 'products', 'memberships', 'packages', 'giftCards'] as const
const BASE_ITEMS = ['serviceCharges', 'discounts', 'taxes'] as const
const MAX_VALUES = 6

/** "N items included" summary for the tip calculation row. */
export function includedCount(include: Include): number {
  return [...CART_ITEMS, ...BASE_ITEMS].filter((k) => include[k]).length
}

/** Settings › Sales › Tipping (settings-sales.md §5). */
export function TippingPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const tipping = useSettings().tipping
  const payments = usePaymentsActive()
  const advanced = useSettingsExtra<TippingAdvanced>(TIPPING_ADVANCED_KEY, ADVANCED_DEFAULTS)
  const [valuesOpen, setValuesOpen] = useState(false)
  const [calcOpen, setCalcOpen] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [, run] = useAction()
  const [shown, pending] = usePending<string>()

  const toggle = (key: 'pos' | 'terminal' | 'online', value: boolean) =>
    void pending(key, value, () =>
      run(
        () =>
          updateSettings((s) => {
            s.tipping[key] = value
          }),
        t('settings.sale.tipping.saved'),
      ),
    )
  const toggleAdvanced = (key: keyof TippingAdvanced, value: boolean) =>
    void pending(key, value, () => run(() => updateSettingsExtra<TippingAdvanced>(TIPPING_ADVANCED_KEY, ADVANCED_DEFAULTS, (cur) => ({ ...cur, [key]: value })), t('settings.sale.tipping.saved')))

  const count = includedCount(tipping.include)
  const total = CART_ITEMS.length + BASE_ITEMS.length

  return (
    <SettingsPage title={t('settings.sale.tipping.title')} description={t('settings.sale.tipping.description')} learnMore={t('settings.sale.tipping.title')}>
      {payments ? (
        <Banner tone="success" title={t('settings.sale.tipping.paymentsActive')}>
          {t('settings.sale.tipping.paymentsActiveBody')}
        </Banner>
      ) : (
        <PromoCard
          art="terminal"
          title={t('settings.sale.tipping.promoTitle')}
          body={t('settings.sale.tipping.promoBody')}
          action={
            <Button variant="accent" onClick={() => navigate('/setup/payments/payment-policy')}>
              {t('settings.sale.tipping.promoAction')}
            </Button>
          }
        />
      )}

      <section className="card p-6 sm:p-8" data-testid="tipping-options">
        <h2 className="font-display text-title-2 text-ink">{t('settings.sale.tipping.optionsTitle')}</h2>
        <div className="mt-3 divide-y divide-line">
          <SwitchRow label={t('settings.sale.tipping.pos')} hint={<LearnMore topic={t('settings.sale.tipping.pos')}>{t('common.learnMore')}</LearnMore>} checked={shown('pos', tipping.pos)} onChange={(v) => toggle('pos', v)} testId="tip-pos" />
          <SwitchRow label={t('settings.sale.tipping.terminal')} hint={<LearnMore topic={t('settings.sale.tipping.terminal')}>{t('common.learnMore')}</LearnMore>} checked={payments && shown('terminal', tipping.terminal)} disabled={!payments} onChange={(v) => toggle('terminal', v)} testId="tip-terminal" />
          <SwitchRow label={t('settings.sale.tipping.online')} hint={t('settings.sale.tipping.onlineHint')} checked={payments && shown('online', tipping.online)} disabled={!payments} onChange={(v) => toggle('online', v)} testId="tip-online" />
        </div>
        <Rule className="my-5" />
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-body-strong text-ink">{t('settings.sale.tipping.defaultValues')}</p>
              <p className="text-small text-muted" data-testid="tip-values-summary">
                {tipping.values.map((v) => `${num(v)}%`).join(' • ')}
              </p>
            </div>
            <CardButton onClick={() => setValuesOpen(true)} testId="edit-tip-values">
              {t('settings.common.edit')}
            </CardButton>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-body-strong text-ink">{t('settings.sale.tipping.calculation')}</p>
              <p className="text-small text-muted" data-testid="tip-calc-summary">
                {count === total ? t('settings.sale.tipping.allIncluded') : t('settings.sale.tipping.someIncluded', { count })}
              </p>
            </div>
            <CardButton onClick={() => setCalcOpen(true)} testId="edit-tip-calc">
              {t('settings.common.edit')}
            </CardButton>
          </div>
        </div>
        <Rule className="my-5" />
        <button type="button" className="inline-flex items-center gap-1.5 text-body-strong text-primary hover:underline" aria-expanded={showAdvanced} onClick={() => setShowAdvanced((v) => !v)} data-testid="tip-advanced">
          {t('settings.sale.tipping.advanced')}
          <ChevronDown size={16} aria-hidden className={clsx('transition-transform', showAdvanced && 'rotate-180')} />
        </button>
        {showAdvanced && (
          <div className="mt-2 divide-y divide-line">
            <SwitchRow label={t('settings.sale.tipping.customAmounts')} hint={t('settings.sale.tipping.customAmountsHint')} checked={shown('customAmounts', advanced.customAmounts)} onChange={(v) => toggleAdvanced('customAmounts', v)} />
            <SwitchRow label={t('settings.sale.tipping.noTipButton')} hint={t('settings.sale.tipping.noTipButtonHint')} checked={shown('noTipButton', advanced.noTipButton)} onChange={(v) => toggleAdvanced('noTipButton', v)} />
            <SwitchRow label={t('settings.sale.tipping.roundUp')} hint={t('settings.sale.tipping.roundUpHint')} checked={shown('roundUp', advanced.roundUp)} onChange={(v) => toggleAdvanced('roundUp', v)} />
          </div>
        )}
      </section>

      <TipValuesModal open={valuesOpen} onClose={() => setValuesOpen(false)} values={tipping.values} />
      <TipCalculationModal open={calcOpen} onClose={() => setCalcOpen(false)} include={tipping.include} />
    </SettingsPage>
  )
}

/** "Default tip values": up to six percentages between 1 and 100. */
function TipValuesModal({ open, onClose, values }: { open: boolean; onClose: () => void; values: number[] }) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<ValueDraft[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [wasOpen, setWasOpen] = useState(false)
  const [saving, run] = useAction()
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setRows(values.length ? valueRows(values) : [newValueRow()])
      setErrors({})
    }
  }
  const save = () => {
    const errs: Record<string, string> = {}
    const seen = new Set<number>()
    rows.forEach((r) => {
      const n = Number(r.value)
      if (r.value.trim() === '' || Number.isNaN(n) || n < 1 || n > 100) errs[r.key] = t('settings.sale.tipping.valueRange')
      else if (seen.has(n)) errs[r.key] = t('settings.sale.tipping.valueDuplicate')
      else seen.add(n)
    })
    setErrors(errs)
    if (Object.keys(errs).length || rows.length === 0) return
    const next = rows.map((r) => Math.round(Number(r.value) * 100) / 100).sort((a, b) => a - b)
    void run(
      () =>
        updateSettings((s) => {
          s.tipping.values = next
        }),
      t('settings.sale.tipping.valuesSaved'),
      onClose,
    )
  }
  return (
    <FullModal open={open} onClose={onClose} title={t('settings.sale.tipping.valuesTitle')} subtitle={t('settings.sale.tipping.valuesSubtitle')} onSave={save} saving={saving} testId="tip-values-modal">
      <FormCard>
        <ValueRowsEditor
          rows={rows}
          onChange={(next) => {
            setRows(next)
            setErrors({})
          }}
          suffix="%"
          label={t('settings.sale.tipping.tipValue')}
          addLabel={t('settings.sale.tipping.addValue')}
          deleteLabel={t('settings.common.delete')}
          errors={errors}
          max={MAX_VALUES}
          min={1}
          testId="tip-values"
        />
        <p className="mt-4 text-small text-muted">{t('settings.sale.tipping.valuesHelp', { max: MAX_VALUES })}</p>
      </FormCard>
    </FullModal>
  )
}

/** "Tip calculation": which items make up the base amount. */
function TipCalculationModal({ open, onClose, include }: { open: boolean; onClose: () => void; include: Include }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<Include>(include)
  const [wasOpen, setWasOpen] = useState(false)
  const [error, setError] = useState('')
  const [saving, run] = useAction()
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setDraft(include)
      setError('')
    }
  }
  const save = () => {
    if (!CART_ITEMS.some((k) => draft[k])) {
      setError(t('settings.sale.tipping.cartRequired'))
      return
    }
    void run(
      () =>
        updateSettings((s) => {
          s.tipping.include = { ...draft }
        }),
      t('settings.sale.tipping.calcSaved'),
      onClose,
    )
  }
  const options = [
    { value: 'included', label: t('settings.sale.tipping.included') },
    { value: 'excluded', label: t('settings.sale.tipping.excluded') },
  ]
  return (
    <FullModal open={open} onClose={onClose} title={t('settings.sale.tipping.calcTitle')} subtitle={t('settings.sale.tipping.calcSubtitle')} onSave={save} saving={saving} testId="tip-calc-modal">
      <FormCard>
        <p className="text-body-strong text-ink">{t('settings.sale.tipping.cartItems')}</p>
        <p className="text-small text-muted">{t('settings.sale.tipping.cartItemsHint')}</p>
        <div className="mt-4 flex flex-col gap-4">
          {CART_ITEMS.map((key) => (
            <Checkbox
              key={key}
              label={t(`settings.sale.tipping.items.${key}`)}
              checked={draft[key]}
              onChange={(v) => {
                setError('')
                setDraft((d) => ({ ...d, [key]: v }))
              }}
            />
          ))}
        </div>
        {error && <p className="mt-3 text-small text-danger">{error}</p>}
        <div className="mt-8 flex flex-col gap-6">
          {BASE_ITEMS.map((key) => (
            <Field key={key} label={t(`settings.sale.tipping.items.${key}`)} hint={t(draft[key] ? `settings.sale.tipping.includedHint.${key}` : `settings.sale.tipping.excludedHint.${key}`)}>
              {(id) => <Select id={id} value={draft[key] ? 'included' : 'excluded'} options={options} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value === 'included' }))} />}
            </Field>
          ))}
        </div>
      </FormCard>
    </FullModal>
  )
}

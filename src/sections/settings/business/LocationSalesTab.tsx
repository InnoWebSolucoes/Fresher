import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Checkbox, Field, RadioGroup, Select, Switch, TextArea, TextInput } from '@/components/ui'
import { updateLocation } from '@/api/settings'
import type { ID, Location, Settings } from '@/types'
import { Banner, EditCard, FormCard, FormStack, InfoGrid, ModalForm } from '../components/ui'
import { FullModal } from '../components/FullModal'
import { useAction } from '../components/useAction'
import { useSettings, useWorkspace } from '../hooks'
import { formatAddress } from './shared'
import { saveLocationExtras, useLocationExtras, type LocationExtras } from './locationExtras'

type Tipping = NonNullable<LocationExtras['tipping']>
type TaxDefaults = NonNullable<LocationExtras['taxDefaults']>
type Receipt = NonNullable<LocationExtras['receipt']>
const CART_KEYS = ['services', 'addons', 'products', 'memberships', 'packages', 'giftCards'] as const
const BASE_KEYS = ['serviceCharges', 'discounts', 'taxes'] as const

/** Effective tipping for a location (custom or the workspace defaults). */
export function effectiveTipping(settings: Settings, extras: LocationExtras): Tipping {
  if (extras.tipping?.mode === 'custom') return extras.tipping
  const w = settings.tipping
  return { mode: 'workspace', pos: w.pos, terminal: w.terminal, online: w.online, values: w.values, include: w.include }
}

export function effectiveTaxDefaults(settings: Settings, extras: LocationExtras): TaxDefaults {
  if (extras.taxDefaults?.mode === 'custom') return extras.taxDefaults
  return { mode: 'workspace', ...settings.taxDefaults }
}

/** Sales tab of a location: receipt sequencing, tax defaults, tipping and receipt details. */
export function LocationSalesTab({ location }: { location: Location }) {
  const { t } = useTranslation()
  const settings = useSettings()
  const workspace = useWorkspace()
  const extras = useLocationExtras(location.id)
  const [modal, setModal] = useState<'sequence' | 'tax' | 'tipping' | 'receipt' | null>(null)
  const tipping = effectiveTipping(settings, extras)
  const tax = effectiveTaxDefaults(settings, extras)
  const rateLabel = (id: ID | null) => {
    const rate = settings.taxRates.find((r) => r.id === id)
    return rate ? `${rate.name} (${rate.rate}%)` : t('settings.biz.sales.noTax')
  }
  const tipOptions = [tipping.pos, tipping.terminal, tipping.online]
  const tipOptionsLabel = tipOptions.every(Boolean)
    ? t('settings.biz.sales.allOptions')
    : tipOptions.some(Boolean)
      ? [tipping.pos && t('settings.biz.sales.optPos'), tipping.terminal && t('settings.biz.sales.optTerminal'), tipping.online && t('settings.biz.sales.optOnline')].filter(Boolean).join(', ')
      : t('settings.biz.sales.tippingOff')
  const included = CART_KEYS.filter((k) => tipping.include[k]).length
  const receipt = receiptDetails(location, extras, workspace.plan.billingDetails)

  return (
    <>
      <EditCard title={t('settings.biz.sales.sequencing')} onEdit={() => setModal('sequence')} testId="receipt-sequencing-card">
        <InfoGrid
          cols={1}
          rows={[
            { label: t('settings.biz.sales.prefix'), value: location.receiptPrefix || '-' },
            { label: t('settings.biz.sales.nextNumber'), value: String(location.nextReceiptNumber) },
          ]}
        />
      </EditCard>

      <EditCard title={t('settings.biz.sales.taxDefaults')} description={t('settings.biz.sales.taxDefaultsHint')} onEdit={() => setModal('tax')} banner={tax.mode === 'workspace' ? t('settings.biz.sales.usingDefaults') : undefined} testId="tax-defaults-card">
        <InfoGrid
          cols={1}
          rows={[
            { label: t('settings.biz.sales.services'), value: rateLabel(tax.services) },
            { label: t('settings.biz.sales.products'), value: rateLabel(tax.products) },
            { label: t('settings.biz.sales.memberships'), value: rateLabel(tax.memberships) },
          ]}
        />
      </EditCard>

      <EditCard title={t('settings.biz.sales.tipping')} description={t('settings.biz.sales.tippingHint')} learnMore="Tipping" onEdit={() => setModal('tipping')} banner={tipping.mode === 'workspace' ? t('settings.biz.sales.usingDefaults') : undefined} testId="tipping-card">
        <InfoGrid
          cols={1}
          rows={[
            { label: t('settings.biz.sales.tippingOptions'), value: tipOptionsLabel },
            { label: t('settings.biz.sales.defaultValues'), value: tipping.values.map((v) => `${v}%`).join(' • ') },
            { label: t('settings.biz.sales.tipCalculation'), value: included === CART_KEYS.length ? t('settings.biz.sales.allItems') : t('settings.biz.sales.someItems', { count: included, total: CART_KEYS.length }) },
          ]}
        />
      </EditCard>

      <EditCard title={t('settings.biz.sales.receiptDetails')} description={t('settings.biz.sales.receiptDetailsHint')} onEdit={() => setModal('receipt')} testId="receipt-details-card">
        <InfoGrid
          rows={[
            { label: t('settings.biz.sales.companyName'), value: receipt.companyName },
            { label: t('settings.biz.sales.address'), value: receipt.address },
            { label: t('settings.biz.sales.receiptNote'), value: receipt.note || '-' },
          ]}
        />
      </EditCard>

      <SequencingModal location={location} open={modal === 'sequence'} onClose={() => setModal(null)} />
      <TaxDefaultsModal location={location} current={tax} open={modal === 'tax'} onClose={() => setModal(null)} />
      <TippingModal location={location} current={tipping} open={modal === 'tipping'} onClose={() => setModal(null)} />
      <ReceiptDetailsModal location={location} current={extras.receipt} open={modal === 'receipt'} onClose={() => setModal(null)} />
    </>
  )
}

export function receiptDetails(location: Location, extras: LocationExtras, billing?: { businessName: string; address: string }): { companyName: string; address: string; note: string } {
  const r = extras.receipt
  if (r?.source === 'custom') return { companyName: r.companyName, address: r.address, note: r.note }
  if (r?.source === 'billing' && billing) return { companyName: billing.businessName, address: billing.address, note: r.note }
  return { companyName: location.name, address: extras.noAddress ? '' : formatAddress(location.address), note: r?.note ?? '' }
}

// ─── Receipt sequencing ────────────────────────────────────────────────────

function SequencingModal({ location, open, onClose }: { location: Location; open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const [prefix, setPrefix] = useState(location.receiptPrefix)
  const [next, setNext] = useState(String(location.nextReceiptNumber))
  const [lastOpen, setLastOpen] = useState(open)
  const [saving, run] = useAction()
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setPrefix(location.receiptPrefix)
      setNext(String(location.nextReceiptNumber))
    }
  }
  const prefixError = prefix && !/^[A-Za-z0-9-]{1,10}$/.test(prefix) ? t('settings.biz.sales.prefixInvalid') : undefined
  const nextError = !/^\d+$/.test(next) || Number(next) < 1 ? t('settings.biz.sales.nextInvalid') : undefined
  const save = () => {
    if (prefixError || nextError) return
    void run(
      () =>
        updateLocation(location.id, (l) => {
          l.receiptPrefix = prefix.trim()
          l.nextReceiptNumber = Number(next)
        }),
      t('settings.biz.sales.sequencingSaved'),
      onClose,
    )
  }
  return (
    <FullModal
      open={open}
      onClose={onClose}
      title={t('settings.biz.sales.editSequencing')}
      subtitle={t('settings.biz.sales.editSequencingHint', { name: location.name })}
      onSave={save}
      saving={saving}
      saveDisabled={Boolean(prefixError || nextError)}
      testId="location-sequencing-modal"
    >
      <FormCard>
        <ModalForm onSubmit={save} className="sm:grid sm:grid-cols-2 sm:gap-4">
          <Field label={t('settings.biz.sales.prefix')} error={prefixError} counter={{ value: prefix.length, max: 10 }}>
            {(id) => <TextInput id={id} maxLength={10} value={prefix} invalid={Boolean(prefixError)} onChange={(e) => setPrefix(e.target.value.toUpperCase())} data-testid="location-prefix" />}
          </Field>
          <Field label={t('settings.biz.sales.nextNumber')} error={nextError}>
            {(id) => <TextInput id={id} inputMode="numeric" value={next} invalid={Boolean(nextError)} onChange={(e) => setNext(e.target.value.replace(/[^\d]/g, ''))} data-testid="location-next-number" />}
          </Field>
        </ModalForm>
      </FormCard>
    </FullModal>
  )
}

// ─── Tax defaults ──────────────────────────────────────────────────────────

function TaxDefaultsModal({ location, current, open, onClose }: { location: Location; current: TaxDefaults; open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const settings = useSettings()
  const [draft, setDraft] = useState<TaxDefaults>(current)
  const [lastOpen, setLastOpen] = useState(open)
  const [saving, run] = useAction()
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) setDraft(current)
  }
  const noRates = settings.taxRates.length === 0
  const shown = draft.mode === 'workspace' ? { ...draft, ...settings.taxDefaults } : draft
  const options = [{ value: '', label: t('settings.biz.sales.noTax') }, ...settings.taxRates.map((r) => ({ value: r.id, label: `${r.name} (${r.rate}%)` }))]
  const save = () => void run(() => saveLocationExtras(location.id, { taxDefaults: draft }), t('settings.biz.sales.taxSaved'), onClose)
  return (
    <FullModal open={open} onClose={onClose} title={t('settings.biz.sales.editTaxDefaults')} subtitle={t('settings.biz.sales.taxDefaultsHint')} onSave={save} saving={saving} saveDisabled={noRates} testId="location-tax-modal">
      <FormCard>
        {noRates ? (
          <Banner
            tone="warning"
            action={
              <Button size="sm" onClick={() => navigate('/setup/sales/tax-rates')}>
                {t('settings.biz.sales.addTaxRates')}
              </Button>
            }
          >
            {t('settings.biz.sales.noRatesWarning')}
          </Banner>
        ) : (
          <Field label={t('settings.biz.sales.taxSettings')}>
            {(id) => (
              <Select
                id={id}
                value={draft.mode}
                onChange={(e) => setDraft({ ...draft, mode: e.target.value as TaxDefaults['mode'] })}
                options={[
                  { value: 'workspace', label: t('settings.biz.sales.workspaceDefaults') },
                  { value: 'custom', label: t('settings.biz.sales.customForLocation') },
                ]}
              />
            )}
          </Field>
        )}
        {(['services', 'products', 'memberships'] as const).map((key) => (
          <Field key={key} label={t(`settings.biz.sales.${key}`)} hint={t(`settings.biz.sales.override.${key}`)}>
            {(id) => <Select id={id} disabled={noRates || draft.mode === 'workspace'} value={shown[key] ?? ''} options={options} onChange={(e) => setDraft({ ...draft, [key]: e.target.value || null })} />}
          </Field>
        ))}
      </FormCard>
    </FullModal>
  )
}

// ─── Tipping ───────────────────────────────────────────────────────────────

function TippingModal({ location, current, open, onClose }: { location: Location; current: Tipping; open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const settings = useSettings()
  const [draft, setDraft] = useState<Tipping>(current)
  const [lastOpen, setLastOpen] = useState(open)
  const [saving, run] = useAction()
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) setDraft(current)
  }
  const workspace = draft.mode === 'workspace'
  const view: Tipping = workspace ? { ...effectiveTipping(settings, {}), mode: 'workspace' } : draft
  const valueErrors = view.values.map((v) => (!Number.isFinite(v) || v < 1 || v > 100 ? t('settings.biz.sales.tipInvalid') : undefined))
  const invalid = !workspace && (valueErrors.some(Boolean) || view.values.length === 0)
  const set = (patch: Partial<Tipping>) => setDraft({ ...draft, ...patch })
  const save = () => {
    if (invalid) return
    void run(() => saveLocationExtras(location.id, { tipping: draft.mode === 'workspace' ? { ...view, mode: 'workspace' } : draft }), t('settings.biz.sales.tippingSaved'), onClose)
  }
  return (
    <FullModal open={open} onClose={onClose} onSave={save} saving={saving} saveDisabled={invalid} title={t('settings.biz.sales.tipTitle')} subtitle={t('settings.biz.sales.tippingHint')} testId="location-tipping-modal">
      <FormStack>
        <FormCard>
          <Field label={t('settings.biz.sales.tipping')}>
            {(id) => (
              <Select
                id={id}
                value={draft.mode}
                onChange={(e) => {
                  const mode = e.target.value as Tipping['mode']
                  setDraft(mode === 'custom' && current.mode === 'workspace' ? { ...view, mode } : { ...draft, mode })
                }}
                options={[
                  { value: 'custom', label: t('settings.biz.sales.customForLocation') },
                  { value: 'workspace', label: t('settings.biz.sales.workspaceDefaults') },
                ]}
              />
            )}
          </Field>
        </FormCard>
        <FormCard title={t('settings.biz.sales.tippingOptions')} className={workspace ? 'opacity-60' : undefined}>
          <div className="flex flex-col gap-4">
            <Switch disabled={workspace} checked={view.pos} onChange={(pos) => set({ pos })} label={t('settings.biz.sales.optPosLong')} />
            <Switch disabled={workspace} checked={view.terminal} onChange={(terminal) => set({ terminal })} label={t('settings.biz.sales.optTerminalLong')} />
            <Switch disabled={workspace} checked={view.online} onChange={(online) => set({ online })} label={t('settings.biz.sales.optOnlineLong')} hint={t('settings.biz.sales.optOnlineHint')} />
          </div>
        </FormCard>
        <FormCard title={t('settings.biz.sales.defaultValues')} description={t('settings.biz.sales.defaultValuesHint')} className={workspace ? 'opacity-60' : undefined}>
          <div className="flex flex-col gap-3">
            {view.values.map((v, i) => (
              <div key={i} className="flex items-start gap-3">
                <Field className="flex-1" label={t('settings.biz.sales.tipValue', { n: i + 1 })} error={valueErrors[i]}>
                  {(id) => <TextInput id={id} disabled={workspace} type="number" min={1} max={100} suffix="%" value={Number.isFinite(v) ? v : ''} invalid={Boolean(valueErrors[i])} onChange={(e) => set({ values: view.values.map((x, j) => (j === i ? (e.target.value === '' ? NaN : Number(e.target.value)) : x)) })} />}
                </Field>
                <button type="button" className="icon-btn mt-7" disabled={workspace || view.values.length <= 1} aria-label={t('settings.common.delete')} onClick={() => set({ values: view.values.filter((_, j) => j !== i) })}>
                  <Trash2 size={18} aria-hidden />
                </button>
              </div>
            ))}
            {view.values.length < 6 && (
              <Button variant="link" className="self-start" disabled={workspace} icon={<Plus size={16} />} onClick={() => set({ values: [...view.values, 15] })}>
                {t('settings.biz.sales.addValue')}
              </Button>
            )}
          </div>
        </FormCard>
        <FormCard title={t('settings.biz.sales.tipCalculation')} description={t('settings.biz.sales.cartItemsHint')} className={workspace ? 'opacity-60' : undefined}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CART_KEYS.map((k) => (
              <Checkbox key={k} disabled={workspace} checked={view.include[k]} onChange={(on) => set({ include: { ...view.include, [k]: on } })} label={t(`settings.biz.sales.cart.${k}`)} />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {BASE_KEYS.map((k) => (
              <Field key={k} label={t(`settings.biz.sales.base.${k}`)}>
                {(id) => (
                  <Select
                    id={id}
                    disabled={workspace}
                    value={view.include[k] ? 'included' : 'excluded'}
                    onChange={(e) => set({ include: { ...view.include, [k]: e.target.value === 'included' } })}
                    options={[
                      { value: 'included', label: t('settings.biz.sales.included') },
                      { value: 'excluded', label: t('settings.biz.sales.excluded') },
                    ]}
                  />
                )}
              </Field>
            ))}
          </div>
        </FormCard>
      </FormStack>
    </FullModal>
  )
}

// ─── Receipt details ───────────────────────────────────────────────────────

function ReceiptDetailsModal({ location, current, open, onClose }: { location: Location; current?: Receipt; open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const billing = useWorkspace().plan.billingDetails
  const initial: Receipt = current ?? { source: 'location', companyName: '', address: '', note: '' }
  const [draft, setDraft] = useState<Receipt>(initial)
  const [submitted, setSubmitted] = useState(false)
  const [lastOpen, setLastOpen] = useState(open)
  const [saving, run] = useAction()
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setDraft(initial)
      setSubmitted(false)
    }
  }
  const errors = draft.source === 'custom' ? { companyName: draft.companyName.trim() ? undefined : t('settings.common.required'), address: draft.address.trim() ? undefined : t('settings.common.required') } : { companyName: undefined, address: undefined }
  const save = () => {
    setSubmitted(true)
    if (errors.companyName || errors.address) return
    void run(() => saveLocationExtras(location.id, { receipt: { ...draft, note: draft.note.trim() } }), t('settings.biz.sales.receiptSaved'), onClose)
  }
  return (
    <FullModal open={open} onClose={onClose} title={t('settings.biz.sales.editReceipt')} subtitle={t('settings.biz.sales.receiptDetailsHint')} onSave={save} saving={saving} testId="location-receipt-modal">
      <FormStack>
        <FormCard title={t('settings.biz.sales.businessDetails')}>
          <RadioGroup
            variant="cards"
            value={draft.source}
            onChange={(source) => setDraft({ ...draft, source })}
            options={[
              {
                value: 'billing',
                disabled: !billing,
                label: t('settings.biz.sales.billingProfile'),
                hint: billing ? (
                  `${billing.businessName} • ${billing.address}`
                ) : (
                  <>
                    {t('settings.biz.sales.noBillingProfile')}{' '}
                    <Link to="/setup/billing/business-details" className="text-primary hover:underline">
                      {t('settings.common.manage')}
                    </Link>
                  </>
                ),
              },
              { value: 'location', label: t('settings.biz.sales.locationSource'), hint: location.name },
              { value: 'custom', label: t('settings.biz.sales.customSource') },
            ]}
          />
          {draft.source === 'custom' && (
            <>
              <Field label={t('settings.biz.sales.companyName')} error={submitted ? errors.companyName : undefined}>
                {(id) => <TextInput id={id} maxLength={100} value={draft.companyName} invalid={submitted && Boolean(errors.companyName)} onChange={(e) => setDraft({ ...draft, companyName: e.target.value })} />}
              </Field>
              <Field label={t('settings.biz.sales.address')} error={submitted ? errors.address : undefined}>
                {(id) => <TextArea id={id} maxLength={200} className="min-h-[72px]" value={draft.address} invalid={submitted && Boolean(errors.address)} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />}
              </Field>
            </>
          )}
        </FormCard>
        <FormCard title={t('settings.biz.sales.clientNote')} description={t('settings.biz.sales.clientNoteHint')}>
          <Field label={t('settings.biz.sales.receiptNote')} counter={{ value: draft.note.length, max: 200 }}>
            {(id) => <TextArea id={id} maxLength={200} placeholder={t('settings.biz.sales.notePlaceholder')} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} data-testid="location-receipt-note" />}
          </Field>
        </FormCard>
      </FormStack>
    </FullModal>
  )
}

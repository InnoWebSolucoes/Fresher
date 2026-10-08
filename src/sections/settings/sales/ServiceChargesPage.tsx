import { Pencil, ReceiptText, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Checkbox, EmptyState, Field, MoneyInput, RadioGroup, Select, TextArea, TextInput, confirm } from '@/components/ui'
import { updateSettings } from '@/api/settings'
import { uid } from '@/lib/ids'
import { money2 } from '@/lib/format'
import type { ServiceCharge, TaxRate } from '@/types'
import { ActionsPill, ListCard, ListRow, SettingsPage } from '../components/ui'
import { FullModal } from '../components/FullModal'
import { useAction } from '../components/useAction'
import { useSettings } from '../hooks'
import { FormCard } from './shared'

export const ITEM_TYPES = ['services', 'products', 'memberships', 'packages'] as const
export type ChargeItemType = (typeof ITEM_TYPES)[number]
/** The shared ServiceCharge plus the item types picked under "Only selected item types". */
export type ServiceChargeRecord = ServiceCharge & { itemTypes?: ChargeItemType[] }

interface ChargeDraft {
  name: string
  description: string
  rateType: ServiceCharge['rateType']
  amount: number | ''
  percent: string
  apply: ServiceCharge['apply']
  online: boolean
  inStore: boolean
  on: ServiceCharge['on']
  itemTypes: ChargeItemType[]
  taxRateId: string
}

const NAME_MAX = 50

const toDraft = (c: ServiceChargeRecord | null): ChargeDraft => ({
  name: c?.name ?? '',
  description: c?.description ?? '',
  rateType: c?.rateType ?? 'flat',
  amount: c && c.rateType === 'flat' ? c.amount : '',
  percent: c && c.rateType === 'percent' ? String(c.amount) : '',
  apply: c?.apply ?? 'automatic',
  online: c?.online ?? true,
  inStore: c?.inStore ?? true,
  on: c?.on ?? 'full',
  itemTypes: c?.itemTypes ?? ['services'],
  taxRateId: c?.taxRateId ?? '',
})

/** Settings › Sales › Service charges (settings-sales.md §6). */
export function ServiceChargesPage() {
  const { t } = useTranslation()
  const settings = useSettings()
  const charges = settings.serviceCharges as ServiceChargeRecord[]
  const [editing, setEditing] = useState<ServiceChargeRecord | 'new' | null>(null)
  const [, run] = useAction()

  const summary = (c: ServiceChargeRecord) => {
    const amount = c.rateType === 'flat' ? money2(c.amount) : `${Number(c.amount.toFixed(2))}%`
    const how = c.apply === 'automatic' ? t('settings.sale.charges.automaticShort') : t('settings.sale.charges.manualShort')
    const on = c.on === 'full' ? t('settings.sale.charges.fullShort') : (c.itemTypes ?? []).map((k) => t(`settings.sale.charges.types.${k}`)).join(', ')
    return [amount, how, on].filter(Boolean).join(' • ')
  }

  const remove = async (c: ServiceChargeRecord) => {
    const ok = await confirm({ title: t('settings.sale.charges.deleteTitle'), body: t('settings.sale.charges.deleteBody', { name: c.name }), confirmLabel: t('settings.common.delete'), tone: 'danger' })
    if (ok)
      await run(
        () =>
          updateSettings((s) => {
            s.serviceCharges = s.serviceCharges.filter((x) => x.id !== c.id)
          }),
        t('settings.sale.charges.deleted'),
      )
  }

  return (
    <SettingsPage
      title={t('settings.sale.charges.title')}
      description={t('settings.sale.charges.description')}
      learnMore={t('settings.sale.charges.title')}
      actions={
        <Button variant="primary" onClick={() => setEditing('new')} data-testid="add-service-charge">
          {t('settings.common.add')}
        </Button>
      }
    >
      {charges.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<ReceiptText size={26} aria-hidden />}
            title={t('settings.sale.charges.emptyTitle')}
            body={t('settings.sale.charges.emptyBody')}
            action={
              <Button variant="primary" onClick={() => setEditing('new')}>
                {t('settings.common.add')}
              </Button>
            }
            className="py-20"
          />
        </div>
      ) : (
        <ListCard>
          {charges.map((c) => (
            <ListRow
              key={c.id}
              testId={`charge-row-${c.id}`}
              leading={<ReceiptText size={20} aria-hidden />}
              title={c.name}
              subtitle={summary(c)}
              onClick={() => setEditing(c)}
              trailing={
                <ActionsPill
                  groups={[
                    {
                      items: [
                        { label: t('settings.common.edit'), icon: <Pencil size={16} />, onSelect: () => setEditing(c) },
                        { label: t('settings.common.delete'), icon: <Trash2 size={16} />, danger: true, onSelect: () => void remove(c) },
                      ],
                    },
                  ]}
                />
              }
            />
          ))}
        </ListCard>
      )}
      <ChargeModal editing={editing} onClose={() => setEditing(null)} taxRates={settings.taxRates} charges={charges} />
    </SettingsPage>
  )
}

/** "Add a service charge" / "Edit service charge" full-screen form. */
function ChargeModal({ editing, onClose, taxRates, charges }: { editing: ServiceChargeRecord | 'new' | null; onClose: () => void; taxRates: TaxRate[]; charges: ServiceChargeRecord[] }) {
  const { t } = useTranslation()
  const isNew = editing === 'new'
  const current = editing && editing !== 'new' ? editing : null
  const [draft, setDraft] = useState<ChargeDraft>(() => toDraft(null))
  const [openedFor, setOpenedFor] = useState<ServiceChargeRecord | 'new' | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, run] = useAction()
  if (editing !== openedFor) {
    setOpenedFor(editing)
    if (editing) {
      setDraft(toDraft(current))
      setErrors({})
    }
  }
  const patch = (p: Partial<ChargeDraft>, clear?: string) => {
    setDraft((d) => ({ ...d, ...p }))
    if (clear) setErrors((e) => ({ ...e, [clear]: '' }))
  }

  const save = () => {
    const errs: Record<string, string> = {}
    const name = draft.name.trim()
    if (!name) errs.name = t('settings.sale.charges.nameRequired')
    else if (charges.some((c) => c.id !== current?.id && c.name.trim().toLowerCase() === name.toLowerCase())) errs.name = t('settings.sale.charges.nameTaken')
    let amount = 0
    if (draft.rateType === 'flat') {
      if (draft.amount === '' || draft.amount <= 0) errs.amount = t('settings.sale.charges.amountRequired')
      else amount = Math.round(draft.amount * 100) / 100
    } else {
      const n = Number(draft.percent)
      if (draft.percent.trim() === '' || Number.isNaN(n) || n <= 0 || n > 100) errs.amount = t('settings.sale.charges.percentRange')
      else amount = Math.round(n * 100) / 100
    }
    if (draft.apply === 'automatic' && !draft.online && !draft.inStore) errs.channels = t('settings.sale.charges.channelRequired')
    if (draft.on === 'selected' && draft.itemTypes.length === 0) errs.itemTypes = t('settings.sale.charges.typesRequired')
    setErrors(errs)
    if (Object.values(errs).some(Boolean)) return
    const record: ServiceChargeRecord = {
      id: current?.id ?? uid('sc'),
      name,
      description: draft.description.trim(),
      rateType: draft.rateType,
      amount,
      apply: draft.apply,
      online: draft.apply === 'automatic' ? draft.online : false,
      inStore: draft.apply === 'automatic' ? draft.inStore : true,
      on: draft.on,
      itemTypes: draft.on === 'selected' ? draft.itemTypes : undefined,
      taxRateId: draft.taxRateId || null,
    }
    void run(
      () =>
        updateSettings((s) => {
          const list = s.serviceCharges as ServiceChargeRecord[]
          const index = list.findIndex((c) => c.id === record.id)
          if (index === -1) list.push(record)
          else list[index] = record
        }),
      isNew ? t('settings.sale.charges.created') : t('settings.sale.charges.updated'),
      onClose,
    )
  }

  return (
    <FullModal
      open={editing !== null}
      onClose={onClose}
      title={isNew ? t('settings.sale.charges.addTitle') : t('settings.sale.charges.editTitle')}
      subtitle={t('settings.sale.charges.modalSubtitle')}
      onSave={save}
      saving={saving}
      saveLabel={isNew ? t('settings.common.add') : undefined}
      testId="service-charge-modal"
    >
      <div className="flex flex-col gap-8">
        <FormCard>
          <div className="flex flex-col gap-5">
            <Field label={t('settings.sale.charges.name')} error={errors.name}>
              {(id) => <TextInput id={id} value={draft.name} maxLength={NAME_MAX} placeholder={t('settings.sale.charges.namePlaceholder')} invalid={Boolean(errors.name)} onChange={(e) => patch({ name: e.target.value }, 'name')} />}
            </Field>
            <Field label={t('settings.sale.charges.descriptionLabel')} hint={t('settings.sale.charges.descriptionHint')}>
              {(id) => <TextArea id={id} value={draft.description} maxLength={300} rows={5} placeholder={t('settings.sale.charges.descriptionPlaceholder')} onChange={(e) => patch({ description: e.target.value })} />}
            </Field>
          </div>
        </FormCard>

        <FormCard>
          <div className="flex flex-col gap-5">
            <Field label={t('settings.sale.charges.rateType')} hint={draft.rateType === 'flat' ? t('settings.sale.charges.flatHint') : t('settings.sale.charges.percentHint')}>
              {(id) => (
                <Select
                  id={id}
                  value={draft.rateType}
                  options={[
                    { value: 'flat', label: t('settings.sale.charges.flat') },
                    { value: 'percent', label: t('settings.sale.charges.percent') },
                  ]}
                  onChange={(e) => patch({ rateType: e.target.value as ServiceCharge['rateType'] }, 'amount')}
                />
              )}
            </Field>
            {draft.rateType === 'flat' ? (
              <Field label={t('settings.sale.charges.flatAmount')} error={errors.amount}>
                {(id) => <MoneyInput id={id} value={draft.amount} aria-invalid={Boolean(errors.amount)} onChange={(amount) => patch({ amount }, 'amount')} placeholder="0.00" />}
              </Field>
            ) : (
              <Field label={t('settings.sale.charges.percentAmount')} error={errors.amount}>
                {(id) => <TextInput id={id} type="number" inputMode="decimal" step="0.01" min={0} max={100} suffix="%" value={draft.percent} invalid={Boolean(errors.amount)} onChange={(e) => patch({ percent: e.target.value }, 'amount')} placeholder="0" />}
              </Field>
            )}
          </div>
        </FormCard>

        <FormCard title={t('settings.sale.charges.settings')} description={t('settings.sale.charges.settingsDescription')}>
          <div className="flex flex-col gap-8">
            <div>
              <p className="mb-3 text-body-strong text-ink">{t('settings.sale.charges.howTitle')}</p>
              <RadioGroup
                value={draft.apply}
                onChange={(apply) => patch({ apply }, 'channels')}
                options={[
                  { value: 'manual', label: t('settings.sale.charges.manual'), hint: t('settings.sale.charges.manualHint') },
                  { value: 'automatic', label: t('settings.sale.charges.automatic'), hint: t('settings.sale.charges.automaticHint') },
                ]}
              />
              {draft.apply === 'automatic' && (
                <div className="mt-4 flex flex-col gap-4 pl-8">
                  <Checkbox label={t('settings.sale.charges.online')} hint={t('settings.sale.charges.onlineHint')} checked={draft.online} onChange={(online) => patch({ online }, 'channels')} />
                  <Checkbox label={t('settings.sale.charges.inStore')} checked={draft.inStore} onChange={(inStore) => patch({ inStore }, 'channels')} />
                  {errors.channels && <p className="text-small text-danger">{errors.channels}</p>}
                </div>
              )}
            </div>
            <div>
              <p className="mb-3 text-body-strong text-ink">{t('settings.sale.charges.applyOn')}</p>
              <RadioGroup
                value={draft.on}
                onChange={(on) => patch({ on }, 'itemTypes')}
                options={[
                  { value: 'full', label: t('settings.sale.charges.full') },
                  { value: 'selected', label: t('settings.sale.charges.selected') },
                ]}
              />
              {draft.on === 'selected' && (
                <div className="mt-4 grid gap-4 pl-8 sm:grid-cols-2">
                  {ITEM_TYPES.map((k) => (
                    <Checkbox
                      key={k}
                      label={t(`settings.sale.charges.types.${k}`)}
                      checked={draft.itemTypes.includes(k)}
                      onChange={(v) => patch({ itemTypes: v ? [...draft.itemTypes, k] : draft.itemTypes.filter((x) => x !== k) }, 'itemTypes')}
                    />
                  ))}
                  {errors.itemTypes && <p className="text-small text-danger sm:col-span-2">{errors.itemTypes}</p>}
                </div>
              )}
            </div>
            <Field label={t('settings.sale.charges.taxRate')}>
              {(id) => (
                <Select
                  id={id}
                  value={draft.taxRateId}
                  options={[{ value: '', label: t('settings.sale.charges.noTax') }, ...taxRates.map((r) => ({ value: r.id, label: `${r.name} (${Number(r.rate.toFixed(2))}%)` }))]}
                  onChange={(e) => patch({ taxRateId: e.target.value })}
                />
              )}
            </Field>
          </div>
        </FormCard>
      </div>
    </FullModal>
  )
}

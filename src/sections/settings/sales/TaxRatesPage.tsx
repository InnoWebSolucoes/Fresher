import { Pencil, Percent, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, EmptyState, Field, Select, TextInput, confirm, toast } from '@/components/ui'
import { applyTaxDefaultsToCatalog, deleteTaxRate, updateSettings } from '@/api/settings'
import { uid } from '@/lib/ids'
import type { ID, Settings, TaxRate } from '@/types'
import { ActionsPill, ListCard, ListRow, PillMenu, SettingsPage } from '../components/ui'
import { SettingsModal } from '../components/SettingsModal'
import { useAction } from '../components/useAction'
import { useSettings } from '../hooks'

type TaxDefaults = Settings['taxDefaults']

const rateLabel = (rate: number) => `${Number(rate.toFixed(2))}%`

/** Settings › Sales › Tax rates (settings-sales.md §2). */
export function TaxRatesPage() {
  const { t } = useTranslation()
  const settings = useSettings()
  const taxRates = settings.taxRates
  const [editing, setEditing] = useState<TaxRate | 'new' | null>(null)
  const [defaultsOpen, setDefaultsOpen] = useState(false)
  const [, run] = useAction()

  const remove = async (rate: TaxRate) => {
    const ok = await confirm({
      title: t('settings.sale.tax.deleteTitle'),
      body: t('settings.sale.tax.deleteBody', { name: rate.name, rate: rateLabel(rate.rate) }),
      confirmLabel: t('settings.common.delete'),
      tone: 'danger',
    })
    if (ok) await run(() => deleteTaxRate(rate.id), t('settings.sale.tax.deleted'))
  }

  const applyDefaults = async () => {
    const name = (id: ID | null) => {
      const rate = taxRates.find((r) => r.id === id)
      return rate ? `${rate.name} (${rateLabel(rate.rate)})` : t('settings.sale.tax.noTax')
    }
    const ok = await confirm({
      title: t('settings.sale.tax.applyTitle'),
      body: t('settings.sale.tax.applyBody', { services: name(settings.taxDefaults.services), products: name(settings.taxDefaults.products) }),
      confirmLabel: t('settings.sale.tax.applyConfirm'),
      tone: 'primary',
    })
    if (!ok) return
    let changed = 0
    const done = await run(async () => {
      changed = await applyTaxDefaultsToCatalog()
    })
    if (done) toast(changed ? t('settings.sale.tax.applied', { count: changed }) : t('settings.sale.tax.appliedNone'))
  }

  const actions = (
    <>
      {taxRates.length > 0 && (
        <PillMenu
          label={t('settings.common.options')}
          width={300}
          groups={[
            {
              items: [
                { label: t('settings.sale.tax.defaults'), hint: t('settings.sale.tax.defaultsHint'), onSelect: () => setDefaultsOpen(true) },
                { label: t('settings.sale.tax.applyDefaults'), hint: t('settings.sale.tax.applyDefaultsHint'), onSelect: () => void applyDefaults() },
              ],
            },
          ]}
        />
      )}
      <Button variant="primary" onClick={() => setEditing('new')} data-testid="add-tax">
        {t('settings.sale.tax.add')}
      </Button>
    </>
  )

  return (
    <SettingsPage title={t('settings.sale.tax.title')} description={t('settings.sale.tax.description')} learnMore={t('settings.sale.tax.title')} actions={actions}>
      {taxRates.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Percent size={26} aria-hidden />}
            title={t('settings.sale.tax.emptyTitle')}
            body={t('settings.sale.tax.emptyBody')}
            action={
              <Button variant="primary" onClick={() => setEditing('new')}>
                {t('settings.sale.tax.add')}
              </Button>
            }
            className="py-20"
          />
        </div>
      ) : (
        <ListCard>
          {taxRates.map((rate) => (
            <ListRow
              key={rate.id}
              testId={`tax-row-${rate.id}`}
              leading={<Percent size={20} aria-hidden />}
              title={rate.name}
              subtitle={rateLabel(rate.rate)}
              trailing={
                <ActionsPill
                  groups={[
                    {
                      items: [
                        { label: t('settings.common.edit'), icon: <Pencil size={16} />, onSelect: () => setEditing(rate) },
                        { label: t('settings.common.delete'), icon: <Trash2 size={16} />, danger: true, onSelect: () => void remove(rate) },
                      ],
                    },
                  ]}
                />
              }
            />
          ))}
        </ListCard>
      )}

      <TaxModal editing={editing} onClose={() => setEditing(null)} taxRates={taxRates} />
      <TaxDefaultsModal open={defaultsOpen} onClose={() => setDefaultsOpen(false)} taxRates={taxRates} value={settings.taxDefaults} />
    </SettingsPage>
  )
}

/** "Add new tax" / "Edit tax": Tax name and Tax rate %. */
function TaxModal({ editing, onClose, taxRates }: { editing: TaxRate | 'new' | null; onClose: () => void; taxRates: TaxRate[] }) {
  const { t } = useTranslation()
  const isNew = editing === 'new'
  const current = editing && editing !== 'new' ? editing : null
  const [name, setName] = useState('')
  const [rate, setRate] = useState('')
  const [errors, setErrors] = useState<{ name?: string; rate?: string }>({})
  const [saving, run] = useAction()
  const [openedFor, setOpenedFor] = useState<TaxRate | 'new' | null>(null)

  // Reset the form whenever the modal opens for another record.
  if (editing !== openedFor) {
    setOpenedFor(editing)
    setName(current?.name ?? '')
    setRate(current ? String(current.rate) : '')
    setErrors({})
  }

  const save = () => {
    const next: typeof errors = {}
    const trimmed = name.trim()
    const value = Number(rate)
    if (!trimmed) next.name = t('settings.sale.tax.nameRequired')
    else if (taxRates.some((r) => r.id !== current?.id && r.name.trim().toLowerCase() === trimmed.toLowerCase() && r.rate === value)) next.name = t('settings.sale.tax.duplicate')
    if (rate.trim() === '' || Number.isNaN(value)) next.rate = t('settings.sale.tax.rateRequired')
    else if (value < 0 || value > 100) next.rate = t('settings.sale.tax.rateRange')
    setErrors(next)
    if (Object.keys(next).length) return
    const rounded = Math.round(value * 100) / 100
    if (current) {
      void run(
        () =>
          updateSettings((s) => {
            const item = s.taxRates.find((r) => r.id === current.id)
            if (item) {
              item.name = trimmed
              item.rate = rounded
            }
          }),
        t('settings.sale.tax.updated'),
        onClose,
      )
    } else {
      void run(
        () =>
          updateSettings((s) => {
            s.taxRates.push({ id: uid('tax'), name: trimmed, rate: rounded })
          }),
        t('settings.sale.tax.created'),
        onClose,
      )
    }
  }

  return (
    <SettingsModal
      open={editing !== null}
      onClose={onClose}
      title={isNew ? t('settings.sale.tax.addTitle') : t('settings.sale.tax.editTitle')}
      subtitle={t('settings.sale.tax.modalSubtitle')}
      footer={
        <>
          <Button onClick={onClose}>{t('settings.common.close')}</Button>
          <Button variant="primary" loading={saving} onClick={save} data-testid="tax-save">
            {isNew ? t('settings.common.add') : t('settings.common.save')}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-5 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <Field label={t('settings.sale.tax.name')} error={errors.name}>
          {(id) => <TextInput id={id} value={name} maxLength={40} invalid={Boolean(errors.name)} onChange={(e) => setName(e.target.value)} placeholder={t('settings.sale.tax.namePlaceholder')} />}
        </Field>
        <Field label={t('settings.sale.tax.rate')} error={errors.rate}>
          {(id) => <TextInput id={id} prefix="%" type="number" inputMode="decimal" step="0.01" min={0} max={100} value={rate} invalid={Boolean(errors.rate)} onChange={(e) => setRate(e.target.value)} />}
        </Field>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </SettingsModal>
  )
}

/** Options › Tax defaults: default tax per item type. */
function TaxDefaultsModal({ open, onClose, taxRates, value }: { open: boolean; onClose: () => void; taxRates: TaxRate[]; value: TaxDefaults }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<TaxDefaults>(value)
  const [wasOpen, setWasOpen] = useState(false)
  const [saving, run] = useAction()
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setDraft(value)
  }
  const options = useMemo(() => [{ value: '', label: t('settings.sale.tax.noTax') }, ...taxRates.map((r) => ({ value: r.id, label: `${r.name} (${rateLabel(r.rate)})` }))], [taxRates, t])
  const rows: { key: keyof TaxDefaults; label: string }[] = [
    { key: 'services', label: t('settings.sale.tax.services') },
    { key: 'products', label: t('settings.sale.tax.products') },
    { key: 'memberships', label: t('settings.sale.tax.memberships') },
  ]
  const save = () =>
    void run(
      () =>
        updateSettings((s) => {
          s.taxDefaults = { ...draft }
        }),
      t('settings.sale.tax.defaultsSaved'),
      onClose,
    )
  return (
    <SettingsModal
      open={open}
      onClose={onClose}
      title={t('settings.sale.tax.defaults')}
      subtitle={t('settings.sale.tax.defaultsSubtitle')}
      footer={
        <>
          <Button onClick={onClose}>{t('settings.common.close')}</Button>
          <Button variant="primary" loading={saving} onClick={save} data-testid="tax-defaults-save">
            {t('settings.common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        {rows.map((row) => (
          <Field key={row.key} label={row.label}>
            {(id) => <Select id={id} value={draft[row.key] ?? ''} options={options} onChange={(e) => setDraft((d) => ({ ...d, [row.key]: e.target.value || null }))} />}
          </Field>
        ))}
        <p className="text-small text-muted">{t('settings.sale.tax.defaultsHelp')}</p>
      </div>
    </SettingsModal>
  )
}

import clsx from 'clsx'
import { CornerDownRight, MoreVertical, Plus, RotateCcw, Store, Trash2, X } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, Button, Checkbox, Field, Menu, Modal, MoneyInput, SearchInput, Select, Switch, TextArea, TextInput, type MenuGroup } from '@/components/ui'
import { durationLong } from '@/lib/time'
import { money, num } from '@/lib/format'
import { uid } from '@/lib/ids'
import type { ExtraTime, ExtraTimeType, FormTemplate, ID, Location, Service, ServiceAddOnGroup, ServiceVariant, TeamMember } from '@/types'
import { useIsPhone } from '@/components/ui/responsive'
import { DurationSelect } from '../ui'

export type PriceType = Service['priceType']

export function usePriceTypeOptions() {
  const { t } = useTranslation()
  return [
    { value: 'free', label: t('catalog.priceTypes.free') },
    { value: 'from', label: t('catalog.priceTypes.from') },
    { value: 'fixed', label: t('catalog.priceTypes.fixed') },
  ]
}

/** Extra time rows (processing / blocked / servicing) + "Add extra time". */
export function ExtraTimeRows({ value, onChange, showAdd = true }: { value: ExtraTime[]; onChange: (v: ExtraTime[]) => void; showAdd?: boolean }) {
  const { t } = useTranslation()
  const phone = useIsPhone()
  const types: { value: ExtraTimeType; label: string }[] = [
    { value: 'processing', label: t('catalog.extraTime.processing') },
    { value: 'blocked', label: t('catalog.extraTime.blocked') },
    { value: 'servicing', label: t('catalog.extraTime.servicing') },
  ]
  return (
    <div className="flex flex-col gap-5 md:gap-3">
      {value.map((row, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 md:grid-cols-[1fr_1fr_auto]">
          <Field className="col-span-2 md:col-span-1" label={i === 0 || phone ? t('catalog.extraTime.type') : undefined}>
            {(id) => <Select id={id} value={row.type} options={types} onChange={(e) => onChange(value.map((r, j) => (j === i ? { ...r, type: e.target.value as ExtraTimeType } : r)))} />}
          </Field>
          <Field label={i === 0 || phone ? t('catalog.extraTime.duration') : undefined}>{(id) => <DurationSelect id={id} value={row.durationMin} onChange={(v) => onChange(value.map((r, j) => (j === i ? { ...r, durationMin: v } : r)))} />}</Field>
          <button type="button" className="icon-btn mb-1" aria-label={t('catalog.extraTime.remove')} onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <Trash2 size={18} aria-hidden />
          </button>
        </div>
      ))}
      {showAdd && (
        <div>
          <Button size="sm" icon={<Plus size={16} />} onClick={() => onChange([...value, { type: 'processing', durationMin: 15 }])}>
            {t('catalog.extraTime.add')}
          </Button>
        </div>
      )}
    </div>
  )
}

/** Add / edit variant (nav Basic details / Settings). */
export function VariantModal({ variant, onClose, onSave, isBase }: { variant: ServiceVariant | null; onClose: () => void; onSave: (v: ServiceVariant) => void; isBase?: boolean }) {
  const { t } = useTranslation()
  const priceTypes = usePriceTypeOptions()
  const [tab, setTab] = useState<'basic' | 'settings'>('basic')
  const [draft, setDraft] = useState<ServiceVariant | null>(variant)
  const [last, setLast] = useState<ServiceVariant | null>(variant)
  const [error, setError] = useState('')
  if (variant !== last) {
    setLast(variant)
    setDraft(variant)
    setTab('basic')
    setError('')
  }
  if (!draft) return null
  const set = (patch: Partial<ServiceVariant>) => setDraft({ ...draft, ...patch })
  const save = () => {
    if (draft.priceType !== 'free' && !(draft.price >= 0)) {
      setError(t('catalog.service.priceRequired'))
      return
    }
    onSave({ ...draft, name: draft.name.trim(), price: draft.priceType === 'free' ? 0 : draft.price })
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={variant?.id.startsWith('new') ? t('catalog.variant.addTitle') : t('catalog.variant.editTitle')}
      footer={
        <>
          <Button onClick={onClose}>{t('catalog.common.cancel')}</Button>
          <Button variant="primary" onClick={save}>
            {t('catalog.common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 pb-4 md:min-h-[360px] md:grid-cols-[200px_1fr] md:gap-6">
        <nav className="flex gap-2 md:flex-col md:gap-1">
          {(['basic', 'settings'] as const).map((k) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={clsx('h-10 rounded-full px-4 text-left text-body md:rounded-md md:px-3', tab === k ? 'bg-primary-subtle font-semibold text-primary' : 'text-ink hover:bg-sunken max-md:ring-1 max-md:ring-inset max-md:ring-line')}>
              {t(`catalog.variant.${k}`)}
            </button>
          ))}
        </nav>
        {tab === 'basic' ? (
          <div className="flex flex-col gap-4">
            <h3 className="font-display text-title-3 text-ink">{t('catalog.variant.basic')}</h3>
            {!isBase && (
              <>
                <Field label={t('catalog.variant.name')} optional counter={{ value: draft.name.length, max: 50 }}>
                  {(id) => <TextInput id={id} value={draft.name} maxLength={50} placeholder={t('catalog.variant.namePlaceholder')} onChange={(e) => set({ name: e.target.value })} />}
                </Field>
                <Field label={t('catalog.variant.description')} optional counter={{ value: (draft.description ?? '').length, max: 200 }}>
                  {(id) => <TextArea id={id} value={draft.description ?? ''} maxLength={200} onChange={(e) => set({ description: e.target.value })} />}
                </Field>
              </>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t('catalog.service.priceType')}>{(id) => <Select id={id} value={draft.priceType} options={priceTypes} onChange={(e) => set({ priceType: e.target.value as PriceType })} />}</Field>
              <Field label={t('catalog.service.price')} error={error}>
                {(id) => <MoneyInput id={id} value={draft.priceType === 'free' ? 0 : draft.price} disabled={draft.priceType === 'free'} placeholder="0.00" onChange={(v) => set({ price: v === '' ? 0 : v })} />}
              </Field>
              <Field label={t('catalog.service.duration')}>{(id) => <DurationSelect id={id} value={draft.durationMin} onChange={(v) => set({ durationMin: v })} />}</Field>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <h3 className="font-display text-title-3 text-ink">{t('catalog.variant.settings')}</h3>
            <Field label={t('catalog.service.sku')} counter={{ value: (draft.sku ?? '').length, max: 20 }}>
              {(id) => <TextInput id={id} value={draft.sku ?? ''} maxLength={20} placeholder="ABC-12345-H-SH" onChange={(e) => set({ sku: e.target.value })} />}
            </Field>
          </div>
        )}
      </div>
    </Modal>
  )
}

type Override = Service['advancedPricing'][number]

/**
 * Advanced pricing and duration: overrides per location and per team member
 * at that location (stored in `advancedPricing`).
 */
export function AdvancedPricingModal({
  open,
  onClose,
  service,
  locations,
  members,
  onApply,
}: {
  open: boolean
  onClose: () => void
  service: Pick<Service, 'durationMin' | 'priceType' | 'price' | 'advancedPricing' | 'locationIds'>
  locations: Location[]
  members: TeamMember[]
  onApply: (rows: Override[]) => void
}) {
  const { t } = useTranslation()
  const priceTypes = usePriceTypeOptions()
  const [rows, setRows] = useState<Override[]>(service.advancedPricing)
  const [query, setQuery] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [lastOpen, setLastOpen] = useState(false)
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setRows(service.advancedPricing)
      setQuery('')
    }
  }
  const key = (locationId: ID, teamMemberId?: ID) => (o: Override) => o.locationId === locationId && o.teamMemberId === teamMemberId
  const get = (locationId: ID, teamMemberId?: ID) => rows.find(key(locationId, teamMemberId))
  const set = (locationId: ID, teamMemberId: ID | undefined, patch: Partial<Override>) => {
    const existing = get(locationId, teamMemberId)
    const next = { ...(existing ?? { locationId, teamMemberId }), ...patch }
    setRows([...rows.filter((o) => !key(locationId, teamMemberId)(o)), next])
  }
  const reset = (locationId: ID, teamMemberId?: ID) => setRows(rows.filter((o) => !key(locationId, teamMemberId)(o)))
  const priceTypeLabel = (v: PriceType) => priceTypes.find((p) => p.value === v)?.label ?? v
  const shownLocations = locations.filter((l) => service.locationIds.includes(l.id) && (!locationFilter || l.id === locationFilter))
  const q = query.trim().toLowerCase()

  const row = (locationId: ID, teamMemberId: ID | undefined, label: ReactNode) => {
    const o = get(locationId, teamMemberId)
    const inherit = teamMemberId ? get(locationId) : undefined
    const baseDuration = inherit?.durationMin ?? service.durationMin
    const basePriceType = inherit?.priceType ?? service.priceType
    const basePrice = inherit?.price ?? service.price
    const effectiveType = o?.priceType ?? basePriceType
    return (
      <div key={`${locationId}-${teamMemberId ?? ''}`} className="grid grid-cols-1 items-center gap-3 border-b border-line py-4 last:border-0 md:grid-cols-[1.6fr_1fr_1fr_1fr] md:py-3">
        <div className="flex items-center gap-3 max-md:min-w-0">{label}</div>
        <DurationSelect value={o?.durationMin ?? baseDuration} placeholder={o?.durationMin === undefined ? `${durationLong(baseDuration)} (${t('catalog.advanced.default')})` : undefined} onChange={(v) => set(locationId, teamMemberId, { durationMin: v })} className={clsx(o?.durationMin === undefined && 'text-muted')} />
        <select value={o?.priceType ?? ''} onChange={(e) => set(locationId, teamMemberId, { priceType: (e.target.value || undefined) as PriceType | undefined })} className={clsx('input', o?.priceType === undefined && 'text-muted')} aria-label={t('catalog.service.priceType')}>
          <option value="">{`${priceTypeLabel(basePriceType)} (${t('catalog.advanced.default')})`}</option>
          {priceTypes.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <MoneyInput value={o?.price ?? ''} placeholder={num(basePrice, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })} disabled={effectiveType === 'free'} aria-label={t('catalog.service.price')} onChange={(v) => set(locationId, teamMemberId, { price: v === '' ? undefined : v })} />
      </div>
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={t('catalog.advanced.title')}
      subtitle={t('catalog.advanced.subtitle')}
      footer={
        <>
          <Button onClick={onClose}>{t('catalog.common.close')}</Button>
          <Button
            variant="primary"
            onClick={() => {
              onApply(rows.filter((o) => o.durationMin !== undefined || o.price !== undefined || o.priceType !== undefined))
              onClose()
            }}
          >
            {t('catalog.common.apply')}
          </Button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-sunken p-2">
        <SearchInput value={query} onChange={setQuery} placeholder={t('catalog.common.search')} className="max-w-xs max-md:max-w-none max-md:basis-full" />
        <Select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} placeholder={t('catalog.advanced.allLocations')} options={locations.filter((l) => service.locationIds.includes(l.id)).map((l) => ({ value: l.id, label: l.name }))} className="w-56 max-md:w-auto max-md:min-w-0 max-md:flex-1" aria-label={t('catalog.common.filters')} />
        <Button className="ml-auto" size="sm" icon={<RotateCcw size={14} />} onClick={() => setRows([])}>
          {t('catalog.advanced.resetAll')}
        </Button>
      </div>
      <div className="hidden grid-cols-[1.6fr_1fr_1fr_1fr] gap-3 border-b border-line pb-2 md:grid">
        <span className="text-body-strong text-ink">{t('catalog.advanced.rowsHeader')}</span>
        <span className="text-body-strong text-ink">
          {t('catalog.service.duration')}
          <span className="block text-small font-normal text-muted">{t('catalog.advanced.defaultValue', { value: durationLong(service.durationMin) })}</span>
        </span>
        <span className="text-body-strong text-ink">
          {t('catalog.service.priceType')}
          <span className="block text-small font-normal text-muted">{t('catalog.advanced.defaultValue', { value: priceTypeLabel(service.priceType) })}</span>
        </span>
        <span className="text-body-strong text-ink">
          {t('catalog.service.price')}
          <span className="block text-small font-normal text-muted">{t('catalog.advanced.defaultValue', { value: money(service.price) })}</span>
        </span>
      </div>
      {shownLocations.map((l) => {
        const locMembers = members.filter((m) => m.locationIds.includes(l.id) && (!q || `${m.firstName} ${m.lastName}`.toLowerCase().includes(q)))
        if (q && !l.name.toLowerCase().includes(q) && !locMembers.length) return null
        return (
          <div key={l.id} className="pb-2">
            {row(
              l.id,
              undefined,
              <>
                <span className="flex h-11 w-11 items-center justify-center rounded-md bg-primary-subtle text-primary">
                  <Store size={20} aria-hidden />
                </span>
                <span>
                  <span className="block text-body-strong text-ink">{l.name}</span>
                  <button type="button" className="text-small text-primary hover:underline" onClick={() => reset(l.id)}>
                    {t('catalog.advanced.reset')}
                  </button>
                </span>
              </>,
            )}
            {locMembers.map((m) =>
              row(
                l.id,
                m.id,
                <>
                  <CornerDownRight size={18} className="ml-3 text-muted" aria-hidden />
                  <Avatar name={`${m.firstName} ${m.lastName}`} color={m.color} size={36} />
                  <span>
                    <span className="block text-body text-ink">
                      {m.firstName} {m.lastName}
                    </span>
                    {get(l.id, m.id) && (
                      <button type="button" className="text-small text-primary hover:underline" onClick={() => reset(l.id, m.id)}>
                        {t('catalog.advanced.reset')}
                      </button>
                    )}
                  </span>
                </>,
              ),
            )}
          </div>
        )
      })}
    </Modal>
  )
}

/** Add / edit a service add-on group with its options. */
export function AddOnGroupModal({ group, onClose, onSave }: { group: ServiceAddOnGroup | null; onClose: () => void; onSave: (g: ServiceAddOnGroup) => void }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<ServiceAddOnGroup | null>(group)
  const [last, setLast] = useState<ServiceAddOnGroup | null>(group)
  const [error, setError] = useState('')
  if (group !== last) {
    setLast(group)
    setDraft(group)
    setError('')
  }
  if (!draft) return null
  const setOption = (i: number, patch: Partial<ServiceAddOnGroup['options'][number]>) => setDraft({ ...draft, options: draft.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) })
  const save = () => {
    if (!draft.name.trim()) return setError(t('catalog.addOns.nameRequired'))
    const options = draft.options.filter((o) => o.name.trim())
    if (!options.length) return setError(t('catalog.addOns.optionRequired'))
    onSave({ ...draft, name: draft.name.trim(), options })
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={group?.options.length ? t('catalog.addOns.editGroup') : t('catalog.addOns.addGroup')}
      footer={
        <>
          <Button onClick={onClose}>{t('catalog.common.cancel')}</Button>
          <Button variant="primary" onClick={save}>
            {t('catalog.common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <Field label={t('catalog.addOns.groupName')} error={error}>
          {(id) => <TextInput id={id} value={draft.name} placeholder={t('catalog.addOns.groupPlaceholder')} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />}
        </Field>
        <Switch checked={draft.required} onChange={(v) => setDraft({ ...draft, required: v })} label={t('catalog.addOns.required')} hint={t('catalog.addOns.requiredHint')} />
        <Switch checked={draft.multiple} onChange={(v) => setDraft({ ...draft, multiple: v })} label={t('catalog.addOns.multiple')} hint={t('catalog.addOns.multipleHint')} />
        <div>
          <p className="mb-2 text-body-strong text-ink">{t('catalog.addOns.options')}</p>
          <div className="flex flex-col gap-3 md:gap-2">
            {draft.options.map((o, i) => (
              <div key={o.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 max-md:border-b max-md:border-line max-md:pb-3 max-md:last:border-0 md:grid-cols-[1.5fr_1fr_1fr_auto]">
                <div className="col-span-2 md:col-span-1">
                  <TextInput value={o.name} placeholder={t('catalog.addOns.optionName')} aria-label={t('catalog.addOns.optionName')} onChange={(e) => setOption(i, { name: e.target.value })} />
                </div>
                <MoneyInput value={o.price} aria-label={t('catalog.service.price')} onChange={(v) => setOption(i, { price: v === '' ? 0 : v })} />
                <DurationSelect value={o.durationMin} allowZero onChange={(v) => setOption(i, { durationMin: v })} />
                <button type="button" className="icon-btn col-start-3 row-start-1 md:col-start-auto md:row-start-auto" aria-label={t('catalog.common.remove')} onClick={() => setDraft({ ...draft, options: draft.options.filter((_, j) => j !== i) })}>
                  <X size={16} aria-hidden />
                </button>
              </div>
            ))}
          </div>
          <Button className="mt-3" size="sm" icon={<Plus size={16} />} onClick={() => setDraft({ ...draft, options: [...draft.options, { id: uid('ao'), name: '', price: 0, durationMin: 0 }] })}>
            {t('catalog.addOns.addOption')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** Attach form templates to the service. */
export function FormsPickerModal({ open, onClose, templates, selected, onAdd }: { open: boolean; onClose: () => void; templates: FormTemplate[]; selected: ID[]; onAdd: (ids: ID[]) => void }) {
  const { t } = useTranslation()
  const [picked, setPicked] = useState<ID[]>([])
  const available = useMemo(() => templates.filter((f) => !selected.includes(f.id)), [templates, selected])
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('catalog.forms.addTitle')}
      footer={
        <>
          <Button onClick={onClose}>{t('catalog.common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={!picked.length}
            onClick={() => {
              onAdd(picked)
              setPicked([])
              onClose()
            }}
          >
            {t('catalog.common.add')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 pb-2">
        {available.length === 0 && <p className="text-body text-muted">{t('catalog.forms.noneAvailable')}</p>}
        {available.map((f) => (
          <Checkbox key={f.id} checked={picked.includes(f.id)} onChange={(v) => setPicked(v ? [...picked, f.id] : picked.filter((x) => x !== f.id))} label={f.name} hint={f.status === 'active' ? t('catalog.common.active') : t('catalog.common.inactive')} />
        ))}
      </div>
    </Modal>
  )
}

/** Row in "Pricing and duration" when variants exist. */
export function VariantRow({ name, durationMin, price, priceType, color, menu }: { name: string; durationMin: number; price: number; priceType: PriceType; color: string; menu: MenuGroup[] }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-3 py-2 md:gap-4">
      <span className="h-14 w-1 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-body-lg text-ink">{name}</p>
        <p className="text-body text-muted">{durationLong(durationMin)}</p>
      </div>
      <span className="text-right text-body-lg text-ink">{priceType === 'free' ? t('catalog.priceTypes.free') : `${priceType === 'from' ? `${t('catalog.common.from')} ` : ''}${money(price)}`}</span>
      <Menu
        width={220}
        groups={menu}
        trigger={({ open, toggle }) => (
          <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={toggle} aria-label={t('catalog.common.actions')} className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-1 rounded-full border border-line-strong bg-surface text-body-strong text-ink hover:bg-sunken md:h-9 md:w-auto md:justify-start md:px-4">
            <span className="hidden md:inline">{t('catalog.common.actions')}</span>
            <MoreVertical size={14} className="max-md:h-[18px] max-md:w-[18px]" aria-hidden />
          </button>
        )}
      />
    </div>
  )
}

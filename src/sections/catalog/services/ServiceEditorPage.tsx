import { ArrowRight, ChevronDown, FileText, Plus, Puzzle, Search, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Avatar, Button, Checkbox, Chip, EmptyState, Field, LearnMore, Menu, MoneyInput, Segmented, Select, Switch, TextArea, TextInput, toast } from '@/components/ui'
import { useDb } from '@/store/db'
import { uid } from '@/lib/ids'
import { durationLong, now, todayISO } from '@/lib/time'
import { addDays, format } from 'date-fns'
import { money, round2 } from '@/lib/format'
import { PALETTE } from '@/styles/palette'
import type { ID, Service, ServiceAddOnGroup, ServiceVariant, TimeRange, Weekday } from '@/types'
import { saveService, type ServiceInput } from '@/api/catalog'
import { DEFAULT_UPSELLING, useCatalogPrefs, type Upselling } from '../prefs'
import { generateDescription } from '../lib'
import { AiDescription, CategoryModal, DotSelect, DurationSelect, EditorFrame, ImageUploader, OnOffChip, SectionCard, TreatmentCombobox } from '../ui'
import { AddOnGroupModal, AdvancedPricingModal, ExtraTimeRows, FormsPickerModal, VariantModal, VariantRow, usePriceTypeOptions, type PriceType } from './serviceParts'

type SectionId = 'basic' | 'team' | 'resources' | 'addons' | 'online' | 'images' | 'forms' | 'commissions' | 'settings'

const WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6]

/** Add / Edit service (catalog.md §1.1). */
export function ServiceEditorPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const [params] = useSearchParams()
  const services = useDb((s) => s.services)
  const categories = useDb((s) => s.serviceCategories)
  const teamMembers = useDb((s) => s.teamMembers)
  const locations = useDb((s) => s.locations)
  const resourceTypes = useDb((s) => s.resourceTypes)
  const resources = useDb((s) => s.resources)
  const formTemplates = useDb((s) => s.formTemplates)
  const settings = useDb((s) => s.settings)
  const setUpsellingPref = useCatalogPrefs((s) => s.setUpselling)
  const priceTypes = usePriceTypeOptions()

  const existing = id ? services.find((s) => s.id === id) : undefined
  const duplicateOf = params.get('duplicate')
  const editing = Boolean(id)

  const initial = useMemo<ServiceInput | null>(() => {
    const source = existing ?? (duplicateOf ? services.find((s) => s.id === duplicateOf) : undefined)
    if (source) {
      const { id: _id, order: _order, ...rest } = source
      void _id
      void _order
      if (existing) return structuredClone(rest)
      return { ...structuredClone(rest), name: `Copy of ${source.name}`.slice(0, 255), archived: false, variants: rest.variants.map((v) => ({ ...v, id: uid('var') })), addOnGroups: rest.addOnGroups.map((g) => ({ ...g, id: uid('aog'), options: g.options.map((o) => ({ ...o, id: uid('ao') })) })) }
    }
    if (id) return null
    const categoryId = params.get('category') ?? [...categories].sort((a, b) => a.order - b.order)[0]?.id ?? ''
    return {
      name: '',
      categoryId,
      treatmentType: '',
      description: '',
      priceType: 'fixed',
      price: 0,
      durationMin: 60,
      extraTime: [],
      variants: [],
      addOnGroups: [],
      teamMemberIds: 'all',
      locationIds: locations.map((l) => l.id),
      resourceTypeIds: [],
      advancedPricing: [],
      images: [],
      onlineBooking: true,
      availableFor: 'all',
      limits: {},
      patchTestRequired: false,
      formIds: [],
      taxRateId: settings.taxDefaults.services,
      commissionEnabled: true,
      archived: false,
    }
    // Only computed once per route; later store updates must not reset the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, duplicateOf])

  const [form, setForm] = useState<ServiceInput | null>(initial)
  const [upselling, setUpselling] = useState<Upselling>(DEFAULT_UPSELLING)
  const [rebook, setRebook] = useState(() => {
    const w = initial?.rebookReminderWeeks
    if (w === undefined) return { on: false, value: 4, unit: 'weeks' as 'weeks' | 'days' }
    return Number.isInteger(w) ? { on: true, value: w, unit: 'weeks' as const } : { on: true, value: Math.round(w * 7), unit: 'days' as const }
  })
  const [costMode, setCostMode] = useState<'amount' | 'percent'>('amount')
  const [costValue, setCostValue] = useState<number | ''>(initial?.cost ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [variantEdit, setVariantEdit] = useState<{ variant: ServiceVariant; isBase: boolean } | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [categoryModal, setCategoryModal] = useState(false)
  const [groupEdit, setGroupEdit] = useState<ServiceAddOnGroup | null>(null)
  const [formsOpen, setFormsOpen] = useState(false)
  const [commissionQuery, setCommissionQuery] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      // Section prefs hydrate from IndexedDB asynchronously; pick them up once loaded.
      const saved = id ? useCatalogPrefs.getState().upselling[id] : undefined
      if (saved) setUpselling(saved)
      setLoading(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [id])
  useEffect(() => {
    const section = params.get('section')
    if (!loading && section) setTimeout(() => document.getElementById(`sec-${section}`)?.scrollIntoView({ block: 'start' }), 50)
  }, [loading, params])

  const close = () => navigate('/catalogue/services')

  if (!form) {
    return (
      <EditorFrame title={t('catalog.service.editTitle')} onClose={close} actions={null}>
        <EmptyState title={t('catalog.common.notFoundTitle')} body={t('catalog.common.notFoundBody')} action={<Button onClick={close}>{t('catalog.menu.title')}</Button>} />
      </EditorFrame>
    )
  }

  const set = (patch: Partial<ServiceInput>) => setForm({ ...form, ...patch })
  const category = categories.find((c) => c.id === form.categoryId)
  const color = PALETTE[category?.color ?? 'blue'].edge
  const activeMembers = teamMembers.filter((m) => !m.archived)
  const assignedMembers = form.teamMemberIds === 'all' ? activeMembers : activeMembers.filter((m) => (form.teamMemberIds as ID[]).includes(m.id))
  const memberCount = assignedMembers.length

  const toggleMember = (memberId: ID, on: boolean) => {
    const current = form.teamMemberIds === 'all' ? activeMembers.map((m) => m.id) : form.teamMemberIds
    const next = on ? [...new Set([...current, memberId])] : current.filter((x) => x !== memberId)
    set({ teamMemberIds: next.length === activeMembers.length ? 'all' : next })
  }

  const saveVariant = (v: ServiceVariant) => {
    if (variantEdit?.isBase) set({ priceType: v.priceType, price: v.price, durationMin: v.durationMin })
    else if (v.id.startsWith('new')) set({ variants: [...form.variants, { ...v, id: uid('var'), name: v.name || t('catalog.variant.defaultName', { n: form.variants.length + 1 }) }] })
    else set({ variants: form.variants.map((x) => (x.id === v.id ? v : x)) })
    setVariantEdit(null)
  }
  const newVariant = (): ServiceVariant => ({ id: `new_${Date.now()}`, name: '', description: '', priceType: 'fixed', price: 0, durationMin: 60 })
  const moveVariant = (index: number, delta: number) => {
    const next = [...form.variants]
    const [item] = next.splice(index, 1)
    next.splice(Math.max(0, Math.min(next.length, index + delta)), 0, item)
    set({ variants: next })
  }

  const limitsWeekly = form.limits.weekly
  const setWeekly = (day: Weekday, range: TimeRange | null) => {
    const weekly = { ...(form.limits.weekly ?? {}) }
    if (range) weekly[day] = [range]
    else delete weekly[day]
    set({ limits: { ...form.limits, weekly } })
  }

  const submit = async () => {
    const next: Record<string, string> = {}
    if (!form.name.trim()) next.name = t('catalog.service.nameRequired')
    if (!form.categoryId) next.category = t('catalog.service.categoryRequired')
    if (form.priceType !== 'free' && !(form.price >= 0)) next.price = t('catalog.service.priceRequired')
    setErrors(next)
    if (Object.keys(next).length) {
      document.getElementById('sec-basic')?.scrollIntoView({ behavior: 'smooth' })
      return
    }
    setSaving(true)
    const cost = costValue === '' ? undefined : costMode === 'percent' ? round2((form.price * costValue) / 100) : costValue
    const saved = await saveService(editing ? id! : null, {
      ...form,
      name: form.name.trim(),
      price: form.priceType === 'free' ? 0 : form.price,
      cost,
      sku: form.sku?.trim() || undefined,
      aftercare: form.aftercare?.trim() ? form.aftercare : undefined,
      rebookReminderWeeks: rebook.on ? (rebook.unit === 'weeks' ? rebook.value : rebook.value / 7) : undefined,
    })
    setUpsellingPref(saved.id, upselling)
    setSaving(false)
    toast(editing ? t('catalog.toasts.serviceUpdated') : t('catalog.toasts.serviceCreated'))
    navigate('/catalogue/services')
  }

  const nav = {
    groups: [
      {
        items: [
          { value: 'basic' as SectionId, label: t('catalog.service.nav.basic') },
          { value: 'team' as SectionId, label: t('catalog.service.nav.team'), count: memberCount },
          { value: 'resources' as SectionId, label: t('catalog.service.nav.resources') },
          { value: 'addons' as SectionId, label: t('catalog.service.nav.addons') },
        ],
      },
      {
        heading: t('catalog.service.nav.settingsHeading'),
        items: [
          { value: 'online' as SectionId, label: t('catalog.service.nav.online') },
          { value: 'images' as SectionId, label: t('catalog.service.nav.images') },
          { value: 'forms' as SectionId, label: t('catalog.service.nav.forms'), count: form.formIds.length || undefined },
          { value: 'commissions' as SectionId, label: t('catalog.service.nav.commissions') },
          { value: 'settings' as SectionId, label: t('catalog.service.nav.settings') },
        ],
      },
    ],
  }

  const commissionMembers = assignedMembers.filter((m) => `${m.firstName} ${m.lastName}`.toLowerCase().includes(commissionQuery.trim().toLowerCase()))

  return (
    <EditorFrame<SectionId>
      title={editing ? t('catalog.service.editTitle') : t('catalog.service.addTitle')}
      onClose={close}
      loading={loading}
      nav={nav}
      actions={
        <Button variant="primary" loading={saving} onClick={() => void submit()}>
          {t('catalog.common.save')}
        </Button>
      }
    >
      {/* Basic details */}
      <SectionCard id="basic" title={t('catalog.service.basicTitle')}>
        <div className="flex flex-col gap-5">
          <Field label={t('catalog.service.name')} counter={{ value: form.name.length, max: 255 }} error={errors.name}>
            {(fid) => <TextInput id={fid} value={form.name} maxLength={255} invalid={Boolean(errors.name)} placeholder={t('catalog.service.namePlaceholder')} onChange={(e) => set({ name: e.target.value })} />}
          </Field>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label={t('catalog.service.category')} hint={t('catalog.service.categoryHint')} error={errors.category}>
              {(fid) => (
                <DotSelect
                  id={fid}
                  value={form.categoryId}
                  invalid={Boolean(errors.category)}
                  placeholder={t('catalog.service.selectCategory')}
                  options={[...categories].sort((a, b) => a.order - b.order).map((c) => ({ value: c.id, label: c.name, color: c.color }))}
                  onChange={(v) => set({ categoryId: v })}
                  footer={{ label: t('catalog.menu.addCategory'), onClick: () => setCategoryModal(true) }}
                />
              )}
            </Field>
            <Field label={t('catalog.service.treatment')} hint={t('catalog.service.treatmentHint')}>
              {(fid) => <TreatmentCombobox id={fid} value={form.treatmentType} onChange={(v) => set({ treatmentType: v })} />}
            </Field>
          </div>
          <Field label={t('catalog.service.description')} optional counter={{ value: form.description.length, max: 1000 }}>
            {(fid) => <AiDescription id={fid} value={form.description} max={1000} placeholder={t('catalog.service.descriptionPlaceholder')} onChange={(v) => set({ description: v })} generate={() => generateDescription(form.name || form.treatmentType, category?.name, form.treatmentType, form.durationMin)} />}
          </Field>
        </div>
      </SectionCard>

      <SectionCard title={t('catalog.service.pricingTitle')}>
        {form.variants.length === 0 ? (
          <div className="flex flex-col gap-5">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label={t('catalog.service.priceType')}>{(fid) => <Select id={fid} value={form.priceType} options={priceTypes} onChange={(e) => set({ priceType: e.target.value as PriceType })} />}</Field>
              <Field label={t('catalog.service.price')} error={errors.price}>
                {(fid) => <MoneyInput id={fid} value={form.priceType === 'free' ? 0 : form.price} disabled={form.priceType === 'free'} placeholder="0.00" onChange={(v) => set({ price: v === '' ? 0 : v })} />}
              </Field>
              <Field label={t('catalog.service.duration')}>{(fid) => <DurationSelect id={fid} value={form.durationMin} onChange={(v) => set({ durationMin: v })} />}</Field>
            </div>
            <ExtraTimeRows value={form.extraTime} onChange={(v) => set({ extraTime: v })} showAdd={false} />
            <div className="flex flex-wrap gap-2">
              <Button icon={<Plus size={16} />} onClick={() => set({ extraTime: [...form.extraTime, { type: 'processing', durationMin: 15 }] })}>
                {t('catalog.extraTime.add')}
              </Button>
              <Menu
                width={260}
                align="left"
                trigger={({ open, toggle }) => (
                  <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={toggle} className="inline-flex h-10 items-center gap-2 rounded-md border border-line-strong bg-surface px-4 text-body-strong text-ink hover:bg-sunken">
                    {t('catalog.common.options')}
                    <ChevronDown size={16} aria-hidden />
                  </button>
                )}
                groups={[
                  {
                    items: [
                      { label: t('catalog.variant.addTitle'), onSelect: () => setVariantEdit({ variant: newVariant(), isBase: false }) },
                      { label: t('catalog.advanced.title'), onSelect: () => setAdvancedOpen(true) },
                    ],
                  },
                ]}
              />
            </div>
            {form.advancedPricing.length > 0 && <p className="text-small text-muted">{t('catalog.advanced.count', { count: form.advancedPricing.length })}</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <VariantRow
              name={form.name || t('catalog.service.namePlaceholderShort')}
              durationMin={form.durationMin}
              price={form.price}
              priceType={form.priceType}
              color={color}
              menu={[
                {
                  items: [
                    { label: t('catalog.variant.editDetails'), onSelect: () => setVariantEdit({ variant: { id: 'base', name: form.name, priceType: form.priceType, price: form.price, durationMin: form.durationMin }, isBase: true }) },
                    { label: t('catalog.variant.advancedOptions'), onSelect: () => setAdvancedOpen(true) },
                  ],
                },
              ]}
            />
            {form.variants.map((v, i) => (
              <VariantRow
                key={v.id}
                name={v.name}
                durationMin={v.durationMin}
                price={v.price}
                priceType={v.priceType}
                color={color}
                menu={[
                  { items: [{ label: t('catalog.variant.editDetails'), onSelect: () => setVariantEdit({ variant: v, isBase: false }) }] },
                  {
                    items: [
                      { label: t('catalog.variant.moveUp'), disabled: i === 0, onSelect: () => moveVariant(i, -1) },
                      { label: t('catalog.variant.moveDown'), disabled: i === form.variants.length - 1, onSelect: () => moveVariant(i, 1) },
                      { label: t('catalog.common.duplicate'), onSelect: () => set({ variants: [...form.variants.slice(0, i + 1), { ...v, id: uid('var'), name: `${v.name} (copy)`.slice(0, 50) }, ...form.variants.slice(i + 1)] }) },
                      { label: t('catalog.common.delete'), danger: true, onSelect: () => set({ variants: form.variants.filter((x) => x.id !== v.id) }) },
                    ],
                  },
                ]}
              />
            ))}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button icon={<Plus size={16} />} onClick={() => setVariantEdit({ variant: newVariant(), isBase: false })}>
                {t('catalog.variant.addTitle')}
              </Button>
            </div>
            <div className="mt-5">
              <ExtraTimeRows value={form.extraTime} onChange={(v) => set({ extraTime: v })} />
            </div>
          </div>
        )}
      </SectionCard>

      {/* Team members */}
      <SectionCard id="team" title={t('catalog.service.teamTitle')} subtitle={t('catalog.service.teamSubtitle')}>
        <div className="flex flex-col">
          <Checkbox
            checked={form.teamMemberIds === 'all'}
            onChange={(v) => set({ teamMemberIds: v ? 'all' : [] })}
            label={
              <span className="flex items-center gap-2 font-semibold">
                {t('catalog.service.allTeamMembers')} <span className="chip h-5 bg-sunken px-1.5 text-caption text-muted">{activeMembers.length}</span>
              </span>
            }
          />
          <div className="mt-3 flex flex-col divide-y divide-line">
            {activeMembers.map((m) => (
              <label key={m.id} className="flex cursor-pointer items-center gap-4 py-3">
                <input type="checkbox" checked={form.teamMemberIds === 'all' || form.teamMemberIds.includes(m.id)} onChange={(e) => toggleMember(m.id, e.target.checked)} className="h-5 w-5 accent-[rgb(var(--primary))]" />
                <Avatar name={`${m.firstName} ${m.lastName}`} color={m.color} size={44} />
                <span>
                  <span className="block text-body-lg text-ink">
                    {m.firstName} {m.lastName}
                  </span>
                  <span className="block text-small text-muted">{m.jobTitle}</span>
                </span>
              </label>
            ))}
          </div>
          {memberCount === 0 && <p className="mt-2 text-small text-warning">{t('catalog.service.noMembersWarning')}</p>}
          <div className="mt-6 border-t border-line pt-5">
            <p className="mb-3 text-body-strong text-ink">{t('catalog.service.locations')}</p>
            <div className="flex flex-col gap-3">
              {locations.map((l) => (
                <Checkbox key={l.id} checked={form.locationIds.includes(l.id)} onChange={(v) => set({ locationIds: v ? [...form.locationIds, l.id] : form.locationIds.filter((x) => x !== l.id) })} label={l.name} hint={l.address.line1} />
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Resources */}
      <SectionCard id="resources" title={t('catalog.service.resourcesTitle')} subtitle={resourceTypes.length ? t('catalog.service.resourcesSubtitle') : undefined}>
        {resourceTypes.length === 0 ? (
          <EmptyState
            title={t('catalog.service.noResourcesTitle')}
            body={t('catalog.service.noResourcesBody')}
            action={<Button onClick={() => navigate('/setup/scheduling/resources')}>{t('catalog.service.manageResources')}</Button>}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {resourceTypes.map((rt) => (
              <Checkbox key={rt.id} checked={form.resourceTypeIds.includes(rt.id)} onChange={(v) => set({ resourceTypeIds: v ? [...form.resourceTypeIds, rt.id] : form.resourceTypeIds.filter((x) => x !== rt.id) })} label={rt.name} hint={t('catalog.service.resourceCount', { count: resources.filter((r) => r.typeId === rt.id).length, description: rt.description })} />
            ))}
            <div>
              <Button variant="link" onClick={() => navigate('/setup/scheduling/resources')}>
                {t('catalog.service.manageResources')}
              </Button>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Add-ons */}
      <SectionCard id="addons" title={form.addOnGroups.length ? t('catalog.addOns.title') : undefined}>
        {form.addOnGroups.length === 0 ? (
          <EmptyState
            icon={<Puzzle size={26} />}
            title={t('catalog.addOns.title')}
            body={
              <>
                {t('catalog.addOns.body')} <LearnMore topic="Service add-ons">{t('catalog.common.learnMore')}</LearnMore>
              </>
            }
            action={<Button onClick={() => setGroupEdit({ id: uid('aog'), name: '', required: false, multiple: false, options: [{ id: uid('ao'), name: '', price: 0, durationMin: 0 }] })}>{t('catalog.addOns.addGroup')}</Button>}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {form.addOnGroups.map((g) => (
              <div key={g.id} className="rounded-lg border border-line p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-body-strong text-ink">{g.name}</p>
                    <p className="text-small text-muted">
                      {g.required ? t('catalog.addOns.requiredShort') : t('catalog.addOns.optionalShort')} · {g.multiple ? t('catalog.addOns.multipleShort') : t('catalog.addOns.singleShort')}
                    </p>
                  </div>
                  <Menu
                    groups={[
                      {
                        items: [
                          { label: t('catalog.common.edit'), onSelect: () => setGroupEdit(g) },
                          { label: t('catalog.common.delete'), danger: true, onSelect: () => set({ addOnGroups: form.addOnGroups.filter((x) => x.id !== g.id) }) },
                        ],
                      },
                    ]}
                  />
                </div>
                <ul className="mt-2 flex flex-col gap-1">
                  {g.options.map((o) => (
                    <li key={o.id} className="flex justify-between text-body text-ink">
                      <span>{o.name}</span>
                      <span className="text-muted">
                        {o.durationMin ? `${durationLong(o.durationMin)} · ` : ''}+{money(o.price)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div>
              <Button icon={<Plus size={16} />} onClick={() => setGroupEdit({ id: uid('aog'), name: '', required: false, multiple: false, options: [{ id: uid('ao'), name: '', price: 0, durationMin: 0 }] })}>
                {t('catalog.addOns.addGroup')}
              </Button>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Online booking */}
      <SectionCard id="online" title={t('catalog.service.onlineTitle')} titleExtra={<OnOffChip on={form.onlineBooking} />} subtitle={t('catalog.service.onlineSubtitle')} action={<Switch checked={form.onlineBooking} onChange={(v) => set({ onlineBooking: v })} />}>
        {!locations.some((l) => l.marketplace.listed) && (
          <div className="mb-5 flex items-center justify-between gap-4 rounded-lg bg-gradient-to-r from-primary to-primary-hover p-6 text-on-primary">
            <div>
              <p className="font-display text-title-2">{t('catalog.service.promoTitle')}</p>
              <p className="mt-1 text-body-lg opacity-90">{t('catalog.service.promoBody')}</p>
            </div>
            <Button variant="accent" iconRight={<ArrowRight size={16} />} onClick={() => navigate('/online-presence/locations')}>
              {t('catalog.common.startNow')}
            </Button>
          </div>
        )}
        <Field label={t('catalog.service.availableFor')} className="max-w-md">
          {(fid) => (
            <Select
              id={fid}
              value={form.availableFor}
              disabled={!form.onlineBooking}
              onChange={(e) => set({ availableFor: e.target.value as Service['availableFor'] })}
              options={[
                { value: 'all', label: t('catalog.gender.all') },
                { value: 'female', label: t('catalog.gender.female') },
                { value: 'male', label: t('catalog.gender.male') },
              ]}
            />
          )}
        </Field>
      </SectionCard>

      <SectionCard
        title={t('catalog.service.upsellingTitle')}
        subtitle={
          <>
            {t('catalog.service.upsellingSubtitle')}{' '}
            <button type="button" className="text-primary hover:underline" onClick={() => navigate('/setup/scheduling/booking-options')}>
              {t('catalog.service.workspaceSettings')}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <Switch checked={upselling.service} onChange={(v) => setUpselling({ ...upselling, service: v })} label={t('catalog.service.serviceUpselling')} hint={t('catalog.service.serviceUpsellingHint')} />
          <Switch checked={upselling.membership} onChange={(v) => setUpselling({ ...upselling, membership: v })} label={t('catalog.service.membershipUpselling')} hint={t('catalog.service.upsellAuto')} />
          <Switch checked={upselling.package} onChange={(v) => setUpselling({ ...upselling, package: v })} label={t('catalog.service.packageUpselling')} hint={t('catalog.service.upsellAuto')} />
        </div>
      </SectionCard>

      <SectionCard title={t('catalog.service.limitTitle')}>
        <div className="flex flex-col gap-5">
          <Switch
            checked={Boolean(form.limits.dateRange)}
            onChange={(v) => set({ limits: { ...form.limits, dateRange: v ? { from: todayISO(), to: format(addDays(now(), 30), 'yyyy-MM-dd') } : undefined } })}
            label={t('catalog.service.limitDates')}
          />
          {form.limits.dateRange && (
            <div className="grid max-w-md grid-cols-2 gap-3 pl-1">
              <Field label={t('catalog.service.from')}>{(fid) => <TextInput id={fid} type="date" value={form.limits.dateRange!.from} onChange={(e) => set({ limits: { ...form.limits, dateRange: { ...form.limits.dateRange!, from: e.target.value } } })} />}</Field>
              <Field label={t('catalog.service.to')} error={form.limits.dateRange.to < form.limits.dateRange.from ? t('catalog.service.dateOrder') : undefined}>
                {(fid) => <TextInput id={fid} type="date" value={form.limits.dateRange!.to} onChange={(e) => set({ limits: { ...form.limits, dateRange: { ...form.limits.dateRange!, to: e.target.value } } })} />}
              </Field>
            </div>
          )}
          <Switch
            checked={Boolean(limitsWeekly)}
            onChange={(v) => set({ limits: { ...form.limits, weekly: v ? Object.fromEntries(WEEKDAYS.slice(0, 6).map((d) => [d, [{ start: '09:00', end: '19:00' }]])) : undefined } })}
            label={t('catalog.service.limitWeekly')}
          />
          {limitsWeekly && (
            <div className="flex flex-col gap-2 pl-1">
              {WEEKDAYS.map((d) => {
                const range = limitsWeekly[d]?.[0]
                return (
                  <div key={d} className="grid grid-cols-[150px_1fr_1fr] items-center gap-3">
                    <Checkbox checked={Boolean(range)} onChange={(v) => setWeekly(d, v ? { start: '09:00', end: '19:00' } : null)} label={t(`catalog.weekdays.${d}`)} />
                    {range ? (
                      <>
                        <TextInput type="time" value={range.start} aria-label={t('catalog.service.from')} onChange={(e) => setWeekly(d, { ...range, start: e.target.value })} />
                        <TextInput type="time" value={range.end} aria-label={t('catalog.service.to')} onChange={(e) => setWeekly(d, { ...range, end: e.target.value })} />
                      </>
                    ) : (
                      <span className="col-span-2 text-body text-muted">{t('catalog.service.unavailable')}</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </SectionCard>

      {/* Portfolio images */}
      <SectionCard
        id="images"
        title={t('catalog.service.imagesTitle')}
        subtitle={
          <>
            {t('catalog.service.imagesSubtitle')} <LearnMore topic="Portfolio images">{t('catalog.common.learnMore')}</LearnMore>
          </>
        }
      >
        <ImageUploader images={form.images} onChange={(images) => set({ images })} />
      </SectionCard>

      {/* Forms */}
      <SectionCard
        id="forms"
        title={t('catalog.forms.title')}
        subtitle={
          <>
            {t('catalog.forms.subtitle')} <LearnMore topic="Forms">{t('catalog.common.learnMore')}</LearnMore>
          </>
        }
      >
        {form.formIds.length > 0 && (
          <div className="mb-4">
            <div className="grid grid-cols-[1fr_1fr_40px] border-b border-line pb-3 text-body-strong text-ink">
              <span>{t('catalog.forms.name')}</span>
              <span>{t('catalog.forms.policy')}</span>
              <span />
            </div>
            {form.formIds.map((fid) => {
              const f = formTemplates.find((x) => x.id === fid)
              if (!f) return null
              return (
                <div key={fid} className="grid grid-cols-[1fr_1fr_40px] items-center border-b border-line py-3 last:border-0">
                  <span className="flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-md border border-line">
                      <FileText size={20} aria-hidden />
                    </span>
                    <span>
                      <span className="block text-body-lg text-ink">{f.name}</span>
                      <span className={f.status === 'active' ? 'text-small text-success' : 'text-small text-warning'}>{f.status === 'active' ? t('catalog.common.active') : t('catalog.common.inactive')}</span>
                    </span>
                  </span>
                  <span className="text-body text-ink">{f.frequency === 'every' ? t('catalog.forms.every') : t('catalog.forms.once')}</span>
                  <Menu groups={[{ items: [{ label: t('catalog.common.remove'), danger: true, onSelect: () => set({ formIds: form.formIds.filter((x) => x !== fid) }) }] }]} />
                </div>
              )
            })}
          </div>
        )}
        <Button icon={<Plus size={16} />} onClick={() => setFormsOpen(true)}>
          {t('catalog.common.add')}
        </Button>
      </SectionCard>

      {/* Commissions */}
      <SectionCard id="commissions" title={t('catalog.service.commissionTitle')} titleExtra={<OnOffChip on={form.commissionEnabled} />} subtitle={t('catalog.service.commissionSubtitle')} action={<Switch checked={form.commissionEnabled} onChange={(v) => set({ commissionEnabled: v })} />}>
        {form.commissionEnabled && (
          <>
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-sunken p-2">
              <label className="relative block flex-1">
                <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
                <input value={commissionQuery} onChange={(e) => setCommissionQuery(e.target.value)} placeholder={t('catalog.service.teamSearch')} aria-label={t('catalog.service.teamSearch')} className="h-10 w-full max-w-xs rounded-full border border-line-strong bg-surface pl-10 pr-4 text-body outline-none focus:border-primary" />
              </label>
              <Menu
                trigger={({ open, toggle }) => (
                  <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={toggle} className="inline-flex h-10 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-body-strong text-ink hover:bg-sunken">
                    {t('catalog.common.actions')}
                    <ChevronDown size={16} aria-hidden />
                  </button>
                )}
                groups={[{ items: [{ label: t('catalog.service.manageCommissions'), onSelect: () => navigate('/team/team-members') }, { label: t('catalog.service.assignMembers'), onSelect: () => document.getElementById('sec-team')?.scrollIntoView({ behavior: 'smooth' }) }] }]}
              />
            </div>
            {commissionMembers.filter((m) => m.commission.enabled).length === 0 ? (
              <EmptyState icon={<Users size={24} />} title={t('catalog.service.noCommissionsTitle')} body={t('catalog.service.noCommissionsBody')} />
            ) : (
              <div className="divide-y divide-line">
                {commissionMembers
                  .filter((m) => m.commission.enabled)
                  .map((m) => (
                    <div key={m.id} className="flex items-center gap-3 py-3">
                      <Avatar name={`${m.firstName} ${m.lastName}`} color={m.color} size={36} />
                      <span className="flex-1 text-body text-ink">
                        {m.firstName} {m.lastName}
                      </span>
                      <Chip tone="primary">{t('catalog.service.commissionRate', { rate: m.commission.serviceRate })}</Chip>
                    </div>
                  ))}
              </div>
            )}
          </>
        )}
      </SectionCard>

      {/* Settings */}
      <SectionCard id="settings" title={t('catalog.service.generalSettings')}>
        <Checkbox checked={form.patchTestRequired} onChange={(v) => set({ patchTestRequired: v })} label={t('catalog.service.patchTest')} hint={t('catalog.service.patchTestHint')} />
      </SectionCard>
      <SectionCard title={t('catalog.service.notifications')}>
        <div className="flex flex-col gap-5">
          <Checkbox checked={form.aftercare !== undefined} onChange={(v) => set({ aftercare: v ? '' : undefined })} label={t('catalog.service.aftercare')} hint={t('catalog.service.aftercareHint')} />
          {form.aftercare !== undefined && (
            <Field label={t('catalog.service.aftercareText')} counter={{ value: form.aftercare.length, max: 1000 }} className="pl-8">
              {(fid) => <TextArea id={fid} value={form.aftercare} maxLength={1000} placeholder={t('catalog.service.aftercarePlaceholder')} onChange={(e) => set({ aftercare: e.target.value })} />}
            </Field>
          )}
          <Checkbox checked={rebook.on} onChange={(v) => setRebook({ ...rebook, on: v })} label={t('catalog.service.rebook')} hint={t('catalog.service.rebookHint')} />
          {rebook.on && (
            <div className="grid grid-cols-2 gap-3 pl-8">
              <TextInput type="number" min={1} max={104} value={rebook.value} aria-label={t('catalog.service.rebookValue')} onChange={(e) => setRebook({ ...rebook, value: Math.max(1, Number(e.target.value) || 1) })} />
              <Select
                value={rebook.unit}
                aria-label={t('catalog.service.rebookUnit')}
                onChange={(e) => setRebook({ ...rebook, unit: e.target.value as 'weeks' | 'days' })}
                options={[
                  { value: 'weeks', label: t('catalog.service.weeksAfter') },
                  { value: 'days', label: t('catalog.service.daysAfter') },
                ]}
              />
            </div>
          )}
        </div>
      </SectionCard>
      <SectionCard title={t('catalog.service.advancedSettings')}>
        <div className="flex max-w-xl flex-col gap-5">
          <Field label={<>{t('catalog.service.salesTax')} <span className="font-normal text-muted">{t('catalog.service.includedInPrice')}</span></>} hint={t('catalog.service.salesTaxHint')}>
            {(fid) => (
              <Select
                id={fid}
                value={form.taxRateId ?? ''}
                onChange={(e) => set({ taxRateId: e.target.value || null })}
                options={[{ value: '', label: t('catalog.common.noTax') }, ...settings.taxRates.map((r) => ({ value: r.id, label: `${r.name} (${r.rate}%)` }))]}
              />
            )}
          </Field>
          <Field label={t('catalog.service.cost')} hint={costMode === 'percent' && costValue !== '' ? t('catalog.service.costHint', { amount: money(round2((form.price * costValue) / 100)) }) : undefined}>
            {(fid) => (
              <div className="flex gap-2">
                <Segmented
                  value={costMode}
                  onChange={setCostMode}
                  items={[
                    { value: 'amount', label: '€' },
                    { value: 'percent', label: '%' },
                  ]}
                />
                <TextInput id={fid} type="number" min={0} step="0.01" value={costValue} suffix={costMode === 'percent' ? '%' : undefined} prefix={costMode === 'amount' ? '€' : undefined} onChange={(e) => setCostValue(e.target.value === '' ? '' : Number(e.target.value))} className="flex-1" />
              </div>
            )}
          </Field>
          <Field label={t('catalog.service.sku')} counter={{ value: (form.sku ?? '').length, max: 20 }}>
            {(fid) => <TextInput id={fid} value={form.sku ?? ''} maxLength={20} placeholder="ABC-12345-H-SH" onChange={(e) => set({ sku: e.target.value })} />}
          </Field>
        </div>
      </SectionCard>

      <VariantModal variant={variantEdit?.variant ?? null} isBase={variantEdit?.isBase} onClose={() => setVariantEdit(null)} onSave={saveVariant} />
      <AdvancedPricingModal open={advancedOpen} onClose={() => setAdvancedOpen(false)} service={form} locations={locations} members={assignedMembers} onApply={(rows) => set({ advancedPricing: rows })} />
      <CategoryModal open={categoryModal} onClose={() => setCategoryModal(false)} onSaved={(c) => set({ categoryId: c.id })} />
      <AddOnGroupModal
        group={groupEdit}
        onClose={() => setGroupEdit(null)}
        onSave={(g) => {
          set({ addOnGroups: form.addOnGroups.some((x) => x.id === g.id) ? form.addOnGroups.map((x) => (x.id === g.id ? g : x)) : [...form.addOnGroups, g] })
          setGroupEdit(null)
        }}
      />
      <FormsPickerModal open={formsOpen} onClose={() => setFormsOpen(false)} templates={formTemplates} selected={form.formIds} onAdd={(ids) => set({ formIds: [...form.formIds, ...ids] })} />
    </EditorFrame>
  )
}

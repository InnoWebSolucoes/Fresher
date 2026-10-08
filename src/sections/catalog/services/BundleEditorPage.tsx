import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button, EmptyState, Field, LearnMore, Menu, Modal, SearchInput, Select, Switch, TextInput, toast, usePageLoading } from '@/components/ui'
import { useDb } from '@/store/db'
import { durationLong } from '@/lib/time'
import { money, round2 } from '@/lib/format'
import { PALETTE } from '@/styles/palette'
import type { Bundle, ExtraTime, ID, Service } from '@/types'
import { saveBundle, type BundleInput } from '@/api/catalog'
import { readBundleExtras } from '../catalogExt'
import { bundleBasePrice, bundleDuration, bundlePrice, generateDescription, totalExtra } from '../lib'
import { AiDescription, CategoryModal, DotSelect, EditorFrame, ImageUploader, OnOffChip, SectionCard } from '../ui'
import { ExtraTimeRows } from './serviceParts'

/** New / edit bundle (catalog.md §1.3). */
export function BundleEditorPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const [params] = useSearchParams()
  const bundles = useDb((s) => s.bundles)
  const services = useDb((s) => s.services)
  const categories = useDb((s) => s.serviceCategories)

  const existing = id ? bundles.find((b) => b.id === id) : undefined
  const duplicateOf = params.get('duplicate')
  const sourceId = existing?.id ?? duplicateOf ?? ''

  const initial = useMemo<BundleInput | null>(() => {
    const source = existing ?? (duplicateOf ? bundles.find((b) => b.id === duplicateOf) : undefined)
    if (source) {
      const { id: _id, ...rest } = source
      void _id
      return existing ? { ...rest } : { ...rest, name: t('catalog.common.copyOf', { name: source.name }), archived: false }
    }
    if (id) return null
    return { name: '', categoryId: params.get('category') ?? [...categories].filter((c) => !c.archived).sort((a, b) => a.order - b.order)[0]?.id ?? '', description: '', serviceIds: [], schedule: 'sequence', priceType: 'service', onlineBooking: true, availableFor: 'all', archived: false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, duplicateOf])

  const [form, setForm] = useState<BundleInput | null>(initial)
  const [extra, setExtra] = useState<Record<ID, ExtraTime[]>>(() => ({ ...readBundleExtras(sourceId).extraTime }))
  const [images, setImages] = useState<string[]>(() => [...readBundleExtras(sourceId).images])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [extraFor, setExtraFor] = useState<Service | null>(null)
  const [categoryModal, setCategoryModal] = useState(false)
  const loading = usePageLoading(300)

  const close = () => navigate('/catalogue/services')
  if (!form) {
    return (
      <EditorFrame title={t('catalog.bundle.editTitle')} onClose={close} actions={null}>
        <EmptyState title={t('catalog.common.notFoundTitle')} body={t('catalog.common.notFoundBody')} action={<Button onClick={close}>{t('catalog.menu.title')}</Button>} />
      </EditorFrame>
    )
  }
  const set = (patch: Partial<BundleInput>) => setForm({ ...form, ...patch })
  const included = form.serviceIds.map((sid) => services.find((s) => s.id === sid)).filter((s): s is Service => Boolean(s))
  const base = bundleBasePrice(form, services)
  const total = bundlePrice(form, services)
  const duration = bundleDuration(form, services, extra)
  const hasServices = included.length > 0

  const move = (index: number, delta: number) => {
    const next = [...form.serviceIds]
    const [item] = next.splice(index, 1)
    next.splice(index + delta, 0, item)
    set({ serviceIds: next })
  }

  const submit = async () => {
    const next: Record<string, string> = {}
    if (!form.name.trim()) next.name = t('catalog.bundle.nameRequired')
    if (!form.categoryId) next.category = t('catalog.service.categoryRequired')
    if (form.serviceIds.length < 2) next.services = t('catalog.bundle.servicesRequired')
    if (form.priceType === 'custom' && !(form.price !== undefined && form.price >= 0)) next.price = t('catalog.service.priceRequired')
    if (form.priceType === 'percentage' && !(form.discountPct !== undefined && form.discountPct > 0 && form.discountPct <= 100)) next.discount = t('catalog.bundle.discountRequired')
    setErrors(next)
    if (Object.keys(next).length) return
    setSaving(true)
    await saveBundle(existing?.id ?? null, { ...form, name: form.name.trim() }, { extraTime: Object.fromEntries(Object.entries(extra).filter(([sid]) => form.serviceIds.includes(sid))), images })
    setSaving(false)
    toast(existing ? t('catalog.toasts.bundleUpdated') : t('catalog.toasts.bundleCreated'))
    navigate('/catalogue/services')
  }

  const priceTypeOptions = [
    { value: 'service', label: t('catalog.bundle.priceService') },
    { value: 'custom', label: t('catalog.bundle.priceCustom'), disabled: !hasServices },
    { value: 'percentage', label: t('catalog.bundle.pricePercentage'), disabled: !hasServices },
    { value: 'free', label: t('catalog.bundle.priceFree') },
  ]

  return (
    <EditorFrame
      title={existing ? t('catalog.bundle.editTitle') : t('catalog.bundle.addTitle')}
      onClose={close}
      loading={loading}
      maxWidth="max-w-3xl"
      actions={
        <Button variant="primary" loading={saving} onClick={() => void submit()}>
          {t('catalog.common.save')}
        </Button>
      }
    >
      <SectionCard title={t('catalog.bundle.basicTitle')}>
        <div className="flex flex-col gap-5">
          <Field label={t('catalog.bundle.name')} error={errors.name}>
            {(fid) => <TextInput id={fid} value={form.name} maxLength={255} invalid={Boolean(errors.name)} placeholder={t('catalog.bundle.namePlaceholder')} onChange={(e) => set({ name: e.target.value })} />}
          </Field>
          <Field label={t('catalog.bundle.category')} error={errors.category}>
            {(fid) => (
              <DotSelect
                id={fid}
                value={form.categoryId}
                placeholder={t('catalog.service.selectCategory')}
                options={[...categories].filter((c) => !c.archived || c.id === form.categoryId).sort((a, b) => a.order - b.order).map((c) => ({ value: c.id, label: c.name, color: c.color }))}
                onChange={(v) => set({ categoryId: v })}
                footer={{ label: t('catalog.menu.addCategory'), onClick: () => setCategoryModal(true) }}
              />
            )}
          </Field>
          <Field label={t('catalog.service.description')} optional counter={{ value: form.description.length, max: 1000 }}>
            {(fid) => (
              <AiDescription
                id={fid}
                value={form.description}
                max={1000}
                placeholder={t('catalog.bundle.descriptionPlaceholder')}
                onChange={(v) => set({ description: v })}
                generate={() => generateDescription(form.name || included.map((s) => s.name).join(' & '), categories.find((c) => c.id === form.categoryId)?.name, included[0]?.treatmentType ?? '', duration || 60)}
              />
            )}
          </Field>
        </div>
      </SectionCard>

      <SectionCard title={t('catalog.bundle.servicesTitle')} subtitle={t('catalog.bundle.servicesSubtitle')}>
        <div className="flex flex-col gap-3">
          {included.map((s, i) => {
            const color = PALETTE[categories.find((c) => c.id === s.categoryId)?.color ?? 'blue'].edge
            const ex = extra[s.id] ?? s.extraTime
            return (
              <div key={`${s.id}-${i}`} className="flex items-center gap-4">
                <span className="h-14 w-1 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-body-lg text-ink">{s.name}</p>
                  <p className="text-body text-muted">
                    {durationLong(s.durationMin + totalExtra(ex))}
                    {totalExtra(ex) > 0 && ` · ${t('catalog.bundle.includesExtra', { time: durationLong(totalExtra(ex)) })}`}
                  </p>
                </div>
                <span className="text-body-lg text-ink">{money(s.price)}</span>
                <Menu
                  groups={[
                    { items: [{ label: t('catalog.extraTime.add'), onSelect: () => setExtraFor(s) }] },
                    {
                      items: [
                        { label: t('catalog.variant.moveUp'), disabled: i === 0, onSelect: () => move(i, -1) },
                        { label: t('catalog.variant.moveDown'), disabled: i === included.length - 1, onSelect: () => move(i, 1) },
                        { label: t('catalog.common.remove'), danger: true, onSelect: () => set({ serviceIds: form.serviceIds.filter((_, j) => j !== i) }) },
                      ],
                    },
                  ]}
                />
              </div>
            )
          })}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button icon={<Plus size={16} />} onClick={() => setPickerOpen(true)}>
              {t('catalog.bundle.addService')}
            </Button>
            {hasServices && (
              <span className="text-body text-muted">
                {t('catalog.bundle.totalDuration', { time: durationLong(duration) })} <span className="ml-2 text-body-lg text-ink">{money(base)}</span>
              </span>
            )}
          </div>
          {errors.services && <p className="text-small text-danger">{errors.services}</p>}
          <Field
            className="mt-3"
            label={t('catalog.bundle.schedule')}
            hint={
              <>
                {t('catalog.bundle.scheduleHint')} <LearnMore topic={t('catalog.menuFilters.bundles')}>{t('catalog.common.learnMore')}</LearnMore>
              </>
            }
          >
            {(fid) => (
              <Select
                id={fid}
                value={form.schedule}
                onChange={(e) => set({ schedule: e.target.value as Bundle['schedule'] })}
                options={[
                  { value: 'sequence', label: t('catalog.bundle.sequence') },
                  { value: 'parallel', label: t('catalog.bundle.parallel') },
                ]}
              />
            )}
          </Field>
        </div>
      </SectionCard>

      <SectionCard title={t('catalog.bundle.pricingTitle')}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t('catalog.service.priceType')} hint={!hasServices ? t('catalog.bundle.freeHint') : undefined}>
            {(fid) => <Select id={fid} value={form.priceType} options={priceTypeOptions} onChange={(e) => set({ priceType: e.target.value as Bundle['priceType'], price: e.target.value === 'custom' ? (form.price ?? base) : form.price })} />}
          </Field>
          {form.priceType === 'custom' && (
            <Field label={t('catalog.service.price')} error={errors.price} hint={form.price !== undefined && form.price < base ? t('catalog.bundle.savings', { amount: money(round2(base - form.price)) }) : undefined}>
              {(fid) => <TextInput id={fid} type="number" min={0} step="0.01" prefix="€" value={form.price ?? ''} onChange={(e) => set({ price: e.target.value === '' ? undefined : Number(e.target.value) })} />}
            </Field>
          )}
          {form.priceType === 'percentage' && (
            <Field label={t('catalog.bundle.discountValue')} error={errors.discount} hint={t('catalog.bundle.discountedBy', { amount: money(round2(base - total)) })}>
              {(fid) => <TextInput id={fid} type="number" min={0} max={100} suffix="%" value={form.discountPct ?? ''} onChange={(e) => set({ discountPct: e.target.value === '' ? undefined : Number(e.target.value) })} />}
            </Field>
          )}
          {form.priceType === 'service' && hasServices && <p className="self-end pb-3 text-body text-muted">{t('catalog.bundle.retailTotal', { amount: money(base) })}</p>}
        </div>
      </SectionCard>

      <SectionCard title={t('catalog.service.onlineTitle')} titleExtra={<OnOffChip on={form.onlineBooking} />} subtitle={t('catalog.bundle.onlineSubtitle')} action={<Switch checked={form.onlineBooking} onChange={(v) => set({ onlineBooking: v })} />}>
        <Field label={t('catalog.service.availableFor')}>
          {(fid) => (
            <Select
              id={fid}
              value={form.availableFor}
              disabled={!form.onlineBooking}
              onChange={(e) => set({ availableFor: e.target.value as Bundle['availableFor'] })}
              options={[
                { value: 'all', label: t('catalog.gender.all') },
                { value: 'female', label: t('catalog.gender.femaleBundle') },
                { value: 'male', label: t('catalog.gender.maleBundle') },
              ]}
            />
          )}
        </Field>
      </SectionCard>

      <SectionCard title={t('catalog.service.imagesTitle')} subtitle={t('catalog.service.imagesSubtitle')}>
        <ImageUploader images={images} onChange={setImages} />
      </SectionCard>

      <ServicePickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(s) => {
          set({ serviceIds: [...form.serviceIds, s.id] })
          setPickerOpen(false)
        }}
      />
      <BundleExtraTimeModal
        service={extraFor}
        value={extraFor ? (extra[extraFor.id] ?? extraFor.extraTime) : []}
        onClose={() => setExtraFor(null)}
        onApply={(v) => {
          if (extraFor) setExtra({ ...extra, [extraFor.id]: v })
          setExtraFor(null)
        }}
      />
      <CategoryModal open={categoryModal} onClose={() => setCategoryModal(false)} onSaved={(c) => set({ categoryId: c.id })} />
    </EditorFrame>
  )
}

/** "Services" picker: search, grouped by category (also used by booking sequence and memberships). */
export function ServicePickerModal({ open, onClose, onPick, exclude = [], title }: { open: boolean; onClose: () => void; onPick: (s: Service) => void; exclude?: ID[]; title?: string }) {
  const { t } = useTranslation()
  const services = useDb((s) => s.services)
  const categories = useDb((s) => s.serviceCategories)
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const groups = [...categories]
    .filter((c) => !c.archived)
    .sort((a, b) => a.order - b.order)
    .map((c) => ({
      category: c,
      items: services
        .filter((s) => s.categoryId === c.id && !s.archived && !exclude.includes(s.id) && (!q || s.name.toLowerCase().includes(q)))
        .sort((a, b) => a.order - b.order),
    }))
    .filter((g) => g.items.length)
  return (
    <Modal open={open} onClose={onClose} title={title ?? t('catalog.bundle.pickerTitle')} size="lg">
      <SearchInput value={query} onChange={setQuery} placeholder={t('catalog.bundle.pickerSearch')} />
      <div className="mt-4 flex flex-col gap-5 pb-4">
        {groups.length === 0 && <p className="py-8 text-center text-body text-muted">{t('catalog.common.noResults')}</p>}
        {groups.map((g) => (
          <div key={g.category.id}>
            <p className="mb-2 text-body-strong text-ink">{g.category.name}</p>
            <div className="flex flex-col gap-2">
              {g.items.map((s) => (
                <div key={s.id}>
                  <button type="button" onClick={() => onPick(s)} className="flex w-full items-center overflow-hidden rounded-lg border border-line bg-surface text-left hover:bg-sunken">
                    <span className="w-1.5 self-stretch" style={{ background: PALETTE[g.category.color].edge }} aria-hidden />
                    <span className="min-w-0 flex-1 px-4 py-3">
                      <span className="block text-body-lg text-ink">{s.name}</span>
                      <span className="block text-body text-muted">{durationLong(s.durationMin)}</span>
                    </span>
                    <span className="px-4 text-body-lg text-ink">{money(s.price)}</span>
                  </button>
                  {s.variants.length > 0 && <p className="mt-1 pl-4 text-small text-muted">{s.variants.map((v) => `${v.name} ⋅ ${durationLong(v.durationMin)}`).join(' · ')}</p>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}

function BundleExtraTimeModal({ service, value, onClose, onApply }: { service: Service | null; value: ExtraTime[]; onClose: () => void; onApply: (v: ExtraTime[]) => void }) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<ExtraTime[]>(value)
  const [last, setLast] = useState<Service | null>(null)
  if (service !== last) {
    setLast(service)
    setRows(value)
  }
  if (!service) return null
  return (
    <Modal
      open
      onClose={onClose}
      title={t('catalog.bundle.extraTitle', { name: service.name })}
      footer={
        <>
          <Button variant="link" className="mr-auto" onClick={() => setRows(service.extraTime)}>
            {t('catalog.bundle.resetDefault')}
          </Button>
          <Button onClick={onClose}>{t('catalog.common.cancel')}</Button>
          <Button variant="primary" onClick={() => onApply(rows)}>
            {t('catalog.common.apply')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('catalog.extraTime.type')}>{(fid) => <TextInput id={fid} disabled value={t('catalog.extraTime.servicing')} />}</Field>
          <Field label={t('catalog.extraTime.duration')}>{(fid) => <TextInput id={fid} disabled value={durationLong(service.durationMin)} />}</Field>
        </div>
        <ExtraTimeRows value={rows} onChange={setRows} />
        <p className="text-body text-muted">{t('catalog.bundle.totalDuration', { time: durationLong(service.durationMin + totalExtra(rows)) })}</p>
      </div>
    </Modal>
  )
}

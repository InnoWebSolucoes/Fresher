import clsx from 'clsx'
import { ArrowLeft, BadgePercent, CalendarCheck, Check, Euro, Layers, Package, Plus, ShoppingBag, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button, Checkbox, EmptyState, Field, Menu, Modal, MoneyInput, SearchInput, Select, TextArea, TextInput, toast } from '@/components/ui'
import { useDb } from '@/store/db'
import { uid } from '@/lib/ids'
import { money } from '@/lib/format'
import type { ID, PackageBenefit, PackageBenefitType, PackageDef } from '@/types'
import { savePackage, type PackageInput } from '@/api/catalog'
import { PACKAGE_THEMES, themeOf } from '../lib'
import { CategoryModal, DotSelect, EditorFrame, SectionCard, Stepper } from '../ui'

type SectionId = 'basic' | 'settings'

/** Add / edit package (catalog.md §2). */
export function PackageEditorPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const [params] = useSearchParams()
  const packages = useDb((s) => s.packages)
  const categories = useDb((s) => s.serviceCategories)
  const services = useDb((s) => s.services)
  const products = useDb((s) => s.products)
  const settings = useDb((s) => s.settings)
  const existing = id ? packages.find((p) => p.id === id) : undefined
  const duplicateOf = params.get('duplicate')

  const initial = useMemo<PackageInput | null>(() => {
    const source = existing ?? (duplicateOf ? packages.find((p) => p.id === duplicateOf) : undefined)
    if (source) {
      const { id: _id, order: _order, ...rest } = structuredClone(source)
      void _id
      void _order
      return existing ? rest : { ...rest, name: t('catalog.common.copyOf', { name: source.name }), archived: false, benefits: rest.benefits.map((b) => ({ ...b, id: uid('pb') })) }
    }
    if (id) return null
    return { name: '', theme: PACKAGE_THEMES[0].name, categoryId: undefined, description: '', benefits: [], price: 0, expiresValue: 6, expiresUnit: 'months', onlineSale: true, giftable: true, terms: '', commission: true, taxRateId: null, archived: false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, duplicateOf])

  const [form, setForm] = useState<PackageInput | null>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [wizard, setWizard] = useState<{ benefit?: PackageBenefit } | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 300)
    return () => clearTimeout(timer)
  }, [])

  const close = () => navigate('/catalogue/packages')
  if (!form) {
    return (
      <EditorFrame title={t('catalog.packageEditor.editTitle')} onClose={close} actions={null}>
        <EmptyState title={t('catalog.common.notFoundTitle')} body={t('catalog.common.notFoundBody')} action={<Button onClick={close}>{t('catalog.packages.title')}</Button>} />
      </EditorFrame>
    )
  }
  const set = (patch: Partial<PackageInput>) => setForm({ ...form, ...patch })
  const setBenefit = (b: PackageBenefit) => set({ benefits: form.benefits.some((x) => x.id === b.id) ? form.benefits.map((x) => (x.id === b.id ? b : x)) : [...form.benefits, b] })

  const worth = form.benefits.reduce((sum, b) => {
    if (b.quantity === 'unlimited') return sum
    if (b.type === 'service' || b.type === 'service_group') return sum + b.quantity * Math.max(0, ...(b.serviceIds ?? []).map((sid) => services.find((s) => s.id === sid)?.price ?? 0))
    if (b.type === 'product' || b.type === 'product_group') return sum + b.quantity * Math.max(0, ...(b.productIds ?? []).map((pid) => products.find((p) => p.id === pid)?.retailPrice ?? 0))
    return sum
  }, 0)

  const submit = async () => {
    const next: Record<string, string> = {}
    if (!form.name.trim()) next.name = t('catalog.packageEditor.nameRequired')
    if (!form.benefits.length) next.benefits = t('catalog.packageEditor.benefitsRequired')
    if (!(form.price >= 0)) next.price = t('catalog.service.priceRequired')
    if (!(form.expiresValue >= 1)) next.expires = t('catalog.packageEditor.expiresRequired')
    setErrors(next)
    if (Object.keys(next).length) return
    setSaving(true)
    await savePackage(existing?.id ?? null, { ...form, name: form.name.trim() })
    setSaving(false)
    toast(existing ? t('catalog.toasts.packageUpdated') : t('catalog.toasts.packageCreated'))
    navigate('/catalogue/packages')
  }

  if (wizard) {
    return (
      <BenefitWizard
        benefit={wizard.benefit}
        onClose={() => setWizard(null)}
        onApply={(b) => {
          setBenefit(b)
          setWizard(null)
        }}
      />
    )
  }

  const typeHeading = (type: PackageBenefitType) => (type.startsWith('service') ? t('catalog.benefits.services') : type.startsWith('product') ? t('catalog.benefits.products') : t('catalog.benefits.discounts'))
  const benefitName = (b: PackageBenefit) => {
    if (b.type === 'service') return services.find((s) => s.id === b.serviceIds?.[0])?.name ?? '-'
    if (b.type === 'service_group') return t('catalog.benefits.groupOf', { count: b.serviceIds?.length ?? 0, names: (b.serviceIds ?? []).map((sid) => services.find((s) => s.id === sid)?.name).filter(Boolean).slice(0, 3).join(', ') })
    if (b.type === 'product') return products.find((p) => p.id === b.productIds?.[0])?.name ?? '-'
    if (b.type === 'product_group') return t('catalog.benefits.groupOfProducts', { count: b.productIds?.length ?? 0, names: (b.productIds ?? []).map((pid) => products.find((p) => p.id === pid)?.name).filter(Boolean).slice(0, 3).join(', ') })
    if (b.type === 'amount_discount') return t('catalog.benefits.amountOff', { amount: money(b.value ?? 0) })
    return t('catalog.benefits.percentOff', { value: b.value ?? 0 })
  }
  const benefitIcon = (type: PackageBenefitType) => (type.startsWith('service') ? <CalendarCheck size={20} aria-hidden /> : type.startsWith('product') ? <ShoppingBag size={20} aria-hidden /> : <BadgePercent size={20} aria-hidden />)

  return (
    <EditorFrame<SectionId>
      title={existing ? t('catalog.packageEditor.editTitle') : t('catalog.packageEditor.addTitle')}
      onClose={close}
      loading={loading}
      nav={{
        groups: [
          {
            items: [
              { value: 'basic', label: t('catalog.service.nav.basic') },
              { value: 'settings', label: t('catalog.service.nav.settings') },
            ],
          },
        ],
      }}
      actions={
        <Button variant="primary" loading={saving} onClick={() => void submit()}>
          {t('catalog.common.save')}
        </Button>
      }
    >
      <SectionCard id="basic" title={t('catalog.packageEditor.detailsTitle')}>
        <div className="flex flex-col gap-5">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label={t('catalog.packageEditor.name')} error={errors.name}>
              {(fid) => (
                <div className="flex gap-2">
                  <button type="button" onClick={() => setThemeOpen(true)} aria-label={t('catalog.packageEditor.theme')} title={t('catalog.packageEditor.theme')} className="flex h-11 w-12 shrink-0 items-center justify-center rounded-sm border border-line-strong bg-surface">
                    <span className="h-6 w-8 rounded-xs" style={{ background: themeOf(form.theme).gradient }} />
                  </button>
                  <TextInput id={fid} value={form.name} maxLength={100} invalid={Boolean(errors.name)} placeholder={t('catalog.packageEditor.namePlaceholder')} onChange={(e) => set({ name: e.target.value })} className="flex-1" />
                </div>
              )}
            </Field>
            <Field label={t('catalog.packageEditor.category')} hint={t('catalog.packageEditor.categoryHint')}>
              {(fid) => (
                <DotSelect
                  id={fid}
                  value={form.categoryId ?? ''}
                  options={[{ value: '', label: t('catalog.packageEditor.noCategory') }, ...[...categories].sort((a, b) => a.order - b.order).map((c) => ({ value: c.id, label: c.name, color: c.color }))]}
                  onChange={(v) => set({ categoryId: v || undefined })}
                  footer={{ label: t('catalog.packageEditor.createCategory'), onClick: () => setCategoryOpen(true) }}
                />
              )}
            </Field>
          </div>
          <Field label={t('catalog.service.description')} optional counter={{ value: form.description.length, max: 400 }}>
            {(fid) => <TextArea id={fid} value={form.description} maxLength={400} onChange={(e) => set({ description: e.target.value })} />}
          </Field>
        </div>
      </SectionCard>

      <SectionCard title={t('catalog.benefits.title')} subtitle={t('catalog.benefits.subtitle')}>
        {form.benefits.length === 0 ? (
          <EmptyState icon={<Layers size={24} />} title={t('catalog.benefits.emptyTitle')} body={errors.benefits} action={<Button icon={<Plus size={16} />} onClick={() => setWizard({})}>{t('catalog.benefits.add')}</Button>} />
        ) : (
          <div className="flex flex-col gap-3">
            {form.benefits.map((b) => (
              <div key={b.id} className="rounded-lg border border-line p-4">
                <div className="mb-2 flex items-center justify-between gap-3 text-body-strong text-ink">
                  <span>{typeHeading(b.type)}</span>
                  {b.type.endsWith('discount') ? <span>{t('catalog.benefits.uses')}</span> : <span>{b.type.startsWith('service') ? t('catalog.benefits.sessions') : t('catalog.benefits.quantity')}</span>}
                </div>
                <div className="flex flex-wrap items-center gap-3 md:flex-nowrap">
                  <span className={clsx('flex h-12 w-12 shrink-0 items-center justify-center rounded-md', b.type.startsWith('service') ? 'bg-success-subtle text-success' : b.type.startsWith('product') ? 'bg-primary-subtle text-primary' : 'bg-accent-subtle text-warning')}>{benefitIcon(b.type)}</span>
                  <span className="min-w-0 flex-1 text-body-lg text-ink max-md:basis-[calc(100%-60px)]">{benefitName(b)}</span>
                  {b.quantity === 'unlimited' ? <span className="chip bg-sunken text-ink max-md:ml-auto">{t('catalog.benefits.unlimited')}</span> : <Stepper className="max-md:ml-auto" value={b.quantity} min={1} max={999} onChange={(q) => setBenefit({ ...b, quantity: q })} />}
                  <Menu
                    groups={[
                      {
                        items: [
                          { label: t('catalog.common.edit'), onSelect: () => setWizard({ benefit: b }) },
                          b.quantity === 'unlimited' ? { label: t('catalog.benefits.setLimited'), onSelect: () => setBenefit({ ...b, quantity: 1 }) } : { label: t('catalog.benefits.setUnlimited'), onSelect: () => setBenefit({ ...b, quantity: 'unlimited' }) },
                          { label: t('catalog.common.remove'), danger: true, onSelect: () => set({ benefits: form.benefits.filter((x) => x.id !== b.id) }) },
                        ],
                      },
                    ]}
                  />
                </div>
              </div>
            ))}
            <div>
              <Button icon={<Plus size={16} />} onClick={() => setWizard({})}>
                {t('catalog.benefits.add')}
              </Button>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title={t('catalog.packageEditor.pricingTitle')}>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label={t('catalog.service.price')} error={errors.price} hint={worth > form.price ? t('catalog.packageEditor.saveUpTo', { amount: money(worth - form.price) }) : undefined}>
            {(fid) => <MoneyInput id={fid} value={form.price} placeholder="0" onChange={(v) => set({ price: v === '' ? 0 : v })} />}
          </Field>
          <Field label={t('catalog.packageEditor.expiresAfter')} error={errors.expires}>
            {(fid) => (
              <div className="grid grid-cols-2 gap-3">
                <TextInput id={fid} type="number" min={1} value={form.expiresValue} onChange={(e) => set({ expiresValue: Math.max(0, Number(e.target.value) || 0) })} />
                <Select
                  value={form.expiresUnit}
                  aria-label={t('catalog.packageEditor.expiresUnit')}
                  onChange={(e) => set({ expiresUnit: e.target.value as PackageDef['expiresUnit'] })}
                  options={(['days', 'weeks', 'months', 'years'] as const).map((u) => ({ value: u, label: t(`catalog.units.${u}`) }))}
                />
              </div>
            )}
          </Field>
        </div>
      </SectionCard>

      <SectionCard id="settings" title={t('catalog.service.nav.settings')}>
        <div className="flex flex-col gap-5">
          <Checkbox checked={form.onlineSale} onChange={(v) => set({ onlineSale: v })} label={t('catalog.packageEditor.online')} hint={t('catalog.packageEditor.onlineHint')} />
          <Checkbox checked={form.giftable} onChange={(v) => set({ giftable: v })} label={t('catalog.packageEditor.gift')} hint={t('catalog.packageEditor.giftHint')} />
          <Field label={t('catalog.packageEditor.terms')} optional counter={{ value: form.terms.length, max: 3000 }}>
            {(fid) => <TextArea id={fid} value={form.terms} maxLength={3000} placeholder={t('catalog.packageEditor.termsPlaceholder')} onChange={(e) => set({ terms: e.target.value })} />}
          </Field>
        </div>
      </SectionCard>
      <SectionCard title={t('catalog.packageEditor.salesSettings')}>
        <div className="flex max-w-xl flex-col gap-5">
          <Checkbox checked={form.commission} onChange={(v) => set({ commission: v })} label={t('catalog.packageEditor.commission')} hint={t('catalog.packageEditor.commissionHint')} />
          <Field label={<>{t('catalog.service.salesTax')} <span className="font-normal text-muted">{t('catalog.service.includedInPrice')}</span></>}>
            {(fid) => <Select id={fid} value={form.taxRateId ?? ''} onChange={(e) => set({ taxRateId: e.target.value || null })} options={[{ value: '', label: t('catalog.common.noTax') }, ...settings.taxRates.map((r) => ({ value: r.id, label: `${r.name} (${r.rate}%)` }))]} />}
          </Field>
        </div>
      </SectionCard>

      <ThemeModal open={themeOpen} value={form.theme} onClose={() => setThemeOpen(false)} onApply={(theme) => set({ theme })} />
      <CategoryModal open={categoryOpen} onClose={() => setCategoryOpen(false)} onSaved={(c) => set({ categoryId: c.id })} />
    </EditorFrame>
  )
}

function ThemeModal({ open, value, onClose, onApply }: { open: boolean; value: string; onClose: () => void; onApply: (theme: string) => void }) {
  const { t } = useTranslation()
  const [picked, setPicked] = useState(value)
  const [lastOpen, setLastOpen] = useState(false)
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) setPicked(value)
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('catalog.packageEditor.theme')}
      footer={
        <Button
          variant="primary"
          onClick={() => {
            onApply(picked)
            onClose()
          }}
        >
          {t('catalog.common.apply')}
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3 pb-2 sm:grid-cols-3" role="radiogroup">
        {PACKAGE_THEMES.map((th) => (
          <button key={th.name} type="button" role="radio" aria-checked={picked === th.name} aria-label={t(`catalog.themes.${th.key}`)} title={t(`catalog.themes.${th.key}`)} onClick={() => setPicked(th.name)} className={clsx('relative aspect-[16/10] rounded-md p-1 ring-offset-2', picked === th.name ? 'ring-2 ring-primary' : 'ring-1 ring-line')}>
            <span className="block h-full w-full rounded-sm" style={{ background: th.gradient }} />
            {picked === th.name && (
              <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-surface text-primary">
                <Check size={14} aria-hidden />
              </span>
            )}
          </button>
        ))}
      </div>
    </Modal>
  )
}

/** "Choose benefit type" → select items → Apply (full-screen wizard). */
function BenefitWizard({ benefit, onClose, onApply }: { benefit?: PackageBenefit; onClose: () => void; onApply: (b: PackageBenefit) => void }) {
  const { t } = useTranslation()
  const services = useDb((s) => s.services)
  const categories = useDb((s) => s.serviceCategories)
  const products = useDb((s) => s.products)
  const [type, setType] = useState<PackageBenefitType | null>(benefit?.type ?? null)
  const [serviceIds, setServiceIds] = useState<ID[]>(benefit?.serviceIds ?? [])
  const [productIds, setProductIds] = useState<ID[]>(benefit?.productIds ?? [])
  const [value, setValue] = useState<number | ''>(benefit?.value ?? '')
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const single = type === 'service' || type === 'product'

  const options: { section: string; items: { type: PackageBenefitType; icon: ReactNode; tone: string }[] }[] = [
    {
      section: t('catalog.benefits.services'),
      items: [
        { type: 'service', icon: <CalendarCheck size={22} aria-hidden />, tone: 'bg-success-subtle text-success' },
        { type: 'service_group', icon: <Layers size={22} aria-hidden />, tone: 'bg-success-subtle text-success' },
      ],
    },
    {
      section: t('catalog.benefits.products'),
      items: [
        { type: 'product', icon: <Package size={22} aria-hidden />, tone: 'bg-primary-subtle text-primary' },
        { type: 'product_group', icon: <ShoppingBag size={22} aria-hidden />, tone: 'bg-primary-subtle text-primary' },
      ],
    },
    {
      section: t('catalog.benefits.discounts'),
      items: [
        { type: 'amount_discount', icon: <Euro size={22} aria-hidden />, tone: 'bg-accent-subtle text-warning' },
        { type: 'percent_discount', icon: <BadgePercent size={22} aria-hidden />, tone: 'bg-accent-subtle text-warning' },
      ],
    },
  ]

  const valid = type === 'service' || type === 'service_group' ? serviceIds.length > 0 : type === 'product' || type === 'product_group' ? productIds.length > 0 : value !== '' && value > 0 && (type !== 'percent_discount' || value <= 100)
  const apply = () => {
    if (!type || !valid) return
    onApply({
      id: benefit?.id ?? uid('pb'),
      type,
      serviceIds: type.startsWith('service') ? serviceIds : undefined,
      productIds: type.startsWith('product') ? productIds : undefined,
      value: type.endsWith('discount') ? Number(value) : undefined,
      quantity: benefit?.quantity ?? 1,
    })
  }
  const toggle = (list: ID[], setList: (v: ID[]) => void, itemId: ID) => (single ? setList([itemId]) : setList(list.includes(itemId) ? list.filter((x) => x !== itemId) : [...list, itemId]))

  return (
    <div className="fixed inset-0 z-[75] flex flex-col bg-canvas">
      <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-3 md:gap-4 md:px-6">
        {type && !benefit ? (
          <Button icon={<ArrowLeft size={16} />} aria-label={t('catalog.common.back')} className="max-md:w-10 max-md:px-0" onClick={() => setType(null)}>
            <span className="hidden md:inline">{t('catalog.common.back')}</span>
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button icon={<X size={16} />} aria-label={t('catalog.common.close')} className="max-md:w-10 max-md:px-0" onClick={onClose}>
            <span className="hidden md:inline">{t('catalog.common.close')}</span>
          </Button>
          {type && (
            <Button variant="primary" disabled={!valid} onClick={apply}>
              {t('catalog.common.apply')}
            </Button>
          )}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-10">
          {!type ? (
            <>
              <h1 className="font-display text-title-1 text-ink md:text-display">{t('catalog.benefits.chooseType')}</h1>
              {options.map((o) => (
                <div key={o.section} className="mt-6 md:mt-8">
                  <h2 className="mb-3 text-body-lg font-semibold text-ink">{o.section}</h2>
                  <div className="flex flex-col gap-3">
                    {o.items.map((item) => (
                      <button key={item.type} type="button" onClick={() => setType(item.type)} className="flex items-center gap-4 rounded-lg border border-line bg-surface p-4 text-left hover:border-line-strong hover:shadow-sm md:p-5">
                        <span className={clsx('flex h-12 w-12 shrink-0 items-center justify-center rounded-md', item.tone)}>{item.icon}</span>
                        <span>
                          <span className="block text-body-strong text-ink">{t(`catalog.benefits.type.${item.type}`)}</span>
                          <span className="block text-body text-muted">{t(`catalog.benefits.typeHint.${item.type}`)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </>
          ) : type.endsWith('discount') ? (
            <>
              <h1 className="font-display text-title-1 text-ink md:text-display">{t(`catalog.benefits.type.${type}`)}</h1>
              <p className="mt-2 text-body text-muted md:text-body-lg">{t(`catalog.benefits.typeHint.${type}`)}</p>
              <Field className="mt-8 max-w-sm" label={t('catalog.benefits.discountValue')}>
                {(fid) => <TextInput id={fid} type="number" min={0} max={type === 'percent_discount' ? 100 : undefined} prefix={type === 'amount_discount' ? '€' : undefined} suffix={type === 'percent_discount' ? '%' : undefined} value={value} onChange={(e) => setValue(e.target.value === '' ? '' : Number(e.target.value))} />}
              </Field>
            </>
          ) : (
            <>
              <h1 className="font-display text-title-1 text-ink md:text-display">{type.startsWith('service') ? (single ? t('catalog.benefits.selectService') : t('catalog.benefits.selectServices')) : single ? t('catalog.benefits.selectProduct') : t('catalog.benefits.selectProducts')}</h1>
              <SearchInput className="mt-6" value={query} onChange={setQuery} placeholder={t('catalog.common.search')} />
              <div className="mt-6 flex flex-col gap-6">
                {type.startsWith('service')
                  ? [...categories]
                      .filter((c) => !c.archived)
                      .sort((a, b) => a.order - b.order)
                      .map((c) => {
                        const list = services.filter((s) => s.categoryId === c.id && !s.archived && (!q || s.name.toLowerCase().includes(q)))
                        if (!list.length) return null
                        return (
                          <div key={c.id}>
                            <h2 className="mb-2 text-body-strong text-ink">{c.name}</h2>
                            <div className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
                              {list.map((s) => (
                                <label key={s.id} className="flex cursor-pointer items-center gap-3 px-4 py-3">
                                  <input type={single ? 'radio' : 'checkbox'} name="benefit-service" checked={serviceIds.includes(s.id)} onChange={() => toggle(serviceIds, setServiceIds, s.id)} className="h-5 w-5 accent-[rgb(var(--primary))]" />
                                  <span className="min-w-0 flex-1 text-body-lg text-ink">{s.name}</span>
                                  <span className="text-body text-muted">{money(s.price)}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )
                      })
                  : (
                    <div className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
                      {products
                        .filter((p) => !p.archived && (!q || p.name.toLowerCase().includes(q)))
                        .map((p) => (
                          <label key={p.id} className="flex cursor-pointer items-center gap-3 px-4 py-3">
                            <input type={single ? 'radio' : 'checkbox'} name="benefit-product" checked={productIds.includes(p.id)} onChange={() => toggle(productIds, setProductIds, p.id)} className="h-5 w-5 accent-[rgb(var(--primary))]" />
                            <span className="min-w-0 flex-1 text-body-lg text-ink">{p.name}</span>
                            <span className="text-body text-muted">{money(p.retailPrice)}</span>
                          </label>
                        ))}
                    </div>
                  )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

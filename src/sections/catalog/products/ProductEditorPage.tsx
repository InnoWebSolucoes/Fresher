import { Plus, Wand2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, EmptyState, Field, LearnMore, MoneyInput, Select, Switch, TextArea, TextInput, confirm, toast, usePageLoading } from '@/components/ui'
import { useDb } from '@/store/db'
import { round2 } from '@/lib/format'
import type { Product } from '@/types'
import { saveProduct, type ProductInput } from '@/api/catalog'
import { MEASURES, generateSku } from '../lib'
import { DotSelect, EditorFrame, ImageUploader, SectionCard } from '../ui'
import { AddBrandModal, AddCategoryModal, AddSupplierModal } from './parts'

const P = 'catalog.products2'
type SectionId = 'basic' | 'pricing' | 'inventory' | 'photos'

interface Form {
  name: string
  barcode: string
  brandId: string
  measure: string
  amount: number | ''
  shortDescription: string
  description: string
  categoryId: string
  supplyPrice: number | ''
  retailSales: boolean
  retailPrice: number | ''
  markup: number | ''
  taxRateId: string
  commission: boolean
  skus: string[]
  supplierId: string
  trackStock: boolean
  stock: number | ''
  lowStockLevel: number | ''
  reorderQty: number | ''
  lowStockNotify: boolean
  images: string[]
}

const markupOf = (supply: number | '', retail: number | '') => (supply && retail !== '' && supply > 0 ? round2(((Number(retail) - supply) / supply) * 100) : '')

function toForm(p: Product | undefined, defaultTax: string | null): Form {
  return {
    name: p?.name ?? '',
    barcode: p?.barcode ?? '',
    brandId: p?.brandId ?? '',
    measure: p?.measure ?? 'ml',
    amount: p?.amount ?? '',
    shortDescription: p?.shortDescription ?? '',
    description: p?.description ?? '',
    categoryId: p?.categoryId ?? '',
    supplyPrice: p?.supplyPrice ?? '',
    retailSales: p?.retailSales ?? true,
    retailPrice: p?.retailPrice ?? '',
    markup: p ? markupOf(p.supplyPrice, p.retailPrice) : '',
    taxRateId: p ? (p.taxRateId ?? '') : (defaultTax ?? ''),
    commission: p?.commission ?? true,
    skus: p?.skus.length ? [...p.skus] : [''],
    supplierId: p?.supplierId ?? '',
    trackStock: p?.trackStock ?? true,
    stock: p?.stock ?? 0,
    lowStockLevel: p?.lowStockLevel ?? 5,
    reorderQty: p?.reorderQty ?? 10,
    lowStockNotify: p?.lowStockNotify ?? true,
    images: p?.images ?? [],
  }
}

const intOrZero = (v: number | '') => (v === '' ? 0 : Math.max(0, Math.round(v)))

/** Add / edit product (catalog.md §4). */
export function ProductEditorPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const loading = usePageLoading()
  const products = useDb((s) => s.products)
  const brands = useDb((s) => s.brands)
  const categories = useDb((s) => s.productCategories)
  const suppliers = useDb((s) => s.suppliers)
  const settings = useDb((s) => s.settings)
  const product = id ? products.find((p) => p.id === id) : undefined
  const [form, setForm] = useState<Form>(() => toForm(product, settings.taxDefaults.products))
  const [initial] = useState(() => JSON.stringify(toForm(product, settings.taxDefaults.products)))
  const [errors, setErrors] = useState<Partial<Record<'name' | 'retailPrice' | 'supplyPrice', string>>>({})
  const [saving, setSaving] = useState(false)
  const [modal, setModal] = useState<'brand' | 'category' | 'supplier' | null>(null)
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }))
  const dirty = JSON.stringify(form) !== initial
  const backTo = product ? `/catalogue/products?drawer=product&id=${product.id}` : '/catalogue/products'
  const close = async () => {
    if (dirty && !(await confirm({ title: t(`${P}.form.discardTitle`), body: t(`${P}.form.discardBody`), confirmLabel: t(`${P}.form.discard`), tone: 'danger' }))) return
    navigate(backTo)
  }

  const brandOptions = useMemo(() => [...brands].sort((a, b) => a.name.localeCompare(b.name)).map((b) => ({ value: b.id, label: b.name })), [brands])
  const categoryOptions = useMemo(() => [...categories].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.id, label: c.name })), [categories])
  const supplierOptions = useMemo(() => [...suppliers].sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({ value: s.id, label: s.name })), [suppliers])

  const setSupply = (supplyPrice: number | '') => set({ supplyPrice, markup: markupOf(supplyPrice, form.retailPrice) })
  const setRetail = (retailPrice: number | '') => set({ retailPrice, markup: markupOf(form.supplyPrice, retailPrice) })
  const setMarkup = (markup: number | '') => set({ markup, retailPrice: markup !== '' && form.supplyPrice !== '' ? round2(form.supplyPrice * (1 + markup / 100)) : form.retailPrice })

  const save = async () => {
    const next: typeof errors = {}
    if (!form.name.trim()) next.name = t(`${P}.form.nameRequired`)
    if (form.supplyPrice !== '' && form.supplyPrice < 0) next.supplyPrice = t(`${P}.form.pricePositive`)
    if (form.retailSales && (form.retailPrice === '' || form.retailPrice < 0)) next.retailPrice = t(`${P}.form.retailRequired`)
    setErrors(next)
    if (Object.keys(next).length) {
      toast(t(`${P}.form.fixErrors`), 'error')
      document.getElementById('sec-basic')?.scrollIntoView({ behavior: 'smooth' })
      return
    }
    const input: ProductInput = {
      name: form.name.trim(),
      barcode: form.barcode.trim() || undefined,
      brandId: form.brandId || undefined,
      measure: form.measure,
      amount: form.amount === '' ? undefined : form.amount,
      shortDescription: form.shortDescription.trim(),
      description: form.description.trim(),
      categoryId: form.categoryId || undefined,
      supplyPrice: form.supplyPrice === '' ? 0 : form.supplyPrice,
      retailSales: form.retailSales,
      retailPrice: form.retailPrice === '' ? 0 : form.retailPrice,
      taxRateId: form.taxRateId || null,
      commission: form.commission,
      skus: form.skus.map((s) => s.trim()).filter(Boolean),
      supplierId: form.supplierId || undefined,
      trackStock: form.trackStock,
      stock: intOrZero(form.stock),
      lowStockLevel: intOrZero(form.lowStockLevel),
      reorderQty: intOrZero(form.reorderQty),
      lowStockNotify: form.lowStockNotify,
      images: form.images,
      archived: product?.archived ?? false,
    }
    setSaving(true)
    const saved = await saveProduct(product?.id ?? null, input)
    setSaving(false)
    toast(product ? t(`${P}.toasts.productUpdated`) : t(`${P}.toasts.productCreated`))
    navigate(product ? `/catalogue/products?drawer=product&id=${saved.id}` : '/catalogue/products')
  }

  const title = product ? t(`${P}.form.editTitle`) : t(`${P}.form.addTitle`)
  if (id && !product && !loading) {
    return (
      <EditorFrame title={title} onClose={() => navigate('/catalogue/products')} actions={null}>
        <EmptyState title={t('catalog.common.notFoundTitle')} body={t('catalog.common.notFoundBody')} action={<Button onClick={() => navigate('/catalogue/products')}>{t(`${P}.title`)}</Button>} />
      </EditorFrame>
    )
  }

  const measureLabel = (m: string) => t(`${P}.measures.${m}`)
  const seedForSku = brands.find((b) => b.id === form.brandId)?.name || form.name

  return (
    <EditorFrame<SectionId>
      title={title}
      loading={loading}
      onClose={() => void close()}
      actions={
        <Button variant="primary" loading={saving} onClick={() => void save()}>
          {t('catalog.common.save')}
        </Button>
      }
      nav={{
        groups: [
          {
            items: [
              { value: 'basic', label: t(`${P}.form.basicInfo`) },
              { value: 'pricing', label: t(`${P}.form.pricing`) },
              { value: 'inventory', label: t(`${P}.form.inventory`) },
              { value: 'photos', label: t(`${P}.form.photos`) },
            ],
          },
        ],
      }}
    >
      <SectionCard id="basic" title={t(`${P}.form.basicInfo`)}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field className="sm:col-span-2" label={t(`${P}.form.name`)} error={errors.name}>
            {(fid) => <TextInput id={fid} value={form.name} maxLength={100} invalid={Boolean(errors.name)} placeholder={t(`${P}.form.namePlaceholder`)} onChange={(e) => set({ name: e.target.value })} />}
          </Field>
          <Field className="sm:col-span-2" label={t(`${P}.form.barcode`)} optional>
            {(fid) => <TextInput id={fid} value={form.barcode} maxLength={64} placeholder={t(`${P}.form.barcodePlaceholder`)} onChange={(e) => set({ barcode: e.target.value })} />}
          </Field>
          <Field className="sm:col-span-2" label={t(`${P}.form.brand`)}>
            {(fid) => <DotSelect id={fid} value={form.brandId} placeholder={t(`${P}.form.selectBrand`)} options={[{ value: '', label: t(`${P}.form.noBrand`) }, ...brandOptions]} onChange={(brandId) => set({ brandId })} footer={{ label: t(`${P}.addBrand`), onClick: () => setModal('brand') }} />}
          </Field>
          <Field label={t(`${P}.form.measure`)}>{(fid) => <Select id={fid} value={form.measure} onChange={(e) => set({ measure: e.target.value })} options={MEASURES.map((m) => ({ value: m, label: measureLabel(m) }))} />}</Field>
          <Field label={t(`${P}.form.amount`)}>
            {(fid) => <TextInput id={fid} type="number" min={0} step="any" inputMode="decimal" value={form.amount} disabled={form.measure === 'whole'} suffix={form.measure !== 'whole' ? form.measure : undefined} onChange={(e) => set({ amount: e.target.value === '' ? '' : Number(e.target.value) })} />}
          </Field>
          <Field className="sm:col-span-2" label={t(`${P}.form.shortDescription`)} counter={{ value: form.shortDescription.length, max: 100 }}>
            {(fid) => <TextInput id={fid} value={form.shortDescription} maxLength={100} onChange={(e) => set({ shortDescription: e.target.value })} />}
          </Field>
          <Field className="sm:col-span-2" label={t(`${P}.form.description`)} counter={{ value: form.description.length, max: 1000 }}>
            {(fid) => <TextArea id={fid} rows={4} value={form.description} maxLength={1000} onChange={(e) => set({ description: e.target.value })} />}
          </Field>
          <Field className="sm:col-span-2" label={t(`${P}.form.category`)}>
            {(fid) => <DotSelect id={fid} value={form.categoryId} placeholder={t(`${P}.form.selectCategory`)} options={[{ value: '', label: t(`${P}.form.noCategory`) }, ...categoryOptions]} onChange={(categoryId) => set({ categoryId })} footer={{ label: t(`${P}.addCategory`), onClick: () => setModal('category') }} />}
          </Field>
        </div>
      </SectionCard>

      <SectionCard id="pricing" title={t(`${P}.form.pricing`)}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t(`${P}.form.supplyPrice`)} error={errors.supplyPrice}>
            {(fid) => <MoneyInput id={fid} value={form.supplyPrice} aria-invalid={Boolean(errors.supplyPrice)} onChange={setSupply} />}
          </Field>
          <div className="sm:col-span-2">
            <Switch checked={form.retailSales} onChange={(retailSales) => set({ retailSales })} label={t(`${P}.form.retailSales`)} hint={t(`${P}.form.retailSalesHint`)} />
          </div>
          {form.retailSales && (
            <>
              <Field label={t(`${P}.form.retailPrice`)} error={errors.retailPrice}>
                {(fid) => <MoneyInput id={fid} value={form.retailPrice} aria-invalid={Boolean(errors.retailPrice)} onChange={setRetail} />}
              </Field>
              <Field label={t(`${P}.form.markup`)} hint={form.supplyPrice ? undefined : t(`${P}.form.markupHint`)}>
                {(fid) => <TextInput id={fid} type="number" step="any" inputMode="decimal" suffix="%" value={form.markup} disabled={!form.supplyPrice} onChange={(e) => setMarkup(e.target.value === '' ? '' : Number(e.target.value))} />}
              </Field>
              <Field label={t(`${P}.form.tax`)}>
                {(fid) => <Select id={fid} value={form.taxRateId} onChange={(e) => set({ taxRateId: e.target.value })} options={[{ value: '', label: t(`${P}.form.defaultNoTax`) }, ...settings.taxRates.map((r) => ({ value: r.id, label: `${r.name} (${r.rate}%)` }))]} />}
              </Field>
            </>
          )}
          <div className="sm:col-span-2">
            <Switch checked={form.commission} onChange={(commission) => set({ commission })} label={t(`${P}.form.commission`)} hint={t(`${P}.form.commissionHint`)} />
          </div>
        </div>
      </SectionCard>

      <SectionCard id="inventory" title={t(`${P}.form.inventory`)} subtitle={t(`${P}.form.inventorySubtitle`)}>
        <div className="flex flex-col gap-6">
          <div>
            <p className="label mb-2">{t(`${P}.form.sku`)}</p>
            <div className="flex flex-col gap-2">
              {form.skus.map((sku, i) => (
                <div key={i} className="flex items-center gap-2">
                  <TextInput aria-label={t(`${P}.form.sku`)} value={sku} maxLength={40} placeholder={t(`${P}.form.skuPlaceholder`)} onChange={(e) => set({ skus: form.skus.map((s, j) => (j === i ? e.target.value : s)) })} />
                  {form.skus.length > 1 && (
                    <button type="button" className="icon-btn h-10 w-10 shrink-0" aria-label={t(`${P}.form.removeSku`)} onClick={() => set({ skus: form.skus.filter((_, j) => j !== i) })}>
                      <X size={16} aria-hidden />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-4">
              <Button
                variant="link"
                icon={<Wand2 size={16} aria-hidden />}
                onClick={() => {
                  const code = generateSku(seedForSku)
                  const empty = form.skus.findIndex((s) => !s.trim())
                  set({ skus: empty >= 0 ? form.skus.map((s, j) => (j === empty ? code : s)) : [...form.skus, code] })
                }}
              >
                {t(`${P}.form.generateSku`)}
              </Button>
              <Button variant="link" icon={<Plus size={16} aria-hidden />} onClick={() => set({ skus: [...form.skus, ''] })}>
                {t(`${P}.form.addSku`)}
              </Button>
            </div>
          </div>
          <Field label={t(`${P}.form.supplier`)}>
            {(fid) => <DotSelect id={fid} value={form.supplierId} placeholder={t(`${P}.form.selectSupplier`)} options={[{ value: '', label: t(`${P}.form.noSupplier`) }, ...supplierOptions]} onChange={(supplierId) => set({ supplierId })} footer={{ label: t(`${P}.addSupplier`), onClick: () => setModal('supplier') }} />}
          </Field>
          <div className="border-t border-line pt-5">
            <h3 className="mb-3 font-display text-title-3 text-ink">{t(`${P}.form.stockQuantity`)}</h3>
            <Switch checked={form.trackStock} onChange={(trackStock) => set({ trackStock })} label={t(`${P}.form.trackStock`)} />
            {form.trackStock && (
              <Field className="mt-4 max-w-xs" label={t(`${P}.form.currentStock`)} hint={product ? t(`${P}.form.currentStockHint`) : undefined}>
                {(fid) => <TextInput id={fid} type="number" min={0} step={1} inputMode="numeric" value={form.stock} onChange={(e) => set({ stock: e.target.value === '' ? '' : Number(e.target.value) })} />}
              </Field>
            )}
          </div>
          {form.trackStock && (
            <div className="border-t border-line pt-5">
              <h3 className="font-display text-title-3 text-ink">{t(`${P}.form.lowStock`)}</h3>
              <p className="mb-4 mt-1 text-body text-muted">
                {t(`${P}.form.lowStockSubtitle`)} <LearnMore topic={t('catalog.topics.lowStock')}>{t('catalog.common.learnMore')}</LearnMore>
              </p>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label={t(`${P}.form.lowStockLevel`)} hint={t(`${P}.form.lowStockLevelHint`)}>
                  {(fid) => <TextInput id={fid} type="number" min={0} step={1} value={form.lowStockLevel} onChange={(e) => set({ lowStockLevel: e.target.value === '' ? '' : Number(e.target.value) })} />}
                </Field>
                <Field label={t(`${P}.form.reorderQty`)} hint={t(`${P}.form.reorderQtyHint`)}>
                  {(fid) => <TextInput id={fid} type="number" min={0} step={1} value={form.reorderQty} onChange={(e) => set({ reorderQty: e.target.value === '' ? '' : Number(e.target.value) })} />}
                </Field>
              </div>
              <div className="mt-4">
                <Switch checked={form.lowStockNotify} onChange={(lowStockNotify) => set({ lowStockNotify })} label={t(`${P}.form.lowStockNotify`)} />
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard id="photos" title={t(`${P}.form.photos`)} subtitle={t(`${P}.form.photosSubtitle`)}>
        <ImageUploader images={form.images} onChange={(images) => set({ images })} />
      </SectionCard>

      <AddBrandModal open={modal === 'brand'} onClose={() => setModal(null)} onAdded={(brandId) => set({ brandId })} />
      <AddCategoryModal open={modal === 'category'} onClose={() => setModal(null)} onAdded={(categoryId) => set({ categoryId })} />
      <AddSupplierModal open={modal === 'supplier'} onClose={() => setModal(null)} onAdded={(s) => set({ supplierId: s.id })} />
    </EditorFrame>
  )
}

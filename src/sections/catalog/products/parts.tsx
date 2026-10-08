import clsx from 'clsx'
import { Check, Pencil, Trash2, Upload, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Checkbox, Field, Modal, MoneyInput, Select, TextArea, TextInput, confirm, toast } from '@/components/ui'
import { useDb } from '@/store/db'
import { downloadBlob, toCsv } from '@/lib/export'
import { money } from '@/lib/format'
import type { Product, Supplier } from '@/types'
import { adjustStock, deleteBrand, deleteProductCategory, importProducts, saveBrand, saveProductCategory, saveSupplier, type ProductImportRow } from '@/api/catalog'
import { Stepper } from '../ui'

const P = 'catalog.products2'

// ─── Stock reasons (catalog.md §4) ─────────────────────────────────────────

export const ADD_REASONS = [
  { value: 'New Stock', key: 'newStock' },
  { value: 'Return', key: 'return' },
  { value: 'Transfer', key: 'transfer' },
  { value: 'Adjustment', key: 'adjustment' },
  { value: 'Other', key: 'other' },
] as const

export const REMOVE_REASONS = [
  { value: 'Internal use', key: 'internalUse' },
  { value: 'Damaged', key: 'damaged' },
  { value: 'Out of date', key: 'outOfDate' },
  { value: 'Adjustment', key: 'adjustment' },
  { value: 'Lost', key: 'lost' },
  { value: 'Other', key: 'other' },
] as const

const OTHER_REASONS: Record<string, string> = { Import: 'import', Sale: 'sale', Stocktake: 'stocktake', 'Stock order': 'stockOrder', Received: 'received' }

/** Translated label for a stored movement reason (data value), falling back to the raw value. */
export function useReasonLabel() {
  const { t } = useTranslation()
  return (reason: string) => {
    const key = [...ADD_REASONS, ...REMOVE_REASONS].find((r) => r.value === reason)?.key ?? OTHER_REASONS[reason]
    return key ? t(`${P}.reasons.${key}`) : reason
  }
}

// ─── Single-name modal (brand / category) ──────────────────────────────────

export function NameModal({ open, onClose, title, label, placeholder, initial = '', onSave, submitLabel, onBack }: { open: boolean; onClose: () => void; title: string; label: string; placeholder?: string; initial?: string; onSave: (name: string) => Promise<void>; submitLabel?: string; onBack?: () => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState(initial)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (open) {
      setName(initial)
      setError('')
    }
  }, [open, initial])
  const submit = async () => {
    if (!name.trim()) {
      setError(t(`${P}.nameRequired`))
      return
    }
    setSaving(true)
    try {
      await onSave(name.trim())
      onClose()
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button onClick={onBack ?? onClose}>{onBack ? t(`${P}.goBack`) : t('catalog.common.cancel')}</Button>
          <Button variant="primary" loading={saving} onClick={() => void submit()}>
            {submitLabel ?? t('catalog.common.save')}
          </Button>
        </>
      }
    >
      <div className="pb-2">
        <Field label={label} error={error}>
          {(id) => <TextInput id={id} autoFocus value={name} maxLength={100} placeholder={placeholder} invalid={Boolean(error)} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void submit()} />}
        </Field>
      </div>
    </Modal>
  )
}

export function AddBrandModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded?: (id: string) => void }) {
  const { t } = useTranslation()
  return (
    <NameModal
      open={open}
      onClose={onClose}
      title={t(`${P}.addBrand`)}
      label={t(`${P}.brandName`)}
      placeholder={t(`${P}.brandPlaceholder`)}
      onSave={async (name) => {
        const b = await saveBrand(null, name)
        toast(t(`${P}.toasts.brandAdded`))
        onAdded?.(b.id)
      }}
    />
  )
}

export function AddCategoryModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded?: (id: string) => void }) {
  const { t } = useTranslation()
  return (
    <NameModal
      open={open}
      onClose={onClose}
      title={t(`${P}.addCategory`)}
      label={t(`${P}.categoryName`)}
      placeholder={t(`${P}.categoryPlaceholder`)}
      onSave={async (name) => {
        const c = await saveProductCategory(null, name)
        toast(t(`${P}.toasts.categoryAdded`))
        onAdded?.(c.id)
      }}
    />
  )
}

export function AddSupplierModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded?: (s: Supplier) => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (open) {
      setName('')
      setDescription('')
      setError('')
    }
  }, [open])
  const submit = async () => {
    if (!name.trim()) {
      setError(t(`${P}.nameRequired`))
      return
    }
    setSaving(true)
    const s = await saveSupplier(null, { name: name.trim(), description: description.trim(), firstName: '', lastName: '', mobile: '', telephone: '', email: '', website: '', address: { country: 'Portugal' } })
    setSaving(false)
    toast(t(`${P}.toasts.supplierAdded`))
    onAdded?.(s)
    onClose()
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t(`${P}.addSupplier`)}
      footer={
        <>
          <Button onClick={onClose}>{t('catalog.common.cancel')}</Button>
          <Button variant="primary" loading={saving} onClick={() => void submit()}>
            {t('catalog.common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <Field label={t(`${P}.supplierName`)} error={error}>
          {(id) => <TextInput id={id} autoFocus value={name} maxLength={100} invalid={Boolean(error)} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label={t(`${P}.supplierDescription`)} counter={{ value: description.length, max: 100 }}>
          {(id) => <TextArea id={id} value={description} maxLength={100} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
      </div>
    </Modal>
  )
}

// ─── Manage brands / categories ────────────────────────────────────────────

export function ManageNamesModal({ kind, open, onClose }: { kind: 'brands' | 'categories'; open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const brands = useDb((s) => s.brands)
  const categories = useDb((s) => s.productCategories)
  const products = useDb((s) => s.products)
  const list = kind === 'brands' ? brands : categories
  const sorted = useMemo(() => [...list].sort((a, b) => a.name.localeCompare(b.name)), [list])
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState('')
  const [busy, setBusy] = useState(false)
  const usage = (id: string) => products.filter((p) => (kind === 'brands' ? p.brandId : p.categoryId) === id).length
  const tk = kind === 'brands' ? 'brand' : 'category'

  const add = async () => {
    if (!adding.trim()) return
    setBusy(true)
    if (kind === 'brands') await saveBrand(null, adding.trim())
    else await saveProductCategory(null, adding.trim())
    setBusy(false)
    setAdding('')
    toast(t(`${P}.toasts.${tk}Added`))
  }
  const rename = async (id: string) => {
    if (!draft.trim()) return
    setBusy(true)
    if (kind === 'brands') await saveBrand(id, draft.trim())
    else await saveProductCategory(id, draft.trim())
    setBusy(false)
    setEditing(null)
    toast(t(`${P}.toasts.${tk}Updated`))
  }
  const remove = async (id: string, name: string) => {
    const ok = await confirm({ title: t(`${P}.manage.deleteTitle_${tk}`), body: t(`${P}.manage.deleteBody`, { name, count: usage(id) }), confirmLabel: t('catalog.common.delete'), tone: 'danger' })
    if (!ok) return
    if (kind === 'brands') await deleteBrand(id)
    else await deleteProductCategory(id)
    toast(t(`${P}.toasts.${tk}Deleted`))
  }

  return (
    <Modal open={open} onClose={onClose} title={kind === 'brands' ? t(`${P}.manageBrands`) : t(`${P}.manageCategories`)} subtitle={t(`${P}.manage.subtitle_${tk}`)} footer={<Button onClick={onClose}>{t('catalog.common.close')}</Button>}>
      <div className="flex flex-col gap-4 pb-2">
        <div className="flex gap-2">
          <TextInput aria-label={t(`${P}.manage.new_${tk}`)} placeholder={t(`${P}.manage.new_${tk}`)} value={adding} maxLength={100} onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} />
          <Button variant="primary" disabled={!adding.trim()} loading={busy && !editing} onClick={() => void add()}>
            {t('catalog.common.add')}
          </Button>
        </div>
        {sorted.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong px-4 py-8 text-center text-body text-muted">{t(`${P}.manage.empty_${tk}`)}</p>
        ) : (
          <ul className="max-h-[50vh] divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {sorted.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                {editing === item.id ? (
                  <>
                    <TextInput autoFocus aria-label={t(`${P}.manage.rename`)} value={draft} maxLength={100} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => (e.key === 'Enter' ? void rename(item.id) : e.key === 'Escape' ? setEditing(null) : undefined)} />
                    <button type="button" className="icon-btn h-9 w-9" aria-label={t('catalog.common.save')} onClick={() => void rename(item.id)}>
                      <Check size={16} aria-hidden />
                    </button>
                    <button type="button" className="icon-btn h-9 w-9" aria-label={t('catalog.common.cancel')} onClick={() => setEditing(null)}>
                      <X size={16} aria-hidden />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body text-ink">{item.name}</span>
                      <span className="block text-small text-muted">{t(`${P}.manage.usage`, { count: usage(item.id) })}</span>
                    </span>
                    <button
                      type="button"
                      className="icon-btn h-9 w-9"
                      aria-label={t(`${P}.manage.rename`)}
                      onClick={() => {
                        setEditing(item.id)
                        setDraft(item.name)
                      }}
                    >
                      <Pencil size={16} aria-hidden />
                    </button>
                    <button type="button" className="icon-btn h-9 w-9 text-danger" aria-label={t('catalog.common.delete')} onClick={() => void remove(item.id, item.name)}>
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}

// ─── Add / remove stock ────────────────────────────────────────────────────

export function StockModal({ product, mode, open, onClose }: { product: Product; mode: 'add' | 'remove'; open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const reasons = mode === 'add' ? ADD_REASONS : REMOVE_REASONS
  const [qty, setQty] = useState(1)
  const [price, setPrice] = useState<number | ''>(product.supplyPrice)
  const [savePrice, setSavePrice] = useState(false)
  const [reason, setReason] = useState<string>(reasons[0].value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!open) return
    setQty(1)
    setPrice(product.supplyPrice)
    setSavePrice(false)
    setReason((mode === 'add' ? ADD_REASONS : REMOVE_REASONS)[0].value)
    setError('')
  }, [open, mode, product.supplyPrice])
  const submit = async () => {
    if (qty < 1) {
      setError(t(`${P}.stock.qtyRequired`))
      return
    }
    if (mode === 'remove' && product.trackStock && qty > product.stock) {
      setError(t(`${P}.stock.notEnough`, { count: product.stock }))
      return
    }
    setSaving(true)
    await adjustStock(product.id, { qty: mode === 'add' ? qty : -qty, reason, supplyPrice: mode === 'add' && price !== '' ? price : undefined, savePrice: mode === 'add' && savePrice })
    setSaving(false)
    toast(mode === 'add' ? t(`${P}.toasts.stockIncreased`) : t(`${P}.toasts.stockDecreased`))
    onClose()
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'add' ? t(`${P}.actions.addStock`) : t(`${P}.actions.removeStock`)}
      footer={
        <>
          <Button onClick={onClose}>{t('catalog.common.cancel')}</Button>
          <Button variant="primary" loading={saving} onClick={() => void submit()}>
            {t('catalog.common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        <div className="rounded-lg border border-line bg-sunken/60 px-4 py-3">
          <p className="text-body-strong text-ink">{product.name}</p>
          <p className="text-small text-muted">{t(`${P}.inStock`, { count: product.stock })}</p>
        </div>
        <Field label={t('catalog.common.quantity')} error={error}>
          {(id) => (
            <div id={id}>
              <Stepper value={qty} min={0} onChange={(v) => setQty(v)} />
            </div>
          )}
        </Field>
        {mode === 'add' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t(`${P}.form.supplyPrice`)}>{(id) => <MoneyInput id={id} value={price} onChange={setPrice} />}</Field>
            <div className="flex items-end pb-2">
              <Checkbox label={t(`${P}.stock.savePrice`)} checked={savePrice} onChange={setSavePrice} />
            </div>
          </div>
        )}
        <Field label={t(`${P}.stock.reason`)}>{(id) => <Select id={id} value={reason} onChange={(e) => setReason(e.target.value)} options={reasons.map((r) => ({ value: r.value, label: t(`${P}.reasons.${r.key}`) }))} />}</Field>
      </div>
    </Modal>
  )
}

// ─── CSV import ────────────────────────────────────────────────────────────

/** Minimal RFC-4180 CSV parser (quoted cells, escaped quotes, CRLF, `;` or `,`). */
export function parseCsv(text: string): string[][] {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const firstLine = clean.split(/\r?\n/)[0] ?? ''
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === sep) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim()))
}

const HEADER_ALIASES: Record<keyof ProductImportRow, string[]> = {
  name: ['product name', 'name', 'product'],
  barcode: ['barcode', 'product barcode', 'ean', 'upc'],
  brand: ['brand', 'product brand'],
  category: ['category', 'product category'],
  supplier: ['supplier'],
  supplyPrice: ['supply price', 'cost', 'cost price'],
  retailPrice: ['retail price', 'price'],
  stock: ['quantity', 'stock', 'stock quantity', 'current stock quantity'],
  sku: ['sku', 'primary sku'],
  measure: ['measure', 'unit'],
  amount: ['amount', 'size'],
}

const num = (v: string | undefined) => {
  const n = Number(String(v ?? '').replace(/[€\s]/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export function rowsFromCsv(table: string[][]): { rows: ProductImportRow[]; skipped: number; missingName: boolean } {
  const [header = [], ...body] = table
  const norm = header.map((h) => h.trim().toLowerCase())
  const col = (key: keyof ProductImportRow) => norm.findIndex((h) => HEADER_ALIASES[key].includes(h))
  const idx = Object.fromEntries((Object.keys(HEADER_ALIASES) as (keyof ProductImportRow)[]).map((k) => [k, col(k)])) as Record<keyof ProductImportRow, number>
  if (idx.name < 0) return { rows: [], skipped: body.length, missingName: true }
  const get = (r: string[], k: keyof ProductImportRow) => (idx[k] >= 0 ? (r[idx[k]] ?? '').trim() : '')
  let skipped = 0
  const rows: ProductImportRow[] = []
  body.forEach((r) => {
    const name = get(r, 'name')
    if (!name) {
      skipped++
      return
    }
    rows.push({
      name,
      barcode: get(r, 'barcode') || undefined,
      brand: get(r, 'brand') || undefined,
      category: get(r, 'category') || undefined,
      supplier: get(r, 'supplier') || undefined,
      supplyPrice: num(get(r, 'supplyPrice')),
      retailPrice: num(get(r, 'retailPrice')),
      stock: Math.round(num(get(r, 'stock'))),
      sku: get(r, 'sku') || undefined,
      measure: get(r, 'measure') || undefined,
      amount: get(r, 'amount') ? num(get(r, 'amount')) : undefined,
    })
  })
  return { rows, skipped, missingName: false }
}

const TEMPLATE_HEADERS = ['Product name', 'Barcode', 'Brand', 'Category', 'Supplier', 'Supply price', 'Retail price', 'Quantity', 'SKU', 'Measure', 'Amount']

export function ImportProductsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<ReturnType<typeof rowsFromCsv> | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  useEffect(() => {
    if (!open) return
    setFileName('')
    setParsed(null)
    setError('')
  }, [open])

  const readFile = async (file: File | undefined) => {
    if (!file) return
    setError('')
    if (!/\.(csv|txt)$/i.test(file.name)) {
      setError(t(`${P}.import.wrongType`))
      return
    }
    const text = await file.text()
    const result = rowsFromCsv(parseCsv(text))
    setFileName(file.name)
    if (result.missingName) {
      setParsed(null)
      setError(t(`${P}.import.missingName`))
      return
    }
    setParsed(result)
  }
  const downloadTemplate = () => {
    const csv = toCsv([{ headers: TEMPLATE_HEADERS, rows: [['Argan Hair Oil', '5601234567890', 'Argan Lab', 'Hair care', 'Beauty Supplies Lda', 10, 25, 20, 'ARG-98984', 'ml', 100]] }])
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'products_import_template.csv')
    toast(t('catalog.toasts.downloaded'))
  }
  const run = async () => {
    if (!parsed?.rows.length) return
    setBusy(true)
    const count = await importProducts(parsed.rows)
    setBusy(false)
    toast(t(`${P}.toasts.imported`, { count }))
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t(`${P}.importProducts`)}
      subtitle={t(`${P}.import.subtitle`)}
      footer={
        <>
          <Button onClick={onClose}>{t('catalog.common.cancel')}</Button>
          <Button variant="primary" loading={busy} disabled={!parsed?.rows.length} onClick={() => void run()}>
            {parsed?.rows.length ? t(`${P}.import.importCount`, { count: parsed.rows.length }) : t(`${P}.import.import`)}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            void readFile(e.dataTransfer.files[0])
          }}
          className={clsx('flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center', dragOver ? 'border-primary bg-primary-subtle' : 'border-line-strong bg-sunken/50')}
        >
          <Upload size={26} className="text-primary" aria-hidden />
          <p className="text-body-strong text-ink">{fileName || t(`${P}.import.drop`)}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" onClick={() => input.current?.click()}>
              {t('catalog.common.chooseFile')}
            </Button>
            <Button size="sm" variant="ghost" onClick={downloadTemplate}>
              {t(`${P}.import.template`)}
            </Button>
          </div>
          <p className="text-small text-muted">{t(`${P}.import.hint`)}</p>
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              void readFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>
        {error && (
          <p role="alert" className="rounded-md bg-danger-subtle px-4 py-3 text-body text-danger">
            {error}
          </p>
        )}
        {parsed && (
          <div>
            <p className="mb-2 text-body-strong text-ink">
              {t(`${P}.import.preview`, { count: parsed.rows.length })}
              {parsed.skipped > 0 && <span className="ml-2 text-small font-normal text-warning">{t(`${P}.import.skipped`, { count: parsed.skipped })}</span>}
            </p>
            <div className="max-h-64 overflow-auto rounded-lg border border-line">
              <table className="w-full text-left text-small">
                <thead className="sticky top-0 bg-sunken">
                  <tr>
                    {[t(`${P}.cols.name`), t(`${P}.filters.brands`), t(`${P}.cols.category`), t(`${P}.cols.supplier`), t(`${P}.cols.quantity`), t(`${P}.cols.retailPrice`)].map((h) => (
                      <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold text-ink">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="px-3 py-2 text-ink">{r.name}</td>
                      <td className="px-3 py-2 text-muted">{r.brand ?? '-'}</td>
                      <td className="px-3 py-2 text-muted">{r.category ?? '-'}</td>
                      <td className="px-3 py-2 text-muted">{r.supplier ?? '-'}</td>
                      <td className="px-3 py-2 text-muted">{r.stock}</td>
                      <td className="px-3 py-2 text-muted">{money(r.retailPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

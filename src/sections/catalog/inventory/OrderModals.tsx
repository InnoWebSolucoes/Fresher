import clsx from 'clsx'
import { Plus, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, EmptyState, Field, Modal, SearchInput, TextInput } from '@/components/ui'
import { useDb } from '@/store/db'
import { money } from '@/lib/format'
import type { ID, StockOrder } from '@/types'
import { ProductThumb } from '../ui'
import { productSku } from './shared'

/** "Add products" modal of the stock order builder (mounted only while open). */
export function ProductPickerModal({ supplierId, supplierName, existing, onClose, onAdd }: { supplierId: ID; supplierName: string; existing: ID[]; onClose: () => void; onAdd: (ids: ID[]) => void }) {
  const { t } = useTranslation()
  const products = useDb((s) => s.products)
  const categories = useDb((s) => s.productCategories)
  const [query, setQuery] = useState('')
  const [supplierOnly, setSupplierOnly] = useState(() => products.some((p) => !p.archived && p.supplierId === supplierId))
  const [selected, setSelected] = useState<Set<ID>>(new Set())
  const inOrder = useMemo(() => new Set(existing), [existing])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products
      .filter((p) => !p.archived && (!supplierOnly || p.supplierId === supplierId))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.barcode ?? '').toLowerCase().includes(q) || p.skus.some((s) => s.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [products, query, supplierOnly, supplierId])

  const toggle = (id: ID, on: boolean) => {
    const next = new Set(selected)
    if (on) next.add(id)
    else next.delete(id)
    setSelected(next)
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={t('catalog.inventory.orderNew.picker.title')}
      footer={
        <>
          <Button onClick={onClose}>{t('catalog.common.cancel')}</Button>
          <Button variant="primary" disabled={!selected.size} onClick={() => onAdd([...selected])}>
            {selected.size ? t('catalog.inventory.orderNew.picker.add', { count: selected.size }) : t('catalog.inventory.orderNew.picker.addNone')}
          </Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={query} onChange={setQuery} placeholder={t('catalog.inventory.orderNew.picker.search')} />
        {supplierOnly && (
          <span className="chip h-9 gap-1 bg-primary-subtle pl-3 pr-1 text-primary">
            {t('catalog.inventory.orderNew.picker.supplier', { name: supplierName })}
            <button type="button" aria-label={t('catalog.common.remove')} onClick={() => setSupplierOnly(false)} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-surface">
              <X size={14} aria-hidden />
            </button>
          </span>
        )}
        {(supplierOnly || query) && (
          <Button
            variant="link"
            onClick={() => {
              setSupplierOnly(false)
              setQuery('')
            }}
          >
            {t('catalog.common.clearFilters')}
          </Button>
        )}
      </div>
      {rows.length ? (
        <table className="w-full border-collapse text-left text-body">
          <thead>
            <tr className="border-b border-line">
              <th className="w-10 px-2 py-2" />
              <th className="px-2 py-2 text-body-strong text-ink">{t('catalog.inventory.orderNew.picker.cols.name')}</th>
              <th className="px-2 py-2 text-body-strong text-ink">{t('catalog.inventory.orderNew.picker.cols.category')}</th>
              <th className="px-2 py-2 text-right text-body-strong text-ink">{t('catalog.inventory.orderNew.picker.cols.quantity')}</th>
              <th className="px-2 py-2 text-right text-body-strong text-ink">{t('catalog.inventory.orderNew.picker.cols.cost')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const already = inOrder.has(p.id)
              return (
                <tr key={p.id} className={clsx('border-b border-line last:border-0', !already && 'cursor-pointer hover:bg-sunken/60')} onClick={() => !already && toggle(p.id, !selected.has(p.id))}>
                  <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label={p.name} disabled={already} checked={already || selected.has(p.id)} onChange={(e) => toggle(p.id, e.target.checked)} className="h-4 w-4 accent-[rgb(var(--primary))]" />
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-3">
                      <ProductThumb product={p} size={40} />
                      <div className="min-w-0">
                        <p className="text-body text-ink">{p.name}</p>
                        <p className="text-small text-muted">{already ? t('catalog.inventory.orderNew.picker.inOrder') : productSku(p) && t('catalog.inventory.common.sku', { sku: productSku(p) })}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-muted">{categories.find((c) => c.id === p.categoryId)?.name ?? '-'}</td>
                  <td className="px-2 py-2 text-right tabular">{p.stock}</td>
                  <td className="px-2 py-2 text-right tabular">{money(p.supplyPrice)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : (
        <EmptyState title={t('catalog.inventory.orderNew.picker.empty')} body={t('catalog.inventory.common.noResultsBody')} />
      )}
    </Modal>
  )
}

type FeeRow = { name: string; amount: number | ''; type: 'amount' | 'percent' }

/** "Manage fees" modal (mounted only while open). */
export function FeesModal({ fees, onClose, onSave }: { fees: StockOrder['fees']; onClose: () => void; onSave: (fees: StockOrder['fees']) => void }) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<FeeRow[]>(() => (fees.length ? fees.map((f) => ({ ...f })) : [{ name: '', amount: '', type: 'amount' }]))
  const [submitted, setSubmitted] = useState(false)
  const patch = (index: number, next: Partial<FeeRow>) => setRows((list) => list.map((r, i) => (i === index ? { ...r, ...next } : r)))
  const invalid = (r: FeeRow) => !r.name.trim() && Number(r.amount) > 0

  const save = () => {
    setSubmitted(true)
    if (rows.some(invalid)) return
    onSave(rows.filter((r) => r.name.trim() && Number(r.amount) > 0).map((r) => ({ name: r.name.trim(), amount: Number(r.amount), type: r.type })))
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t('catalog.inventory.orderNew.feesModal.title')}
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
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto] items-end gap-3">
            <Field label={t('catalog.inventory.orderNew.feesModal.name')} error={submitted && invalid(r) ? t('catalog.inventory.orderNew.feesModal.nameRequired') : undefined}>
              {(id) => <TextInput id={id} value={r.name} invalid={submitted && invalid(r)} onChange={(e) => patch(i, { name: e.target.value })} placeholder={t('catalog.inventory.orderNew.feesModal.namePlaceholder')} />}
            </Field>
            <Field label={t('catalog.inventory.orderNew.feesModal.amount')}>
              {(id) => <TextInput id={id} type="number" inputMode="decimal" min={0} step="0.01" value={r.amount} placeholder="0.00" onChange={(e) => patch(i, { amount: e.target.value === '' ? '' : Number(e.target.value) })} />}
            </Field>
            <div role="radiogroup" aria-label={t('catalog.inventory.orderNew.feesModal.type')} className="flex h-11 overflow-hidden rounded-sm border border-line-strong">
              {(['percent', 'amount'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={r.type === type}
                  onClick={() => patch(i, { type })}
                  className={clsx('px-3 text-body-strong', r.type === type ? 'bg-surface text-ink' : 'bg-sunken text-muted hover:text-ink')}
                >
                  {type === 'percent' ? t('catalog.inventory.orderNew.feesModal.percent') : t('catalog.inventory.orderNew.feesModal.eur')}
                </button>
              ))}
            </div>
            <button type="button" aria-label={t('catalog.inventory.orderNew.feesModal.remove')} onClick={() => setRows((list) => list.filter((_, x) => x !== i))} className="icon-btn h-11 w-11">
              <Trash2 size={16} aria-hidden />
            </button>
          </div>
        ))}
        <div>
          <Button variant="link" icon={<Plus size={16} />} onClick={() => setRows((list) => [...list, { name: '', amount: '', type: 'amount' }])}>
            {t('catalog.inventory.orderNew.feesModal.addMore')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Minus, Plus, Search, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { Button, Checkbox, Field, Modal, MoneyInput, Select, TextInput, toast } from '@/components/ui'
import { useDb } from '@/store/db'
import { lineTotal } from '@/api/sales'
import { saveQuickSaleItems } from '@/api/checkout'
import { fullName, money, round2 } from '@/lib/format'
import { todayISO } from '@/lib/time'
import { PALETTE } from '@/styles/palette'
import type { Settings } from '@/types'
import { useCheckout } from './context'
import { EXPIRY_OPTIONS, dealsForLine, keypadPress, parseAmount } from './model'
import { Keypad } from './ui'

const num = (v: number | '') => (v === '' ? 0 : v)

function MemberSelect({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  const c = useCheckout()
  return <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} options={c.members.map((m) => ({ value: m.id, label: fullName(m) }))} />
}

function ModalFooter({ total, label, onRemove, onApply, applyLabel, removeLabel, disabled }: { total: number; label: string; onRemove?: () => void; onApply: () => void; applyLabel: string; removeLabel: string; disabled?: boolean }) {
  return (
    <div className="flex w-full items-center justify-between gap-4">
      <div>
        <p className="text-body text-ink">{label}</p>
        <p className="font-display text-title-3 text-ink tabular">{money(total)}</p>
      </div>
      <div className="flex items-center gap-2">
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label={removeLabel} title={removeLabel} className="flex h-12 w-12 items-center justify-center rounded-full border border-line-strong text-danger hover:bg-danger-subtle">
            <Trash2 size={20} aria-hidden />
          </button>
        )}
        <Button variant="primary" size="lg" className="rounded-full" disabled={disabled} onClick={onApply}>
          {applyLabel}
        </Button>
      </div>
    </div>
  )
}

/** "Edit Haircut": price, quantity, discounts (POS deals), team member, item total (calendar.md §10). */
export function EditLineModal({ lineKey, onClose }: { lineKey: string; onClose: () => void }) {
  const { t } = useTranslation()
  const c = useCheckout()
  const deals = useDb((s) => s.deals)
  const line = c.lines.find((l) => l.key === lineKey)
  const [price, setPrice] = useState<number | ''>(line?.unitPrice ?? 0)
  const [qty, setQty] = useState(line?.quantity ?? 1)
  const [dealId, setDealId] = useState(line?.discount?.dealId ?? '')
  const [memberId, setMemberId] = useState(line?.teamMemberId ?? c.defaultMemberId ?? '')
  if (!line) return null
  const available = dealsForLine({ type: line.type, refId: line.refId, teamMemberId: memberId }, deals, todayISO())
  const deal = available.find((d) => d.id === dealId)
  const discount = deal ? { type: deal.discountType === 'percent' ? ('percent' as const) : ('amount' as const), value: deal.value, dealId: deal.id } : undefined
  const total = lineTotal({ unitPrice: num(price), quantity: qty, discount })
  const invalid = price === '' || num(price) < 0 || qty < 1
  const fixedQty = Boolean(line.appointmentId)
  const apply = () => {
    c.updateLine(line.key, { unitPrice: round2(num(price)), quantity: qty, discount, teamMemberId: memberId || null })
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={t('checkout.editItem.title', { name: line.name })}
      footer={<ModalFooter total={total} label={t('checkout.editItem.itemTotal')} removeLabel={t('checkout.editItem.remove')} onRemove={() => { c.removeLine(line.key); onClose() }} onApply={apply} applyLabel={t('checkout.common.apply')} disabled={invalid} />}
    >
      <div className="flex flex-col gap-5 pb-2">
        <div className="grid grid-cols-[1fr_1fr] gap-4">
          <Field label={t('checkout.editItem.price')} error={invalid && price === '' ? t('checkout.editItem.priceRequired') : undefined}>
            {(id) => <MoneyInput id={id} value={price} onChange={setPrice} />}
          </Field>
          <Field label={t('checkout.editItem.quantity')} hint={fixedQty ? t('checkout.editItem.fromAppointment') : undefined}>
            {(id) => (
              <div className="flex gap-2">
                <TextInput id={id} type="number" min={1} value={qty} disabled={fixedQty} onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
                <div className="flex shrink-0 items-center rounded-sm border border-line-strong">
                  <button type="button" className="icon-btn h-10 w-10" disabled={fixedQty || qty <= 1} aria-label={t('checkout.editItem.decrease')} onClick={() => setQty((q) => Math.max(1, q - 1))}>
                    <Minus size={16} aria-hidden />
                  </button>
                  <button type="button" className="icon-btn h-10 w-10" disabled={fixedQty} aria-label={t('checkout.editItem.increase')} onClick={() => setQty((q) => q + 1)}>
                    <Plus size={16} aria-hidden />
                  </button>
                </div>
              </div>
            )}
          </Field>
        </div>
        <Field label={t('checkout.editItem.discounts')}>
          {(id) => (
            <Select
              id={id}
              value={dealId}
              disabled={!available.length}
              onChange={(e) => setDealId(e.target.value)}
              options={available.length ? [{ value: '', label: t('checkout.editItem.noneSelected') }, ...available.map((d) => ({ value: d.id, label: `${d.name} (${d.discountType === 'percent' ? `${d.value}%` : money(d.value)} ${t('checkout.editItem.off')})` }))] : [{ value: '', label: t('checkout.editItem.noneAvailable') }]}
            />
          )}
        </Field>
        <Field label={t('checkout.editItem.teamMember')}>{(id) => <MemberSelect id={id} value={memberId} onChange={setMemberId} />}</Field>
      </div>
    </Modal>
  )
}

/** "Edit gift card" (calendar.md §10.9). `lineKey` null = new custom-amount card. */
export function GiftCardModal({ lineKey, onClose }: { lineKey: string | null; onClose: () => void }) {
  const { t } = useTranslation()
  const c = useCheckout()
  const data = useDb(useShallow((s) => ({ deals: s.deals, settings: s.settings.giftCards, cards: s.giftCards })))
  const line = lineKey ? c.lines.find((l) => l.key === lineKey) : undefined
  const gc = line?.giftCard
  const [value, setValue] = useState<number | ''>(gc?.value ?? '')
  const [price, setPrice] = useState<number | ''>(line?.unitPrice ?? '')
  const [dealId, setDealId] = useState(line?.discount?.dealId ?? '')
  const [expiry, setExpiry] = useState(gc?.expiry ?? data.settings.expiry)
  const [useCustom, setUseCustom] = useState(Boolean(gc?.customCode))
  const [code, setCode] = useState(gc?.customCode ?? '')
  const [isGift, setIsGift] = useState(gc?.isGift ?? true)
  const [sendEmail, setSendEmail] = useState(gc?.sendEmail ?? Boolean(c.clientId))
  const [memberId, setMemberId] = useState(line?.teamMemberId ?? c.defaultMemberId ?? '')
  const [touched, setTouched] = useState(false)

  const available = dealsForLine({ type: 'gift_card', teamMemberId: memberId }, data.deals, todayISO())
  const deal = available.find((d) => d.id === dealId)
  const discount = deal ? { type: deal.discountType === 'percent' ? ('percent' as const) : ('amount' as const), value: deal.value, dealId: deal.id } : undefined
  const effectivePrice = price === '' ? num(value) : num(price)
  const total = lineTotal({ unitPrice: effectivePrice, quantity: 1, discount })

  const min = data.settings.customMin
  const max = data.settings.customMax
  const presets = data.settings.values
  const valueError = value === '' ? t('checkout.giftCard.valueRequired') : !presets.includes(num(value)) && (num(value) < min || num(value) > max) ? t('checkout.giftCard.valueRange', { min: money(min), max: money(max) }) : undefined
  const trimmed = code.trim().toUpperCase()
  const codeError = !useCustom ? undefined : !/^[A-Z0-9-]{4,20}$/.test(trimmed) ? t('checkout.giftCard.codeFormat') : data.cards.some((g) => g.code === trimmed || g.customCode?.toUpperCase() === trimmed) || c.lines.some((l) => l.key !== lineKey && l.giftCard?.customCode?.toUpperCase() === trimmed) ? t('checkout.giftCard.codeTaken') : undefined
  const priceError = price !== '' && num(price) < 0 ? t('checkout.giftCard.priceInvalid') : undefined

  const apply = () => {
    setTouched(true)
    if (valueError || codeError || priceError) return
    const patch = {
      type: 'gift_card' as const,
      name: 'Gift Card',
      quantity: 1,
      unitPrice: round2(effectivePrice),
      discount,
      teamMemberId: memberId || null,
      giftCard: { value: round2(num(value)), expiry, customCode: useCustom ? trimmed : undefined, isGift, sendEmail: sendEmail && Boolean(c.clientId) },
    }
    if (line) c.updateLine(line.key, patch)
    else c.addLine(patch)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('checkout.giftCard.editTitle')}
      footer={<ModalFooter total={total} label={t('checkout.editItem.itemTotal')} removeLabel={t('checkout.editItem.remove')} onRemove={() => { if (line) c.removeLine(line.key); onClose() }} onApply={apply} applyLabel={t('checkout.common.apply')} />}
    >
      <div className="flex flex-col gap-5 pb-2">
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('checkout.giftCard.value')} error={touched ? valueError : undefined} hint={t('checkout.giftCard.valueHint', { min: money(min), max: money(max) })}>
            {(id) => <MoneyInput id={id} value={value} onChange={(v) => { setValue(v); if (price === '' || price === value) setPrice(v) }} />}
          </Field>
          <Field label={t('checkout.giftCard.price')} error={priceError}>
            {(id) => <MoneyInput id={id} value={price} onChange={setPrice} />}
          </Field>
        </div>
        <Field label={t('checkout.editItem.discounts')}>
          {(id) => <Select id={id} value={dealId} disabled={!available.length} onChange={(e) => setDealId(e.target.value)} options={[{ value: '', label: available.length ? t('checkout.editItem.noneSelected') : t('checkout.editItem.noneAvailable') }, ...available.map((d) => ({ value: d.id, label: `${d.name} (${d.discountType === 'percent' ? `${d.value}%` : money(d.value)} ${t('checkout.editItem.off')})` }))]} />}
        </Field>
        <Field label={t('checkout.giftCard.expiration')}>
          {(id) => <Select id={id} value={expiry} onChange={(e) => setExpiry(e.target.value)} options={EXPIRY_OPTIONS.map((o) => ({ value: o, label: o }))} />}
        </Field>
        <Checkbox label={t('checkout.giftCard.useCustomCode')} checked={useCustom} onChange={setUseCustom} />
        {useCustom && (
          <Field label={t('checkout.giftCard.codeLabel')} hint={t('checkout.giftCard.codeHint')} error={touched || code ? codeError : undefined}>
            {(id) => <TextInput id={id} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t('checkout.giftCard.codePlaceholder')} invalid={Boolean((touched || code) && codeError)} />}
          </Field>
        )}
        <Checkbox label={t('checkout.giftCard.isGift')} hint={t('checkout.giftCard.isGiftHint')} checked={isGift} onChange={setIsGift} />
        <Checkbox label={t('checkout.giftCard.sendEmail')} hint={c.clientId ? t('checkout.giftCard.sendEmailHint') : t('checkout.giftCard.sendEmailNoClient')} checked={sendEmail && Boolean(c.clientId)} disabled={!c.clientId} onChange={setSendEmail} />
        <Field label={t('checkout.editItem.teamMember')}>{(id) => <MemberSelect id={id} value={memberId} onChange={setMemberId} />}</Field>
      </div>
    </Modal>
  )
}

/** "Sell custom" package or membership. */
export function SellCustomModal({ type, onClose }: { type: 'package' | 'membership'; onClose: () => void }) {
  const { t } = useTranslation()
  const c = useCheckout()
  const [name, setName] = useState(type === 'package' ? t('checkout.custom.packageName') : t('checkout.custom.membershipName'))
  const [price, setPrice] = useState<number | ''>('')
  const [memberId, setMemberId] = useState(c.defaultMemberId ?? '')
  const [touched, setTouched] = useState(false)
  const invalid = !name.trim() || price === '' || num(price) < 0
  const add = () => {
    setTouched(true)
    if (invalid) return
    c.addLine({ type, name: name.trim(), detail: type === 'package' ? t('checkout.custom.customPackage') : t('checkout.custom.customMembership'), quantity: 1, unitPrice: round2(num(price)), teamMemberId: memberId || null })
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={type === 'package' ? t('checkout.custom.titlePackage') : t('checkout.custom.titleMembership')}
      footer={
        <>
          <Button onClick={onClose}>{t('checkout.common.cancel')}</Button>
          <Button variant="primary" onClick={add}>
            {t('checkout.custom.add')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <Field label={t('checkout.custom.name')} error={touched && !name.trim() ? t('checkout.custom.nameRequired') : undefined}>
          {(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label={t('checkout.editItem.price')} error={touched && (price === '' || num(price) < 0) ? t('checkout.editItem.priceRequired') : undefined}>
          {(id) => <MoneyInput id={id} value={price} onChange={setPrice} />}
        </Field>
        <Field label={t('checkout.editItem.teamMember')}>{(id) => <MemberSelect id={id} value={memberId} onChange={setMemberId} />}</Field>
      </div>
    </Modal>
  )
}

/** Add › Quick payment: "Enter amount" keypad (calendar.md §16). */
export function QuickPaymentModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const c = useCheckout()
  const [text, setText] = useState('')
  const amount = parseAmount(text)
  const dismiss = () => {
    onClose()
    if (!c.lines.length) c.close()
  }
  const go = () => {
    c.addLine({ type: 'manual', name: 'Manual payment', quantity: 1, unitPrice: amount, teamMemberId: c.defaultMemberId })
    onClose()
    c.goto(c.tippingEnabled ? 'tip' : 'payment')
  }
  return (
    <Modal open onClose={dismiss} size="sm" title={t('checkout.quickPayment.title')}>
      <p className={`py-6 text-center font-display text-[44px] font-bold leading-[52px] tabular ${amount ? 'text-ink' : 'text-subtle'}`} aria-live="polite">
        €{text || '0'}
      </p>
      <Keypad rounded={false} onPress={(k) => setText((s) => keypadPress(s, k))} />
      <div className="mt-6 flex h-12 justify-end">
        {amount > 0 && (
          <Button variant="primary" size="lg" className="w-full rounded-full" onClick={go} data-testid="quick-payment-continue">
            {t('checkout.common.continue')}
          </Button>
        )}
      </div>
    </Modal>
  )
}

type QuickItem = Settings['quickSaleItems'][number]

/** "Quick sale items" full-screen editor: search, drag and drop, max 12. */
export function QuickSaleEditor({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const data = useDb(useShallow((s) => ({ items: s.settings.quickSaleItems, services: s.services, products: s.products, categories: s.serviceCategories })))
  const [items, setItems] = useState<QuickItem[]>(data.items)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const dirty = JSON.stringify(items) !== JSON.stringify(data.items)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  const describe = (item: QuickItem) => {
    if (item.type === 'service') {
      const s = data.services.find((x) => x.id === item.id)
      return s ? { name: s.name, price: s.price, color: PALETTE[data.categories.find((cat) => cat.id === s.categoryId)?.color ?? 'blue'].edge } : undefined
    }
    const p = data.products.find((x) => x.id === item.id)
    return p ? { name: p.name, price: p.retailPrice, color: PALETTE.amber.edge } : undefined
  }
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const taken = (type: string, id: string) => items.some((i) => i.type === type && i.id === id)
    return [
      ...data.services.filter((s) => !s.archived && s.name.toLowerCase().includes(q) && !taken('service', s.id)).map((s) => ({ type: 'service' as const, id: s.id, name: s.name, price: s.price })),
      ...data.products.filter((p) => !p.archived && p.retailSales && p.name.toLowerCase().includes(q) && !taken('product', p.id)).map((p) => ({ type: 'product' as const, id: p.id, name: p.name, price: p.retailPrice })),
    ].slice(0, 8)
  }, [query, items, data.services, data.products])

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const from = items.findIndex((i) => `${i.type}:${i.id}` === e.active.id)
    const to = items.findIndex((i) => `${i.type}:${i.id}` === e.over!.id)
    setItems(arrayMove(items, from, to))
  }
  const save = async () => {
    setBusy(true)
    try {
      await saveQuickSaleItems(items)
      toast(t('checkout.toasts.quickSaleSaved'))
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : t('checkout.errors.generic'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col overflow-y-auto bg-surface" role="dialog" aria-modal="true" aria-label={t('checkout.quickSale.title')}>
      <div className="flex justify-end gap-2 px-8 py-4">
        <Button className="rounded-full" onClick={onClose}>
          {t('checkout.common.close')}
        </Button>
        <Button variant="primary" className="rounded-full" disabled={!dirty} loading={busy} onClick={() => void save()}>
          {t('checkout.common.save')}
        </Button>
      </div>
      <div className="mx-auto w-full max-w-5xl px-8 pb-16">
        <h1 className="font-display text-display text-ink">{t('checkout.quickSale.title')}</h1>
        <p className="mt-2 text-body-lg text-muted">{t('checkout.quickSale.subtitle')}</p>
        <div className="relative mt-8">
          <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            role="combobox"
            aria-expanded={results.length > 0}
            aria-label={t('checkout.quickSale.search')}
            placeholder={t('checkout.quickSale.search')}
            value={query}
            disabled={items.length >= 12}
            onChange={(e) => setQuery(e.target.value)}
            className="input h-12 pl-11"
          />
          {results.length > 0 && (
            <ul role="listbox" className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-line bg-raised shadow-md">
              {results.map((r) => (
                <li key={`${r.type}${r.id}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-body hover:bg-sunken"
                    onClick={() => {
                      setItems((prev) => (prev.length >= 12 ? prev : [...prev, { type: r.type, id: r.id }]))
                      setQuery('')
                    }}
                  >
                    <span>
                      {r.name} <span className="text-muted">· {r.type === 'service' ? t('checkout.cart.kinds.service') : t('checkout.cart.kinds.product')}</span>
                    </span>
                    <span className="tabular">{money(r.price)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="mt-2 text-small text-muted">{t('checkout.quickSale.max', { count: items.length })}</p>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((i) => `${i.type}:${i.id}`)} strategy={rectSortingStrategy}>
            <div className="mt-6 grid grid-cols-2 gap-5">
              {items.map((item) => {
                const info = describe(item)
                return <SortableTile key={`${item.type}:${item.id}`} id={`${item.type}:${item.id}`} name={info?.name ?? t('checkout.quickSale.missing')} price={info?.price ?? 0} color={info?.color ?? PALETTE.teal.edge} onDelete={() => setItems((prev) => prev.filter((i) => i !== item))} />
              })}
              {Array.from({ length: Math.max(0, 12 - items.length) }, (_, i) => (
                <div key={`empty${i}`} className="h-[120px] rounded-lg border border-dashed border-line" aria-hidden />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>,
    document.body,
  )
}

function SortableTile({ id, name, price, color, onDelete }: { id: string; name: string; price: number; color: string; onDelete: () => void }) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`relative flex h-[120px] items-center justify-between overflow-hidden rounded-lg border border-line bg-surface pl-8 pr-4 ${isDragging ? 'z-10 shadow-md' : ''}`}>
      <span className="absolute bottom-0 left-0 top-0 w-2" style={{ background: color }} aria-hidden />
      <button type="button" className="flex min-w-0 flex-1 cursor-grab items-center gap-3 text-left active:cursor-grabbing" aria-label={t('checkout.quickSale.reorder', { name })} {...attributes} {...listeners}>
        <GripVertical size={18} className="shrink-0 text-subtle" aria-hidden />
        <span className="min-w-0">
          <span className="block truncate text-body-lg text-ink">{name}</span>
          <span className="block text-body text-muted tabular">{money(price)}</span>
        </span>
      </button>
      <button type="button" onClick={onDelete} aria-label={t('checkout.quickSale.delete')} title={t('checkout.quickSale.delete')} className="icon-btn">
        <Trash2 size={18} aria-hidden />
      </button>
    </div>
  )
}


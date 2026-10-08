import { Coins } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { Button, Checkbox, Field, Modal, MoneyInput, Segmented, TextArea, TextInput, toast } from '@/components/ui'
import { openRegister } from '@/api/register'
import { useDb } from '@/store/db'
import { money, round2 } from '@/lib/format'
import { getLang } from '@/i18n/language'
import { useCheckout } from './context'
import { cartTotals } from './model'
import { useRegisterBlocked } from './PaymentStep'

/** Cash count rows: €5 / 50c in English (as before), 5 € / 0,50 € in Portuguese. */
const denomination = (d: number) => (d >= 1 || getLang() === 'pt' ? money(d) : `${Math.round(d * 100)}c`)

/** "Add cart discount": € / % with "Total after discount" (calendar.md §10 step 4). */
export function CartDiscountModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const c = useCheckout()
  const [type, setType] = useState<'amount' | 'percent'>(c.cartDiscount?.type ?? 'percent')
  const [value, setValue] = useState<number | ''>(c.cartDiscount?.value ?? '')
  const before = c.totals.itemsTotal
  const v = value === '' ? 0 : value
  const after = cartTotals(c.lines, [], v > 0 ? { type, value: v } : undefined, []).subtotal
  const error = value === '' ? undefined : v <= 0 ? t('checkout.discount.positive') : type === 'percent' && v > 100 ? t('checkout.discount.maxPercent') : type === 'amount' && v > before ? t('checkout.discount.maxAmount', { amount: money(before) }) : undefined
  const add = () => {
    if (value === '' || error) return
    c.setCartDiscount({ type, value: round2(v) })
    toast(t('checkout.toasts.discountAdded'))
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={t('checkout.discount.title')}
      subtitle={t('checkout.discount.subtitle')}
      footer={
        <div className="flex w-full items-center justify-between">
          <div>
            <p className="text-body text-ink">{t('checkout.discount.totalAfter')}</p>
            <p className="font-display text-title-3 text-ink tabular">
              {money(after)} {after !== before && <span className="text-body font-normal text-muted line-through">{money(before)}</span>}
            </p>
          </div>
          <div className="flex gap-2">
            {c.cartDiscount && (
              <Button
                variant="ghost"
                className="rounded-full text-danger"
                onClick={() => {
                  c.setCartDiscount(undefined)
                  onClose()
                }}
              >
                {t('checkout.discount.remove')}
              </Button>
            )}
            <Button variant="primary" size="lg" className="rounded-full" disabled={value === '' || Boolean(error)} onClick={add}>
              {t('checkout.common.add')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="pb-2">
        <Field label={t('checkout.discount.amount')} error={error}>
          {(id) => (
            <div className="flex items-center gap-3">
              <TextInput id={id} className="max-w-[240px]" type="number" min={0} step="0.01" inputMode="decimal" prefix={type === 'percent' ? '%' : '€'} value={value} onChange={(e) => setValue(e.target.value === '' ? '' : Number(e.target.value))} invalid={Boolean(error)} />
              <Segmented
                value={type}
                onChange={setType}
                items={[
                  { value: 'amount', label: <span className="flex items-center gap-1"><Coins size={16} aria-hidden />€</span> },
                  { value: 'percent', label: '%' },
                ]}
              />
            </div>
          )}
        </Field>
      </div>
    </Modal>
  )
}

/** "Add receipt note" (0/200). */
export function ReceiptNoteModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const c = useCheckout()
  const [note, setNote] = useState(c.receiptNote)
  return (
    <Modal
      open
      onClose={onClose}
      title={t('checkout.note.title')}
      footer={
        <Button
          variant="primary"
          size="lg"
          className="rounded-full"
          onClick={() => {
            c.setReceiptNote(note.trim())
            if (note.trim()) toast(t('checkout.toasts.noteAdded'))
            onClose()
          }}
        >
          {t('checkout.common.add')}
        </Button>
      }
    >
      <div className="pb-2">
        <Field label={t('checkout.note.label')} counter={{ value: note.length, max: 200 }} hint={t('checkout.note.hint')}>
          {(id) => <TextArea id={id} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </div>
    </Modal>
  )
}

/** "Add service charge": settings.serviceCharges, or an empty state linking to Settings. */
export function ServiceChargeModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const c = useCheckout()
  const navigate = useNavigate()
  const charges = useDb(useShallow((s) => s.settings.serviceCharges.filter((x) => x.inStore)))
  const [selected, setSelected] = useState<string[]>(c.serviceCharges.map((x) => x.id))
  const amountOf = useMemo(() => (id: string) => {
    const ch = charges.find((x) => x.id === id)
    if (!ch) return 0
    return ch.rateType === 'flat' ? ch.amount : round2((c.totals.subtotal * ch.amount) / 100)
  }, [charges, c.totals.subtotal])
  const apply = () => {
    c.setServiceCharges(selected.map((id) => ({ id, name: charges.find((x) => x.id === id)?.name ?? '', amount: amountOf(id) })))
    if (selected.length) toast(t('checkout.toasts.chargeAdded'))
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={t('checkout.charges.title')}
      footer={
        charges.length ? (
          <Button variant="primary" size="lg" className="rounded-full" onClick={apply}>
            {t('checkout.common.apply')}
          </Button>
        ) : undefined
      }
    >
      <div className="pb-2">
        {charges.length === 0 ? (
          <p className="text-body text-muted" data-testid="service-charge-empty">
            {t('checkout.charges.empty')}{' '}
            <button
              type="button"
              className="font-semibold text-primary hover:underline"
              onClick={() => {
                onClose()
                navigate('/setup/sales/service-charges')
              }}
            >
              {t('checkout.charges.link')}
            </button>
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {charges.map((ch) => (
              <Checkbox
                key={ch.id}
                label={`${ch.name} · ${money(amountOf(ch.id))}`}
                hint={[ch.description, ch.rateType === 'percent' ? t('checkout.charges.percentOf', { value: ch.amount }) : undefined].filter(Boolean).join(' · ')}
                checked={selected.includes(ch.id)}
                onChange={(on) => setSelected((prev) => (on ? [...prev, ch.id] : prev.filter((x) => x !== ch.id)))}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

const DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01]

/** "Open cash register" with float, cash counter and note (catalog.md §2 Sell). */
export function OpenRegisterModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const c = useCheckout()
  const { registerId } = useRegisterBlocked(c.locationId)
  const data = useDb(useShallow((s) => ({ registers: s.registers, sessions: s.registerSessions })))
  const register = data.registers.find((r) => r.id === registerId)
  const lastClosed = data.sessions.filter((s) => s.registerId === registerId && s.closedAt).sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''))[0]
  const left = lastClosed?.closingFloat ?? 0
  const [float, setFloat] = useState<number | ''>(left)
  const [note, setNote] = useState('')
  const [counting, setCounting] = useState(false)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const counted = round2(DENOMINATIONS.reduce((s, d) => s + d * (counts[d] ?? 0), 0))
  const min = register?.settings.minFloat && register.settings.minFloat.when !== 'closing' ? register.settings.minFloat.amount : undefined
  const error = float === '' ? t('checkout.register.floatRequired') : float < 0 ? t('checkout.register.floatInvalid') : min !== undefined && float < min ? t('checkout.register.minFloat', { amount: money(min) }) : undefined
  const open = async () => {
    if (!registerId || error) return
    setBusy(true)
    try {
      await openRegister(registerId, Number(float), note.trim() || undefined)
      toast(t('checkout.toasts.registerOpened'))
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : t('checkout.errors.generic'), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t('checkout.register.modalTitle')}
      subtitle={register ? register.name : undefined}
      footer={
        <>
          <Button onClick={onClose}>{t('checkout.common.cancel')}</Button>
          <Button variant="primary" loading={busy} disabled={Boolean(error)} onClick={() => void open()} data-testid="open-register-confirm">
            {t('checkout.register.open')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        <p className="rounded-md bg-sunken px-4 py-3 text-body text-ink">{t('checkout.register.leftFromClose', { amount: money(left) })}</p>
        <div className="flex items-end gap-3">
          <Field className="flex-1" label={t('checkout.register.float')} error={error}>
            {(id) => <MoneyInput id={id} value={float} onChange={setFloat} />}
          </Field>
          <Button className="mb-[1px]" onClick={() => setCounting((v) => !v)} aria-expanded={counting}>
            {t('checkout.register.count')}
          </Button>
        </div>
        {counting && (
          <div className="rounded-lg border border-line p-4">
            <div className="grid grid-cols-3 gap-3">
              {DENOMINATIONS.map((d) => (
                <label key={d} className="flex items-center justify-between gap-2 text-body text-ink">
                  <span className="w-14 tabular">{denomination(d)}</span>
                  <input type="number" min={0} className="input h-9 w-20 px-2" value={counts[d] ?? ''} onChange={(e) => setCounts((prev) => ({ ...prev, [d]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))} aria-label={t('checkout.register.countOf', { value: denomination(d) })} />
                </label>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <p className="text-body-strong text-ink">{t('checkout.register.totalCounted', { amount: money(counted) })}</p>
              <Button size="sm" onClick={() => setFloat(counted)}>
                {t('checkout.register.useCount')}
              </Button>
            </div>
          </div>
        )}
        <Field label={t('checkout.register.note')} optional counter={{ value: note.length, max: 255 }}>
          {(id) => <TextArea id={id} maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </div>
    </Modal>
  )
}

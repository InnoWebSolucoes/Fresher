import clsx from 'clsx'
import { parseISO } from 'date-fns'
import { format } from '@/lib/dates'
import { ArrowLeft, ArrowRight, CircleDollarSign, Receipt } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, EmptyState, Field, FullscreenFrame, IconButton, LearnMore, Segmented, Select, toast } from '@/components/ui'
import { computeTotals, lineTotal, refundSale } from '@/api/sales'
import { ApiError } from '@/api/client'
import { useDb } from '@/store/db'
import { fmtDateEU, money, round2, taxIncluded } from '@/lib/format'
import type { PaymentMethod, SaleItem } from '@/types'
import { AmountInput, parseAmount } from '../shared/ui'
import { methodLabelOf, useLookups } from '../shared/data'

const REASONS = ['accidental', 'incorrectAmount', 'duplicate', 'notAvailable', 'clientRequest', 'fraud', 'other'] as const
type Mode = 'item' | 'amount'

/** Same line refunded before: matched on type, catalog ref and appointment line. */
const sameLine = (a: SaleItem, b: SaleItem) => a.type === b.type && a.refId === b.refId && a.appointmentItemId === b.appointmentItemId && a.name === b.name

/** Refund sale (sales.md §4): Refund item | Refund amount, then method, register and reason. */
export function RefundSalePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { saleId } = useParams()
  const sales = useDb((s) => s.sales)
  const payments = useDb((s) => s.payments)
  const registers = useDb((s) => s.registers)
  const appointments = useDb((s) => s.appointments)
  const lookups = useLookups()
  const sale = sales.find((s) => s.id === saleId)

  const [mode, setMode] = useState<Mode>('item')
  const [step, setStep] = useState<'select' | 'details'>('select')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<string>('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<{ amount?: string; reason?: string }>({})
  const [saving, setSaving] = useState(false)

  const info = useMemo(() => {
    if (!sale) return null
    const refunds = sales.filter((s) => s.kind === 'refund' && s.refundOfId === sale.id)
    const refundedItems = refunds.flatMap((r) => r.items)
    const refunded = round2(-refunds.flatMap((r) => r.paymentIds).reduce((s, id) => s + (payments.find((p) => p.id === id)?.amount ?? 0), 0))
    const salePayments = payments.filter((p) => sale.paymentIds.includes(p.id) && p.status === 'succeeded')
    const paid = round2(salePayments.reduce((s, p) => s + p.amount, 0))
    const totals = computeTotals(sale)
    const factor = totals.itemsTotal ? totals.subtotal / totals.itemsTotal : 1
    const available = Math.max(0, round2(Math.min(totals.subtotal + totals.serviceCharges, paid) - refunded))
    const items = sale.items.map((item) => ({ item, total: lineTotal(item), refunded: refundedItems.some((r) => sameLine(r, item)) }))
    const originals = [...new Set(salePayments.filter((p) => p.method !== 'gift_card' && p.method !== 'deposit').map((p) => (p.method === 'custom' ? `custom:${p.methodLabel}` : p.method)))]
    return { totals, factor, available, items, originals, paid }
  }, [sale, sales, payments])

  const close = () => navigate(sale ? `/sales/sales-list?drawer=sale&id=${sale.id}` : '/sales/sales-list')

  if (!sale || !info || sale.kind !== 'sale' || !['completed', 'part_paid'].includes(sale.status)) {
    return (
      <FullscreenFrame onClose={() => navigate('/sales/sales-list')}>
        <EmptyState
          icon={<Receipt size={24} aria-hidden />}
          title={sale ? t('sales.refund.notRefundable') : t('sales.refund.notFound')}
          body={t('sales.refund.notRefundableHint')}
          action={<Button onClick={() => navigate('/sales/sales-list')}>{t('sales.refund.backToSales')}</Button>}
        />
      </FullscreenFrame>
    )
  }

  const location = lookups.location.get(sale.locationId)
  const register = registers.find((r) => r.locationId === sale.locationId && !r.archived)
  const selectable = info.items.filter((i) => !i.refunded)
  const selectedLines = selectable.filter((i) => selected.has(i.item.id))
  const selectedGross = round2(selectedLines.reduce((s, i) => s + i.total, 0))
  const itemRefund = round2(Math.min(selectedGross * info.factor, info.available))
  const itemDiscount = round2(selectedGross * info.factor - selectedGross)
  const itemTax = taxIncluded(round2(selectedLines.filter((i) => i.item.taxRate > 0).reduce((s, i) => s + i.total, 0) * info.factor))
  const refundTotal = mode === 'item' ? itemRefund : (parseAmount(amount) ?? 0)
  const methodKey = method || info.originals[0] || 'cash'
  const methodOptions = [...new Set([...info.originals, 'cash', 'other'])]
  const methodLabel = (key: string) => (key.startsWith('custom:') ? key.slice(7) : methodLabelOf(key as PaymentMethod))

  const subtitle = (
    <p className="mt-2 text-body-lg text-muted">
      {t('sales.refund.saleNumber', { number: sale.number })} • {format(parseISO(sale.createdAt), 'EEEE, MMM d, yyyy')} • {location?.name}
      <span className="block">
        <LearnMore topic={t('sales.helpTopics.refunds')}>{t('common.learnMore')}</LearnMore>
      </span>
    </p>
  )

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const issue = async () => {
    const next: typeof errors = {}
    if (mode === 'amount') {
      const value = parseAmount(amount)
      if (value === null || value <= 0) next.amount = t('sales.refund.amountRequired')
      else if (value > info.available + 0.001) next.amount = t('sales.refund.amountTooHigh', { amount: money(info.available) })
    }
    if (!reason) next.reason = t('sales.refund.reasonRequired')
    setErrors(next)
    if (Object.keys(next).length) return
    setSaving(true)
    try {
      const isCustom = methodKey.startsWith('custom:')
      const refund = await refundSale({
        saleId: sale.id,
        itemIds: mode === 'item' ? selectedLines.map((i) => i.item.id) : undefined,
        amount: mode === 'amount' ? (parseAmount(amount) ?? 0) : itemRefund < round2(selectedGross * info.factor) ? itemRefund : undefined,
        method: isCustom ? 'custom' : (methodKey as PaymentMethod),
        // Stored with the payment (data), in the language of the moment like checkout payments.
        methodLabel: methodLabel(methodKey),
        reason: t(`sales.refund.reasons.${reason}`),
      })
      toast(t('sales.refund.issued'))
      navigate(`/sales/sales-list?drawer=sale&id=${refund.id}`)
    } catch (e) {
      toast(e instanceof ApiError || e instanceof Error ? e.message : t('sales.common.somethingWrong'), 'error')
      setSaving(false)
    }
  }

  const detailsForm = (
    <div className="flex flex-col gap-5">
      <div className={clsx('grid gap-4', mode === 'amount' && 'sm:grid-cols-2')}>
        <Field label={t('sales.refund.method')} hint={info.originals.includes(methodKey) ? t('sales.refund.originalMethod') : undefined}>
          {(id) => (
            <div className="relative">
              <CircleDollarSign size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-primary" aria-hidden />
              <Select id={id} value={methodKey} onChange={(e) => setMethod(e.target.value)} options={methodOptions.map((m) => ({ value: m, label: methodLabel(m) }))} className="pl-10" />
            </div>
          )}
        </Field>
        {mode === 'amount' && (
          <Field label={t('sales.refund.amount')} error={errors.amount} hint={t('sales.refund.available', { amount: money(info.available) })}>
            {(id) => <AmountInput id={id} value={amount} onChange={setAmount} invalid={Boolean(errors.amount)} />}
          </Field>
        )}
      </div>
      <Field label={t('sales.refund.register')}>
        {(id) => <Select id={id} disabled value="register" onChange={() => undefined} options={[{ value: 'register', label: register ? `${location?.name ?? ''} • ${register.name}` : t('sales.refund.noRegister') }]} className="bg-sunken text-muted" />}
      </Field>
      <Field label={t('sales.refund.reason')} error={errors.reason}>
        {(id) => <Select id={id} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('sales.refund.reasonPlaceholder')} options={REASONS.map((r) => ({ value: r, label: t(`sales.refund.reasons.${r}`) }))} aria-invalid={Boolean(errors.reason)} />}
      </Field>
    </div>
  )

  const primary =
    mode === 'item' && step === 'select' ? (
      <Button variant="primary" disabled={selectedLines.length === 0 || itemRefund <= 0} onClick={() => setStep('details')} iconRight={<ArrowRight size={16} aria-hidden />}>
        {t('sales.common.continue')}
      </Button>
    ) : (
      <Button variant="primary" loading={saving} onClick={() => void issue()}>
        {t('sales.refund.issue')}
      </Button>
    )

  return (
    <FullscreenFrame onClose={close} actions={primary}>
      {mode === 'item' && step === 'details' ? (
        <>
          <IconButton label={t('sales.common.back')} onClick={() => setStep('select')} className="mb-6 h-11 w-11 rounded-full border border-line-strong bg-surface">
            <ArrowLeft size={20} aria-hidden />
          </IconButton>
          <h1 className="font-display text-[26px] font-bold leading-[34px] text-ink md:text-[34px] md:leading-[42px]">{t('sales.refund.refundAmountTitle', { amount: money(refundTotal) })}</h1>
          {subtitle}
          <div className="mt-8">{detailsForm}</div>
        </>
      ) : (
        <>
          <h1 className="font-display text-[26px] font-bold leading-[34px] text-ink md:text-[34px] md:leading-[42px]">{t('sales.refund.title')}</h1>
          {subtitle}
          <Segmented
            className="mt-6 grid w-full grid-cols-2 md:mt-8"
            value={mode}
            onChange={(m) => {
              setMode(m)
              setErrors({})
              if (m === 'amount' && !amount) setAmount(info.available.toFixed(2))
            }}
            items={[
              { value: 'item', label: t('sales.refund.refundItem') },
              { value: 'amount', label: t('sales.refund.refundAmount') },
            ]}
          />
          {mode === 'item' ? (
            <div className="mt-6">
              <div className="flex items-center justify-between border-b border-line pb-4">
                <label className="flex cursor-pointer items-center gap-3 text-body-strong text-ink">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-[rgb(var(--primary))]"
                    checked={selectable.length > 0 && selectedLines.length === selectable.length}
                    disabled={selectable.length === 0}
                    onChange={(e) => setSelected(new Set(e.target.checked ? selectable.map((i) => i.item.id) : []))}
                  />
                  {t('sales.refund.allItems')}
                </label>
                <span className="text-body-strong text-ink">{t('sales.refund.amountCol')}</span>
              </div>
              <ul className="divide-y divide-line border-b border-line">
                {info.items.map(({ item, total, refunded }) => {
                  const appt = appointments.find((a) => a.id === item.appointmentId)
                  const apptItem = appt?.items.find((i) => i.id === item.appointmentItemId)
                  const member = item.teamMemberId ? lookups.member.get(item.teamMemberId) : undefined
                  const when = apptItem && appt ? `${apptItem.start}, ${fmtDateEU(appt.date)}` : fmtDateEU(sale.createdAt)
                  return (
                    <li key={item.id} className={clsx('flex items-center gap-3 py-4', refunded && 'opacity-60')}>
                      <input type="checkbox" aria-label={item.name} className="h-5 w-5 shrink-0 accent-[rgb(var(--primary))]" disabled={refunded} checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
                      <div className="min-w-0 flex-1">
                        <p className="text-body-strong text-ink">
                          {item.quantity > 1 ? `${item.quantity} × ` : ''}
                          {item.name}
                        </p>
                        <p className="text-small text-muted">
                          {refunded ? t('sales.refund.alreadyRefunded') : member ? t('sales.refund.itemWith', { when, name: `${member.firstName} ${member.lastName}` }) : when}
                        </p>
                      </div>
                      <span className="text-body-strong text-ink tabular">{money(total)}</span>
                    </li>
                  )
                })}
              </ul>
              <dl className="mt-5 flex flex-col gap-1.5 text-body">
                <div className="flex justify-between text-muted">
                  <dt>{t('sales.refund.cartDiscount')}</dt>
                  <dd className="tabular">{money(itemDiscount)}</dd>
                </div>
                <div className="flex justify-between text-muted">
                  <dt>{t('sales.refund.tax')}</dt>
                  <dd className="tabular">{money(itemTax)}</dd>
                </div>
                <div className="flex justify-between text-body-lg font-semibold text-ink">
                  <dt>{t('sales.refund.totalToRefund')}</dt>
                  <dd className="tabular">{money(itemRefund)}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="mt-8">{detailsForm}</div>
          )}
        </>
      )}
    </FullscreenFrame>
  )
}

import { ChevronDown, ChevronRight, ChevronUp, ReceiptText, Percent, ShoppingCart, Sparkles, Trash2, UserPlus, Coins } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { Avatar, Button, Menu, MenuButton, confirm, toast } from '@/components/ui'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { durationLabel } from '@/lib/time'
import { fullName, money } from '@/lib/format'
import { lineTotal } from '@/api/sales'
import { discardDraftSale } from '@/api/checkout'
import { useCheckout } from './context'
import { appliedOfferKey, giftDetail, lineColor, lineDuration, type Line } from './model'
import { OfferTag, useCartOffers } from './OffersModal'
import { DropMenu, TotalRow } from './ui'

/** Right-hand summary column: client, cart lines, totals and footer buttons. */
export function Summary() {
  const { t } = useTranslation()
  const c = useCheckout()
  return (
    // Phones: the aside's parts join the drawer's single scrolling column, so the totals bar can stick to the bottom of the screen.
    <aside className="contents w-[460px] shrink-0 flex-col border-l border-line bg-surface md:flex" aria-label={t('checkout.summary.label')}>
      <div className="flex-none border-t border-line px-4 pb-4 pt-5 md:min-h-0 md:flex-1 md:overflow-y-auto md:border-t-0 md:px-8 md:pt-8">
        <ClientCard />
        {c.lines.length ? (
          <>
            <ul className="mt-6 flex flex-col gap-1">
              {c.lines.map((line) => (
                <CartLine key={line.key} line={line} />
              ))}
            </ul>
            {c.step !== 'cart' && (
              <Button className="mt-4 rounded-full" icon={<ShoppingCart size={16} aria-hidden />} onClick={() => c.goto('cart')}>
                {t('checkout.summary.addToCart')}
              </Button>
            )}
            {(c.cartDiscount || c.receiptNote || c.serviceCharges.length > 0) && <Extras />}
          </>
        ) : (
          <div className="flex flex-col items-center px-6 py-8 text-center md:py-20" data-testid="empty-cart">
            <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-subtle text-primary">
              <ShoppingCart size={28} aria-hidden />
            </span>
            <p className="font-display text-title-3 text-ink">{t('checkout.summary.emptyTitle')}</p>
            <p className="mt-2 text-body text-muted">{t('checkout.summary.emptyBody')}</p>
          </div>
        )}
      </div>
      {c.lines.length > 0 && <OffersBar />}
      <Totals />
    </aside>
  )
}

function ClientCard() {
  const { t } = useTranslation()
  const c = useCheckout()
  const drawer = useDrawer()
  const client = useDb((s) => s.clients.find((x) => x.id === c.clientId))
  if (!client) {
    return (
      <button type="button" onClick={() => c.setView('client')} className="flex w-full items-center justify-between gap-4 rounded-lg border border-line p-5 text-left hover:bg-sunken/60" data-testid="checkout-add-client">
        <span>
          <span className="block text-body-lg font-semibold text-ink">{t('checkout.client.addClient')}</span>
          <span className="block text-body text-muted">{t('checkout.client.leaveEmpty')}</span>
        </span>
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-subtle text-primary">
          <UserPlus size={24} aria-hidden />
        </span>
      </button>
    )
  }
  return (
    <div className="rounded-lg border border-line p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-body-lg font-semibold text-ink">{fullName(client)}</p>
          <p className="truncate text-body text-muted">{client.email || client.phone}</p>
        </div>
        <Avatar name={fullName(client)} photo={client?.photo} size={56} />
      </div>
      <div className="mt-4">
        <Menu
          align="left"
          trigger={({ open, toggle }) => (
            <MenuButton open={open} toggle={toggle}>
              {t('checkout.client.actions')}
            </MenuButton>
          )}
          groups={[
            {
              items: [
                { label: t('checkout.client.viewProfile'), onSelect: () => drawer.open('client', { id: client.id }) },
                { label: t('checkout.client.change'), onSelect: () => c.setView('client') },
                { label: t('checkout.client.remove'), danger: true, onSelect: () => c.setClientId(null) },
              ],
            },
          ]}
        />
      </div>
    </div>
  )
}

function CartLine({ line }: { line: Line }) {
  const { t } = useTranslation()
  const c = useCheckout()
  const data = useDb(useShallow((s) => ({ services: s.services, serviceCategories: s.serviceCategories, memberships: s.memberships, appointments: s.appointments, teamMembers: s.teamMembers })))
  const member = data.teamMembers.find((m) => m.id === line.teamMemberId)
  const duration = lineDuration(line, data)
  const total = lineTotal(line)
  const gross = line.unitPrice * line.quantity
  const detail =
    line.type === 'gift_card'
      ? giftDetail(line)
      : line.type === 'package' || line.type === 'membership' || line.type === 'no_show_fee' || line.type === 'late_cancellation_fee'
        ? line.detail
        : line.type === 'product' && line.quantity > 1
          ? t('checkout.summary.qty', { count: line.quantity })
          : duration
            ? durationLabel(duration)
            : undefined
  const sub = [detail, member ? fullName(member) : undefined].filter(Boolean).join(' • ')
  const open = () => c.setModal(line.type === 'gift_card' ? { kind: 'giftCard', key: line.key } : { kind: 'editLine', key: line.key })
  return (
    <li>
      <button type="button" onClick={open} className="group relative flex w-full items-start gap-4 rounded-md py-3 pl-5 pr-2 text-left hover:bg-sunken/60" data-testid="cart-line">
        <span className="absolute bottom-3 left-0 top-3 w-1 rounded-full" style={{ background: lineColor(line, data) }} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-body-lg text-ink">
            {line.quantity > 1 && line.type !== 'product' ? `${line.quantity} × ` : ''}
            {line.name}
          </span>
          {sub && <span className="mt-0.5 block text-body text-muted">{sub}</span>}
          {(appliedOfferKey(line) || line.benefitNote) && <OfferTag className="mt-1.5" label={line.benefitNote ?? t('checkout.summary.discountApplied')} />}
        </span>
        <span className="flex flex-col items-end">
          <span className="text-body-lg text-ink tabular">{total === 0 && line.type !== 'manual' ? t('checkout.summary.free') : money(total)}</span>
          {(total !== gross || (line.originalPrice !== undefined && line.originalPrice > line.unitPrice)) && <span className="text-small text-muted line-through tabular">{money(Math.max(gross, (line.originalPrice ?? 0) * line.quantity))}</span>}
          <span className="mt-1 text-small font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">{t('checkout.summary.edit')}</span>
        </span>
      </button>
    </li>
  )
}

/** "Apply rewards or discounts" bar above the totals (calendar.md §10.9). */
function OffersBar() {
  const { t } = useTranslation()
  const c = useCheckout()
  const rows = useCartOffers()
  const available = rows.reduce((n, r) => n + r.offers.filter((o) => o.key !== appliedOfferKey(r.line)).length, 0)
  const applied = c.lines.filter((l) => appliedOfferKey(l)).length
  return (
    <div className="px-4 pb-4 pt-2 md:px-8 md:pb-7">
      <button type="button" onClick={() => c.setModal({ kind: 'offers' })} className="flex w-full items-center gap-3 rounded-lg border border-primary/30 bg-primary-subtle/60 px-4 py-3 text-left text-body-strong text-primary hover:bg-primary-subtle" data-testid="apply-offers">
        <Sparkles size={20} aria-hidden />
        <span className="flex-1">{t('checkout.offers.title')}</span>
        {applied > 0 ? (
          <span className="rounded-full bg-primary px-2 py-0.5 text-caption text-on-primary">{t('checkout.offers.appliedCount', { count: applied })}</span>
        ) : available > 0 ? (
          <span className="rounded-full bg-surface px-2 py-0.5 text-caption text-primary">{t('checkout.offers.availableCount', { count: available })}</span>
        ) : null}
        <ChevronRight size={18} aria-hidden />
      </button>
    </div>
  )
}

function Extras() {
  const { t } = useTranslation()
  const c = useCheckout()
  return (
    <div className="mt-6 flex flex-col gap-2 rounded-lg bg-sunken/70 p-4 text-body">
      {c.cartDiscount && (
        <div className="flex items-center justify-between gap-3">
          <button type="button" className="flex items-center gap-2 text-ink hover:underline" onClick={() => c.setModal({ kind: 'cartDiscount' })}>
            <Percent size={16} className="text-muted" aria-hidden />
            {t('checkout.summary.cartDiscount')} {c.cartDiscount.type === 'percent' ? `(${c.cartDiscount.value}%)` : ''}
          </button>
          <button type="button" aria-label={t('checkout.summary.removeDiscount')} className="icon-btn h-8 w-8 text-muted" onClick={() => c.setCartDiscount(undefined)}>
            <Trash2 size={16} aria-hidden />
          </button>
        </div>
      )}
      {c.serviceCharges.map((sc) => (
        <div key={sc.id} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-ink">
            <Coins size={16} className="text-muted" aria-hidden />
            {sc.name} · {money(sc.amount)}
          </span>
          <button type="button" aria-label={t('checkout.summary.removeCharge')} className="icon-btn h-8 w-8 text-muted" onClick={() => c.setServiceCharges(c.serviceCharges.filter((x) => x.id !== sc.id))}>
            <Trash2 size={16} aria-hidden />
          </button>
        </div>
      ))}
      {c.receiptNote && (
        <button type="button" className="flex items-start gap-2 text-left text-ink hover:underline" onClick={() => c.setModal({ kind: 'receiptNote' })}>
          <ReceiptText size={16} className="mt-0.5 shrink-0 text-muted" aria-hidden />
          <span className="min-w-0 break-words">
            <span className="block text-small text-muted">{t('checkout.summary.receiptNote')}</span>
            {c.receiptNote}
          </span>
        </button>
      )}
    </div>
  )
}

function Totals() {
  const { t } = useTranslation()
  const c = useCheckout()
  const [expanded, setExpanded] = useState(false)
  const paymentsRecords = useDb((s) => s.payments)
  const { totals } = c
  const previous = c.existingSale ? paymentsRecords.filter((p) => c.existingSale!.paymentIds.includes(p.id) && p.status === 'succeeded') : []
  const paidSoFar = c.alreadyPaid + c.deposit + c.pendingTotal
  const fullyPaid = c.lines.length > 0 && c.due <= 0.004
  const memberName = (id?: string | null) => c.members.find((m) => m.id === id)?.firstName

  const onCancel = async () => {
    const ok = await confirm({ title: t('checkout.options.cancelTitle'), body: t('checkout.options.cancelBody'), confirmLabel: t('checkout.options.cancelSale'), cancelLabel: t('checkout.options.keepSale'), tone: 'danger' })
    if (!ok) return
    if (c.existingSale && (c.existingSale.status === 'draft' || c.existingSale.status === 'unpaid')) {
      try {
        await discardDraftSale(c.existingSale.id)
      } catch (e) {
        toast(e instanceof Error ? e.message : t('checkout.errors.generic'), 'error')
        return
      }
    }
    toast(t('checkout.toasts.saleCanceled'))
    c.close()
  }

  const primary = (() => {
    if (c.step !== 'payment') {
      return (
        <Button
          variant="primary"
          size="lg"
          className="flex-1 rounded-full"
          disabled={!c.lines.length}
          data-testid="continue-to-payment"
          onClick={() => {
            if (c.step === 'cart' && c.tippingEnabled && !c.feeOnly) c.goto('tip')
            else c.goto('payment')
          }}
        >
          {t('checkout.footer.continueToPayment')}
        </Button>
      )
    }
    if (fullyPaid)
      return (
        <Button variant="primary" size="lg" className="flex-1 rounded-full" loading={c.busy} onClick={() => void c.submit('pay')} data-testid="pay-now">
          {t('checkout.footer.payNow')}
        </Button>
      )
    return (
      <Button size="lg" className="flex-1 rounded-full" loading={c.busy} disabled={!c.lines.length} onClick={() => void c.submit('unpaid')} data-testid="save-unpaid">
        {paidSoFar > 0 ? t('checkout.footer.savePartPaid') : t('checkout.footer.saveUnpaid')}
      </Button>
    )
  })()

  return (
    <div className="sticky bottom-0 z-10 mt-auto border-t border-line bg-surface px-4 pb-4 pt-5 md:relative md:bottom-auto md:z-auto md:mt-0 md:px-8 md:pb-6">
      {c.lines.length > 0 && (
        <button type="button" onClick={() => setExpanded((e) => !e)} aria-label={expanded ? t('checkout.summary.collapse') : t('checkout.summary.expand')} aria-expanded={expanded} className="absolute -top-5 left-1/2 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-xs hover:bg-sunken">
          {expanded ? <ChevronDown size={18} aria-hidden /> : <ChevronUp size={18} aria-hidden />}
        </button>
      )}
      {c.lines.length > 0 && (
        <div className="mb-4 flex flex-col gap-1.5" data-testid="checkout-totals">
          {expanded ? (
            <>
              {totals.cartDiscount > 0 && (
                <>
                  <TotalRow muted label={t('checkout.totals.beforeDiscount')} value={money(totals.itemsTotal)} />
                  <TotalRow muted label={t('checkout.totals.cartDiscount')} value={`-${money(totals.cartDiscount)}`} />
                </>
              )}
              <TotalRow muted label={t('checkout.totals.subtotal')} value={money(totals.subtotal)} />
              {c.serviceCharges.map((sc) => (
                <TotalRow key={sc.id} muted label={sc.name} value={money(sc.amount)} />
              ))}
              <TotalRow muted label={t('checkout.totals.tax')} value={money(totals.tax)} />
              <TotalRow label={<span className="font-semibold">{t('checkout.totals.total')}</span>} value={<span className="font-semibold">{money(totals.total)}</span>} />
              {totals.tips > 0 && <TotalRow label={t('checkout.totals.tips')} value={money(totals.tips)} onLabelClick={() => c.setModal({ kind: 'splitTip' })} />}
              {c.deposit > 0 && <TotalRow muted label={t('checkout.totals.deposit')} value={`-${money(c.deposit)}`} />}
              {(previous.length > 0 || c.payments.length > 0) && <div className="my-1 border-t border-line" />}
              {previous.map((p) => (
                <TotalRow key={p.id} muted label={`${p.methodLabel}${p.kind === 'deposit' ? ` (${t('checkout.totals.depositShort')})` : ''}`} value={`-${money(p.amount)}`} />
              ))}
              {c.payments.map((p) => (
                <div key={p.key} className="flex items-center justify-between gap-3 text-body text-muted">
                  <span className="flex items-center gap-1">
                    {p.methodLabel}
                    {p.collectedById && p.method === 'cash' ? ` • ${memberName(p.collectedById) ?? ''}` : ''}
                    <button type="button" aria-label={t('checkout.totals.removePayment')} title={t('checkout.totals.removePayment')} className="icon-btn h-8 w-8" onClick={() => c.removePayment(p.key)}>
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </span>
                  <span className="tabular">-{money(p.amount)}</span>
                </div>
              ))}
              <div className="my-1 border-t border-line" />
              <TotalRow strong label={fullyPaid ? t('checkout.totals.fullPaymentAdded') : t('checkout.totals.toPay')} value={fullyPaid ? '' : money(c.due)} />
            </>
          ) : (
            <>
              <TotalRow muted label={t('checkout.totals.total')} value={money(totals.total)} />
              {totals.tips > 0 && <TotalRow label={t('checkout.totals.tips')} value={money(totals.tips)} onLabelClick={() => c.setModal({ kind: 'splitTip' })} />}
              {paidSoFar > 0 && <TotalRow muted label={t('checkout.totals.payments')} value={`-${money(paidSoFar)}`} />}
              <button type="button" onClick={() => setExpanded(true)} className="flex items-center justify-between gap-4 text-left text-body-lg font-semibold text-ink">
                <span className="flex items-center gap-1">
                  {fullyPaid ? t('checkout.totals.fullPaymentAdded') : t('checkout.totals.toPay')}
                  <ChevronRight size={18} aria-hidden />
                </span>
                <span className="tabular">{fullyPaid ? '' : money(Math.max(0, c.due))}</span>
              </button>
            </>
          )}
        </div>
      )}
      <div className="flex items-center gap-3">
        <DropMenu
          label={t('checkout.footer.openOptions')}
          groups={[
            {
              heading: t('checkout.options.quickActions'),
              items: [
                { label: t('checkout.options.addCartDiscount'), icon: <Percent size={16} aria-hidden />, onSelect: () => c.setModal({ kind: 'cartDiscount' }), disabled: !c.lines.length },
                { label: t('checkout.options.addReceiptNote'), icon: <ReceiptText size={16} aria-hidden />, onSelect: () => c.setModal({ kind: 'receiptNote' }) },
                { label: t('checkout.options.addServiceCharge'), icon: <Coins size={16} aria-hidden />, onSelect: () => c.setModal({ kind: 'serviceCharge' }), disabled: !c.lines.length },
              ],
            },
            {
              items: [
                { label: t('checkout.options.saveAsDraft'), onSelect: () => void c.submit('draft'), disabled: !c.lines.length || c.alreadyPaid > 0 },
                { label: t('checkout.options.cancelSale'), danger: true, onSelect: () => void onCancel() },
              ],
            },
          ]}
        />
        {primary}
      </div>
    </div>
  )
}


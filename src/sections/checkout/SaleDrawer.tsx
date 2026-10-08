import clsx from 'clsx'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { Activity, Check, Download, FileText, Footprints, Gift, Layers, List, Mail, NotebookPen, Pencil, Printer, RotateCcw, StickyNote } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import type { DrawerProps } from '@/app/sectionRegistry'
import { Avatar, Button, Chip, EmptyState, Menu, MenuButton, confirm, toast } from '@/components/ui'
import { computeTotals, lineTotal, saleBalance, salePaid, voidSale } from '@/api/sales'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { durationLabel, now } from '@/lib/time'
import { fmtDate, fmtDateEU, fmtDayHeader, fullName, money } from '@/lib/format'
import type { ActivityEntry, Sale, SaleStatus } from '@/types'
import { downloadReceipt, printReceipt } from './receipt'
import { AddSaleNoteModal, EditSaleDetailsModal, ShareGiftCardModal, ShareInvoiceModal } from './SaleModals'
import { IconRail, MethodIcon } from './ui'

type Tab = 'summary' | 'notes' | 'activity'
type SaleModal = { kind: 'share' } | { kind: 'note' } | { kind: 'edit' } | { kind: 'shareGift'; cardId: string } | null

/** "Today at 23:31" / "Yesterday at …" / "Wed, 7 Oct 2026 at …" */
export function relativeAt(iso: string): string {
  const d = parseISO(iso)
  const diff = differenceInCalendarDays(now(), d)
  const time = format(d, 'HH:mm')
  if (diff === 0) return `Today at ${time}`
  if (diff === 1) return `Yesterday at ${time}`
  return `${format(d, 'EEE, d MMM yyyy')} at ${time}`
}

export function SaleStatusPill({ sale }: { sale: Sale }) {
  const { t } = useTranslation()
  const status: SaleStatus | 'refunded' = sale.kind === 'refund' ? 'refunded' : sale.status
  const styles: Record<string, string> = {
    completed: 'bg-success text-white',
    unpaid: 'bg-sunken text-ink',
    part_paid: 'bg-warning-subtle text-warning',
    refunded: 'bg-sunken text-muted',
    voided: 'bg-danger-subtle text-danger',
    draft: 'bg-info-subtle text-info',
  }
  return (
    <span className={clsx('inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-body-strong', styles[status])} data-testid="sale-status">
      {status === 'completed' && <Check size={16} aria-hidden />}
      {t(`checkout.sale.status.${status}`)}
    </span>
  )
}

/** Sale drawer (613px): Summary / Notes / Activity (calendar.md §10.1). */
export function SaleDrawer({ id, params }: DrawerProps) {
  const { t } = useTranslation()
  const drawer = useDrawer()
  const navigate = useNavigate()
  const data = useDb(useShallow((s) => ({ sales: s.sales, locations: s.locations, clients: s.clients })))
  const sale = data.sales.find((s) => s.id === id)
  const [modal, setModal] = useState<SaleModal>(null)
  const tabParam = params.get('tab')
  const tab: Tab = tabParam === 'notes' || tabParam === 'activity' ? tabParam : 'summary'

  if (!sale) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState icon={<FileText size={26} aria-hidden />} title={t('checkout.sale.notFound')} body={t('checkout.sale.notFoundBody')} action={<Button onClick={drawer.close}>{t('checkout.common.close')}</Button>} />
      </div>
    )
  }

  const location = data.locations.find((l) => l.id === sale.locationId)
  const open = sale.status === 'unpaid' || sale.status === 'part_paid' || sale.status === 'draft'
  const isRefund = sale.kind === 'refund'
  const canRefund = !isRefund && sale.status === 'completed' && !sale.refundedById
  const canVoid = !isRefund && sale.status !== 'voided' && !sale.refundedById
  const setTab = (next: Tab) => drawer.update({ tab: next === 'summary' ? undefined : next })

  const onVoid = async () => {
    const ok = await confirm({ title: t('checkout.sale.voidTitle'), body: t('checkout.sale.voidBody'), confirmLabel: t('checkout.sale.voidSale'), tone: 'danger' })
    if (!ok) return
    await voidSale(sale.id)
    toast(t('checkout.toasts.saleVoided'))
  }
  const onPdf = async () => {
    await downloadReceipt(sale.id)
    toast(t('checkout.toasts.pdfDownloaded'))
  }
  const onPrint = () => {
    if (!printReceipt(sale.id)) toast(t('checkout.sale.popupBlocked'), 'error')
  }

  const headerAction = open ? (
    <Button variant="primary" className="rounded-full" onClick={() => drawer.open('checkout', { d_sale: sale.id })} data-testid="sale-pay-now">
      {t('checkout.footer.payNow')}
    </Button>
  ) : !isRefund && sale.appointmentId && sale.status !== 'voided' ? (
    <Button variant="primary" className="rounded-full" onClick={() => navigate(`/calendar/rebook-appointment/${sale.appointmentId}`)} data-testid="sale-rebook">
      {t('checkout.sale.rebook')}
    </Button>
  ) : (
    <Button className="rounded-full" onClick={() => setModal({ kind: 'share' })}>
      {t('checkout.sale.shareInvoice')}
    </Button>
  )

  return (
    <div className="flex h-full min-h-0" data-testid="sale-drawer">
      <IconRail<Tab>
        label={t('checkout.sale.sections')}
        value={tab}
        onChange={setTab}
        items={[
          { value: 'summary', label: t('checkout.sale.tabs.summary'), icon: List },
          { value: 'notes', label: t('checkout.sale.tabs.notes'), icon: StickyNote },
          { value: 'activity', label: t('checkout.sale.tabs.activity'), icon: Activity },
        ]}
      />
      <div className="min-w-0 flex-1 overflow-y-auto bg-canvas px-8 pb-12 pt-8">
        <div className="flex items-center justify-between gap-3">
          <SaleStatusPill sale={sale} />
          <div className="flex items-center gap-2">
            {headerAction}
            <Menu
              label={t('checkout.footer.openOptions')}
              width={250}
              trigger={({ open: isOpen, toggle }) => (
                <button type="button" aria-label={t('checkout.footer.openOptions')} aria-haspopup="menu" aria-expanded={isOpen} onClick={toggle} className="flex h-10 w-10 items-center justify-center rounded-full border border-line-strong bg-surface text-ink hover:bg-sunken">
                  <span aria-hidden className="text-[20px] leading-none">⋮</span>
                </button>
              )}
              groups={[
                {
                  heading: t('checkout.options.quickActions'),
                  items: [
                    ...(canRefund ? [{ label: t('checkout.sale.refund'), icon: <RotateCcw size={16} aria-hidden />, onSelect: () => navigate(`/sales/refund-sale/${sale.id}`) }] : []),
                    ...(!isRefund && sale.status !== 'voided' ? [{ label: t('checkout.sale.editDetails'), icon: <Pencil size={16} aria-hidden />, onSelect: () => setModal({ kind: 'edit' }) }] : []),
                    { label: t('checkout.sale.addNote'), icon: <NotebookPen size={16} aria-hidden />, onSelect: () => setModal({ kind: 'note' }) },
                  ],
                },
                {
                  items: [
                    { label: t('checkout.sale.email'), icon: <Mail size={16} aria-hidden />, onSelect: () => setModal({ kind: 'share' }) },
                    { label: t('checkout.sale.print'), icon: <Printer size={16} aria-hidden />, onSelect: onPrint },
                    { label: t('checkout.sale.downloadPdf'), icon: <Download size={16} aria-hidden />, onSelect: () => void onPdf() },
                  ],
                },
                ...(canVoid ? [{ items: [{ label: t('checkout.sale.voidSale'), danger: true, onSelect: () => void onVoid() }] }] : []),
              ]}
            />
          </div>
        </div>
        <h1 className="mt-5 font-display text-title-1 text-ink">{isRefund ? t('checkout.sale.refundTitle') : t('checkout.sale.title')}</h1>
        <p className="mt-1 text-body-lg text-muted">
          {fmtDayHeader(sale.createdAt)}, {format(parseISO(sale.createdAt), 'yyyy')} • {location?.name}
        </p>
        <div className="mt-6">
          {tab === 'summary' && <SummaryTab sale={sale} onShareGift={(cardId) => setModal({ kind: 'shareGift', cardId })} onPay={() => drawer.open('checkout', { d_sale: sale.id })} />}
          {tab === 'notes' && <NotesTab sale={sale} onAdd={() => setModal({ kind: 'note' })} />}
          {tab === 'activity' && <ActivityTab sale={sale} onEmail={() => setModal({ kind: 'share' })} />}
        </div>
      </div>
      {modal?.kind === 'share' && <ShareInvoiceModal sale={sale} onClose={() => setModal(null)} />}
      {modal?.kind === 'note' && <AddSaleNoteModal sale={sale} onClose={() => setModal(null)} />}
      {modal?.kind === 'edit' && <EditSaleDetailsModal sale={sale} onClose={() => setModal(null)} />}
      {modal?.kind === 'shareGift' && <ShareGiftModalById cardId={modal.cardId} onClose={() => setModal(null)} />}
    </div>
  )
}

function ShareGiftModalById({ cardId, onClose }: { cardId: string; onClose: () => void }) {
  const card = useDb((s) => s.giftCards.find((g) => g.id === cardId))
  return card ? <ShareGiftCardModal card={card} onClose={onClose} /> : null
}

function ClientBlock({ clientId }: { clientId: string | null }) {
  const { t } = useTranslation()
  const drawer = useDrawer()
  const client = useDb((s) => s.clients.find((c) => c.id === clientId))
  if (!client)
    return (
      <div className="flex items-center justify-between rounded-lg border border-line bg-surface p-6">
        <span className="text-body-lg font-semibold text-ink">{t('checkout.client.walkIn')}</span>
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-subtle text-primary">
          <Footprints size={24} aria-hidden />
        </span>
      </div>
    )
  return (
    <button type="button" onClick={() => drawer.open('client', { id: client.id })} className="flex w-full items-center justify-between gap-4 rounded-lg border border-line bg-surface p-6 text-left hover:bg-sunken/60" data-testid="sale-client">
      <span className="min-w-0">
        <span className="block truncate text-body-lg font-semibold text-ink">{fullName(client)}</span>
        <span className="block truncate text-body text-muted">{client.email || client.phone}</span>
      </span>
      <Avatar name={fullName(client)} size={56} />
    </button>
  )
}

function SummaryTab({ sale, onShareGift, onPay }: { sale: Sale; onShareGift: (id: string) => void; onPay: () => void }) {
  const { t } = useTranslation()
  const drawer = useDrawer()
  const data = useDb(useShallow((s) => ({ sales: s.sales, giftCards: s.giftCards, clientPackages: s.clientPackages, clientMemberships: s.clientMemberships, packages: s.packages, memberships: s.memberships })))
  const original = sale.refundOfId ? data.sales.find((s) => s.id === sale.refundOfId) : undefined
  const refund = sale.refundedById ? data.sales.find((s) => s.id === sale.refundedById) : undefined
  const cards = sale.items.map((i) => (i.giftCardId ? data.giftCards.find((g) => g.id === i.giftCardId) : undefined)).filter((g): g is NonNullable<typeof g> => Boolean(g))
  const pkgs = sale.items.map((i) => (i.clientPackageId ? data.clientPackages.find((p) => p.id === i.clientPackageId) : undefined)).filter((p): p is NonNullable<typeof p> => Boolean(p))
  const mems = sale.items.map((i) => (i.clientMembershipId ? data.clientMemberships.find((p) => p.id === i.clientMembershipId) : undefined)).filter((p): p is NonNullable<typeof p> => Boolean(p))

  return (
    <div className="flex flex-col gap-6">
      <ClientBlock clientId={sale.clientId} />
      {refund && (
        <button type="button" onClick={() => drawer.open('sale', { id: refund.id })} className="rounded-lg border border-line bg-surface px-6 py-4 text-left text-body text-ink hover:bg-sunken/60">
          <RotateCcw size={16} className="mr-2 inline text-muted" aria-hidden />
          {t('checkout.sale.refundedIn', { number: refund.number })}
        </button>
      )}
      {cards.map((card) => (
        <div key={card.id} className="rounded-lg border border-line bg-surface p-6" data-testid="sale-gift-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-body-lg font-semibold text-ink">
                {money(card.value)} - {t('checkout.cart.giftCardTitle')}
              </p>
              <p className="text-body text-muted">
                {card.code} • <span className={card.status === 'active' ? 'text-success' : 'text-muted'}>{t(`checkout.giftCard.status.${card.status}`)}</span>
              </p>
            </div>
            <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary-subtle text-primary">
              <Gift size={28} aria-hidden />
            </span>
          </div>
          <div className="mt-5 flex gap-2">
            <Button className="rounded-full" onClick={() => drawer.open('gift-card', { id: card.id })}>
              {t('checkout.sale.viewGiftCard')}
            </Button>
            <Button className="rounded-full" onClick={() => onShareGift(card.id)}>
              {t('checkout.sale.share')}
            </Button>
          </div>
        </div>
      ))}
      {pkgs.map((p) => {
        const def = data.packages.find((d) => d.id === p.packageId)
        return (
          <div key={p.id} className="flex items-center justify-between rounded-lg border border-line bg-surface p-6">
            <div>
              <p className="text-body-lg font-semibold text-ink">{def?.name}</p>
              <p className="text-body text-muted">
                <span className="text-success">{t(`checkout.sale.pkgStatus.${p.status}`)}</span> • {t('checkout.sale.expires', { date: fmtDate(p.expiresAt) })}
              </p>
            </div>
            <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary-subtle text-primary">
              <Layers size={24} aria-hidden />
            </span>
          </div>
        )
      })}
      {mems.map((m) => (
        <div key={m.id} className="rounded-lg border border-line bg-surface p-6">
          <p className="text-body-lg font-semibold text-ink">{data.memberships.find((d) => d.id === m.membershipId)?.name}</p>
          <p className="text-body text-muted">
            <span className="text-success">{t(`checkout.sale.memStatus.${m.status}`)}</span> • {t('checkout.sale.nextBilling', { date: fmtDate(m.nextBillingAt) })}
          </p>
        </div>
      ))}
      <SaleCard sale={sale} onPay={onPay} />
      {original && (
        <>
          <p className="text-body-strong text-muted">{t('checkout.sale.originalSale')}</p>
          <SaleCard sale={original} linkToSale />
        </>
      )}
    </div>
  )
}

function SaleCard({ sale, onPay, linkToSale }: { sale: Sale; onPay?: () => void; linkToSale?: boolean }) {
  const { t } = useTranslation()
  const drawer = useDrawer()
  const data = useDb(useShallow((s) => ({ payments: s.payments, appointments: s.appointments, teamMembers: s.teamMembers, giftCards: s.giftCards, services: s.services, sales: s.sales })))
  const totals = computeTotals(sale)
  const payments = data.payments.filter((p) => sale.paymentIds.includes(p.id) && p.status === 'succeeded')
  const balance = sale.status === 'voided' || sale.kind === 'refund' ? 0 : Math.max(0, saleBalance(sale))
  const paid = salePaid(sale, data.payments)
  const isRefund = sale.kind === 'refund'
  const original = sale.refundOfId ? data.sales.find((s) => s.id === sale.refundOfId) : undefined
  const member = (id: string | null | undefined) => data.teamMembers.find((m) => m.id === id)

  return (
    <div className="rounded-lg border border-line bg-surface p-6" data-testid="sale-card">
      <div className="flex items-start justify-between">
        <div>
          {linkToSale ? (
            <button type="button" className="font-display text-title-2 text-primary hover:underline" onClick={() => drawer.open('sale', { id: sale.id })}>
              {t('checkout.sale.saleNumber', { number: sale.number })}
            </button>
          ) : (
            <h2 className="font-display text-title-2 text-ink">{isRefund ? t('checkout.sale.refundNumber', { number: sale.number }) : t('checkout.sale.saleNumber', { number: sale.number })}</h2>
          )}
          <p className="text-body text-muted">
            {fmtDayHeader(sale.createdAt)}, {format(parseISO(sale.createdAt), 'yyyy')}
          </p>
        </div>
        {sale.status === 'voided' && <Chip tone="danger">{t('checkout.sale.status.voided')}</Chip>}
      </div>
      {isRefund && original && (
        <div className="mt-4 flex justify-between text-body">
          <span className="text-muted">{t('checkout.sale.originalSaleDate')}</span>
          <span className="text-ink">{fmtDateEU(original.createdAt)}</span>
        </div>
      )}
      {isRefund && sale.refundReason && (
        <div className="mt-1 flex justify-between text-body">
          <span className="text-muted">{t('checkout.sale.refundReason')}</span>
          <span className="text-ink">{sale.refundReason}</span>
        </div>
      )}
      <ul className="mt-5 flex flex-col gap-4">
        {sale.items.map((item) => {
          const appt = item.appointmentId ? data.appointments.find((a) => a.id === item.appointmentId) : undefined
          const apptItem = appt?.items.find((i) => i.id === item.appointmentItemId)
          const card = item.giftCardId ? data.giftCards.find((g) => g.id === item.giftCardId) : undefined
          const m = member(item.teamMemberId)
          const duration = apptItem?.durationMin ?? (item.type === 'service' ? data.services.find((s) => s.id === item.refId)?.durationMin : item.type === 'manual' ? 5 : undefined)
          const parts =
            item.type === 'gift_card'
              ? [card?.code, m ? fullName(m) : undefined]
              : [apptItem && appt ? `${apptItem.start}, ${fmtDateEU(appt.date)}` : undefined, duration ? durationLabel(duration) : undefined, item.type === 'service' || item.type === 'manual' || item.type === 'service_addon' ? undefined : item.detail, m ? fullName(m) : undefined]
          const total = lineTotal(item)
          const gross = item.unitPrice * item.quantity
          return (
            <li key={item.id} className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                {card ? (
                  <button type="button" className="text-body-lg text-primary hover:underline" onClick={() => drawer.open('gift-card', { id: card.id })}>
                    {money(card.value)} - {item.name}
                  </button>
                ) : (
                  <p className="text-body-lg text-ink">
                    {item.quantity > 1 ? `${item.quantity} × ` : ''}
                    {item.name}
                  </p>
                )}
                <p className="text-body text-muted">{parts.filter(Boolean).join(' • ')}</p>
                {item.benefitNote && <p className="text-small text-success">{item.benefitNote}</p>}
              </div>
              <div className="text-right">
                <p className="text-body-lg text-ink tabular">{money(total)}</p>
                {total !== gross && <p className="text-small text-muted line-through tabular">{money(gross)}</p>}
              </div>
            </li>
          )
        })}
      </ul>
      <div className="my-5 border-t border-line" />
      <div className="flex flex-col gap-1.5 text-body">
        {totals.cartDiscount > 0 && (
          <div className="flex justify-between text-muted">
            <span>{t('checkout.totals.cartDiscount')}</span>
            <span className="tabular">-{money(totals.cartDiscount)}</span>
          </div>
        )}
        <div className="flex justify-between text-muted">
          <span>{t('checkout.totals.subtotal')}</span>
          <span className="tabular">{money(totals.subtotal)}</span>
        </div>
        {sale.serviceCharges.map((c) => (
          <div key={c.id} className="flex justify-between text-muted">
            <span>{c.name}</span>
            <span className="tabular">{money(c.amount)}</span>
          </div>
        ))}
        <div className="flex justify-between font-semibold text-ink">
          <span>{t('checkout.totals.total')}</span>
          <span className="tabular">{money(totals.total)}</span>
        </div>
        {sale.tips.map((tip) => (
          <div key={tip.teamMemberId} className="flex justify-between text-muted">
            <span>{t('checkout.sale.tipTo', { name: member(tip.teamMemberId)?.firstName ?? '' })}</span>
            <span className="tabular">{money(tip.amount)}</span>
          </div>
        ))}
      </div>
      {payments.length > 0 && (
        <>
          <div className="my-5 border-t border-line" />
          <div className="flex flex-col gap-4">
            {payments.map((p) => (
              <div key={p.id}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="flex items-center gap-1.5 text-body-lg text-ink">
                      {p.kind === 'refund' ? t('checkout.sale.refundPayment') : p.kind === 'deposit' ? t('checkout.sale.depositPayment') : t('checkout.sale.payment')} <MethodIcon method={p.method} /> {p.methodLabel}
                    </p>
                    <p className="text-body text-muted">
                      {format(parseISO(p.at), 'EEE d MMM yyyy')} at {format(parseISO(p.at), 'HH:mm')}
                      {p.collectedById && member(p.collectedById) ? ` • ${fullName(member(p.collectedById)!)}` : ''}
                    </p>
                  </div>
                  <p className="text-body-lg text-ink tabular">{money(p.amount + (p.change ?? 0))}</p>
                </div>
                {p.change ? (
                  <div className="mt-3 flex justify-between text-body-lg text-ink">
                    <span>{t('checkout.sale.change')}</span>
                    <span className="tabular">{money(p.change)}</span>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </>
      )}
      {sale.receiptNote && (
        <>
          <div className="my-5 border-t border-line" />
          <p className="text-body-strong text-ink">{t('checkout.sale.receiptComment')}</p>
          <p className="mt-1 whitespace-pre-wrap text-body text-muted">{sale.receiptNote}</p>
        </>
      )}
      {(balance > 0.004 || (sale.status !== 'completed' && !isRefund && sale.status !== 'voided')) && (
        <>
          <div className="my-5 border-t border-line" />
          {paid > 0 && (
            <div className="mb-2 flex justify-between text-body text-muted">
              <span>{t('checkout.sale.paidSoFar')}</span>
              <span className="tabular">{money(paid)}</span>
            </div>
          )}
          <div className="flex items-center justify-between font-display text-title-3 text-ink">
            <span>{t('checkout.sale.balance')}</span>
            <span className="tabular">{money(balance)}</span>
          </div>
          {onPay && (
            <Button variant="primary" className="mt-4 w-full rounded-full" onClick={onPay}>
              {t('checkout.footer.payNow')}
            </Button>
          )}
        </>
      )}
    </div>
  )
}

function NotesTab({ sale, onAdd }: { sale: Sale; onAdd: () => void }) {
  const { t } = useTranslation()
  if (!sale.notes.length)
    return <EmptyState icon={<StickyNote size={26} aria-hidden />} title={t('checkout.sale.noNotes')} body={t('checkout.sale.noNotesBody')} action={<Button onClick={onAdd}>{t('checkout.sale.addNoteButton')}</Button>} />
  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button className="rounded-full" onClick={onAdd}>
          {t('checkout.sale.addNoteButton')}
        </Button>
      </div>
      <ul className="flex flex-col gap-3">
        {sale.notes.map((n) => (
          <li key={n.id} className="rounded-lg border border-line bg-surface p-5">
            <p className="whitespace-pre-wrap text-body text-ink">{n.text}</p>
            <p className="mt-2 text-small text-muted">
              {relativeAt(n.at)} • {n.by}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ActivityTab({ sale, onEmail }: { sale: Sale; onEmail: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const entries = [...sale.activity].sort((a, b) => b.at.localeCompare(a.at))
  const groups: { month: string; items: ActivityEntry[] }[] = []
  for (const e of entries) {
    const month = format(parseISO(e.at), 'MMMM yyyy') === format(now(), 'MMMM yyyy') ? format(parseISO(e.at), 'MMMM') : format(parseISO(e.at), 'MMMM yyyy')
    const g = groups.find((x) => x.month === month)
    if (g) g.items.push(e)
    else groups.push({ month, items: [e] })
  }
  if (!entries.length) return <EmptyState icon={<Activity size={26} aria-hidden />} title={t('checkout.sale.noActivity')} />
  return (
    <div>
      {groups.map((g) => (
        <section key={g.month} className="mb-6">
          <h2 className="mb-3 text-body-strong text-muted">{g.month}</h2>
          <ol className="relative flex flex-col gap-4 border-l border-line pl-6">
            {g.items.map((e) => {
              const payment = /paid by/i.test(e.title)
              return (
                <li key={e.id} className="relative rounded-lg border border-line bg-surface p-5">
                  <span className="absolute -left-[29px] top-6 h-2.5 w-2.5 rounded-full bg-line-strong" aria-hidden />
                  <p className="text-body-lg font-semibold text-ink">{e.title}</p>
                  <p className="text-body text-muted">{relativeAt(e.at)}</p>
                  {e.detail && <p className="mt-3 text-body text-ink">{e.detail}</p>}
                  {!e.detail && e.by && <p className="mt-3 text-body text-ink">{t('checkout.sale.by', { name: e.by })}</p>}
                  {payment && (
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
                              { label: t('checkout.sale.emailReceipt'), onSelect: onEmail },
                              { label: t('checkout.sale.viewPayments'), onSelect: () => navigate('/sales/payment-transactions') },
                            ],
                          },
                        ]}
                      />
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        </section>
      ))}
      <p className="text-body text-muted">{t('checkout.sale.activityFooter')}</p>
    </div>
  )
}

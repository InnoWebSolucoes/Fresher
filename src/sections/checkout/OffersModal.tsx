import clsx from 'clsx'
import { Check, Gift, Layers, Percent, Sparkles, UserPlus } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { Button, Modal, toast } from '@/components/ui'
import { useDb } from '@/store/db'
import { durationLabel, todayISO } from '@/lib/time'
import { fmtDate, fullName, money } from '@/lib/format'
import { useCheckout } from './context'
import { appliedOfferKey, basePrice, lineDuration, offerTotal, offersForLine, type Line, type Offer } from './model'

/** Offers for every cart line, recomputed when the client's packages, rewards or deals change. */
export function useCartOffers(): { line: Line; offers: Offer[] }[] {
  const c = useCheckout()
  const data = useDb(useShallow((s) => ({ deals: s.deals, clientPackages: s.clientPackages, clients: s.clients, packages: s.packages })))
  return useMemo(
    () => c.lines.map((line) => ({ line, offers: offersForLine(line, c.lines, c.clientId, data.deals, todayISO()) })),
    // clientPackages / clients / packages are read through the API helpers; listed so the offers refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c.lines, c.clientId, data.deals, data.clientPackages, data.clients, data.packages],
  )
}

/** Tag shown on an offer and on the cart line once applied ("Package benefit", "Manual reward"). */
export function OfferTag({ label, className }: { label: string; className?: string }) {
  return <span className={clsx('inline-flex items-center rounded-full bg-primary-subtle px-2.5 py-0.5 text-caption font-medium text-primary', className)}>{label}</span>
}

/** "Free ~~€25~~" / "€21.25 ~~€25~~" */
export function OfferPrice({ base, total, quantity = 1 }: { base: number; total: number; quantity?: number }) {
  const { t } = useTranslation()
  return (
    <span className="flex flex-col items-end">
      <span className="text-body-lg font-semibold text-ink tabular">{total === 0 ? t('checkout.summary.free') : money(total * quantity)}</span>
      {total < base && <span className="text-small text-muted line-through tabular">{money(base * quantity)}</span>}
    </span>
  )
}

/**
 * "Apply rewards or discounts" (calendar.md §10.9, §10.10): per cart line, the
 * client's package sessions ("Free ~~€25~~ Package benefit"), rewards
 * ("€21.25 ~~€25~~ Manual reward") and point-of-sale deals.
 */
export function OffersModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const c = useCheckout()
  const rows = useCartOffers()
  const data = useDb(useShallow((s) => ({ clients: s.clients, clientPackages: s.clientPackages, teamMembers: s.teamMembers, services: s.services, appointments: s.appointments })))
  const client = data.clients.find((x) => x.id === c.clientId)
  const withOffers = rows.filter((r) => r.offers.length > 0 || appliedOfferKey(r.line))

  const tagOf = (offer: Offer) => (offer.kind === 'benefit' ? c.offerLabels.packageBenefit : offer.kind === 'reward' ? c.offerLabels.manualReward : t('checkout.offers.discount'))
  const describe = (offer: Offer) => {
    if (offer.kind === 'benefit') {
      const cp = data.clientPackages.find((p) => p.id === offer.clientPackageId)
      return { title: offer.packageName, sub: [t('checkout.offers.sessionsLeft', { count: Number.isFinite(offer.left) ? offer.left : 99 }), cp ? t('checkout.offers.expires', { date: fmtDate(cp.expiresAt) }) : undefined].filter(Boolean).join(' • '), icon: <Layers size={20} aria-hidden /> }
    }
    if (offer.kind === 'reward') {
      const r = offer.reward
      const value = r.type === 'percent' ? t('checkout.offers.percentOff', { value: r.value }) : r.type === 'amount' ? t('checkout.offers.amountOff', { amount: money(r.value) }) : r.type === 'free_service' ? t('checkout.offers.freeService') : t('checkout.offers.freeProduct')
      return { title: r.name, sub: [value, r.expiresAt ? t('checkout.offers.expires', { date: fmtDate(r.expiresAt) }) : undefined].filter(Boolean).join(' • '), icon: <Gift size={20} aria-hidden /> }
    }
    const d = offer.deal
    return { title: d.name, sub: d.discountType === 'percent' ? t('checkout.offers.percentOff', { value: d.value }) : t('checkout.offers.amountOff', { amount: money(d.value) }), icon: <Percent size={20} aria-hidden /> }
  }

  const choose = (line: Line, offer: Offer, applied: boolean) => {
    c.applyLineOffer(line.key, applied ? null : offer)
    toast(applied ? t('checkout.toasts.offerRemoved', { name: line.name }) : t('checkout.toasts.offerApplied', { label: tagOf(offer) }))
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t('checkout.offers.title')}
      subtitle={client ? t('checkout.offers.subtitleClient', { name: fullName(client) }) : t('checkout.offers.subtitleWalkIn')}
      footer={
        <Button variant="primary" className="rounded-full" onClick={onClose} data-testid="offers-done">
          {t('checkout.offers.done')}
        </Button>
      }
    >
      <div className="flex flex-col gap-6 pb-2" data-testid="offers-modal">
        {!client && (
          <div className="flex items-center justify-between gap-4 rounded-lg bg-primary-subtle/60 px-5 py-4">
            <p className="text-body text-ink">{t('checkout.offers.addClientHint')}</p>
            <Button
              className="shrink-0 rounded-full"
              icon={<UserPlus size={16} aria-hidden />}
              onClick={() => {
                onClose()
                c.setView('client')
              }}
            >
              {t('checkout.client.addClient')}
            </Button>
          </div>
        )}
        {withOffers.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-subtle text-primary">
              <Sparkles size={24} aria-hidden />
            </span>
            <p className="font-display text-title-3 text-ink">{t('checkout.offers.emptyTitle')}</p>
            <p className="mt-2 max-w-md text-body text-muted">{client ? t('checkout.offers.emptyBodyClient', { name: client.firstName }) : t('checkout.offers.emptyBody')}</p>
          </div>
        ) : (
          withOffers.map(({ line, offers }) => {
            const base = basePrice(line)
            const applied = appliedOfferKey(line)
            const member = data.teamMembers.find((m) => m.id === line.teamMemberId)
            const duration = lineDuration(line, data)
            return (
              <section key={line.key} data-testid="offer-line">
                <div className="mb-3 flex items-baseline justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="truncate text-body-lg font-semibold text-ink">
                      {line.quantity > 1 ? `${line.quantity} × ` : ''}
                      {line.name}
                    </h3>
                    <p className="text-body text-muted">{[duration ? durationLabel(duration) : undefined, member ? fullName(member) : undefined].filter(Boolean).join(' • ')}</p>
                  </div>
                  <span className="text-body text-muted tabular">{money(base * line.quantity)}</span>
                </div>
                <ul className="flex flex-col gap-2">
                  {offers.map((offer) => {
                    const info = describe(offer)
                    const isApplied = applied === offer.key
                    return (
                      <li key={offer.key}>
                        <button
                          type="button"
                          aria-pressed={isApplied}
                          onClick={() => choose(line, offer, isApplied)}
                          className={clsx('flex w-full items-center gap-4 rounded-lg border px-5 py-4 text-left transition-colors', isApplied ? 'border-primary bg-primary-subtle/40 ring-1 ring-primary/40' : 'border-line hover:bg-sunken/60')}
                          data-testid="offer-option"
                        >
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary">{isApplied ? <Check size={20} aria-hidden /> : info.icon}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-body-lg text-ink">{info.title}</span>
                            <span className="block text-body text-muted">{info.sub}</span>
                            <OfferTag className="mt-1.5" label={tagOf(offer)} />
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1">
                            <OfferPrice base={base} total={offerTotal(base, offer)} quantity={line.quantity} />
                            <span className={clsx('text-small font-semibold', isApplied ? 'text-danger' : 'text-primary')}>{isApplied ? t('checkout.offers.remove') : t('checkout.offers.apply')}</span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                  {applied && !offers.some((o) => o.key === applied) && (
                    <li className="flex items-center justify-between gap-4 rounded-lg border border-line px-5 py-4">
                      <span className="text-body text-ink">{line.benefitNote ?? t('checkout.summary.discountApplied')}</span>
                      <Button size="sm" variant="ghost" className="text-danger" onClick={() => c.applyLineOffer(line.key, null)}>
                        {t('checkout.offers.remove')}
                      </Button>
                    </li>
                  )}
                </ul>
              </section>
            )
          })
        )}
      </div>
    </Modal>
  )
}

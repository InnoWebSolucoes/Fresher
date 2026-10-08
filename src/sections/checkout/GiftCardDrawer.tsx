import clsx from 'clsx'
import { format, parseISO } from 'date-fns'
import { CalendarPlus, Check, Gift, Info, PanelTop, Printer, Share } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import type { DrawerProps } from '@/app/sectionRegistry'
import { Button, DetailList, EmptyState, Menu, MenuButton, toast } from '@/components/ui'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { todayISO } from '@/lib/time'
import { fmtDateEU, fmtDateTime, fullName, money } from '@/lib/format'
import type { GiftCard } from '@/types'
import { ExtendGiftCardModal, ShareGiftCardModal } from './SaleModals'
import { printHtml } from './receipt'
import { relativeAt } from './SaleDrawer'
import { GiftCardArt, IconRail } from './ui'

type Tab = 'activity' | 'details'

export function giftCardState(card: GiftCard): 'valid' | 'redeemed' | 'expired' | 'cancelled' {
  if (card.status === 'cancelled') return 'cancelled'
  if (card.status === 'redeemed' || card.balance <= 0.004) return 'redeemed'
  if (card.status === 'expired' || (card.expiresAt && card.expiresAt < todayISO())) return 'expired'
  return 'valid'
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] ?? ch)

/** Gift card drawer (calendar.md §10.9): Valid chip, Actions, card, timeline. */
export function GiftCardDrawer({ id, params }: DrawerProps) {
  const { t } = useTranslation()
  const drawer = useDrawer()
  const data = useDb(useShallow((s) => ({ cards: s.giftCards, sales: s.sales, clients: s.clients, workspace: s.workspace })))
  const card = data.cards.find((g) => g.id === id)
  const [modal, setModal] = useState<'share' | 'extend' | null>(null)
  const tab: Tab = params.get('tab') === 'details' ? 'details' : 'activity'

  if (!card)
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState icon={<Gift size={26} aria-hidden />} title={t('checkout.giftCard.notFound')} action={<Button onClick={drawer.close}>{t('checkout.common.close')}</Button>} />
      </div>
    )

  const state = giftCardState(card)
  const sale = data.sales.find((s) => s.id === card.saleId)
  const purchaser = data.clients.find((c) => c.id === card.purchaserClientId)
  const owner = data.clients.find((c) => c.id === card.ownerClientId)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(card.code)
    } catch {
      /* clipboard may be blocked; the toast still confirms the code */
    }
    toast(t('checkout.toasts.codeCopied', { code: card.code }))
  }
  const print = () => {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Gift card ${esc(card.code)}</title><style>body{font-family:Helvetica,Arial,sans-serif;display:flex;justify-content:center;padding:48px}.card{width:420px;border-radius:18px;padding:28px;color:#fff;background:linear-gradient(135deg,#0E6E6A,#1F8C84 45%,#2A9CC2);-webkit-print-color-adjust:exact;print-color-adjust:exact}.v{font-size:34px;font-weight:700}.l{font-size:12px;opacity:.8;margin-top:18px}.c{font-size:18px;font-weight:600;letter-spacing:1px}</style></head><body><div class="card"><div class="v">${esc(money(card.value))}</div><div>${esc(data.workspace.name)}</div>${card.customCode ? `<div class="l">Custom code</div><div class="c">${esc(card.customCode)}</div>` : ''}<div class="l">Code</div><div class="c">${esc(card.code)}</div><div class="l">Balance</div><div class="c">${esc(money(card.balance))}</div><div class="l">Expires</div><div class="c">${esc(card.expiresAt ? fmtDateEU(card.expiresAt) : 'Never')}</div></div><script>window.onload=function(){window.print()}</script></body></html>`
    if (!printHtml(html)) toast(t('checkout.sale.popupBlocked'), 'error')
  }

  const chip = {
    valid: 'bg-success text-white',
    redeemed: 'bg-sunken text-ink',
    expired: 'bg-warning-subtle text-warning',
    cancelled: 'bg-danger-subtle text-danger',
  }[state]

  const entries = [...card.activity].sort((a, b) => b.at.localeCompare(a.at))
  const groups: { month: string; items: typeof entries }[] = []
  for (const e of entries) {
    const month = format(parseISO(e.at), 'MMMM yyyy')
    const g = groups.find((x) => x.month === month)
    if (g) g.items.push(e)
    else groups.push({ month, items: [e] })
  }
  const saleLink = (detail?: string) => {
    const match = detail ? /sale (\d+)/i.exec(detail) : null
    const target = match ? data.sales.find((s) => s.number === Number(match[1])) : undefined
    return target ? { number: target.number, id: target.id } : undefined
  }

  return (
    <div className="flex h-full min-h-0" data-testid="gift-card-drawer">
      <IconRail<Tab>
        compact
        label={t('checkout.sale.sections')}
        value={tab}
        onChange={(next) => drawer.update({ tab: next === 'activity' ? undefined : next })}
        items={[
          { value: 'activity', label: t('checkout.giftCard.tabs.activity'), icon: PanelTop },
          { value: 'details', label: t('checkout.giftCard.tabs.details'), icon: Info },
        ]}
      />
      <div className="min-w-0 flex-1 overflow-y-auto bg-canvas px-8 pb-12 pt-8">
        <div className="flex items-center justify-between gap-3">
          <span className={clsx('inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-body-strong', chip)} data-testid="gift-card-status">
            {state === 'valid' && <Check size={16} aria-hidden />}
            {t(`checkout.giftCard.state.${state}`)}
          </span>
          <Menu
            width={220}
            trigger={({ open, toggle }) => (
              <MenuButton open={open} toggle={toggle}>
                {t('checkout.client.actions')}
              </MenuButton>
            )}
            groups={[
              {
                items: [
                  { label: t('checkout.giftCard.share'), icon: <Share size={16} aria-hidden />, onSelect: () => setModal('share') },
                  { label: t('checkout.giftCard.extend'), icon: <CalendarPlus size={16} aria-hidden />, onSelect: () => setModal('extend'), disabled: state === 'redeemed' || state === 'cancelled' },
                  { label: t('checkout.giftCard.print'), icon: <Printer size={16} aria-hidden />, onSelect: print },
                ],
              },
            ]}
          />
        </div>
        <h1 className="mt-5 font-display text-title-1 text-ink">{t('checkout.giftCard.title')}</h1>
        <div className="mt-6">
          <GiftCardArt value={card.value} customCode={card.customCode} code={card.code} expires={card.expiresAt ? fmtDateEU(card.expiresAt) : undefined} onCopy={() => void copy()} />
        </div>
        <div className="mt-4 flex items-center justify-between rounded-lg border border-line bg-surface px-5 py-4">
          <span className="text-body text-muted">{t('checkout.giftCard.balance')}</span>
          <span className="font-display text-title-3 text-ink tabular">{money(card.balance)}</span>
        </div>

        {tab === 'activity' ? (
          <div className="mt-8">
            {groups.map((g) => (
              <section key={g.month} className="mb-6">
                <h2 className="mb-3 text-body-strong text-muted">{format(parseISO(g.items[0].at), 'MMMM')}</h2>
                <ol className="flex flex-col gap-4 border-l border-line pl-6">
                  {g.items.map((e) => {
                    const link = e.title === 'Gift card purchased' && sale ? { number: sale.number, id: sale.id } : saleLink(e.detail)
                    return (
                      <li key={e.id} className="rounded-lg border border-line bg-surface p-5">
                        <p className="text-body-lg font-semibold text-ink">{e.title}</p>
                        <p className="text-body text-muted">
                          {relativeAt(e.at)} {t('checkout.giftCard.by', { name: e.by })}
                        </p>
                        {e.detail && !/^(view )?sale \d+$/i.test(e.detail) && <p className="mt-2 text-body text-ink">{e.detail}</p>}
                        {link && (
                          <p className="mt-3 text-body text-ink">
                            {t('checkout.giftCard.viewSale')}{' '}
                            <button type="button" className="text-primary hover:underline" onClick={() => drawer.open('sale', { id: link.id })}>
                              {link.number}
                            </button>
                          </p>
                        )}
                      </li>
                    )
                  })}
                </ol>
              </section>
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-lg border border-line bg-surface p-6">
            <DetailList
              rows={[
                { label: t('checkout.giftCard.value'), value: money(card.value) },
                { label: t('checkout.giftCard.price'), value: money(card.price) },
                { label: t('checkout.giftCard.balance'), value: money(card.balance) },
                { label: t('checkout.giftCard.issued'), value: fmtDateTime(card.issuedAt) },
                { label: t('checkout.giftCard.expires'), value: card.expiresAt ? fmtDateEU(card.expiresAt) : t('checkout.giftCard.never') },
                { label: t('checkout.giftCard.purchasedBy'), value: purchaser ? fullName(purchaser) : t('checkout.client.walkIn') },
                { label: t('checkout.giftCard.owner'), value: owner ? fullName(owner) : card.recipientName || t('checkout.giftCard.sharedGift') },
                { label: t('checkout.giftCard.channel'), value: card.onlinePurchase ? t('checkout.giftCard.online') : t('checkout.giftCard.inStore') },
                {
                  label: t('checkout.giftCard.sale'),
                  value: sale ? (
                    <button type="button" className="text-primary hover:underline" onClick={() => drawer.open('sale', { id: sale.id })}>
                      {t('checkout.sale.saleNumber', { number: sale.number })}
                    </button>
                  ) : (
                    '-'
                  ),
                },
              ]}
            />
          </div>
        )}
      </div>
      {modal === 'share' && <ShareGiftCardModal card={card} onClose={() => setModal(null)} />}
      {modal === 'extend' && <ExtendGiftCardModal card={card} onClose={() => setModal(null)} />}
    </div>
  )
}

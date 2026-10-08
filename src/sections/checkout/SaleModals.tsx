import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { useShallow } from 'zustand/react/shallow'
import { Button, Field, Modal, MoneyInput, Select, TextArea, TextInput, toast } from '@/components/ui'
import { addSaleNote, editSaleDetails, lineTotal } from '@/api/sales'
import { sendReceipt } from '@/api/messaging'
import { extendGiftCard, shareGiftCard } from '@/api/checkout'
import { useDb } from '@/store/db'
import { fmtDateTime, fullName, money, round2 } from '@/lib/format'
import { toISODate, now } from '@/lib/time'
import { addMonths, addYears, parseISO } from 'date-fns'
import type { GiftCard, Sale } from '@/types'

const emailSchema = z.string().trim().email()

/** "Share invoice": Client email → sendReceipt (calendar.md §10.1). */
export function ShareInvoiceModal({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const { t } = useTranslation()
  const client = useDb((s) => s.clients.find((c) => c.id === sale.clientId))
  const [email, setEmail] = useState(client?.email ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const send = async () => {
    if (!emailSchema.safeParse(email).success) {
      setError(t('checkout.sale.invalidEmail'))
      return
    }
    setBusy(true)
    try {
      await sendReceipt(sale.id, email.trim())
      toast(t('checkout.toasts.invoiceSent', { email: email.trim() }))
      onClose()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={t('checkout.sale.shareInvoice')}
      footer={
        <>
          <Button className="rounded-full" onClick={onClose}>
            {t('checkout.common.cancel')}
          </Button>
          <Button variant="primary" className="rounded-full" loading={busy} onClick={() => void send()} data-testid="share-invoice-send">
            {t('checkout.sale.send')}
          </Button>
        </>
      }
    >
      <form
        className="pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <Field label={t('checkout.sale.clientEmail')} error={error}>
          {(id) => <TextInput id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={Boolean(error)} placeholder="name@example.com" />}
        </Field>
      </form>
    </Modal>
  )
}

/** "Add a note" for a sale. */
export function AddSaleNoteModal({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!text.trim()) return
    setBusy(true)
    try {
      await addSaleNote(sale.id, text.trim())
      toast(t('checkout.toasts.saleNoteAdded'))
      onClose()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={t('checkout.sale.addNote')}
      footer={
        <>
          <Button className="rounded-full" onClick={onClose}>
            {t('checkout.common.cancel')}
          </Button>
          <Button variant="primary" className="rounded-full" loading={busy} disabled={!text.trim()} onClick={() => void save()}>
            {t('checkout.common.save')}
          </Button>
        </>
      }
    >
      <div className="pb-2">
        <Field label={t('checkout.sale.note')} counter={{ value: text.length, max: 1000 }}>
          {(id) => <TextArea id={id} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('checkout.sale.notePlaceholder')} />}
        </Field>
      </div>
    </Modal>
  )
}

/** "Edit sale details": team member per item, tip allocation, payment collected by. */
export function EditSaleDetailsModal({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const { t } = useTranslation()
  const data = useDb(useShallow((s) => ({ teamMembers: s.teamMembers, payments: s.payments })))
  const members = data.teamMembers.filter((m) => !m.archived)
  const options = [{ value: '', label: t('checkout.sale.noMember') }, ...members.map((m) => ({ value: m.id, label: fullName(m) }))]
  const payments = data.payments.filter((p) => sale.paymentIds.includes(p.id))
  const [itemTeam, setItemTeam] = useState<Record<string, string>>(() => Object.fromEntries(sale.items.map((i) => [i.id, i.teamMemberId ?? ''])))
  const [tips, setTips] = useState<{ teamMemberId: string; amount: number | '' }[]>(() => sale.tips.map((x) => ({ ...x })))
  const [collected, setCollected] = useState<Record<string, string>>(() => Object.fromEntries(payments.map((p) => [p.id, p.collectedById ?? ''])))
  const [busy, setBusy] = useState(false)
  const tipTotal = round2(tips.reduce((s, x) => s + (x.amount === '' ? 0 : x.amount), 0))
  const originalTip = round2(sale.tips.reduce((s, x) => s + x.amount, 0))
  const duplicate = new Set(tips.map((x) => x.teamMemberId)).size !== tips.length

  const splitEqually = () => {
    if (!tips.length) return
    const total = originalTip || tipTotal
    const each = Math.floor((total / tips.length) * 100) / 100
    const rest = round2(total - each * tips.length)
    setTips((prev) => prev.map((x, i) => ({ ...x, amount: round2(each + (i === 0 ? rest : 0)) })))
  }
  const save = async () => {
    setBusy(true)
    try {
      await editSaleDetails(sale.id, {
        itemTeam: Object.fromEntries(Object.entries(itemTeam).map(([k, v]) => [k, v || null])),
        tips: tips.filter((x) => x.teamMemberId && x.amount !== '' && x.amount > 0).map((x) => ({ teamMemberId: x.teamMemberId, amount: round2(Number(x.amount)) })),
        collectedBy: Object.fromEntries(Object.entries(collected).filter(([, v]) => v)),
      })
      toast(t('checkout.toasts.saleEdited'))
      onClose()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={t('checkout.sale.editTitle')}
      subtitle={t('checkout.sale.editSubtitle', { number: sale.number })}
      footer={
        <>
          <Button className="rounded-full" onClick={onClose}>
            {t('checkout.common.cancel')}
          </Button>
          <Button variant="primary" className="rounded-full" loading={busy} disabled={duplicate} onClick={() => void save()} data-testid="edit-sale-save">
            {t('checkout.common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-8 pb-4">
        <section>
          <h3 className="mb-3 text-body-lg font-semibold text-ink">{t('checkout.sale.items')}</h3>
          <div className="flex flex-col divide-y divide-line rounded-lg border border-line">
            {sale.items.map((item) => (
              <div key={item.id} className="grid grid-cols-[1fr_auto_260px] items-center gap-4 px-4 py-3">
                <span className="text-body text-ink">
                  {item.quantity > 1 ? `${item.quantity} × ` : ''}
                  {item.name}
                </span>
                <span className="text-body text-muted tabular">{money(lineTotal(item))}</span>
                <Select aria-label={t('checkout.editItem.teamMember')} value={itemTeam[item.id] ?? ''} onChange={(e) => setItemTeam((prev) => ({ ...prev, [item.id]: e.target.value }))} options={options} />
              </div>
            ))}
          </div>
        </section>
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-body-lg font-semibold text-ink">{t('checkout.sale.tips')}</h3>
            <span className="text-body text-muted">{t('checkout.sale.tipTotal', { amount: money(tipTotal) })}</span>
          </div>
          {tips.length === 0 && <p className="mb-3 text-body text-muted">{t('checkout.sale.noTips')}</p>}
          <div className="flex flex-col gap-3">
            {tips.map((tip, i) => (
              <div key={i} className="flex items-center gap-3">
                <Select aria-label={t('checkout.editItem.teamMember')} className="flex-1" value={tip.teamMemberId} onChange={(e) => setTips((prev) => prev.map((x, j) => (j === i ? { ...x, teamMemberId: e.target.value } : x)))} options={members.map((m) => ({ value: m.id, label: fullName(m) }))} />
                <MoneyInput aria-label={t('checkout.tip.tipAmount')} className="w-40" value={tip.amount} onChange={(v) => setTips((prev) => prev.map((x, j) => (j === i ? { ...x, amount: v } : x)))} />
                <button type="button" className="icon-btn" aria-label={t('checkout.tip.removeRow')} onClick={() => setTips((prev) => prev.filter((_, j) => j !== i))}>
                  <X size={18} aria-hidden />
                </button>
              </div>
            ))}
          </div>
          {duplicate && <p className="mt-2 text-small text-danger">{t('checkout.tip.duplicate')}</p>}
          <div className="mt-3 flex gap-2">
            <Button className="rounded-full" icon={<Plus size={16} aria-hidden />} disabled={tips.length >= members.length} onClick={() => setTips((prev) => [...prev, { teamMemberId: members.find((m) => !prev.some((x) => x.teamMemberId === m.id))?.id ?? members[0].id, amount: '' }])}>
              {t('checkout.tip.addMember')}
            </Button>
            <Button variant="ghost" className="rounded-full" disabled={tips.length < 2} onClick={splitEqually}>
              {t('checkout.tip.splitEqually')}
            </Button>
          </div>
        </section>
        {payments.length > 0 && (
          <section>
            <h3 className="mb-3 text-body-lg font-semibold text-ink">{t('checkout.sale.payments')}</h3>
            <div className="flex flex-col divide-y divide-line rounded-lg border border-line">
              {payments.map((p) => (
                <div key={p.id} className="grid grid-cols-[1fr_auto_260px] items-center gap-4 px-4 py-3">
                  <span className="text-body text-ink">
                    {p.methodLabel}
                    <span className="block text-small text-muted">{fmtDateTime(p.at)}</span>
                  </span>
                  <span className="text-body text-muted tabular">{money(p.amount)}</span>
                  <Field label={t('checkout.sale.collectedBy')}>{(id) => <Select id={id} value={collected[p.id] ?? ''} onChange={(e) => setCollected((prev) => ({ ...prev, [p.id]: e.target.value }))} options={options} />}</Field>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </Modal>
  )
}

/** Share a gift card by email (sale drawer gift block, gift card drawer Actions › Share). */
export function ShareGiftCardModal({ card, onClose }: { card: GiftCard; onClose: () => void }) {
  const { t } = useTranslation()
  const owner = useDb((s) => s.clients.find((c) => c.id === (card.ownerClientId ?? card.purchaserClientId)))
  const [email, setEmail] = useState(owner?.email ?? '')
  const [name, setName] = useState(card.recipientName ?? (owner ? fullName(owner) : ''))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const send = async () => {
    if (!emailSchema.safeParse(email).success) {
      setError(t('checkout.sale.invalidEmail'))
      return
    }
    setBusy(true)
    try {
      await shareGiftCard(card.id, email.trim(), name.trim())
      toast(t('checkout.toasts.giftCardSent', { email: email.trim() }))
      onClose()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={t('checkout.giftCard.shareTitle')}
      subtitle={t('checkout.giftCard.shareSubtitle')}
      footer={
        <>
          <Button className="rounded-full" onClick={onClose}>
            {t('checkout.common.cancel')}
          </Button>
          <Button variant="primary" className="rounded-full" loading={busy} onClick={() => void send()} data-testid="share-gift-send">
            {t('checkout.sale.send')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <Field label={t('checkout.giftCard.recipientName')} optional>
          {(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label={t('checkout.giftCard.recipientEmail')} error={error}>
          {(id) => <TextInput id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={Boolean(error)} />}
        </Field>
      </div>
    </Modal>
  )
}

/** Actions › Extend: pick a new expiry date (or never expires). */
export function ExtendGiftCardModal({ card, onClose }: { card: GiftCard; onClose: () => void }) {
  const { t } = useTranslation()
  const base = card.expiresAt && card.expiresAt > toISODate(now()) ? parseISO(card.expiresAt) : now()
  const [mode, setMode] = useState<'1m' | '6m' | '1y' | 'custom' | 'never'>('1y')
  const [custom, setCustom] = useState(toISODate(addYears(base, 1)))
  const [busy, setBusy] = useState(false)
  const target = mode === 'never' ? undefined : mode === '1m' ? toISODate(addMonths(base, 1)) : mode === '6m' ? toISODate(addMonths(base, 6)) : mode === '1y' ? toISODate(addYears(base, 1)) : custom
  const invalid = mode === 'custom' && (!custom || custom <= toISODate(now()))
  const save = async () => {
    if (invalid) return
    setBusy(true)
    try {
      await extendGiftCard(card.id, target)
      toast(t('checkout.toasts.giftCardExtended'))
      onClose()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={t('checkout.giftCard.extendTitle')}
      subtitle={card.expiresAt ? t('checkout.giftCard.currentExpiry', { date: card.expiresAt }) : t('checkout.giftCard.neverExpires')}
      footer={
        <>
          <Button className="rounded-full" onClick={onClose}>
            {t('checkout.common.cancel')}
          </Button>
          <Button variant="primary" className="rounded-full" loading={busy} disabled={invalid} onClick={() => void save()} data-testid="extend-save">
            {t('checkout.giftCard.extend')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <Field label={t('checkout.giftCard.extendBy')}>
          {(id) => (
            <Select
              id={id}
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
              options={[
                { value: '1m', label: t('checkout.giftCard.plus1m') },
                { value: '6m', label: t('checkout.giftCard.plus6m') },
                { value: '1y', label: t('checkout.giftCard.plus1y') },
                { value: 'custom', label: t('checkout.giftCard.customDate') },
                { value: 'never', label: t('checkout.giftCard.never') },
              ]}
            />
          )}
        </Field>
        {mode === 'custom' && (
          <Field label={t('checkout.giftCard.newExpiry')} error={invalid ? t('checkout.giftCard.futureDate') : undefined}>
            {(id) => <TextInput id={id} type="date" value={custom} min={toISODate(now())} onChange={(e) => setCustom(e.target.value)} />}
          </Field>
        )}
        {mode !== 'custom' && <p className="text-body text-muted">{target ? t('checkout.giftCard.newExpiryIs', { date: target }) : t('checkout.giftCard.neverExpires')}</p>}
      </div>
    </Modal>
  )
}

import clsx from 'clsx'
import { Banknote, Check, CircleDollarSign, Gift, Wallet } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { Avatar, Button, Field, Modal, MoneyInput, TextInput } from '@/components/ui'
import { findGiftCard } from '@/api/sales'
import { useDb } from '@/store/db'
import { fmtDateEU, fullName, money, round2 } from '@/lib/format'
import { todayISO } from '@/lib/time'
import type { GiftCard } from '@/types'
import { useCheckout } from './context'
import { keypadPress, parseAmount, quickAmounts } from './model'
import { BackTitle, GiftCardArt, Keypad, Tile } from './ui'

const fmtInput = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))

/** "Add cash amount": keypad, quick amounts, Cash received by, Left to pay / Change. */
export function CashModal({ split, onClose }: { split: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const c = useCheckout()
  const due = Math.max(0, c.due)
  const [text, setText] = useState(fmtInput(due))
  const [fresh, setFresh] = useState(true)
  const [picking, setPicking] = useState(false)
  const [collectedById, setCollectedById] = useState(c.lines.find((l) => l.teamMemberId)?.teamMemberId ?? c.defaultMemberId ?? '')
  const amount = parseAmount(text)
  const change = round2(amount - due)
  const collector = c.members.find((m) => m.id === collectedById)

  const press = (k: string) => {
    setText((s) => keypadPress(fresh && k !== 'back' ? '' : s, k))
    setFresh(false)
  }
  const add = () => {
    c.addPayment({ method: 'cash', amount: round2(Math.min(amount, due)), change: change > 0 ? change : undefined, collectedById: collectedById || undefined, methodLabel: t('checkout.payment.cash') })
    onClose()
  }

  if (picking) return <TeamMemberPicker value={collectedById} onBack={() => setPicking(false)} onClose={onClose} onPick={(id) => { setCollectedById(id); setPicking(false) }} />

  return (
    <Modal open onClose={onClose} size="md" title={<BackTitle onBack={split ? () => c.setModal({ kind: 'splitSelect' }) : undefined}>{t('checkout.cash.title')}</BackTitle>}>
      <div className="flex flex-col items-center pb-2">
        <p className="border-b-2 border-line px-4 pb-1 pt-2 font-display text-[40px] font-bold leading-[48px] text-ink tabular" aria-live="polite">
          € {text || '0'}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {quickAmounts(due).map((q) => (
            <button key={q} type="button" onClick={() => { setText(fmtInput(q)); setFresh(true) }} className={clsx('h-10 rounded-full border px-4 text-body-strong tabular', amount === q ? 'border-ink bg-sunken text-ink' : 'border-line-strong text-ink hover:bg-sunken')}>
              {money(q)}
            </button>
          ))}
        </div>
        <div className="mt-6 w-full">
          <Keypad onPress={press} />
        </div>
        <p className="mt-6 w-full text-body text-ink">
          {t('checkout.cash.receivedBy')} •{' '}
          <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setPicking(true)} data-testid="cash-received-by">
            {collector ? fullName(collector) : t('checkout.cash.chooseMember')}
          </button>
        </p>
        <div className="mt-4 flex w-full items-center justify-between">
          {change > 0 ? (
            <p className="font-display text-title-3 text-success tabular">{t('checkout.cash.change', { amount: money(change) })}</p>
          ) : (
            <p className="font-display text-title-3 text-ink tabular">{t('checkout.cash.leftToPay', { amount: money(Math.max(0, round2(due - amount))) })}</p>
          )}
          <Button variant="primary" size="lg" className="rounded-full" disabled={amount <= 0} onClick={add} data-testid="cash-add">
            {t('checkout.common.add')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** "Team member" picker: Team members in this sale, then Other team members. */
function TeamMemberPicker({ value, onPick, onBack, onClose }: { value: string; onPick: (id: string) => void; onBack: () => void; onClose: () => void }) {
  const { t } = useTranslation()
  const c = useCheckout()
  const inSale = c.members.filter((m) => c.lines.some((l) => l.teamMemberId === m.id))
  const others = c.members.filter((m) => !inSale.includes(m))
  const row = (m: (typeof c.members)[number]) => (
    <button key={m.id} type="button" onClick={() => onPick(m.id)} className="flex w-full items-center gap-4 rounded-md px-2 py-3 text-left hover:bg-sunken">
      <Avatar name={fullName(m)} color={m.color} size={44} />
      <span className="flex-1 text-body-lg font-semibold text-ink">{fullName(m)}</span>
      {value === m.id && <Check size={20} className="text-primary" aria-label={t('checkout.common.selected')} />}
    </button>
  )
  return (
    <Modal open onClose={onClose} size="md" title={<BackTitle onBack={onBack}>{t('checkout.cash.teamMember')}</BackTitle>}>
      <div className="pb-2">
        {inSale.length > 0 && (
          <>
            <p className="mb-1 mt-2 text-body-lg font-semibold text-ink">{t('checkout.cash.inSale')}</p>
            {inSale.map(row)}
            <div className="my-3 border-t border-line" />
          </>
        )}
        <p className="mb-1 text-body-lg font-semibold text-ink">{t('checkout.cash.otherMembers')}</p>
        {others.map(row)}
      </div>
    </Modal>
  )
}

/** "Redeem gift": find a gift card by code (calendar.md §10 / §10.9). */
export function RedeemFindModal({ split, onClose }: { split: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const c = useCheckout()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const find = async () => {
    if (!code.trim()) {
      setError(t('checkout.redeem.codeRequired'))
      return
    }
    setBusy(true)
    setError('')
    try {
      const card = await findGiftCard(code)
      if (card.expiresAt && card.expiresAt < todayISO()) {
        setError(t('checkout.redeem.expired'))
        return
      }
      c.setModal({ kind: 'redeem', card, split })
    } catch (e) {
      setError(e instanceof Error ? e.message : t('checkout.errors.generic'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={<BackTitle onBack={split ? () => c.setModal({ kind: 'splitSelect' }) : undefined}>{t('checkout.redeem.title')}</BackTitle>}
      subtitle={t('checkout.redeem.subtitle')}
      footer={
        <>
          <Button className="rounded-full" onClick={onClose}>
            {t('checkout.common.cancel')}
          </Button>
          <Button variant="primary" className="rounded-full" loading={busy} onClick={() => void find()} data-testid="redeem-find">
            {t('checkout.redeem.find')}
          </Button>
        </>
      }
    >
      <form
        className="pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          void find()
        }}
      >
        <Field label={t('checkout.redeem.findGift')} error={error}>
          {(id) => <TextInput id={id} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t('checkout.redeem.placeholder')} invalid={Boolean(error)} autoComplete="off" />}
        </Field>
      </form>
    </Modal>
  )
}

/** "Redeem gift card": card details and the redeem amount. */
export function RedeemModal({ card, split, onClose }: { card: GiftCard; split: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const c = useCheckout()
  const business = useDb((s) => s.workspace.name)
  const pendingOnCard = round2(c.payments.filter((p) => p.giftCardId === card.id).reduce((s, p) => s + p.amount, 0))
  const available = round2(card.balance - pendingOnCard)
  const due = Math.max(0, c.due)
  const [amount, setAmount] = useState<number | ''>(round2(Math.max(0, Math.min(available, due))))
  const value = amount === '' ? 0 : amount
  const error = value <= 0 ? t('checkout.redeem.amountRequired') : value > available + 0.001 ? t('checkout.redeem.overBalance', { balance: money(available) }) : value > due + 0.001 ? t('checkout.redeem.overDue', { due: money(due) }) : undefined
  const redeem = () => {
    if (error) return
    c.addPayment({ method: 'gift_card', giftCardId: card.id, amount: round2(value), methodLabel: `${t('checkout.redeem.giftCard')} (${card.code})` })
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={<BackTitle onBack={() => c.setModal({ kind: 'redeemFind', split })}>{t('checkout.redeem.cardTitle')}</BackTitle>}
      footer={
        <>
          <Button className="rounded-full" onClick={onClose}>
            {t('checkout.common.cancel')}
          </Button>
          <Button variant="primary" className="rounded-full" disabled={Boolean(error)} onClick={redeem} data-testid="redeem-confirm">
            {t('checkout.redeem.redeem')}
          </Button>
        </>
      }
    >
      <div className="pb-2">
        <div className="mx-auto max-w-[380px]">
          <GiftCardArt compact value={card.balance} business={business} customCode={card.customCode} code={card.code} expires={card.expiresAt ? fmtDateEU(card.expiresAt) : undefined} />
        </div>
        {available < card.balance && <p className="mt-3 text-center text-small text-muted">{t('checkout.redeem.alreadyUsed', { amount: money(pendingOnCard) })}</p>}
        <Field className="mt-6" label={t('checkout.redeem.amount')} error={amount !== '' ? error : undefined} hint={!error ? t('checkout.redeem.leftToPay', { amount: money(Math.max(0, round2(due - value))) }) : undefined}>
          {(id) => <MoneyInput id={id} value={amount} onChange={setAmount} />}
        </Field>
      </div>
    </Modal>
  )
}

/** Split payment › Add payment method › "Select payment". */
export function SplitSelectModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const c = useCheckout()
  const methods = useDb(useShallow((s) => s.settings.customPaymentMethods))
  const otherMethod = methods.find((m) => m.id === 'cpm_other' || m.name.toLowerCase() === 'other')
  const custom = methods.filter((m) => m.active && !m.system && m.id !== otherMethod?.id)
  return (
    <Modal
      open
      onClose={onClose}
      title={t('checkout.split.selectPayment')}
      footer={
        <Button className="rounded-full" onClick={onClose}>
          {t('checkout.common.cancel')}
        </Button>
      }
    >
      <div className="grid grid-cols-3 gap-3 pb-2">
        <Tile icon={<Banknote size={24} aria-hidden />} label={t('checkout.payment.cash')} onClick={() => c.setModal({ kind: 'cash', split: true })} className="min-h-[96px]" />
        <Tile icon={<Gift size={24} aria-hidden />} label={t('checkout.payment.redeemGift')} onClick={() => c.setModal({ kind: 'redeemFind', split: true })} className="min-h-[96px]" />
        {(!otherMethod || otherMethod.active) && <Tile icon={<CircleDollarSign size={24} aria-hidden />} label={t('checkout.payment.other')} onClick={() => c.setModal({ kind: 'otherAmount', method: 'other', label: t('checkout.payment.other') })} className="min-h-[96px]" />}
        {custom.map((m) => (
          <Tile key={m.id} icon={<Wallet size={24} aria-hidden />} label={m.name} onClick={() => c.setModal({ kind: 'otherAmount', method: 'custom', customMethodId: m.id, label: m.name })} className="min-h-[96px]" />
        ))}
      </div>
    </Modal>
  )
}

/** "Add Other payment": amount to pay on Other (split mode). */
export function OtherAmountModal({ method, customMethodId, label, onClose }: { method: 'other' | 'custom'; customMethodId?: string; label: string; onClose: () => void }) {
  const { t } = useTranslation()
  const c = useCheckout()
  const due = Math.max(0, c.due)
  const [amount, setAmount] = useState<number | ''>(due)
  const value = amount === '' ? 0 : amount
  const error = value <= 0 ? t('checkout.split.amountRequired') : value > due + 0.001 ? t('checkout.split.overDue', { due: money(due) }) : undefined
  const add = () => {
    if (error) return
    c.addPayment({ method, customMethodId, amount: round2(value), methodLabel: label })
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={<BackTitle onBack={() => c.setModal({ kind: 'splitSelect' })}>{t('checkout.split.addPayment', { method: label })}</BackTitle>}
      footer={
        <>
          <Button className="rounded-full" onClick={onClose}>
            {t('checkout.common.cancel')}
          </Button>
          <Button variant="primary" className="rounded-full" disabled={Boolean(error)} onClick={add} data-testid="split-add-payment">
            {t('checkout.split.addPaymentButton')}
          </Button>
        </>
      }
    >
      <div className="pb-2">
        <div className="mb-5 flex items-center justify-between text-body-lg font-semibold text-ink">
          <span>{t('checkout.split.amountToPay')}</span>
          <span className="tabular">{money(due)}</span>
        </div>
        <Field label={t('checkout.split.amountOn', { method: label })} error={amount !== '' ? error : undefined} hint={!error ? t('checkout.redeem.leftToPay', { amount: money(Math.max(0, round2(due - value))) }) : undefined}>
          {(id) => <MoneyInput id={id} value={amount} onChange={setAmount} />}
        </Field>
      </div>
    </Modal>
  )
}

import { CheckCircle2, CreditCard, Loader2, Smartphone, XCircle } from 'lucide-react'
import QRCode from 'qrcode'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Button, Field, Modal, TextInput, toast } from '@/components/ui'
import { ApiError } from '@/api/client'
import { sendPaymentLink } from '@/api/checkout'
import type { PaymentMethod } from '@/types'
import { useDb } from '@/store/db'
import { uid } from '@/lib/ids'
import { now } from '@/lib/time'
import { fullName, money } from '@/lib/format'
import { useCheckout } from './context'

type Phase = 'idle' | 'waiting' | 'processing' | 'approved' | 'declined'

/** Charge the remaining balance with a card-type method; handles card_declined. */
function useCardCharge(method: PaymentMethod, label: string) {
  const { t } = useTranslation()
  const c = useCheckout()
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState('')
  const amount = Math.max(0, c.due)
  const alive = useRef(true)
  useEffect(
    () => () => {
      alive.current = false
    },
    [],
  )
  const charge = useCallback(async () => {
    setPhase('processing')
    setError('')
    try {
      const sale = await c.finalize('pay', [{ method, amount, methodLabel: label }])
      if (!alive.current) return
      setPhase('approved')
      setTimeout(() => c.complete(sale, 'pay'), 900)
    } catch (e) {
      if (!alive.current) return
      if (e instanceof ApiError && e.code === 'card_declined') {
        setPhase('declined')
        setError(e.message)
      } else {
        setPhase('idle')
        toast(e instanceof Error ? e.message : t('checkout.errors.generic'), 'error')
      }
    }
  }, [c, method, amount, label, t])
  const chargeRef = useRef(charge)
  chargeRef.current = charge
  const chargeLater = useCallback((ms: number) => setTimeout(() => void chargeRef.current(), ms), [])
  return { phase, setPhase, error, charge, chargeLater, amount }
}

function StatusBlock({ phase, waitingText, approvedText, error }: { phase: Phase; waitingText: string; approvedText: string; error: string }) {
  const { t } = useTranslation()
  if (phase === 'approved')
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-success" role="status">
        <CheckCircle2 size={44} aria-hidden />
        <p className="font-display text-title-3">{approvedText}</p>
      </div>
    )
  if (phase === 'declined')
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-center text-danger" role="alert">
        <XCircle size={44} aria-hidden />
        <p className="font-display text-title-3">{t('checkout.card.declined')}</p>
        <p className="max-w-sm text-body text-muted">{error}</p>
      </div>
    )
  if (phase === 'waiting' || phase === 'processing')
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-muted" role="status">
        <Loader2 size={36} className="animate-spin text-primary" aria-hidden />
        <p className="text-body-lg text-ink">{phase === 'processing' ? t('checkout.card.processing') : waitingText}</p>
      </div>
    )
  return null
}

function DeclinedFooter({ onRetry, onClose }: { onRetry: () => void; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <>
      <Button className="rounded-full" onClick={onClose}>
        {t('checkout.card.anotherMethod')}
      </Button>
      <Button variant="primary" className="rounded-full" onClick={onRetry} data-testid="card-retry">
        {t('checkout.card.tryAgain')}
      </Button>
    </>
  )
}

/** Card terminal: "Waiting for card…" → "Approved" (or "Card declined"). */
export function TerminalModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const { phase, setPhase, error, chargeLater, amount } = useCardCharge('card_terminal', t('checkout.payment.cardTerminal'))
  useEffect(() => {
    if (phase === 'idle') setPhase('waiting')
    if (phase !== 'waiting') return
    const timer = chargeLater(2200)
    return () => clearTimeout(timer)
  }, [phase, setPhase, chargeLater])
  const busy = phase === 'processing' || phase === 'approved'
  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      hideClose={busy}
      size="sm"
      title={t('checkout.card.terminalTitle')}
      footer={
        phase === 'declined' ? (
          <DeclinedFooter onRetry={() => setPhase('waiting')} onClose={onClose} />
        ) : phase === 'waiting' ? (
          <Button className="rounded-full" onClick={onClose}>
            {t('checkout.common.cancel')}
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col items-center pb-2" data-testid="terminal-screen">
        <div className="mt-2 w-[220px] rounded-[28px] bg-ink p-4 text-canvas shadow-md">
          <div className="rounded-xl bg-canvas/10 px-4 py-6 text-center">
            <p className="text-small text-canvas/70">{t('checkout.card.terminalName')}</p>
            <p className="mt-2 font-display text-[30px] font-bold leading-9 tabular">{money(amount)}</p>
            <p className="mt-3 flex items-center justify-center gap-2 text-small">
              <CreditCard size={16} aria-hidden />
              {phase === 'approved' ? t('checkout.card.approved') : phase === 'declined' ? t('checkout.card.declined') : t('checkout.card.tapInsert')}
            </p>
          </div>
          <div className="mx-auto mt-4 grid w-28 grid-cols-3 gap-1.5" aria-hidden>
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} className="h-3 rounded-sm bg-canvas/20" />
            ))}
          </div>
        </div>
        <StatusBlock phase={phase} waitingText={t('checkout.card.waitingForCard')} approvedText={t('checkout.card.approved')} error={error} />
      </div>
    </Modal>
  )
}

/** Self checkout: text a pay link, then "Client paid" after ~3 s. */
export function SelfCheckoutModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const c = useCheckout()
  const client = useDb((s) => s.clients.find((x) => x.id === c.clientId))
  const [phone, setPhone] = useState(client?.phone ?? '')
  const [sending, setSending] = useState(false)
  const [phoneError, setPhoneError] = useState('')
  const { phase, setPhase, error, chargeLater, amount } = useCardCharge('self_checkout', t('checkout.payment.selfCheckout'))
  useEffect(() => {
    if (phase !== 'waiting') return
    const timer = chargeLater(3000)
    return () => clearTimeout(timer)
  }, [phase, chargeLater])
  const send = async () => {
    if (!/^\+?[\d\s()-]{9,}$/.test(phone.trim())) {
      setPhoneError(t('checkout.card.phoneInvalid'))
      return
    }
    setPhoneError('')
    setSending(true)
    try {
      await sendPaymentLink({ clientId: c.clientId, phone: phone.trim(), name: client ? fullName(client) : t('checkout.client.walkIn'), amount, saleRef: c.existingSale ? `#${c.existingSale.number}` : '' })
      toast(t('checkout.toasts.linkSent', { phone: phone.trim() }))
      setPhase('waiting')
    } finally {
      setSending(false)
    }
  }
  const busy = phase === 'processing' || phase === 'approved'
  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      hideClose={busy}
      title={t('checkout.card.selfTitle')}
      subtitle={phase === 'idle' ? t('checkout.card.selfSubtitle') : undefined}
      footer={
        phase === 'idle' ? (
          <>
            <Button className="rounded-full" onClick={onClose}>
              {t('checkout.common.cancel')}
            </Button>
            <Button variant="primary" className="rounded-full" loading={sending} onClick={() => void send()} data-testid="self-send">
              {t('checkout.card.sendLink')}
            </Button>
          </>
        ) : phase === 'declined' ? (
          <DeclinedFooter onRetry={() => setPhase('waiting')} onClose={onClose} />
        ) : phase === 'waiting' ? (
          <Button className="rounded-full" onClick={onClose}>
            {t('checkout.common.cancel')}
          </Button>
        ) : undefined
      }
    >
      <div className="pb-2">
        <div className="mb-5 flex items-center justify-between rounded-lg bg-sunken px-5 py-4">
          <span className="flex items-center gap-2 text-body text-muted">
            <Smartphone size={18} aria-hidden />
            {t('checkout.card.amountToPay')}
          </span>
          <span className="font-display text-title-3 text-ink tabular">{money(amount)}</span>
        </div>
        {phase === 'idle' ? (
          <Field label={t('checkout.card.mobile')} error={phoneError}>
            {(id) => <TextInput id={id} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+351 912 345 678" invalid={Boolean(phoneError)} />}
          </Field>
        ) : (
          <>
            {phase === 'waiting' && <p className="text-center text-body text-muted">{t('checkout.card.linkSentTo', { phone })}</p>}
            <StatusBlock phase={phase} waitingText={t('checkout.card.waitingForClient')} approvedText={t('checkout.card.clientPaid')} error={error} />
          </>
        )}
      </div>
    </Modal>
  )
}

/** QR code: client scans to pay; "Simulate scan" stands in for the phone. */
export function QrModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const { phase, setPhase, error, charge, amount } = useCardCharge('qr_code', t('checkout.payment.qrCode'))
  const [src, setSrc] = useState('')
  useEffect(() => {
    let live = true
    void QRCode.toDataURL(`https://pay.innoweb.example/qr/${uid('qr')}?amount=${amount.toFixed(2)}`, { margin: 1, width: 240, color: { dark: '#10201F', light: '#FFFFFF' } }).then((url) => {
      if (live) setSrc(url)
    })
    return () => {
      live = false
    }
  }, [amount])
  const busy = phase === 'processing' || phase === 'approved'
  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      hideClose={busy}
      size="sm"
      title={t('checkout.card.qrTitle')}
      footer={
        phase === 'declined' ? (
          <DeclinedFooter onRetry={() => setPhase('idle')} onClose={onClose} />
        ) : phase === 'idle' ? (
          <>
            <Button className="rounded-full" onClick={onClose}>
              {t('checkout.common.cancel')}
            </Button>
            <Button variant="primary" className="rounded-full" onClick={() => void charge()} data-testid="qr-simulate">
              {t('checkout.card.simulateScan')}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col items-center pb-2">
        <p className="font-display text-title-2 text-ink tabular">{money(amount)}</p>
        <p className="mt-1 text-center text-body text-muted">{t('checkout.card.qrBody')}</p>
        <div className="mt-5 flex h-[240px] w-[240px] items-center justify-center rounded-lg border border-line bg-white p-2">{src ? <img src={src} alt={t('checkout.card.qrAlt')} width={224} height={224} /> : <Loader2 className="animate-spin text-muted" aria-hidden />}</div>
        <StatusBlock phase={phase} waitingText={t('checkout.card.waitingForScan')} approvedText={t('checkout.card.paymentReceived')} error={error} />
      </div>
    </Modal>
  )
}

const luhn = (digits: string) => {
  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i])
    if (double) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    double = !double
  }
  return sum % 10 === 0
}

/** Manual card entry: card form with validation, simulated charge. */
export function ManualCardModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const { phase, setPhase, error, charge, amount } = useCardCharge('manual_card', t('checkout.payment.manualCard'))
  const [form, setForm] = useState({ name: '', number: '', expiry: '', cvc: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const schema = z.object({
    name: z.string().trim().min(2, t('checkout.card.errors.name')),
    number: z
      .string()
      .transform((v) => v.replace(/\s/g, ''))
      .refine((v) => /^\d{13,19}$/.test(v) && luhn(v), t('checkout.card.errors.number')),
    expiry: z.string().refine((v) => {
      const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(v.trim())
      if (!m) return false
      const month = Number(m[1])
      const year = 2000 + Number(m[2])
      if (month < 1 || month > 12) return false
      const today = now()
      return year > today.getFullYear() || (year === today.getFullYear() && month >= today.getMonth() + 1)
    }, t('checkout.card.errors.expiry')),
    cvc: z.string().refine((v) => /^\d{3,4}$/.test(v.trim()), t('checkout.card.errors.cvc')),
  })
  const submit = () => {
    const parsed = schema.safeParse(form)
    if (!parsed.success) {
      const next: Record<string, string> = {}
      parsed.error.issues.forEach((i) => (next[String(i.path[0])] = i.message))
      setErrors(next)
      return
    }
    setErrors({})
    void charge()
  }
  const formatNumber = (v: string) =>
    v
      .replace(/\D/g, '')
      .slice(0, 19)
      .replace(/(.{4})/g, '$1 ')
      .trim()
  const formatExpiry = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 4)
    return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d
  }
  const busy = phase === 'processing' || phase === 'approved'
  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      hideClose={busy}
      title={t('checkout.card.manualTitle')}
      footer={
        phase === 'declined' ? (
          <DeclinedFooter onRetry={() => setPhase('idle')} onClose={onClose} />
        ) : phase === 'idle' ? (
          <>
            <Button className="rounded-full" onClick={onClose}>
              {t('checkout.common.cancel')}
            </Button>
            <Button variant="primary" className="rounded-full" onClick={submit} data-testid="manual-charge">
              {t('checkout.card.charge', { amount: money(amount) })}
            </Button>
          </>
        ) : undefined
      }
    >
      {phase === 'idle' ? (
        <form
          className="grid grid-cols-2 gap-4 pb-2"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          noValidate
        >
          <Field className="col-span-2" label={t('checkout.card.holder')} error={errors.name}>
            {(id) => <TextInput id={id} autoComplete="cc-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} invalid={Boolean(errors.name)} />}
          </Field>
          <Field className="col-span-2" label={t('checkout.card.number')} error={errors.number} hint={t('checkout.card.testCard')}>
            {(id) => <TextInput id={id} inputMode="numeric" autoComplete="cc-number" placeholder="1234 1234 1234 1234" value={form.number} onChange={(e) => setForm((f) => ({ ...f, number: formatNumber(e.target.value) }))} invalid={Boolean(errors.number)} />}
          </Field>
          <Field label={t('checkout.card.expiry')} error={errors.expiry}>
            {(id) => <TextInput id={id} inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" value={form.expiry} onChange={(e) => setForm((f) => ({ ...f, expiry: formatExpiry(e.target.value) }))} invalid={Boolean(errors.expiry)} />}
          </Field>
          <Field label={t('checkout.card.cvc')} error={errors.cvc}>
            {(id) => <TextInput id={id} inputMode="numeric" autoComplete="cc-csc" placeholder="123" maxLength={4} value={form.cvc} onChange={(e) => setForm((f) => ({ ...f, cvc: e.target.value.replace(/\D/g, '') }))} invalid={Boolean(errors.cvc)} />}
          </Field>
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
      ) : (
        <StatusBlock phase={phase} waitingText="" approvedText={t('checkout.card.approved')} error={error} />
      )}
    </Modal>
  )
}

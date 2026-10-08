import { ArrowLeft, Banknote, CircleDollarSign, CreditCard, Gift, Keyboard, Lock, Plus, QrCode, Smartphone, Split, Trash2, Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui'
import { useDb } from '@/store/db'
import { fullName, money } from '@/lib/format'
import { useCheckout } from './context'
import { Breadcrumb } from './Breadcrumb'
import { MethodIcon, Tile } from './ui'

/** Whether the location's register must be open and isn't (sales.md register rule). */
export function useRegisterBlocked(locationId: string): { blocked: boolean; registerId?: string } {
  const data = useDb(useShallow((s) => ({ registers: s.registers, sessions: s.registerSessions, enabled: s.settings.registersEnabled })))
  const register = data.registers.find((r) => r.locationId === locationId && !r.archived)
  if (!register || !data.enabled || !register.settings.requireOpen) return { blocked: false, registerId: register?.id }
  const open = data.sessions.some((s) => s.registerId === register.id && !s.closedAt)
  return { blocked: !open, registerId: register.id }
}

export function PaymentStep() {
  const { t } = useTranslation()
  const c = useCheckout()
  const navigate = useNavigate()
  const data = useDb(useShallow((s) => ({ methods: s.settings.customPaymentMethods, addOns: s.addOns })))
  const { blocked } = useRegisterBlocked(c.locationId)
  const paymentsActive = data.addOns.find((a) => a.slug === 'payments')?.status === 'active'
  const otherMethod = data.methods.find((m) => m.id === 'cpm_other' || m.name.toLowerCase() === 'other')
  const showOther = !otherMethod || otherMethod.active
  const customMethods = data.methods.filter((m) => m.active && !m.system && m.id !== otherMethod?.id).sort((a, b) => a.order - b.order)
  const noDue = c.due <= 0.004

  if (c.view === 'split') return <SplitView />

  if (blocked) {
    return (
      <div>
        <Breadcrumb />
        <h1 className="mt-3 font-display text-title-1 text-ink">{t('checkout.payment.title')}</h1>
        <div className="mt-10 flex flex-col items-center rounded-lg border border-line px-8 py-14 text-center" data-testid="register-closed">
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-subtle text-primary">
            <Lock size={26} aria-hidden />
          </span>
          <h2 className="font-display text-title-3 text-ink">{t('checkout.register.title')}</h2>
          <p className="mt-2 max-w-md text-body text-muted">{t('checkout.register.body')}</p>
          <Button variant="primary" className="mt-6" onClick={() => c.setModal({ kind: 'openRegister' })}>
            {t('checkout.register.open')}
          </Button>
        </div>
      </div>
    )
  }

  const hasOther = c.payments.some((p) => p.method === 'other')
  const card = (kind: 'terminal' | 'selfCheckout' | 'qr' | 'manualCard') => {
    if (!paymentsActive) navigate('/payments/payment-processing')
    else c.setModal({ kind })
  }

  return (
    <div>
      <Breadcrumb />
      <h1 className="mt-3 font-display text-title-1 text-ink">{t('checkout.payment.title')}</h1>
      {noDue && c.lines.length > 0 && <p className="mt-4 rounded-md bg-success-subtle px-4 py-3 text-body text-success">{t('checkout.payment.fullyCovered')}</p>}
      <h2 className="mt-8 text-body-lg font-semibold text-ink">{t('checkout.payment.methods')}</h2>
      <div className="mt-4 grid grid-cols-3 gap-4">
        <Tile icon={<Banknote size={26} aria-hidden />} label={t('checkout.payment.cash')} disabled={noDue} selected={c.payments.some((p) => p.method === 'cash')} onClick={() => c.setModal({ kind: 'cash', split: false })} testId="pay-cash" />
        <Tile icon={<Gift size={26} aria-hidden />} label={t('checkout.payment.redeemGift')} disabled={noDue} selected={c.payments.some((p) => p.method === 'gift_card')} onClick={() => c.setModal({ kind: 'redeemFind', split: false })} testId="pay-gift" />
        <Tile icon={<Split size={26} aria-hidden />} label={t('checkout.payment.split')} disabled={noDue && !c.payments.length} onClick={() => c.setView('split')} testId="pay-split" />
        {showOther && (
          <Tile
            icon={<CircleDollarSign size={26} aria-hidden />}
            label={t('checkout.payment.other')}
            disabled={noDue && !hasOther}
            selected={hasOther}
            onClick={() => {
              if (!noDue) c.addPayment({ method: 'other', amount: c.due, methodLabel: t('checkout.payment.other') })
            }}
            testId="pay-other"
          />
        )}
        {customMethods.map((m) => (
          <Tile
            key={m.id}
            icon={<Wallet size={26} aria-hidden />}
            label={m.name}
            disabled={noDue}
            selected={c.payments.some((p) => p.customMethodId === m.id)}
            onClick={() => c.addPayment({ method: 'custom', customMethodId: m.id, amount: c.due, methodLabel: m.name })}
            testId={`pay-custom-${m.id}`}
          />
        ))}
      </div>
      <h2 className="mt-10 text-body-lg font-semibold text-ink">{t('checkout.payment.innowebMethods')}</h2>
      {!paymentsActive && <p className="mt-1 text-body text-muted">{t('checkout.payment.setupPayments')}</p>}
      <div className="mt-4 grid grid-cols-3 gap-4">
        <Tile icon={<CreditCard size={26} aria-hidden />} label={t('checkout.payment.cardTerminal')} disabled={noDue} onClick={() => card('terminal')} testId="pay-terminal" />
        <Tile icon={<Smartphone size={26} aria-hidden />} label={t('checkout.payment.selfCheckout')} disabled={noDue} onClick={() => card('selfCheckout')} testId="pay-self" />
        <Tile icon={<QrCode size={26} aria-hidden />} label={t('checkout.payment.qrCode')} disabled={noDue} onClick={() => card('qr')} testId="pay-qr" />
        <Tile icon={<Keyboard size={26} aria-hidden />} label={t('checkout.payment.manualCard')} disabled={noDue} onClick={() => card('manualCard')} testId="pay-manual" />
      </div>
    </div>
  )
}

function SplitView() {
  const { t } = useTranslation()
  const c = useCheckout()
  const members = c.members
  return (
    <div>
      <Breadcrumb />
      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={() => c.setView('step')} aria-label={t('checkout.common.goBack')} className="icon-btn -ml-2">
          <ArrowLeft size={22} aria-hidden />
        </button>
        <h1 className="font-display text-title-1 text-ink">{t('checkout.payment.split')}</h1>
      </div>
      <div className="mt-8 flex flex-col gap-3">
        {c.payments.map((p) => {
          const collector = members.find((m) => m.id === p.collectedById)
          return (
            <div key={p.key} className="flex items-center justify-between gap-4 rounded-lg border border-line px-6 py-5" data-testid="split-row">
              <span className="flex items-center gap-3 text-body-lg font-semibold text-ink">
                <MethodIcon method={p.method} size={22} />
                {p.methodLabel}
                {collector && <span className="font-normal text-ink">• {fullName(collector)}</span>}
              </span>
              <span className="flex items-center gap-3">
                <span className="text-body-lg font-semibold text-ink tabular">{money(p.amount)}</span>
                <button type="button" className="icon-btn h-9 w-9" aria-label={t('checkout.totals.removePayment')} title={t('checkout.payment.remove')} onClick={() => c.removePayment(p.key)}>
                  <Trash2 size={18} aria-hidden />
                </button>
              </span>
            </div>
          )
        })}
        {c.due > 0.004 && (
          <button type="button" onClick={() => c.setModal({ kind: 'splitSelect' })} className="flex items-center gap-3 rounded-lg border border-line px-6 py-5 text-left text-body-lg font-semibold text-primary hover:bg-primary-subtle/40" data-testid="split-add">
            <Plus size={20} aria-hidden />
            {t('checkout.payment.addMethod')}
          </button>
        )}
      </div>
      {c.payments.length === 0 && <p className="mt-6 text-body text-muted">{t('checkout.payment.splitHint', { amount: money(c.due) })}</p>}
    </div>
  )
}

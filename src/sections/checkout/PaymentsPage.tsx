import { subDays } from 'date-fns'
import { ArrowRight, Check, CreditCard, Landmark, ShieldCheck, Smartphone, Wallet, Zap } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { Button, Card, Chip, FullscreenFrame, PageSkeleton, usePageLoading } from '@/components/ui'
import { useDb } from '@/store/db'
import { fmtDate, money } from '@/lib/format'
import { useNow } from '@/lib/time'

const CARD_METHODS = ['card_terminal', 'qr_code', 'self_checkout', 'manual_card', 'online_card']

/** Payments add-on page (add-ons.md §2.1). Active in the seed: status, rates and shortcuts. */
export function PaymentsProcessingPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loading = usePageLoading()
  const now = useNow()
  const data = useDb(useShallow((s) => ({ addOns: s.addOns, payments: s.payments, wallet: s.wallet, payouts: s.payouts })))
  const addon = data.addOns.find((a) => a.slug === 'payments')
  const active = addon?.status === 'active'
  const close = () => (window.history.length > 1 ? navigate(-1) : navigate('/add-ons'))

  const stats = useMemo(() => {
    const since = subDays(now, 30).toISOString()
    const card = data.payments.filter((p) => p.status === 'succeeded' && p.kind !== 'refund' && CARD_METHODS.includes(p.method) && p.at >= since)
    return { count: card.length, volume: card.reduce((s, p) => s + p.amount, 0) }
  }, [data.payments, now])

  const rates = [
    { icon: Zap, title: t('checkout.payments.rates.payouts'), body: t('checkout.payments.rates.payoutsBody'), price: t('checkout.payments.free') },
    { icon: Smartphone, title: t('checkout.payments.rates.online'), body: t('checkout.payments.rates.onlineBody'), price: t('checkout.payments.rates.onlinePrice') },
    { icon: CreditCard, title: t('checkout.payments.rates.inPerson'), body: t('checkout.payments.rates.inPersonBody'), price: t('checkout.payments.rates.inPersonPrice') },
    { icon: Smartphone, title: t('checkout.payments.rates.tap'), body: t('checkout.payments.rates.tapBody'), price: t('checkout.payments.rates.tapPrice') },
    { icon: CreditCard, title: t('checkout.payments.rates.manual'), body: t('checkout.payments.rates.manualBody'), price: t('checkout.payments.free') },
  ]

  return (
    <FullscreenFrame title={t('checkout.payments.frameTitle')} onClose={close} maxWidth="max-w-5xl">
      {loading ? (
        <PageSkeleton rows={4} />
      ) : (
        <div className="flex flex-col gap-8" data-testid="payments-page">
          <div className="grid items-center gap-8 lg:grid-cols-[1fr_360px]">
            <div>
              <div className="flex items-center gap-3">
                <span className="text-body-strong text-muted">{t('checkout.payments.addon')}</span>
                {active ? <Chip tone="success">{t('checkout.payments.active')}</Chip> : <Chip>{t('checkout.payments.notActive')}</Chip>}
              </div>
              <h1 className="mt-3 font-display text-[36px] font-bold leading-[44px] text-ink">{t('checkout.payments.title')}</h1>
              <ul className="mt-6 flex flex-col gap-3">
                {(['b1', 'b2', 'b3'] as const).map((b) => (
                  <li key={b} className="flex items-start gap-3 text-body-lg text-ink">
                    <Check size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden />
                    {t(`checkout.payments.${b}`)}
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-body-lg text-ink">{t('checkout.payments.from')}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                {active ? (
                  <>
                    <Button variant="primary" size="lg" onClick={() => navigate('/setup/payments/payment-methods')}>
                      {t('checkout.payments.settings')}
                    </Button>
                    <Button size="lg" icon={<Wallet size={18} aria-hidden />} onClick={() => navigate('/dashboard?drawer=wallet&tab=accounts')}>
                      {t('checkout.payments.wallet')}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="primary" size="lg" onClick={() => navigate('/payments/onboarding/overview')}>
                      {t('checkout.payments.startNow')}
                    </Button>
                    <Button size="lg" onClick={() => navigate(`/dashboard?drawer=resources&tab=help&d_q=${encodeURIComponent(t('nav.payments'))}`)}>
                      {t('checkout.payments.learnMore')}
                    </Button>
                  </>
                )}
              </div>
            </div>
            <div className="relative overflow-hidden rounded-xl bg-primary-subtle p-6" aria-hidden>
              <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/40" />
              <div className="relative mx-auto w-[200px] rounded-[26px] bg-ink p-4 text-canvas shadow-lg">
                <div className="rounded-xl bg-canvas/10 px-4 py-6 text-center">
                  <p className="text-small text-canvas/70">{t('checkout.card.terminalName')}</p>
                  <p className="mt-2 font-display text-[28px] font-bold">{money(28.75)}</p>
                  <p className="mt-2 text-small">{t('checkout.card.approved')}</p>
                </div>
              </div>
            </div>
          </div>

          {active && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <p className="text-body text-muted">{t('checkout.payments.status')}</p>
                <p className="mt-1 flex items-center gap-2 font-display text-title-3 text-success">
                  <ShieldCheck size={20} aria-hidden />
                  {t('checkout.payments.active')}
                </p>
                {addon?.enabledAt && <p className="mt-1 text-small text-muted">{t('checkout.payments.since', { date: fmtDate(addon.enabledAt) })}</p>}
              </Card>
              <Card>
                <p className="text-body text-muted">{t('checkout.payments.last30')}</p>
                <p className="mt-1 font-display text-title-3 text-ink tabular">{money(stats.volume)}</p>
                <p className="mt-1 text-small text-muted">{t('checkout.payments.transactions', { count: stats.count })}</p>
              </Card>
              <Card>
                <p className="text-body text-muted">{t('checkout.payments.walletBalance')}</p>
                <p className="mt-1 font-display text-title-3 text-ink tabular">{money(data.wallet.balance)}</p>
                <button type="button" className="mt-1 inline-flex items-center gap-1 text-small font-semibold text-primary hover:underline" onClick={() => navigate('/dashboard?drawer=wallet&tab=accounts')}>
                  {t('checkout.payments.openWallet')} <ArrowRight size={14} aria-hidden />
                </button>
              </Card>
            </div>
          )}

          <Card title={t('checkout.payments.ratesTitle')} subtitle={t('checkout.payments.ratesSubtitle')}>
            <ul className="divide-y divide-line">
              {rates.map((r) => (
                <li key={r.title} className="flex items-center justify-between gap-6 py-4">
                  <span className="flex items-start gap-3">
                    <r.icon size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden />
                    <span>
                      <span className="block text-body-strong text-ink">{r.title}</span>
                      <span className="block text-body text-muted">{r.body}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-body-strong text-ink">{r.price}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-small text-muted">{t('checkout.payments.taxNote')}</p>
            <p className="mt-2 text-small text-muted">{t('checkout.payments.accepts')}</p>
          </Card>

          {active && (
            <Card title={t('checkout.payments.manage')}>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { label: t('checkout.payments.links.methods'), path: '/setup/payments/payment-methods', icon: CreditCard },
                  { label: t('checkout.payments.links.policy'), path: '/setup/payments/payment-policy', icon: ShieldCheck },
                  { label: t('checkout.payments.links.terminals'), path: '/setup/payments/terminals', icon: Smartphone },
                  { label: t('checkout.payments.links.bank'), path: '/setup/billing/bank-accounts', icon: Landmark },
                ].map((l) => (
                  <button key={l.path} type="button" onClick={() => navigate(l.path)} className="flex items-center justify-between rounded-lg border border-line px-4 py-3 text-left text-body-strong text-ink hover:bg-sunken">
                    <span className="flex items-center gap-3">
                      <l.icon size={18} className="text-primary" aria-hidden />
                      {l.label}
                    </span>
                    <ArrowRight size={16} className="text-muted" aria-hidden />
                  </button>
                ))}
              </div>
              {data.payouts[0] && <p className="mt-4 text-small text-muted">{t('checkout.payments.lastPayout', { amount: money(data.payouts[0].amount), date: fmtDate(data.payouts[0].at), last4: data.payouts[0].bankLast4 })}</p>}
            </Card>
          )}
        </div>
      )}
    </FullscreenFrame>
  )
}

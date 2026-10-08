import clsx from 'clsx'
import { isAfter, parseISO, subDays } from 'date-fns'
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Coins, Gift, Landmark, Lightbulb, Receipt, SlidersHorizontal, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { DrawerProps } from '@/app/sectionRegistry'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { Button, DetailList, EmptyState, LearnMore, Menu, MenuButton, Modal, PillTabs, Skeleton, toast, usePageLoading } from '@/components/ui'
import { fmtDate, fmtDateTimeUS, money, money2, round2 } from '@/lib/format'
import { now } from '@/lib/time'
import { instantPayout, instantPayoutFee, usePanels } from '@/api/panels'
import { ApiError } from '@/api/client'
import type { WalletTransaction } from '@/types'

type Tab = 'accounts' | 'credits'
type TxFilter = 'all' | WalletTransaction['type']
type RangeFilter = '7' | '30' | 'all'

/** Business wallet drawer: accounts and credits (top-bar.md §6). */
export function WalletDrawer({ params }: DrawerProps) {
  const { t } = useTranslation()
  const drawer = useDrawer()
  const workspace = useDb((s) => s.workspace)
  const tab: Tab = params.get('tab') === 'credits' ? 'credits' : 'accounts'

  return (
    // Phones: the side menu becomes a compact header (name + Accounts / Credits pills) above the content.
    <div className="flex h-full min-h-0 flex-col md:flex-row" aria-label={t('drawers.wallet')}>
      <aside className="flex w-full shrink-0 flex-col border-b border-line md:w-[280px] md:border-b-0 md:border-r">
        <div className="px-4 pb-3 pt-4 md:border-b md:border-line md:px-6 md:pb-6 md:pt-8">
          <h2 className="font-display text-title-2 text-ink">{workspace.name}</h2>
          <p className="text-body text-muted">{t('panels.wallet.businessWallet')}</p>
        </div>
        <nav className="flex gap-2 px-4 pb-3 md:flex-col md:gap-1 md:p-4" aria-label={t('panels.wallet.businessWallet')}>
          {(['accounts', 'credits'] as const).map((x) => (
            <button
              key={x}
              type="button"
              aria-current={tab === x ? 'page' : undefined}
              onClick={() => drawer.update({ tab: x })}
              className={clsx('flex h-10 items-center rounded-full px-4 text-left text-body md:h-11 md:rounded-md', tab === x ? 'bg-primary-subtle font-semibold text-primary' : 'text-ink ring-1 ring-line hover:bg-sunken md:ring-0')}
            >
              {t(`panels.wallet.tabs.${x}`)}
            </button>
          ))}
        </nav>
      </aside>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-canvas">{tab === 'accounts' ? <Accounts /> : <Credits />}</div>
    </div>
  )
}

function Accounts() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loading = usePageLoading(300)
  const workspace = useDb((s) => s.workspace)
  const wallet = useDb((s) => s.wallet)
  const payouts = useDb((s) => s.payouts)
  const addOns = useDb((s) => s.addOns)
  const [txFilter, setTxFilter] = useState<TxFilter>('all')
  const [range, setRange] = useState<RangeFilter>('30')
  const [showAllPayouts, setShowAllPayouts] = useState(false)
  const [modal, setModal] = useState<'payout' | 'summary' | 'info' | null>(null)
  const [busy, setBusy] = useState(false)
  const paymentsActive = addOns.some((a) => a.slug === 'payments' && a.status === 'active')
  const bankLast4 = payouts[0]?.bankLast4 ?? '4417'

  const [euros, cents] = money2(wallet.balance).split('.')
  const fee = instantPayoutFee(wallet.available)

  const transactions = useMemo(() => {
    const since = range === 'all' ? null : subDays(now(), Number(range))
    return wallet.transactions
      .filter((x) => (txFilter === 'all' || x.type === txFilter) && (!since || isAfter(parseISO(x.at), since)))
      .sort((a, b) => b.at.localeCompare(a.at))
  }, [wallet.transactions, txFilter, range])

  const last30 = useMemo(() => {
    const since = subDays(now(), 30)
    const recent = wallet.transactions.filter((x) => isAfter(parseISO(x.at), since))
    return {
      paidOut: round2(-recent.filter((x) => x.type === 'payout').reduce((s, x) => s + x.amount, 0)),
      fees: round2(-recent.filter((x) => x.type === 'fee').reduce((s, x) => s + x.amount, 0)),
      payments: round2(recent.filter((x) => x.type === 'payment').reduce((s, x) => s + x.amount, 0)),
    }
  }, [wallet.transactions])

  const payOut = async () => {
    setBusy(true)
    try {
      const { amount } = await instantPayout()
      toast(t('panels.wallet.payoutToast', { amount: money2(amount) }))
      setModal(null)
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('panels.common.error'), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4 p-6" aria-busy="true">
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  return (
    <div className="pb-8">
      <div className="bg-gradient-to-br from-primary-active via-primary to-[#1F8C84] px-4 pb-5 pt-5 text-on-primary md:px-6 md:pb-6 md:pt-8">
        <p className="text-body-strong">{workspace.name}</p>
        <p className="mt-1 font-display text-display tabular">
          {euros}
          <span className="text-title-2">.{cents}</span>
        </p>
        <p className="text-body">
          {t('panels.wallet.availableToTransfer', { amount: money(wallet.available) })}{' '}
          <button type="button" className="underline underline-offset-2" onClick={() => setModal('info')}>
            {t('panels.wallet.info')}
          </button>
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {wallet.payoutsEnabled ? (
            <button type="button" disabled={wallet.available <= 0.5} onClick={() => setModal('payout')} className="inline-flex h-10 items-center rounded-full border border-white/70 px-4 text-body-strong hover:bg-white/10 disabled:opacity-50">
              {t('panels.wallet.payOutNow')}
            </button>
          ) : (
            <button type="button" onClick={() => navigate('/payments/payment-processing')} className="inline-flex h-10 items-center rounded-full border border-white/70 px-4 text-body-strong hover:bg-white/10">
              {t('panels.wallet.setUpNow')}
            </button>
          )}
          <Menu
            align="left"
            trigger={({ open, toggle }) => (
              <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={toggle} className="inline-flex h-10 items-center gap-2 rounded-full border border-white/70 px-4 text-body-strong hover:bg-white/10">
                {t('panels.wallet.actions')}
                <span aria-hidden className="text-[10px]">
                  ▼
                </span>
              </button>
            )}
            groups={[
              {
                items: [
                  { label: t('panels.wallet.accountSummary'), icon: <Receipt size={16} />, onSelect: () => setModal('summary') },
                  { label: t('panels.wallet.settings'), icon: <Landmark size={16} />, onSelect: () => navigate('/setup/billing/bank-accounts') },
                ],
              },
            ]}
          />
        </div>
      </div>

      <div className="flex flex-col gap-6 px-4 pt-5 md:px-6 md:pt-6">
        {!paymentsActive && (
          <div className="flex items-center gap-4 rounded-lg bg-sunken p-5">
            <div className="min-w-0 flex-1">
              <p className="text-body-strong text-ink">{t('panels.wallet.promo')}</p>
              <Button variant="link" className="mt-2" iconRight={<ArrowRight size={16} />} onClick={() => navigate('/payments/payment-processing')}>
                {t('common.learnMore')}
              </Button>
            </div>
            <Wallet size={40} className="text-primary" aria-hidden />
          </div>
        )}

        <section>
          <div className="flex items-center justify-between">
            <h3 className="font-display text-title-3 text-ink">{t('panels.wallet.payouts')}</h3>
            {payouts.length > 4 && (
              <Button variant="link" onClick={() => setShowAllPayouts((s) => !s)}>
                {showAllPayouts ? t('panels.wallet.showLess') : t('panels.wallet.viewAll')}
              </Button>
            )}
          </div>
          {payouts.length === 0 ? (
            <p className="mt-2 rounded-md bg-sunken p-4 text-body text-muted">{t('panels.wallet.noPayouts')}</p>
          ) : (
            <ul className="card mt-3 divide-y divide-line">
              {(showAllPayouts ? payouts : payouts.slice(0, 4)).map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sunken text-muted" aria-hidden>
                    <Landmark size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-body-strong text-ink">{t('panels.wallet.payoutTo', { last4: p.bankLast4 })}</span>
                    <span className="block text-small text-muted">{fmtDate(p.at)}</span>
                    {/* Phones: the status sits under the text so the description keeps its width. */}
                    <span className={clsx('chip mt-1 md:hidden', p.status === 'paid' ? 'bg-success-subtle text-success' : 'bg-info-subtle text-info')}>{t(`panels.wallet.payoutStatus.${p.status}`)}</span>
                  </span>
                  <span className={clsx('chip hidden md:inline-flex', p.status === 'paid' ? 'bg-success-subtle text-success' : 'bg-info-subtle text-info')}>{t(`panels.wallet.payoutStatus.${p.status}`)}</span>
                  <span className="text-right text-body-strong text-ink tabular md:w-20">{money2(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-title-3 text-ink">{t('panels.wallet.activity')}</h3>
              <p className="text-small text-muted">{workspace.name}</p>
            </div>
            <Menu
              width={260}
              trigger={({ open, toggle }) => (
                <MenuButton open={open} toggle={toggle}>
                  <SlidersHorizontal size={16} aria-hidden />
                  {t('panels.wallet.filters')}
                </MenuButton>
              )}
              groups={[
                { heading: t('panels.wallet.filterType'), items: (['all', 'payment', 'payout', 'fee', 'refund', 'deposit'] as const).map((x) => ({ label: t(`panels.wallet.txTypes.${x}`), checked: txFilter === x, onSelect: () => setTxFilter(x) })) },
                { heading: t('panels.wallet.filterPeriod'), items: (['7', '30', 'all'] as const).map((x) => ({ label: t(`panels.wallet.ranges.${x}`), checked: range === x, onSelect: () => setRange(x) })) },
              ]}
            />
          </div>
          {transactions.length === 0 ? (
            <div className="card mt-3">
              <EmptyState icon={<Coins size={24} />} title={t('panels.wallet.noActivity')} body={t('panels.wallet.noActivityBody')} action={(txFilter !== 'all' || range !== 'all') && <Button size="sm" onClick={() => { setTxFilter('all'); setRange('all') }}>{t('panels.wallet.clearFilters')}</Button>} />
            </div>
          ) : (
            <ul className="card mt-3 divide-y divide-line">
              {transactions.map((x) => (
                <li key={x.id} className="flex items-center gap-3 px-4 py-3">
                  <span className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', x.amount >= 0 ? 'bg-success-subtle text-success' : 'bg-sunken text-muted')} aria-hidden>
                    {x.amount >= 0 ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body text-ink">{x.description}</span>
                    <span className="block text-small text-muted">
                      {t(`panels.wallet.txTypes.${x.type}`)} · {fmtDateTimeUS(x.at)}
                    </span>
                  </span>
                  <span className={clsx('shrink-0 text-body-strong tabular', x.amount >= 0 ? 'text-success' : 'text-ink')}>
                    {x.amount >= 0 ? '+' : ''}
                    {money2(x.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Modal
        open={modal === 'payout'}
        onClose={() => setModal(null)}
        title={t('panels.wallet.payoutTitle')}
        subtitle={t('panels.wallet.payoutSubtitle', { last4: bankLast4 })}
        size="sm"
        footer={
          <>
            <Button onClick={() => setModal(null)}>{t('common.cancel')}</Button>
            <Button variant="primary" loading={busy} onClick={payOut}>
              {t('panels.wallet.payOut', { amount: money2(round2(wallet.available - fee)) })}
            </Button>
          </>
        }
      >
        <DetailList
          rows={[
            { label: t('panels.wallet.available'), value: money2(wallet.available) },
            { label: t('panels.wallet.instantFee'), value: `-${money2(fee)}` },
            { label: t('panels.wallet.youReceive'), value: <strong>{money2(round2(wallet.available - fee))}</strong> },
            { label: t('panels.wallet.arrives'), value: t('panels.wallet.arrivesValue') },
          ]}
        />
      </Modal>

      <Modal open={modal === 'summary'} onClose={() => setModal(null)} title={t('panels.wallet.accountSummary')} subtitle={workspace.name} footer={<Button onClick={() => setModal(null)}>{t('common.close')}</Button>}>
        <DetailList
          rows={[
            { label: t('panels.wallet.balance'), value: money2(wallet.balance) },
            { label: t('panels.wallet.available'), value: money2(wallet.available) },
            { label: t('panels.wallet.pending'), value: money2(Math.max(0, round2(wallet.balance - wallet.available))) },
            { label: t('panels.wallet.payments30'), value: money2(last30.payments) },
            { label: t('panels.wallet.paidOut30'), value: money2(last30.paidOut) },
            { label: t('panels.wallet.fees30'), value: money2(last30.fees) },
            { label: t('panels.wallet.bankAccount'), value: t('panels.wallet.endingIn', { last4: bankLast4 }) },
            { label: t('panels.wallet.schedule'), value: t('panels.wallet.scheduleValue') },
          ]}
        />
      </Modal>

      <Modal open={modal === 'info'} onClose={() => setModal(null)} title={t('panels.wallet.infoTitle')} size="sm" footer={<Button onClick={() => setModal(null)}>{t('common.close')}</Button>}>
        <p className="text-body text-muted">{t('panels.wallet.infoBody')}</p>
      </Modal>
    </div>
  )
}

function Credits() {
  const { t } = useTranslation()
  const drawer = useDrawer()
  const credits = useDb((s) => s.wallet.credits)
  const referrals = usePanels((s) => s.referrals)
  const [tab, setTab] = useState<'earned' | 'pending'>('earned')

  return (
    <div className="flex flex-col gap-5 px-4 pb-8 pt-5 md:px-6 md:pt-8">
      <h2 className="font-display text-title-2 text-ink md:text-title-1">{t('panels.wallet.creditsTitle')}</h2>
      <div className="card flex items-center gap-4 p-4 md:p-5">
        <div className="flex-1">
          <p className="font-display text-title-1 text-ink">{money(credits)}</p>
          <p className="text-body text-muted">{t('panels.wallet.availableCredits')}</p>
        </div>
        <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary-subtle text-primary" aria-hidden>
          <Coins size={28} />
        </span>
      </div>
      <div className="flex items-start gap-3 rounded-lg bg-primary-subtle/60 p-4 text-body text-ink">
        <Lightbulb size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
        <p>
          {credits > 0 ? t('panels.wallet.creditsUsed') : t('panels.wallet.noCredits')} <LearnMore topic={t('panels.topics.walletCredits')} />
        </p>
      </div>
      <PillTabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'earned', label: t('panels.wallet.earned') },
          { value: 'pending', label: t('panels.wallet.pendingTab'), count: referrals.length || undefined },
        ]}
      />
      {tab === 'earned' || referrals.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Gift size={24} />}
            title={tab === 'earned' ? t('panels.wallet.noEarned') : t('panels.wallet.noPending')}
            body={tab === 'earned' ? t('panels.wallet.noEarnedBody') : t('panels.wallet.noPendingBody')}
            action={
              <Button size="sm" onClick={() => drawer.open('referral')}>
                {t('panels.wallet.referBusiness')}
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="card divide-y divide-line">
          {referrals.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body-strong text-ink">{r.email}</span>
                <span className="block text-small text-muted">{t('panels.wallet.invitedOn', { date: fmtDate(r.at) })}</span>
              </span>
              <span className="chip bg-warning-subtle text-warning">{t('panels.wallet.pendingChip')}</span>
              <span className="w-16 text-right text-body-strong text-ink">{money(130)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

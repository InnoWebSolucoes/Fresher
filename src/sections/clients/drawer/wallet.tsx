import clsx from 'clsx'
import { parseISO } from 'date-fns'
import { format } from '@/lib/dates'
import { CalendarCheck, Coins, CreditCard, Gem, Percent, ShoppingBag, Star } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { ClientReward } from '@/types'
import { useDb } from '@/store/db'
import { money } from '@/lib/format'
import { Button, confirm, LearnMore, Menu, MenuButton, Modal, toast } from '@/components/ui'
import { removeReward } from '@/api/clients'
import { useClientDrawer } from './context'
import { PanelEmpty, SectionTitle, TabHeader } from './tabs'
import { Stars } from '../components/common'
import { fmtLongDate } from '../lib/helpers'

const REWARD_ICON = { amount: Coins, percent: Percent, free_service: CalendarCheck, free_product: ShoppingBag } as const

export function WalletTab() {
  const { t } = useTranslation()
  const { client, act } = useClientDrawer()
  const payments = useDb((s) => s.payments)
  const cards = useMemo(() => {
    const own = payments.filter((p) => p.clientId === client.id && (p.method === 'online_card' || p.method === 'manual_card') && p.status === 'succeeded')
    return own.length ? [{ brand: 'Visa', last4: '4242', lastUsed: own.map((p) => p.at).sort().pop()! }] : []
  }, [payments, client.id])
  const active = client.rewards.filter((r) => !r.redeemedAt)
  const remove = async (r: ClientReward) => {
    const ok = await confirm({ title: t('clients.reward.removeTitle'), body: t('clients.reward.removeBody', { name: r.name }), confirmLabel: t('clients.reward.remove'), tone: 'danger' })
    if (!ok) return
    await removeReward(client.id, r.id)
    toast(t('clients.reward.removed'))
  }
  return (
    <>
      <TabHeader
        title={t('clients.drawer.tabs.wallet')}
        action={
          <Menu
            width={200}
            trigger={({ open, toggle }) => (
              <MenuButton open={open} toggle={toggle}>
                {t('clients.drawer.actionsMenu')}
              </MenuButton>
            )}
            groups={[{ items: [{ label: t('clients.drawer.actions.addReward'), onSelect: () => act({ kind: 'reward' }) }] }]}
          />
        }
      />
      <p className="font-display text-title-1 text-ink tabular md:text-display">{money(client.walletBalance)}</p>
      <p className="text-body text-muted">
        {t('clients.wallet.available')} <LearnMore topic={t('clients.wallet.topic')}>{t('clients.common.learnMore')}</LearnMore>
      </p>
      <SectionTitle title={t('clients.wallet.paymentMethods')} />
      {cards.length === 0 ? (
        <PanelEmpty icon={<CreditCard size={24} aria-hidden />} title={t('clients.wallet.noMethods')} body={t('clients.wallet.noMethodsBody')} />
      ) : (
        cards.map((c) => (
          <div key={c.last4} className="flex items-center gap-4 rounded-lg border border-line bg-surface p-4">
            <span className="flex h-10 w-14 items-center justify-center rounded-md bg-ink text-small font-bold text-canvas">{c.brand}</span>
            <div>
              <p className="text-body-lg font-semibold text-ink">{t('clients.wallet.cardEnding', { last4: c.last4 })}</p>
              <p className="text-small text-muted">{t('clients.wallet.lastUsed', { date: format(parseISO(c.lastUsed), 'MMM d, yyyy') })}</p>
            </div>
          </div>
        ))
      )}
      <SectionTitle
        title={t('clients.wallet.rewards')}
        action={
          <button type="button" className="text-body-strong text-primary hover:underline" onClick={() => act({ kind: 'rewardActivity' })}>
            {t('clients.wallet.viewActivity')}
          </button>
        }
      />
      {active.length === 0 ? (
        <PanelEmpty
          icon={<Gem size={24} aria-hidden />}
          title={t('clients.wallet.noRewards')}
          body={t('clients.wallet.noRewardsBody')}
          action={
            <Button variant="primary" onClick={() => act({ kind: 'reward' })}>
              {t('clients.drawer.actions.addReward')}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {active.map((r) => {
            const Icon = REWARD_ICON[r.type]
            return (
              <div key={r.id} className="flex items-center gap-4 rounded-lg border border-line bg-surface p-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-sunken text-ink">
                  <Icon size={20} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-body-lg font-semibold text-ink">{r.name}</p>
                  <p className="text-body text-muted">
                    {t('clients.wallet.manualReward')}
                    {r.expiresAt ? ` · ${t('clients.wallet.expires', { date: format(parseISO(r.expiresAt), 'MMM d, yyyy') })}` : ` · ${t('clients.wallet.noExpiry')}`}
                    {r.inStoreOnly ? ` · ${t('clients.wallet.inStore')}` : ''}
                  </p>
                </div>
                <Menu width={170} groups={[{ items: [{ label: t('clients.reward.remove'), danger: true, onSelect: () => void remove(r) }] }]} />
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

/** "View activity" for rewards. */
export function RewardActivityModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const { client } = useClientDrawer()
  const list = [...client.rewards].sort((a, b) => String((b as { createdAt?: string }).createdAt ?? '').localeCompare(String((a as { createdAt?: string }).createdAt ?? '')))
  return (
    <Modal open onClose={onClose} title={t('clients.wallet.activityTitle')} footer={<Button onClick={onClose}>{t('clients.common.close')}</Button>}>
      {list.length === 0 ? (
        <p className="py-6 text-center text-body text-muted">{t('clients.wallet.noActivity')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {list.map((r) => {
            const meta = r as ClientReward & { createdAt?: string; by?: string }
            return (
              <li key={r.id} className="py-3">
                <p className="text-body-strong text-ink">{r.name}</p>
                <p className="text-small text-muted">
                  {r.redeemedAt ? t('clients.wallet.redeemedOn', { date: format(parseISO(r.redeemedAt), 'MMM d, yyyy') }) : meta.createdAt ? t('clients.wallet.addedBy', { date: format(parseISO(meta.createdAt), 'MMM d, yyyy'), name: meta.by ?? '' }) : t('clients.wallet.manualReward')}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}

export function LoyaltyTab() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { close } = useClientDrawer()
  const addOn = useDb((s) => s.addOns.find((a) => a.slug === 'loyalty'))
  const active = addOn?.status === 'active' || addOn?.status === 'trial'
  return (
    <>
      <TabHeader title={t('clients.drawer.tabs.loyalty')} />
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <div className="flex h-36 items-center justify-center bg-gradient-to-br from-accent-subtle via-primary-subtle to-surface">
          <span className="flex h-20 w-20 rotate-12 items-center justify-center rounded-xl bg-accent text-on-accent shadow-md">
            <Gem size={36} aria-hidden />
          </span>
        </div>
        <div className="p-4 md:p-6">
          <p className="text-small font-semibold text-primary">{t('clients.loyalty.badge')}</p>
          <h3 className="mt-1 font-display text-title-2 text-ink">{active ? t('clients.loyalty.activeTitle') : t('clients.loyalty.title')}</h3>
          <p className="mt-2 text-body text-muted">{active ? t('clients.loyalty.activeBody') : t('clients.loyalty.body')}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => {
                close()
                navigate(active ? '/add-ons/manage/loyalty' : '/clients/loyalty')
              }}
            >
              {active ? t('clients.loyalty.manage') : t('clients.common.learnMore')}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

export function ReviewsTab() {
  const { t } = useTranslation()
  const { client } = useClientDrawer()
  const reviews = useDb((s) => s.reviews)
  const members = useDb((s) => s.teamMembers)
  const mine = reviews.filter((r) => r.clientId === client.id).sort((a, b) => b.at.localeCompare(a.at))
  return (
    <>
      <TabHeader title={t('clients.drawer.tabs.reviews')} />
      {mine.length === 0 ? (
        <PanelEmpty icon={<Star size={24} aria-hidden />} title={t('clients.reviews.emptyTitle')} body={t('clients.reviews.emptyBody')} />
      ) : (
        <div className="flex flex-col gap-3">
          {mine.map((r) => {
            const m = members.find((x) => x.id === r.teamMemberId)
            return (
              <article key={r.id} className="rounded-lg border border-line bg-surface p-4">
                <div className="flex items-center justify-between gap-3">
                  <Stars value={r.rating} />
                  <span className={clsx('chip h-5 px-2 text-caption', r.platform === 'google' ? 'bg-info-subtle text-info' : 'bg-primary-subtle text-primary')}>{t(`clients.reputation.platforms.${r.platform}`)}</span>
                </div>
                <p className="mt-2 text-body text-ink">{r.text || t('clients.reputation.noText')}</p>
                <p className="mt-2 text-small text-muted">
                  {fmtLongDate(r.at.slice(0, 10))}
                  {r.serviceName ? ` · ${r.serviceName}` : ''}
                  {m ? ` · ${m.firstName} ${m.lastName}` : ''}
                </p>
                {r.reply && (
                  <div className="mt-3 rounded-md bg-sunken p-3 text-body text-ink">
                    <p className="text-small font-semibold text-muted">{t('clients.reputation.yourReply')}</p>
                    {r.reply.text}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </>
  )
}

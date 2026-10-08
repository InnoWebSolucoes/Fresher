import { Award, Gift, Repeat, Star } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useDb } from '@/store/db'
import { fmtDate } from '@/lib/format'
import { useDrawer } from '@/lib/drawer'
import { Button, Card, Chip, IntroPage, Page, PageHeader, PageSkeleton, usePageLoading } from '@/components/ui'

const SLUG = 'loyalty'

export function ClientLoyaltyPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const drawer = useDrawer()
  const loading = usePageLoading()
  const addOns = useDb((s) => s.addOns)
  const state = addOns.find((a) => a.slug === SLUG)
  const on = state?.status === 'active' || state?.status === 'trial'

  if (loading) {
    return (
      <Page>
        <PageSkeleton rows={5} />
      </Page>
    )
  }
  if (on && state) return <LoyaltyActive status={state.status === 'trial' ? 'trial' : 'active'} enabledAt={state.enabledAt} trialEndsAt={state.trialEndsAt} />

  return (
    <Page>
      <IntroPage
        badge={t('clients.more.loyalty.badge')}
        title={t('clients.more.loyalty.title')}
        body={t('clients.more.loyalty.body')}
        bullets={[t('clients.more.loyalty.bullet1'), t('clients.more.loyalty.bullet2'), t('clients.more.loyalty.bullet3')]}
        price={
          <span className="flex flex-col gap-1">
            <span>
              <span className="chip mr-2 bg-success-subtle font-semibold text-success">{t('clients.more.loyalty.save')}</span>
              <s className="text-muted">{t('clients.more.loyalty.oldPrice')}</s> <strong className="font-display text-title-3">{t('clients.more.loyalty.price')}</strong> {t('clients.more.loyalty.per')}
            </span>
            <span className="text-body-strong text-primary">{t('clients.more.loyalty.trial')}</span>
          </span>
        }
        primary={{ label: t('clients.more.loyalty.startNow'), onClick: () => navigate('/add-ons/add-on/loyalty/setup') }}
        secondary={
          <Button size="lg" onClick={() => drawer.open('resources', { tab: 'help', view: 'help-center', d_q: 'Client Loyalty' })}>
            {t('clients.more.common.learnMore')}
          </Button>
        }
        art={<LoyaltyArt />}
      />
    </Page>
  )
}

/** Original loyalty-card artwork (no third-party imagery). */
function LoyaltyArt() {
  const { t } = useTranslation()
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-primary-subtle" aria-hidden>
      <div className="absolute -right-12 -top-12 h-52 w-52 rounded-full bg-accent/40" />
      <div className="absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-primary/15" />
      <div className="absolute left-8 right-14 top-10 rounded-xl bg-primary p-5 text-on-primary shadow-lg">
        <div className="flex items-center justify-between">
          <span className="text-small font-semibold opacity-80">{t('clients.more.loyalty.artTier')}</span>
          <Award size={22} />
        </div>
        <p className="mt-4 font-display text-[34px] font-bold leading-none">{t('clients.more.loyalty.artPoints', { count: 1240 })}</p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/20">
          <div className="h-full w-3/4 rounded-full bg-accent" />
        </div>
      </div>
      <div className="absolute bottom-8 right-8 flex items-center gap-3 rounded-lg bg-surface px-4 py-3 shadow-md">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-subtle text-warning">
          <Gift size={20} />
        </span>
        <span>
          <span className="block text-caption text-muted">{t('clients.more.loyalty.artNext')}</span>
          <span className="block text-body-strong text-ink">{t('clients.more.loyalty.artReward')}</span>
        </span>
      </div>
      <div className="absolute bottom-10 left-8 flex gap-1 rounded-full bg-surface px-3 py-2 shadow-sm">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} size={16} className="fill-accent text-accent" />
        ))}
      </div>
    </div>
  )
}

function LoyaltyActive({ status, enabledAt, trialEndsAt }: { status: 'active' | 'trial'; enabledAt?: string; trialEndsAt?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const clients = useDb((s) => s.clients)
  const appointments = useDb((s) => s.appointments)
  const stats = useMemo(() => {
    const live = clients.filter((c) => !c.deletedAt)
    const withRewards = live.filter((c) => c.rewards.length > 0).length
    const rewards = live.reduce((n, c) => n + c.rewards.length, 0)
    const visits = new Map<string, number>()
    for (const a of appointments) if (a.clientId && a.status === 'completed') visits.set(a.clientId, (visits.get(a.clientId) ?? 0) + 1)
    const repeat = [...visits.values()].filter((n) => n > 1).length
    return { withRewards, rewards, repeat }
  }, [appointments, clients])

  return (
    <Page>
      <PageHeader
        title={t('clients.more.loyalty.badge')}
        subtitle={t('clients.more.loyalty.activeBody')}
        actions={
          <Button variant="primary" onClick={() => navigate(`/add-ons/manage/${SLUG}`)}>
            {t('clients.more.loyalty.manage')}
          </Button>
        }
      />
      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <Chip tone="success">{status === 'trial' ? t('clients.more.loyalty.trialBadge') : t('clients.more.loyalty.activeBadge')}</Chip>
          <h2 className="font-display text-title-2 text-ink">{t('clients.more.loyalty.activeTitle')}</h2>
        </div>
        <p className="mt-2 text-body text-muted">
          {status === 'trial' && trialEndsAt ? t('clients.more.loyalty.trialEnds', { date: fmtDate(trialEndsAt) }) : enabledAt ? t('clients.more.loyalty.since', { date: fmtDate(enabledAt) }) : null}
        </p>
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { icon: <Award size={20} />, label: t('clients.more.loyalty.statMembers'), value: stats.withRewards },
          { icon: <Gift size={20} />, label: t('clients.more.loyalty.statRewards'), value: stats.rewards },
          { icon: <Repeat size={20} />, label: t('clients.more.loyalty.statRepeat'), value: stats.repeat },
        ].map((s) => (
          <Card key={s.label}>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-subtle text-primary">{s.icon}</span>
            <p className="mt-4 text-body-strong text-ink">{s.label}</p>
            <p className="mt-1 font-display text-title-1 text-ink tabular">{s.value}</p>
          </Card>
        ))}
      </div>
    </Page>
  )
}

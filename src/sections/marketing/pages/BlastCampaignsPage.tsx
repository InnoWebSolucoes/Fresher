import { CalendarClock, Megaphone, Plus, Send } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useDb } from '@/store/db'
import type { Campaign } from '@/types'
import { Button, DataTable, EmptyState, IntroPage, LearnMore, Menu, Page, PageHeader, PageSkeleton, PillTabs, SearchInput, Select, Toolbar, confirm, toast, usePageLoading, type Column } from '@/components/ui'
import { addOnActive, cancelSchedule, deleteCampaign, duplicateCampaign, processDueCampaigns, sendScheduledNow } from '@/api/marketing'
import { fmtDateTimeUS, money } from '@/lib/format'
import { StatCard } from '../components/kit'
import { CampaignStatusChip, ChannelLabel, pct } from '../helpers'

type Tab = 'all' | Campaign['status']

export function BlastCampaignsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loading = usePageLoading()
  const [params] = useSearchParams()
  const campaigns = useDb((s) => s.campaigns)
  const segments = useDb((s) => s.segments)
  const addOns = useDb((s) => s.addOns)
  const [tab, setTab] = useState<Tab>('all')
  const [q, setQ] = useState('')
  const [channel, setChannel] = useState<'all' | Campaign['channel']>('all')

  const segment = params.get('segment')
  const deal = params.get('deal')
  useEffect(() => {
    if (segment || deal) navigate(`/marketing/blast-campaigns/new?${segment ? `segment=${segment}` : `deal=${deal}`}`, { replace: true })
  }, [segment, deal, navigate])

  useEffect(() => {
    void processDueCampaigns().then((n) => {
      if (n) toast(t('marketing.campaigns.toast.dueSent', { count: n }))
    })
  }, [t])

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: campaigns.length, draft: 0, pending: 0, scheduled: 0, sent: 0 }
    campaigns.forEach((x) => c[x.status]++)
    return c
  }, [campaigns])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return campaigns.filter((c) => (tab === 'all' || c.status === tab) && (channel === 'all' || c.channel === channel) && (!needle || c.name.toLowerCase().includes(needle) || c.subject.toLowerCase().includes(needle)))
  }, [campaigns, tab, channel, q])

  const summary = useMemo(() => {
    const sent = campaigns.filter((c) => c.status === 'sent')
    const total = (k: keyof Campaign['stats']) => sent.reduce((s, c) => s + c.stats[k], 0)
    return { campaigns: sent.length, messages: total('sent'), openRate: pct(total('opened'), total('delivered')), bookings: total('bookings'), revenue: total('revenue') }
  }, [campaigns])

  const audienceLabel = (c: Campaign) => {
    if (c.audience.type === 'all') return t('marketing.campaigns.audience.all')
    if (c.audience.type === 'clients') return t('marketing.campaigns.audience.clientsCount', { count: c.audience.clientIds.length })
    return c.audience.segmentIds.map((id) => segments.find((s) => s.id === id)?.name ?? id).join(', ')
  }

  const startNew = () => navigate(addOnActive(addOns, 'blast-marketing') || campaigns.length ? '/marketing/blast-campaigns/new' : '/legal-wizard/blast-marketing/fees-overview')

  const remove = async (c: Campaign) => {
    if (!(await confirm({ title: t('marketing.campaigns.delete.title'), body: t('marketing.campaigns.delete.body', { name: c.name }), confirmLabel: t('marketing.campaigns.delete.confirm'), tone: 'danger' }))) return
    await deleteCampaign(c.id)
    toast(t('marketing.campaigns.toast.deleted'))
  }

  const columns: Column<Campaign>[] = [
    {
      key: 'name',
      header: t('marketing.campaigns.col.campaign'),
      sortValue: (c) => c.name.toLowerCase(),
      cell: (c) => (
        <div className="min-w-[150px] max-w-[210px]">
          <p className="truncate text-body-strong text-ink">{c.name}</p>
          <p className="truncate text-small text-muted">{c.channel === 'email' ? c.subject || c.heading : c.body}</p>
        </div>
      ),
    },
    { key: 'status', header: t('marketing.campaigns.col.status'), sortValue: (c) => c.status, cell: (c) => <CampaignStatusChip status={c.status} /> },
    { key: 'channel', header: t('marketing.campaigns.col.channel'), cell: (c) => <ChannelLabel channel={c.channel} /> },
    { key: 'audience', header: t('marketing.campaigns.col.audience'), cell: (c) => <span className="block max-w-[120px] truncate text-body text-ink" title={audienceLabel(c)}>{audienceLabel(c)}</span> },
    { key: 'recipients', header: t('marketing.campaigns.col.recipients'), align: 'right', sortValue: (c) => c.recipients, cell: (c) => (c.status === 'draft' && !c.recipients ? '-' : c.recipients) },
    {
      key: 'date',
      header: t('marketing.campaigns.col.date'),
      sortValue: (c) => c.sentAt ?? c.scheduledAt ?? c.createdAt,
      cell: (c) => (
        <div className="whitespace-nowrap text-body">
          <p className="text-ink">{fmtDateTimeUS(c.sentAt ?? c.scheduledAt ?? c.createdAt)}</p>
          <p className="text-small text-muted">{t(`marketing.campaigns.dateKind.${c.sentAt ? 'sent' : c.scheduledAt ? 'scheduled' : 'created'}`)}</p>
        </div>
      ),
    },
    {
      key: 'performance',
      header: t('marketing.campaigns.col.performance'),
      cell: (c) =>
        c.status === 'sent' ? (
          <div className="whitespace-nowrap text-body">
            <p className="text-ink">{t('marketing.campaigns.openedRate', { value: pct(c.stats.opened, c.stats.delivered) })}</p>
            <p className="text-small text-muted">{t('marketing.campaigns.bookingsValue', { count: c.stats.bookings, value: money(c.stats.revenue) })}</p>
          </div>
        ) : (
          <span className="text-muted">-</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (c) => (
        <Menu
          groups={[
            {
              items: [
                { label: t('marketing.campaigns.actions.view'), onSelect: () => navigate(`/marketing/blast-campaigns/${c.id}`) },
                ...(c.status === 'draft' ? [{ label: t('marketing.campaigns.actions.edit'), onSelect: () => navigate(`/marketing/blast-campaigns/${c.id}/edit`) }] : []),
                ...(c.status === 'scheduled'
                  ? [
                      {
                        label: t('marketing.campaigns.actions.sendNow'),
                        onSelect: async () => {
                          await sendScheduledNow(c.id)
                          toast(t('marketing.campaigns.toast.sent'))
                        },
                      },
                      {
                        label: t('marketing.campaigns.actions.cancelSchedule'),
                        onSelect: async () => {
                          await cancelSchedule(c.id)
                          toast(t('marketing.campaigns.toast.unscheduled'))
                        },
                      },
                    ]
                  : []),
                {
                  label: t('marketing.campaigns.actions.duplicate'),
                  onSelect: async () => {
                    const copy = await duplicateCampaign(c.id)
                    toast(t('marketing.campaigns.toast.duplicated'))
                    navigate(`/marketing/blast-campaigns/${copy.id}/edit`)
                  },
                },
              ],
            },
            { items: [{ label: t('marketing.campaigns.actions.delete'), danger: true, onSelect: () => void remove(c) }] },
          ]}
        />
      ),
    },
  ]

  if (loading) {
    return (
      <Page wide>
        <PageSkeleton />
      </Page>
    )
  }

  if (!campaigns.length) {
    return (
      <Page wide>
        <IntroPage
          badge={t('marketing.campaigns.intro.badge')}
          title={t('marketing.campaigns.intro.title')}
          body={t('marketing.campaigns.intro.body')}
          bullets={[t('marketing.campaigns.intro.b1'), t('marketing.campaigns.intro.b2'), t('marketing.campaigns.intro.b3')]}
          primary={{ label: t('marketing.campaigns.intro.start'), onClick: startNew }}
        />
      </Page>
    )
  }

  return (
    <Page wide>
      <PageHeader
        title={t('marketing.campaigns.title')}
        subtitle={
          <>
            {t('marketing.campaigns.subtitle')} <LearnMore topic="blast campaigns">{t('marketing.common.learnMore')}</LearnMore>
          </>
        }
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={startNew}>
            {t('marketing.campaigns.create')}
          </Button>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Send size={16} />} label={t('marketing.campaigns.summary.sent')} value={summary.campaigns} hint={t('marketing.campaigns.summary.messages', { count: summary.messages })} />
        <StatCard icon={<Megaphone size={16} />} label={t('marketing.campaigns.summary.openRate')} value={`${summary.openRate}%`} hint={t('marketing.campaigns.summary.openRateHint')} />
        <StatCard icon={<CalendarClock size={16} />} label={t('marketing.campaigns.summary.bookings')} value={summary.bookings} hint={t('marketing.campaigns.summary.bookingsHint')} />
        <StatCard label={t('marketing.campaigns.summary.revenue')} value={money(summary.revenue)} hint={t('marketing.campaigns.summary.revenueHint')} />
      </div>
      <PillTabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        items={(['all', 'draft', 'pending', 'scheduled', 'sent'] as Tab[]).map((value) => ({ value, label: t(`marketing.campaigns.tabs.${value}`), count: counts[value] }))}
      />
      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder={t('marketing.campaigns.search')} className="max-w-sm" />
        <Select
          aria-label={t('marketing.campaigns.col.channel')}
          className="h-10 w-48 rounded-full"
          value={channel}
          onChange={(e) => setChannel(e.target.value as typeof channel)}
          options={[
            { value: 'all', label: t('marketing.campaigns.allChannels') },
            { value: 'email', label: t('marketing.campaigns.channel.email') },
            { value: 'sms', label: t('marketing.campaigns.channel.sms') },
          ]}
        />
      </Toolbar>
      {tab === 'pending' && counts.pending > 0 && <p className="mb-4 rounded-lg bg-warning-subtle px-4 py-3 text-body text-warning">{t('marketing.campaigns.pendingNote')}</p>}
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(c) => c.id}
        onRowClick={(c) => navigate(`/marketing/blast-campaigns/${c.id}`)}
        initialSort={{ key: 'date', dir: 'desc' }}
        empty={
          <EmptyState
            icon={<Megaphone size={24} />}
            title={t(`marketing.campaigns.empty.${tab}`)}
            body={t('marketing.campaigns.empty.body')}
            action={
              <Button variant="primary" onClick={startNew}>
                {t('marketing.campaigns.create')}
              </Button>
            }
          />
        }
      />
    </Page>
  )
}

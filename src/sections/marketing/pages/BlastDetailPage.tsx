import { CalendarClock, Clock, Pencil, Send, Tag } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { Button, Card, DataTable, DetailList, EmptyState, Menu, MenuButton, Page, PageSkeleton, confirm, toast, usePageLoading, type Column } from '@/components/ui'
import { cancelSchedule, deleteCampaign, duplicateCampaign, processDueCampaigns, sendScheduledNow, useMarketingSettings } from '@/api/marketing'
import { fmtDateTimeUS, money, money2, num } from '@/lib/format'
import type { MessageLog } from '@/types'
import { BackCrumbs, EmailMock, MessageBubblePreview, StatCard } from '../components/kit'
import { CampaignStatusChip, ChannelLabel, PhoneList, discountLabel, pct } from '../helpers'

const FUNNEL_COLORS = ['#0E6E6A', '#2E8B86', '#4FA7A2', '#F4B23E', '#E19D24']

export function BlastDetailPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const drawer = useDrawer()
  const { id } = useParams()
  const loading = usePageLoading()
  const campaigns = useDb((s) => s.campaigns)
  const segments = useDb((s) => s.segments)
  const deals = useDb((s) => s.deals)
  const messages = useDb((s) => s.messages)
  const workspace = useDb((s) => s.workspace)
  const locations = useDb((s) => s.locations)
  const settings = useMarketingSettings()
  const campaign = campaigns.find((c) => c.id === id)
  const sample = useMemo(() => messages.filter((m) => m.campaignId === id), [messages, id])

  useEffect(() => {
    void processDueCampaigns()
  }, [])

  if (loading) {
    return (
      <Page>
        <PageSkeleton />
      </Page>
    )
  }
  if (!campaign) {
    return (
      <Page>
        <EmptyState title={t('marketing.detail.notFound')} action={<Button onClick={() => navigate('/marketing/blast-campaigns/home')}>{t('marketing.builder.backToCampaigns')}</Button>} />
      </Page>
    )
  }

  const deal = deals.find((d) => d.id === campaign.dealId)
  const audience =
    campaign.audience.type === 'all'
      ? t('marketing.campaigns.audience.all')
      : campaign.audience.type === 'clients'
        ? t('marketing.campaigns.audience.clientsCount', { count: campaign.audience.clientIds.length })
        : campaign.audience.segmentIds.map((sid) => segments.find((s) => s.id === sid)?.name ?? sid).join(', ')
  const s = campaign.stats
  const funnel = [
    { name: t('marketing.detail.funnel.sent'), value: s.sent },
    { name: t('marketing.detail.funnel.delivered'), value: s.delivered },
    { name: t('marketing.detail.funnel.opened'), value: s.opened },
    { name: t('marketing.detail.funnel.clicked'), value: s.clicked },
    { name: t('marketing.detail.funnel.booked'), value: s.bookings },
  ]

  const remove = async () => {
    if (!(await confirm({ title: t('marketing.campaigns.delete.title'), body: t('marketing.campaigns.delete.body', { name: campaign.name }), confirmLabel: t('marketing.campaigns.delete.confirm'), tone: 'danger' }))) return
    await deleteCampaign(campaign.id)
    toast(t('marketing.campaigns.toast.deleted'))
    navigate('/marketing/blast-campaigns/home')
  }

  const banner = {
    draft: { icon: <Pencil size={18} />, cls: 'bg-sunken text-ink', text: t('marketing.detail.banner.draft') },
    pending: { icon: <Clock size={18} />, cls: 'bg-warning-subtle text-warning', text: t('marketing.detail.banner.pending') },
    scheduled: { icon: <CalendarClock size={18} />, cls: 'bg-info-subtle text-info', text: t('marketing.detail.banner.scheduled', { date: campaign.scheduledAt ? fmtDateTimeUS(campaign.scheduledAt) : '' }) },
    sent: { icon: <Send size={18} />, cls: 'bg-success-subtle text-success', text: t('marketing.detail.banner.sent', { date: campaign.sentAt ? fmtDateTimeUS(campaign.sentAt) : '', count: campaign.recipients }) },
  }[campaign.status]

  const columns: Column<MessageLog>[] = [
    {
      key: 'client',
      header: t('marketing.detail.col.client'),
      cell: (m) =>
        m.clientId ? (
          <button type="button" className="text-primary hover:underline" onClick={() => drawer.open('client', { id: m.clientId! })}>
            {m.toName}
          </button>
        ) : (
          m.toName
        ),
    },
    { key: 'to', header: t('marketing.detail.col.to'), cell: (m) => <span className="text-muted">{m.to}</span> },
    { key: 'at', header: t('marketing.detail.col.at'), cell: (m) => fmtDateTimeUS(m.at) },
    { key: 'status', header: t('marketing.detail.col.status'), cell: (m) => <span className={m.status === 'opened' ? 'chip bg-success-subtle text-success' : 'chip bg-sunken text-muted'}>{t(`marketing.history.status.${m.status}`)}</span> },
  ]

  const location = locations[0]

  return (
    <Page>
      <BackCrumbs onBack={() => navigate('/marketing/blast-campaigns/home')} crumbs={[{ label: t('marketing.campaigns.title'), onClick: () => navigate('/marketing/blast-campaigns/home') }, { label: campaign.name }]} />
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 break-words font-display text-title-2 text-ink md:gap-3 md:text-title-1">
            {campaign.name}
            <CampaignStatusChip status={campaign.status} />
          </h1>
          <p className="mt-1 text-body-lg text-muted">
            <ChannelLabel channel={campaign.channel} /> · {audience}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {campaign.status === 'draft' && (
            <Button variant="primary" icon={<Pencil size={16} />} onClick={() => navigate(`/marketing/blast-campaigns/${campaign.id}/edit`)}>
              {t('marketing.detail.editAndSend')}
            </Button>
          )}
          <Menu
            width={220}
            trigger={({ open, toggle }) => (
              <MenuButton open={open} toggle={toggle}>
                {t('marketing.common.options')}
              </MenuButton>
            )}
            groups={[
              {
                items: [
                  ...(campaign.status === 'draft' ? [{ label: t('marketing.campaigns.actions.edit'), onSelect: () => navigate(`/marketing/blast-campaigns/${campaign.id}/edit`) }] : []),
                  ...(campaign.status === 'scheduled'
                    ? [
                        {
                          label: t('marketing.campaigns.actions.sendNow'),
                          onSelect: async () => {
                            await sendScheduledNow(campaign.id)
                            toast(t('marketing.campaigns.toast.sent'))
                          },
                        },
                        {
                          label: t('marketing.campaigns.actions.cancelSchedule'),
                          onSelect: async () => {
                            await cancelSchedule(campaign.id)
                            toast(t('marketing.campaigns.toast.unscheduled'))
                          },
                        },
                      ]
                    : []),
                  {
                    label: t('marketing.campaigns.actions.duplicate'),
                    onSelect: async () => {
                      const copy = await duplicateCampaign(campaign.id)
                      toast(t('marketing.campaigns.toast.duplicated'))
                      navigate(`/marketing/blast-campaigns/${copy.id}/edit`)
                    },
                  },
                ],
              },
              { items: [{ label: t('marketing.campaigns.actions.delete'), danger: true, onSelect: () => void remove() }] },
            ]}
          />
        </div>
      </header>

      <div className={`mb-6 flex items-start gap-3 rounded-lg px-4 py-3 text-body ${banner.cls}`} data-testid="campaign-banner">
        <span className="mt-0.5 shrink-0">{banner.icon}</span>
        <p>{banner.text}</p>
      </div>

      {campaign.status === 'sent' && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4">
            <StatCard label={t('marketing.detail.stats.sent')} value={s.sent} hint={t('marketing.detail.stats.deliveredHint', { count: s.delivered, value: num(pct(s.delivered, s.sent)) })} />
            <StatCard label={t('marketing.detail.stats.opened')} value={`${num(pct(s.opened, s.delivered))}%`} hint={t('marketing.detail.stats.openedHint', { count: s.opened })} />
            <StatCard label={t('marketing.detail.stats.clicked')} value={`${num(pct(s.clicked, s.delivered))}%`} hint={t('marketing.detail.stats.clickedHint', { count: s.clicked })} />
            <StatCard label={t('marketing.detail.stats.bookings')} value={s.bookings} hint={t('marketing.detail.stats.bookingsHint')} />
            <StatCard label={t('marketing.detail.stats.revenue')} value={money(s.revenue)} hint={t('marketing.detail.stats.revenueHint')} />
            <StatCard label={t('marketing.detail.stats.cost')} value={money2(campaign.cost)} hint={t('marketing.detail.stats.roi', { value: campaign.cost ? Math.round(s.revenue / campaign.cost) : 0 })} />
          </div>
          <Card title={t('marketing.detail.funnelTitle')} subtitle={t('marketing.detail.funnelHint')} className="mb-6 max-md:p-4">
            <div className="h-64" data-testid="campaign-funnel">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnel} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#DCE4E2" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} stroke="#84938F" />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} stroke="#84938F" />
                  <Tooltip cursor={{ fill: 'rgba(14,110,106,0.06)' }} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={26}>
                    {funnel.map((_, i) => (
                      <Cell key={i} fill={FUNNEL_COLORS[i]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card title={t('marketing.detail.details')} className="max-md:p-4">
            <DetailList
              rows={[
                { label: t('marketing.detail.rows.channel'), value: t(`marketing.campaigns.channel.${campaign.channel}`) },
                { label: t('marketing.detail.rows.audience'), value: audience },
                { label: t('marketing.detail.rows.recipients'), value: String(campaign.recipients) },
                { label: t(campaign.status === 'sent' ? 'marketing.detail.rows.cost' : 'marketing.detail.rows.estimatedCost'), value: money2(campaign.cost) },
                { label: t('marketing.detail.rows.created'), value: fmtDateTimeUS(campaign.createdAt) },
                { label: t(campaign.sentAt ? 'marketing.detail.rows.sent' : 'marketing.detail.rows.scheduled'), value: campaign.sentAt ? fmtDateTimeUS(campaign.sentAt) : campaign.scheduledAt ? fmtDateTimeUS(campaign.scheduledAt) : t('marketing.detail.rows.afterReview') },
                {
                  label: t('marketing.detail.rows.deal'),
                  value: deal ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Tag size={14} className="text-primary" aria-hidden />
                      {deal.name} · {discountLabel(deal)}
                      {deal.code ? ` · ${deal.code}` : ''}
                    </span>
                  ) : (
                    t('marketing.detail.rows.noDeal')
                  ),
                },
              ]}
            />
          </Card>
          {campaign.status === 'sent' && (
            <Card
              title={t('marketing.detail.recipientsTitle')}
              subtitle={t('marketing.detail.recipientsHint', { count: sample.length, total: campaign.recipients })}
              padded={false}
              className="overflow-hidden max-md:[&>div:first-child]:px-4 max-md:[&>div:first-child]:pt-4"
            >
              <div className="px-4 pb-4 md:px-6 md:pb-6">
                {/* Phones: a list of recipients instead of the wide table. */}
                <PhoneList
                  variant="rows"
                  rows={sample}
                  rowKey={(m) => m.id}
                  pageSize={10}
                  empty={<p className="px-4 py-8 text-center text-body text-muted">{t('marketing.detail.noRecipients')}</p>}
                  render={(m) => (
                    <div className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        {m.clientId ? (
                          <button type="button" className="min-w-0 text-left text-body-strong text-primary hover:underline" onClick={() => drawer.open('client', { id: m.clientId! })}>
                            {m.toName}
                          </button>
                        ) : (
                          <span className="min-w-0 text-body-strong text-ink">{m.toName}</span>
                        )}
                        <span className={m.status === 'opened' ? 'chip shrink-0 bg-success-subtle text-success' : 'chip shrink-0 bg-sunken text-muted'}>{t(`marketing.history.status.${m.status}`)}</span>
                      </div>
                      <p className="text-small text-muted [overflow-wrap:anywhere]">{m.to}</p>
                      <p className="text-small text-muted">{fmtDateTimeUS(m.at)}</p>
                    </div>
                  )}
                />
                <DataTable className="max-md:hidden" columns={columns} rows={sample} rowKey={(m) => m.id} pageSize={10} empty={<p className="px-6 py-8 text-center text-body text-muted">{t('marketing.detail.noRecipients')}</p>} />
              </div>
            </Card>
          )}
        </div>
        <div className="min-w-0">
          <p className="mb-2 text-body-strong text-ink">{t('marketing.builder.preview')}</p>

          {campaign.channel === 'email' ? (
            <EmailMock subject={campaign.subject || campaign.name} fromName={workspace.name} fromEmail={location?.email ?? ''}>
              <p className="font-display text-title-2 text-ink">{campaign.heading || campaign.name}</p>
              <p className="mt-3 whitespace-pre-wrap text-body text-ink">{campaign.body}</p>
              {deal && (
                <div className="mt-5 flex items-center gap-3 rounded-lg border border-dashed border-primary/40 bg-primary-subtle/40 p-4 text-body">
                  <Tag size={18} className="text-primary" aria-hidden />
                  <div>
                    <p className="font-semibold text-ink">
                      {deal.name} · {t('marketing.builder.off', { value: discountLabel(deal) })}
                    </p>
                    {deal.code && <p className="text-muted">{t('marketing.builder.useCode', { code: deal.code })}</p>}
                  </div>
                </div>
              )}
              {campaign.buttonLabel && <span className="mt-6 inline-flex h-10 items-center rounded-full bg-ink px-6 text-body-strong text-canvas">{campaign.buttonLabel}</span>}
              <p className="mt-8 border-t border-line pt-4 text-caption text-muted">{t('marketing.builder.footer', { name: workspace.name })}</p>
            </EmailMock>
          ) : (
            <MessageBubblePreview kind="sms" sender={settings.advanced.senderName || workspace.name} text={`${campaign.body}${deal?.code ? ` ${t('marketing.builder.smsCode', { code: deal.code })}` : ''} ${t('marketing.builder.stop')}`} />
          )}
        </div>
      </div>
    </Page>
  )
}

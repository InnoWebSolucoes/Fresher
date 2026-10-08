import { endOfMonth, format, parseISO, startOfMonth, startOfWeek, startOfYear, subDays, subMonths } from 'date-fns'
import { Info } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useDb } from '@/store/db'
import type { Automation, MessageLog } from '@/types'
import { Button, Chip, DetailList, EmptyState, Menu, MenuButton, Page, PageSkeleton, PillTabs, Segmented, Select, confirm, toast, usePageLoading } from '@/components/ui'
import { removeAutomation, resetAutomation, setAutomationEnabled, useMarketingSettings } from '@/api/marketing'
import { now } from '@/lib/time'
import { fmtDateTimeUS } from '@/lib/format'
import { BackCrumbs, EmailMock, MessageBubblePreview } from '../components/kit'
import { AutomationEmailBody, useAutomationCopy, useAutomationSample } from '../automationContent'
import { automationMessageTypes, pct } from '../helpers'
import { useTriggerText } from './automationTriggers'

export const CHANNEL_COLORS = { email: '#0E6E6A', sms: '#F4B23E', whatsapp: '#23763A' } as const
type Channel = keyof typeof CHANNEL_COLORS
type Period = 'ytd' | '30d' | '90d' | '12m'
type Metric = 'sent' | 'delivered' | 'opened'

/** Clicks aren't tracked per message; derive a stable share of opens. */
const clickedOf = (opened: number) => Math.round(opened * 0.32)

export function AutomationPreview({ automation }: { automation: Automation }) {
  const { t } = useTranslation()
  const sample = useAutomationSample()
  const copy = useAutomationCopy()
  const settings = useMarketingSettings()
  const workspace = useDb((s) => s.workspace)
  const [channel, setChannel] = useState<Channel>(automation.channels.email ? 'email' : automation.channels.sms ? 'sms' : automation.channels.whatsapp ? 'whatsapp' : 'email')
  const off = !automation.channels[channel]
  return (
    <div className="rounded-lg border border-line bg-sunken/50 p-6">
      <div className="mb-6 flex justify-center">
        <Segmented
          value={channel}
          onChange={setChannel}
          items={[
            { value: 'email', label: t('marketing.automations.channel.email') },
            { value: 'sms', label: t('marketing.automations.channel.sms') },
            { value: 'whatsapp', label: t('marketing.automations.channel.whatsapp') },
          ]}
        />
      </div>
      {off && <p className="mx-auto mb-4 max-w-xl rounded-md bg-warning-subtle px-4 py-2 text-center text-small text-warning">{t('marketing.automationDetail.channelOff')}</p>}
      {channel === 'email' ? (
        <EmailMock className="mx-auto max-w-[760px]" subject={copy.subject(automation, sample)} fromName={sample.business} fromEmail={sample.businessEmail}>
          <AutomationEmailBody automation={automation} sample={sample} />
        </EmailMock>
      ) : (
        <MessageBubblePreview kind={channel} sender={channel === 'sms' ? settings.advanced.senderName || workspace.name : sample.business} text={copy.text(automation, sample)} />
      )}
    </div>
  )
}

function usePerformance(automation: Automation | undefined, period: Period) {
  const messages = useDb((s) => s.messages)
  return useMemo(() => {
    const types = automation ? automationMessageTypes(automation.key) : []
    const today = now()
    const from = period === 'ytd' ? startOfYear(today) : period === '30d' ? subDays(today, 29) : period === '90d' ? subDays(today, 89) : startOfMonth(subMonths(today, 11))
    const fromIso = from.toISOString()
    const list = messages.filter((m) => types.includes(m.type) && m.at >= fromIso)
    const monthly = period === 'ytd' || period === '12m'
    const buckets: { key: string; label: string; range: string; email: number; sms: number; whatsapp: number; rows: MessageLog[] }[] = []
    if (monthly) {
      for (let d = startOfMonth(from); d <= today; d = startOfMonth(subMonths(d, -1))) {
        buckets.push({ key: format(d, 'yyyy-MM'), label: format(d, 'MMM'), range: `${format(d, 'MMM d')} – ${format(endOfMonth(d), 'MMM d, yyyy')}`, email: 0, sms: 0, whatsapp: 0, rows: [] })
      }
    } else {
      for (let d = startOfWeek(from, { weekStartsOn: 1 }); d <= today; d = new Date(d.getTime() + 7 * 864e5)) {
        buckets.push({ key: format(d, 'yyyy-MM-dd'), label: format(d, 'MMM d'), range: format(d, 'MMM d, yyyy'), email: 0, sms: 0, whatsapp: 0, rows: [] })
      }
    }
    for (const m of list) {
      const at = parseISO(m.at)
      const key = monthly ? format(at, 'yyyy-MM') : format(startOfWeek(at, { weekStartsOn: 1 }), 'yyyy-MM-dd')
      const b = buckets.find((x) => x.key === key)
      if (b) b.rows.push(m)
    }
    const totals = (rows: MessageLog[]) => {
      const by = (ch: Channel) => rows.filter((m) => m.channel === ch)
      const res = {} as Record<Channel, { sent: number; delivered: number; opened: number; clicked: number }>
      ;(['email', 'sms', 'whatsapp'] as Channel[]).forEach((ch) => {
        const r = by(ch)
        const delivered = r.filter((m) => m.status === 'delivered' || m.status === 'opened').length
        const opened = r.filter((m) => m.status === 'opened').length || (ch === 'email' ? Math.round(delivered * 0.58) : 0)
        res[ch] = { sent: r.length, delivered, opened, clicked: clickedOf(opened) }
      })
      return res
    }
    return { buckets, totals: totals(list), totalsOf: totals }
  }, [messages, automation, period])
}

export function AutomationDetailPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const loading = usePageLoading()
  const automations = useDb((s) => s.automations)
  const automation = automations.find((a) => a.id === id)
  const triggerText = useTriggerText()
  const tab = (params.get('tab') as 'performance' | 'preview' | 'details') || 'performance'
  const [period, setPeriod] = useState<Period>('ytd')
  const [metric, setMetric] = useState<Metric>('sent')
  const perf = usePerformance(automation, period)

  if (loading) {
    return (
      <Page>
        <PageSkeleton />
      </Page>
    )
  }
  if (!automation) {
    return (
      <Page>
        <EmptyState title={t('marketing.automationDetail.notFound')} action={<Button onClick={() => navigate('/marketing/automated-messages')}>{t('marketing.automationDetail.backToList')}</Button>} />
      </Page>
    )
  }

  const channels = (['email', 'sms', 'whatsapp'] as Channel[]).filter((ch) => automation.channels[ch])
  const chart = perf.buckets.map((b) => {
    const tt = perf.totalsOf(b.rows)
    return { label: b.label, range: b.range, email: tt.email[metric], sms: tt.sms[metric], whatsapp: tt.whatsapp[metric] }
  })
  const sum = (k: 'sent' | 'delivered' | 'opened' | 'clicked') => perf.totals.email[k] + perf.totals.sms[k] + perf.totals.whatsapp[k]

  const toggle = async () => {
    await setAutomationEnabled(automation.id, !automation.enabled)
    toast(automation.enabled ? t('marketing.automations.toast.disabled', { name: automation.name }) : t('marketing.automations.toast.enabled', { name: automation.name }))
  }
  const reset = async () => {
    if (!(await confirm({ title: t('marketing.automationDetail.reset.title'), body: t('marketing.automationDetail.reset.body'), confirmLabel: t('marketing.automationDetail.reset.confirm'), tone: 'primary' }))) return
    await resetAutomation(automation.id)
    toast(t('marketing.automationDetail.reset.done'))
  }
  const remove = async () => {
    if (!(await confirm({ title: t('marketing.automationDetail.remove.title'), body: t('marketing.automationDetail.remove.body', { name: automation.name }), confirmLabel: t('marketing.automationDetail.remove.confirm'), tone: 'danger' }))) return
    await removeAutomation(automation.id)
    toast(t('marketing.automationDetail.remove.done'))
    navigate('/marketing/automated-messages')
  }

  const funnelCard = (k: 'sent' | 'delivered' | 'opened' | 'clicked') => (
    <div key={k} className="rounded-lg border border-line bg-surface p-5">
      <p className="flex items-center gap-1.5 text-body-strong text-ink">
        {t(`marketing.automationDetail.funnel.${k}`)}
        <span title={t(`marketing.automationDetail.funnel.${k}Info`)} className="text-subtle">
          <Info size={14} aria-hidden />
        </span>
      </p>
      <p className="mt-2 font-display text-title-1 text-ink">{sum(k)}</p>
      <ul className="mt-3 flex flex-col gap-1 text-body text-muted">
        {(['email', 'sms', 'whatsapp'] as Channel[]).map((ch) => {
          const v = perf.totals[ch][k]
          const base = k === 'sent' ? 0 : perf.totals[ch].sent
          return (
            <li key={ch}>
              {t(`marketing.automationDetail.channelShort.${ch}`)}: {k === 'sent' ? v : base ? `${v} (${pct(v, base)}%)` : ch === 'email' || k !== 'opened' ? `${v} (0%)` : '-'}
            </li>
          )
        })}
      </ul>
    </div>
  )

  return (
    <Page>
      <BackCrumbs
        onBack={() => navigate('/marketing/automated-messages')}
        crumbs={[{ label: t('marketing.automations.title'), onClick: () => navigate('/marketing/automated-messages') }, { label: t(`marketing.automationDetail.short.${automation.section}`) }]}
      />
      <header className="mb-2 flex flex-wrap items-start justify-between gap-4">
        <h1 className="flex flex-wrap items-center gap-3 font-display text-title-1 text-ink">
          {automation.name}
          <Chip tone={automation.enabled ? 'success' : 'neutral'}>{automation.enabled ? t('marketing.common.enabled') : t('marketing.common.disabled')}</Chip>
        </h1>
        <Menu
          width={200}
          trigger={({ open, toggle: tg }) => (
            <MenuButton open={open} toggle={tg}>
              {t('marketing.common.options')}
            </MenuButton>
          )}
          groups={[
            {
              items: [
                { label: t('marketing.common.edit'), onSelect: () => navigate(`/marketing/automated-messages/configure/${automation.id}`) },
                { label: automation.enabled ? t('marketing.automationDetail.disable') : t('marketing.common.enable'), onSelect: () => void toggle() },
                { label: t('marketing.automationDetail.remove.action'), danger: true, onSelect: () => void remove() },
                { label: t('marketing.automationDetail.reset.action'), onSelect: () => void reset() },
              ],
            },
          ]}
        />
      </header>
      <p className="mb-6 text-body-lg text-muted">{automation.description}</p>
      <PillTabs
        className="mb-6"
        value={tab}
        onChange={(v) => setParams((p) => ({ ...Object.fromEntries(p), tab: v }), { replace: true })}
        items={[
          { value: 'performance', label: t('marketing.automationDetail.tabs.performance') },
          { value: 'preview', label: t('marketing.automationDetail.tabs.preview') },
          { value: 'details', label: t('marketing.automationDetail.tabs.details') },
        ]}
      />

      {tab === 'performance' && (
        <div className="flex flex-col gap-6">
          <div className="rounded-lg bg-sunken p-3">
            <Select
              aria-label={t('marketing.automationDetail.period')}
              className="h-10 w-48 rounded-full"
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              options={(['ytd', '30d', '90d', '12m'] as Period[]).map((p) => ({ value: p, label: t(`marketing.automationDetail.periods.${p}`) }))}
            />
          </div>
          <section className="card p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-title-3 text-ink">{t('marketing.automationDetail.chartTitle')}</h2>
              <Select
                aria-label={t('marketing.automationDetail.metric')}
                className="h-10 w-52 rounded-full"
                value={metric}
                onChange={(e) => setMetric(e.target.value as Metric)}
                options={(['sent', 'delivered', 'opened'] as Metric[]).map((m) => ({ value: m, label: t(`marketing.automationDetail.metrics.${m}`) }))}
              />
            </div>
            <div className="h-72" data-testid="automation-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ left: -16, right: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#DCE4E2" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#84938F" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#84938F" />
                  <Tooltip labelFormatter={(_, payload) => (payload?.[0]?.payload as { range?: string } | undefined)?.range ?? ''} />
                  <Legend iconType="circle" />
                  <Bar dataKey="email" name={t('marketing.automationDetail.channelShort.email')} stackId="a" fill={CHANNEL_COLORS.email} />
                  <Bar dataKey="sms" name={t('marketing.automationDetail.channelShort.sms')} stackId="a" fill={CHANNEL_COLORS.sms} />
                  <Bar dataKey="whatsapp" name={t('marketing.automationDetail.channelShort.whatsapp')} stackId="a" fill={CHANNEL_COLORS.whatsapp} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{(['sent', 'delivered', 'opened', 'clicked'] as const).map(funnelCard)}</div>
        </div>
      )}

      {tab === 'preview' && <AutomationPreview automation={automation} />}

      {tab === 'details' && (
        <section className="card p-6">
          <DetailList
            rows={[
              { label: t('marketing.automationDetail.details.sendTo'), value: triggerText(automation) },
              { label: t('marketing.automationDetail.details.created'), value: fmtDateTimeUS(automation.createdAt) },
              { label: t('marketing.automationDetail.details.channels'), value: channels.length ? channels.map((ch) => t(`marketing.automations.channel.${ch}`)).join(', ') : t('marketing.automationDetail.details.noChannels') },
              { label: t('marketing.automationDetail.details.updated'), value: fmtDateTimeUS(automation.updatedAt) },
              { label: t('marketing.automationDetail.details.type'), value: automation.marketing ? t('marketing.automationDetail.details.marketing') : t('marketing.automationDetail.details.transactional') },
            ]}
          />
        </section>
      )}
    </Page>
  )
}

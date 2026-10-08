import { Mail, MessageSquare } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { useDb } from '@/store/db'
import type { Campaign, Deal, Service } from '@/types'
import { Chip } from '@/components/ui'
import { clientStats } from '@/lib/segments'
import { fmtDate } from '@/lib/format'

/** Slices needed to resolve campaign audiences and segment counts. */
export function useAudienceData() {
  const data = useDb(
    useShallow((s) => ({
      clients: s.clients,
      appointments: s.appointments,
      sales: s.sales,
      clientPackages: s.clientPackages,
      clientMemberships: s.clientMemberships,
      giftCards: s.giftCards,
      segments: s.segments,
    })),
  )
  const stats = useMemo(() => clientStats(data), [data])
  return { data, stats }
}

export const CAMPAIGN_TONES: Record<Campaign['status'], 'neutral' | 'warning' | 'info' | 'success'> = {
  draft: 'neutral',
  pending: 'warning',
  scheduled: 'info',
  sent: 'success',
}

export function CampaignStatusChip({ status }: { status: Campaign['status'] }) {
  const { t } = useTranslation()
  return <Chip tone={CAMPAIGN_TONES[status]}>{t(`marketing.campaigns.status.${status}`)}</Chip>
}

export function ChannelLabel({ channel }: { channel: Campaign['channel'] }) {
  const { t } = useTranslation()
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-body text-ink">
      {channel === 'email' ? <Mail size={16} className="text-muted" aria-hidden /> : <MessageSquare size={16} className="text-muted" aria-hidden />}
      {t(`marketing.campaigns.channel.${channel}`)}
    </span>
  )
}

export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0)

/** "10% off" / "€5 off". */
export function discountLabel(deal: Pick<Deal, 'discountType' | 'value'>) {
  return deal.discountType === 'percent' ? `${deal.value}%` : `€${deal.value}`
}

/** Pieces of a deal's scope ("all services", "3 services", "all gift cards"). */
export function useDealScope() {
  const { t } = useTranslation()
  return (deal: Pick<Deal, 'appliesTo' | 'type'>, services: Service[]) => {
    const parts: string[] = []
    const a = deal.appliesTo
    const scope = (value: 'all' | string[], key: 'services' | 'products' | 'packages' | 'memberships') => {
      if (value === 'all') parts.push(t(`marketing.deals.scope.all_${key}`))
      else if (value.length === 1 && key === 'services') parts.push(services.find((s) => s.id === value[0])?.name ?? t('marketing.deals.scope.count_services', { count: 1 }))
      else if (value.length) parts.push(t(`marketing.deals.scope.count_${key}`, { count: value.length }))
    }
    scope(a.services, 'services')
    scope(a.products, 'products')
    if (a.giftCards) parts.push(t('marketing.deals.scope.all_giftCards'))
    scope(a.packages, 'packages')
    scope(a.memberships, 'memberships')
    return parts.join(', ') || t('marketing.deals.scope.nothing')
  }
}

export function dealDates(deal: Pick<Deal, 'startsAt' | 'endsAt'>, ongoing: string) {
  return `${fmtDate(deal.startsAt)} - ${deal.endsAt ? fmtDate(deal.endsAt) : ongoing}`
}

/** Map an automation key to the message types it produces (Performance tab). */
export function automationMessageTypes(key: string): string[] {
  if (key === 'reminder-24h') return ['reminder']
  if (key === 'new-appointment') return ['confirmation']
  if (key === 'rescheduled') return ['reschedule']
  if (key === 'cancelled') return ['cancellation']
  if (key === 'no-show') return ['no_show']
  if (key === 'thank-you') return ['thank_you', 'review_request']
  if (key === 'waitlist-joined' || key === 'waitlist-slot') return ['waitlist']
  if (key === 'chat-message') return ['chat']
  return []
}

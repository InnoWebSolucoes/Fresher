import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import type { AppointmentStatus, SegmentCondition, SegmentRule } from '@/types'
import { useDb } from '@/store/db'
import { fullName, money } from '@/lib/format'
import { COUNTRIES, GENDERS, LANGUAGES, PRONOUNS } from '../lib/constants'
import { PRIMARY } from '../lib/segmentEval'
import { periodLabel } from './model'

export interface Opt {
  value: string
  label: string
}

/** How the value of a rule's inline field or of a "where" condition is edited. */
export type ControlSpec =
  | { type: 'select'; options: Opt[]; asArray?: boolean }
  | { type: 'number'; lead: 'atLeast' | 'moreThan'; prefix?: string }
  | { type: 'age' }
  | { type: 'period'; days: number[]; direction: 'last' | 'next' }
  | { type: 'date'; future: boolean }
  | { type: 'channel'; options: Opt[] }

export const PAST_DAYS = [7, 14, 30, 60, 90, 180, 365]
export const NEXT_DAYS = [7, 14, 30, 60, 90]
const APPT_STATUSES: AppointmentStatus[] = ['booked', 'confirmed', 'arrived', 'started', 'completed', 'no_show', 'cancelled']
const CHANNELS = ['offline', 'marketplace', 'book_now_link', 'google', 'facebook', 'instagram', 'automations', 'blast']
const ITEM_TYPES = ['service', 'product', 'package', 'membership', 'gift_card']
const SALE_STATUSES = ['completed', 'part_paid', 'unpaid', 'refunded', 'voided']
const TIERS = ['bronze', 'silver', 'gold', 'platinum']
const LOYALTY = ['enrolled', 'not_enrolled']

/** Options and labels for every rule value, built from the live catalogue, team and client settings. */
export function useRuleOptions() {
  const { t } = useTranslation()
  const { locations, teamMembers, services, products, memberships, clientSources, clientTags } = useDb(
    useShallow((s) => ({
      locations: s.locations,
      teamMembers: s.teamMembers,
      services: s.services,
      products: s.products,
      memberships: s.memberships,
      clientSources: s.clientSources,
      clientTags: s.clientTags,
    })),
  )

  const lists = useMemo(
    () => ({
      location: locations.map((l) => ({ value: l.id, label: l.name })),
      team_member: teamMembers.map((m) => ({ value: m.id, label: fullName(m) })),
      service: services.map((s) => ({ value: s.id, label: s.name })),
      product: products.map((p) => ({ value: p.id, label: p.name })),
      membership: memberships.map((m) => ({ value: m.id, label: m.name })),
      source: clientSources.filter((s) => s.active || s.system).map((s) => ({ value: s.id, label: s.name })),
      tags: [...clientTags].sort((a, b) => a.order - b.order).map((tag) => ({ value: tag.id, label: tag.name })),
    }),
    [locations, teamMembers, services, products, memberships, clientSources, clientTags],
  )

  const specFor = useCallback(
    (rule: SegmentRule, field: string): ControlSpec | undefined => {
      const primary = PRIMARY[rule.attribute]
      if (primary && primary.field === field) {
        switch (primary.kind) {
          case 'count':
            return { type: 'number', lead: 'atLeast' }
          case 'money':
            return { type: 'number', lead: 'moreThan', prefix: '€' }
          case 'period_past':
            return { type: 'period', days: PAST_DAYS, direction: 'last' }
          case 'period_next':
            return { type: 'period', days: NEXT_DAYS, direction: 'next' }
          case 'exists':
            return {
              type: 'select',
              options: [
                { value: 'exists', label: t('clients.segments.rules.exists') },
                { value: 'not_exists', label: t('clients.segments.rules.notExists') },
              ],
            }
          case 'age':
            return { type: 'age' }
          case 'gender':
            return { type: 'select', options: GENDERS.map((g) => ({ value: g, label: t(`clients.gender.${g}`) })) }
          case 'pronouns':
            return { type: 'select', options: PRONOUNS.map((p) => ({ value: p, label: p })) }
          case 'language':
            return { type: 'select', options: LANGUAGES.map((l) => ({ value: l, label: l })) }
          case 'country':
            return { type: 'select', options: COUNTRIES.map((c) => ({ value: c, label: c })) }
          case 'source':
            return { type: 'select', options: lists.source, asArray: true }
          case 'tags':
            return { type: 'select', options: lists.tags, asArray: true }
          case 'tier':
            return { type: 'select', options: TIERS.map((v) => ({ value: v, label: t(`clients.segments.tiers.${v}`) })) }
          case 'loyalty_status':
            return { type: 'select', options: LOYALTY.map((v) => ({ value: v, label: t(`clients.segments.loyaltyStatus.${v}`) })) }
        }
      }
      const isSale = rule.attribute.includes('sale')
      switch (field) {
        case 'date':
          return { type: 'date', future: !isSale }
        case 'location':
          return { type: 'select', options: lists.location }
        case 'team_member':
          return { type: 'select', options: lists.team_member }
        case 'service':
          return { type: 'select', options: lists.service }
        case 'product':
          return { type: 'select', options: lists.product }
        case 'membership':
          return { type: 'select', options: lists.membership }
        case 'channel':
          return { type: 'channel', options: CHANNELS.map((c) => ({ value: c, label: t(`clients.segments.channels.${c}`) })) }
        case 'status':
          return { type: 'select', options: APPT_STATUSES.map((s) => ({ value: s, label: t(`clients.status.${s}`) })) }
        case 'sale_status':
          return { type: 'select', options: SALE_STATUSES.map((s) => ({ value: s, label: t(`clients.segments.saleStatus.${s}`) })) }
        case 'item_type':
          return { type: 'select', options: ITEM_TYPES.map((s) => ({ value: s, label: t(`clients.segments.itemTypes.${s}`) })) }
        case 'sale_value':
          return { type: 'number', lead: 'moreThan', prefix: '€' }
        default:
          return undefined
      }
    },
    [t, lists],
  )

  /** Short text for a value, e.g. "at least 2", "in the last 30 days", "is Baixa". */
  const valueLabel = useCallback(
    (rule: SegmentRule, c: SegmentCondition): string => {
      const spec = specFor(rule, c.field)
      const isPrimary = PRIMARY[rule.attribute]?.field === c.field
      if (!spec) return String(c.value)
      switch (spec.type) {
        case 'number':
          return `${t(`clients.segments.rules.${spec.lead}`)} ${spec.prefix ? money(Number(c.value) || 0) : Number(c.value) || 0}`
        case 'age': {
          const [min, max] = Array.isArray(c.value) ? c.value : ['', '']
          return `${t('clients.segments.rules.between')} ${min} ${t('clients.segments.rules.and')} ${max}`
        }
        case 'period':
          return periodLabel(t, Number(c.value) || 0, spec.direction, true)
        case 'date':
          return c.operator === 'future' ? t('clients.segments.period.inFuture') : periodLabel(t, Number(c.value) || 0, 'last', true)
        case 'channel': {
          const label = spec.options.find((o) => o.value === c.value)?.label ?? String(c.value)
          return `${t(c.operator === 'not' ? 'clients.segments.rules.isNot' : 'clients.segments.rules.is')} ${label}`
        }
        case 'select': {
          const values = Array.isArray(c.value) ? c.value.map(String) : [String(c.value)]
          const label = values.map((v) => spec.options.find((o) => o.value === v)?.label ?? v).join(', ')
          return isPrimary ? label : `${t('clients.segments.rules.is')} ${label}`
        }
      }
    },
    [specFor, t],
  )

  return { specFor, valueLabel }
}

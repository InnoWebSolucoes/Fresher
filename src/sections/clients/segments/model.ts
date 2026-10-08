import type { TFunction } from 'i18next'
import { create } from 'zustand'
import type { SegmentCondition, SegmentRule } from '@/types'
import { conditionsFor, groupOf, isEmptyValue, PRIMARY } from '../lib/segmentEval'

/** Rule draft carried from step 1 (rules) to step 2 (details) of "Create custom segment". */
interface DraftState {
  rules: SegmentRule[]
  setRules: (rules: SegmentRule[]) => void
  reset: () => void
}

export const emptyRule = (): SegmentRule => ({ attribute: '', conditions: [] })

export const useSegmentDraft = create<DraftState>()((set) => ({
  rules: [emptyRule()],
  setRules: (rules) => set({ rules }),
  reset: () => set({ rules: [emptyRule()] }),
}))

/** Rule with its attribute changed: the inline value starts at the attribute's default. */
export function withAttribute(attribute: string): SegmentRule {
  const primary = PRIMARY[attribute]
  return { attribute, conditions: primary ? [{ field: primary.field, operator: primary.operator, value: primary.initial }] : [] }
}

/** Sets (or adds) the value of one condition field of a rule. */
export function setCondition(rule: SegmentRule, field: string, patch: Partial<SegmentCondition>, fallbackOperator = 'is'): SegmentRule {
  const index = rule.conditions.findIndex((c) => c.field === field)
  if (index < 0) return { ...rule, conditions: [...rule.conditions, { field, operator: fallbackOperator, value: '', ...patch }] }
  return { ...rule, conditions: rule.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)) }
}

export const conditionValue = (rule: SegmentRule, field: string) => rule.conditions.find((c) => c.field === field)?.value

export interface RuleErrors {
  attribute?: boolean
  primary?: boolean
  /** Condition index → 'condition' (no field picked) or 'value' (no value). */
  conditions: Record<number, 'condition' | 'value'>
}

/** Validation for the rules editor: every rule needs an attribute, every condition a field and a value. */
export function validateRules(rules: SegmentRule[]): { errors: RuleErrors[]; valid: boolean } {
  let valid = true
  const errors = rules.map((rule) => {
    const e: RuleErrors = { conditions: {} }
    if (!rule.attribute) {
      e.attribute = true
      valid = false
      return e
    }
    const primary = PRIMARY[rule.attribute]
    if (primary) {
      const main = rule.conditions.find((c) => c.field === primary.field)
      const v = main?.value
      const emptyRange = Array.isArray(v) && primary.kind === 'age' && v.some((x) => x === '')
      if (!main || isEmptyValue(main.value) || emptyRange) {
        e.primary = true
        valid = false
      }
    }
    rule.conditions.forEach((c, i) => {
      if (primary && c.field === primary.field) return
      if (!c.field) {
        e.conditions[i] = 'condition'
        valid = false
      } else if (isEmptyValue(c.value) && c.operator !== 'future') {
        e.conditions[i] = 'value'
        valid = false
      }
    })
    return e
  })
  return { errors, valid }
}

/** "Last 30 days" / "Last 5 months" / "Next 30 days" labels for a number of days. */
export function periodLabel(t: TFunction, days: number, direction: 'last' | 'next' = 'last', inline = false): string {
  if (direction === 'next') return t(inline ? 'clients.segments.period.inNextDays' : 'clients.segments.period.nextDays', { count: days })
  if (days >= 150) {
    const months = Math.round(days / 30.4)
    return t(inline ? 'clients.segments.period.inLastMonths' : 'clients.segments.period.lastMonths', { count: months })
  }
  return t(inline ? 'clients.segments.period.inLastDays' : 'clients.segments.period.lastDays', { count: days })
}

/** Plain-language summary of custom rules, used as the segment description. */
export function describeRules(t: TFunction, rules: SegmentRule[], valueLabel: (rule: SegmentRule, c: SegmentCondition) => string): string {
  const parts = rules
    .filter((r) => r.attribute)
    .map((rule) => {
      const attr = t(`clients.segments.attributes.${rule.attribute}`).toLowerCase()
      const primary = PRIMARY[rule.attribute]
      const main = primary ? rule.conditions.find((c) => c.field === primary.field) : undefined
      let text = attr
      if (main && !isEmptyValue(main.value)) text += ` ${valueLabel(rule, main)}`
      const kind = groupOf(rule.attribute) === 'sales' ? 'sale' : 'appointment'
      const where = rule.conditions
        .filter((c) => c.field && c !== main && conditionsFor(rule.attribute).includes(c.field) && (!isEmptyValue(c.value) || c.operator === 'future'))
        .map((c) => `${t(`clients.segments.conditions.${kind}.${c.field}`).toLowerCase()} ${valueLabel(rule, c)}`)
      if (where.length) text += ` ${t('clients.segments.describe.where')} ${where.join(', ')}`
      return text
    })
  if (!parts.length) return t('clients.segments.describe.custom')
  return `${t('clients.segments.describe.prefix')} ${parts.join(`${t('clients.segments.describe.and')} `)}`
}

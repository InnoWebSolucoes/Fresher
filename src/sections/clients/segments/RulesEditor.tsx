import clsx from 'clsx'
import { Plus, Trash2, X } from 'lucide-react'
import type { ReactNode, SelectHTMLAttributes } from 'react'
import { useTranslation } from 'react-i18next'
import type { SegmentCondition, SegmentRule } from '@/types'
import { Button, IconButton, Select, TextInput } from '@/components/ui'
import { ATTRIBUTE_GROUPS, CONDITION_OPERATOR, conditionsFor, groupOf, PRIMARY } from '../lib/segmentEval'
import { emptyRule, periodLabel, withAttribute, type RuleErrors } from './model'
import { PAST_DAYS, useRuleOptions, type ControlSpec } from './useRuleOptions'

const CHEVRON = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%23586A68' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")"

/** Native select with option groups, styled like the kit's Select. */
function GroupedSelect({ groups, placeholder, className, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { groups: { label: string; options: { value: string; label: string }[] }[]; placeholder: string }) {
  return (
    <select className={clsx('input appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9', className)} style={{ backgroundImage: CHEVRON }} {...rest}>
      <option value="" disabled>
        {placeholder}
      </option>
      {groups.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

interface ValueControlProps {
  spec: ControlSpec
  condition: SegmentCondition
  invalid: boolean
  label: string
  onChange: (patch: Partial<SegmentCondition>) => void
}

/** Editor for one value: number, period, age range, channel or a plain select. */
function ValueControl({ spec, condition, invalid, label, onChange }: ValueControlProps) {
  const { t } = useTranslation()
  const lead = (text: string) => <span className="shrink-0 text-body text-muted">{text}</span>
  switch (spec.type) {
    case 'number':
      return (
        <div className="flex w-full items-center gap-2 md:w-auto">
          {lead(t(`clients.segments.rules.${spec.lead}`))}
          <TextInput
            type="number"
            min={0}
            aria-label={label}
            invalid={invalid}
            prefix={spec.prefix}
            className="min-w-0 flex-1 md:w-36 md:flex-none"
            value={condition.value === '' ? '' : String(condition.value)}
            onChange={(e) => onChange({ value: e.target.value === '' ? '' : Number(e.target.value) })}
          />
        </div>
      )
    case 'age': {
      const [min, max] = Array.isArray(condition.value) ? condition.value.map(String) : ['', '']
      return (
        <div className="flex w-full items-center gap-2 md:w-auto">
          {lead(t('clients.segments.rules.between'))}
          <TextInput type="number" min={0} aria-label={t('clients.segments.rules.minOf', { label })} invalid={invalid && !min} className="min-w-0 flex-1 md:w-24 md:flex-none" value={min} onChange={(e) => onChange({ value: [e.target.value, max] })} />
          {lead(t('clients.segments.rules.and'))}
          <TextInput type="number" min={0} aria-label={t('clients.segments.rules.maxOf', { label })} invalid={invalid && !max} className="min-w-0 flex-1 md:w-24 md:flex-none" value={max} onChange={(e) => onChange({ value: [min, e.target.value] })} />
        </div>
      )
    }
    case 'period':
      return (
        <Select
          aria-label={label}
          className="w-full md:w-64"
          value={String(condition.value)}
          onChange={(e) => onChange({ value: Number(e.target.value) })}
          options={(spec.days.includes(Number(condition.value)) ? spec.days : [...spec.days, Number(condition.value)].sort((a, b) => a - b)).map((d) => ({ value: String(d), label: periodLabel(t, d, spec.direction) }))}
        />
      )
    case 'date': {
      const current = condition.operator === 'future' ? 'future:0' : `last_days:${condition.value}`
      const days = condition.operator !== 'future' && typeof condition.value === 'number' && !PAST_DAYS.includes(condition.value) ? [...PAST_DAYS, condition.value].sort((a, b) => a - b) : PAST_DAYS
      const options = [...days.map((d) => ({ value: `last_days:${d}`, label: periodLabel(t, d) })), ...(spec.future ? [{ value: 'future:0', label: t('clients.segments.period.future') }] : [])]
      return (
        <Select
          aria-label={label}
          className="w-full md:w-64"
          value={current}
          onChange={(e) => {
            const [operator, value] = e.target.value.split(':')
            onChange({ operator, value: Number(value) })
          }}
          options={options}
        />
      )
    }
    case 'channel':
      return (
        <div className="flex w-full items-center gap-2 md:w-auto">
          <Select
            aria-label={t('clients.segments.rules.operatorOf', { label })}
            className="w-28 shrink-0 md:w-32"
            value={condition.operator === 'not' ? 'not' : 'is'}
            onChange={(e) => onChange({ operator: e.target.value })}
            options={[
              { value: 'is', label: t('clients.segments.rules.is') },
              { value: 'not', label: t('clients.segments.rules.isNot') },
            ]}
          />
          <Select
            aria-label={label}
            className={clsx('min-w-0 flex-1 md:w-56 md:flex-none', invalid && 'border-danger')}
            value={String(condition.value)}
            placeholder={t('clients.segments.rules.selectValue')}
            onChange={(e) => onChange({ value: e.target.value })}
            options={spec.options}
          />
        </div>
      )
    case 'select': {
      const value = Array.isArray(condition.value) ? (condition.value[0] ?? '') : String(condition.value)
      return (
        <Select
          aria-label={label}
          aria-invalid={invalid}
          className={clsx('w-full md:w-64', invalid && 'border-danger')}
          value={value}
          placeholder={t('clients.segments.rules.selectValue')}
          onChange={(e) => onChange({ value: spec.asArray ? (e.target.value ? [e.target.value] : []) : e.target.value })}
          options={spec.options}
        />
      )
    }
  }
}

interface RulesEditorProps {
  rules: SegmentRule[]
  onChange: (rules: SegmentRule[]) => void
  errors?: RuleErrors[]
  showErrors: boolean
  /** Shown on the right of the "Add rule" row (Total audience). */
  aside?: ReactNode
}

/** "Rule 1 — Clients with [attribute] … where [condition]" editor with Add condition / Add rule. */
export function RulesEditor({ rules, onChange, errors, showErrors, aside }: RulesEditorProps) {
  const { t } = useTranslation()
  const { specFor } = useRuleOptions()

  const groups = ATTRIBUTE_GROUPS.map((g) => ({ label: t(`clients.segments.groups.${g.group}`), options: g.items.map((a) => ({ value: a, label: t(`clients.segments.attributes.${a}`) })) }))
  const update = (index: number, rule: SegmentRule) => onChange(rules.map((r, i) => (i === index ? rule : r)))

  return (
    <div className="flex flex-col gap-4">
      {rules.map((rule, ri) => {
        const e = showErrors ? errors?.[ri] : undefined
        const primary = PRIMARY[rule.attribute]
        const main = primary ? rule.conditions.find((c) => c.field === primary.field) : undefined
        const mainSpec = main ? specFor(rule, main.field) : undefined
        const available = conditionsFor(rule.attribute)
        const kind = groupOf(rule.attribute) === 'sales' ? 'sale' : 'appointment'
        const extraGroup = rule.attribute && !groupOf(rule.attribute) ? [{ label: t('clients.segments.groups.other'), options: [{ value: rule.attribute, label: t(`clients.segments.attributes.${rule.attribute}`, { defaultValue: rule.attribute }) }] }] : []
        const used = rule.conditions.map((c) => c.field)
        return (
          <section key={ri} className="card relative p-4 md:p-6" aria-label={t('clients.segments.rules.rule', { n: ri + 1 })}>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-body text-muted">{t('clients.segments.rules.rule', { n: ri + 1 })}</p>
              {rules.length > 1 && (
                <IconButton label={t('clients.segments.rules.removeRule')} className="h-8 w-8" onClick={() => onChange(rules.filter((_, i) => i !== ri))}>
                  <X size={16} aria-hidden />
                </IconButton>
              )}
            </div>
            <div className="grid grid-cols-1 items-start gap-x-3 gap-y-2 md:grid-cols-[96px_minmax(0,1fr)] md:gap-y-3">
              <span className="text-body text-ink md:pt-2.5 md:text-right">{t('clients.segments.rules.clientsWith')}</span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <GroupedSelect
                    aria-label={t('clients.segments.rules.clientsWith')}
                    aria-invalid={Boolean(e?.attribute)}
                    className={clsx('w-full md:w-64', e?.attribute && 'border-danger')}
                    value={rule.attribute}
                    placeholder={t('clients.segments.rules.selectAttribute')}
                    groups={[...groups, ...extraGroup]}
                    onChange={(ev) => update(ri, withAttribute(ev.target.value))}
                  />
                  {main && mainSpec && (
                    <ValueControl
                      spec={mainSpec}
                      condition={main}
                      invalid={Boolean(e?.primary)}
                      label={t(`clients.segments.attributes.${rule.attribute}`)}
                      onChange={(patch) => update(ri, { ...rule, conditions: rule.conditions.map((c) => (c === main ? { ...c, ...patch } : c)) })}
                    />
                  )}
                </div>
                {e?.attribute && <p className="mt-1.5 text-small text-danger">{t('clients.segments.rules.errors.attribute')}</p>}
                {e?.primary && <p className="mt-1.5 text-small text-danger">{t('clients.segments.rules.errors.value')}</p>}
              </div>

              {rule.conditions.map((c, ci) => {
                if (c === main) return null
                const spec = c.field ? specFor(rule, c.field) : undefined
                const err = e?.conditions[ci]
                const fieldLabel = c.field ? t(`clients.segments.conditions.${kind}.${c.field}`, { defaultValue: c.field }) : t('clients.segments.rules.selectCondition')
                return (
                  <div key={ci} className="contents">
                    <span className="mt-2 text-body text-ink md:mt-0 md:pt-2.5 md:text-right">{t('clients.segments.rules.where')}</span>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Select
                            aria-label={t('clients.segments.rules.where')}
                            aria-invalid={err === 'condition'}
                            className={clsx('w-full md:w-64', err === 'condition' && 'border-danger')}
                            value={c.field}
                            placeholder={t('clients.segments.rules.selectCondition')}
                            options={[...available, ...(c.field && !available.includes(c.field) ? [c.field] : [])].map((f) => ({
                              value: f,
                              label: t(`clients.segments.conditions.${kind}.${f}`, { defaultValue: f }),
                              disabled: f !== c.field && used.includes(f),
                            }))}
                            onChange={(ev) => {
                              const field = ev.target.value
                              const fresh: SegmentCondition = { field, operator: CONDITION_OPERATOR[field] ?? 'is', value: field === 'date' ? 30 : field === 'sale_value' ? 50 : field === 'channel' ? 'offline' : '' }
                              update(ri, { ...rule, conditions: rule.conditions.map((x, i) => (i === ci ? fresh : x)) })
                            }}
                          />
                          {spec && (
                            <ValueControl
                              spec={spec}
                              condition={c}
                              invalid={err === 'value'}
                              label={fieldLabel}
                              onChange={(patch) => update(ri, { ...rule, conditions: rule.conditions.map((x, i) => (i === ci ? { ...x, ...patch } : x)) })}
                            />
                          )}
                        </div>
                        {err && <p className="mt-1.5 text-small text-danger">{t(err === 'condition' ? 'clients.segments.rules.errors.condition' : 'clients.segments.rules.errors.value')}</p>}
                      </div>
                      <IconButton label={t('clients.segments.rules.removeCondition')} className="h-10 w-10" onClick={() => update(ri, { ...rule, conditions: rule.conditions.filter((_, i) => i !== ci) })}>
                        <Trash2 size={18} aria-hidden />
                      </IconButton>
                    </div>
                  </div>
                )
              })}
            </div>
            {available.length > 0 && rule.conditions.filter((c) => c !== main).length < available.length && (
              <button
                type="button"
                className="mt-4 inline-flex items-center gap-1 text-body-strong text-primary hover:underline"
                onClick={() => update(ri, { ...rule, conditions: [...rule.conditions, { field: '', operator: '', value: '' }] })}
              >
                <Plus size={16} aria-hidden />
                {t('clients.segments.rules.addCondition')}
              </button>
            )}
          </section>
        )
      })}
      <div className="flex items-start justify-between gap-4">
        <Button icon={<Plus size={16} aria-hidden />} onClick={() => onChange([...rules, emptyRule()])}>
          {t('clients.segments.rules.addRule')}
        </Button>
        {aside}
      </div>
    </div>
  )
}

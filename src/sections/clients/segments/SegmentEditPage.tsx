import { ArrowLeft } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import type { ClientSegment, SegmentRule } from '@/types'
import { useDb } from '@/store/db'
import { saveSegment } from '@/api/clients'
import { money } from '@/lib/format'
import { Button, EmptyState, Field, FullscreenFrame, Menu, MenuButton, PageSkeleton, Select, TextInput, toast, usePageLoading } from '@/components/ui'
import { badgeKey, makeBadge } from '../lib/constants'
import { useSegmentEvaluator } from '../lib/hooks'
import { BadgeFields, type BadgeDraft } from './BadgeFields'
import { conditionValue, describeRules, periodLabel, setCondition, validateRules } from './model'
import { RulesEditor } from './RulesEditor'
import { useSegmentActions } from './SegmentsPage'
import { useRuleOptions } from './useRuleOptions'

type StandardControl =
  | { kind: 'period'; field: string; label: string; days: number[]; direction: 'last' | 'next' }
  | { kind: 'count'; field: string; label: string }
  | { kind: 'money'; field: string; label: string }

/** Editable parameters of the standard segments (rule 0); the others have fixed rules. */
const STANDARD_CONTROLS: Record<string, StandardControl[]> = {
  new: [{ kind: 'period', field: 'period', label: 'addedIn', days: [7, 14, 30, 60, 90], direction: 'last' }],
  recent: [{ kind: 'period', field: 'date', label: 'appointmentsIn', days: [7, 14, 30, 60, 90], direction: 'last' }],
  birthdays: [{ kind: 'period', field: 'period', label: 'birthdaysIn', days: [7, 14, 30, 60, 90], direction: 'next' }],
  loyal: [
    { kind: 'count', field: 'count', label: 'minSales' },
    { kind: 'period', field: 'date', label: 'salesIn', days: [30, 60, 90, 150, 180, 365], direction: 'last' },
  ],
  spenders: [{ kind: 'money', field: 'value', label: 'spentMoreThan' }],
}

const STANDARD_OPERATOR: Record<string, string> = { period: 'last_days', date: 'last_days', count: 'gte', value: 'gt' }

const SAVED_DEFAULT_COLOR = 'lavender'

/** Edit segment (`/clients/segments/edit/:id/rules`). */
export function SegmentEditPage() {
  const { id } = useParams()
  const loading = usePageLoading()
  const segment = useDb((s) => s.segments.find((x) => x.id === id))
  const navigate = useNavigate()
  const { t } = useTranslation()
  if (loading)
    return (
      <FullscreenFrame onClose={() => navigate('/clients/segments')} closeLabel={t('clients.segments.edit.close')}>
        <PageSkeleton rows={3} />
      </FullscreenFrame>
    )
  if (!segment)
    return (
      <FullscreenFrame onClose={() => navigate('/clients/segments')} closeLabel={t('clients.segments.edit.close')}>
        <EmptyState
          title={t('clients.segments.notFound')}
          body={t('clients.segments.notFoundBody')}
          action={
            <Button icon={<ArrowLeft size={16} aria-hidden />} onClick={() => navigate('/clients/segments')}>
              {t('clients.segments.backToSegments')}
            </Button>
          }
        />
      </FullscreenFrame>
    )
  return <EditForm key={segment.id} segment={segment} />
}

function EditForm({ segment }: { segment: ClientSegment }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const evaluator = useSegmentEvaluator()
  const actions = useSegmentActions()
  const { valueLabel } = useRuleOptions()
  const [rules, setRules] = useState<SegmentRule[]>(() => structuredClone(segment.rules))
  const [name, setName] = useState(segment.name)
  const [badge, setBadge] = useState<BadgeDraft>({ enabled: Boolean(segment.badge), name: segment.badge?.name ?? '', color: segment.badge ? badgeKey(segment.badge) : SAVED_DEFAULT_COLOR })
  const [showErrors, setShowErrors] = useState(false)
  const [saving, setSaving] = useState(false)

  const controls = segment.standard ? STANDARD_CONTROLS[segment.key ?? ''] : undefined
  const rulesChanged = JSON.stringify(rules) !== JSON.stringify(segment.rules)
  // Edited custom rules are evaluated by the section's evaluator (no `key`), so the preview matches what gets saved.
  const preview = useMemo(() => ({ key: segment.standard || !rulesChanged ? segment.key : undefined, rules }), [segment.standard, segment.key, rulesChanged, rules])
  const audience = useMemo(() => evaluator.count(preview), [evaluator, preview])
  const validation = validateRules(rules)
  const nameError = !segment.standard && showErrors && !name.trim() ? t('clients.segments.create.nameRequired') : undefined

  const standardDescription = (): string => {
    const rule = rules[0]
    const days = Number(conditionValue(rule, rule.attribute === 'added_date' || rule.attribute === 'birthday' ? 'period' : 'date')) || 30
    switch (segment.key) {
      case 'new':
        return t('clients.segments.describe.new', { period: periodLabel(t, days, 'last', true) })
      case 'recent':
        return t('clients.segments.describe.recent', { period: periodLabel(t, days, 'last', true) })
      case 'birthdays':
        return t('clients.segments.describe.birthdays', { period: periodLabel(t, days, 'next', true) })
      case 'loyal':
        return t('clients.segments.describe.loyal', { count: Number(conditionValue(rule, 'count')) || 2, period: periodLabel(t, days, 'last', true) })
      case 'spenders':
        return t('clients.segments.describe.spenders', { value: money(Number(conditionValue(rule, 'value')) || 0) })
      default:
        return segment.description
    }
  }

  const save = async () => {
    setShowErrors(true)
    const badgeInvalid = badge.enabled && !badge.name.trim()
    if (!validation.valid || badgeInvalid || (!segment.standard && !name.trim())) {
      toast(t('clients.segments.toast.formErrors'), 'error')
      return
    }
    setSaving(true)
    try {
      const period = segment.key === 'new' || segment.key === 'recent' ? Number(conditionValue(rules[0], segment.key === 'new' ? 'period' : 'date')) || segment.periodDays : segment.periodDays
      await saveSegment({
        ...segment,
        key: preview.key,
        name: segment.standard ? segment.name : name.trim(),
        rules,
        periodDays: period,
        description: segment.standard ? standardDescription() : rulesChanged ? describeRules(t, rules, valueLabel) : segment.description,
        badge: badge.enabled ? makeBadge(badge.name.trim(), badge.color) : undefined,
      })
      toast(t('clients.segments.toast.updated'))
      navigate(segment.standard ? '/clients/segments' : '/clients/segments?tab=custom')
    } finally {
      setSaving(false)
    }
  }

  const updateStandard = (field: string, value: number) => setRules((prev) => prev.map((r, i) => (i === 0 ? setCondition(r, field, { value }, STANDARD_OPERATOR[field]) : r)))

  return (
    <FullscreenFrame
      onClose={() => navigate('/clients/segments')}
      closeLabel={t('clients.segments.edit.close')}
      actions={
        <>
          <Menu
            width={220}
            trigger={({ open, toggle }) => (
              <MenuButton open={open} toggle={toggle}>
                {t('clients.segments.options')}
              </MenuButton>
            )}
            groups={[
              {
                items: [
                  {
                    label: t('clients.segments.duplicate'),
                    onSelect: () =>
                      void actions.duplicate(segment).then((copy) => navigate(`/clients/segments/edit/${copy.id}/rules`)),
                  },
                  { label: t('clients.segments.viewClients'), onSelect: () => actions.viewClients(segment) },
                  { label: t('clients.segments.sendBlast'), onSelect: () => actions.sendBlast(segment) },
                ],
              },
              ...(!segment.standard
                ? [{ items: [{ label: t('clients.segments.deleteSegment'), danger: true, onSelect: () => void actions.remove(segment).then((ok) => ok && navigate('/clients/segments?tab=custom')) }] }]
                : []),
            ]}
          />
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            {t('clients.segments.edit.save')}
          </Button>
        </>
      }
    >
      <h1 className="mb-8 font-display text-display text-ink">{t('clients.segments.edit.title', { name: segment.name })}</h1>

      {segment.standard ? (
        <div className="flex flex-col gap-5">
          {controls ? (
            controls.map((c) => {
              const current = Number(conditionValue(rules[0], c.field))
              return (
                <Field key={c.field} label={t(`clients.segments.edit.${c.label}`)}>
                  {(fid) =>
                    c.kind === 'period' ? (
                      <Select
                        id={fid}
                        value={String(current || 30)}
                        onChange={(e) => updateStandard(c.field, Number(e.target.value))}
                        options={(c.days.includes(current) ? c.days : [...c.days, current || 30].sort((a, b) => a - b)).map((d) => ({ value: String(d), label: periodLabel(t, d, c.direction) }))}
                      />
                    ) : (
                      <TextInput
                        id={fid}
                        type="number"
                        min={c.kind === 'count' ? 1 : 0}
                        prefix={c.kind === 'money' ? '€' : undefined}
                        value={Number.isNaN(current) ? '' : String(current)}
                        onChange={(e) => updateStandard(c.field, e.target.value === '' ? 0 : Number(e.target.value))}
                      />
                    )
                  }
                </Field>
              )
            })
          ) : (
            <div className="rounded-lg border border-line bg-surface p-4">
              <p className="text-body-strong text-ink">{segment.description}</p>
              <p className="mt-1 text-small text-muted">{t('clients.segments.edit.fixedRules')}</p>
            </div>
          )}
          <p className="text-body text-muted">
            {t('clients.segments.rules.totalAudienceInline')} <strong className="tabular text-ink">{audience}</strong>
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <Field label={t('clients.segments.edit.name')} counter={{ value: name.length, max: 200 }} error={nameError}>
            {(fid) => <TextInput id={fid} maxLength={200} value={name} invalid={Boolean(nameError)} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <RulesEditor
            rules={rules}
            onChange={setRules}
            errors={validation.errors}
            showErrors={showErrors}
            aside={
              <div className="text-right">
                <p className="text-body text-muted">{t('clients.segments.rules.totalAudience')}</p>
                <p className="font-display text-title-3 tabular text-ink">{audience}</p>
              </div>
            }
          />
        </div>
      )}

      <section className="mt-10">
        <h2 className="mb-4 text-title-3 text-ink">{t('clients.segments.edit.advanced')}</h2>
        <BadgeFields value={badge} onChange={setBadge} showErrors={showErrors} hintKey="hintEdit" />
      </section>
    </FullscreenFrame>
  )
}

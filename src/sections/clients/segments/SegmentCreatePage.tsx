import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { saveSegment } from '@/api/clients'
import { Button, Field, FullscreenFrame, IconButton, LearnMore, TextInput, toast } from '@/components/ui'
import { makeBadge } from '../lib/constants'
import { useSegmentEvaluator } from '../lib/hooks'
import { BadgeFields, type BadgeDraft } from './BadgeFields'
import { describeRules, useSegmentDraft, validateRules } from './model'
import { RulesEditor } from './RulesEditor'
import { useRuleOptions } from './useRuleOptions'

const exit = '/clients/segments'

/** Create custom segment (`/clients/segments/create/rules` → `/details`). */
export function SegmentCreatePage() {
  const { step } = useParams()
  if (step === 'details') return <DetailsStep />
  if (step !== 'rules') return <Navigate to="/clients/segments/create/rules" replace />
  return <RulesStep />
}

function useClose(before?: () => void) {
  const navigate = useNavigate()
  const reset = useSegmentDraft((s) => s.reset)
  return () => {
    before?.()
    navigate(exit)
    reset()
  }
}

function RulesStep() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const close = useClose()
  const rules = useSegmentDraft((s) => s.rules)
  const setRules = useSegmentDraft((s) => s.setRules)
  const evaluator = useSegmentEvaluator()
  const [showErrors, setShowErrors] = useState(false)
  const validation = validateRules(rules)
  const preview = useMemo(() => ({ rules }), [rules])
  const audience = useMemo(() => evaluator.count(preview), [evaluator, preview])

  const next = () => {
    setShowErrors(true)
    if (!validation.valid) {
      toast(t('clients.segments.toast.formErrors'), 'error')
      return
    }
    navigate('/clients/segments/create/details')
  }

  return (
    <FullscreenFrame
      progress={0.5}
      onClose={close}
      closeLabel={t('clients.segments.create.close')}
      maxWidth="max-w-4xl"
      actions={
        <Button variant="primary" iconRight={<ArrowRight size={16} aria-hidden />} onClick={next}>
          {t('clients.segments.create.continue')}
        </Button>
      }
    >
      <h1 className="font-display text-title-1 text-ink md:text-display">{t('clients.segments.create.title')}</h1>
      <p className="mb-6 mt-2 text-body text-muted md:mb-8 md:text-body-lg">
        {t('clients.segments.create.subtitle')} <LearnMore topic={t('clients.topics.segments')}>{t('clients.common.learnMore')}</LearnMore>
      </p>
      <RulesEditor
        rules={rules}
        onChange={setRules}
        errors={validation.errors}
        showErrors={showErrors}
        aside={
          <div className="text-right" aria-live="polite">
            <p className="text-body text-muted">{t('clients.segments.rules.totalAudience')}</p>
            <p className="font-display text-title-3 tabular text-ink">{audience}</p>
          </div>
        }
      />
    </FullscreenFrame>
  )
}

function DetailsStep() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const leaving = useRef(false)
  const close = useClose(() => {
    leaving.current = true
  })
  const rules = useSegmentDraft((s) => s.rules)
  const reset = useSegmentDraft((s) => s.reset)
  const { valueLabel } = useRuleOptions()
  const [name, setName] = useState('')
  const [badge, setBadge] = useState<BadgeDraft>({ enabled: false, name: '', color: 'lavender' })
  const [showErrors, setShowErrors] = useState(false)
  const [saving, setSaving] = useState(false)

  // Direct visit (or reload) without valid rules: back to step 1.
  if (!leaving.current && !validateRules(rules).valid) return <Navigate to="/clients/segments/create/rules" replace />

  const nameError = showErrors && !name.trim() ? t('clients.segments.create.nameRequired') : undefined

  const save = async () => {
    setShowErrors(true)
    if (!name.trim() || (badge.enabled && !badge.name.trim())) {
      toast(t('clients.segments.toast.formErrors'), 'error')
      return
    }
    setSaving(true)
    try {
      await saveSegment({
        name: name.trim(),
        description: describeRules(t, rules, valueLabel),
        standard: false,
        rules,
        badge: badge.enabled ? makeBadge(badge.name.trim(), badge.color) : undefined,
      })
      toast(t('clients.segments.toast.created'))
      leaving.current = true
      navigate(`${exit}?tab=custom`)
      reset()
    } finally {
      setSaving(false)
    }
  }

  return (
    <FullscreenFrame
      progress={1}
      onClose={close}
      closeLabel={t('clients.segments.create.close')}
      actions={
        <>
          <IconButton label={t('clients.segments.create.back')} className="h-10 w-10" onClick={() => navigate('/clients/segments/create/rules')}>
            <ArrowLeft size={18} aria-hidden />
          </IconButton>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            {t('clients.segments.create.save')}
          </Button>
        </>
      }
    >
      <h1 className="font-display text-title-1 text-ink md:text-display">{t('clients.segments.create.nameTitle')}</h1>
      <p className="mb-6 mt-2 text-body text-muted md:mb-8 md:text-body-lg">{t('clients.segments.create.nameSubtitle')}</p>
      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Field label={t('clients.segments.create.name')} counter={{ value: name.length, max: 200 }} error={nameError}>
          {(id) => <TextInput id={id} autoFocus maxLength={200} value={name} placeholder={t('clients.segments.create.namePlaceholder')} invalid={Boolean(nameError)} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <BadgeFields value={badge} onChange={setBadge} showErrors={showErrors} />
      </form>
    </FullscreenFrame>
  )
}

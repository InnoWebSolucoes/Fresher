import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useDb } from '@/store/db'
import { Button, LearnMore, toast } from '@/components/ui'
import { RATES, saveBlastBilling } from '@/api/marketing'
import { money2 } from '@/lib/format'
import { BillingDetailsFields, CardFields, WizardFrame, WizardTitle, initialBilling, validateBilling, type BillingErrors, type BillingValues } from '../components/kit'

const STEPS = ['fees-overview', 'payment-and-billing'] as const

export function BlastBillingWizardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { step = 'fees-overview' } = useParams()
  const [params] = useSearchParams()
  const campaignId = params.get('campaign')
  const workspace = useDb((s) => s.workspace)
  const [values, setValues] = useState<BillingValues>(() => initialBilling(workspace.plan.billingDetails))
  const [errors, setErrors] = useState<BillingErrors>({})
  const [saving, setSaving] = useState(false)
  const index = Math.max(0, STEPS.indexOf(step as (typeof STEPS)[number]))
  const query = campaignId ? `?campaign=${campaignId}` : ''
  const close = () => navigate(campaignId ? `/marketing/blast-campaigns/${campaignId}/edit` : '/marketing/blast-campaigns/home')
  const go = (i: number) => navigate(`/legal-wizard/blast-marketing/${STEPS[i]}${query}`)
  const patch = (p: Partial<BillingValues>) => {
    setValues((v) => ({ ...v, ...p }))
    setErrors((e) => {
      const next = { ...e }
      Object.keys(p).forEach((k) => delete next[k as keyof BillingValues])
      return next
    })
  }

  const save = async () => {
    const e = validateBilling(values, t)
    setErrors(e)
    if (Object.keys(e).length) {
      toast(t('marketing.billing.fix'), 'error')
      return
    }
    setSaving(true)
    try {
      await saveBlastBilling({ ...values })
      toast(t('marketing.billing.saved'))
      navigate(campaignId ? `/marketing/blast-campaigns/${campaignId}/edit?confirm=1` : '/marketing/blast-campaigns/new')
    } finally {
      setSaving(false)
    }
  }

  return (
    <WizardFrame
      segments={[1, index >= 1 ? 1 : 0]}
      onBack={index > 0 ? () => go(index - 1) : undefined}
      actions={
        index === 0 ? (
          <>
            <Button onClick={close}>{t('marketing.common.close')}</Button>
            <Button variant="primary" onClick={() => go(1)}>
              {t('marketing.billing.nextStep')}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => go(0)}>{t('marketing.billing.goBack')}</Button>
            <Button variant="primary" loading={saving} onClick={() => void save()} data-testid="billing-save">
              {t('marketing.common.save')}
            </Button>
          </>
        )
      }
    >
      {index === 0 ? (
        <>
          <WizardTitle eyebrow={t('marketing.billing.eyebrow')} title={t('marketing.billing.feesTitle')} />
          <div className="card divide-y divide-line p-6">
            {(['sms', 'email'] as const).map((ch) => (
              <div key={ch} className="flex items-center justify-between gap-4 py-4 first:pt-0">
                <div>
                  <h2 className="font-display text-title-3 text-ink">{t(`marketing.billing.${ch}Title`)}</h2>
                  <p className="mt-1 text-body text-ink">{t(`marketing.billing.${ch}Body`)}</p>
                </div>
                <span className="chip shrink-0 bg-accent-subtle text-warning">{t(`marketing.billing.${ch}Rate`, { value: money2(RATES[ch]) })}</span>
              </div>
            ))}
            <p className="pt-4 text-body text-muted">
              {t('marketing.billing.taxNote')} <LearnMore topic="fees and commissions">{t('marketing.billing.feesLink')}</LearnMore>
            </p>
          </div>
        </>
      ) : (
        <>
          <WizardTitle title={t('marketing.billing.paymentTitle')} />
          <div className="flex flex-col gap-6">
            <CardFields values={values} errors={errors} onChange={patch} />
            <BillingDetailsFields values={values} errors={errors} onChange={patch} />
          </div>
        </>
      )}
    </WizardFrame>
  )
}

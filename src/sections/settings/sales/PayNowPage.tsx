import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Checkbox } from '@/components/ui'
import { setSettingsExtra, useSettingsExtra } from '@/api/settings'
import { Banner, EditCard, SettingsPage, SummaryList } from '../components/ui'
import { FullModal } from '../components/FullModal'
import { useAction, useDraft } from '../components/useAction'
import { FormCard, ToggleCard, usePaymentsActive } from './shared'

/** Extras key 'sales.payNow'. */
export interface PayNowSettings {
  enabled: boolean
  cardOnFile: boolean
  terminal: boolean
  autoReceipt: boolean
}

export const PAY_NOW_KEY = 'sales.payNow'
export const PAY_NOW_DEFAULTS: PayNowSettings = { enabled: true, cardOnFile: true, terminal: true, autoReceipt: true }

/** Settings › Sales › Pay now (settings-sales.md §1). Payments is active, so the configured state is shown. */
export function PayNowPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const payments = usePaymentsActive()
  const value = useSettingsExtra<PayNowSettings>(PAY_NOW_KEY, PAY_NOW_DEFAULTS)
  const [open, setOpen] = useState(false)
  const [draft, patch, reset] = useDraft<PayNowSettings>(value)
  const [error, setError] = useState('')
  const [saving, run] = useAction()

  const edit = () => {
    reset(value)
    setError('')
    setOpen(true)
  }
  const save = () => {
    if (draft.enabled && !draft.cardOnFile && !draft.terminal) {
      setError(t('settings.sale.payNow.methodRequired'))
      return
    }
    void run(() => setSettingsExtra(PAY_NOW_KEY, draft), t('settings.sale.payNow.saved'), () => setOpen(false))
  }

  return (
    <SettingsPage title={t('settings.sale.payNow.title')} description={t('settings.sale.payNow.description')} learnMore={t('settings.sale.payNow.title')}>
      {payments ? (
        <Banner
          tone="success"
          title={t('settings.sale.payNow.paymentsActive')}
          action={
            <Button size="sm" variant="link" onClick={() => navigate('/setup/payments/payment-methods')}>
              {t('settings.sale.payNow.paymentSettings')}
            </Button>
          }
        >
          {t('settings.sale.payNow.paymentsActiveBody')}
        </Banner>
      ) : (
        <Banner
          tone="info"
          title={t('settings.sale.payNow.paymentsInactive')}
          action={
            <Button size="sm" variant="primary" onClick={() => navigate('/setup/payments/payment-policy')}>
              {t('settings.sale.payNow.viewPayments')}
            </Button>
          }
        >
          {t('settings.sale.payNow.paymentsInactiveBody')}
        </Banner>
      )}
      <EditCard title={t('settings.sale.payNow.cardTitle')} description={t('settings.sale.payNow.cardDescription')} onEdit={edit} testId="pay-now-card">
        <SummaryList
          variant="check"
          items={[
            { key: 'enabled', on: value.enabled, text: value.enabled ? t('settings.sale.payNow.summaryEnabled') : t('settings.sale.payNow.summaryDisabled') },
            { key: 'card', on: value.enabled && value.cardOnFile, text: t('settings.sale.payNow.cardOnFile') },
            { key: 'terminal', on: value.enabled && value.terminal, text: t('settings.sale.payNow.terminal') },
            { key: 'receipt', on: value.autoReceipt, text: t('settings.sale.payNow.autoReceipt') },
          ]}
        />
      </EditCard>

      <FullModal open={open} onClose={() => setOpen(false)} title={t('settings.sale.payNow.editTitle')} subtitle={t('settings.sale.payNow.description')} onSave={save} saving={saving} testId="pay-now-modal">
        <div className="flex flex-col gap-6">
          <ToggleCard title={t('settings.sale.payNow.cardTitle')} description={t('settings.sale.payNow.toggleHint')} checked={draft.enabled} onChange={(enabled) => patch({ enabled })} />
          <FormCard title={t('settings.sale.payNow.methodsTitle')} description={t('settings.sale.payNow.methodsDescription')}>
            <div className="flex flex-col gap-4">
              <Checkbox label={t('settings.sale.payNow.cardOnFile')} hint={t('settings.sale.payNow.cardOnFileHint')} checked={draft.cardOnFile} disabled={!draft.enabled || !payments} onChange={(cardOnFile) => {
                  setError('')
                  patch({ cardOnFile })
                }} />
              <Checkbox label={t('settings.sale.payNow.terminal')} hint={t('settings.sale.payNow.terminalHint')} checked={draft.terminal} disabled={!draft.enabled || !payments} onChange={(terminal) => {
                  setError('')
                  patch({ terminal })
                }} />
            </div>
            {error && <p className="mt-3 text-small text-danger">{error}</p>}
          </FormCard>
          <FormCard title={t('settings.sale.payNow.afterTitle')}>
            <Checkbox label={t('settings.sale.payNow.autoReceipt')} hint={t('settings.sale.payNow.autoReceiptHint')} checked={draft.autoReceipt} onChange={(autoReceipt) => patch({ autoReceipt })} />
          </FormCard>
        </div>
      </FullModal>
    </SettingsPage>
  )
}

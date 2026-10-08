import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, EmptyState, FullscreenFrame, toast } from '@/components/ui'
import { sendAppointmentForm } from '@/api/calendar'
import { useDb } from '@/store/db'

/** "Add a form" for an appointment: send an active client form (calendar.md §9). */
export function FormSelectionPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const appointmentId = params.get('appointmentId') ?? ''
  const templates = useDb((s) => s.formTemplates).filter((f) => f.status === 'active')
  const [busy, setBusy] = useState<string | null>(null)
  const back = () => navigate(-1)
  return (
    <FullscreenFrame title={t('calendar.forms.selectTitle')} onClose={back}>
      {!templates.length ? (
        <EmptyState
          title={t('calendar.forms.emptyTitle')}
          body={t('calendar.forms.emptyBody')}
          action={<Button onClick={() => navigate('/setup/forms-and-notes/form-templates')}>{t('calendar.forms.learnMore')}</Button>}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {templates.map((f) => (
            <div key={f.id} className="card flex items-center justify-between p-5">
              <span className="text-body-lg text-ink">{f.name}</span>
              <Button
                variant="primary"
                loading={busy === f.id}
                onClick={async () => {
                  setBusy(f.id)
                  try {
                    await sendAppointmentForm(appointmentId, f.id)
                    toast(t('calendar.toasts.formSent'))
                    back()
                  } catch (err) {
                    toast(err instanceof Error ? err.message : t('calendar.toasts.error'), 'error')
                  } finally {
                    setBusy(null)
                  }
                }}
              >
                {t('calendar.forms.send')}
              </Button>
            </div>
          ))}
        </div>
      )}
    </FullscreenFrame>
  )
}

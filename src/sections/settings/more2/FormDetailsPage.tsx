import { ArrowLeft, ClipboardList, Inbox } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Chip, EmptyState, Modal } from '@/components/ui'
import { fmtDate, fullName } from '@/lib/format'
import { now } from '@/lib/time'
import { useDb } from '@/store/db'
import type { FormResponse, FormTemplate } from '@/types'
import { EditCard, InfoGrid, PillMenu, SettingsPage } from '../components/ui'
import { FormTemplatesPage } from '../forms/FormTemplatesPage'
import { FormRunner } from '../forms/FormRunner'
import { FORMS_BASE, TemplateStatusChip, frequencyLabel, requestLabel, servicesLabel, templatePath } from '../forms/shared'
import { useFormTemplateActions } from '../forms/useFormTemplateActions'

const DAY_MS = 86_400_000

function BackLink() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate(FORMS_BASE)} className="-mb-2 inline-flex w-fit items-center gap-1.5 rounded-sm text-body text-muted hover:text-ink">
      <ArrowLeft size={16} aria-hidden />
      {t('settings.frm.templates.title')}
    </button>
  )
}

/** Form template overview (settings-forms.md §1.1). */
export function FormDetailsPage() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const template = useDb((s) => s.formTemplates.find((f) => f.id === id))
  if (!template) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <div className="card">
          <EmptyState
            icon={<ClipboardList size={26} aria-hidden />}
            title={t('settings.more2.forms.notFound')}
            action={
              <Button variant="primary" onClick={() => navigate(FORMS_BASE)}>
                {t('settings.more2.forms.backToTemplates')}
              </Button>
            }
          />
        </div>
      </div>
    )
  }
  return <Details template={template} />
}

const STATUS_TONE: Record<FormResponse['status'], 'success' | 'info' | 'danger'> = { completed: 'success', sent: 'info', not_completed: 'danger' }

function Details({ template }: { template: FormTemplate }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const responses = useDb((s) => s.formResponses)
  const clients = useDb((s) => s.clients)
  const appointments = useDb((s) => s.appointments)
  const { busy, activate, deactivate, menuGroups } = useFormTemplateActions()

  const mine = useMemo(() => responses.filter((r) => r.templateId === template.id).sort((a, b) => b.sentAt.localeCompare(a.sentAt)), [responses, template.id])
  const stats = useMemo(() => {
    const since = now().getTime() - 30 * DAY_MS
    const recent = mine.filter((r) => new Date(r.sentAt).getTime() >= since)
    const count = (status: FormResponse['status']) => recent.filter((r) => r.status === status).length
    return [
      { key: 'sent', value: recent.length },
      { key: 'completed', value: count('completed') },
      { key: 'toComplete', value: count('sent') },
      { key: 'notCompleted', value: count('not_completed') },
    ].map((row) => ({ ...row, pct: recent.length ? Math.round((row.value / recent.length) * 100) : 0 }))
  }, [mine])
  const clientName = useMemo(() => {
    const byId = new Map(clients.map((c) => [c.id, c]))
    return (id: string) => {
      const c = byId.get(id)
      return c ? fullName(c) : t('settings.more2.forms.unknownClient')
    }
  }, [clients, t])
  const apptDate = useMemo(() => {
    const byId = new Map(appointments.map((a) => [a.id, a.date]))
    return (id?: string) => (id ? byId.get(id) : undefined)
  }, [appointments])

  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <SettingsPage
        title={
          <span className="flex flex-wrap items-center gap-3">
            {template.name}
            <TemplateStatusChip status={template.status} t={t} />
          </span>
        }
        description={t('settings.more2.forms.createdOn', { date: fmtDate(template.createdAt) })}
        actions={
          <>
            <PillMenu label={t('settings.common.options')} width={240} groups={menuGroups(template, { overview: false, afterDelete: () => navigate(FORMS_BASE) })} />
            {template.status === 'active' ? (
              <Button loading={busy} onClick={() => void deactivate(template)} data-testid="form-deactivate">
                {t('settings.frm.actions.deactivate')}
              </Button>
            ) : (
              <Button variant="primary" loading={busy} onClick={() => void activate(template)} data-testid="form-activate">
                {t('settings.frm.actions.activate')}
              </Button>
            )}
          </>
        }
      >
        <EditCard title={t('settings.more2.forms.stats')} testId="form-stats">
          <ul className="flex flex-col gap-4">
            {stats.map((row) => (
              <li key={row.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-body text-ink">{t(`settings.more2.forms.stat.${row.key}`)}</span>
                  <span className="text-body-strong text-ink">
                    {row.value} <span className="font-normal text-muted">({row.pct}%)</span>
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={row.pct} aria-valuemin={0} aria-valuemax={100} aria-label={t(`settings.more2.forms.stat.${row.key}`)}>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${row.pct}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-small text-muted">{t('settings.more2.forms.statsCaption')}</p>
        </EditCard>
        <EditCard title={t('settings.more2.forms.detailsCard')} onEdit={() => navigate(templatePath(template.id, 'edit'))}>
          <InfoGrid
            rows={[
              { key: 'r', label: t('settings.more2.forms.request'), value: requestLabel(t, template.request) },
              { key: 's', label: t('settings.more2.forms.services'), value: servicesLabel(t, template.serviceIds) },
              { key: 'g', label: t('settings.more2.forms.clientSignature'), value: t(template.signatureRequired ? 'settings.frm.values.required' : 'settings.frm.values.notRequired') },
              { key: 'f', label: t('settings.more2.forms.askComplete'), value: frequencyLabel(t, template.frequency) },
              { key: 'n', label: t('settings.more2.forms.sectionsLabel'), value: t('settings.frm.templates.sectionsCount', { count: template.sections.length }) },
            ]}
          />
        </EditCard>
        <EditCard
          title={t('settings.more2.forms.requests')}
          action={
            <Button size="sm" onClick={() => navigate(templatePath(template.id, 'preview'))}>
              {t('settings.frm.actions.preview')}
            </Button>
          }
        >
          {mine.length === 0 ? (
            <EmptyState icon={<Inbox size={24} aria-hidden />} title={t('settings.more2.forms.noRequestsTitle')} body={t('settings.more2.forms.noRequestsBody')} />
          ) : (
            <div className="-mx-5 overflow-x-auto md:-mx-6">
              <table className="w-full text-left text-body">
                <thead>
                  <tr className="border-y border-line text-small text-muted">
                    <th className="whitespace-nowrap px-5 py-2 font-semibold md:px-6">{t('settings.more2.forms.colClient')}</th>
                    <th className="whitespace-nowrap px-5 py-2 font-semibold md:px-6">{t('settings.more2.forms.colAppointment')}</th>
                    <th className="whitespace-nowrap px-5 py-2 font-semibold md:px-6">{t('settings.more2.forms.colSent')}</th>
                    <th className="whitespace-nowrap px-5 py-2 font-semibold md:px-6">{t('settings.more2.forms.colStatus')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {mine.slice(0, 20).map((r) => {
                    const date = apptDate(r.appointmentId)
                    return (
                      <tr key={r.id}>
                        <td className="px-5 py-3 md:px-6 text-ink">{clientName(r.clientId)}</td>
                        <td className="px-5 py-3 md:px-6 text-muted">{date ? fmtDate(date) : '-'}</td>
                        <td className="px-5 py-3 md:px-6 text-muted">{fmtDate(r.sentAt)}</td>
                        <td className="px-5 py-3 md:px-6">
                          <Chip tone={STATUS_TONE[r.status]}>{t(`settings.more2.forms.status.${r.status}`)}</Chip>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </EditCard>
      </SettingsPage>
    </div>
  )
}

/** Form preview modal over the templates list (settings-forms.md §1.3). */
export function FormPreviewPage() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const template = useDb((s) => s.formTemplates.find((f) => f.id === id))
  const close = () => navigate(FORMS_BASE)
  return (
    <>
      <FormTemplatesPage />
      <Modal open onClose={close} size="lg" title={t('settings.more2.forms.formPreview')} subtitle={template?.name}>
        {template ? (
          <FormRunner sections={template.sections} signatureRequired={template.signatureRequired} onClose={close} className="shadow-none" testId="template-preview" />
        ) : (
          <EmptyState title={t('settings.more2.forms.notFound')} action={<Button onClick={close}>{t('settings.more2.forms.backToTemplates')}</Button>} />
        )}
      </Modal>
    </>
  )
}

import { ClipboardCheck, ClipboardList } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, EmptyState } from '@/components/ui'
import { useDb } from '@/store/db'
import { ActionsPill, ActiveLabel, ListCard, ListRow, SettingsPage } from '../components/ui'
import { FORMS_BASE, requestLabel, templatePath } from './shared'
import { useFormTemplateActions } from './useFormTemplateActions'

/** Settings › Forms › Form templates (settings-forms.md §1). */
export function FormTemplatesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const templates = useDb((s) => s.formTemplates)
  const sorted = useMemo(() => [...templates].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [templates])
  const { menuGroups } = useFormTemplateActions()
  const add = () => navigate(`${FORMS_BASE}/create`)

  return (
    <SettingsPage
      title={t('settings.frm.templates.title')}
      description={t('settings.frm.templates.description')}
      learnMore={t('settings.frm.templates.title')}
      actions={
        <Button variant="primary" onClick={add} data-testid="form-templates-add">
          {t('settings.frm.templates.add')}
        </Button>
      }
    >
      {sorted.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<ClipboardCheck size={26} aria-hidden />}
            title={t('settings.frm.templates.emptyTitle')}
            body={t('settings.frm.templates.emptyBody')}
            action={
              <Button variant="primary" onClick={add}>
                {t('settings.frm.templates.emptyAction')}
              </Button>
            }
          />
        </div>
      ) : (
        <ListCard>
          {sorted.map((tpl) => (
            <ListRow
              key={tpl.id}
              testId={`form-template-${tpl.id}`}
              leading={<ClipboardList size={20} className="text-primary" aria-hidden />}
              title={tpl.name}
              subtitle={
                <span className="flex flex-wrap items-center gap-x-2">
                  <ActiveLabel active={tpl.status === 'active'} />
                  <span className="text-subtle" aria-hidden>
                    ·
                  </span>
                  <span>{t('settings.frm.templates.sectionsCount', { count: tpl.sections.length })}</span>
                  <span className="text-subtle" aria-hidden>
                    ·
                  </span>
                  <span>{requestLabel(t, tpl.request)}</span>
                </span>
              }
              onClick={() => navigate(templatePath(tpl.id, 'details'))}
              trailing={<ActionsPill groups={menuGroups(tpl, { afterDelete: () => undefined })} />}
            />
          ))}
        </ListCard>
      )}
    </SettingsPage>
  )
}

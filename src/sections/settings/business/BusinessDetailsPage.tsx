import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useWorkspace } from '../hooks'
import { AddLink, EditCard, InfoGrid, SettingsPage } from '../components/ui'
import { languageLabel } from './languages'

/** Settings › Business setup › Business details (settings-business-setup.md §1). */
export function BusinessDetailsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const workspace = useWorkspace()
  const edit = () => navigate('/setup/business-setup/business-details/edit')
  const link = (value: string) => (value ? <span className="text-ink">{value}</span> : <AddLink onClick={edit} />)

  return (
    <SettingsPage title={t('settings.biz.details.title')} description={t('settings.biz.details.description')} learnMore="Business details">
      <EditCard title={t('settings.biz.details.businessInfo')} onEdit={edit} testId="business-info-card">
        <InfoGrid
          rows={[
            { label: t('settings.biz.details.businessName'), value: workspace.name },
            { label: t('settings.biz.details.country'), value: workspace.country },
            { label: t('settings.biz.details.currency'), value: workspace.currency },
            { label: t('settings.biz.details.taxCalculation'), value: t(workspace.taxCalculation === 'inclusive' ? 'settings.biz.details.taxInclusive' : 'settings.biz.details.taxExclusive') },
            { label: t('settings.biz.details.teamLanguage'), value: languageLabel(workspace.teamLanguage) },
            { label: t('settings.biz.details.clientLanguage'), value: languageLabel(workspace.clientLanguage) },
          ]}
        />
        <div className="mt-6 border-t border-line pt-6">
          <h3 className="font-display text-title-3 text-ink">{t('settings.biz.details.externalLinks')}</h3>
          <div className="mt-4">
            <InfoGrid
              rows={[
                { label: t('settings.biz.links.facebook'), value: link(workspace.externalLinks.facebook) },
                { label: t('settings.biz.links.x'), value: link(workspace.externalLinks.x) },
                { label: t('settings.biz.links.instagram'), value: link(workspace.externalLinks.instagram) },
                { label: t('settings.biz.links.website'), value: link(workspace.externalLinks.website) },
              ]}
            />
          </div>
        </div>
      </EditCard>
    </SettingsPage>
  )
}

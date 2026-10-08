import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useDb } from '@/store/db'
import type { Automation } from '@/types'
import { Button, Checkbox, EmptyState, Field, Menu, MenuButton, TextArea, confirm, toast } from '@/components/ui'
import { updateAutomation } from '@/api/marketing'
import { EmailMock } from '../components/kit'
import { AutomationEmailBody, useAutomationCopy, useAutomationSample } from '../automationContent'

export function AutomationEmailPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const automation = useDb((s) => s.automations.find((a) => a.id === id))
  const sample = useAutomationSample()
  const copy = useAutomationCopy()
  const [content, setContent] = useState<Automation['content']>(automation?.content ?? { importantInfo: '', displayPrice: true })
  const [saving, setSaving] = useState(false)

  if (!automation) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState title={t('marketing.automationDetail.notFound')} action={<Button onClick={() => navigate('/marketing/automated-messages')}>{t('marketing.automationDetail.backToList')}</Button>} />
      </div>
    )
  }

  const back = `/marketing/automated-messages/configure/${automation.id}`
  const dirty = content.importantInfo !== automation.content.importantInfo || content.displayPrice !== automation.content.displayPrice
  const close = async () => {
    if (dirty && !(await confirm({ title: t('marketing.configure.discard.title'), body: t('marketing.configure.discard.body'), confirmLabel: t('marketing.configure.discard.confirm'), tone: 'danger' }))) return
    navigate(back)
  }
  const save = async () => {
    setSaving(true)
    try {
      await updateAutomation(automation.id, { content })
      toast(t('marketing.emailEditor.saved'))
      navigate(back)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-6">
        <h1 className="font-display text-title-3 text-ink">{t('marketing.emailEditor.title')}</h1>
        <div className="flex items-center gap-2">
          <Menu
            width={200}
            trigger={({ open, toggle }) => (
              <MenuButton open={open} toggle={toggle}>
                {t('marketing.common.options')}
              </MenuButton>
            )}
            groups={[
              {
                items: [
                  {
                    label: t('marketing.emailEditor.reset'),
                    onSelect: () => {
                      setContent({ importantInfo: '', displayPrice: true })
                      toast(t('marketing.emailEditor.resetDone'))
                    },
                  },
                ],
              },
            ]}
          />
          <Button onClick={() => void close()}>{t('marketing.common.close')}</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()} data-testid="email-save">
            {t('marketing.common.save')}
          </Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="w-full shrink-0 border-b border-line bg-surface p-8 lg:w-[480px] lg:border-b-0 lg:border-r">
          <h2 className="font-display text-title-2 text-ink">{t('marketing.emailEditor.details')}</h2>
          <p className="mt-1 text-body text-muted">{automation.description}</p>
          <Checkbox className="mt-6" label={t('marketing.emailEditor.displayPrice')} checked={content.displayPrice} onChange={(displayPrice) => setContent({ ...content, displayPrice })} />
          <Field className="mt-6" label={t('marketing.emailEditor.importantInfo')} counter={{ value: content.importantInfo.length, max: 1500 }} hint={t('marketing.emailEditor.importantInfoHint')}>
            {(fid) => <TextArea id={fid} rows={5} maxLength={1500} value={content.importantInfo} placeholder={t('marketing.emailEditor.importantInfoPlaceholder')} onChange={(e) => setContent({ ...content, importantInfo: e.target.value })} />}
          </Field>
        </aside>
        <div className="min-h-0 flex-1 overflow-y-auto bg-sunken/50 p-6 lg:p-10">
          <EmailMock className="mx-auto max-w-[820px]" subject={copy.subject(automation, sample)} fromName={sample.business} fromEmail={sample.businessEmail}>
            <AutomationEmailBody automation={automation} sample={sample} content={content} />
          </EmailMock>
        </div>
      </div>
    </div>
  )
}

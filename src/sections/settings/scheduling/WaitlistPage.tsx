import { ArrowRight, MousePointerClick, Zap } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Checkbox, LearnMore, RadioGroup } from '@/components/ui'
import { updateSettings } from '@/api/settings'
import type { Settings } from '@/types'
import { useSettings } from '../hooks'
import { Banner, EditCard, FormCard, FormStack, InfoGrid, SettingsPage } from '../components/ui'
import { FullModal } from '../components/FullModal'
import { useAction, useDraft } from '../components/useAction'
import { FormHeading, RadioCards, RadioRow } from './shared'

const K = 'settings.sched.waitlist'
type Waitlist = Settings['waitlist']

/** Settings › Scheduling › Waitlist appointments (settings-scheduling.md §2). */
export function WaitlistPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const waitlist = useSettings().waitlist
  const [editing, setEditing] = useState(false)
  const online = waitlist.online ? `${t('settings.common.active')} • ${t(waitlist.anyTime ? `${K}.requestAny` : `${K}.requestOpen`)}` : t('settings.common.inactive')

  return (
    <SettingsPage title={t(`${K}.title`)} description={t(`${K}.description`)} learnMore="Waitlist">
      <EditCard title={t(`${K}.settingsCard`)} onEdit={() => setEditing(true)} testId="waitlist-card">
        <InfoGrid
          rows={[
            { label: t(`${K}.type`), value: t(`${K}.types.${waitlist.type}.label`) },
            { label: t(`${K}.priority`), value: t(`${K}.priorities.${waitlist.priority}.label`) },
            { label: t(`${K}.onlineBookings`), value: online },
          ]}
        />
        <div className="mt-8 border-t border-line pt-8">
          <p className="text-body-strong text-ink">{t(`${K}.notifications`)}</p>
          <p className="mt-0.5 text-body text-muted">
            {t(`${K}.notificationsText`)}{' '}
            <button type="button" className="text-primary hover:underline" onClick={() => navigate('/marketing/automated-messages')}>
              {t(`${K}.automatedMessages`)}
            </button>
          </p>
        </div>
      </EditCard>
      {editing && <WaitlistModal onClose={() => setEditing(false)} />}
    </SettingsPage>
  )
}

function WaitlistModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const settings = useSettings()
  const [draft, patch] = useDraft<Waitlist>(settings.waitlist)
  const [saving, run] = useAction()
  const [enabling, runEnable] = useAction()
  const save = () =>
    run(
      () =>
        updateSettings((s) => {
          s.waitlist = { ...draft }
        }),
      t(`${K}.saved`),
      onClose,
    )
  const enableOnline = () =>
    runEnable(
      () =>
        updateSettings((s) => {
          s.onlineBookingsEnabled = true
        }),
      t(`${K}.onlineEnabled`),
    )

  return (
    <FullModal
      open
      onClose={onClose}
      title={t(`${K}.modalTitle`)}
      subtitle={
        <>
          {t(`${K}.description`)} <LearnMore topic="Waitlist">{t('settings.common.learnMore')}</LearnMore>
        </>
      }
      onSave={save}
      saving={saving}
      testId="waitlist-modal"
    >
      <FormStack>
        <FormCard>
          <FormHeading title={t(`${K}.selectType`)} description={t(`${K}.selectTypeHint`)} />
          <RadioCards<Waitlist['type']>
            name="waitlist-type"
            value={draft.type}
            onChange={(type) => patch({ type })}
            options={(['manual', 'auto'] as const).map((v) => ({
              value: v,
              label: t(`${K}.types.${v}.label`),
              hint: t(`${K}.types.${v}.hint`),
              icon: v === 'manual' ? <MousePointerClick size={24} aria-hidden /> : <Zap size={24} aria-hidden />,
            }))}
          />
          <div className="flex flex-col gap-4">
            <FormHeading level="label" title={t(`${K}.priority`)} description={t(`${K}.priorityHint`)} />
            <RadioGroup<Waitlist['priority']>
              value={draft.priority}
              onChange={(priority) => patch({ priority })}
              options={(['first', 'highest_value', 'all'] as const).map((v) => ({ value: v, label: t(`${K}.priorities.${v}.label`), hint: t(`${K}.priorities.${v}.hint`) }))}
            />
          </div>
          {!settings.onlineBookingsEnabled && (
            <Banner tone="warning">
              <p>{t(`${K}.onlineDisabled`)}</p>
              <button type="button" onClick={enableOnline} disabled={enabling} className="mt-2 inline-flex items-center gap-2 text-body-strong text-ink hover:underline disabled:opacity-60" data-testid="enable-online-bookings">
                {t(`${K}.enableOnline`)}
                <ArrowRight size={16} aria-hidden />
              </button>
            </Banner>
          )}
        </FormCard>
        <FormCard>
          <Checkbox checked={draft.online} onChange={(online) => patch({ online })} label={t(`${K}.allowOnline`)} hint={t(`${K}.allowOnlineHint`)} />
          {draft.online && (
            <div className="ml-8 flex flex-col gap-4">
              <RadioRow name="waitlist-online" checked={draft.anyTime} onSelect={() => patch({ anyTime: true })} label={t(`${K}.anyTime`)} hint={t(`${K}.anyTimeHint`)} />
              <RadioRow
                name="waitlist-online"
                checked={!draft.anyTime}
                onSelect={() => patch({ anyTime: false })}
                label={t(`${K}.openOnly`)}
                hint={
                  <>
                    {t(`${K}.openOnlyHint`)}{' '}
                    <button type="button" className="text-primary hover:underline" onClick={() => navigate('/setup/business-setup/location-details')}>
                      {t(`${K}.locations`)}
                    </button>
                  </>
                }
              />
            </div>
          )}
        </FormCard>
      </FormStack>
    </FullModal>
  )
}

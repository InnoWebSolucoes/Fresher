import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Checkbox, Field, LearnMore, Select } from '@/components/ui'
import { updateSettings } from '@/api/settings'
import type { Settings, Weekday } from '@/types'
import { useSettings } from '../hooks'
import { EditCard, FormCard, InfoGrid, SettingsPage } from '../components/ui'
import { FullModal } from '../components/FullModal'
import { useAction, useDraft } from '../components/useAction'
import { TIME_ZONES, WEEK_SUNDAY_FIRST, weekdayName } from './options'

const K = 'settings.sched.time'
const COLOR_SOURCES: Settings['calendar']['colorSource'][] = ['team_member', 'category', 'status', 'resource']

/** Settings › Scheduling › Time and calendar (settings-scheduling.md §1). */
export function TimeCalendarPage() {
  const { t } = useTranslation()
  const settings = useSettings()
  const [editing, setEditing] = useState<null | 'time' | 'calendar'>(null)
  const enabled = (on: boolean) => t(on ? 'settings.common.enabled' : 'settings.common.disabled')

  return (
    <SettingsPage title={t(`${K}.title`)} description={t(`${K}.description`)} learnMore="Time and calendar settings">
      <EditCard title={t(`${K}.dateTimeCard`)} onEdit={() => setEditing('time')} testId="date-time-card">
        <InfoGrid
          rows={[
            { label: t(`${K}.timeZone`), value: settings.timezone },
            { label: t(`${K}.timeFormat`), value: t(`${K}.format.${settings.timeFormat}`) },
            { label: t(`${K}.firstDay`), value: weekdayName(t, settings.firstDayOfWeek) },
          ]}
        />
        <p className="mt-6 rounded-lg border border-line bg-sunken/60 px-5 py-4 text-body text-ink">{t(`${K}.dstNote`)}</p>
      </EditCard>

      <EditCard title={t(`${K}.calendarCard`)} onEdit={() => setEditing('calendar')} testId="calendar-settings-card">
        <InfoGrid
          rows={[
            { label: t(`${K}.colorSource`), value: t(`${K}.colorSources.${settings.calendar.colorSource}`) },
            { label: t(`${K}.displayProcessing`), value: enabled(settings.calendar.displayProcessing) },
            { label: t(`${K}.displayBlocked`), value: enabled(settings.calendar.displayBlocked) },
          ]}
        />
      </EditCard>

      {editing === 'time' && <TimeModal onClose={() => setEditing(null)} />}
      {editing === 'calendar' && <CalendarModal onClose={() => setEditing(null)} />}
    </SettingsPage>
  )
}

function TimeModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const settings = useSettings()
  const [draft, patch] = useDraft({ timezone: settings.timezone, timeFormat: settings.timeFormat, firstDayOfWeek: settings.firstDayOfWeek })
  const [saving, run] = useAction()
  const zones = TIME_ZONES.includes(draft.timezone) ? TIME_ZONES : [draft.timezone, ...TIME_ZONES]
  const save = () =>
    run(
      () =>
        updateSettings((s) => {
          s.timezone = draft.timezone
          s.timeFormat = draft.timeFormat
          s.firstDayOfWeek = draft.firstDayOfWeek
        }),
      t(`${K}.savedTime`),
      onClose,
    )
  return (
    <FullModal open onClose={onClose} title={t(`${K}.timeModalTitle`)} onSave={save} saving={saving} testId="time-modal">
      <FormCard>
        <Field label={t(`${K}.timeZone`)}>{(id) => <Select id={id} value={draft.timezone} onChange={(e) => patch({ timezone: e.target.value })} options={zones} />}</Field>
        <Field label={t(`${K}.timeFormat`)}>
          {(id) => (
            <Select
              id={id}
              value={draft.timeFormat}
              onChange={(e) => patch({ timeFormat: e.target.value as Settings['timeFormat'] })}
              options={[
                { value: '12h', label: t(`${K}.format.12h`) },
                { value: '24h', label: t(`${K}.format.24h`) },
              ]}
            />
          )}
        </Field>
        <Field label={t(`${K}.firstDay`)}>
          {(id) => (
            <Select
              id={id}
              value={String(draft.firstDayOfWeek)}
              onChange={(e) => patch({ firstDayOfWeek: Number(e.target.value) as Weekday })}
              options={WEEK_SUNDAY_FIRST.map((d) => ({ value: String(d), label: weekdayName(t, d) }))}
            />
          )}
        </Field>
      </FormCard>
    </FullModal>
  )
}

function CalendarModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const settings = useSettings()
  const [draft, patch] = useDraft(settings.calendar)
  const [saving, run] = useAction()
  const save = () =>
    run(
      () =>
        updateSettings((s) => {
          s.calendar = { ...draft }
        }),
      t(`${K}.savedCalendar`),
      onClose,
    )
  return (
    <FullModal open onClose={onClose} title={t(`${K}.calendarCard`)} onSave={save} saving={saving} testId="calendar-modal">
      <FormCard>
        <Field label={t(`${K}.colorSource`)}>
          {(id) => (
            <Select
              id={id}
              value={draft.colorSource}
              onChange={(e) => patch({ colorSource: e.target.value as Settings['calendar']['colorSource'] })}
              options={COLOR_SOURCES.map((c) => ({ value: c, label: t(`${K}.colorSources.${c}`) }))}
            />
          )}
        </Field>
        <Checkbox
          checked={draft.displayProcessing}
          onChange={(v) => patch({ displayProcessing: v })}
          label={t(`${K}.processingLabel`)}
          hint={
            <>
              {t(`${K}.processingHint`)} <LearnMore topic="Processing time">{t('settings.common.learnMore')}</LearnMore>
            </>
          }
        />
        <Checkbox
          checked={draft.displayBlocked}
          onChange={(v) => patch({ displayBlocked: v })}
          label={t(`${K}.blockedLabel`)}
          hint={
            <>
              {t(`${K}.blockedHint`)} <LearnMore topic="Blocked time">{t('settings.common.learnMore')}</LearnMore>
            </>
          }
        />
      </FormCard>
    </FullModal>
  )
}

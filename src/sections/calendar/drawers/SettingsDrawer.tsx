import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Switch, toast } from '@/components/ui'
import type { DrawerProps } from '@/app/sectionRegistry'
import { saveCalendarSettings } from '@/api/calendar'
import { useDb } from '@/store/db'
import type { Settings } from '@/types'
import { DrawerShell } from './Shell'

const ZOOMS: Settings['calendarZoom'][] = [48, 96, 144, 288]

/** "Your calendar settings" (calendar.md §4): zoom and quick actions, applied together. */
export function SettingsDrawer({ close }: DrawerProps) {
  const { t } = useTranslation()
  const zoom = useDb((s) => s.settings.calendarZoom)
  const quick = useDb((s) => s.settings.quickActions)
  const [z, setZ] = useState(Math.max(0, ZOOMS.indexOf(zoom)))
  const [q, setQ] = useState(quick)
  const [busy, setBusy] = useState(false)
  const pct = (z / (ZOOMS.length - 1)) * 100
  return (
    <DrawerShell
      testId="calendar-settings-drawer"
      title={t('calendar.settings.title')}
      footer={
        <Button
          variant="primary"
          size="lg"
          className="w-full rounded-full"
          loading={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await saveCalendarSettings({ calendarZoom: ZOOMS[z], quickActions: q })
              toast(t('calendar.toasts.settingsSaved'))
              close()
            } finally {
              setBusy(false)
            }
          }}
          data-testid="settings-apply"
        >
          {t('calendar.settings.apply')}
        </Button>
      }
    >
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-body-lg font-semibold text-ink">{t('calendar.settings.zoom')}</span>
        <span className="text-body text-ink" data-testid="zoom-label">
          {t(`calendar.settings.zoomLevels.${z}`)}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={ZOOMS.length - 1}
        step={1}
        value={z}
        onChange={(e) => setZ(Number(e.target.value))}
        className="mt-4 h-1.5 w-full cursor-pointer appearance-none rounded-full accent-[rgb(var(--primary))]"
        style={{ background: `linear-gradient(to right, rgb(var(--primary)) ${pct}%, rgb(var(--border)) ${pct}%)` }}
        aria-label={t('calendar.settings.zoom')}
        aria-valuetext={t(`calendar.settings.zoomLevels.${z}`)}
        data-testid="zoom-slider"
      />
      <div className="my-7 border-t border-line" />
      <Switch checked={q} onChange={setQ} label={t('calendar.settings.quick')} hint={t('calendar.settings.quickHint')} />
    </DrawerShell>
  )
}

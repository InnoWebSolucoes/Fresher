import { endOfMonth, endOfQuarter, endOfYear, parseISO, startOfMonth, startOfQuarter, startOfWeek, startOfYear, subDays, subMonths, subYears, addDays, addMonths, endOfWeek, subWeeks } from 'date-fns'
import { format } from '@/lib/dates'
import { CalendarDays } from 'lucide-react'
import i18n from 'i18next'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDismiss } from '@/lib/useDismiss'
import { now, toISODate } from '@/lib/time'
import { Button } from './Button'
import { Select } from './form'

export type PresetKey =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_30_days'
  | 'last_90_days'
  | 'last_week'
  | 'last_month'
  | 'last_3_months'
  | 'last_6_months'
  | 'last_year'
  | 'week_to_date'
  | 'month_to_date'
  | 'quarter_to_date'
  | 'year_to_date'
  | 'tomorrow'
  | 'next_7_days'
  | 'next_month'
  | 'next_30_days'
  | 'all_time'
  | 'custom'

/** Preset names in the current language (getters, so each read is translated). */
export const PRESET_LABELS: Record<PresetKey, string> = {
  get today() { return i18n.t('reports.range.today') },
  get yesterday() { return i18n.t('reports.range.yesterday') },
  get last_7_days() { return i18n.t('reports.range.last_7_days') },
  get last_30_days() { return i18n.t('reports.range.last_30_days') },
  get last_90_days() { return i18n.t('reports.range.last_90_days') },
  get last_week() { return i18n.t('reports.range.last_week') },
  get last_month() { return i18n.t('reports.range.last_month') },
  get last_3_months() { return i18n.t('reports.range.last_3_months') },
  get last_6_months() { return i18n.t('reports.range.last_6_months') },
  get last_year() { return i18n.t('reports.range.last_year') },
  get week_to_date() { return i18n.t('reports.range.week_to_date') },
  get month_to_date() { return i18n.t('reports.range.month_to_date') },
  get quarter_to_date() { return i18n.t('reports.range.quarter_to_date') },
  get year_to_date() { return i18n.t('reports.range.year_to_date') },
  get tomorrow() { return i18n.t('reports.range.tomorrow') },
  get next_7_days() { return i18n.t('reports.range.next_7_days') },
  get next_month() { return i18n.t('reports.range.next_month') },
  get next_30_days() { return i18n.t('reports.range.next_30_days') },
  get all_time() { return i18n.t('reports.range.all_time') },
  get custom() { return i18n.t('reports.range.custom') },
}

export interface DateRangeValue {
  preset: PresetKey
  from: string
  to: string
}

/** Resolve a preset to concrete yyyy-MM-dd dates relative to the demo "now". */
export function resolvePreset(preset: PresetKey, custom?: { from: string; to: string }): DateRangeValue {
  const today = now()
  const r = (from: Date, to: Date): DateRangeValue => ({ preset, from: toISODate(from), to: toISODate(to) })
  switch (preset) {
    case 'today':
      return r(today, today)
    case 'yesterday':
      return r(subDays(today, 1), subDays(today, 1))
    case 'last_7_days':
      return r(subDays(today, 6), today)
    case 'last_30_days':
      return r(subDays(today, 29), today)
    case 'last_90_days':
      return r(subDays(today, 89), today)
    case 'last_week':
      return r(startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 }), endOfWeek(subWeeks(today, 1), { weekStartsOn: 1 }))
    case 'last_month':
      return r(startOfMonth(subMonths(today, 1)), endOfMonth(subMonths(today, 1)))
    case 'last_3_months':
      return r(subMonths(today, 3), today)
    case 'last_6_months':
      return r(subMonths(today, 6), today)
    case 'last_year':
      return r(startOfYear(subYears(today, 1)), endOfYear(subYears(today, 1)))
    case 'week_to_date':
      return r(startOfWeek(today, { weekStartsOn: 1 }), today)
    case 'month_to_date':
      return r(startOfMonth(today), today)
    case 'quarter_to_date':
      return r(startOfQuarter(today), today)
    case 'year_to_date':
      return r(startOfYear(today), today)
    case 'tomorrow':
      return r(addDays(today, 1), addDays(today, 1))
    case 'next_7_days':
      return r(today, addDays(today, 6))
    case 'next_month':
      return r(startOfMonth(addMonths(today, 1)), endOfMonth(addMonths(today, 1)))
    case 'next_30_days':
      return r(today, addDays(today, 29))
    case 'all_time':
      return r(subYears(today, 5), addYears5(today))
    case 'custom':
      return { preset, from: custom?.from ?? toISODate(today), to: custom?.to ?? toISODate(today) }
  }
  void endOfQuarter
}

function addYears5(d: Date) {
  return addMonths(d, 60)
}

export function rangeLabel(value: DateRangeValue): string {
  if (value.preset !== 'custom') return PRESET_LABELS[value.preset]
  return `${format(parseISO(value.from), 'MMM d, yyyy')} - ${format(parseISO(value.to), 'MMM d, yyyy')}`
}

/** "Date range" pill with presets, Starting/Ending date fields, Cancel/Apply. */
export function DateRangeButton({ value, onChange, presets }: { value: DateRangeValue; onChange: (v: DateRangeValue) => void; presets: PresetKey[] }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss([ref], open, () => setOpen(false))
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setDraft(value)
          setOpen((o) => !o)
        }}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-body-strong text-ink hover:bg-sunken"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CalendarDays size={16} aria-hidden />
        {rangeLabel(value)}
        <span aria-hidden className="text-[10px]">▼</span>
      </button>
      {open && (
        <div role="dialog" aria-label={t('reports.range.label')} className="absolute left-0 top-full z-[60] mt-2 w-[360px] rounded-lg border border-line bg-raised p-5 shadow-md">
          <label className="label">{t('reports.range.label')}</label>
          <Select
            value={draft.preset}
            onChange={(e) => setDraft(resolvePreset(e.target.value as PresetKey, draft))}
            options={[...presets, 'custom'].map((p) => ({ value: p, label: PRESET_LABELS[p as PresetKey] }))}
          />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t('reports.range.from')}</label>
              <input type="date" className="input" value={draft.from} onChange={(e) => setDraft({ preset: 'custom', from: e.target.value, to: draft.to })} />
            </div>
            <div>
              <label className="label">{t('reports.range.to')}</label>
              <input type="date" className="input" value={draft.to} onChange={(e) => setDraft({ preset: 'custom', from: draft.from, to: e.target.value })} />
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              onClick={() => {
                onChange(draft)
                setOpen(false)
              }}
            >
              {t('reports.page.apply')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

import { endOfWeek, startOfMonth, startOfWeek, startOfYear, subDays, subWeeks } from 'date-fns'
import { format } from '@/lib/dates'
import { CalendarDays } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { now } from '@/lib/time'
import { Button, Select } from '@/components/ui'
import { Popover } from './common'
import { rangeLabel } from '../lib/shifts'

export type RangePreset = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'month_to_date' | 'year_to_date' | 'last_30_days' | 'custom'
export interface RangeValue {
  preset: RangePreset
  from: string
  to: string
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd')

export function resolveRange(preset: RangePreset, custom?: { from: string; to: string }): RangeValue {
  const today = now()
  const r = (from: Date, to: Date): RangeValue => ({ preset, from: iso(from), to: iso(to) })
  switch (preset) {
    case 'today':
      return r(today, today)
    case 'yesterday':
      return r(subDays(today, 1), subDays(today, 1))
    case 'this_week':
      return r(startOfWeek(today, { weekStartsOn: 1 }), endOfWeek(today, { weekStartsOn: 1 }))
    case 'last_week':
      return r(startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 }), endOfWeek(subWeeks(today, 1), { weekStartsOn: 1 }))
    case 'month_to_date':
      return r(startOfMonth(today), today)
    case 'year_to_date':
      return r(startOfYear(today), today)
    case 'last_30_days':
      return r(subDays(today, 29), today)
    case 'custom':
      return { preset, from: custom?.from ?? iso(today), to: custom?.to ?? iso(today) }
  }
}

/** Date range pill with presets and Starting/Ending dates (timesheets, settlements). */
export function RangePicker({ value, onChange, presets }: { value: RangeValue; onChange: (v: RangeValue) => void; presets: RangePreset[] }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(value)
  const label = value.preset === 'custom' ? rangeLabel(value.from, value.to) : t(`team.range.${value.preset}`)
  return (
    <Popover
      className="w-[310px] md:w-[340px]"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => {
            setDraft(value)
            toggle()
          }}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-body-strong text-ink hover:bg-sunken"
        >
          <CalendarDays size={16} aria-hidden />
          {label}
          <span aria-hidden className="text-[10px]">▼</span>
        </button>
      )}
    >
      {(close) => (
        <div role="dialog" aria-label={t('team.range.label')}>
          <label className="label" htmlFor="range-preset">
            {t('team.range.label')}
          </label>
          <Select id="range-preset" value={draft.preset} onChange={(e) => setDraft(resolveRange(e.target.value as RangePreset, draft))} options={[...presets, 'custom'].map((p) => ({ value: p, label: t(`team.range.${p}`) }))} />
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="range-from">
                {t('team.range.from')}
              </label>
              <input id="range-from" type="date" className="input" value={draft.from} onChange={(e) => e.target.value && setDraft({ preset: 'custom', from: e.target.value, to: draft.to < e.target.value ? e.target.value : draft.to })} />
            </div>
            <div>
              <label className="label" htmlFor="range-to">
                {t('team.range.to')}
              </label>
              <input id="range-to" type="date" className="input" min={draft.from} value={draft.to} onChange={(e) => e.target.value && setDraft({ preset: 'custom', from: draft.from, to: e.target.value })} />
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button onClick={close}>{t('team.common.cancel')}</Button>
            <Button
              variant="primary"
              onClick={() => {
                onChange(draft)
                close()
              }}
            >
              {t('team.common.apply')}
            </Button>
          </div>
        </div>
      )}
    </Popover>
  )
}

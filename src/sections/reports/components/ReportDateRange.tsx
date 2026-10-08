import clsx from 'clsx'
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, isSameMonth, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import { format } from '@/lib/dates'
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Select, resolvePreset, type DateRangeValue, type PresetKey } from '@/components/ui'
import { todayISO } from '@/lib/time'
import { Pill, Popover } from './Popover'

/** Presets of the report date popover (reports.md §2.3). */
export const RANGE_PRESETS: PresetKey[] = ['today', 'yesterday', 'last_7_days', 'last_30_days', 'last_90_days', 'last_week', 'last_month', 'last_3_months', 'last_6_months', 'last_year', 'week_to_date', 'month_to_date', 'quarter_to_date', 'year_to_date', 'all_time']

const iso = (d: Date) => format(d, 'yyyy-MM-dd')
const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(parseISO(v).getTime())

export function rangeText(t: (k: string, o?: Record<string, unknown>) => string, value: DateRangeValue, single: boolean): string {
  if (single) return format(parseISO(value.from), 'd MMM yyyy')
  if (value.preset !== 'custom') return t(`reports.range.${value.preset}`)
  return `${format(parseISO(value.from), 'd MMM yyyy')} - ${format(parseISO(value.to), 'd MMM yyyy')}`
}

/**
 * Date range pill and popover: Date range select, Starting/Ending date
 * fields, a two-month calendar with ‹ › and Cancel / Apply (reports.md §2.3).
 * `single` turns it into a single-date picker (Customize › Date picker type).
 */
export function ReportDateRange({ value, onChange, single = false }: { value: DateRangeValue; onChange: (v: DateRangeValue) => void; single?: boolean }) {
  const { t } = useTranslation()
  return (
    <Popover
      label={t('reports.range.label')}
      className="w-[700px] max-w-[calc(100vw-2rem)]"
      trigger={({ open, toggle }) => (
        <Pill open={open} onClick={toggle}>
          {rangeText(t, value, single)}
          <ChevronDown size={16} className={clsx('transition-transform', open && 'rotate-180')} aria-hidden />
        </Pill>
      )}
    >
      {(close) => <RangePanel value={value} single={single} onCancel={close} onApply={(v) => { onChange(v); close() }} />}
    </Popover>
  )
}

function RangePanel({ value, single, onCancel, onApply }: { value: DateRangeValue; single: boolean; onCancel: () => void; onApply: (v: DateRangeValue) => void }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<DateRangeValue>(single ? { preset: 'custom', from: value.from, to: value.from } : value)
  const [fromText, setFromText] = useState(draft.from)
  const [toText, setToText] = useState(draft.to)
  const [picking, setPicking] = useState<'from' | 'to'>('from')
  const initialMonth = value.preset === 'all_time' ? parseISO(todayISO()) : parseISO(single ? value.from : value.to)
  const [month, setMonth] = useState(() => startOfMonth(addMonths(initialMonth, single ? 0 : -1)))

  const set = (next: DateRangeValue) => {
    setDraft(next)
    setFromText(next.from)
    setToText(next.to)
  }
  const pickPreset = (preset: PresetKey) => {
    const next = resolvePreset(preset)
    set(next)
    setMonth(startOfMonth(addMonths(parseISO(preset === 'all_time' ? todayISO() : next.to), -1)))
  }
  const clickDay = (day: string) => {
    if (single) return set({ preset: 'custom', from: day, to: day })
    if (picking === 'from' || day < draft.from) {
      set({ preset: 'custom', from: day, to: day })
      setPicking('to')
    } else {
      set({ preset: 'custom', from: draft.from, to: day })
      setPicking('from')
    }
  }
  const typed = (side: 'from' | 'to', text: string) => {
    if (side === 'from') setFromText(text)
    else setToText(text)
    if (!isIsoDate(text)) return
    const next = side === 'from' ? { preset: 'custom' as const, from: text, to: single ? text : text > draft.to ? text : draft.to } : { preset: 'custom' as const, from: text < draft.from ? text : draft.from, to: text }
    setDraft(next)
    if (side === 'from' && single) setToText(text)
  }
  const invalid = !isIsoDate(fromText) || (!single && !isIsoDate(toText)) || draft.from > draft.to
  const months = single ? [month] : [month, addMonths(month, 1)]

  return (
    <div>
      <div className="flex flex-col gap-4 p-5">
        {!single && (
          <div>
            <label className="label" htmlFor="report-range-preset">
              {t('reports.range.label')}
            </label>
            <Select
              id="report-range-preset"
              value={draft.preset}
              onChange={(e) => pickPreset(e.target.value as PresetKey)}
              options={[...RANGE_PRESETS.map((p) => ({ value: p, label: t(`reports.range.${p}`) })), ...(draft.preset === 'custom' ? [{ value: 'custom', label: t('reports.range.custom') }] : [])]}
            />
          </div>
        )}
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="label" htmlFor="report-range-from">
              {single ? t('reports.range.date') : t('reports.range.from')}
            </label>
            <input id="report-range-from" className={clsx('input', !isIsoDate(fromText) && 'border-danger')} value={fromText} placeholder={t('reports.range.isoPlaceholder')} onChange={(e) => typed('from', e.target.value)} onFocus={() => setPicking('from')} />
          </div>
          {!single && (
            <>
              <ArrowRight size={18} className="mb-3 shrink-0 text-muted" aria-hidden />
              <div className="flex-1">
                <label className="label" htmlFor="report-range-to">
                  {t('reports.range.to')}
                </label>
                <input id="report-range-to" className={clsx('input', !isIsoDate(toText) && 'border-danger')} value={toText} placeholder={t('reports.range.isoPlaceholder')} onChange={(e) => typed('to', e.target.value)} onFocus={() => setPicking('to')} />
              </div>
            </>
          )}
        </div>
        <div className="flex gap-8">
          {months.map((m, i) => (
            <MonthGrid
              key={m.toISOString()}
              month={m}
              from={draft.from}
              to={draft.to}
              onPick={clickDay}
              prev={i === 0 ? () => setMonth(addMonths(month, -1)) : undefined}
              next={i === months.length - 1 ? () => setMonth(addMonths(month, 1)) : undefined}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
        {invalid && <p className="mr-auto text-small text-danger">{t('reports.range.invalid')}</p>}
        <Button variant="ghost" onClick={onCancel}>
          {t('reports.common.cancel')}
        </Button>
        <Button variant="primary" disabled={invalid} onClick={() => onApply(draft)}>
          {t('reports.page.apply')}
        </Button>
      </div>
    </div>
  )
}

function MonthGrid({ month, from, to, onPick, prev, next }: { month: Date; from: string; to: string; onPick: (day: string) => void; prev?: () => void; next?: () => void }) {
  const { t } = useTranslation()
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) })
  const today = todayISO()
  const weekdays = t('reports.range.weekdays', { returnObjects: true }) as string[]
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-2 flex h-9 items-center justify-between">
        {prev ? (
          <button type="button" className="icon-btn h-9 w-9" aria-label={t('reports.range.prevMonth')} onClick={prev}>
            <ChevronLeft size={18} aria-hidden />
          </button>
        ) : (
          <span className="w-9" />
        )}
        <p className="text-body-strong text-ink">{format(month, 'MMMM yyyy')}</p>
        {next ? (
          <button type="button" className="icon-btn h-9 w-9" aria-label={t('reports.range.nextMonth')} onClick={next}>
            <ChevronRight size={18} aria-hidden />
          </button>
        ) : (
          <span className="w-9" />
        )}
      </div>
      <div className="grid grid-cols-7 text-center">
        {weekdays.map((w) => (
          <span key={w} className="py-1 text-small text-muted">
            {w}
          </span>
        ))}
        {days.map((d) => {
          const day = iso(d)
          const inMonth = isSameMonth(d, month)
          const edge = day === from || day === to
          const within = day > from && day < to
          return inMonth ? (
            <button
              key={day}
              type="button"
              aria-label={format(d, 'EEEE, d MMMM yyyy')}
              aria-pressed={edge}
              onClick={() => onPick(day)}
              className={clsx('relative h-10 text-body tabular', within && 'bg-primary-subtle', day === from && to > from && 'rounded-l-full bg-primary-subtle', day === to && to > from && 'rounded-r-full bg-primary-subtle')}
            >
              <span className={clsx('mx-auto flex h-9 w-9 items-center justify-center rounded-full', edge ? 'bg-primary font-semibold text-on-primary' : day === today ? 'ring-1 ring-line-strong' : 'hover:bg-sunken')}>{d.getDate()}</span>
            </button>
          ) : (
            <span key={day} className="h-10" aria-hidden />
          )
        })}
      </div>
    </div>
  )
}

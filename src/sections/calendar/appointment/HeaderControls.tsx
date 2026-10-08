import clsx from 'clsx'
import { parseISO } from 'date-fns'
import { format } from '@/lib/dates'
import { ArrowLeft, ChevronDown } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Field, Select, TextInput } from '@/components/ui'
import type { ISODate, RepeatRule } from '@/types'
import { addDaysISO, clockOptions } from '../lib'
import { Dropdown, MonthsPicker, TimeList } from '../ui'
import { repeatLabel } from './editor'

interface HeaderProps {
  date: ISODate
  start: string | null
  repeat: RepeatRule
  /** Header fill (status colour) for existing appointments; white for new ones. */
  color?: string
  readOnly?: boolean
  onDate: (date: ISODate) => void
  onTime: (time: string) => void
  onRepeat: () => void
  right?: ReactNode
}

/** Date ▾ / time ▾ • repeat header of the appointment drawer (calendar.md §7.3). */
export function AppointmentHeader({ date, start, repeat, color, readOnly, onDate, onTime, onRepeat, right }: HeaderProps) {
  const { t } = useTranslation()
  const tinted = Boolean(color)
  const times = clockOptions(5)
  return (
    <div className={clsx('flex items-start justify-between gap-4 px-8 pb-6 pt-8', tinted ? 'text-white' : 'border-b border-line text-ink')} style={tinted ? { background: color } : undefined} data-testid="appointment-header">
      <div className="min-w-0">
        <Dropdown
          panelClassName="p-5"
          trigger={({ open, toggle }) => (
            <button type="button" disabled={readOnly} onClick={toggle} aria-expanded={open} className="inline-flex items-center gap-2 rounded-md font-display text-[32px] font-bold leading-10 disabled:cursor-default">
              {format(parseISO(date), 'EEE d MMM')}
              {!readOnly && <ChevronDown size={20} aria-hidden />}
            </button>
          )}
        >
          {(close) => (
            <MonthsPicker
              months={1}
              value={date}
              onSelect={(d) => {
                onDate(d)
                close()
              }}
            />
          )}
        </Dropdown>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-body-lg">
          <Dropdown
            width={140}
            trigger={({ open, toggle }) => (
              <button type="button" disabled={readOnly} onClick={toggle} aria-expanded={open} className={clsx('rounded-sm px-0.5 tabular disabled:cursor-default', !readOnly && 'hover:underline')} aria-label={t('calendar.header.time')}>
                {start ?? '--:--'}
              </button>
            )}
          >
            {(close) => (
              <TimeList
                options={times}
                value={start}
                onSelect={(time) => {
                  onTime(time)
                  close()
                }}
              />
            )}
          </Dropdown>
          <span aria-hidden>•</span>
          <button type="button" disabled={readOnly} onClick={onRepeat} className={clsx('rounded-sm px-0.5 disabled:cursor-default', !readOnly && 'hover:underline')}>
            {repeatLabel(repeat, t)}
          </button>
        </div>
      </div>
      {right}
    </div>
  )
}

const ENDS_AFTER = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20, 25, 30]

/** "Edit repeating options": frequency, custom interval and ends. */
export function RepeatPanel({ value, date, onBack, onApply, applying }: { value: RepeatRule; date: ISODate; onBack: () => void; onApply: (rule: RepeatRule) => void; applying?: boolean }) {
  const { t } = useTranslation()
  const [rule, setRule] = useState<RepeatRule>(value)
  const endsValue = rule.ends === 'after' ? `after_${rule.count ?? 2}` : rule.ends
  const setEnds = (v: string) => {
    if (v === 'never') setRule((r) => ({ ...r, ends: 'never', count: undefined, until: undefined }))
    else if (v === 'on') setRule((r) => ({ ...r, ends: 'on', until: r.until ?? addDaysISO(date, 56) }))
    else setRule((r) => ({ ...r, ends: 'after', count: Number(v.split('_')[1]) }))
  }
  const invalid = rule.ends === 'on' && (!rule.until || rule.until <= date)
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <Button size="sm" icon={<ArrowLeft size={16} />} onClick={onBack}>
          {t('calendar.common.back')}
        </Button>
        <h2 className="mt-4 font-display text-title-1 text-ink">{t('calendar.repeat.title')}</h2>
        <div className="mt-6 flex flex-col gap-5">
          <Field label={t('calendar.repeat.frequency')}>
            {(id) => (
              <Select
                id={id}
                value={rule.frequency}
                onChange={(e) => setRule((r) => ({ ...r, frequency: e.target.value as RepeatRule['frequency'], interval: r.interval || 1 }))}
                options={(['none', 'daily', 'weekly', 'monthly', 'custom'] as const).map((f) => ({ value: f, label: t(`calendar.repeat.freq.${f}`) }))}
                data-testid="repeat-frequency"
              />
            )}
          </Field>
          {rule.frequency === 'custom' && (
            <div>
              <span className="label">{t('calendar.repeat.every')}</span>
              <div className="grid grid-cols-[110px_160px] gap-3">
                <TextInput type="number" min={1} max={52} aria-label={t('calendar.repeat.interval')} value={rule.interval} onChange={(e) => setRule((r) => ({ ...r, interval: Math.max(1, Math.min(52, Number(e.target.value) || 1)) }))} />
                <Select aria-label={t('calendar.repeat.unit')} value={rule.unit} onChange={(e) => setRule((r) => ({ ...r, unit: e.target.value as RepeatRule['unit'] }))} options={(['day', 'week', 'month'] as const).map((u) => ({ value: u, label: t(`calendar.repeat.units.${u}`) }))} />
              </div>
            </div>
          )}
          {rule.frequency !== 'none' && (
            <Field label={t('calendar.repeat.ends')}>
              {(id) => (
                <Select
                  id={id}
                  value={endsValue}
                  onChange={(e) => setEnds(e.target.value)}
                  options={[
                    { value: 'never', label: t('calendar.repeat.never') },
                    ...ENDS_AFTER.map((n) => ({ value: `after_${n}`, label: t('calendar.repeat.after', { count: n }) })),
                    { value: 'on', label: t('calendar.repeat.specificDate') },
                  ]}
                />
              )}
            </Field>
          )}
          {rule.frequency !== 'none' && rule.ends === 'on' && (
            <Field label={t('calendar.repeat.endDate')} error={invalid ? t('calendar.repeat.endDateError') : undefined}>
              {(id) => <TextInput id={id} type="date" min={addDaysISO(date, 1)} value={rule.until ?? ''} onChange={(e) => setRule((r) => ({ ...r, until: e.target.value }))} invalid={invalid} />}
            </Field>
          )}
        </div>
      </div>
      <div className="border-t border-line px-8 py-5">
        <Button variant="primary" size="lg" className="w-full" disabled={invalid} loading={applying} onClick={() => onApply(rule)} data-testid="repeat-apply">
          {t('calendar.repeat.apply')}
        </Button>
      </div>
    </div>
  )
}

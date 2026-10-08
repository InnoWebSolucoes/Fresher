import clsx from 'clsx'
import { format, parseISO } from 'date-fns'
import { CalendarDays, CalendarSearch, ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import { useDb } from '@/store/db'
import { getAvailableSlots, nextAvailableDates, type Slot } from '@/lib/availability'
import { closedPeriodOn } from '@/lib/schedule'
import { now, todayISO, toMinutes, weekdayOf } from '@/lib/time'
import type { ID, ISODate, TeamMember } from '@/types'
import type { AppointmentDraft } from '../store'
import { useAvailabilityData } from '../hooks'
import { addDaysISO } from '../lib'
import { Dropdown, MonthsPicker } from '../ui'
import { MemberChip } from './ServicePanels'

interface TimeStepProps {
  draft: AppointmentDraft
  members: TeamMember[]
  selected: Slot | null
  onSelect: (slot: Slot | null) => void
  onDate: (date: ISODate) => void
  onMember: (id: ID | null) => void
  onPickFromCalendar: () => void
}

/** "Select a time": member chip, 7-day strip and available times (calendar.md §7 step 4, §10.10). */
export function TimeStep({ draft, members, selected, onSelect, onDate, onMember, onPickFromCalendar }: TimeStepProps) {
  const { t } = useTranslation()
  const data = useAvailabilityData()
  const location = useDb((s) => s.locations.find((l) => l.id === draft.locationId))
  const [stripStart, setStripStart] = useState<ISODate>(draft.date)
  const today = todayISO()
  const strip = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysISO(stripStart, i)), [stripStart])
  const memberIds = [...new Set(draft.items.map((i) => i.teamMemberId))]
  const commonMember = memberIds.length === 1 ? memberIds[0] : null

  const isClosed = (date: ISODate) => !location?.openingHours[weekdayOf(date)]?.open || Boolean(closedPeriodOn(data.closedPeriods, date, draft.locationId))
  const request = useMemo(() => draft.items.map((i) => ({ serviceId: i.serviceId, variantId: i.variantId, teamMemberId: i.teamMemberId, durationMin: i.durationMin, extraTime: i.extraTime })), [draft.items])

  const slots = useMemo(() => {
    const list = getAvailableSlots(data, { locationId: draft.locationId, date: draft.date, items: request, online: false, now: now() })
    if (draft.date !== today) return list
    const current = now()
    const nowMin = current.getHours() * 60 + current.getMinutes()
    return list.filter((s) => toMinutes(s.start) >= nowMin)
  }, [data, draft.locationId, draft.date, request, today])

  const next = useMemo(() => (slots.length ? [] : nextAvailableDates(data, { locationId: draft.locationId, items: request, online: false, now: now() }, addDaysISO(draft.date, 1), 60, 1)), [slots.length, data, draft.locationId, draft.date, request])

  const pickDate = (date: ISODate) => {
    onSelect(null)
    onDate(date)
    if (!strip.includes(date)) setStripStart(date < today ? today : date)
  }

  return (
    <div className="flex flex-col gap-6" data-testid="time-step">
      <h2 className="font-display text-title-1 text-ink">{t('calendar.time.title')}</h2>
      <div className="flex items-center justify-between gap-3">
        <MemberChip value={commonMember} members={members} short onChange={(id) => {
          onSelect(null)
          onMember(id)
        }} />
        <Dropdown
          align="right"
          panelClassName="p-5"
          trigger={({ open, toggle }) => (
            <button type="button" onClick={toggle} aria-expanded={open} aria-label={t('calendar.time.chooseDate')} className="flex h-10 w-12 items-center justify-center rounded-full border border-line-strong hover:bg-sunken">
              <CalendarDays size={18} aria-hidden />
            </button>
          )}
        >
          {(close) => (
            <MonthsPicker
              months={1}
              value={draft.date}
              isDisabled={(d) => d < today}
              onSelect={(d) => {
                pickDate(d)
                close()
              }}
            />
          )}
        </Dropdown>
      </div>
      <div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-body-lg font-semibold text-ink">{format(parseISO(strip[0]), 'MMMM')}</span>
          <div className="flex gap-1">
            <button type="button" aria-label={t('calendar.time.prevWeek')} disabled={stripStart <= today} onClick={() => setStripStart((s) => (addDaysISO(s, -7) < today ? today : addDaysISO(s, -7)))} className="icon-btn h-8 w-8 disabled:opacity-40">
              <ChevronLeft size={18} aria-hidden />
            </button>
            <button type="button" aria-label={t('calendar.time.nextWeek')} onClick={() => setStripStart((s) => addDaysISO(s, 7))} className="icon-btn h-8 w-8">
              <ChevronRight size={18} aria-hidden />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-2">
          {strip.map((day) => {
            const closed = isClosed(day)
            const active = day === draft.date
            return (
              <button key={day} type="button" disabled={closed} onClick={() => pickDate(day)} className="flex flex-col items-center gap-1.5 disabled:cursor-not-allowed" aria-pressed={active} aria-label={format(parseISO(day), 'EEEE d MMMM')}>
                <span className={clsx('flex h-12 w-12 items-center justify-center rounded-full border text-body-lg font-semibold tabular', active ? 'border-primary bg-primary text-on-primary' : closed ? 'border-line text-subtle line-through' : 'border-line-strong text-ink hover:bg-sunken')}>
                  {parseISO(day).getDate()}
                </span>
                <span className={clsx('text-small', closed ? 'text-subtle' : 'text-ink')}>{format(parseISO(day), 'EEE')}</span>
              </button>
            )
          })}
        </div>
      </div>
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-body-lg font-semibold text-ink">{t('calendar.time.available')}</h3>
          <Button size="sm" icon={<CalendarSearch size={16} />} onClick={onPickFromCalendar} className="rounded-full">
            {t('calendar.time.pickFromCalendar')}
          </Button>
        </div>
        {slots.length ? (
          <div className="flex flex-col gap-2.5">
            {slots.map((slot, i) => (
              <button
                key={slot.start}
                type="button"
                onClick={() => onSelect(slot)}
                aria-pressed={selected?.start === slot.start}
                data-qa={`possible-slot-${i}`}
                className={clsx('rounded-lg border px-6 py-4 text-left text-body-strong tabular transition-colors', selected?.start === slot.start ? 'border-primary bg-primary-subtle ring-1 ring-primary' : 'border-line hover:bg-sunken')}
              >
                {slot.start}
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-line-strong p-6 text-center">
            <p className="text-body-strong text-ink">{t('calendar.time.noneTitle')}</p>
            <p className="mt-1 text-body text-muted">{t('calendar.time.noneBody')}</p>
            {next[0] && (
              <Button className="mt-4" onClick={() => pickDate(next[0].date)}>
                {t('calendar.time.nextAvailable', { date: format(parseISO(next[0].date), 'EEE d MMM') })}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

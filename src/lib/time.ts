import { addMinutes, parseISO } from 'date-fns'
import i18n from 'i18next'
import { format } from '@/lib/dates'
import { useDb } from '@/store/db'
import type { ClockTime, ISODate, Weekday } from '@/types'

/**
 * "Now" for the whole demo. The demo panel can time-travel by setting
 * meta.todayOverride; the clock keeps ticking from that point.
 */
let realStart = Date.now()
let overrideStart: number | null = null
let lastOverride: string | undefined

export function now(): Date {
  const override = useDb.getState().meta?.todayOverride
  if (override !== lastOverride) {
    lastOverride = override
    overrideStart = override ? parseISO(override).getTime() : null
    realStart = Date.now()
  }
  return overrideStart === null ? new Date() : new Date(overrideStart + (Date.now() - realStart))
}

export function useNow(): Date {
  // Re-render when the override changes; components that need a ticking clock
  // can add their own interval.
  useDb((s) => s.meta?.todayOverride)
  return now()
}

export const todayISO = (): ISODate => format(now(), 'yyyy-MM-dd')
export const nowISO = (): string => now().toISOString()

export const toISODate = (d: Date): ISODate => format(d, 'yyyy-MM-dd')
export const fromISODate = (d: ISODate): Date => parseISO(d)

/** 'HH:mm' → minutes after midnight. */
export function toMinutes(time: ClockTime): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** minutes after midnight → 'HH:mm'. */
export function toClock(minutes: number): ClockTime {
  const m = ((minutes % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Combine a date and clock time into a Date. */
export function at(date: ISODate, time: ClockTime): Date {
  return addMinutes(parseISO(date), toMinutes(time))
}

/** Monday-based weekday index. */
export function weekdayOf(date: ISODate | Date): Weekday {
  const d = typeof date === 'string' ? parseISO(date) : date
  return ((d.getDay() + 6) % 7) as Weekday
}

/** Duration label like "1h 30min", "45min". */
export function durationLabel(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h && m) return `${h}h ${m}min`
  if (h) return `${h}h`
  return `${m}min`
}

/** Long duration label like "1 hr, 30 min" (catalog lists). */
export function durationLong(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h && m) return i18n.t('common.duration.hoursMinutes', { h, m })
  if (h) return i18n.t('common.duration.hours', { h })
  return i18n.t('common.duration.minutes', { m })
}

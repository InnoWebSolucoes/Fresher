import { parseISO } from 'date-fns'
import { format } from '@/lib/dates'
import { money2, num, round2 } from '@/lib/format'
import type { Cell, ColType } from './types'

export const isNumeric = (type: ColType) => type === 'int' || type === 'num' || type === 'money' || type === 'pct' || type === 'hours' || type === 'mins'

/** "8h 30m" from minutes. */
export function hoursLabel(minutes: number): string {
  const sign = minutes < 0 ? '-' : ''
  const m = Math.round(Math.abs(minutes))
  return `${sign}${Math.floor(m / 60)}h ${m % 60}m`
}

/** Display text for a cell. */
export function formatCell(value: Cell, type: ColType): string {
  if (value === null || value === undefined || value === '') return type === 'text' ? '-' : isNumeric(type) ? formatCell(0, type) : '-'
  switch (type) {
    case 'money':
      return money2(Number(value))
    case 'int':
      return num(Math.round(Number(value)))
    case 'num':
      return num(round2(Number(value)), { maximumFractionDigits: 2 })
    case 'pct':
      return `${num(round2(Number(value)), { maximumFractionDigits: 2 })}%`
    case 'hours':
      return hoursLabel(Number(value))
    case 'mins':
      return String(Math.round(Number(value)))
    case 'date':
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? format(parseISO(value), 'd MMM yyyy') : String(value)
    case 'datetime':
      return typeof value === 'string' && value.length > 10 ? format(parseISO(value), 'd MMM yyyy, HH:mm') : String(value)
    case 'time':
      return String(value)
    default:
      return String(value)
  }
}

/** Export value: numbers unformatted (e.g. -2.5), everything else as displayed. */
export function exportCell(value: Cell, type: ColType): string | number {
  if (isNumeric(type)) {
    if (value === null || value === undefined || value === '') return 0
    if (type === 'hours') return round2(Number(value) / 60)
    return round2(Number(value))
  }
  return formatCell(value, type)
}

/** Sort key for a cell. */
export function sortKey(value: Cell, type: ColType): string | number {
  if (isNumeric(type)) return Number(value ?? 0)
  return String(value ?? '').toLowerCase()
}

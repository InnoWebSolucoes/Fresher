import { addDays, endOfMonth, endOfQuarter, endOfWeek, endOfYear, format, parseISO, startOfMonth, startOfQuarter, startOfWeek, startOfYear } from 'date-fns'
import { round2 } from '@/lib/format'
import { L } from './labels'
import type { Cell, Col, ColType, Filters, Link, Range, RangeFilters, Result, Row } from './types'

/** Every fact carries filterable attributes (filter key → value ids) and numbers for range filters. */
export interface Fact {
  a: Record<string, string | string[] | undefined>
  n?: Record<string, number>
}

export const inRange = (date: string, range: Range) => date >= range.from && date <= range.to

export function applyFilters<T extends Fact>(facts: T[], filters: Filters, ranges: RangeFilters = {}): T[] {
  const lists = Object.entries(filters).filter(([, v]) => v && v.length)
  const nums = Object.entries(ranges).filter(([, r]) => r && (r.min !== undefined || r.max !== undefined))
  if (!lists.length && !nums.length) return facts
  return facts.filter(
    (f) =>
      lists.every(([key, values]) => {
        const v = f.a[key]
        if (v === undefined) return true
        return Array.isArray(v) ? v.some((x) => values.includes(x)) : values.includes(v)
      }) &&
      nums.every(([key, r]) => {
        const v = f.n?.[key]
        if (v === undefined) return true
        return (r.min === undefined || v >= r.min) && (r.max === undefined || v <= r.max)
      }),
  )
}

export const sum = <T,>(list: T[], fn: (x: T) => number) => round2(list.reduce((s, x) => s + (fn(x) || 0), 0))
export const pct = (part: number, whole: number) => (whole ? round2((part / whole) * 100) : 0)
export const avg = (total: number, count: number) => (count ? round2(total / count) : 0)
export const distinct = <T,>(list: T[], fn: (x: T) => string | null | undefined) => new Set(list.map(fn).filter(Boolean) as string[]).size

// ─── Time buckets ───────────────────────────────────────────────────────────

export type TimeUnit = 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year' | 'weekday'

export interface DimVal {
  k: string
  l: string
  s?: string | number
}

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

export function timeBucket(unit: TimeUnit, date: string, time = '00:00'): DimVal {
  const d = parseISO(date)
  switch (unit) {
    case 'hour': {
      const h = time.slice(0, 2)
      return { k: h, l: `${h}:00`, s: Number(h) }
    }
    case 'day':
      return { k: date, l: format(d, 'd MMM yyyy'), s: date }
    case 'week': {
      const start = startOfWeek(d, { weekStartsOn: 1 })
      const k = format(start, 'yyyy-MM-dd')
      return { k, l: `${format(start, 'd MMM')} - ${format(endOfWeek(d, { weekStartsOn: 1 }), 'd MMM yyyy')}`, s: k }
    }
    case 'month':
      return { k: format(d, 'yyyy-MM'), l: format(d, 'MMM yyyy'), s: format(d, 'yyyy-MM') }
    case 'quarter':
      return { k: format(d, "yyyy-'Q'Q"), l: format(d, 'QQQ yyyy'), s: format(d, "yyyy-'Q'Q") }
    case 'year':
      return { k: format(d, 'yyyy'), l: format(d, 'yyyy'), s: format(d, 'yyyy') }
    case 'weekday': {
      const i = (d.getDay() + 6) % 7
      return { k: String(i), l: L(`weekday.${WEEKDAYS[i]}`), s: i }
    }
  }
}

/** Date range covered by a time bucket key (for drill-down). */
export function bucketRange(unit: TimeUnit, key: string): Range | undefined {
  const iso = (x: Date) => format(x, 'yyyy-MM-dd')
  switch (unit) {
    case 'day':
      return { from: key, to: key }
    case 'week':
      return { from: key, to: iso(addDays(parseISO(key), 6)) }
    case 'month': {
      const d = parseISO(`${key}-01`)
      return { from: iso(startOfMonth(d)), to: iso(endOfMonth(d)) }
    }
    case 'quarter': {
      const [y, q] = key.split('-Q')
      const d = new Date(Number(y), (Number(q) - 1) * 3, 1)
      return { from: iso(startOfQuarter(d)), to: iso(endOfQuarter(d)) }
    }
    case 'year': {
      const d = new Date(Number(key), 0, 1)
      return { from: iso(startOfYear(d)), to: iso(endOfYear(d)) }
    }
    default:
      return undefined
  }
}

/** Every bucket between two dates (columns of over-time reports). */
export function bucketsBetween(unit: Exclude<TimeUnit, 'hour' | 'weekday'>, range: Range): DimVal[] {
  const out: DimVal[] = []
  const seen = new Set<string>()
  let d = parseISO(range.from)
  const end = parseISO(range.to)
  let guard = 0
  while (d <= end && guard++ < 800) {
    const b = timeBucket(unit, format(d, 'yyyy-MM-dd'))
    if (!seen.has(b.k)) {
      seen.add(b.k)
      out.push(b)
    }
    d = addDays(d, 1)
  }
  return out
}

const TIME_NEXT: Record<string, TimeUnit | undefined> = { year: 'month', quarter: 'month', month: 'day', week: 'day', day: 'hour' }

// ─── Summary reports ────────────────────────────────────────────────────────

export interface Dim<F> {
  key: string
  get: (f: F) => DimVal | DimVal[]
  /** Drill-down: adds this filter with the row's key and regroups by `next`. */
  filterKey?: string
  next?: string
  time?: TimeUnit
}

export interface Measure<F> {
  key: string
  type: ColType
  hidden?: boolean
  calc: (fs: F[]) => number | null
}

export function summarize<F>(facts: F[], dim: Dim<F>, measures: Measure<F>[], opts: { total?: boolean; desc?: boolean } = {}): Result {
  const groups = new Map<string, { v: DimVal; fs: F[] }>()
  for (const f of facts) {
    const vs = dim.get(f)
    for (const v of Array.isArray(vs) ? vs : [vs]) {
      const g = groups.get(v.k)
      if (g) g.fs.push(f)
      else groups.set(v.k, { v, fs: [f] })
    }
  }
  const sorted = [...groups.values()].sort((a, b) => {
    const sa = a.v.s ?? a.v.l.toLowerCase()
    const sb = b.v.s ?? b.v.l.toLowerCase()
    const c = sa < sb ? -1 : sa > sb ? 1 : 0
    return opts.desc ? -c : c
  })
  const columns: Col[] = [{ key: 'group', label: L(`dim.${dim.key}`), type: 'text' }, ...measures.map((m) => ({ key: m.key, label: L(`col.${m.key}`), type: m.type, hidden: m.hidden }))]
  const rows: Row[] = sorted.map(({ v, fs }) => {
    const cells: Record<string, Cell> = { group: v.l }
    for (const m of measures) cells[m.key] = m.calc(fs)
    let link: Link | undefined
    if (dim.filterKey && dim.next) link = { kind: 'drill', drill: { filter: { key: dim.filterKey, value: v.k }, groupBy: dim.next } }
    else if (dim.time && TIME_NEXT[dim.time]) {
      const range = bucketRange(dim.time, v.k)
      if (range) link = { kind: 'drill', drill: { range, groupBy: TIME_NEXT[dim.time] } }
    }
    return { key: v.k, cells, links: link ? { group: link } : undefined }
  })
  let total: Record<string, Cell> | null = null
  if (opts.total !== false && facts.length) {
    total = { group: L('total') }
    for (const m of measures) total[m.key] = m.calc(facts)
  }
  return { columns, rows, total }
}

// ─── List reports ───────────────────────────────────────────────────────────

export interface LCol<F> {
  key: string
  type: ColType
  hidden?: boolean
  /** Sum in the Total row (defaults to true for money/hours, false otherwise). */
  total?: boolean
  get: (f: F) => Cell
  link?: (f: F) => Link | undefined
}

export function listResult<F>(facts: F[], cols: LCol<F>[], rowKey: (f: F) => string, opts: { total?: boolean } = {}): Result {
  const columns: Col[] = cols.map((c) => ({ key: c.key, label: L(`col.${c.key}`), type: c.type, hidden: c.hidden, total: c.total ?? (c.type === 'money' || c.type === 'hours') }))
  const rows: Row[] = facts.map((f) => {
    const cells: Record<string, Cell> = {}
    const links: Record<string, Link> = {}
    for (const c of cols) {
      cells[c.key] = c.get(f)
      const link = c.link?.(f)
      if (link) links[c.key] = link
    }
    return { key: rowKey(f), cells, links }
  })
  let total: Record<string, Cell> | null = null
  if (opts.total && rows.length) {
    total = { [cols[0].key]: L('total') }
    columns.forEach((c, i) => {
      if (i === 0 || !c.total) return
      total![c.key] = round2(rows.reduce((s, r) => s + Number(r.cells[c.key] ?? 0), 0))
    })
  }
  return { columns, rows, total }
}

// ─── Statement reports (Finance summary, Pay summary, Performance summary) ──

export interface Line {
  key: string
  /** Literal label (dynamic lines such as payment methods). */
  label?: string
  kind?: 'section' | 'bold'
  indent?: boolean
  type?: ColType
  /** Report slug the label links to. */
  to?: string
}

export function statement(firstLabel: string, lines: Line[], buckets: { key: string; label: string }[], values: (bucket: string | null) => Record<string, number>): Result {
  const columns: Col[] = [{ key: 'label', label: firstLabel, type: 'text' }, { key: 'total', label: L('total'), type: 'money' }, ...buckets.map((b) => ({ key: `b_${b.key}`, label: b.label, type: 'money' as ColType }))]
  const totals = values(null)
  const per = buckets.map((b) => values(b.key))
  const rows: Row[] = lines.map((line) => {
    const cells: Record<string, Cell> = { label: line.label ?? L(`line.${line.key}`) }
    if (line.kind !== 'section') {
      cells.total = totals[line.key] ?? 0
      buckets.forEach((b, i) => (cells[`b_${b.key}`] = per[i][line.key] ?? 0))
    }
    return { key: line.key, cells, kind: line.kind, indent: line.indent, type: line.type ?? 'money', links: line.to ? { label: { kind: 'report', to: line.to } } : undefined }
  })
  return { columns, rows, total: null }
}

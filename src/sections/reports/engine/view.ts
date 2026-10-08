import { round2 } from '@/lib/format'
import type { AdvOp, AdvRule, ReportConfig } from '../data'
import { formatCell, isNumeric, sortKey } from './format'
import type { Cell, Col, ColType, Result, Row } from './types'

/** Per-session column state from the column header menu (reports.md §2.6). */
export interface ColumnView {
  /** Visible column keys in display order (null = configured order). */
  order: string[] | null
  hidden: string[]
  sort: { key: string; dir: 'asc' | 'desc' } | null
  unwrapped: string[]
}

export const EMPTY_VIEW: ColumnView = { order: null, hidden: [], sort: null, unwrapped: [] }

/** Columns shown by default: the grouping column, then the configured (or default) measures. */
export function configuredColumns(result: Result, config: ReportConfig | undefined): Col[] {
  const [first, ...rest] = result.columns
  if (!first) return []
  if (!config?.columns) return [first, ...rest.filter((c) => !c.hidden)]
  const byKey = new Map(rest.map((c) => [c.key, c]))
  const chosen = config.columns.map((k) => byKey.get(k)).filter(Boolean) as Col[]
  // Columns that only exist for some groupings/buckets (statement reports) stay visible.
  return [first, ...chosen]
}

/** Apply the header-menu order and hidden columns on top of the configured columns. */
export function visibleColumns(result: Result, config: ReportConfig | undefined, view: ColumnView): Col[] {
  const base = configuredColumns(result, config).filter((c, i) => i === 0 || !view.hidden.includes(c.key))
  if (!view.order) return base
  const pos = new Map(view.order.map((k, i) => [k, i]))
  const [first, ...rest] = base
  return [first, ...[...rest].sort((a, b) => (pos.get(a.key) ?? 999) - (pos.get(b.key) ?? 999))]
}

export const NUMBER_OPS: AdvOp[] = ['eq', 'between', 'gt', 'gte', 'lt', 'lte']
export const TEXT_OPS: AdvOp[] = ['contains', 'not_contains', 'is', 'is_not']

/** Hours columns hold minutes; users type hours. */
const toCellUnits = (n: number, type: ColType) => (type === 'hours' ? n * 60 : n)

export function ruleIsComplete(rule: AdvRule, type: ColType | undefined): boolean {
  if (!type || !rule.field) return false
  if (!isNumeric(type)) return rule.value.trim() !== ''
  if (rule.value.trim() === '' || !Number.isFinite(Number(rule.value))) return false
  return rule.op !== 'between' || (rule.value2 !== undefined && rule.value2.trim() !== '' && Number.isFinite(Number(rule.value2)))
}

function passes(rule: AdvRule, value: Cell, type: ColType): boolean {
  if (isNumeric(type)) {
    const v = Number(value ?? 0)
    const a = toCellUnits(Number(rule.value), type)
    const b = toCellUnits(Number(rule.value2), type)
    switch (rule.op) {
      case 'eq':
        return Math.abs(v - a) < 0.005
      case 'between':
        return v >= Math.min(a, b) - 0.005 && v <= Math.max(a, b) + 0.005
      case 'gt':
        return v > a + 0.005
      case 'gte':
        return v >= a - 0.005
      case 'lt':
        return v < a - 0.005
      case 'lte':
        return v <= a + 0.005
      default:
        return true
    }
  }
  const text = formatCell(value, type).toLowerCase()
  const q = rule.value.trim().toLowerCase()
  switch (rule.op) {
    case 'contains':
      return text.includes(q)
    case 'not_contains':
      return !text.includes(q)
    case 'is':
      return text === q
    case 'is_not':
      return text !== q
    default:
      return true
  }
}

const ADDITIVE: ColType[] = ['int', 'num', 'money', 'hours', 'mins']

/** "In this view, show records where…" (reports.md §2.5): keeps rows matching every rule and re-totals what adds up. */
export function applyRules(result: Result, rules: AdvRule[]): Result {
  const types = new Map(result.columns.map((c) => [c.key, c.type]))
  const active = rules.filter((r) => ruleIsComplete(r, types.get(r.field)))
  if (!active.length) return result
  const rows = result.rows.filter((r) => r.kind || active.every((rule) => passes(rule, r.cells[rule.field], r.type && rule.field !== result.columns[0]?.key ? r.type : (types.get(rule.field) as ColType))))
  if (rows.length === result.rows.length || !result.total) return { ...result, rows }
  const total: Record<string, Cell> = { ...result.total }
  result.columns.forEach((c, i) => {
    if (i === 0 || total[c.key] === undefined || total[c.key] === null) return
    total[c.key] = ADDITIVE.includes(c.type) ? round2(rows.reduce((s, r) => s + Number(r.cells[c.key] ?? 0), 0)) : null
  })
  return { ...result, rows, total: rows.length ? total : null }
}

/** Sort A to Z / Z to A from the column header menu. Statement layouts keep their order. */
export function sortRows(rows: Row[], sort: ColumnView['sort'], columns: Col[]): Row[] {
  if (!sort || rows.some((r) => r.kind)) return rows
  const col = columns.find((c) => c.key === sort.key)
  if (!col) return rows
  const dir = sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const x = sortKey(a.cells[col.key], col.type)
    const y = sortKey(b.cells[col.key], col.type)
    return x < y ? -dir : x > y ? dir : 0
  })
}

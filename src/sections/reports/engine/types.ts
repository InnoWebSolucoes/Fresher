import type { PresetKey } from '@/components/ui'
import type { Ctx } from './context'

/** Column value kinds; they drive formatting, alignment, totals and exports. */
export type ColType = 'text' | 'int' | 'num' | 'money' | 'pct' | 'date' | 'datetime' | 'time' | 'hours' | 'mins'

export type Cell = string | number | null

export interface Col {
  key: string
  label: string
  type: ColType
  /** Available in Customize › Columns but not shown by default. */
  hidden?: boolean
  /** Summed in the Total row (list reports). */
  total?: boolean
}

export interface Drill {
  filter?: { key: string; value: string }
  range?: { from: string; to: string }
  groupBy?: string
}

export interface Link {
  kind: 'sale' | 'appointment' | 'client' | 'report' | 'drill'
  id?: string
  /** Report slug + query for kind 'report'. */
  to?: string
  drill?: Drill
}

export interface Row {
  key: string
  cells: Record<string, Cell>
  links?: Record<string, Link>
  /** Statement layouts: section heading or bold subtotal line. */
  kind?: 'section' | 'bold'
  indent?: boolean
  /** Row-level value type for every cell but the first (statement layouts). */
  type?: ColType
}

export interface Result {
  columns: Col[]
  rows: Row[]
  total: Record<string, Cell> | null
}

export interface Range {
  from: string
  to: string
}

export type Filters = Record<string, string[]>
export type RangeFilters = Record<string, { min?: number; max?: number }>

export interface Params {
  range: Range
  groupBy: string
  filters: Filters
  ranges: RangeFilters
  /** Extra selectors (Performance over time: metric and time unit). */
  extra: Record<string, string>
}

export interface GroupingOpt {
  key: string
  premium?: boolean
  /** Listed under "Hidden in list" in Customize › Grouping. */
  hidden?: boolean
}

export interface Selector {
  key: string
  options: string[]
  default: string
}

export interface Spec {
  slug: string
  /** Default date preset; null = no date picker (Stock on hand). */
  range: PresetKey | null
  /** Group by options, first = default. A button shows when `groupBy` is true. */
  groupings?: GroupingOpt[]
  groupBy?: boolean
  /** Filters drawer sections in reference order. */
  filters: string[]
  premiumFilters?: string[]
  /** "Advanced filters" toolbar button. */
  advanced: boolean
  /** Gear button (Customize drawer). */
  customize: boolean
  /** Extra toolbar selectors (Performance over time). */
  selectors?: Selector[]
  build: (ctx: Ctx, p: Params) => Result
}

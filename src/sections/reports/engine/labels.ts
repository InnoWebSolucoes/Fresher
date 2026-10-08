import i18next from 'i18next'

/** Report labels (columns, groupings, filters, options) from reports/en.json › l. */
export const L = (key: string, options?: Record<string, unknown>): string => i18next.t(`reports.l.${key}`, options ?? {}) as string

/** Stored stock movement reasons (English data values) → catalog labels; unknown reasons show as stored. */
const STOCK_REASONS: Record<string, string> = {
  'New Stock': 'newStock',
  Return: 'return',
  Transfer: 'transfer',
  Adjustment: 'adjustment',
  Other: 'other',
  'Internal use': 'internalUse',
  Damaged: 'damaged',
  'Out of date': 'outOfDate',
  Lost: 'lost',
  Import: 'import',
  Sale: 'sale',
  Stocktake: 'stocktake',
  'Stock order': 'stockOrder',
  Received: 'received',
}

export const stockReasonLabel = (reason: string): string => (STOCK_REASONS[reason] ? (i18next.t(`catalog.products2.reasons.${STOCK_REASONS[reason]}`) as string) : reason)

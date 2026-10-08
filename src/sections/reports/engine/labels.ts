import i18next from 'i18next'

/** Report labels (columns, groupings, filters, options) from reports/en.json › l. */
export const L = (key: string, options?: Record<string, unknown>): string => i18next.t(`reports.l.${key}`, options ?? {}) as string

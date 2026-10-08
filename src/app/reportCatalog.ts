import i18n from 'i18next'

// Report catalogue from reference/reports.md section 4 (59 reports).
export type ReportGroup = "dashboards" | "premium" | "salesPerformance" | "finances" | "appointments" | "team" | "clients" | "inventory"

export interface ReportDef {
  id: string
  slug: string
  readonly name: string
  readonly description: string
  group: ReportGroup
  premium: boolean
}

/** Name and description are read in the current language (reports.catalog.<id>). */
const report = (id: string, slug: string, group: ReportGroup, premium: boolean): ReportDef => ({
  id,
  slug,
  group,
  premium,
  get name() {
    return i18n.t(`reports.catalog.${id}.name`)
  },
  get description() {
    return i18n.t(`reports.catalog.${id}.description`)
  },
})

export const REPORTS: ReportDef[] = [
  report("r01", "performance", "dashboards", false),
  report("r02", "online-presence", "dashboards", false),
  report("r03", "loyalty_dashboard", "dashboards", false),
  report("r04", "performance-summary", "premium", true),
  report("r05", "performance-over-time", "premium", true),
  report("r06", "sales-summary", "salesPerformance", false),
  report("r07", "sales-by-time-period", "salesPerformance", true),
  report("r08", "sales-list", "salesPerformance", false),
  report("r09", "sales-log-detail", "salesPerformance", false),
  report("r10", "gift-card-by-time-period", "salesPerformance", true),
  report("r11", "gift-card-list", "salesPerformance", false),
  report("r12", "membership-list-v2", "salesPerformance", false),
  report("r13", "membership-summary-v2", "salesPerformance", false),
  report("r14", "memberships-benefits-consumption", "salesPerformance", true),
  report("r15", "packages-list", "salesPerformance", false),
  report("r16", "packages-summary", "salesPerformance", false),
  report("r17", "packages-benefits-consumption", "salesPerformance", true),
  report("r18", "cash-register-summary", "salesPerformance", false),
  report("r19", "discount-summary", "salesPerformance", false),
  report("r20", "taxes-summary", "salesPerformance", false),
  report("r21", "finance-summary", "finances", false),
  report("r22", "payments-summary", "finances", false),
  report("r23", "payment-transactions", "finances", false),
  report("r24", "cash-flow-summary", "finances", false),
  report("r25", "cash-flow-statement", "finances", false),
  report("r26", "service-charges", "finances", false),
  report("r27", "liability-summary", "finances", false),
  report("r28", "liability-activity", "finances", false),
  report("r29", "deposits-by-time-period", "finances", true),
  report("r30", "deposit-list", "finances", false),
  report("r31", "taxes-list", "finances", false),
  report("r32", "appointment-summary", "appointments", false),
  report("r33", "appointment-list", "appointments", false),
  report("r34", "appointment-cns-ns-summary", "appointments", false),
  report("r35", "waitlist-detail", "appointments", false),
  report("r36", "waitlist-summary", "appointments", true),
  report("r37", "working-hours-activity", "team", false),
  report("r38", "break-activity", "team", false),
  report("r39", "attendance-summary", "team", false),
  report("r40", "wages-detail", "team", false),
  report("r41", "wages-summary", "team", false),
  report("r42", "fee-deduction-activity", "team", false),
  report("r43", "fee-deduction-summary", "team", false),
  report("r44", "pay-summary", "team", false),
  report("r45", "scheduled-shifts", "team", false),
  report("r46", "working-hours-summary", "team", false),
  report("r47", "team-time-off-report", "team", false),
  report("r48", "tips-summary", "team", false),
  report("r49", "tips-detail", "team", false),
  report("r50", "advanced-commission-activity", "team", false),
  report("r51", "advanced-commission-summary", "team", false),
  report("r52", "client-summary", "clients", true),
  report("r53", "client-list", "clients", false),
  report("r54", "client-insights", "clients", true),
  report("r55", "stock-on-hand", "inventory", false),
  report("r56", "stock-movement-summary", "inventory", false),
  report("r57", "stock-movement", "inventory", false),
  report("r58", "product-list", "inventory", false),
  report("r59", "ordered-stock", "inventory", false),
]

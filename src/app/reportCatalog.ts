// Report catalogue from reference/reports.md section 4 (59 reports).
export type ReportGroup = "dashboards" | "premium" | "salesPerformance" | "finances" | "appointments" | "team" | "clients" | "inventory"

export interface ReportDef {
  id: string
  slug: string
  name: string
  description: string
  group: ReportGroup
  premium: boolean
}

export const REPORTS: ReportDef[] = [
  { id: "r01", slug: "performance", name: "Performance dashboard", description: "Dashboard of your business performance.", group: "dashboards", premium: false },
  { id: "r02", slug: "online-presence", name: "Online presence dashboard", description: "Online sales and online client performance", group: "dashboards", premium: false },
  { id: "r03", slug: "loyalty_dashboard", name: "Loyalty dashboard", description: "Dashboard of your loyalty program performance.", group: "dashboards", premium: false },
  { id: "r04", slug: "performance-summary", name: "Performance summary", description: "Overview of business performance by team or location", group: "premium", premium: true },
  { id: "r05", slug: "performance-over-time", name: "Performance over time", description: "View of key business metrics by Location or Team Member over time", group: "premium", premium: true },
  { id: "r06", slug: "sales-summary", name: "Sales summary", description: "Sales quantities and value, excluding tips and gift card sales.", group: "salesPerformance", premium: false },
  { id: "r07", slug: "sales-by-time-period", name: "Sales by time period", description: "Detailed sales data based on selected time periods.", group: "salesPerformance", premium: true },
  { id: "r08", slug: "sales-list", name: "Sales list", description: "Complete listing of all sales transactions.", group: "salesPerformance", premium: false },
  { id: "r09", slug: "sales-log-detail", name: "Sales log detail", description: "In-depth view into each sale transaction.", group: "salesPerformance", premium: false },
  { id: "r10", slug: "gift-card-by-time-period", name: "Gift card by time period", description: "Gift card sales and usage data based on selected time periods.", group: "salesPerformance", premium: true },
  { id: "r11", slug: "gift-card-list", name: "Gift card list", description: "Full list of issued and outstanding gift cards.", group: "salesPerformance", premium: false },
  { id: "r12", slug: "membership-list-v2", name: "Memberships list", description: "Operational details of your memberships including benefits and financials.", group: "salesPerformance", premium: false },
  { id: "r13", slug: "membership-summary-v2", name: "Memberships summary", description: "Membership performance including benefits and financials.", group: "salesPerformance", premium: false },
  { id: "r14", slug: "memberships-benefits-consumption", name: "Memberships benefits consumption", description: "Benefit-level membership redemptions and recognized revenue.", group: "salesPerformance", premium: true },
  { id: "r15", slug: "packages-list", name: "Packages list", description: "Operational details of your packages including benefits and financials.", group: "salesPerformance", premium: false },
  { id: "r16", slug: "packages-summary", name: "Packages summary", description: "Aggregated view of packages performance.", group: "salesPerformance", premium: false },
  { id: "r17", slug: "packages-benefits-consumption", name: "Packages benefits consumption", description: "Benefit-level package redemptions and recognized revenue, for packages accounting. Packages with any unlimited benefit are reported as one package-level row, including their capped benefits, and recognized by duration rather than per benefit.", group: "salesPerformance", premium: true },
  { id: "r18", slug: "cash-register-summary", name: "Cash register summary", description: "Overview of register activities. Excludes online purchases.", group: "salesPerformance", premium: false },
  { id: "r19", slug: "discount-summary", name: "Discount summary", description: "Overview of discounts granted and their impact on sales.", group: "salesPerformance", premium: false },
  { id: "r20", slug: "taxes-summary", name: "Taxes summary", description: "Summary of all tax-related transactions.", group: "salesPerformance", premium: false },
  { id: "r21", slug: "finance-summary", name: "Finance summary", description: "High-level summary of sales, payments and liabilities", group: "finances", premium: false },
  { id: "r22", slug: "payments-summary", name: "Payments summary", description: "Payments split by payment methods.", group: "finances", premium: false },
  { id: "r23", slug: "payment-transactions", name: "Payment transactions", description: "Detailed view of all payment transactions.", group: "finances", premium: false },
  { id: "r24", slug: "cash-flow-summary", name: "Cash flow summary", description: "Overview of funds inflow and outflows.", group: "finances", premium: false },
  { id: "r25", slug: "cash-flow-statement", name: "Cash flow statement", description: "Detailed record of cash flow over a selected period.", group: "finances", premium: false },
  { id: "r26", slug: "service-charges", name: "Service charges", description: "Breakdown of service charge revenue.", group: "finances", premium: false },
  { id: "r27", slug: "liability-summary", name: "Liability summary", description: "Overview of company liabilities by type. This report excludes unpaid and voided gift cards.", group: "finances", premium: false },
  { id: "r28", slug: "liability-activity", name: "Liability activity", description: "Detailed view of liability-related transactions.", group: "finances", premium: false },
  { id: "r29", slug: "deposits-by-time-period", name: "Prepayments by time period", description: "Analysis of prepayments over a selected time period.", group: "finances", premium: true },
  { id: "r30", slug: "deposit-list", name: "Prepayment list", description: "Complete record of all prepayments.", group: "finances", premium: false },
  { id: "r31", slug: "taxes-list", name: "Taxes list", description: "Complete listing of all taxes transactions.", group: "finances", premium: false },
  { id: "r32", slug: "appointment-summary", name: "Appointments summary", description: "General overview of appointment trends and patterns, including cancellations and no-shows.", group: "appointments", premium: false },
  { id: "r33", slug: "appointment-list", name: "Appointments list", description: "Full list of scheduled appointments.", group: "appointments", premium: false },
  { id: "r34", slug: "appointment-cns-ns-summary", name: "Appointments cancellations & no-show summary", description: "Insight into appointment cancellations and no-shows.", group: "appointments", premium: false },
  { id: "r35", slug: "waitlist-detail", name: "Waitlist detail", description: "Detailed view of waitlist entries", group: "appointments", premium: false },
  { id: "r36", slug: "waitlist-summary", name: "Waitlist summary", description: "Overview of waitlist trends and patterns, including appointments booked and expired waitlist entries", group: "appointments", premium: true },
  { id: "r37", slug: "working-hours-activity", name: "Working hours activity", description: "Detailed view of team members worked hours, shifts, and timesheets", group: "team", premium: false },
  { id: "r38", slug: "break-activity", name: "Break activity", description: "Detailed view of team members' breaks", group: "team", premium: false },
  { id: "r39", slug: "attendance-summary", name: "Attendance summary", description: "Overview of team members' punctuality and attendance for their shifts", group: "team", premium: false },
  { id: "r40", slug: "wages-detail", name: "Wages detail", description: "Detailed view of wages earned by team members across locations", group: "team", premium: false },
  { id: "r41", slug: "wages-summary", name: "Wages summary", description: "Overview of wages earned by team members", group: "team", premium: false },
  { id: "r42", slug: "fee-deduction-activity", name: "Fee deduction activity", description: "Complete list of fees applied to team member earnings", group: "team", premium: false },
  { id: "r43", slug: "fee-deduction-summary", name: "Fee deduction summary", description: "Overview of fees applied to earnings by team member, locations and sale items", group: "team", premium: false },
  { id: "r44", slug: "pay-summary", name: "Pay summary", description: "Overview of team member compensation", group: "team", premium: false },
  { id: "r45", slug: "scheduled-shifts", name: "Scheduled shifts", description: "Detailed view of team members scheduled shifts", group: "team", premium: false },
  { id: "r46", slug: "working-hours-summary", name: "Working hours summary", description: "Overview of operational hours and productivity", group: "team", premium: false },
  { id: "r47", slug: "team-time-off-report", name: "Team time off report", description: "Detailed view of team time off.", group: "team", premium: false },
  { id: "r48", slug: "tips-summary", name: "Tips summary", description: "Analysis of gratuity income.", group: "team", premium: false },
  { id: "r49", slug: "tips-detail", name: "Tips detail", description: "Comprehensive breakdown of all tips received.", group: "team", premium: false },
  { id: "r50", slug: "advanced-commission-activity", name: "Commission activity", description: "Full list of all sales with commissions payable.", group: "team", premium: false },
  { id: "r51", slug: "advanced-commission-summary", name: "Commission summary", description: "Overview of commission earned by team members, locations and sale items.", group: "team", premium: false },
  { id: "r52", slug: "client-summary", name: "Client summary", description: "Overview of new, returning and walk-in clients with appointments in the chosen timeframe", group: "clients", premium: true },
  { id: "r53", slug: "client-list", name: "Client list", description: "Comprehensive list of all active clients.", group: "clients", premium: false },
  { id: "r54", slug: "client-insights", name: "Client insights", description: "Deep dive into individual client behaviour and preferences.", group: "clients", premium: true },
  { id: "r55", slug: "stock-on-hand", name: "Stock on hand", description: "Current status and quantity of stock items.", group: "inventory", premium: false },
  { id: "r56", slug: "stock-movement-summary", name: "Stock movement summary", description: "Summary of stock inflow and outflow.", group: "inventory", premium: false },
  { id: "r57", slug: "stock-movement", name: "Stock movement log", description: "Detailed record of all stock movements.", group: "inventory", premium: false },
  { id: "r58", slug: "product-list", name: "Product list", description: "Comprehensive list of all products.", group: "inventory", premium: false },
  { id: "r59", slug: "ordered-stock", name: "Ordered stock", description: "Detailed record of all stock orders.", group: "inventory", premium: false },
]

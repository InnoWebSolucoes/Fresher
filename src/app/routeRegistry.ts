import type { SectionId } from '@/lib/permissions'

/**
 * Every page in the workspace. Titles and subtitles live in
 * locales/en.json under `pages.<id>`. REFERENCE_MAP.md maps each entry back
 * to the reference capture.
 *
 * layout:
 * - shell: top bar + rail (+ left menu panel for sections that have one)
 * - settings: shell + the settings category card on the left
 * - full: full-screen form or wizard with its own header (Close / Save)
 * - account: the "Your account" area
 */
export type PageLayout = 'shell' | 'settings' | 'full' | 'account'

export interface PageDef {
  id: string
  path: string
  section: SectionId
  phase: number
  layout: PageLayout
  /** Reference file the page is specified in. */
  ref: string
}

export interface RedirectDef {
  from: string
  to: string
}

const p = (id: string, path: string, section: SectionId, phase: number, layout: PageLayout, ref: string): PageDef => ({
  id,
  path,
  section,
  phase,
  layout,
  ref,
})

export const PAGES: PageDef[] = [
  // Home and calendar
  p('home', '/dashboard', 'home', 2, 'shell', 'home.md'),
  p('calendar', '/calendar', 'calendar', 2, 'shell', 'calendar.md'),
  p('calendarPick', '/calendar/pick-from-calendar', 'calendar', 2, 'shell', 'calendar.md §7'),
  p('calendarBookWaitlist', '/calendar/book-from-waitlist-entry/:id', 'calendar', 2, 'shell', 'calendar.md §5.1'),
  p('calendarReschedule', '/calendar/reschedule-appointment/:id', 'calendar', 2, 'shell', 'calendar.md §11'),
  p('calendarRebook', '/calendar/rebook-appointment/:id', 'calendar', 2, 'shell', 'calendar.md §9'),
  p('calendarGroupNew', '/calendar/book-appointment-for-group/new', 'calendar', 2, 'shell', 'calendar.md §12'),
  p('calendarAddToGroup', '/calendar/add-to-group/:groupId', 'calendar', 2, 'shell', 'calendar.md §12'),
  p('calendarBlockedTime', '/calendar/blocked-time', 'calendar', 2, 'shell', 'calendar.md §13'),
  p('formSelection', '/clients/form-selection/select', 'calendar', 2, 'full', 'calendar.md §9'),
  p('paymentsProcessing', '/payments/payment-processing', 'addons', 2, 'full', 'add-ons.md §2.1'),

  // Sales
  p('dailySales', '/sales/daily-sales', 'sales', 3, 'shell', 'sales.md §1'),
  p('register', '/sales/register', 'sales', 3, 'shell', 'sales.md §2'),
  p('appointmentsList', '/sales/appointments-list', 'sales', 3, 'shell', 'sales.md §3'),
  p('salesList', '/sales/sales-list', 'sales', 3, 'shell', 'sales.md §4'),
  p('refundSale', '/sales/refund-sale/:saleId', 'sales', 3, 'full', 'sales.md §4'),
  p('paymentTransactions', '/sales/payment-transactions', 'sales', 3, 'shell', 'sales.md §5'),
  p('giftCardsSold', '/sales/gift-cards', 'sales', 3, 'shell', 'sales.md §6'),
  p('packagesSold', '/sales/packages-sold', 'sales', 3, 'shell', 'sales.md §6'),
  p('membershipsSold', '/sales/memberships', 'sales', 3, 'shell', 'sales.md §6'),
  p('productOrders', '/sales/store-orders', 'sales', 3, 'shell', 'sales.md §6'),

  // Clients
  p('clientsList', '/clients/list', 'clients', 3, 'shell', 'clients.md §1'),
  p('clientAdd', '/clients/list/add', 'clients', 3, 'full', 'clients.md §2'),
  p('clientEdit', '/clients/list/:id/edit', 'clients', 3, 'full', 'clients.md §2'),
  p('clientMerge', '/clients/list/merge/:id', 'clients', 3, 'full', 'clients.md §4'),
  p('clientImport', '/clients/client-import/:step', 'clients', 3, 'full', 'clients.md §3'),
  p('clientSegments', '/clients/segments', 'clients', 3, 'shell', 'clients.md §5'),
  p('segmentEdit', '/clients/segments/edit/:id/rules', 'clients', 3, 'full', 'clients.md §5'),
  p('segmentCreate', '/clients/segments/create/:step', 'clients', 3, 'full', 'clients.md §5'),
  p('clientLoyalty', '/clients/loyalty', 'clients', 3, 'shell', 'clients.md §6'),
  p('onlineReputation', '/clients/online-reputation', 'clients', 3, 'shell', 'clients.md §7'),

  // Catalog
  p('serviceMenu', '/catalogue/services', 'catalog', 3, 'shell', 'catalog.md §1'),
  p('serviceAdd', '/catalogue/services/service/add/new', 'catalog', 3, 'full', 'catalog.md §1.1'),
  p('serviceEdit', '/catalogue/services/service/edit/:id', 'catalog', 3, 'full', 'catalog.md §1.1'),
  p('bundleAdd', '/catalogue/services/package/add/new', 'catalog', 3, 'full', 'catalog.md §1.3'),
  p('bundleEdit', '/catalogue/services/package/edit/:id', 'catalog', 3, 'full', 'catalog.md §1.3'),
  p('menuOrder', '/catalogue/services/menu-order', 'catalog', 3, 'full', 'catalog.md §1.4'),
  p('bookingSequence', '/catalogue/services/booking-sequence', 'catalog', 3, 'full', 'catalog.md §1.4'),
  p('bulkEditServices', '/catalogue/services/bulk-edit', 'catalog', 3, 'full', 'catalog.md §1.4'),
  p('packages', '/catalogue/packages', 'catalog', 3, 'shell', 'catalog.md §2'),
  p('packageAdd', '/catalogue/packages/add', 'catalog', 3, 'full', 'catalog.md §2'),
  p('packageEdit', '/catalogue/packages/edit/:id', 'catalog', 3, 'full', 'catalog.md §2'),
  p('memberships', '/catalogue/memberships', 'catalog', 3, 'shell', 'catalog.md §3'),
  p('products', '/catalogue/products', 'catalog', 3, 'shell', 'catalog.md §4'),
  p('productAdd', '/catalogue/products/add', 'catalog', 3, 'full', 'catalog.md §4'),
  p('productEdit', '/catalogue/products/edit/:id', 'catalog', 3, 'full', 'catalog.md §4'),
  p('stocktakes', '/catalogue/stocktakes', 'catalog', 3, 'shell', 'catalog.md §5'),
  p('stocktakeNew', '/catalogue/stocktakes/new', 'catalog', 3, 'full', 'catalog.md §5'),
  p('stocktakeCount', '/catalogue/stocktakes/:id/count', 'catalog', 3, 'full', 'catalog.md §5'),
  p('stocktakeReview', '/catalogue/stocktakes/:id/review', 'catalog', 3, 'full', 'catalog.md §5'),
  p('stocktakeSummary', '/catalogue/stocktakes/:id', 'catalog', 3, 'shell', 'catalog.md §5'),
  p('stockOrders', '/catalogue/orders', 'catalog', 3, 'shell', 'catalog.md §6'),
  p('stockOrderNew', '/catalogue/orders/new', 'catalog', 3, 'full', 'catalog.md §6'),
  p('stockOrderReceive', '/catalogue/orders/:id/receive', 'catalog', 3, 'full', 'catalog.md §6'),
  p('suppliers', '/catalogue/suppliers', 'catalog', 3, 'shell', 'catalog.md §7'),
  p('supplierAdd', '/catalogue/suppliers/add', 'catalog', 3, 'full', 'catalog.md §7'),
  p('supplierEdit', '/catalogue/suppliers/edit/:id', 'catalog', 3, 'full', 'catalog.md §7'),

  // Online presence
  p('marketplaceProfile', '/online-presence/locations', 'online', 4, 'shell', 'online-booking.md §1'),
  p('profileWizard', '/online-presence/profile/edit/:locationId/:step', 'online', 4, 'full', 'online-booking.md §1.1'),
  p('profileDashboard', '/online-presence/profile/dashboard/:locationId/:tab?', 'online', 4, 'shell', 'online-booking.md §1.2'),
  p('facebookSetup', '/online-presence/facebook-setup', 'online', 4, 'shell', 'online-booking.md §3'),
  p('linkBuilder', '/online-presence/buttons-and-links', 'online', 4, 'shell', 'online-booking.md §4'),
  p('smartWebsite', '/online-presence/smart-website', 'online', 4, 'shell', 'online-booking.md §5'),
  p('smartWebsiteWizard', '/online-presence/smart-website/:step', 'online', 4, 'full', 'online-booking.md §5'),
  p('productStore', '/online-presence/store', 'online', 4, 'shell', 'online-booking.md §6'),

  // Marketing
  p('blastCampaigns', '/marketing/blast-campaigns/home', 'marketing', 4, 'shell', 'marketing.md §1'),
  p('blastBillingWizard', '/legal-wizard/blast-marketing/:step', 'marketing', 4, 'full', 'marketing.md §1'),
  p('blastNew', '/marketing/blast-campaigns/new', 'marketing', 4, 'full', 'SPEC §4 (not captured)'),
  p('blastDetail', '/marketing/blast-campaigns/:id', 'marketing', 4, 'shell', 'SPEC §4 (not captured)'),
  p('automations', '/marketing/automated-messages', 'marketing', 4, 'shell', 'marketing.md §2'),
  p('automationDetail', '/marketing/automated-messages/overview/:id', 'marketing', 4, 'shell', 'marketing.md §2'),
  p('automationConfigure', '/marketing/automated-messages/configure/:id', 'marketing', 4, 'full', 'marketing.md §2'),
  p('automationEmail', '/marketing/automated-messages/configure/:id/email', 'marketing', 4, 'full', 'marketing.md §2'),
  p('messagesHistory', '/marketing/notifications', 'marketing', 4, 'shell', 'marketing.md §3'),
  p('deals', '/marketing/deals', 'marketing', 4, 'shell', 'marketing.md §4'),
  p('dealsList', '/marketing/deals/list', 'marketing', 4, 'shell', 'marketing.md §4'),
  p('dealNew', '/marketing/deals/new/:step', 'marketing', 4, 'full', 'marketing.md §4'),
  p('smartPricing', '/marketing/peak-pricing', 'marketing', 4, 'shell', 'marketing.md §5'),
  p('smartPricingSetup', '/marketing/peak-pricing/setup/:step', 'marketing', 4, 'full', 'marketing.md §5'),
  p('smartPricingDetails', '/marketing/peak-pricing/details', 'marketing', 4, 'shell', 'marketing.md §5'),

  // Team
  p('teamMembers', '/team/team-members', 'team', 4, 'shell', 'team.md §1'),
  p('teamMemberAdd', '/team/team-members/add', 'team', 4, 'full', 'team.md §2'),
  p('teamMemberEdit', '/team/team-members/edit/:id', 'team', 4, 'full', 'team.md §2'),
  p('teamReorder', '/team/team-members/reorder', 'team', 4, 'full', 'team.md §1.1'),
  p('calendarSync', '/team/team-members/calendar-sync/:step', 'team', 4, 'full', 'team.md §2.10'),
  p('scheduledShifts', '/team/scheduled-shifts', 'team', 4, 'shell', 'team.md §4'),
  p('repeatingShifts', '/team/scheduled-shifts/working-hours-setup/:locationId/:memberId/:date', 'team', 4, 'full', 'team.md §4.3'),
  p('timesheets', '/team/timesheets', 'team', 4, 'shell', 'team.md §5'),
  p('payRuns', '/team/payrun/overview', 'team', 4, 'shell', 'team.md §6'),
  p('settlements', '/team/payrun/settlements', 'team', 4, 'shell', 'team.md §6.3'),
  p('payRunNew', '/team/payrun/new', 'team', 4, 'full', 'team.md §6.4, sales.md §2.1'),

  // Connect inbox
  p('connect', '/connect', 'connect', 4, 'full', 'top-bar.md §5'),
  p('connectConversation', '/connect/conversations/:id', 'connect', 4, 'full', 'top-bar.md §5'),

  // Reports
  p('reportGroup', '/reports/report-group/:groupId', 'reports', 5, 'shell', 'reports.md §1'),
  p('dataConnector', '/reports/data-connector', 'reports', 5, 'shell', 'reports.md §1.7'),
  p('reportTable', '/reports/table/:slug', 'reports', 5, 'shell', 'reports.md §2–4'),

  // Add-ons
  p('addons', '/add-ons', 'addons', 5, 'shell', 'add-ons.md §1'),
  p('addonIntro', '/add-ons/add-on/:slug/intro', 'addons', 5, 'full', 'add-ons.md §1.1'),
  p('addonSetup', '/add-ons/add-on/:slug/setup', 'addons', 5, 'full', 'add-ons.md §1.1'),
  p('addonManage', '/add-ons/manage/:slug', 'addons', 5, 'shell', 'add-ons.md §1.1'),
  p('integrationIntro', '/add-ons/integration/:slug/intro', 'addons', 5, 'full', 'add-ons.md §3'),
  p('paymentsOnboarding', '/payments/onboarding/:step', 'addons', 5, 'full', 'add-ons.md §2.1'),

  // Settings
  p('setup', '/setup', 'settings', 5, 'shell', 'settings-business-setup.md §0'),
  p('settingsBusinessDetails', '/setup/business-setup/business-details', 'settings', 5, 'settings', 'settings-business-setup.md §1'),
  p('settingsBusinessDetailsEdit', '/setup/business-setup/business-details/edit', 'settings', 5, 'full', 'settings-business-setup.md §1.1'),
  p('settingsLocations', '/setup/business-setup/location-details', 'settings', 5, 'settings', 'settings-business-setup.md §2'),
  p('settingsLocationNew', '/setup/location/new/:step', 'settings', 5, 'full', 'settings-business-setup.md §2.1'),
  p('settingsLocation', '/setup/location/:id/:tab', 'settings', 5, 'settings', 'settings-business-setup.md §2.2'),
  p('settingsTimeCalendar', '/setup/scheduling/time-and-calendar', 'settings', 5, 'settings', 'settings-scheduling.md §1'),
  p('settingsWaitlist', '/setup/scheduling/waitlist', 'settings', 5, 'settings', 'settings-scheduling.md §2'),
  p('settingsBlockedTimeTypes', '/setup/scheduling/blocked-time-types', 'settings', 5, 'settings', 'settings-scheduling.md §3'),
  p('settingsResources', '/setup/scheduling/resources', 'settings', 5, 'settings', 'settings-scheduling.md §4'),
  p('settingsResourceEdit', '/setup/scheduling/resources/:id', 'settings', 5, 'full', 'settings-scheduling.md §4'),
  p('settingsCancellationReasons', '/setup/scheduling/cancellation-reasons', 'settings', 5, 'settings', 'settings-scheduling.md §5'),
  p('settingsAppointmentStatuses', '/setup/scheduling/appointment-statuses', 'settings', 5, 'settings', 'settings-scheduling.md §6'),
  p('settingsClosedPeriods', '/setup/scheduling/closed-periods', 'settings', 5, 'settings', 'settings-scheduling.md §7'),
  p('settingsDynamicAssignment', '/setup/scheduling/dynamic-assignment', 'settings', 5, 'settings', 'settings-scheduling.md §8'),
  p('settingsAvailability', '/setup/scheduling/availability', 'settings', 5, 'settings', 'settings-scheduling.md §9'),
  p('settingsBookingOptions', '/setup/scheduling/booking-options', 'settings', 5, 'settings', 'settings-scheduling.md §10'),
  p('settingsPayNow', '/setup/sales/pay-now', 'settings', 5, 'settings', 'settings-sales.md §1'),
  p('settingsTaxRates', '/setup/sales/tax-rates', 'settings', 5, 'settings', 'settings-sales.md §2'),
  p('settingsReceipts', '/setup/sales/receipts', 'settings', 5, 'settings', 'settings-sales.md §3'),
  p('settingsRegisters', '/setup/sales/registers', 'settings', 5, 'settings', 'settings-sales.md §4'),
  p('settingsTipping', '/setup/sales/tipping', 'settings', 5, 'settings', 'settings-sales.md §5'),
  p('settingsServiceCharges', '/setup/sales/service-charges', 'settings', 5, 'settings', 'settings-sales.md §6'),
  p('settingsGiftCards', '/setup/sales/gift-cards', 'settings', 5, 'settings', 'settings-sales.md §7'),
  p('settingsCheckoutMethods', '/setup/sales/payment-methods', 'settings', 5, 'settings', 'settings-sales.md §8'),
  p('settingsClientSources', '/setup/clients/client-sources', 'settings', 5, 'settings', 'settings-clients.md §1'),
  p('settingsClientTags', '/setup/clients/client-tags', 'settings', 5, 'settings', 'settings-clients.md §2'),
  p('settingsClientConnect', '/setup/clients/messages', 'settings', 5, 'settings', 'settings-clients.md §3'),
  p('settingsPermissions', '/setup/team/permissions', 'settings', 5, 'settings', 'settings-team.md §1'),
  p('settingsPermissionEdit', '/setup/team/permissions/:roleId/edit', 'settings', 5, 'full', 'settings-team.md §1, §8'),
  p('settingsPermissionAdd', '/setup/team/permissions/add/:step', 'settings', 5, 'full', 'settings-team.md §1'),
  p('settingsTimeOff', '/setup/team/time-off', 'settings', 5, 'settings', 'settings-team.md §2'),
  p('settingsTimesheets', '/setup/team/timesheets', 'settings', 5, 'settings', 'settings-team.md §3'),
  p('settingsShifts', '/setup/team/shifts', 'settings', 5, 'settings', 'settings-team.md §4'),
  p('settingsPayRuns', '/setup/team/pay-runs', 'settings', 5, 'settings', 'settings-team.md §5'),
  p('settingsCommissions', '/setup/team/commissions', 'settings', 5, 'settings', 'settings-team.md §6'),
  p('settingsPinSwitching', '/setup/team/pin-switching', 'settings', 5, 'settings', 'settings-team.md §7'),
  p('settingsPinSwitchingSetup', '/setup/team/pin-switching/setup', 'settings', 5, 'full', 'settings-team.md §7'),
  p('settingsFormTemplates', '/setup/forms-and-notes/form-templates', 'settings', 5, 'settings', 'settings-forms.md §1'),
  p('settingsFormCreate', '/setup/forms-and-notes/form-templates/create', 'settings', 5, 'full', 'settings-forms.md §1.2'),
  p('settingsFormEdit', '/setup/forms-and-notes/form-templates/:id/edit', 'settings', 5, 'full', 'settings-forms.md §1.2'),
  p('settingsFormDetails', '/setup/forms-and-notes/form-templates/:id/details', 'settings', 5, 'settings', 'settings-forms.md §1.1'),
  p('settingsFormPreview', '/setup/forms-and-notes/form-templates/:id/preview', 'settings', 5, 'settings', 'settings-forms.md §1.3'),
  p('settingsPaymentPolicy', '/setup/payments/payment-policy', 'settings', 5, 'settings', 'settings-payments.md'),
  p('settingsPaymentMethods', '/setup/payments/payment-methods', 'settings', 5, 'settings', 'settings-payments.md'),
  p('settingsCardTerminals', '/setup/payments/terminals', 'settings', 5, 'settings', 'settings-payments.md'),
  p('billingDetails', '/setup/billing/business-details', 'settings', 5, 'settings', 'settings-billing.md §1'),
  p('billingBankAccounts', '/setup/billing/bank-accounts', 'settings', 5, 'settings', 'settings-billing.md §2'),
  p('billingPaymentMethods', '/setup/billing/payment-methods', 'settings', 5, 'settings', 'settings-billing.md §3'),
  p('billingCommunication', '/setup/billing/communication-balance', 'settings', 5, 'settings', 'settings-billing.md §4'),
  p('billingInvoices', '/setup/billing/invoices-and-fees', 'settings', 5, 'settings', 'settings-billing.md §5'),
  p('billingSubscriptions', '/setup/billing/subscriptions', 'settings', 5, 'settings', 'settings-billing.md §6'),
  p('billingChangePlan', '/setup/billing/change-plan', 'settings', 5, 'full', 'SPEC §7 Billing (not captured)'),

  // Account area
  p('myProfile', '/user-account/profile', 'account', 5, 'account', 'profile-and-personal-settings.md §3'),
  p('myProfileEdit', '/user-account/profile/edit/:section', 'account', 5, 'full', 'profile-and-personal-settings.md §3.1'),
  p('portfolio', '/user-account/portfolio', 'account', 5, 'account', 'profile-and-personal-settings.md §4'),
  p('accountReviews', '/user-account/reviews', 'account', 5, 'account', 'profile-and-personal-settings.md §4'),
  p('accountPayRuns', '/user-account/pay-runs', 'account', 5, 'account', 'profile-and-personal-settings.md §4'),
  p('workspaces', '/user-account/workspaces', 'account', 5, 'account', 'profile-and-personal-settings.md §5'),
  p('workspaceSettings', '/user-account/workspaces/:id/settings', 'account', 5, 'account', 'profile-and-personal-settings.md §5'),
  p('personalSettings', '/user-account/personal-settings', 'account', 5, 'account', 'profile-and-personal-settings.md §6'),
  p('personalInfo', '/user-account/personal-settings/personal-info', 'account', 5, 'account', 'profile-and-personal-settings.md §6.1'),
  p('loginSecurity', '/user-account/personal-settings/login-security', 'account', 5, 'account', 'profile-and-personal-settings.md §6.2'),
  p('appearance', '/user-account/personal-settings/appearance', 'account', 5, 'account', 'profile-and-personal-settings.md §6.3'),
]

export const REDIRECTS: RedirectDef[] = [
  { from: '/reports', to: '/reports/report-group/1?category=all' },
  { from: '/sales/paid-plans', to: '/sales/memberships' },
  { from: '/online-presence/google-reserve', to: '/add-ons#integrations' },
  { from: '/add-ons/smart-website', to: '/online-presence/smart-website' },
]

export function pageById(id: string): PageDef | undefined {
  return PAGES.find((page) => page.id === id)
}

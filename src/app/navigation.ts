import {
  BookOpen,
  CalendarDays,
  CircleHelp,
  Grid2x2Plus,
  House,
  LineChart,
  Megaphone,
  Settings,
  Smile,
  SquareUser,
  Tag,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { SectionId } from '@/lib/permissions'

/** One link in a left menu panel or settings card. `label` is an i18n key. */
export interface NavLink {
  label: string
  to: string
  /** Extra path prefixes that should also mark this link active. */
  match?: string[]
  /** Live sub-label under the link (e.g. "1 open register"). */
  hint?: 'openRegisters'
}

export interface NavGroup {
  /** Group heading i18n key. */
  heading: string
  links: NavLink[]
}

export interface RailItem {
  id: SectionId
  label: string
  icon: LucideIcon
  /** Where a plain click goes. Items with `panel` open the left menu instead. */
  to: string
  /** Path prefixes that make this item active. */
  match: string[]
  panel?: { title: string; groups: NavGroup[] }
}

// Order and links follow reference/home.md §1.2–1.3.
export const RAIL_ITEMS: RailItem[] = [
  { id: 'home', label: 'nav.home', icon: House, to: '/dashboard', match: ['/dashboard'] },
  { id: 'calendar', label: 'nav.calendar', icon: CalendarDays, to: '/calendar', match: ['/calendar'] },
  {
    id: 'sales',
    label: 'nav.sales',
    icon: Tag,
    to: '/sales/daily-sales',
    match: ['/sales'],
    panel: {
      title: 'nav.sales',
      groups: [
        {
          heading: 'nav.sales',
          links: [
            { label: 'nav.dailySales', to: '/sales/daily-sales' },
            { label: 'nav.register', to: '/sales/register', hint: 'openRegisters' },
            { label: 'nav.appointments', to: '/sales/appointments-list' },
            { label: 'nav.salesList', to: '/sales/sales-list', match: ['/sales/refund-sale'] },
            { label: 'nav.payments', to: '/sales/payment-transactions' },
          ],
        },
        {
          heading: 'nav.soldItems',
          links: [
            { label: 'nav.giftCardsSold', to: '/sales/gift-cards' },
            { label: 'nav.packagesSold', to: '/sales/packages-sold' },
            { label: 'nav.membershipsSold', to: '/sales/memberships' },
            { label: 'nav.productOrders', to: '/sales/store-orders' },
          ],
        },
      ],
    },
  },
  {
    id: 'clients',
    label: 'nav.clients',
    icon: Smile,
    to: '/clients/list',
    match: ['/clients'],
    panel: {
      title: 'nav.clients',
      groups: [
        {
          heading: 'nav.clients',
          links: [
            { label: 'nav.clientsList', to: '/clients/list', match: ['/clients/client-import'] },
            { label: 'nav.clientSegments', to: '/clients/segments' },
          ],
        },
        {
          heading: 'nav.engage',
          links: [
            { label: 'nav.clientLoyalty', to: '/clients/loyalty' },
            { label: 'nav.onlineReputation', to: '/clients/online-reputation' },
          ],
        },
      ],
    },
  },
  {
    id: 'catalog',
    label: 'nav.catalog',
    icon: BookOpen,
    to: '/catalogue/services',
    match: ['/catalogue'],
    panel: {
      title: 'nav.catalog',
      groups: [
        {
          heading: 'nav.catalog',
          links: [
            { label: 'nav.serviceMenu', to: '/catalogue/services' },
            { label: 'nav.packages', to: '/catalogue/packages' },
            { label: 'nav.memberships', to: '/catalogue/memberships' },
            { label: 'nav.products', to: '/catalogue/products' },
          ],
        },
        {
          heading: 'nav.inventory',
          links: [
            { label: 'nav.stocktakes', to: '/catalogue/stocktakes' },
            { label: 'nav.stockOrders', to: '/catalogue/orders' },
            { label: 'nav.suppliers', to: '/catalogue/suppliers' },
          ],
        },
      ],
    },
  },
  {
    id: 'online',
    label: 'nav.onlinePresence',
    icon: SquareUser,
    to: '/online-presence/locations',
    match: ['/online-presence'],
    panel: {
      title: 'nav.onlineBookings',
      groups: [
        {
          heading: 'nav.onlineBookings',
          links: [
            { label: 'nav.marketplaceProfile', to: '/online-presence/locations', match: ['/online-presence/profile'] },
            { label: 'nav.reserveWithGoogle', to: '/online-presence/google-reserve' },
            { label: 'nav.facebookInstagram', to: '/online-presence/facebook-setup' },
            { label: 'nav.linkBuilder', to: '/online-presence/buttons-and-links' },
          ],
        },
        {
          heading: 'nav.yourWebsites',
          links: [
            { label: 'nav.smartWebsite', to: '/online-presence/smart-website' },
            { label: 'nav.productStore', to: '/online-presence/store' },
          ],
        },
      ],
    },
  },
  {
    id: 'marketing',
    label: 'nav.marketing',
    icon: Megaphone,
    to: '/marketing/blast-campaigns/home',
    match: ['/marketing'],
    panel: {
      title: 'nav.marketing',
      groups: [
        {
          heading: 'nav.messaging',
          links: [
            { label: 'nav.blastCampaigns', to: '/marketing/blast-campaigns/home', match: ['/marketing/blast-campaigns'] },
            { label: 'nav.automations', to: '/marketing/automated-messages' },
            { label: 'nav.messagesHistory', to: '/marketing/notifications' },
          ],
        },
        {
          heading: 'nav.promotion',
          links: [
            { label: 'nav.deals', to: '/marketing/deals' },
            { label: 'nav.smartPricing', to: '/marketing/peak-pricing' },
          ],
        },
        {
          heading: 'nav.engage',
          links: [{ label: 'nav.reviews', to: '/clients/online-reputation?tab=all' }],
        },
      ],
    },
  },
  {
    id: 'team',
    label: 'nav.team',
    icon: Users,
    to: '/team/team-members',
    match: ['/team'],
    panel: {
      title: 'nav.team',
      groups: [
        {
          heading: 'nav.team',
          links: [
            { label: 'nav.teamMembers', to: '/team/team-members' },
            { label: 'nav.scheduledShifts', to: '/team/scheduled-shifts' },
            { label: 'nav.timesheets', to: '/team/timesheets' },
            { label: 'nav.payRuns', to: '/team/payrun/overview', match: ['/team/payrun'] },
          ],
        },
      ],
    },
  },
  { id: 'reports', label: 'nav.reports', icon: LineChart, to: '/reports', match: ['/reports'] },
  { id: 'addons', label: 'nav.addons', icon: Grid2x2Plus, to: '/add-ons', match: ['/add-ons', '/payments'] },
  { id: 'settings', label: 'nav.settings', icon: Settings, to: '/setup', match: ['/setup'] },
]

export const HELP_ICON = CircleHelp

export interface SettingsCategory {
  id: string
  title: string
  description: string
  to: string
  groups: NavGroup[]
  shortcuts: NavLink[]
}

// Settings categories and their left-card pages (reference/settings-*.md).
export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    id: 'business-setup',
    title: 'settings.businessSetup.title',
    description: 'settings.businessSetup.description',
    to: '/setup/business-setup/business-details',
    groups: [
      {
        heading: '',
        links: [
          { label: 'pages.settingsBusinessDetails.title', to: '/setup/business-setup/business-details' },
          { label: 'pages.settingsLocations.title', to: '/setup/business-setup/location-details', match: ['/setup/location'] },
        ],
      },
    ],
    shortcuts: [
      { label: 'nav.serviceMenu', to: '/catalogue/services' },
      { label: 'nav.productList', to: '/catalogue/products' },
      { label: 'nav.memberships', to: '/catalogue/memberships' },
      { label: 'nav.packages', to: '/catalogue/packages' },
      { label: 'nav.clientsList', to: '/clients/list' },
    ],
  },
  {
    id: 'scheduling',
    title: 'settings.scheduling.title',
    description: 'settings.scheduling.description',
    to: '/setup/scheduling/time-and-calendar',
    groups: [
      {
        heading: '',
        links: [
          { label: 'pages.settingsTimeCalendar.title', to: '/setup/scheduling/time-and-calendar' },
          { label: 'pages.settingsWaitlist.title', to: '/setup/scheduling/waitlist' },
          { label: 'pages.settingsBlockedTimeTypes.title', to: '/setup/scheduling/blocked-time-types' },
          { label: 'pages.settingsResources.title', to: '/setup/scheduling/resources' },
          { label: 'pages.settingsCancellationReasons.title', to: '/setup/scheduling/cancellation-reasons' },
          { label: 'pages.settingsAppointmentStatuses.title', to: '/setup/scheduling/appointment-statuses' },
          { label: 'pages.settingsClosedPeriods.title', to: '/setup/scheduling/closed-periods' },
        ],
      },
      {
        heading: 'settings.scheduling.onlineBooking',
        links: [
          { label: 'pages.settingsDynamicAssignment.title', to: '/setup/scheduling/dynamic-assignment' },
          { label: 'pages.settingsAvailability.title', to: '/setup/scheduling/availability' },
          { label: 'pages.settingsBookingOptions.title', to: '/setup/scheduling/booking-options' },
        ],
      },
    ],
    shortcuts: [
      { label: 'nav.marketplaceProfile', to: '/online-presence/locations' },
      { label: 'nav.serviceMenu', to: '/catalogue/services' },
      { label: 'nav.scheduledShifts', to: '/team/scheduled-shifts' },
    ],
  },
  {
    id: 'sales',
    title: 'settings.sales.title',
    description: 'settings.sales.description',
    to: '/setup/sales/pay-now',
    groups: [
      {
        heading: '',
        links: [
          { label: 'pages.settingsPayNow.title', to: '/setup/sales/pay-now' },
          { label: 'pages.settingsTaxRates.title', to: '/setup/sales/tax-rates' },
          { label: 'pages.settingsReceipts.title', to: '/setup/sales/receipts' },
          { label: 'pages.settingsRegisters.title', to: '/setup/sales/registers' },
          { label: 'pages.settingsTipping.title', to: '/setup/sales/tipping' },
          { label: 'pages.settingsServiceCharges.title', to: '/setup/sales/service-charges' },
          { label: 'pages.settingsGiftCards.title', to: '/setup/sales/gift-cards' },
          { label: 'pages.settingsCheckoutMethods.title', to: '/setup/sales/payment-methods' },
        ],
      },
    ],
    shortcuts: [{ label: 'nav.paymentSettings', to: '/setup/payments/payment-policy' }],
  },
  {
    id: 'clients',
    title: 'settings.clients.title',
    description: 'settings.clients.description',
    to: '/setup/clients/client-sources',
    groups: [
      {
        heading: '',
        links: [
          { label: 'pages.settingsClientSources.title', to: '/setup/clients/client-sources' },
          { label: 'pages.settingsClientTags.title', to: '/setup/clients/client-tags' },
          { label: 'pages.settingsClientConnect.title', to: '/setup/clients/messages' },
        ],
      },
    ],
    shortcuts: [
      { label: 'nav.clientsList', to: '/clients/list' },
      { label: 'nav.clientSegments', to: '/clients/segments' },
      { label: 'nav.clientLoyalty', to: '/clients/loyalty' },
    ],
  },
  {
    id: 'billing',
    title: 'settings.billing.title',
    description: 'settings.billing.description',
    to: '/setup/billing/business-details',
    groups: [
      {
        heading: '',
        links: [
          { label: 'pages.billingDetails.title', to: '/setup/billing/business-details' },
          { label: 'pages.billingBankAccounts.title', to: '/setup/billing/bank-accounts' },
          { label: 'pages.billingPaymentMethods.title', to: '/setup/billing/payment-methods' },
          { label: 'pages.billingCommunication.title', to: '/setup/billing/communication-balance' },
          { label: 'pages.billingInvoices.title', to: '/setup/billing/invoices-and-fees' },
        ],
      },
      {
        heading: '',
        links: [{ label: 'pages.billingSubscriptions.title', to: '/setup/billing/subscriptions', match: ['/setup/billing/change-plan'] }],
      },
    ],
    shortcuts: [{ label: 'pages.settingsLocations.title', to: '/setup/business-setup/location-details' }],
  },
  {
    id: 'team',
    title: 'settings.team.title',
    description: 'settings.team.description',
    to: '/setup/team/permissions',
    groups: [
      {
        heading: '',
        links: [
          { label: 'pages.settingsPermissions.title', to: '/setup/team/permissions' },
          { label: 'pages.settingsTimeOff.title', to: '/setup/team/time-off' },
          { label: 'pages.settingsTimesheets.title', to: '/setup/team/timesheets' },
          { label: 'pages.settingsShifts.title', to: '/setup/team/shifts' },
          { label: 'pages.settingsPayRuns.title', to: '/setup/team/pay-runs' },
          { label: 'pages.settingsCommissions.title', to: '/setup/team/commissions' },
          { label: 'pages.settingsPinSwitching.title', to: '/setup/team/pin-switching' },
        ],
      },
    ],
    shortcuts: [
      { label: 'nav.teamMembers', to: '/team/team-members' },
      { label: 'nav.scheduledShifts', to: '/team/scheduled-shifts' },
    ],
  },
  {
    id: 'forms',
    title: 'settings.forms.title',
    description: 'settings.forms.description',
    to: '/setup/forms-and-notes/form-templates',
    groups: [{ heading: '', links: [{ label: 'pages.settingsFormTemplates.title', to: '/setup/forms-and-notes/form-templates' }] }],
    shortcuts: [],
  },
  {
    id: 'payments',
    title: 'settings.payments.title',
    description: 'settings.payments.description',
    to: '/setup/payments/payment-policy',
    groups: [
      {
        heading: '',
        links: [
          { label: 'pages.settingsPaymentPolicy.title', to: '/setup/payments/payment-policy' },
          { label: 'pages.settingsPaymentMethods.title', to: '/setup/payments/payment-methods' },
          { label: 'pages.settingsCardTerminals.title', to: '/setup/payments/terminals' },
        ],
      },
    ],
    shortcuts: [{ label: 'nav.salesSettings', to: '/setup/sales/pay-now' }],
  },
]

export const ACCOUNT_LINKS: NavLink[] = [
  { label: 'pages.myProfile.title', to: '/user-account/profile' },
  { label: 'pages.portfolio.title', to: '/user-account/portfolio' },
  { label: 'pages.accountReviews.title', to: '/user-account/reviews' },
  { label: 'pages.accountPayRuns.title', to: '/user-account/pay-runs' },
  { label: 'pages.workspaces.title', to: '/user-account/workspaces' },
  { label: 'pages.personalSettings.title', to: '/user-account/personal-settings' },
]

/** True when `pathname` (no query) falls under one of the prefixes. */
export function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p.endsWith('/') ? p : `${p}/`))
}

export function railItemForPath(pathname: string): RailItem | undefined {
  return RAIL_ITEMS.find((item) => matchesPrefix(pathname, item.match))
}

export function settingsCategoryForPath(pathname: string): SettingsCategory | undefined {
  return SETTINGS_CATEGORIES.find((c) =>
    c.groups.some((g) => g.links.some((l) => matchesPrefix(pathname, [l.to.split('?')[0], ...(l.match ?? [])]))),
  )
}

# Reference map

Maps every page captured in `/reference` to a route in Innoweb Bookings. Paths follow the reference wherever possible. Three rules change them:

1. Any path segment carrying the reference product's name is renamed. `/fresha/online-booking/*` becomes `/online-presence/*`, `/fresha/card-processing/*` becomes `/payments/*` and `fresha-insights` becomes `insights`.
2. Billing (`/legal-entities/new-legal-entity/settings/*`) moves under `/setup/billing/*`.
3. Drawers and modals that the reference mounts as `…/drawer/<name>/…` child routes are opened with a `?drawer=<name>&id=<id>` search param on the current page. This keeps "open over any page" behaviour without duplicating child routes everywhere. Full-screen forms and wizards keep their own routes.

Phase = the build phase in SPEC.md §9 that delivers the page. Every route in this file is registered in `src/app/routeRegistry.ts`, and as of Phase 0 renders a stub.

## App shell (home.md §1, top-bar.md, help.md, profile-and-personal-settings.md)

| Reference | Our route / trigger | Phase |
|---|---|---|
| Login (not captured, built from SPEC §8) | `/login`, `/forgot-password`, `/reset-password` | 0 |
| Top bar: logo → calendar | `/calendar` | 0 |
| Continue setup → Resources drawer, Guides tab | `?drawer=resources&tab=guides` | 4 |
| Search dialog | `?drawer=search` (dialog) | 4 |
| Performance insights drawer | `?drawer=performance-insights` | 4 |
| Notifications drawer (5 tabs) | `?drawer=notifications&tab=appointments` | 4 |
| Connect inbox (`/connect/customers/conversations/<id>`) | `/connect`, `/connect/conversations/:id` | 4 |
| Wallet drawer (accounts, credits) | `?drawer=wallet&tab=accounts` | 4 |
| User menu (avatar) | popover | 5 |
| Help drawer (`…/drawer/resources/support/`) + email, phone, help centre, news | `?drawer=resources&tab=help` (+ `&view=email|help-center|phone`), `&tab=news` | 5 |
| Referral drawer | `?drawer=referral` | 5 |
| Activate plan banner | banner → `/setup/billing/subscriptions` | 5 |

## Home (home.md)

| Reference | Our route | Phase |
|---|---|---|
| `/dashboard` | `/dashboard` (`/` redirects here) | 2 |
| `/dashboard/drawer/view-appointment/<id>` | `/dashboard?drawer=appointment&id=<id>` | 2 |

## Calendar (calendar.md)

| Reference | Our route | Phase |
|---|---|---|
| `/calendar?date=&view=day|day_3|week|month&location_id=&calendar_selected_resources=` | `/calendar` with the same query params | 2 |
| Visibility filters / settings / waitlist drawers | `/calendar?drawer=visibility-filters|settings|waitlist` | 2 |
| New appointment drawer | `/calendar?drawer=new-appointment&…appt_*` | 2 |
| View appointment drawer | `/calendar?drawer=appointment&id=` | 2 |
| Checkout drawer (cart, tip, payment) | `?drawer=checkout&step=cart|tip|payment` | 2 |
| Sale (invoice) drawer | `?drawer=sale&id=&tab=details|notes|activity` | 2 |
| Gift card drawer | `?drawer=gift-card&id=` | 2 |
| Group appointment drawer | `?drawer=appointment-group&id=` | 2 |
| Blocked time drawer | `?drawer=blocked-time&id=new` | 2 |
| Pick modes | `/calendar/pick-from-calendar`, `/calendar/book-from-waitlist-entry/:id`, `/calendar/reschedule-appointment/:id`, `/calendar/rebook-appointment/:id`, `/calendar/book-appointment-for-group/new`, `/calendar/add-to-group/:groupId`, `/calendar/blocked-time` | 2 |
| Add a form (`/clients/form-selection/select`) | `/clients/form-selection/select?appointmentId=` | 2 |
| Payments add-on page (`/fresha/card-processing/payment-processing`) | `/payments/payment-processing` | 2 |

## Sales (sales.md)

| Reference | Our route | Phase |
|---|---|---|
| Daily sales summary | `/sales/daily-sales` | 3 |
| Register (+ setup modal, period drawer) | `/sales/register` (`?drawer=register-period&id=`) | 3 |
| Pay team member tips wizard | `/team/payrun/new?cashRegisterId=` | 3 |
| Appointments | `/sales/appointments-list` | 3 |
| Sales (Sales / Drafts tabs) | `/sales/sales-list` | 3 |
| Refund sale | `/sales/refund-sale/:saleId` | 3 |
| Edit sale details | `/sales/sales-list?modal=edit-sale&id=` | 3 |
| Payment transactions | `/sales/payment-transactions` | 3 |
| Gift cards sold | `/sales/gift-cards` | 3 |
| Packages sold | `/sales/packages-sold` | 3 |
| Memberships sold (`/sales/paid-plans` → `/sales/memberships`) | `/sales/memberships` (`/sales/paid-plans` redirects) | 3 |
| Product orders | `/sales/store-orders` | 3 |

## Clients (clients.md)

| Reference | Our route | Phase |
|---|---|---|
| Clients list | `/clients/list` | 3 |
| Add client / edit client (full screen) | `/clients/list/add`, `/clients/list/:id/edit?section=` | 3 |
| Import clients (4 steps) | `/clients/client-import/:step` (`upload`, `mapping`, `preview`, `progress`) | 3 |
| Merge profiles | `/clients/list/merge/:id` | 3 |
| Client profile drawer (+ tabs) | `?drawer=client&id=&tab=` | 3 |
| Client segments | `/clients/segments` | 3 |
| Edit segment / create custom segment | `/clients/segments/edit/:id/rules`, `/clients/segments/create/rules`, `/clients/segments/create/details` | 3 |
| Client loyalty (promo) | `/clients/loyalty` | 3 |
| Client loyalty enable screen | `/add-ons/add-on/loyalty/setup` | 5 |
| Online reputation (Overview / All reviews) | `/clients/online-reputation?tab=overview|all` | 3 |
| Google connect modal (`/google/landing`) | `/clients/online-reputation?modal=google` | 3 |

## Catalog (catalog.md)

| Reference | Our route | Phase |
|---|---|---|
| Service menu | `/catalogue/services` | 3 |
| Add / edit service | `/catalogue/services/service/add/new`, `/catalogue/services/service/edit/:id?section=` | 3 |
| New / edit bundle | `/catalogue/services/package/add/new`, `/catalogue/services/package/edit/:id` | 3 |
| Set menu order / booking sequence / bulk edit | `/catalogue/services/menu-order`, `/catalogue/services/booking-sequence`, `/catalogue/services/bulk-edit` | 3 |
| Packages (intro, list, Holders tab) | `/catalogue/packages` | 3 |
| Add / edit package | `/catalogue/packages/add`, `/catalogue/packages/edit/:id` | 3 |
| Memberships (intro + Payments gate) | `/catalogue/memberships` | 3 |
| Products (intro, list) | `/catalogue/products` | 3 |
| Add / edit product | `/catalogue/products/add`, `/catalogue/products/edit/:id` | 3 |
| Product drawer | `?drawer=product&id=` | 3 |
| Stocktakes list / create / count / review / summary | `/catalogue/stocktakes`, `/catalogue/stocktakes/new`, `/catalogue/stocktakes/:id/count`, `/catalogue/stocktakes/:id/review`, `/catalogue/stocktakes/:id` | 3 |
| Stock orders list / create / receive | `/catalogue/orders`, `/catalogue/orders/new`, `/catalogue/orders/:id/receive` | 3 |
| Stock order drawer | `?drawer=stock-order&id=` | 3 |
| Suppliers list / edit | `/catalogue/suppliers`, `/catalogue/suppliers/add`, `/catalogue/suppliers/edit/:id` | 3 |
| Supplier drawer | `?drawer=supplier&id=` | 3 |

## Online presence (online-booking.md)

| Reference | Our route | Phase |
|---|---|---|
| Marketplace profile (intro) | `/online-presence/locations` | 4 |
| Profile wizard (11 steps) | `/online-presence/profile/edit/:locationId/:step` | 4 |
| Profile dashboard (+ sub-pages) | `/online-presence/profile/dashboard/:locationId/:tab?` | 4 |
| Reserve with Google (redirect) | `/online-presence/google-reserve` → `/add-ons#integrations` | 4 |
| Facebook and Instagram bookings | `/online-presence/facebook-setup` | 4 |
| Link builder | `/online-presence/buttons-and-links` | 4 |
| Smart Website (intro + wizard) | `/online-presence/smart-website`, `/online-presence/smart-website/:step` | 4 |
| Product store | `/online-presence/store` | 4 |

## Marketing (marketing.md)

| Reference | Our route | Phase |
|---|---|---|
| Blast campaigns | `/marketing/blast-campaigns/home` | 4 |
| Blast billing wizard | `/legal-wizard/blast-marketing/:step` | 4 |
| Campaign builder (not captured) | `/marketing/blast-campaigns/new`, `/marketing/blast-campaigns/:id` | 4 |
| Automations | `/marketing/automated-messages` | 4 |
| Automation detail | `/marketing/automated-messages/overview/:id?tab=performance|preview|details` | 4 |
| Edit automation / edit email content | `/marketing/automated-messages/configure/:id`, `/marketing/automated-messages/configure/:id/email` | 4 |
| Messages history | `/marketing/notifications` | 4 |
| Deals (intro, list, wizard) | `/marketing/deals`, `/marketing/deals/list`, `/marketing/deals/new/:step` | 4 |
| Smart pricing (intro, wizard, overview) | `/marketing/peak-pricing`, `/marketing/peak-pricing/setup/:step`, `/marketing/peak-pricing/details` | 4 |
| Reviews (menu link) | `/clients/online-reputation?tab=all` | 3 |

## Team (team.md)

| Reference | Our route | Phase |
|---|---|---|
| Team members | `/team/team-members` | 4 |
| Add / edit team member | `/team/team-members/add?section=`, `/team/team-members/edit/:id?section=` | 4 |
| Change order | `/team/team-members/reorder` | 4 |
| Link a calendar wizard | `/team/team-members/calendar-sync/:step` | 4 |
| Team member drawer | `?drawer=team-member&id=&tab=` | 4 |
| Scheduled shifts | `/team/scheduled-shifts` | 4 |
| Set repeating shifts | `/team/scheduled-shifts/working-hours-setup/:locationId/:memberId/:date` | 4 |
| Timesheets / add | `/team/timesheets`, `/team/timesheets?drawer=add-timesheet` | 4 |
| Timesheet drawer | `?drawer=timesheet&id=` | 4 |
| Pay runs (Pay periods / Settlements) | `/team/payrun/overview`, `/team/payrun/settlements` | 4 |
| Pay team wizard | `/team/payrun/new` | 4 |

## Reports (reports.md)

| Reference | Our route | Phase |
|---|---|---|
| Landing + groups (All, Favourites, Dashboards, Standard, Premium, Custom) | `/reports` → `/reports/report-group/:groupId?category=` | 5 |
| Data connector | `/reports/data-connector` | 5 |
| 3 dashboards | `/reports/table/performance`, `/reports/table/online-presence`, `/reports/table/loyalty_dashboard` | 5 |
| 56 reports (r04–r59, slugs in reports.md §4) | `/reports/table/:slug` | 5 |
| Insights gate / enable screen | `/add-ons/add-on/insights/intro`, `/add-ons/add-on/insights/setup` | 5 |

## Add-ons (add-ons.md)

| Reference | Our route | Phase |
|---|---|---|
| Add-ons page (Add-ons / Integrations tabs) | `/add-ons` (`#integrations`) | 5 |
| Add-on intro modal / enable screen | `/add-ons/add-on/:slug/intro`, `/add-ons/add-on/:slug/setup` | 5 |
| Manage page | `/add-ons/manage/:slug` | 5 |
| Integration intro | `/add-ons/integration/:slug/intro` | 5 |
| Smart Website add-on | `/add-ons/smart-website` → `/online-presence/smart-website` | 5 |
| Payments onboarding wizard | `/payments/onboarding/:step` | 5 |
| Plan activation (`/subscription-wizard/upgrade/billing_details`) | `/setup/billing/change-plan` | 5 |

## Settings (settings-*.md)

| Reference | Our route | Phase |
|---|---|---|
| Workspace settings landing | `/setup` | 5 |
| Business details / edit | `/setup/business-setup/business-details`, `/setup/business-setup/business-details/edit` | 5 |
| Locations / add location / location page | `/setup/business-setup/location-details`, `/setup/location/new/:step`, `/setup/location/:id/:tab` | 5 |
| Scheduling (10 pages) | `/setup/scheduling/{time-and-calendar,waitlist,blocked-time-types,resources,cancellation-reasons,appointment-statuses,closed-periods,dynamic-assignment,availability,booking-options}` | 5 |
| Sales (8 pages) | `/setup/sales/{pay-now,tax-rates,receipts,registers,tipping,service-charges,gift-cards,payment-methods}` | 5 |
| Clients (3 pages) | `/setup/clients/{client-sources,client-tags,messages}` | 5 |
| Team (7 pages) | `/setup/team/{permissions,time-off,timesheets,shifts,pay-runs,commissions,pin-switching}` | 5 |
| Edit permissions / add role | `/setup/team/permissions/:roleId/edit`, `/setup/team/permissions/add/:step` | 5 |
| Forms: templates, builder, overview, preview | `/setup/forms-and-notes/form-templates`, `…/create`, `…/:id/edit`, `…/:id/details`, `…/:id/preview` | 5 |
| Payments (3 pages) | `/setup/payments/{payment-policy,payment-methods,terminals}` | 5 |
| Billing (6 pages) | `/setup/billing/{business-details,bank-accounts,payment-methods,communication-balance,invoices-and-fees,subscriptions}` | 5 |
| Change your plan (SPEC §7 Billing; not captured) | `/setup/billing/change-plan` | 5 |
| Resource modal | `/setup/scheduling/resources/new`, `/setup/scheduling/resources/:id` | 5 |
| PIN switching wizard | `/setup/team/pin-switching/setup` | 5 |

## Account area (profile-and-personal-settings.md)

| Reference | Our route | Phase |
|---|---|---|
| My profile / edit | `/user-account/profile`, `/user-account/profile/edit/:section` | 5 |
| Portfolio, Reviews, Pay runs | `/user-account/portfolio`, `/user-account/reviews`, `/user-account/pay-runs` | 5 |
| Workspaces / workspace settings (+ notification preferences modal) | `/user-account/workspaces`, `/user-account/workspaces/:id/settings` | 5 |
| Personal settings, Personal info, Login & security, Appearance | `/user-account/personal-settings`, `…/personal-info`, `…/login-security`, `…/appearance` | 5 |

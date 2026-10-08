# Progress

Status as of 2026-10-08: **Phase 0 complete.** Pages marked ☑ are built; every other page has a registered route that renders a stub naming its phase and reference section (see REFERENCE_MAP.md).

Checks at the end of Phase 0: `npm run typecheck` ✓ · `npm run lint` ✓ · `npm test` 12/12 ✓ · `npm run build` ✓ · `npm run e2e` 2/2 ✓.

## Phase 0: reference, scaffold, tokens, login, shell

- [x] SPEC.md saved
- [x] Read reference/INDEX.md and all 22 section files
- [x] REFERENCE_MAP.md (every reference page → route)
- [x] Project scaffold: Vite, React 18, strict TypeScript, Tailwind with CSS-variable tokens, React Router, Zustand persist, react-hook-form + zod, i18next (`locales/en.json`), lucide-react, date-fns, Recharts, dnd-kit, faker, idb-keyval, Vitest, Playwright
- [x] Design tokens proposed (DESIGN_TOKENS.md) and implemented (light + dark, reduced motion)
- [x] Login screen with inline validation, show/hide password, demo account quick-fill
- [x] Forgot password → reset link → choose new password (one-time token)
- [x] Session handling, protected routes, `?next=` return after login, log out
- [x] Permission-based navigation: rail items and routes hidden or blocked by role (staff `basic` sees Calendar and Sales only)
- [x] Top bar: wordmark → Calendar, Continue setup, Search, Performance insights, Notifications, inbox, Wallet with badge, avatar menu
- [x] Avatar menu: profile header, Verify mobile, My profile, Personal settings, referral, Help and support, language, Log out
- [x] Main menu rail in SPEC order, tooltips, active highlight, Help pinned to the bottom
- [x] Left menu panel: docked on section routes, overlay flyout from other pages, group headings, collapse/expand chevron, collapsed state persists
- [x] Drawer host (`?drawer=`) with close button, Escape, tab bars
- [x] Toasts
- [x] Full-screen layout, account-area layout, settings sub-page layout (category card, shortcuts ↗, Back + breadcrumb)
- [x] Workspace settings landing (8 category cards, Online presence / Marketing / Other rows)
- [x] Reports landing navigation: 6 groups with counts, category tabs, search, 59 report cards, favourites (persisted)
- [x] Stub route for every page (166 routes, 4 redirects, role-based `/` landing)
- [x] Unit tests: route registry, locale coverage, no reference product name in routes or strings, auth API, permissions
- [x] Playwright: login, every main-menu item, every flyout panel, staff blocked from Settings

## Phase 1: data, mock API, availability, seed, demo panel

- [ ] Types for every entity in SPEC §4 plus reference extras
- [ ] `src/api/*` service layer with latency; UI never touches the store directly
- [ ] BroadcastChannel cross-tab sync
- [ ] Availability engine + Vitest coverage
- [ ] Seed (Porto, EUR, IVA 23% inclusive; 2 locations, 6 team, ~40 services, 200 clients, 10 weeks past + 3 weeks ahead)
- [ ] Demo panel (Ctrl+Shift+D): reset, switch role, simulate client actions, business events, outbox, time travel
- [ ] Password-reset email delivered to the demo outbox

## Phase 2: Home, Calendar, appointments, checkout

- [ ] Home: Recent sales, Upcoming appointments, Appointments activity, Today's next appointments, Top services, Top team member, filter popovers, click-through
- [ ] Calendar toolbar, date picker, team selector, All filters drawer + presets, calendar settings, waitlist drawer and flows
- [ ] Grid: day / 3 day / week / month, slot quick actions, status colours, hover card, current-time line
- [ ] New appointment (pick mode, Services › Time, client picker, service editor, extra time, repeat, notes)
- [ ] Appointment drawer, status menu, Options menu (notes, form, activity, repeating, group, rebook, reschedule, no-show, cancel)
- [ ] Drag to reschedule, resize, drag between members, conflict warnings
- [ ] Group appointments, blocked time + types, Add → Sale, Quick payment
- [ ] Checkout: cart categories, quick sale, tips, all payment methods (cash, redeem gift, split, other, card terminal, self checkout, QR code, manual card), discounts, receipt note, service charges, fees, deposits
- [ ] Sale drawer, receipt PDF, email receipt to outbox, gift card sell/redeem, gift card drawer

## Phase 3: Sales, Clients, Catalog

- [ ] Daily sales (live tables, PDF/CSV/Excel exports matching `reference/screenshots/files`)
- [ ] Register: setup, open, cash counter, cash in/out, count, close, period drawer, tips pay run
- [ ] Appointments list, Sales list (+ Drafts, refund, void, edit sale details), Payment transactions
- [ ] Gift cards / Packages / Memberships sold, Product orders
- [ ] Clients list, filters, bulk actions, add/edit client, CSV import (template matches reference), merge, client drawer (all tabs and dialogs)
- [ ] Client segments + builder, Client loyalty promo, Online reputation
- [ ] Service menu (editor, variants, advanced pricing, categories, bundles, archive/delete, ordering, bulk edit, PDF export)
- [ ] Packages, Memberships gate, Products (+ drawer, stock in/out), Stocktakes, Stock orders, Suppliers

## Phase 4: Online booking, Marketing, Team, top-bar panels

- [ ] Marketplace profile intro, wizard, dashboard; Facebook/Instagram; Link builder; Smart Website; Product store
- [ ] Blast campaigns (billing wizard + campaign builder, statuses Draft / Pending / Scheduled / Sent), Automations (+ detail, flow and email editors), Messages history, Deals, Smart pricing
- [ ] Team members (list, filters, sort, actions, add/edit form, reorder, calendar sync), member drawer, Scheduled shifts, Timesheets, Pay runs (+ breakdown, adjustments, settlements, Pay team wizard)
- [ ] Top-bar drawers: Guides, Search, Performance insights, Notifications, Connect inbox, Wallet
- [ ] Team invites create staff logins when accepted

## Phase 5: Reports, Add-ons, Settings, Billing, account area, Help

- [ ] 3 dashboards and 56 reports (group by, date range, filters, advanced filters, column menu, customize, drill-down, premium overlay, CSV/XLSX/PDF exports matching reference)
- [ ] Add-ons page, intro modals, enable screens, manage pages, integrations, Payments onboarding
- [ ] Every settings page and modal (business setup, scheduling, sales, clients, team + permission matrix, forms builder, payments, billing)
- [ ] Billing: Independent €19.95 / Team €12.95 per bookable member (excl. IVA), Change your plan, invoices with PDF preview at IVA 23%, message credits, second bookable member on Independent → Change your plan
- [ ] Avatar menu destinations, My profile + editor, Portfolio, Reviews, Pay runs, Workspaces + notification preferences, Personal settings (info, login & security, appearance with theme switch)
- [ ] Help drawer (home, help centre, email form, phone, simulated live chat, News), referral drawer

## Phase 6: polish

- [ ] Empty, loading and error states everywhere; tablet and dark-mode pass
- [ ] Playwright: every left-menu link + golden path
- [ ] README walkthrough script

## Needs reference

Built from SPEC.md because the reference didn't capture them (INDEX.md "Not captured" lists and per-file gaps):

**App shell and account**
- Login, forgot password and reset screens (no public pages were captured)
- Live chat (Help and Premium Support): opened, never connected
- Sending messages in the Connect inbox; Team Connect inbox (paid add-on)
- Bookings Boss and Payments Pro guide task lists
- Language picker lists (user menu and business details)
- Destructive and verification account actions: sign out of devices, delete account, connect/disconnect social login, create password, verify mobile, hide profile, transfer/delete workspace

**Home and calendar**
- Upcoming appointments card with data
- Card terminal, Self checkout, QR code, Manual card entry and Pay now (all stopped at the Payments add-on page)
- Print receipt
- No-show and reschedule client notifications
- Checkout group, Ungroup, No-show all, Cancel all, Save as draft, Cancel sale, Void sale results
- Drag-and-drop reordering (only the modals were captured)
- Deposits and cancellation policy configured state

**Sales**
- Completing the tips pay run (needs an emailed code)
- Exchanged and Part paid sale states
- Excel exports (PDF and CSV were captured)

**Clients**
- Custom segments tab with content
- Gender filter options
- Avatar photo and Files uploads
- Google Business Profile connection
- Client Loyalty after activation

**Catalog**
- Memberships (create and sell; needs Payments)
- Service add-on groups, resources on services, portfolio photo uploads
- Stock order PDF download and supplier email
- Import products, Manage my brands, Manage my categories pages

**Online presence**
- Published marketplace profile, live booking links, QR codes, Facebook/Instagram connection, published Smart Website, profile Preview
- Product store (needs Payments)

**Marketing**
- Blast campaign builder and draft campaigns (Draft / Pending / Scheduled / Sent)
- Marketing automations needing a published profile (birthdays, win-back, custom)
- Auto top-ups and balance top-up
- Flash sale and Last-minute offer detail steps

**Team**
- Inviting a member (roles above No access) and invite acceptance
- Completing a pay run
- Google calendar linking
- Commissions setup wizard
- Delete this shift; confirmed deletes (all shifts, timesheet, permanent delete)

**Reports**
- Insights add-on unlocked: custom reports, folders, Duplicate, Customize edits, premium report data
- Per-report Group-by, date and filter lists other than Sales summary (screenshots only)
- Charts inside Customize / Show chart

**Add-ons**
- Every paid activation after the Enable/billing screen
- Payments setup beyond "Enter your business details"
- Xero and QuickBooks after "Connect to …"
- Meta Pixel, Google Analytics and Google Ads ID forms; Google Reserve

**Settings**
- Add new location steps 2–4; Delete location
- A saved Resource
- Service charge and custom payment method saved states
- Register archive and delete
- Pay now setup and online tipping
- Tag delete and reorder; Generate QR output
- Form template activation and saving a new template
- Payment policy, payment methods and card terminals configured states
- Saving roles, Duplicate / Set as default / Delete role, Add permission role steps 2–3, PIN switching remaining steps
- Billing: plan activation, "Change your plan" between Independent and Team, invoices, payment methods, communication balance (all view-only or gated in the capture)

# Build brief: Innoweb Bookings — interactive demo of a salon & wellness business workspace

## 0. Source of truth

- `/reference` contains the full capture of the reference workspace: section spec files (.md), screenshots, exported files and INDEX.md.
- For navigation labels and their order, page titles and subtitles, table columns and rows, button names, dropdown options, form fields and flows, **the reference files override this brief**.
- Before building any page, read its section file and check its screenshots. If a page isn't covered, build it from this brief and add it to a "Needs reference" list in `PROGRESS.md`.
- The reference is for structure, wording and behaviour only. Visual styling comes from our own design tokens (section 3).

## 1. What we're building

A front-end-only, fully clickable demo ("sandbox") of the **logged-in business workspace** of a booking and business-management platform for salons, barbers, nail studios, spas and clinics. Feature parity with Fresha's partner workspace: the same sections, the same sub-pages, the same actions and the same flows, so I can walk my team through a complete product. It uses **our own brand and visual identity** (see section 3).

**Out of scope:** any public marketing website, pricing pages, or client-facing marketplace/booking site. The app starts at a login screen and everything after that is the workspace.

There is no backend. Everything runs in the browser on seeded mock data, but it must **behave like a real product end to end**:

> An online booking arrives (simulated from the demo panel) → it appears in the calendar with a notification → staff mark the client as arrived → check out → the sale shows in Sales and Reports → the client's profile and history update.

**Rule: no dead ends.** Every button, link, menu item, toggle and form must do something believable. If something can't really happen (sending an SMS, charging a card, connecting Google), simulate it: loading state → success state → the result visible elsewhere in the app. No "coming soon" placeholders.

## 2. Tech stack

- Vite + React 18 + TypeScript (strict)
- Tailwind CSS, with design tokens as CSS variables (light and dark theme)
- React Router
- Zustand with the persist middleware as the single source of truth (localStorage; move to IndexedDB via `idb-keyval` if the state gets large)
- `BroadcastChannel` to sync state between browser tabs, so two screens (e.g. owner and front desk) update live
- date-fns for all date maths, Recharts for charts, dnd-kit for calendar drag and drop
- lucide-react for all icons (no other icon sources)
- react-hook-form + zod for forms and validation
- @faker-js/faker with a fixed seed for mock data
- Vitest for unit tests, Playwright for end-to-end tests
- i18n-ready from day one: every UI string lives in `locales/en.json` (pt-PT added later)

## 3. Brand and visual design

- Brand name: **Innoweb Bookings**. Logo: a simple "Innoweb Bookings" wordmark placeholder I will replace.
- Colours: primary **#0E6E6A** (deep teal), accent **#F4B23E** (marigold), plus light and dark neutrals derived from them.
- Original visual identity: our own typography, spacing, illustrations and empty-state artwork. Do not copy Fresha's logo, colours, icons, illustrations, marketing copy or any of its assets, and do not use the Fresha name anywhere in the UI or code. Match how it works, not how it looks.
- Before building any UI, propose a compact design token system (named colours for light and dark built from the colours above, type scale, spacing, radii, shadows) and wait for my approval.
- Desktop-first (1280px+), still usable on tablet.
- Quality floor everywhere: loading skeletons, empty states with a clear next action, a toast for every completed action, confirmation dialogs for destructive actions, inline validation, visible keyboard focus, reduced motion respected.

## 4. Mock backend

Build a service layer in `src/api/*` that the UI calls as if it were a real API: async functions with 300–800 ms simulated latency that read and write the store. UI components never mutate the store directly. This keeps a real backend swappable later.

### Data model (`src/types`)

Workspace, Location, OpeningHours, ClosedPeriod, User (business login), TeamMember, PermissionLevel, Shift, TimeOff, Timesheet (with activity log), PayRun (with adjustments), ServiceCategory, Service (treatment name, menu category, treatment type, description, price type, price, duration, variants, add-ons, extra time, per-team-member and per-location price/duration, team members, locations, resources, images, online availability limits, patch-test requirement, tax rate), Bundle, Membership, Product, Supplier, StockOrder, Stocktake, StockMovement, ProductOrder (online store orders), RegisterSession, Client (source, labels such as "New"), ClientNote, ClientSegment, FormTemplate, FormResponse, PatchTest, Appointment (items, status, source: online/phone/walk-in, deposit, repeat rule), GroupAppointment, BlockedTime, WaitlistEntry, Sale (items, discounts, tips, taxes, service charges), Payment, Refund, GiftCard, Package, Deal/PromoCode, Campaign (status: Draft / Pending / Scheduled / Sent), Automation, MessageLog, Conversation, Review, Notification, Wallet, Payout, AddOn, Settings. Extend this with anything the reference files show.

### Availability engine (`src/lib/availability.ts`)

The heart of the demo. Computes bookable slots from: location opening hours, closed periods, team scheduled shifts (online bookings only fall inside shifts), time off, blocked time, existing appointments, service duration plus extra time and buffers, required resources, online availability limits, minimum notice, maximum advance window, and "any professional" assignment. The calendar, the add-appointment flow and the simulated online bookings must all use it. Cover it with Vitest unit tests.

### Seed data (`src/mock/seed.ts`)

Fixed seed, realistic for Porto, Portugal: EUR, IVA 23% (tax inclusive), Portuguese names and addresses.

- One salon business with 2 locations and 6 team members with different roles and shift patterns
- ~40 services in 6 categories (with some variants and add-ons), 3 bundles, 2 memberships, 30 retail products, 3 suppliers
- 200 clients with history, including marketplace-sourced clients
- 10 weeks of past appointments and sales (so dashboards, charts and reports are full) and 3 weeks of upcoming bookings, including online bookings, no-shows, late cancellations, refunds, gift cards, packages, product orders and reviews
- Ready-made logins: `owner@demo.app` and `staff@demo.app` (limited permissions), both with password `demo1234`

## 5. Presenter tools (demo panel)

A hidden panel opened with `Ctrl+Shift+D`. This is how client-side activity enters the demo:

- **Reset demo** to the seed state
- **Switch role** (owner / receptionist / team member) to show permissions
- **Simulate client actions**: new online booking (pick or randomise client, service, team member and a real free slot from the availability engine, with or without deposit), client reschedules, client cancels (late cancellation fee if inside the policy window), client buys a gift card online, client places a product store order, client leaves a review, client sends a message. Each one updates the calendar, notifications, client profile, sales and reports exactly as a real event would.
- **Simulate business events**: low-stock alert, card declined at checkout, payout completed, blast campaign approved after review
- **Demo outbox**: every email, SMS and WhatsApp the system "sends" (confirmations, reminders, receipts, campaigns, invites, password resets) appears here, rendered as it would look on a phone or in an inbox
- **Set today's date** (time travel) so the demo always looks current

## 6. App shell

- **Main menu**: a narrow, icon-only vertical rail on the far left with a tooltip on hover and a highlighted active item. Order: Home, Calendar, Sales, Clients, Catalog, Online booking, Marketing, Team, Reports, Add-ons, Settings. A Help icon is pinned to the bottom of the rail.
- **Left menu panel**: sections with sub-pages open a second column beside the rail showing the section title, its sub-page links, and optional group headings with their own links (e.g. Sales → "Sold items"). It collapses and expands with a chevron button on its edge; the state persists. Home and Calendar use the full width with no left menu panel.
- **Top bar** (full width): logo on the left; on the right a "Continue setup" button, Search, Performance insights, Notifications, the inbox, Wallet, and the profile avatar with the user's initials. Follow reference/top-bar.md exactly.
- **Page header pattern**: page title, one-line subtitle, actions on the right (e.g. an Export dropdown and a primary "Add" / "Add new" button).
- **Detail views** (new/edit service, edit team member, client view, appointment, campaign builder, checkout) follow the layouts recorded in the reference files.
- Every list row has an Actions (three dots) menu.

## 7. Sections

Build every section exactly as documented in its reference file. The notes below are the minimum; the reference files add the full detail.

### Home

Dashboard widgets: Recent sales (last 7 days: total, appointment count and value, sales vs appointments chart), Upcoming appointments (next 7 days chart, empty state "Your schedule is empty"), Appointments activity feed, Today's next appointments, Top services (this month vs last month), Top team member (this month vs last month). Every item clicks through to its record.

### Calendar

- Toolbar: Today and date navigation, view switcher, team member and location filters, calendar settings, and an **Add** button with the options in the reference
- Clicking a booking opens the appointment panel on the right with all appointment details, a "Pay now" / "Checkout" button, and a three-dots quick-actions menu with every action listed in the reference (including add notes, add a form, view appointments, activity, set as repeating, add to group appointment, rebook, reschedule, no-show, cancel)
- Appointment creation: client (existing, new, walk-in), services, date and time, repeat options, notes; the "Services › Time" booking flow from the reference
- Drag to reschedule, drag the bottom edge to change duration, drag between team members, with conflict warnings
- Group appointments, extra time, resources, waitlist, calendar settings

### Checkout

- Cart with services, add-ons, products, packages, memberships and gift cards; team member per item; editable price
- Tip selection by percentage or custom amount, then continue to payment
- Every payment option in the reference (including cash, redeem gift card, split payment, other, card terminal, self-checkout, QR code), each with its amount-entry screen and flow
- Discounts, taxes (IVA 23% inclusive), service charges, late cancellation and no-show fees, deposits deducted
- Receipt screen matching the captured receipt format; email/SMS receipt to the demo outbox
- Refunds and voids, reflected in Sales and Reports

### Sales

Daily sales summary (Transaction summary and Cash movement summary tables, computed live), Register, Appointments, Sales, Payments, and the "Sold items" group (Gift cards sold, Packages sold, Memberships sold, Product orders), all per the reference.

### Clients, Catalog, Online booking, Marketing, Team, Reports, Add-ons, Settings

Build every sub-page, list, detail view, form, menu and flow per the reference files, including all "Add" menus, three-dots menus, empty states and confirmation messages. Exports must produce files matching the captured exports.

Billing: current plan is Independent €19.95/month for one bookable team member, or Team €12.95 per bookable team member/month, both excluding IVA; "Change your plan" flow between the two; invoices with PDF preview showing IVA at 23%; message credits. Adding a second bookable team member on the Independent plan redirects to "Change your plan".

### Top bar, profile menu, Personal settings, Help

Per reference/top-bar.md, reference/profile-and-personal-settings.md and reference/help.md. Live chat, support email and phone support are simulated.

## 8. Login and access

- A single login screen as the entry point (no public pages before it); forgot password with the reset link in the demo outbox
- Team invites create staff logins when accepted
- Session handling, protected routes, permission-based navigation (staff don't see Reports, Marketing or Settings unless their permission level allows it)

## 9. Build order

Work phase by phase. After each phase: run typecheck, lint, unit tests and the production build; fix every error; commit; update `PROGRESS.md` (a checklist of every page and action in this brief and the reference, ticked as built, plus the "Needs reference" list). Then stop and show me before moving on.

0. Read reference/INDEX.md and every section file, and write `REFERENCE_MAP.md` mapping each reference page to a route. Scaffold the project, propose design tokens (wait for approval), build the login screen and app shell, and stub a route for every page
1. Types, mock API layer, availability engine with tests, seed data, demo panel with simulated client actions
2. Home, Calendar, appointments, checkout
3. Sales, Clients, Catalog
4. Online booking, Marketing, Team, top bar panels, notifications, inbox, wallet
5. Reports, Add-ons, Settings, Billing, profile menu, Personal settings, Help
6. Polish: empty, loading and error states everywhere; tablet and dark-mode checks; a Playwright suite that clicks every main-menu item and every left-menu link, and runs the golden path (simulated online booking → appears in calendar → arrived → checked out → appears in Daily sales, Sales and Reports → client profile updated)

## 10. Definition of done

- Every page, button, menu and flow in the reference files exists and works against mock data
- Every label, page title, table column and button name matches the reference
- No console errors, no dead buttons, no placeholders
- The golden path runs end to end in under 3 minutes in a fresh browser
- State persists across refresh, and Reset demo restores the seed
- `npm run dev` starts it, and the README covers demo logins, the demo panel and a step-by-step walkthrough script I can follow when presenting to my team

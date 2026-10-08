# Progress

Status: **all phases (0–6) built and reviewed.** Every route in `src/app/routeRegistry.ts` renders a real page; each section was reviewed against its reference file with every flow clicked through in a browser.

## Checks

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm test` (Vitest) | 37 tests: availability engine (16), seed, auth and permissions, golden path at the data level, locale coverage, route registry |
| `npm run build` | passes |
| `npm run e2e` (Playwright) | golden path (online booking → arrived → checkout → Daily sales, Sales list, Sales list report, client profile, under 3 min), every static page with no crash or placeholder, every left-menu link, staff permissions |

## Phase 0 — scaffold, tokens, login, shell ☑
SPEC.md, REFERENCE_MAP.md, DESIGN_TOKENS.md; Vite + React 18 + strict TS + Tailwind tokens (light/dark); login, forgot/reset password (link in the demo outbox); protected routes; role-based navigation; top bar with live badges, icon rail, docked/flyout left menu with the open-register hint; drawer host (page stays visible, as in the reference); toasts; error boundary.

## Phase 1 — data, mock API, availability, seed, demo panel ☑
- Types for every SPEC §4 entity; one store persisted to IndexedDB, synced between tabs; `db.ext` for section data; Reset demo restores everything.
- Deterministic Porto seed (v3): 2 locations, 6 team members with logins for access roles, 40 services in 6 categories (variants, add-ons), 3 bundles, 2 memberships, 3 packages, 30 products, 3 suppliers, 200 clients, 10 weeks of history and 3 weeks of bookings with online bookings, deposits, no-shows, late cancellations, refunds, voids, gift cards, packages, memberships, product orders, reviews, messages.
- Mock API with 300–800 ms latency. Checkout handles per-line tax rates, deposits, gift cards, packages, memberships, package-session and reward redemption, and group checkout.
- Availability engine: opening hours, closed periods, shifts, time off, blocked time, existing bookings, extra/processing time, resources, online limits, notice, advance window, gap optimization (regular / reduce / eliminate), dynamic assignment strategies and "prioritize last booked team member".
- Presenter panel (Ctrl+Shift+D): reset, switch role, time travel, all client actions, business events, outbox.

## Phases 2–5 — sections ☑
- **Home:** six cards, filters, charts (token colours, dark mode), click-through.
- **Calendar:** day / 3 day / week / month, both locations, filters with saved presets, settings, waitlist (add, edit, book, remove), groups (checkout group in one sale, ungroup, no-show all, cancel all), blocked time with types and emoji picker, drag to move/resize with conflict warnings, all pick modes, new and existing appointment drawers with every action.
- **Checkout:** every payment method including card-declined, split, gift cards, rewards and package benefits, discounts, service charges, receipt notes, drafts, register rule; sale drawer (refund, edit, notes, email, print, PDF, void); gift card drawer.
- **Sales:** Daily sales with exports matching the captured files, register (setup, open, cash in/out, count, close), appointments, sales and drafts, refunds, payments, sold items, product orders.
- **Clients:** list, add/edit, import, merge, client drawer (every tab and dialog), segments, loyalty, online reputation.
- **Catalog:** service menu (editor, variants, advanced pricing, add-ons, bundles, order, booking sequence, bulk edit, exports), archived categories, packages, memberships, products, stocktakes, stock orders, suppliers.
- **Online presence:** marketplace profile wizard and dashboard, Facebook/Instagram, link builder with QR, Smart Website, product store.
- **Marketing:** blast campaigns (Draft / Pending / Scheduled / Sent, approval via the demo panel), automations, messages history, deals, smart pricing.
- **Team:** members (invites, Independent-plan rule), scheduled shifts, timesheets, pay runs (full Pay team wizard, drafts, register tips mode, commissions).
- **Reports:** landing with groups, folders and custom reports (Insights), 56 reports + 3 dashboards, group by, date range, filters, advanced filters, column menu, customize, drill-down, CSV / Excel / PDF matching the captured files.
- **Add-ons:** intros, enable screens, manage pages, integrations, payments onboarding.
- **Settings:** every category; permission roles drive what each role sees; tax rates drive checkout; receipt settings drive receipts; availability and assignment settings drive online slots.
- **Billing:** plan change both ways (Independent €19.95 / Team €12.95 per bookable member, excl. IVA), invoices with PDF, top-ups, card, bank accounts.
- **Top bar, account area, Help:** every drawer and page; live chat, email and phone support simulated.

## Phase 6 — polish ☑
Loading skeletons, empty states, toasts and confirmations across sections; tablet (1024px) and dark-mode checks of the shell and main pages; Playwright suites; README walkthrough.

## Known differences from the reference
- **Calendar › Add new client** opens an inline form in the drawer instead of the full-screen client form.
- **Number format:** exports show "€190.00" (English); the captured PDF shows "190,00 €" because it was exported in Portuguese. This changes when pt-PT is added.
- **Report favourites** are kept per browser (UI preference), not in the shared data.
- **Simulated by design:** payments, payouts, publishing, Google/Facebook/Xero connections, live chat and every message are simulated and land in the demo outbox.

## Needs reference

Built from SPEC.md because the reference didn't capture them (INDEX.md "Not captured" lists and per-file gaps):

- **Shell/account:** login, forgot and reset password; live chat; sending inbox messages; Team Connect; Bookings Boss and Payments Pro guides; language picker lists; destructive and verification account actions.
- **Home/calendar:** Upcoming appointments with data; card terminal, self checkout, QR code, manual card entry and Pay now flows; print receipt; client notifications; group checkout/ungroup/no-show all/cancel all; save as draft; cancel sale; void sale; drag-and-drop; deposits and cancellation policy.
- **Sales:** completing the tips pay run; Exchanged and Part paid states; Excel exports.
- **Clients:** Custom segments tab; gender filter options; avatar and file uploads; Google Business Profile connection; Client Loyalty after activation.
- **Catalog:** memberships create/sell; add-on groups; resources on services; photo uploads; stock order PDF/email; import products; brand/category management pages.
- **Online presence:** published profile, booking links, QR codes, Facebook/Instagram connection, published Smart Website, profile preview, product store.
- **Marketing:** blast campaign builder and drafts (Draft / Pending / Scheduled / Sent); marketing automations needing a published profile; top-ups; Flash sale and Last-minute offer details.
- **Team:** invites and acceptance; completing a pay run; Google calendar linking; commissions wizard; confirmed deletes.
- **Reports:** Insights-unlocked features (custom reports, folders, duplicate, customize, premium data); per-report menus other than Sales summary; charts.
- **Add-ons:** every paid activation after the billing screen; Payments setup beyond business details; Xero/QuickBooks connection; tracking ID forms; Google Reserve.
- **Settings:** add-location steps 2–4; delete location; saved resource; service charge and custom payment method saves; register archive; Pay now and online tipping; tag delete/reorder; QR output; form activation and new templates; payment policy/methods/terminals configured states; role save/duplicate/delete; PIN switching steps; plan activation and Change your plan; invoices.

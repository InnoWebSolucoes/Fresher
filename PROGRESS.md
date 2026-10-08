# Progress

Status as of 2026-10-08, end of the single build run (phases 1–6 were attempted in parallel with a hard time limit). ☑ = built and wired to the mock data; ◐ = partly built; ☐ = still the phase stub (route exists, renders "Scheduled for Phase N").

## Phase 0 — scaffold, tokens, login, shell ☑
SPEC.md, REFERENCE_MAP.md, DESIGN_TOKENS.md; Vite + React 18 + strict TS + Tailwind tokens (light/dark); login, forgot/reset password (link in the demo outbox); protected routes; role-based navigation; top bar, icon rail, docked/flyout left menu; drawer host; toasts; 166 registered routes.

## Phase 1 — data, mock API, availability, seed, demo panel ☑
- ☑ Types for every SPEC §4 entity (`src/types`), single store persisted to IndexedDB, BroadcastChannel tab sync
- ☑ Deterministic Porto seed: 2 locations, 6 team members, 40 services in 6 categories (variants, add-ons), 3 bundles, 2 memberships, 3 packages, 30 products, 3 suppliers, 200 clients (marketplace-sourced included), 10 weeks of history + 3 weeks ahead with online bookings, no-shows, late cancellations, refunds, voids, gift cards, packages, memberships, product orders, reviews, messages
- ☑ Mock API with 300–800 ms latency (`src/api/*`): appointments, checkout/refunds/voids/gift cards, register, messaging outbox + notifications, auth, demo
- ☑ Availability engine with 12 Vitest cases (shifts, time off, blocked time, closed periods, notice, advance window, processing time, resources, any professional, conflicts)
- ☑ Demo panel (Ctrl+Shift+D): reset, switch role, time travel, all 7 client actions, 4 business events, outbox
- ☑ Golden path covered at the API level (`src/api/goldenPath.test.ts`)

## Phase 2 — Home, Calendar, appointments, checkout
- ☑ Home dashboard (6 cards, filters, charts, click-through)
- ◐ Calendar: ☑ toolbar, URL state, day/3 day/week/month views, hatching, current-time line, quick actions, drag to move/resize with conflict warnings, all pick modes, new-appointment drawer (client picker, Services › Time with availability engine, service editor, repeat, notes), appointment drawer (status menu, no-show/cancel with fees, every Options action, activity, minimise), form selection. ◐ filters drawer (status/type/channel/payment only), waitlist (list, book, remove), group drawer (no checkout-all/no-show-all), blocked time (plain form)
- ☑ Checkout (cart, tips, every payment method incl. cash keypad, redeem gift, split, other/custom, card terminal, self checkout, QR code, manual card, declined state, register rule, discounts, receipt note, service charge, drafts), sale drawer (refund, edit details, notes, email, print, PDF receipt, void), gift card drawer, Payments page

## Phase 3 — Sales, Clients, Catalog
- ☑ Sales: Daily sales (live tables, PDF/CSV/Excel exports), Register (setup, open, cash in/out, count, close, period drawer), Appointments, Sales (+ Drafts), Refund sale, Payment transactions, Gift cards / Packages / Memberships sold, Product orders
- ◐ Clients: ☑ Clients list (filters, bulk actions, exports), add/edit client (all sections), client drawer (all tabs and Actions dialogs). ☐ Import wizard, Merge, Segments pages, Loyalty, Online reputation (logic written in `src/api/clients.ts` + `src/sections/clients/lib`)
- ◐ Catalog: ☑ Service menu (all menus, filters, editor, variants, advanced pricing, add-ons, bundles, menu order, booking sequence, bulk edit, PDF/Excel/CSV), ☑ Packages (list, holders, editor, sell). ☐ Memberships, Products, Stocktakes, Stock orders, Suppliers (API written in `src/api/catalog.ts`, no screens yet)

## Phase 4 — Online booking, Marketing, Team, top bar
- ☐ Online presence pages (API in `src/api/online.ts`, no screens yet)
- ☑ Marketing: Blast campaigns (Draft / Pending / Scheduled / Sent, builder, billing wizard, approval flow, detail), Automations (+ detail, configure, email editor, top-ups), Messages history, Deals (list + 3-type wizard), Smart pricing (overview + wizard)
- ☑ Team: members list, add/edit (invites, Independent-plan rule), reorder, calendar sync, member drawer, scheduled shifts (edit day, repeating shifts, time off, closed periods), timesheets, pay runs (breakdown, adjustments, settlements, pay team wizard with emailed code, register tips mode), accept-invite page
- ☑ Top-bar panels: Guides, Help (help centre, email, phone, live chat), News, Search, Performance insights, Notifications, Wallet, Referral; Client messages inbox

## Phase 5 — Reports, Add-ons, Settings, Billing, account, Help
- ◐ Reports: 54 of 56 reports compute live (group by, date range, totals, drill-down, premium blur until Insights, CSV export). ☐ 3 dashboards, Performance summary/over time, filters drawer, customize, Excel/PDF export, data connector
- ◐ Add-ons: page with cards and statuses, enable via API with invoice. ☐ intro modals, enable screens, manage pages, payments onboarding, integrations forms
- ◐ Settings: ☑ landing, Business details + edit, Locations (+ 4-step add, location page with all tabs), Sales (all 8 pages), Scheduling (Time and calendar, Waitlist, Blocked time types, Resources), Form templates list, Permission matrix editor. ☐ other Scheduling pages, Clients settings, Team settings list pages, Forms builder, Payments pages
- ☑ Billing: details, bank accounts, payment methods, communication balance, invoices with PDF preview (IVA 23%), subscriptions, Change your plan (Independent €19.95 / Team €12.95 per bookable member, excl. IVA)
- ☐ Account area pages (My profile, Portfolio, Reviews, Pay runs, Workspaces, Personal settings…) — API in `src/api/panels.ts`, no screens yet
- ☑ Help (in the top-bar panels)

## Phase 6 — polish
- ☑ Error boundary so a failing page doesn't take the app down
- ◐ Playwright: login/menu/permissions suite, every-route crawl and golden-path smoke (`e2e/`)
- ☐ Full tablet and dark-mode pass

## Known follow-ups
- Shared types lack a few fields agents needed; they used local stores (`settings.extras`, catalog prefs, marketing/online/panels local stores). Move them into `src/types` + seed.
- Settings strings live in `src/sections/settings/strings/*.json`; merge into one `en.json` per section.
- `FullscreenLayout` should include `DrawerHost` (the inbox mounts its own).

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

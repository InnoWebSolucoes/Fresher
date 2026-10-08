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

## Phases 2–5 — every page built
Every route in `src/app/routeRegistry.ts` now renders a real page (no "Scheduled for Phase" stubs left): Home, Calendar, Checkout, Sales, Clients (list, form, drawer, import, merge, segments, loyalty, online reputation), Catalog (services, bundles, packages, memberships, products, stocktakes, stock orders, suppliers), Online presence (marketplace profile wizard and dashboard, Facebook/Instagram, link builder, Smart Website, product store), Marketing, Team, top-bar panels and inbox, Reports (56 reports + 3 dashboards, filters, CSV/Excel/PDF), Add-ons (intro, enable, manage, integrations, payments onboarding), Settings (all categories), Billing, account area.

Simplified in the calendar: the filters drawer (status/type/channel/payment only), waitlist (list, book, remove), group drawer (no checkout-all / no-show-all) and blocked-time drawer (plain form).

## Phase 6 — polish
- ☑ Error boundary; type-check clean; 31 unit tests pass; production build passes; crawl of all 116 static routes shows no crashes or stubs
- ◐ Playwright suites in `e2e/` (shell, every-route crawl, golden-path smoke)
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

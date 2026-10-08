# Build guide (read before writing code)

Innoweb Bookings is a front-end-only demo of a salon workspace. Read `SPEC.md` (the brief), `REFERENCE_MAP.md` (reference page → route) and your section files in `reference/` (the source of truth for every label, button, field and flow). Screenshots are in `reference/screenshots/<section>-NN-*.png`; open the ones for the screens you build. Exported file formats are in `reference/screenshots/files/`.

**Never** use the word "Fresha" anywhere in UI text, code, ids or routes. Where the reference says "Fresha X", say "Innoweb X" or drop the brand ("Marketplace", "Payments", "Client Connect"). Use **our** design tokens (`DESIGN_TOKENS.md`, Tailwind classes below), never the reference's purple/fonts. Ignore `reference/design-tokens.md`.

## Ownership (several people build in parallel)

You own **only** the files your task lists, normally:

- `src/sections/<yours>/**` (pages, drawers, components, hooks, `en.json`)
- `src/api/<yours>.ts` (new file(s) for your domain operations)

Do **not** edit anything else: not `src/app/*`, `src/components/**`, `src/store/*`, `src/types/*`, `src/lib/*`, `src/api/{client,appointments,sales,messaging,auth}.ts`, `locales/en.json`, other sections, configs or package.json. If a shared piece is missing, build a local version inside your section. If the shared type lacks a field you need, store it in an existing flexible field or keep it in section-local state; mention it in your final report.

## How sections plug in

Each `src/sections/<name>/` has four registries, collected automatically:

| File | Export | Purpose |
|---|---|---|
| `pages.tsx` | `pages: Record<pageId, ComponentType>` | Replaces the stub for a page id from `src/app/routeRegistry.ts` (or your `routes.ts`). |
| `drawers.tsx` | `drawers: Record<name, DrawerDef>` | Right-hand drawers opened anywhere with `useDrawer().open(name, params)`. `DrawerDef = { component, width?, bare? }`; component gets `{ id, params, close }`. |
| `routes.ts` | `routes: PageDef[]` | Extra routes you need. Layout `'shell' | 'settings' | 'full' | 'account'`. |
| `en.json` | strings | Available as `t('<name>.…')` (e.g. file `clients/en.json` with `{ "list": { "title": "Clients list" } }` → `t('clients.list.title')`). |

Page ids, paths and layouts are in `src/app/routeRegistry.ts`. Layouts: `shell` (top bar + rail + docked left menu), `settings` (settings category card on the left; render only the right-hand content), `full` (full-screen; render your own header with `FullscreenFrame`), `account` (account area).

### Drawers

`useDrawer()` from `@/lib/drawer`: `open(name, { id, tab, d_xxx })`, `close()`, `update({...})`, plus `name/tab/id/params`. Extra params **must** start with `d_`. Opening a drawer replaces any open drawer. Drawer names already reserved (owner in brackets):

- `appointment` (calendar) `{ id }` · `new-appointment` (calendar) `{ d_date, d_time, d_member, d_client, d_services (comma ids), d_group, d_waitlist }` · `visibility-filters`, `calendar-settings`, `waitlist`, `appointment-group {id}`, `blocked-time {id or d_date,d_time,d_member}` (calendar)
- `checkout` (checkout) `{ d_appointment?, d_sale? (pay existing), d_client?, d_add? (e.g. "package:pkg_5cuts,product:prd_2,gift_card"), d_mode? ("quick-payment") }` · `sale` (checkout) `{ id }` · `gift-card` (checkout) `{ id }`
- `client` (clients) `{ id, tab? }` · `product`, `supplier`, `stock-order` (catalog) `{ id }`
- `register-period` (sales) `{ id }` · `team-member` (team) `{ id, tab? }` · `timesheet` (team) `{ id }`
- `resources` (panels) `{ tab: news|help|guides, view?, d_q? }` · `search`, `performance-insights`, `notifications {tab}`, `wallet {tab}`, `referral` (panels)

## Data

- Types: `src/types/index.ts` (`DbData` is everything). Seed: `src/mock/seed.ts` (Porto salon "Studio Aliados", 2 locations `loc_baixa`/`loc_foz`, 6 team members, 40 services, 200 clients, ~10 weeks history, 3 weeks ahead).
- **Read** with `useDb(selector)` from `@/store/db`. Select raw slices (`useDb(s => s.clients)`) and derive with `useMemo`. Never return a new array/object from a selector (zustand v5 loops forever); use `useShallow` from `zustand/react/shallow` if picking several fields.
- **Write** only through API functions (`src/api/*`), which `await latency()` and call `commit(draft => …)` (immer). Components never call `commit` or `useDb.setState`.
- Existing APIs:
  - `@/api/client`: `crud('<collection>')` → `create/update/remove/replaceAll` for any collection; `actorName()`, `activity()`, `latency()`, `ApiError`.
  - `@/api/appointments`: `createAppointment`, `updateAppointment`, `setStatus`, `cancelAppointment` (late-fee logic), `markNoShow`, `undoNoShow`, `rescheduleAppointment`, `addAppointmentNote`, groups (`addToGroup`, `removeFromGroup`, `ungroup`), `saveBlockedTime`, `deleteBlockedTime`, `saveWaitlistEntry`, `removeWaitlistEntry`, `repeatDates`, `appointmentTotal`, `isLateCancellation`.
  - `@/api/sales`: `checkout(CheckoutInput)` (creates/pays sales; issues gift cards, packages, memberships; moves stock; redeems gift cards; applies deposits; completes the appointment), `computeTotals`, `salePaid`, `saleBalance`, `lineTotal`, `findGiftCard`, `refundSale`, `voidSale`, `addSaleNote`, `editSaleDetails`, `sellGiftCardOnline`, `openRegisterSession`, `PAYMENT_LABELS`.
  - `@/api/messaging`: `queueMessage` (outbox/Messages history), `pushNotification`, `markNotificationsRead`, `notifyAppointment`, `sendReceipt`.
  - `@/api/auth`: `login`, `logout`, `switchUser`, `requestPasswordReset`, `resetPassword`, `changePassword`.
- Helpers: `@/lib/time` (`now()`, `useNow()`, `todayISO()`, `toMinutes`, `toClock`, `weekdayOf`, `durationLabel` "1h 30min", `durationLong` "1 hr, 30 min"), `@/lib/format` (`money` "€25"/"€28.75", `money2` "€25.00", `fmtDayLong` "Wed, 7 Oct 2026", `fmtDate` "Oct 7, 2026", `fmtDateTime`, `fullName`, `round2`), `@/lib/schedule` (`rawShifts`, `workingWindows`, `closedPeriodOn`, `timeOffOn`), `@/lib/availability` (`getAvailableSlots`, `nextAvailableDates`, `findConflicts`, `serviceTiming`, `itemSegments`, `eligibleMembers`), `@/lib/export` (`exportCsv`, `exportXlsx`, `exportPdf`, `buildPdf`, `downloadBlob`, `exportedFileName`, `reportFileName`), `@/lib/ids` (`uid`, `bookingRef`, `giftCode`), `@/styles/palette` (`PALETTE`, `STATUS_STYLES`).
- "Now" is `now()` from `@/lib/time` (supports time travel). Never use `new Date()` for business logic.
- The current user: `useCurrentUser()` from `@/store/session`; permission checks via `canAccess(role, section)` from `@/lib/permissions`.

## UI kit (`@/components/ui`)

`Button` (variant primary|secondary|ghost|danger|accent|link, `loading`, `icon`), `IconButton`, `Modal` (title, subtitle, footer, size), `confirm({ title, body, confirmLabel, tone })` → Promise<boolean>, `Menu` (groups of items; default ⋮ trigger) + `MenuButton` for "Options ▾/Add ▾", `Field` (render-prop with id), `TextInput` (prefix/suffix), `TextArea`, `Select`, `Checkbox`, `Switch`, `RadioGroup` (list|cards), `MoneyInput`, `EmptyState`, `Skeleton`, `PageSkeleton`, `usePageLoading()`, `Chip` (tones), `StatusChip`, `ColorDot`, `Avatar`, `Card`, `DetailList`, `PillTabs`, `UnderlineTabs`, `Segmented`, `DataTable` (sortable columns, total row, selection, "Viewing 1 - N of M results"), `DateRangeButton` + `resolvePreset` (presets from the reference), `Page`, `PageHeader`, `SearchInput`, `Toolbar`, `LearnMore`, `IntroPage` (the "Included in your plan" intro pattern), `IntroArt`, `FullscreenFrame` (Close / title / actions / progress / left nav), `SectionNav`, `SideDrawer` (in-page filter drawers), `toast(message)`.

Tailwind token classes: `bg-canvas|surface|raised|sunken`, `text-ink|muted|subtle`, `border-line|line-strong`, `bg-primary`, `text-primary`, `bg-primary-subtle`, `bg-accent`, `bg-accent-subtle`, `text-on-primary`, `success|warning|danger|info` (+ `-subtle`), `rounded-xs|sm|md|lg|xl`, `shadow-xs|sm|md|lg`, fonts `font-display` (titles, big numbers), type `text-display|title-1|title-2|title-3|body-lg|body|body-strong|small|caption`. CSS helpers: `.btn-primary`, `.btn-secondary`, `.icon-btn`, `.card`, `.input`, `.label`, `.chip`. Icons: `lucide-react` only. Charts: `recharts`. Drag and drop: `@dnd-kit/core`, `@dnd-kit/sortable`. QR codes: `qrcode`.

## Quality floor (SPEC §1, §3)

- **No dead ends.** Every button, link, menu item, toggle and form does something believable. If it can't really happen (send SMS, charge a card, connect Google, publish), simulate it: loading state → success state → the result visible elsewhere (a record, a message in `db.messages`, a notification, a status change). No "coming soon".
- Where the reference stopped at a paid or external step (billing, payments setup, publishing, invites, Google sign-in), **continue the flow in simulation**: show the form, accept input, show success, and update state (e.g. add-on becomes Active).
- Page header pattern: `PageHeader` with title, subtitle, actions (Options ▾ / Export ▾ / Add). List rows have an Actions (⋮) menu.
- Loading skeleton on first render (`usePageLoading`), empty states with a next action, a toast for every completed action (use the reference's exact toast text), `confirm()` for destructive actions, inline validation (react-hook-form + zod or simple state), visible focus.
- Every UI string in your `en.json` via `useTranslation()` → `t('<section>.…')`. Data values (names, services) are not strings to translate.
- Desktop-first (1280px+), usable on tablet.
- Use the exact reference wording for titles, columns, buttons, menu items, options and toasts.

## Checks before you finish

```
npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep "src/sections/<yours>\|src/api/<yours>"
npx eslint src/sections/<yours> src/api/<yours>.ts
```

Others are editing at the same time, so ignore errors in files you don't own. Don't run `npm run build`, don't start another dev server and don't install packages. A dev server is already running at http://localhost:5196 (login `owner@demo.app` / `demo1234`). To look at your pages you can use Python Playwright (`python -I script.py`, chromium is installed); keep scripts in your scratchpad, not the repo.

Finish with a short report: what you built, routes/drawers registered, anything you couldn't do, and any shared-file change you'd need.

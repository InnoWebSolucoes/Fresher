# Innoweb Bookings

A front-end-only, fully clickable demo of a salon and wellness business workspace: calendar, checkout, sales, clients, catalog, online booking, marketing, team, reports, add-ons and settings. Everything runs in the browser on seeded mock data (a Porto salon, "Studio Aliados", with two locations). Nothing is sent anywhere: emails, SMS and payments are simulated.

- Brief: [SPEC.md](SPEC.md) · Reference → route map: [REFERENCE_MAP.md](REFERENCE_MAP.md) · Design tokens: [DESIGN_TOKENS.md](DESIGN_TOKENS.md) · Status: [PROGRESS.md](PROGRESS.md) · Conventions: [docs/BUILD_GUIDE.md](docs/BUILD_GUIDE.md)

## Run it

```bash
npm install
npm run dev        # http://localhost:5196
```

The first load builds the demo data (a second or two), then keeps it in the browser (IndexedDB). Refreshing keeps your changes; **Reset demo** in the presenter panel restores the seed. Two tabs of the same browser stay in sync, so you can show the front desk and the owner side by side.

Other scripts: `npm run typecheck`, `npm run lint`, `npm test` (Vitest), `npm run build`, `npm run e2e` (Playwright; run `npx playwright install chromium` once first). The e2e suite runs the golden path (online booking → arrived → checkout → Daily sales, Sales, Reports and the client profile), loads every page, and walks every menu link.

## Demo logins

| Role | Email | Password | Sees |
|---|---|---|---|
| Owner | `owner@demo.app` | `demo1234` | Everything |
| Receptionist (staff, Low role) | `staff@demo.app` | `demo1234` | Calendar, Sales, Clients, Online presence, Team. No Reports, Marketing or Settings |
| Team member (Basic role) | `stylist@demo.app` | `demo1234` | Calendar and Sales |
| Other team members | `rui@`, `sofia@`, `beatriz@studioaliados.example.com` | `demo1234` | Their permission role (Basic / Low) |

The login screen has buttons that fill in the owner and front-desk accounts. **Forgot password** sends the reset link to the demo outbox. What each role can open comes from **Settings › Team › Permission roles**: switch an area on or off there and the menu changes for everyone in that role.

## Presenter tools (`Ctrl+Shift+D`)

A hidden panel for driving the demo:

- **Simulate**: new online booking (client, location, channel, service, team member or any professional, a real free time from the availability engine, optional deposit), client reschedules, client cancels (late-cancellation fee inside the policy window), client buys a gift card online, client places a product order, client leaves a review, client sends a message. Business events: low-stock alert, card declined at checkout (the next card payment fails), payout completed, blast campaign approved after review.
- **Demo outbox**: every email, SMS and WhatsApp the system "sent" (confirmations, reminders, receipts, campaigns, invites, password resets), shown as an inbox or a phone message. Links inside (reset password, accept invite) work.
- **Demo settings**: switch role (owner / receptionist / team member), set today's date (time travel), reset demo.

## Walkthrough script (about 10 minutes)

1. **Log in** as the owner (`owner@demo.app` / `demo1234`). Point out the main menu rail, the top bar (Continue setup, Search, Performance insights, Notifications, client messages, Wallet) and the Home dashboard: recent sales, upcoming appointments, activity, top services and top team member.
2. **Calendar**: open Calendar, switch Day / Week / Month and the Baixa / Foz locations, open the team selector and filters. Hover an appointment, click one to open the appointment panel, and show the status menu and the ⋮ quick actions.
3. **An online booking arrives**: press `Ctrl+Shift+D` → Simulate → *New online booking* → *Book a random free time*. The calendar opens on the new booking, a notification appears in the bell, and a confirmation email shows in the demo outbox.
4. **Front desk**: on that appointment set the status to **Arrived**, then **Checkout**. Choose a tip, continue to payment, take **Cash** (or Card terminal), and **Pay now**. Show the sale panel and *Download PDF* for the receipt, then *Email* it (it appears in the outbox).
5. **Money**: open **Sales → Daily sales summary**: the sale is in the transaction and cash movement summaries. Export it as PDF or CSV. Open **Sales → Sales** and **Payments**.
6. **Client profile**: from the sale, open the client. Show Overview, Appointments, Sales, Items, Records and Wallet; the visit you just checked out is there.
7. **Reports**: open **Reports → Sales summary** and the **Performance dashboard**; change the date range, group by team member, export to Excel.
8. **Catalog and stock**: open **Catalog → Service menu**, edit a service; open **Products**, add stock; simulate a **low-stock alert** from the panel.
9. **Marketing**: open **Blast campaigns** (Draft, Pending, Scheduled, Sent), approve the pending one from the panel; open **Automations** and **Deals**.
10. **Team**: **Scheduled shifts**, add time off, then **Pay runs**.
11. **Permissions**: in the panel, *Switch role → Receptionist*: Reports, Marketing and Settings disappear from the menu.
12. **Edge cases**: arm *Card declined*, try a card payment, show the declined state; simulate a *client cancels* within 24 hours to show the late-cancellation fee in Sales.
13. Finish with **Reset demo**.

## Project layout

```
locales/en.json          shell strings; each section adds src/sections/<name>/en.json
src/app/                 route registry, navigation, router, section registry, data gate
src/api/                 mock API (async, simulated latency); the UI calls this, never the store
src/store/               Zustand stores (db persisted to IndexedDB, session, ui, toasts)
src/mock/                deterministic seed (Porto, EUR, IVA 23% inclusive)
src/lib/                 availability engine, schedule, time, formatting, exports, segments
src/components/          app shell and UI kit
src/sections/<name>/     each product area: pages, drawers, routes, strings
e2e/                     Playwright specs
reference/               the captured reference workspace (kept local, not committed)
```

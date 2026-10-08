# Innoweb Bookings

Front-end-only, fully clickable demo of a salon and wellness business workspace. Everything runs in the browser on seeded mock data. The brief is in [SPEC.md](SPEC.md), the page-to-route map in [REFERENCE_MAP.md](REFERENCE_MAP.md), the design tokens in [DESIGN_TOKENS.md](DESIGN_TOKENS.md) and build status in [PROGRESS.md](PROGRESS.md).

## Run it

```bash
npm install
npm run dev        # http://localhost:5196
```

Other scripts: `npm run typecheck`, `npm run lint`, `npm test` (Vitest), `npm run build`, `npm run e2e` (Playwright; run `npx playwright install chromium` once first).

## Demo logins

| Account | Email | Password | Sees |
|---|---|---|---|
| Owner | `owner@demo.app` | `demo1234` | Everything |
| Front desk (Basic role) | `staff@demo.app` | `demo1234` | Calendar and Sales |

The login screen has buttons that fill either account in. Forgot password works end to end: request a link, open it, set a new password. In Phase 1 the link moves into the demo outbox.

## Demo panel

`Ctrl+Shift+D` opens the presenter panel (Phase 1): reset the demo, switch role, simulate client bookings and other events, read the outbox, and set today's date.

## Project layout

```
locales/en.json          every UI string
src/app/                 route registry, navigation, router, report catalogue
src/api/                 mock API (async, simulated latency); the UI calls this, never the store
src/store/               Zustand stores (persisted to localStorage)
src/components/shell/    top bar, rail, left menu panel, drawers, layouts
src/pages/               pages; unbuilt ones render StubPage
src/styles/              design tokens and Tailwind layers
e2e/                     Playwright specs
reference/               the captured reference workspace (source of truth for wording and flows)
```

## Walkthrough script

Filled in during Phase 6, when the golden path is complete.

# Design tokens (Phase 0 proposal)

Built from the two brand colours in SPEC.md §3: primary **#0E6E6A** (deep teal) and accent **#F4B23E** (marigold). Neutrals are tinted slightly towards the teal so greys don't look flat next to it. Nothing here comes from `reference/design-tokens.md`.

Implemented as CSS variables in `src/styles/tokens.css` (light on `:root`, dark on `[data-theme="dark"]`) and exposed to Tailwind in `tailwind.config.ts` (`bg-surface`, `text-muted`, `bg-primary`, `rounded-md` and so on).

## Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `canvas` | #F4F7F6 | #0B1413 | Page background |
| `surface` | #FFFFFF | #121E1D | Cards, drawers, top bar |
| `surface-raised` | #FFFFFF | #182725 | Popovers, menus |
| `surface-sunken` | #EDF2F1 | #0E1918 | Toolbars, table headers, inputs on cards |
| `border` | #DCE4E2 | #243634 | Dividers, card borders |
| `border-strong` | #BFCBC9 | #344A47 | Inputs, outlined buttons |
| `text` | #10201F | #E4EDEC | Primary text |
| `text-muted` | #586A68 | #9CAEAC | Subtitles, secondary text |
| `text-subtle` | #84938F | #6C7E7B | Placeholders, disabled |
| `primary` | #0E6E6A | #3BB3AC | Primary buttons, links, active states |
| `primary-hover` | #0B5A57 | #58C4BE | Hover |
| `primary-active` | #084744 | #7AD2CD | Pressed |
| `primary-subtle` | #E2F1EF | #12312E | Selected rows, active left-menu item |
| `on-primary` | #FFFFFF | #03201E | Text on primary |
| `accent` | #F4B23E | #F6C063 | Rail active item, highlights, badges |
| `accent-hover` | #E19D24 | #F8CD82 | Hover |
| `accent-subtle` | #FEF3DE | #33280F | Banners (trial, tips) |
| `on-accent` | #2B1D03 | #2B1D03 | Text on accent |
| `rail` | #0F2423 | #070F0E | Main menu rail |
| `rail-hover` | #1C3A38 | #142321 | Rail hover / open item |
| `rail-icon` | #B9CCC9 | #93A8A5 | Rail icons |
| `focus-ring` | rgb(14 110 106 / .40) | rgb(59 179 172 / .50) | Keyboard focus |

**Feedback**

| Token | Light (fg / bg) | Dark (fg / bg) |
|---|---|---|
| `success` | #23763A / #E6F4EA | #6FCF8A / #12301B |
| `warning` | #9A6410 / #FEF3DE | #F6C063 / #33280F |
| `danger` | #B8283A / #FCEBED | #F07A88 / #3A1419 |
| `info` | #2763C9 / #E7EFFC | #7EA8F0 / #142440 |

**Appointment status** (block fill / chip text / chip background). Calendar blocks use the service colour while Booked to Started, as in the reference; the chip and drawer header use these.

| Status | Header / chip text | Chip background |
|---|---|---|
| Booked | #2763C9 | #E7EFFC |
| Confirmed | #0E6E6A | #E2F1EF |
| Arrived | #B26B00 | #FEF3DE |
| Started | #23763A | #E6F4EA |
| Completed | #10201F | #EDF2F1 |
| No-show / Canceled | #B8283A | #FCEBED |

**Calendar palette** (service categories, team members, resources): 17 named swatches, Blue, Dark blue, Jordy blue, Indigo, Lavender, Purple, Wisteria, Pink, Coral, Blood orange, Orange, Amber, Yellow, Lime, Green, Teal, Cyan. Each has a soft fill for blocks and a strong edge for the left bar. Values are in `src/styles/palette.ts`.

## Typography

- **UI:** Figtree (Google Fonts, variable 400–700), fallback `system-ui, sans-serif`.
- **Display / wordmark:** Bricolage Grotesque 600–700, used for page titles, the big numbers on cards and the wordmark.
- Tabular numbers (`font-variant-numeric: tabular-nums`) in tables, totals and the calendar gutter.

| Token | Size / line height | Weight | Use |
|---|---|---|---|
| `display` | 40 / 48 | 700 | Big KPI figures |
| `title-1` | 30 / 38 | 650 | Page titles |
| `title-2` | 24 / 32 | 650 | Drawer and modal titles |
| `title-3` | 19 / 26 | 600 | Card titles |
| `body-lg` | 16 / 24 | 400 | Page subtitles |
| `body` | 14 / 20 | 400 | Default text, table cells |
| `body-strong` | 14 / 20 | 600 | Labels, buttons |
| `small` | 13 / 18 | 500 | Chips, helper text |
| `caption` | 12 / 16 | 500 | Axis labels, timestamps, overlines |

## Spacing (4px base)

`0` 0 · `0.5` 2 · `1` 4 · `2` 8 · `3` 12 · `4` 16 · `5` 20 · `6` 24 · `8` 32 · `10` 40 · `12` 48 · `16` 64

Layout constants: top bar 60px · rail 68px · left menu panel 224px · drawer widths 480 / 800 / 1024 / 1240px · content max width 1120px · list row 64px.

## Radii

`xs` 4 (calendar blocks, chips' inner) · `sm` 6 (inputs, small buttons) · `md` 10 (buttons, menus) · `lg` 14 (cards, drawers' inner panels) · `xl` 20 (modals) · `full` 999 (chips, avatars, toasts).

Buttons are 10px-radius rounded rectangles rather than full pills, which keeps our look distinct from the reference.

## Shadows

| Token | Value | Use |
|---|---|---|
| `shadow-xs` | 0 1px 2px rgb(16 32 31 / .06) | Cards on canvas |
| `shadow-sm` | 0 2px 6px rgb(16 32 31 / .08) | Sticky headers, hovered cards |
| `shadow-md` | 0 8px 24px rgb(16 32 31 / .12) | Popovers, menus |
| `shadow-lg` | 0 16px 48px rgb(16 32 31 / .18) | Drawers, modals |

Dark theme uses the same offsets at black 40–60% opacity.

## Motion

`fast` 120ms · `base` 200ms · `slow` 320ms, easing `cubic-bezier(.2,.8,.2,1)`. Drawers slide 320ms; menus and toasts fade-scale 120ms. `prefers-reduced-motion: reduce` sets every duration to 0.

## Components at a glance

- **Primary button:** `primary` fill, `on-primary` text, 40px high, radius `md`.
- **Secondary button:** `surface` fill, `border-strong` border, `text`.
- **Rail:** `rail` background; active item is a 44px `accent` square (radius `md`) with an `on-accent` icon; hover is `rail-hover`.
- **Left menu panel:** `surface`; active link `primary-subtle` background and `primary` text; group headings `caption` uppercase in `text-muted`.
- **Toast:** `text` (ink) pill at top centre with `canvas` text, auto-dismiss 4s.
- **Focus:** 3px `focus-ring` outline offset 2px on every interactive element.

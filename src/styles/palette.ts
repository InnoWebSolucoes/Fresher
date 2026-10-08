import type { PaletteColor } from '@/types'

/**
 * Calendar palette (DESIGN_TOKENS.md): soft fill for blocks, strong edge for
 * the left bar and chips. Used for categories, team members and resources.
 */
export const PALETTE: Record<PaletteColor, { label: string; fill: string; edge: string; text: string }> = {
  blue: { label: 'Blue', fill: '#D6E8FB', edge: '#3B82D6', text: '#123E6B' },
  darkBlue: { label: 'Dark blue', fill: '#D3DBF2', edge: '#2D4FA8', text: '#14275A' },
  jordyBlue: { label: 'Jordy blue', fill: '#DCE6FF', edge: '#6F95E8', text: '#1F3A78' },
  indigo: { label: 'Indigo', fill: '#E0DDFB', edge: '#5B4FD1', text: '#29206E' },
  lavender: { label: 'Lavender', fill: '#ECE6FA', edge: '#9C86DB', text: '#3E2A7A' },
  purple: { label: 'Purple', fill: '#EEDCF6', edge: '#9B4BC0', text: '#4B1B63' },
  wisteria: { label: 'Wisteria', fill: '#F1E4F6', edge: '#B57FCB', text: '#55306A' },
  pink: { label: 'Pink', fill: '#FBDDEB', edge: '#D9508F', text: '#6B1B42' },
  coral: { label: 'Coral', fill: '#FDE1DA', edge: '#E8735A', text: '#6E2414' },
  red: { label: 'Red', fill: '#FAD9DC', edge: '#C9374A', text: '#641420' },
  bloodOrange: { label: 'Blood orange', fill: '#FCDCCF', edge: '#D9541E', text: '#66240A' },
  orange: { label: 'Orange', fill: '#FDE6CF', edge: '#E7832A', text: '#6A3508' },
  amber: { label: 'Amber', fill: '#FCEBC6', edge: '#E0A21C', text: '#5F4306' },
  yellow: { label: 'Yellow', fill: '#FBF2BF', edge: '#D4B71A', text: '#5A4B05' },
  lime: { label: 'Lime', fill: '#E9F5C9', edge: '#8DB52C', text: '#3A4D0C' },
  green: { label: 'Green', fill: '#D7F0DD', edge: '#3E9B57', text: '#163F21' },
  teal: { label: 'Teal', fill: '#D1EEEB', edge: '#1F8C84', text: '#0B3B37' },
  cyan: { label: 'Cyan', fill: '#D3EEF7', edge: '#2A9CC2', text: '#0D3F50' },
}

export const PALETTE_ORDER = Object.keys(PALETTE) as PaletteColor[]

/** Status chip colours (DESIGN_TOKENS.md "Appointment status"). */
export const STATUS_STYLES = {
  booked: { label: 'Booked', fg: 'rgb(var(--info))', bg: 'rgb(var(--info-subtle))', header: '#2763C9' },
  confirmed: { label: 'Confirmed', fg: 'rgb(var(--primary))', bg: 'rgb(var(--primary-subtle))', header: '#0E6E6A' },
  arrived: { label: 'Arrived', fg: '#B26B00', bg: 'rgb(var(--warning-subtle))', header: '#C98213' },
  started: { label: 'Started', fg: 'rgb(var(--success))', bg: 'rgb(var(--success-subtle))', header: '#23763A' },
  completed: { label: 'Completed', fg: 'rgb(var(--text))', bg: 'rgb(var(--surface-sunken))', header: '#4E5E5C' },
  no_show: { label: 'No-show', fg: 'rgb(var(--danger))', bg: 'rgb(var(--danger-subtle))', header: '#B8283A' },
  cancelled: { label: 'Canceled', fg: 'rgb(var(--danger))', bg: 'rgb(var(--danger-subtle))', header: '#B8283A' },
} as const

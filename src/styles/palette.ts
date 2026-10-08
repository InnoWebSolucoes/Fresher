import i18n from 'i18next'
import type { PaletteColor } from '@/types'

/**
 * Calendar palette (DESIGN_TOKENS.md): soft fill for blocks, strong edge for
 * the left bar and chips. Used for categories, team members and resources.
 */
export const PALETTE: Record<PaletteColor, { readonly label: string; fill: string; edge: string; text: string }> = {
  blue: { get label() { return i18n.t('common.palette.blue') }, fill: '#D6E8FB', edge: '#3B82D6', text: '#123E6B' },
  darkBlue: { get label() { return i18n.t('common.palette.darkBlue') }, fill: '#D3DBF2', edge: '#2D4FA8', text: '#14275A' },
  jordyBlue: { get label() { return i18n.t('common.palette.jordyBlue') }, fill: '#DCE6FF', edge: '#6F95E8', text: '#1F3A78' },
  indigo: { get label() { return i18n.t('common.palette.indigo') }, fill: '#E0DDFB', edge: '#5B4FD1', text: '#29206E' },
  lavender: { get label() { return i18n.t('common.palette.lavender') }, fill: '#ECE6FA', edge: '#9C86DB', text: '#3E2A7A' },
  purple: { get label() { return i18n.t('common.palette.purple') }, fill: '#EEDCF6', edge: '#9B4BC0', text: '#4B1B63' },
  wisteria: { get label() { return i18n.t('common.palette.wisteria') }, fill: '#F1E4F6', edge: '#B57FCB', text: '#55306A' },
  pink: { get label() { return i18n.t('common.palette.pink') }, fill: '#FBDDEB', edge: '#D9508F', text: '#6B1B42' },
  coral: { get label() { return i18n.t('common.palette.coral') }, fill: '#FDE1DA', edge: '#E8735A', text: '#6E2414' },
  red: { get label() { return i18n.t('common.palette.red') }, fill: '#FAD9DC', edge: '#C9374A', text: '#641420' },
  bloodOrange: { get label() { return i18n.t('common.palette.bloodOrange') }, fill: '#FCDCCF', edge: '#D9541E', text: '#66240A' },
  orange: { get label() { return i18n.t('common.palette.orange') }, fill: '#FDE6CF', edge: '#E7832A', text: '#6A3508' },
  amber: { get label() { return i18n.t('common.palette.amber') }, fill: '#FCEBC6', edge: '#E0A21C', text: '#5F4306' },
  yellow: { get label() { return i18n.t('common.palette.yellow') }, fill: '#FBF2BF', edge: '#D4B71A', text: '#5A4B05' },
  lime: { get label() { return i18n.t('common.palette.lime') }, fill: '#E9F5C9', edge: '#8DB52C', text: '#3A4D0C' },
  green: { get label() { return i18n.t('common.palette.green') }, fill: '#D7F0DD', edge: '#3E9B57', text: '#163F21' },
  teal: { get label() { return i18n.t('common.palette.teal') }, fill: '#D1EEEB', edge: '#1F8C84', text: '#0B3B37' },
  cyan: { get label() { return i18n.t('common.palette.cyan') }, fill: '#D3EEF7', edge: '#2A9CC2', text: '#0D3F50' },
}

export const PALETTE_ORDER = Object.keys(PALETTE) as PaletteColor[]

/** Status chip colours (DESIGN_TOKENS.md "Appointment status"). */
export const STATUS_STYLES = {
  booked: { get label() { return i18n.t('sales.appointmentStatus.booked') }, fg: 'rgb(var(--info))', bg: 'rgb(var(--info-subtle))', header: '#2763C9' },
  confirmed: { get label() { return i18n.t('sales.appointmentStatus.confirmed') }, fg: 'rgb(var(--primary))', bg: 'rgb(var(--primary-subtle))', header: '#0E6E6A' },
  arrived: { get label() { return i18n.t('sales.appointmentStatus.arrived') }, fg: '#B26B00', bg: 'rgb(var(--warning-subtle))', header: '#C98213' },
  started: { get label() { return i18n.t('sales.appointmentStatus.started') }, fg: 'rgb(var(--success))', bg: 'rgb(var(--success-subtle))', header: '#23763A' },
  completed: { get label() { return i18n.t('sales.appointmentStatus.completed') }, fg: 'rgb(var(--text))', bg: 'rgb(var(--surface-sunken))', header: '#4E5E5C' },
  no_show: { get label() { return i18n.t('sales.appointmentStatus.no_show') }, fg: 'rgb(var(--danger))', bg: 'rgb(var(--danger-subtle))', header: '#B8283A' },
  cancelled: { get label() { return i18n.t('sales.appointmentStatus.cancelled') }, fg: 'rgb(var(--danger))', bg: 'rgb(var(--danger-subtle))', header: '#B8283A' },
} as const

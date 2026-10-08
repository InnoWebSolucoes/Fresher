import type { Client, PaletteColor } from '@/types'
import { PALETTE, PALETTE_ORDER } from '@/styles/palette'

/** Gender values and their en.json label keys (clients.gender.*). */
export const GENDERS: NonNullable<Client['gender']>[] = ['female', 'male', 'non_binary', 'undisclosed']

/** Pronoun values are stored as shown (data, e.g. "She/Her"). */
export const PRONOUNS = ['She/Her', 'He/Him', 'They/Them', 'Prefer not to say']

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export const COUNTRY_CODES = ['+351', '+34', '+33', '+44', '+49', '+39', '+31', '+41', '+1', '+55', '+244', '+258', '+238']

export const COUNTRIES = [
  'Portugal',
  'Spain',
  'France',
  'United Kingdom',
  'Ireland',
  'Germany',
  'Italy',
  'Netherlands',
  'Belgium',
  'Switzerland',
  'United States',
  'Canada',
  'Brazil',
  'Angola',
  'Mozambique',
  'Cape Verde',
]

export const LANGUAGES = ['English', 'Português (Portugal)', 'Português (Brasil)', 'Español', 'Français', 'Deutsch', 'Italiano', 'Nederlands']

/** Stored as the reason text (clients.md §4 Block client). */
export const BLOCK_REASONS = [
  'Too many no-shows',
  'Too many late cancellations',
  'Too many reschedules',
  'Rude or inappropriate to a team member',
  'Refused to pay',
  'Booked fake appointments',
  'Other',
]

export const ALLERGY_REACTIONS = [
  'Acute kidney failure',
  'Altered mental state',
  'Anaphylaxis',
  'Angioedema',
  'Arthralgia',
  'Chills',
  'Cough',
  'Diarrhea',
  'Dizziness',
  'Fever',
  'Gastrointestinal irritation',
  'Headache',
  'Hives',
  'Itching',
  'Myalgia',
  'Nasal congestion',
  'Nausea',
  'Pain in injection site',
  'Palpitations',
  'Rash',
  'Respiratory distress',
  'Rhinorrhea',
  'Shortness of breath',
  'Sneezing',
  'Sore throat',
  'Swelling',
  'Vomiting',
  'Wheezing',
]

export const SEVERITY_COLORS = { mild: '#2E9B48', moderate: '#E07B1F', severe: '#D0304A', fatal: '#1E1E1E' } as const

export interface Swatch {
  key: string
  label: string
  color: string
  text: string
}

const DARK_TEXT = new Set(['yellow', 'lime', 'amber', 'lightGrey'])

/** The 22 colours used by badges and the note text-colour picker (calendar.md §7.4). */
export const SWATCHES: Swatch[] = [
  ...PALETTE_ORDER.map((key) => ({ key, label: PALETTE[key].label, color: PALETTE[key].edge, text: DARK_TEXT.has(key) ? '#1E1E1E' : '#FFFFFF' })),
  { key: 'black', label: 'Black', color: '#141414', text: '#FFFFFF' },
  { key: 'charcoal', label: 'Charcoal', color: '#4A4A4A', text: '#FFFFFF' },
  { key: 'grey', label: 'Grey', color: '#8C8C8C', text: '#FFFFFF' },
  { key: 'lightGrey', label: 'Light grey', color: '#D9D9D9', text: '#1E1E1E' },
]

export const swatchFor = (key: string | undefined): Swatch => SWATCHES.find((s) => s.key === key) ?? SWATCHES.find((s) => s.key === 'lavender')!

/** Badge colours outside PaletteColor are kept in an extra `shade` key; `color` stays a valid PaletteColor. */
export type BadgeWithShade = { name: string; color: PaletteColor; shade?: string }

export const badgeKey = (badge: { color: PaletteColor } | undefined): string => (badge as BadgeWithShade | undefined)?.shade ?? badge?.color ?? 'lavender'

export function makeBadge(name: string, key: string): BadgeWithShade {
  const isPalette = (PALETTE_ORDER as string[]).includes(key)
  return isPalette ? { name, color: key as PaletteColor } : { name, color: 'indigo', shade: key }
}

export const SORTS = ['first_asc', 'first_desc', 'last_asc', 'last_desc', 'gender_asc', 'gender_desc', 'created_asc', 'created_desc'] as const
export type SortKey = (typeof SORTS)[number]

export const DRAWER_TABS = ['overview', 'appointments', 'sales', 'details', 'items', 'notes', 'allergies', 'patch-tests', 'forms', 'files', 'wallet', 'loyalty', 'reviews'] as const
export type DrawerTab = (typeof DRAWER_TABS)[number]
export const RECORD_TABS: DrawerTab[] = ['notes', 'allergies', 'patch-tests', 'forms', 'files']

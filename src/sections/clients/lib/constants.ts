import i18n from 'i18next'
import type { Client, PaletteColor } from '@/types'
import { getLang, localeTag } from '@/i18n/language'
import { PALETTE, PALETTE_ORDER } from '@/styles/palette'

/** Gender values and their en.json label keys (clients.gender.*). */
export const GENDERS: NonNullable<Client['gender']>[] = ['female', 'male', 'non_binary', 'undisclosed']

/** Pronoun values are stored in English (data, e.g. "She/Her"); the label is translated (team.pronouns.*). */
export const PRONOUNS = ['She/Her', 'He/Him', 'They/Them', 'Prefer not to say']
const PRONOUN_KEYS: Record<string, string> = { 'She/Her': 'she', 'He/Him': 'he', 'They/Them': 'they', 'Prefer not to say': 'undisclosed' }
export const pronounLabel = (value: string | undefined) => (value && PRONOUN_KEYS[value] ? i18n.t(`team.pronouns.${PRONOUN_KEYS[value]}`) : (value ?? ''))
export const pronounOptions = () => PRONOUNS.map((value) => ({ value, label: pronounLabel(value) }))

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export const COUNTRY_CODES = ['+351', '+34', '+33', '+44', '+49', '+39', '+31', '+41', '+1', '+55', '+244', '+258', '+238']

/** Country values are stored in English; the label follows the language (Intl region names). */
const COUNTRY_REGIONS: Record<string, string> = {
  Portugal: 'PT',
  Spain: 'ES',
  France: 'FR',
  'United Kingdom': 'GB',
  Ireland: 'IE',
  Germany: 'DE',
  Italy: 'IT',
  Netherlands: 'NL',
  Belgium: 'BE',
  Switzerland: 'CH',
  'United States': 'US',
  Canada: 'CA',
  Brazil: 'BR',
  Angola: 'AO',
  Mozambique: 'MZ',
  'Cape Verde': 'CV',
}
export const COUNTRIES = Object.keys(COUNTRY_REGIONS)

/** "Spain" → "Espanha" in Portuguese; English (and unknown names) stay as stored. */
export function countryLabel(value: string | undefined): string {
  if (!value) return ''
  const code = COUNTRY_REGIONS[value]
  if (!code || getLang() === 'en') return value
  try {
    return new Intl.DisplayNames([localeTag()], { type: 'region' }).of(code) ?? value
  } catch {
    return value
  }
}
export const countryOptions = () => COUNTRIES.map((value) => ({ value, label: countryLabel(value) }))

/** Language names are shown in their own language (stored as shown). */
export const LANGUAGES = ['English', 'Português (Portugal)', 'Português (Brasil)', 'Español', 'Français', 'Deutsch', 'Italiano', 'Nederlands']

/** Stored as the English reason text (clients.md §4 Block client); shown translated (clients.block.reasons.*). */
const BLOCK_REASON_KEYS: Record<string, string> = {
  'Too many no-shows': 'noShows',
  'Too many late cancellations': 'lateCancellations',
  'Too many reschedules': 'reschedules',
  'Rude or inappropriate to a team member': 'rude',
  'Refused to pay': 'refusedToPay',
  'Booked fake appointments': 'fakeAppointments',
  Other: 'other',
}
export const BLOCK_REASONS = Object.keys(BLOCK_REASON_KEYS)
/** Portuguese text of a key, whatever the current language (demo data written in Portuguese is recognised too). */
const ptText = (key: string) => i18n.getFixedT('pt-PT')(key)

/** English value of a stored reason, also when it was saved as its Portuguese text. */
const canonicalReason = (value: string) => (BLOCK_REASON_KEYS[value] ? value : (BLOCK_REASONS.find((r) => ptText(`clients.block.reasons.${BLOCK_REASON_KEYS[r]}`) === value) ?? value))
export const blockReasonLabel = (value: string) => {
  const reason = canonicalReason(value)
  return BLOCK_REASON_KEYS[reason] ? i18n.t(`clients.block.reasons.${BLOCK_REASON_KEYS[reason]}`) : value
}
export const blockReasonOptions = () => BLOCK_REASONS.map((value) => ({ value, label: blockReasonLabel(value) }))

/** Allergy reactions are stored in English; shown translated (clients.allergy.reactions.*). */
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
/** "Acute kidney failure" → "acuteKidneyFailure". */
const reactionKey = (value: string) => value.toLowerCase().replace(/[^a-z]+(.)/g, (_, c: string) => c.toUpperCase())
/** English value of a stored reaction, also when it was saved as its Portuguese text. */
export const canonicalReaction = (value: string | undefined) => (!value || ALLERGY_REACTIONS.includes(value) ? value : (ALLERGY_REACTIONS.find((r) => ptText(`clients.allergy.reactions.${reactionKey(r)}`) === value) ?? value))
export const reactionLabel = (value: string | undefined) => {
  const reaction = canonicalReaction(value)
  return reaction && ALLERGY_REACTIONS.includes(reaction) ? i18n.t(`clients.allergy.reactions.${reactionKey(reaction)}`) : (value ?? '')
}
export const reactionOptions = () => ALLERGY_REACTIONS.map((value) => ({ value, label: reactionLabel(value) }))

export const SEVERITY_COLORS = { mild: '#2E9B48', moderate: '#E07B1F', severe: '#D0304A', fatal: '#1E1E1E' } as const

export interface Swatch {
  key: string
  label: string
  color: string
  text: string
}

const DARK_TEXT = new Set(['yellow', 'lime', 'amber', 'lightGrey'])

/** Colour name in the current language (labels are read at render time, never frozen at import). */
const paletteSwatch = (key: PaletteColor): Swatch => ({
  key,
  get label() {
    return getLang() === 'en' ? PALETTE[key].label : i18n.t(`catalog.colors.${key}`)
  },
  color: PALETTE[key].edge,
  text: DARK_TEXT.has(key) ? '#1E1E1E' : '#FFFFFF',
})
const neutralSwatch = (key: 'black' | 'charcoal' | 'grey' | 'lightGrey', color: string, text: string): Swatch => ({
  key,
  get label() {
    return i18n.t(`calendar.note.colors.${key}`)
  },
  color,
  text,
})

/** The 22 colours used by badges and the note text-colour picker (calendar.md §7.4). */
export const SWATCHES: Swatch[] = [
  ...PALETTE_ORDER.map(paletteSwatch),
  neutralSwatch('black', '#141414', '#FFFFFF'),
  neutralSwatch('charcoal', '#4A4A4A', '#FFFFFF'),
  neutralSwatch('grey', '#8C8C8C', '#FFFFFF'),
  neutralSwatch('lightGrey', '#D9D9D9', '#1E1E1E'),
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

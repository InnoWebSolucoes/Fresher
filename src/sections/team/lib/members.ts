import i18n from 'i18next'
import type { PaletteColor, PermissionLevel, TeamMember } from '@/types'
import type { MemberExtrasMap, TeamMemberRecord } from '@/api/team'
import { asRecord } from '@/api/team'
import { todayISO } from '@/lib/time'
import { getLang, localeTag } from '@/i18n/language'
import { PALETTE } from '@/styles/palette'

export { asRecord }
export type { TeamMemberRecord }

/** The 17 calendar colour swatches, in reference order (team.md §2.1). */
export const MEMBER_COLORS: PaletteColor[] = ['blue', 'darkBlue', 'jordyBlue', 'indigo', 'lavender', 'purple', 'wisteria', 'pink', 'coral', 'bloodOrange', 'orange', 'amber', 'yellow', 'lime', 'green', 'teal', 'cyan']

/** Calendar colour name in the current language (English keeps the palette names). */
export const colorLabel = (c: PaletteColor) => (getLang() === 'en' ? PALETTE[c].label : i18n.t(`catalog.colors.${c}`))

export const memberName = (m: Pick<TeamMember, 'firstName' | 'lastName'>) => `${m.firstName} ${m.lastName}`.trim()

export function roleName(roles: PermissionLevel[], id: string): string {
  return roles.find((r) => r.id === id)?.name ?? id
}

/** Team list sort options (team.md §1.2). */
export const MEMBER_SORTS = ['custom', 'nameAsc', 'nameDesc', 'surnameAsc', 'surnameDesc', 'startedAsc', 'startedDesc', 'ratingDesc', 'ratingAsc', 'updatedAsc', 'updatedDesc'] as const
export type MemberSort = (typeof MEMBER_SORTS)[number]

export function sortMembers<T extends TeamMember>(list: T[], sort: MemberSort, extras?: MemberExtrasMap): T[] {
  const by = (fn: (a: T, b: T) => number) => [...list].sort((a, b) => fn(a, b) || a.order - b.order)
  const updated = (m: T) => {
    const rec = asRecord(m, extras)
    return rec.updatedAt ?? rec.createdAt ?? m.startDate
  }
  switch (sort) {
    case 'custom':
      return by((a, b) => a.order - b.order)
    case 'nameAsc':
      return by((a, b) => memberName(a).localeCompare(memberName(b)))
    case 'nameDesc':
      return by((a, b) => memberName(b).localeCompare(memberName(a)))
    case 'surnameAsc':
      return by((a, b) => a.lastName.localeCompare(b.lastName))
    case 'surnameDesc':
      return by((a, b) => b.lastName.localeCompare(a.lastName))
    case 'startedAsc':
      return by((a, b) => a.startDate.localeCompare(b.startDate))
    case 'startedDesc':
      return by((a, b) => b.startDate.localeCompare(a.startDate))
    case 'ratingDesc':
      return by((a, b) => b.rating - a.rating)
    case 'ratingAsc':
      return by((a, b) => a.rating - b.rating)
    case 'updatedAsc':
      return by((a, b) => updated(a).localeCompare(updated(b)))
    case 'updatedDesc':
      return by((a, b) => updated(b).localeCompare(updated(a)))
  }
}

/** /calendar week view for one member (team.md §1.4 "View calendar"). */
export function calendarLink(m: TeamMember): string {
  const params = new URLSearchParams({ date: todayISO(), view: 'week', calendar_selected_resources: `e-${m.id}` })
  if (m.locationIds[0]) params.set('location_id', m.locationIds[0])
  return `/calendar?${params.toString()}`
}

export function shiftsLink(m: TeamMember): string {
  const params = new URLSearchParams({ variant: 'team_member', teamMemberId: m.id })
  if (m.locationIds[0]) params.set('locationId', m.locationIds[0])
  return `/team/scheduled-shifts?${params.toString()}`
}

export const PHONE_CODES = ['+351', '+34', '+44', '+1', '+33', '+49', '+39', '+55', '+244', '+258', '+238', '+41', '+31', '+32', '+353', '+971']

const REGION_CODES =
  'AF AX AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW XK'

/** Region names in a language (the stored country value is always the English name). */
const regionNames = (tag: string) => {
  const names = new Intl.DisplayNames([tag], { type: 'region' })
  // The top countries (e.g. Canada) are not all in REGION_CODES.
  return new Map([...new Set([...REGION_CODES.split(' '), ...TOP_COUNTRIES])].map((code) => [code, names.of(code) ?? code]))
}
let english: { byCode: Map<string, string>; byName: Map<string, string> } | undefined
const englishNames = () => {
  if (!english) {
    const byCode = regionNames('en')
    english = { byCode, byName: new Map([...byCode].map(([code, name]) => [name, code])) }
  }
  return english
}

const TOP_COUNTRIES = ['US', 'GB', 'CA', 'AE']

/** "Select country" list: United States, United Kingdom, Canada, United Arab Emirates, then A–Z (stored in English). */
export const COUNTRIES: string[] = (() => {
  const { byCode } = englishNames()
  const top = TOP_COUNTRIES.map((code) => byCode.get(code) ?? code)
  return [...top, ...[...byCode.values()].filter((n) => !top.includes(n)).sort((a, b) => a.localeCompare(b))]
})()

/** A stored (English) country name in the current language; English and unknown names stay as stored. */
export function countryLabel(value: string | undefined): string {
  if (!value) return ''
  const code = englishNames().byName.get(value)
  if (!code || getLang() === 'en') return value
  try {
    return new Intl.DisplayNames([localeTag()], { type: 'region' }).of(code) ?? value
  } catch {
    return value
  }
}

/** Country select options: values in English, labels and A–Z order in the current language. */
export function countryOptions(): { value: string; label: string }[] {
  if (getLang() === 'en') return COUNTRIES.map((value) => ({ value, label: value }))
  const top = COUNTRIES.slice(0, TOP_COUNTRIES.length)
  const rest = COUNTRIES.slice(TOP_COUNTRIES.length).map((value) => ({ value, label: countryLabel(value) }))
  return [...top.map((value) => ({ value, label: countryLabel(value) })), ...rest.sort((a, b) => a.label.localeCompare(b.label, localeTag()))]
}

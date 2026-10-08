import { format, isValid, parse } from 'date-fns'
import { now } from '@/lib/time'
import type { Client } from '@/types'
import type { ImportRow } from '@/api/clients'

/**
 * The client import template, byte for byte as captured in
 * reference/screenshots/files/clients-import-client_import_template.csv
 * (CRLF line endings, no BOM).
 */
export const IMPORT_TEMPLATE = [
  'First name,Last name,Email,Mobile phone,Gender,Birthday,Email marketing consent,SMS marketing consent,WhatsApp marketing consent,Email notifications,SMS notifications,WhatsApp notifications,Staff alert,Tags',
  'John,Doe,johndoe@example.com,+44 755 555 5555,Prefer not to say,31/01/2000,Yes,Yes,Yes,Yes,Yes,Yes,Allergic to hair dye,VIP|returning',
  'Jane,Doe,janedoe@example.com,+44 766 666 6666,Female,12/05/1989,No,No,No,No,No,No,,',
  'First name of the client (required),Last name of the client,Email address of the client,"Mobile phone number of the client, Please include country code","Gender of the client, Accepted values: M, F, Male, Female, Non binary, Prefer not to say","Birthday of the client: format YYYY-MM-DD, DD/MM/YYYY or MM/DD/YYYY if your business is in USA, Panama, or the Philippines","Whether the client consents to email marketing, Accepted values: Yes, No","Whether the client consents to SMS marketing, Accepted values: Yes, No","Whether the client consents to WhatsApp marketing, Accepted values: Yes, No","Whether the client wants to receive email notifications, Accepted values: Yes, No","Whether the client wants to receive SMS notifications, Accepted values: Yes, No","Whether the client wants to receive WhatsApp notifications, Accepted values: Yes, No",This staff alert will appear on the client\'s profile and appointments,"Tags assigned to the client, separate multiple tags with a pipe character (|), e.g. VIP|returning"',
].join('\r\n') + '\r\n'

export const TEMPLATE_FILE_NAME = 'client_import_template.csv'

/** RFC 4180-ish parser: quoted cells, escaped quotes, CRLF/LF, BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '')
  const firstLine = src.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
      continue
    }
    if (ch === '"') quoted = true
    else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

/** Columns of the client list a file column can be matched to. */
export const IMPORT_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'gender',
  'birthday',
  'emailMarketing',
  'smsMarketing',
  'whatsappMarketing',
  'emailNotifications',
  'smsNotifications',
  'whatsappNotifications',
  'staffAlert',
  'tags',
] as const
export type ImportField = (typeof IMPORT_FIELDS)[number]

/** Template header for each field (used for automatic matching). */
export const FIELD_HEADERS: Record<ImportField, string[]> = {
  firstName: ['first name', 'firstname', 'name', 'first'],
  lastName: ['last name', 'lastname', 'surname', 'last'],
  email: ['email', 'email address', 'e-mail'],
  phone: ['mobile phone', 'mobile', 'phone', 'mobile number', 'phone number', 'telephone'],
  gender: ['gender', 'sex'],
  birthday: ['birthday', 'date of birth', 'dob', 'birth date'],
  emailMarketing: ['email marketing consent', 'email marketing'],
  smsMarketing: ['sms marketing consent', 'sms marketing'],
  whatsappMarketing: ['whatsapp marketing consent', 'whatsapp marketing'],
  emailNotifications: ['email notifications'],
  smsNotifications: ['sms notifications'],
  whatsappNotifications: ['whatsapp notifications'],
  staffAlert: ['staff alert', 'alert', 'notes'],
  tags: ['tags', 'tag'],
}

export type Mapping = Record<ImportField, number | null>

export function autoMap(headers: string[]): Mapping {
  const norm = headers.map((h) => h.trim().toLowerCase())
  const used = new Set<number>()
  const mapping = {} as Mapping
  for (const field of IMPORT_FIELDS) {
    const index = norm.findIndex((h, i) => !used.has(i) && FIELD_HEADERS[field].includes(h))
    mapping[field] = index >= 0 ? index : null
    if (index >= 0) used.add(index)
  }
  return mapping
}

const DESCRIPTION_ROW = 'first name of the client (required)'

export interface PreviewRow {
  line: number
  row: ImportRow
  /** Birthday as typed, for the preview table. */
  birthdayLabel: string
  errors: string[]
}

function parseBirthday(value: string): string | undefined | null {
  const v = value.trim()
  if (!v) return undefined
  for (const pattern of ['yyyy-MM-dd', 'dd/MM/yyyy', 'd/M/yyyy', 'dd-MM-yyyy', 'dd.MM.yyyy']) {
    const d = parse(v, pattern, new Date(2000, 0, 1))
    if (isValid(d) && d.getFullYear() > 1900 && d <= now()) return format(d, 'yyyy-MM-dd')
  }
  return null
}

function parseGender(value: string): Client['gender'] | null | undefined {
  const v = value.trim().toLowerCase()
  if (!v) return undefined
  if (v === 'f' || v === 'female') return 'female'
  if (v === 'm' || v === 'male') return 'male'
  if (v === 'non binary' || v === 'non-binary' || v === 'nonbinary') return 'non_binary'
  if (v === 'prefer not to say') return 'undisclosed'
  return null
}

const yes = (value: string | undefined) => {
  const v = (value ?? '').trim().toLowerCase()
  if (!v) return true
  return v === 'yes' || v === 'y' || v === 'true' || v === '1'
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Turn parsed CSV rows into import rows with validation messages (English
 * error keys resolved by the caller with t()).
 */
export function buildPreview(rows: string[][], mapping: Mapping, existingEmails: Set<string>): PreviewRow[] {
  const get = (r: string[], field: ImportField) => (mapping[field] === null ? '' : (r[mapping[field]!] ?? '').trim())
  const seen = new Set<string>()
  return rows
    .map((r, i) => ({ r, line: i + 2 }))
    .filter(({ r }) => (r[0] ?? '').trim().toLowerCase() !== DESCRIPTION_ROW)
    .map(({ r, line }) => {
      const errors: string[] = []
      const firstName = get(r, 'firstName')
      const email = get(r, 'email')
      const birthdayRaw = get(r, 'birthday')
      const birthday = parseBirthday(birthdayRaw)
      const gender = parseGender(get(r, 'gender'))
      if (!firstName) errors.push('firstNameRequired')
      if (email && !EMAIL.test(email)) errors.push('invalidEmail')
      else if (email && (existingEmails.has(email.toLowerCase()) || seen.has(email.toLowerCase()))) errors.push('duplicateEmail')
      if (birthday === null) errors.push('invalidBirthday')
      if (gender === null) errors.push('invalidGender')
      if (email) seen.add(email.toLowerCase())
      return {
        line,
        birthdayLabel: birthday ? format(parse(birthday, 'yyyy-MM-dd', new Date(2000, 0, 1)), 'MMMM d, yyyy') : birthdayRaw,
        errors,
        row: {
          firstName,
          lastName: get(r, 'lastName'),
          email,
          phone: get(r, 'phone'),
          gender: gender ?? undefined,
          birthday: birthday ?? undefined,
          marketing: { email: yes(get(r, 'emailMarketing')), sms: yes(get(r, 'smsMarketing')), whatsapp: yes(get(r, 'whatsappMarketing')) },
          notifications: { email: yes(get(r, 'emailNotifications')), sms: yes(get(r, 'smsNotifications')), whatsapp: yes(get(r, 'whatsappNotifications')) },
          staffAlert: get(r, 'staffAlert') || undefined,
          tags: get(r, 'tags')
            .split('|')
            .map((t) => t.trim())
            .filter(Boolean),
        },
      }
    })
}

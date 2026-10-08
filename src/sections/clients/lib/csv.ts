import { isValid, parse } from 'date-fns'
import i18n from 'i18next'
import { format } from '@/lib/dates'
import { getLang } from '@/i18n/language'
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

/** Portuguese text, whatever the current language: the importer reads Portuguese and English files alike. */
const ptT = (key: string) => i18n.getFixedT('pt-PT')(key)

/** Lower case, trimmed, without accents ("Género" → "genero"), for matching headers and values. */
const norm = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

/** One CSV cell, quoted only when it holds a comma, quote or line break (as in the English template). */
const csvCell = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)

/** The import template in the current language: the English file byte for byte, or the Portuguese version (same columns, Portuguese headers and values). */
export function importTemplate(): string {
  if (getLang() === 'en') return IMPORT_TEMPLATE
  const t = (key: string) => i18n.t(key)
  const yes = t('clients.more.import.preview.yes')
  const no = t('clients.more.import.preview.no')
  const rows = [
    IMPORT_FIELDS.map((field) => t(`clients.more.import.fields.${field}`)),
    ['João', 'Silva', 'joaosilva@example.com', '+351 912 345 678', t('clients.more.import.genders.undisclosed'), '31/01/2000', yes, yes, yes, yes, yes, yes, t('clients.more.import.template.sampleAlert'), t('clients.more.import.template.sampleTags')],
    ['Joana', 'Silva', 'joanasilva@example.com', '+351 913 456 789', t('clients.more.import.genders.female'), '12/05/1989', no, no, no, no, no, no, '', ''],
    IMPORT_FIELDS.map((field) => t(`clients.more.import.fieldHelp.${field}`)),
  ]
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

export const templateFileName = () => (getLang() === 'en' ? TEMPLATE_FILE_NAME : i18n.t('clients.more.import.template.fileName'))

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

/** Portuguese headers accepted too (compared without accents), besides the Portuguese template's own headers. */
const PT_FIELD_HEADERS: Record<ImportField, string[]> = {
  firstName: ['nome proprio', 'primeiro nome', 'nome'],
  lastName: ['apelido', 'apelidos', 'sobrenome', 'ultimo nome'],
  email: ['email', 'e-mail', 'endereco de email', 'endereco de e-mail'],
  phone: ['telemovel', 'numero de telemovel', 'telefone', 'numero de telefone', 'contacto'],
  gender: ['genero', 'sexo'],
  birthday: ['data de nascimento', 'aniversario', 'nascimento'],
  emailMarketing: ['consentimento de marketing por email', 'marketing por email'],
  smsMarketing: ['consentimento de marketing por sms', 'marketing por sms'],
  whatsappMarketing: ['consentimento de marketing por whatsapp', 'marketing por whatsapp'],
  emailNotifications: ['notificacoes por email'],
  smsNotifications: ['notificacoes por sms'],
  whatsappNotifications: ['notificacoes por whatsapp'],
  staffAlert: ['alerta da equipa', 'alerta para a equipa', 'alerta', 'notas'],
  tags: ['etiquetas', 'etiqueta'],
}

export type Mapping = Record<ImportField, number | null>

export function autoMap(headers: string[]): Mapping {
  const normalized = headers.map(norm)
  const used = new Set<number>()
  const mapping = {} as Mapping
  for (const field of IMPORT_FIELDS) {
    const accepted = [...FIELD_HEADERS[field], ...PT_FIELD_HEADERS[field], norm(ptT(`clients.more.import.fields.${field}`))]
    const index = normalized.findIndex((h, i) => !used.has(i) && accepted.includes(h))
    mapping[field] = index >= 0 ? index : null
    if (index >= 0) used.add(index)
  }
  return mapping
}

/** First cell of the templates' description row (English and Portuguese), skipped on import. */
const isDescriptionRow = (first: string) => {
  const v = norm(first)
  return v === 'first name of the client (required)' || v === norm(ptT('clients.more.import.fieldHelp.firstName'))
}

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

/** Gender values accepted in English and Portuguese, case- and accent-insensitive. */
const GENDER_VALUES: Record<NonNullable<Client['gender']>, string[]> = {
  female: ['f', 'female', 'feminino', 'feminina'],
  male: ['m', 'male', 'masculino'],
  non_binary: ['non binary', 'non-binary', 'nonbinary', 'nao binario', 'nao-binario', 'nao binaria'],
  undisclosed: ['prefer not to say', 'prefiro nao dizer'],
}

function parseGender(value: string): Client['gender'] | null | undefined {
  const v = norm(value)
  if (!v) return undefined
  for (const gender of Object.keys(GENDER_VALUES) as NonNullable<Client['gender']>[]) {
    if (GENDER_VALUES[gender].includes(v) || v === norm(ptT(`clients.more.import.genders.${gender}`)) || v === norm(ptT(`clients.gender.${gender}`))) return gender
  }
  return null
}

/** Yes/No columns: Yes, Y, true, 1, Sim, S (anything else is "no"); an empty cell means yes. */
const yes = (value: string | undefined) => {
  const v = norm(value ?? '')
  if (!v) return true
  return v === 'yes' || v === 'y' || v === 'true' || v === '1' || v === 'sim' || v === 's' || v === norm(ptT('clients.more.import.preview.yes'))
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
    .filter(({ r }) => !isDescriptionRow(r[0] ?? ''))
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

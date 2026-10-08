import type { PaletteColor, Settings, TeamMember } from '@/types'
import type { PermissionRole } from '@/lib/permissions'
import { asRecord, type MemberAddress, type MemberEmergencyContact, type MemberInput, type MemberExtras, type TriState } from '@/api/team'
import { round2 } from '@/lib/format'
import { todayISO } from '@/lib/time'
import { PHONE_CODES } from '../../lib/members'

export type SectionKey = 'profile' | 'addresses' | 'emergencyContacts' | 'services' | 'locations' | 'settings' | 'wagesAndTimesheets' | 'commissions' | 'payruns'
export const SECTION_KEYS: SectionKey[] = ['profile', 'addresses', 'emergencyContacts', 'services', 'locations', 'settings', 'wagesAndTimesheets', 'commissions', 'payruns']

export interface FormState {
  firstName: string
  lastName: string
  email: string
  phoneCode: string
  phone: string
  additionalPhoneCode: string
  additionalPhone: string
  country: string
  birthMonth: string
  birthDay: string
  birthYear: string
  gender: string
  pronouns: string
  color: PaletteColor
  jobTitle: string
  startDate: string
  endDate: string
  employmentType: '' | 'employee' | 'self_employed'
  teamMemberCode: string
  notes: string
  photo?: string
  addresses: MemberAddress[]
  emergencyContacts: MemberEmergencyContact[]
  serviceIds: string[]
  locationIds: string[]
  bookable: boolean
  excludeOnline: boolean
  excludeAutoAssign: boolean
  role: PermissionRole
  wagesEnabled: boolean
  compensationType: 'none' | 'hourly'
  hourlyRate: number | ''
  overtime: boolean
  timesheetSettings: { proximity: TriState; autoClockIn: TriState; autoClockOut: TriState; autoBreaks: TriState }
  commissionEnabled: boolean
  serviceRate: number | ''
  productRate: number | ''
  payRunsEnabled: boolean
  payRunSettings: NonNullable<MemberExtras['payRunSettings']>
}

export type SetField = <K extends keyof FormState>(key: K, value: FormState[K]) => void

function splitPhone(full: string | undefined, code: string | undefined): { code: string; number: string } {
  if (!full) return { code: code ?? '+351', number: '' }
  const trimmed = full.trim()
  const match = PHONE_CODES.find((c) => trimmed.startsWith(`${c} `)) ?? (code && trimmed.startsWith(code) ? code : undefined)
  if (match) return { code: match, number: trimmed.slice(match.length).trim() }
  return { code: code ?? '+351', number: trimmed }
}

const DEFAULT_TIMESHEETS: FormState['timesheetSettings'] = { proximity: 'default', autoClockIn: 'default', autoClockOut: 'default', autoBreaks: 'default' }
const DEFAULT_PAYRUNS: FormState['payRunSettings'] = { calculation: 'automatic', deductProcessingFees: false, deductNewClientFees: false, cashAdvances: false }

export function initialState(member: TeamMember | undefined, ctx: { allServiceIds: string[]; firstLocationId: string; defaultRole: Settings['defaultRole'] }): FormState {
  if (!member) {
    return {
      firstName: '',
      lastName: '',
      email: '',
      phoneCode: '+351',
      phone: '',
      additionalPhoneCode: '+351',
      additionalPhone: '',
      country: '',
      birthMonth: '',
      birthDay: '',
      birthYear: '',
      gender: '',
      pronouns: '',
      color: 'blue',
      jobTitle: '',
      startDate: todayISO(),
      endDate: '',
      employmentType: '',
      teamMemberCode: '',
      notes: '',
      addresses: [],
      emergencyContacts: [],
      serviceIds: ctx.allServiceIds,
      locationIds: ctx.firstLocationId ? [ctx.firstLocationId] : [],
      bookable: true,
      excludeOnline: false,
      excludeAutoAssign: false,
      role: ctx.defaultRole,
      wagesEnabled: false,
      compensationType: 'hourly',
      hourlyRate: '',
      overtime: false,
      timesheetSettings: DEFAULT_TIMESHEETS,
      commissionEnabled: false,
      serviceRate: 30,
      productRate: 10,
      payRunsEnabled: true,
      payRunSettings: DEFAULT_PAYRUNS,
    }
  }
  const rec = asRecord(member)
  const phone = splitPhone(member.phone, rec.phoneCode)
  const extra = splitPhone(rec.additionalPhone, rec.additionalPhoneCode)
  const [by, bm, bd] = member.birthday ? member.birthday.split('-') : ['', '', '']
  return {
    firstName: member.firstName,
    lastName: member.lastName,
    email: member.email,
    phoneCode: phone.code,
    phone: phone.number,
    additionalPhoneCode: extra.code,
    additionalPhone: extra.number,
    country: member.country ?? '',
    birthMonth: bm ? String(Number(bm)) : '',
    birthDay: bd ? String(Number(bd)) : '',
    birthYear: by && by !== '0000' ? by : '',
    gender: member.gender ?? '',
    pronouns: member.pronouns ?? '',
    color: member.color,
    jobTitle: member.jobTitle,
    startDate: member.startDate,
    endDate: member.endDate ?? '',
    employmentType: member.employmentType ?? '',
    teamMemberCode: member.teamMemberCode ?? '',
    notes: member.notes ?? '',
    photo: rec.photo,
    addresses: rec.addresses ?? [],
    emergencyContacts: rec.emergencyContacts ?? [],
    serviceIds: member.serviceIds === 'all' ? ctx.allServiceIds : member.serviceIds,
    locationIds: member.locationIds,
    bookable: member.bookable,
    excludeOnline: member.excludeOnline,
    excludeAutoAssign: member.excludeAutoAssign,
    role: member.role,
    wagesEnabled: member.wages.enabled,
    compensationType: rec.compensationType ?? 'hourly',
    hourlyRate: member.wages.hourlyRate || '',
    overtime: member.wages.overtime,
    timesheetSettings: rec.timesheetSettings ?? DEFAULT_TIMESHEETS,
    commissionEnabled: member.commission.enabled,
    serviceRate: round2(member.commission.serviceRate * 100),
    productRate: round2(member.commission.productRate * 100),
    payRunsEnabled: member.payRuns.enabled,
    payRunSettings: rec.payRunSettings ?? DEFAULT_PAYRUNS,
  }
}

export function toInput(f: FormState, allServiceIds: string[]): MemberInput {
  const pad = (n: string) => n.padStart(2, '0')
  const birthday = f.birthMonth && f.birthDay ? `${f.birthYear || '0000'}-${pad(f.birthMonth)}-${pad(f.birthDay)}` : undefined
  const all = allServiceIds.every((id) => f.serviceIds.includes(id))
  return {
    firstName: f.firstName.trim(),
    lastName: f.lastName.trim(),
    email: f.email.trim(),
    phone: f.phone.trim() ? `${f.phoneCode} ${f.phone.trim()}` : undefined,
    phoneCode: f.phoneCode,
    additionalPhone: f.additionalPhone.trim() ? `${f.additionalPhoneCode} ${f.additionalPhone.trim()}` : undefined,
    additionalPhoneCode: f.additionalPhoneCode,
    country: f.country || undefined,
    birthday,
    gender: f.gender || undefined,
    pronouns: f.pronouns || undefined,
    color: f.color,
    jobTitle: f.jobTitle.trim(),
    startDate: f.startDate || todayISO(),
    endDate: f.endDate || undefined,
    employmentType: f.employmentType || undefined,
    teamMemberCode: f.teamMemberCode.trim() || undefined,
    notes: f.notes.trim() || undefined,
    photo: f.photo,
    addresses: f.addresses,
    emergencyContacts: f.emergencyContacts,
    serviceIds: all ? 'all' : f.serviceIds,
    locationIds: f.locationIds,
    bookable: f.bookable,
    excludeOnline: f.excludeOnline,
    excludeAutoAssign: f.excludeAutoAssign,
    role: f.role,
    wages: { enabled: f.wagesEnabled, hourlyRate: f.compensationType === 'hourly' ? Number(f.hourlyRate || 0) : 0, overtime: f.compensationType === 'hourly' && f.overtime },
    compensationType: f.compensationType,
    timesheetSettings: f.timesheetSettings,
    commission: { enabled: f.commissionEnabled, serviceRate: Number(f.serviceRate || 0) / 100, productRate: Number(f.productRate || 0) / 100 },
    payRuns: { enabled: f.payRunsEnabled, method: 'manual' },
    payRunSettings: f.payRunSettings,
  }
}

import clsx from 'clsx'
import { format } from 'date-fns'
import { Camera, Check, ChevronDown, ChevronUp, MapPin, Plus, User as UserIcon } from 'lucide-react'
import { useMemo, useRef, useState, type ReactNode, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import type { TeamMember } from '@/types'
import { useDb } from '@/store/db'
import { PALETTE } from '@/styles/palette'
import { money } from '@/lib/format'
import { durationLong } from '@/lib/time'
import { uid } from '@/lib/ids'
import { Button, Checkbox, Field, LearnMore, Modal, MoneyInput, RadioGroup, SearchInput, Select, Switch, TextArea, TextInput, confirm, toast } from '@/components/ui'
import { inviteWouldSend, removeLinkedCalendar, renameLinkedCalendar, type MemberAddress, type MemberEmergencyContact, type TriState } from '@/api/team'
import { PortalMenu, ActionsPill } from '../../components/common'
import { RoleSelect } from '../../components/RoleSelect'
import { COUNTRIES, MEMBER_COLORS, PHONE_CODES } from '../../lib/members'
import type { FormState, SetField } from './state'

interface SectionProps {
  form: FormState
  set: SetField
}

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="font-display text-title-2 text-ink">{title}</h2>
      {subtitle && <p className="mt-1 text-body text-muted">{subtitle}</p>}
    </div>
  )
}

function PhoneField({ label, code, number, onCode, onNumber }: { label: string; code: string; number: string; onCode: (v: string) => void; onNumber: (v: string) => void }) {
  const { t } = useTranslation()
  return (
    <Field label={label}>
      {(id) => (
        <div className="flex gap-2">
          <Select aria-label={t('team.form.profile.countryCode')} value={code} onChange={(e) => onCode(e.target.value)} options={PHONE_CODES} className="w-[110px] shrink-0" />
          <TextInput id={id} type="tel" inputMode="tel" value={number} onChange={(e) => onNumber(e.target.value)} />
        </div>
      )}
    </Field>
  )
}

// ─── Profile ───────────────────────────────────────────────────────────────

export function ProfileSection({ form, set, mode, errors }: SectionProps & { mode: 'add' | 'edit'; errors: Record<string, string | undefined> }) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: format(new Date(2020, i, 1), 'MMMM') })), [])
  const pickPhoto = (file: File | undefined) => {
    if (!file) return
    if (file.size > 2_000_000) {
      toast(t('team.form.profile.photoTooBig'), 'error')
      return
    }
    const reader = new FileReader()
    reader.onload = () => set('photo', String(reader.result))
    reader.readAsDataURL(file)
  }
  const initials = `${form.firstName[0] ?? ''}${form.lastName[0] ?? ''}`.toUpperCase()
  const palette = PALETTE[form.color]
  return (
    <>
      <SectionTitle title={t('team.form.nav.profile')} subtitle={t('team.form.profile.subtitle')} />
      <div className="relative mb-8 h-36 w-36">
        {form.photo ? (
          <img src={form.photo} alt="" className="h-36 w-36 rounded-full object-cover" />
        ) : (
          <span className="flex h-36 w-36 items-center justify-center rounded-full font-display text-[44px] font-semibold" style={{ background: palette.fill, color: palette.text }}>
            {initials || <UserIcon size={56} aria-hidden />}
          </span>
        )}
        <button type="button" onClick={() => fileRef.current?.click()} aria-label={t('team.form.profile.uploadPhoto')} title={t('team.form.profile.uploadPhoto')} className="absolute bottom-1 right-1 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-sm hover:bg-sunken">
          <Camera size={18} aria-hidden />
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0])} />
        {form.photo && (
          <button type="button" className="absolute -bottom-7 left-0 right-0 text-center text-small text-primary hover:underline" onClick={() => set('photo', undefined)}>
            {t('team.form.profile.removePhoto')}
          </button>
        )}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={`${t('team.form.profile.firstName')} *`} error={errors.firstName}>
          {(id) => <TextInput id={id} value={form.firstName} invalid={Boolean(errors.firstName)} onChange={(e) => set('firstName', e.target.value)} autoComplete="off" />}
        </Field>
        <Field label={t('team.form.profile.lastName')}>{(id) => <TextInput id={id} value={form.lastName} onChange={(e) => set('lastName', e.target.value)} autoComplete="off" />}</Field>
        <Field label={mode === 'add' ? `${t('team.form.profile.email')} *` : t('team.form.profile.email')} error={errors.email}>
          {(id) => <TextInput id={id} type="email" value={form.email} invalid={Boolean(errors.email)} onChange={(e) => set('email', e.target.value)} autoComplete="off" />}
        </Field>
        <PhoneField label={t('team.form.profile.phone')} code={form.phoneCode} number={form.phone} onCode={(v) => set('phoneCode', v)} onNumber={(v) => set('phone', v)} />
        <PhoneField label={t('team.form.profile.additionalPhone')} code={form.additionalPhoneCode} number={form.additionalPhone} onCode={(v) => set('additionalPhoneCode', v)} onNumber={(v) => set('additionalPhone', v)} />
        <Field label={t('team.form.profile.country')}>{(id) => <Select id={id} value={form.country} onChange={(e) => set('country', e.target.value)} placeholder={t('team.form.profile.selectCountry')} options={COUNTRIES} />}</Field>
        <Field label={t('team.form.profile.birthday')} error={errors.birthday}>
          {(id) => (
            <div className="grid grid-cols-3 gap-2">
              <Select id={id} aria-label={t('team.form.profile.month')} value={form.birthMonth} onChange={(e) => set('birthMonth', e.target.value)} placeholder={t('team.form.profile.month')} options={months} />
              <TextInput aria-label={t('team.form.profile.day')} placeholder={t('team.form.profile.day')} inputMode="numeric" value={form.birthDay} onChange={(e) => set('birthDay', e.target.value.replace(/\D/g, '').slice(0, 2))} />
              <TextInput aria-label={t('team.form.profile.year')} placeholder={t('team.form.profile.year')} inputMode="numeric" value={form.birthYear} onChange={(e) => set('birthYear', e.target.value.replace(/\D/g, '').slice(0, 4))} />
            </div>
          )}
        </Field>
        <div />
        <Field label={t('team.form.profile.gender')}>
          {(id) => <Select id={id} value={form.gender} onChange={(e) => set('gender', e.target.value)} placeholder={t('team.form.selectOption')} options={(['female', 'male', 'non_binary', 'undisclosed'] as const).map((g) => ({ value: g, label: t(`team.gender.${g}`) }))} />}
        </Field>
        <Field label={t('team.form.profile.pronouns')}>
          {(id) => <Select id={id} value={form.pronouns} onChange={(e) => set('pronouns', e.target.value)} placeholder={t('team.form.selectOption')} options={(['she', 'he', 'they', 'undisclosed'] as const).map((p) => ({ value: p, label: t(`team.pronouns.${p}`) }))} />}
        </Field>
      </div>

      <fieldset className="mt-6">
        <legend className="label">{t('team.form.profile.color')}</legend>
        <div className="flex max-w-[420px] flex-wrap gap-3">
          {MEMBER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={PALETTE[c].label}
              aria-pressed={form.color === c}
              title={PALETTE[c].label}
              onClick={() => set('color', c)}
              className={clsx('flex h-9 w-9 items-center justify-center rounded-full ring-offset-2 ring-offset-canvas transition-shadow', form.color === c ? 'ring-2 ring-primary' : 'hover:ring-2 hover:ring-line-strong')}
              style={{ background: PALETTE[c].edge }}
            >
              {form.color === c && <Check size={16} className="text-white" aria-hidden />}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-6 border-t border-line pt-6 sm:w-1/2 sm:pr-2.5">
        <Field label={t('team.form.profile.jobTitle')} hint={t('team.form.profile.jobTitleHint')}>
          {(id) => <TextInput id={id} value={form.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} />}
        </Field>
      </div>

      <div className="mt-8 border-t border-line pt-8">
        <SectionTitle title={t('team.form.work.title')} subtitle={t('team.form.work.subtitle')} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t('team.form.work.startDate')}>{(id) => <input id={id} type="date" className="input" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />}</Field>
          <Field label={t('team.form.work.endDate')} error={errors.endDate}>
            {(id) => <input id={id} type="date" className="input" min={form.startDate} value={form.endDate} onChange={(e) => set('endDate', e.target.value)} />}
          </Field>
          <Field label={t('team.form.work.employmentType')}>
            {(id) => (
              <Select
                id={id}
                value={form.employmentType}
                onChange={(e) => set('employmentType', e.target.value as FormState['employmentType'])}
                placeholder={t('team.form.selectOption')}
                options={[
                  { value: 'employee', label: t('team.employment.employee') },
                  { value: 'self_employed', label: t('team.employment.self_employed') },
                ]}
              />
            )}
          </Field>
          <Field label={t('team.form.work.memberId')} hint={t('team.form.work.memberIdHint')}>
            {(id) => <TextInput id={id} value={form.teamMemberCode} onChange={(e) => set('teamMemberCode', e.target.value)} />}
          </Field>
        </div>
        <Field className="mt-5" label={t('team.form.work.notes')} counter={{ value: form.notes.length, max: 1000 }}>
          {(id) => <TextArea id={id} maxLength={1000} value={form.notes} placeholder={t('team.form.work.notesPlaceholder')} onChange={(e) => set('notes', e.target.value)} />}
        </Field>
      </div>
    </>
  )
}

// ─── Addresses and emergency contacts ──────────────────────────────────────

function AddCard({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-lg border border-dashed border-line-strong bg-surface px-5 py-5 text-left text-body-strong text-ink hover:border-primary hover:bg-primary-subtle/30">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-subtle text-primary">
        <Plus size={18} aria-hidden />
      </span>
      {label}
    </button>
  )
}

export function AddressesSection({ form, set }: SectionProps) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState<MemberAddress | 'new' | null>(null)
  const remove = (id: string) => set('addresses', form.addresses.filter((a) => a.id !== id))
  return (
    <>
      <SectionTitle title={t('team.form.nav.addresses')} subtitle={t('team.form.addresses.subtitle')} />
      <div className="flex flex-col gap-3">
        {form.addresses.map((a) => (
          <div key={a.id} className="card flex items-start justify-between gap-4 p-5">
            <div className="flex gap-3">
              <MapPin size={20} className="mt-0.5 text-muted" aria-hidden />
              <div>
                <p className="text-body-strong text-ink">{t(`team.form.addresses.types.${a.type}`)}</p>
                <p className="text-body text-muted">{[a.line1, a.line2, `${a.postcode} ${a.city}`, a.country].filter(Boolean).join(', ')}</p>
              </div>
            </div>
            <PortalMenu
              groups={[{ items: [{ label: t('team.common.edit'), onSelect: () => setEditing(a) }, { label: t('team.common.remove'), danger: true, onSelect: () => remove(a.id) }] }]}
              trigger={({ open, toggle }) => <ActionsPill open={open} toggle={toggle} label={t('team.common.actions')} />}
            />
          </div>
        ))}
        <AddCard label={t('team.form.addresses.add')} onClick={() => setEditing('new')} />
      </div>
      {editing && (
        <AddressModal
          address={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(a) => {
            set('addresses', editing === 'new' ? [...form.addresses, a] : form.addresses.map((x) => (x.id === a.id ? a : x)))
            setEditing(null)
          }}
        />
      )}
    </>
  )
}

function AddressModal({ address, onClose, onSave }: { address: MemberAddress | null; onClose: () => void; onSave: (a: MemberAddress) => void }) {
  const { t } = useTranslation()
  const [a, setA] = useState<MemberAddress>(address ?? { id: uid('addr'), type: 'home', line1: '', line2: '', city: '', postcode: '', country: 'Portugal' })
  const [touched, setTouched] = useState(false)
  const missing = !a.line1.trim() || !a.city.trim()
  return (
    <Modal
      open
      onClose={onClose}
      title={address ? t('team.form.addresses.editTitle') : t('team.form.addresses.addTitle')}
      footer={
        <>
          <Button onClick={onClose}>{t('team.common.cancel')}</Button>
          <Button
            variant="primary"
            onClick={() => {
              setTouched(true)
              if (!missing) onSave({ ...a, line1: a.line1.trim(), city: a.city.trim() })
            }}
          >
            {t('team.common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 pb-2 sm:grid-cols-2">
        <Field label={t('team.form.addresses.type')} className="sm:col-span-2">
          {(id) => <Select id={id} value={a.type} onChange={(e) => setA({ ...a, type: e.target.value as MemberAddress['type'] })} options={(['home', 'work', 'other'] as const).map((k) => ({ value: k, label: t(`team.form.addresses.types.${k}`) }))} />}
        </Field>
        <Field label={`${t('team.form.addresses.line1')} *`} className="sm:col-span-2" error={touched && !a.line1.trim() ? t('team.form.errors.required') : undefined}>
          {(id) => <TextInput id={id} value={a.line1} onChange={(e) => setA({ ...a, line1: e.target.value })} />}
        </Field>
        <Field label={t('team.form.addresses.line2')} className="sm:col-span-2">{(id) => <TextInput id={id} value={a.line2 ?? ''} onChange={(e) => setA({ ...a, line2: e.target.value })} />}</Field>
        <Field label={`${t('team.form.addresses.city')} *`} error={touched && !a.city.trim() ? t('team.form.errors.required') : undefined}>
          {(id) => <TextInput id={id} value={a.city} onChange={(e) => setA({ ...a, city: e.target.value })} />}
        </Field>
        <Field label={t('team.form.addresses.postcode')}>{(id) => <TextInput id={id} value={a.postcode} onChange={(e) => setA({ ...a, postcode: e.target.value })} />}</Field>
        <Field label={t('team.form.profile.country')} className="sm:col-span-2">{(id) => <Select id={id} value={a.country} onChange={(e) => setA({ ...a, country: e.target.value })} options={COUNTRIES} />}</Field>
      </div>
    </Modal>
  )
}

export function ContactsSection({ form, set }: SectionProps) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState<MemberEmergencyContact | 'new' | null>(null)
  return (
    <>
      <SectionTitle title={t('team.form.nav.emergencyContacts')} subtitle={t('team.form.contacts.subtitle')} />
      <div className="flex flex-col gap-3">
        {form.emergencyContacts.map((c) => (
          <div key={c.id} className="card flex items-start justify-between gap-4 p-5">
            <div>
              <p className="text-body-strong text-ink">
                {c.fullName} {c.primary && <span className="chip ml-1 bg-primary-subtle text-primary">{t('team.form.contacts.primary')}</span>}
              </p>
              <p className="text-body text-muted">{[c.relationship, c.phone, c.email].filter(Boolean).join(' · ')}</p>
            </div>
            <PortalMenu
              groups={[{ items: [{ label: t('team.common.edit'), onSelect: () => setEditing(c) }, { label: t('team.common.remove'), danger: true, onSelect: () => set('emergencyContacts', form.emergencyContacts.filter((x) => x.id !== c.id)) }] }]}
              trigger={({ open, toggle }) => <ActionsPill open={open} toggle={toggle} label={t('team.common.actions')} />}
            />
          </div>
        ))}
        <AddCard label={t('team.form.contacts.add')} onClick={() => setEditing('new')} />
      </div>
      {editing && (
        <ContactModal
          contact={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(c) => {
            const others = form.emergencyContacts.filter((x) => x.id !== c.id).map((x) => (c.primary ? { ...x, primary: false } : x))
            set('emergencyContacts', editing === 'new' ? [...others, c] : form.emergencyContacts.map((x) => (x.id === c.id ? c : c.primary ? { ...x, primary: false } : x)))
            setEditing(null)
          }}
        />
      )}
    </>
  )
}

function ContactModal({ contact, onClose, onSave }: { contact: MemberEmergencyContact | null; onClose: () => void; onSave: (c: MemberEmergencyContact) => void }) {
  const { t } = useTranslation()
  const [c, setC] = useState<MemberEmergencyContact>(contact ?? { id: uid('ec'), fullName: '', relationship: '', email: '', phone: '', primary: false })
  const [touched, setTouched] = useState(false)
  const errors = { fullName: !c.fullName.trim() ? t('team.form.errors.required') : undefined, phone: !c.phone.trim() ? t('team.form.contacts.phoneRequired') : undefined }
  return (
    <Modal
      open
      onClose={onClose}
      title={contact ? t('team.form.contacts.editTitle') : t('team.form.contacts.addTitle')}
      footer={
        <>
          <Button onClick={onClose}>{t('team.common.cancel')}</Button>
          <Button
            variant="primary"
            onClick={() => {
              setTouched(true)
              if (!errors.fullName && !errors.phone) onSave(c)
            }}
          >
            {t('team.common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 pb-2 sm:grid-cols-2">
        <Field label={`${t('team.form.contacts.fullName')} *`} className="sm:col-span-2" error={touched ? errors.fullName : undefined}>
          {(id) => <TextInput id={id} value={c.fullName} onChange={(e) => setC({ ...c, fullName: e.target.value })} />}
        </Field>
        <Field label={t('team.form.contacts.relationship')} className="sm:col-span-2">{(id) => <TextInput id={id} value={c.relationship} onChange={(e) => setC({ ...c, relationship: e.target.value })} />}</Field>
        <Field label={t('team.form.profile.email')}>{(id) => <TextInput id={id} type="email" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} />}</Field>
        <Field label={`${t('team.form.profile.phone')} *`} error={touched ? errors.phone : undefined}>
          {(id) => <TextInput id={id} type="tel" value={c.phone} invalid={touched && Boolean(errors.phone)} onChange={(e) => setC({ ...c, phone: e.target.value })} />}
        </Field>
        <Checkbox className="sm:col-span-2" label={t('team.form.contacts.primaryLabel')} checked={c.primary} onChange={(v) => setC({ ...c, primary: v })} />
      </div>
    </Modal>
  )
}

// ─── Services and locations ────────────────────────────────────────────────

export function ServicesSection({ form, set }: SectionProps) {
  const { t } = useTranslation()
  const { services, categories } = useDb(useShallow((s) => ({ services: s.services, categories: s.serviceCategories })))
  const [q, setQ] = useState('')
  const active = useMemo(() => services.filter((s) => !s.archived), [services])
  const selected = new Set(form.serviceIds)
  const groups = useMemo(
    () =>
      [...categories]
        .sort((a, b) => a.order - b.order)
        .map((c) => ({ category: c, items: active.filter((s) => s.categoryId === c.id && s.name.toLowerCase().includes(q.trim().toLowerCase())) }))
        .filter((g) => g.items.length),
    [categories, active, q],
  )
  const toggleMany = (ids: string[], on: boolean) => set('serviceIds', on ? [...new Set([...form.serviceIds, ...ids])] : form.serviceIds.filter((id) => !ids.includes(id)))
  const duration = (s: (typeof active)[number]) => {
    const durations = s.variants.length ? s.variants.map((v) => v.durationMin) : [s.durationMin]
    const min = Math.min(...durations)
    const max = Math.max(...durations)
    return min === max ? durationLong(min) : `${durationLong(min)} - ${durationLong(max)}`
  }
  return (
    <>
      <SectionTitle title={t('team.form.nav.services')} subtitle={t('team.form.services.subtitle')} />
      <SearchInput value={q} onChange={setQ} placeholder={t('team.form.services.search')} className="mb-4" />
      <div className="card divide-y divide-line">
        <div className="flex items-center justify-between px-5 py-4">
          <Checkbox label={<span className="font-semibold">{t('team.form.services.all')}</span>} checked={active.every((s) => selected.has(s.id))} onChange={(v) => set('serviceIds', v ? active.map((s) => s.id) : [])} />
          <span className="chip bg-sunken text-muted">{active.filter((s) => selected.has(s.id)).length}</span>
        </div>
        {groups.map(({ category, items }) => (
          <div key={category.id} className="px-5 py-4">
            <div className="flex items-center justify-between">
              <Checkbox label={<span className="font-semibold">{category.name}</span>} checked={items.every((s) => selected.has(s.id))} onChange={(v) => toggleMany(items.map((s) => s.id), v)} />
              <span className="chip bg-sunken text-muted">{items.filter((s) => selected.has(s.id)).length}</span>
            </div>
            <ul className="mt-3 flex flex-col gap-3 pl-8">
              {items.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-4">
                  <Checkbox label={s.name} hint={duration(s)} checked={selected.has(s.id)} onChange={(v) => toggleMany([s.id], v)} />
                  <span className="text-body text-ink">{s.priceType === 'free' ? t('team.form.services.free') : `${s.priceType === 'from' ? t('team.form.services.from') + ' ' : ''}${money(s.price)}`}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {groups.length === 0 && <p className="px-5 py-8 text-center text-body text-muted">{t('team.list.noResults')}</p>}
      </div>
    </>
  )
}

export function LocationsSection({ form, set, error }: SectionProps & { error?: string }) {
  const { t } = useTranslation()
  const locations = useDb((s) => s.locations)
  return (
    <>
      <SectionTitle title={t('team.form.locations.title')} subtitle={t('team.form.locations.subtitle')} />
      <div className="flex flex-col gap-3">
        {locations.map((l) => {
          const on = form.locationIds.includes(l.id)
          return (
            <label key={l.id} className={clsx('card flex cursor-pointer items-center gap-4 p-4 transition-colors', on ? 'border-primary ring-1 ring-primary' : 'hover:border-line-strong')}>
              <input type="checkbox" checked={on} onChange={(e) => set('locationIds', e.target.checked ? [...form.locationIds, l.id] : form.locationIds.filter((x) => x !== l.id))} className="h-5 w-5 accent-[rgb(var(--primary))]" />
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary to-[#2A9CC2] text-on-primary">
                <MapPin size={22} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-body-strong text-ink">{l.name}</span>
                <span className="block text-small text-muted">{`${l.address.line1}, ${l.address.postcode} ${l.address.city}`}</span>
              </span>
              {form.locationIds[0] === l.id && <span className="chip bg-sunken text-muted">{t('team.form.locations.primary')}</span>}
            </label>
          )
        })}
      </div>
      {error && <p className="mt-2 text-small text-danger">{error}</p>}
    </>
  )
}

// ─── Settings ──────────────────────────────────────────────────────────────

export function SettingsSection({ form, set, member, roleRef }: SectionProps & { member?: TeamMember; roleRef: Ref<HTMLButtonElement> }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [advanced, setAdvanced] = useState(form.excludeOnline || form.excludeAutoAssign)
  const owner = member?.role === 'owner'
  const willInvite = !owner && inviteWouldSend(member?.id ?? null, form.role, form.email)
  return (
    <>
      <SectionTitle title={t('team.form.nav.settings')} />
      <div className="card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-title-3 text-ink">{t('team.form.settings.bookingsTitle')}</h3>
            <p className="mt-1 text-body text-muted">
              {t('team.form.settings.bookingsBody')} <LearnMore topic="calendar bookings" />
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-body-strong text-ink">{form.bookable ? t('team.common.on') : t('team.common.off')}</span>
            <Switch checked={form.bookable} onChange={(v) => set('bookable', v)} />
          </div>
        </div>
        <button type="button" className="mt-4 inline-flex items-center gap-1 text-body-strong text-primary hover:underline" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}>
          {t('team.form.settings.advanced')}
          {advanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {advanced && (
          <div className="mt-4 flex flex-col gap-4">
            <Checkbox label={t('team.form.settings.excludeOnline')} hint={t('team.form.settings.excludeOnlineHint')} checked={form.excludeOnline} onChange={(v) => set('excludeOnline', v)} />
            <Checkbox label={t('team.form.settings.excludeAuto')} hint={t('team.form.settings.excludeAutoHint')} checked={form.excludeAutoAssign} onChange={(v) => set('excludeAutoAssign', v)} />
          </div>
        )}
      </div>

      <div className="card mt-5 p-6">
        <h3 className="font-display text-title-3 text-ink">{t('team.form.settings.roleTitle')}</h3>
        <p className="mb-4 mt-1 text-body text-muted">{t('team.form.settings.roleBody')}</p>
        {owner ? (
          <p className="input flex items-center bg-sunken text-muted">{t('team.form.settings.ownerRole')}</p>
        ) : (
          <RoleSelect ref={roleRef} value={form.role} onChange={(r) => set('role', r)} />
        )}
        {willInvite && <p className="mt-3 rounded-md bg-info-subtle px-3 py-2.5 text-small text-info">{t('team.form.settings.inviteNotice', { email: form.email.trim() })}</p>}
        {!owner && form.role !== 'none' && !form.email.trim() && <p className="mt-3 text-small text-muted">{t('team.form.settings.inviteNeedsEmail')}</p>}
        {member?.invite?.status === 'pending' && !willInvite && <p className="mt-3 text-small text-muted">{t('team.form.settings.invitePending', { email: member.email })}</p>}
      </div>

      {member && (
        <div className="card mt-5 p-6">
          <h3 className="font-display text-title-3 text-ink">{t('team.form.settings.linkedTitle')}</h3>
          <p className="mb-4 mt-1 text-body text-muted">
            {t('team.form.settings.linkedBody', { name: member.firstName })} <LearnMore topic="linked calendars" />
          </p>
          <LinkedCalendars member={member} />
          <Button className="mt-4" icon={<Plus size={16} />} onClick={() => navigate(`/team/team-members/calendar-sync/calendar-type?memberId=${member.id}`)}>
            {t('team.form.settings.linkCalendar')}
          </Button>
        </div>
      )}
    </>
  )
}

function LinkedCalendars({ member }: { member: TeamMember }) {
  const { t } = useTranslation()
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  if (!member.linkedCalendars.length) return null
  return (
    <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
      {member.linkedCalendars.map((c) => (
        <li key={c.id} className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-body-strong text-ink">
              {c.name}
              {Date.now() - new Date(c.createdAt).getTime() < 7 * 864e5 && <span className="chip h-5 bg-accent-subtle px-2 text-caption text-warning">{t('team.form.settings.new')}</span>}
            </p>
            <p className="truncate text-small text-muted">{c.url.includes('calendar-export.') ? t('team.form.settings.exportFeed') : c.url.includes('calendar.google.') ? t('team.form.settings.googleFeed') : t('team.form.settings.importFeed')}</p>
          </div>
          <PortalMenu
            groups={[
              {
                items: [
                  {
                    label: t('team.form.settings.copyUrl'),
                    onSelect: () => {
                      void navigator.clipboard?.writeText(c.url).catch(() => undefined)
                      toast(t('team.form.settings.copied'))
                    },
                  },
                  { label: t('team.form.settings.rename'), onSelect: () => setRenaming({ id: c.id, name: c.name }) },
                  {
                    label: t('team.common.remove'),
                    danger: true,
                    onSelect: async () => {
                      if (!(await confirm({ title: t('team.form.settings.removeTitle'), body: t('team.form.settings.removeBody'), confirmLabel: t('team.common.remove'), tone: 'danger' }))) return
                      await removeLinkedCalendar(member.id, c.id)
                      toast(t('team.form.settings.removed'))
                    },
                  },
                ],
              },
            ]}
            trigger={({ open, toggle }) => <ActionsPill open={open} toggle={toggle} label={t('team.common.actions')} />}
          />
        </li>
      ))}
      {renaming && (
        <Modal
          open
          onClose={() => setRenaming(null)}
          title={t('team.form.settings.renameTitle')}
          size="sm"
          footer={
            <>
              <Button onClick={() => setRenaming(null)}>{t('team.common.cancel')}</Button>
              <Button
                variant="primary"
                disabled={!renaming.name.trim()}
                onClick={async () => {
                  await renameLinkedCalendar(member.id, renaming.id, renaming.name.trim())
                  setRenaming(null)
                  toast(t('team.form.settings.renamed'))
                }}
              >
                {t('team.common.save')}
              </Button>
            </>
          }
        >
          <Field label={t('team.form.settings.calendarName')}>{(id) => <TextInput id={id} value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} />}</Field>
        </Modal>
      )}
    </ul>
  )
}

// ─── Pay ───────────────────────────────────────────────────────────────────

function TriSelect({ label, hint, value, onChange, lowercase }: { label: string; hint: string; value: TriState; onChange: (v: TriState) => void; lowercase?: boolean }) {
  const { t } = useTranslation()
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <Select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value as TriState)}
          options={[
            { value: 'default', label: lowercase ? t('team.form.wages.defaultLower') : t('team.form.wages.default') },
            { value: 'enabled', label: t('team.form.wages.enabled') },
            { value: 'disabled', label: t('team.form.wages.disabled') },
          ]}
        />
      )}
    </Field>
  )
}

export function WagesSection({ form, set }: SectionProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const ts = form.timesheetSettings
  const setTs = (key: keyof FormState['timesheetSettings'], v: TriState) => set('timesheetSettings', { ...ts, [key]: v })
  return (
    <>
      <SectionTitle title={t('team.form.nav.wagesAndTimesheets')} />
      <div className="card p-6">
        <Switch
          label={t('team.form.wages.enable')}
          hint={
            <>
              {t('team.form.wages.enableHint')} <LearnMore topic="wages" />
            </>
          }
          checked={form.wagesEnabled}
          onChange={(v) => set('wagesEnabled', v)}
        />
      </div>
      {form.wagesEnabled && (
        <>
          <div className="card mt-5 flex flex-col gap-5 p-6">
            <Field label={t('team.form.wages.compensation')}>
              {(id) => (
                <Select
                  id={id}
                  value={form.compensationType}
                  onChange={(e) => set('compensationType', e.target.value as FormState['compensationType'])}
                  options={[
                    { value: 'none', label: t('team.form.wages.none') },
                    { value: 'hourly', label: t('team.form.wages.hourly') },
                  ]}
                />
              )}
            </Field>
            {form.compensationType === 'hourly' && (
              <>
                <Field label={t('team.form.wages.rate')}>{(id) => <MoneyInput id={id} value={form.hourlyRate} placeholder="0.00" onChange={(v) => set('hourlyRate', v)} />}</Field>
                <div>
                  <h3 className="text-body-strong text-ink">{t('team.form.wages.overtimeTitle')}</h3>
                  <p className="mb-3 text-small text-muted">
                    {t('team.form.wages.overtimeBody')} <LearnMore topic="overtime" />
                  </p>
                  <Checkbox label={t('team.form.wages.overtime')} hint={t('team.form.wages.overtimeHint')} checked={form.overtime} onChange={(v) => set('overtime', v)} />
                </div>
              </>
            )}
          </div>
          <div className="card mt-5 flex flex-col gap-5 p-6">
            <div>
              <h3 className="font-display text-title-3 text-ink">{t('team.form.wages.tsTitle')}</h3>
              <p className="mt-1 text-body text-muted">
                {t('team.form.wages.tsBody')} <LearnMore topic="timesheets" />
              </p>
            </div>
            <p className="text-body-strong text-ink">{t('team.form.wages.proximity')}</p>
            <TriSelect label={t('team.form.wages.location')} hint={t('team.form.wages.locationHint')} value={ts.proximity} onChange={(v) => setTs('proximity', v)} />
            <p className="text-body-strong text-ink">{t('team.form.wages.automation')}</p>
            <TriSelect label={t('team.form.wages.autoIn')} hint={t('team.form.wages.autoInHint')} value={ts.autoClockIn} onChange={(v) => setTs('autoClockIn', v)} />
            <TriSelect label={t('team.form.wages.autoOut')} hint={t('team.form.wages.autoOutHint')} value={ts.autoClockOut} onChange={(v) => setTs('autoClockOut', v)} />
            <TriSelect label={t('team.form.wages.autoBreaks')} hint={t('team.form.wages.autoBreaksHint')} value={ts.autoBreaks} onChange={(v) => setTs('autoBreaks', v)} lowercase />
            <p className="text-small text-muted">
              {t('team.form.wages.footer')}{' '}
              <button type="button" className="font-semibold text-primary hover:underline" onClick={() => navigate('/setup/team/timesheets')}>
                {t('team.form.wages.here')}
              </button>
            </p>
          </div>
        </>
      )}
    </>
  )
}

export function CommissionsSection({ form, set }: SectionProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <>
      <SectionTitle title={t('team.form.nav.commissions')} />
      <div className="card grid gap-6 p-6 md:grid-cols-[1fr_200px]">
        <div>
          <span className="chip bg-accent-subtle text-warning">{t('team.common.includedInPlan')}</span>
          <h3 className="mt-3 font-display text-title-3 text-ink">{t('team.form.commissions.title')}</h3>
          <p className="mt-1 text-body text-muted">{t('team.form.commissions.body')}</p>
          <ul className="mt-4 flex list-disc flex-col gap-1.5 pl-5 text-body text-ink">
            <li>{t('team.form.commissions.b1')}</li>
            <li>{t('team.form.commissions.b2')}</li>
            <li>{t('team.form.commissions.b3')}</li>
          </ul>
          <div className="mt-5 flex gap-2">
            <Button variant="primary" onClick={() => navigate('/setup/team/commissions')}>
              {t('team.form.commissions.setup')}
            </Button>
            <LearnMoreButton topic="commissions" />
          </div>
        </div>
        <div className="hidden items-center justify-center rounded-lg bg-primary-subtle md:flex">
          <span className="font-display text-[44px] font-bold text-primary">%</span>
        </div>
      </div>
      <div className="card mt-5 flex flex-col gap-5 p-6">
        <Switch label={t('team.form.commissions.enable')} hint={t('team.form.commissions.enableHint')} checked={form.commissionEnabled} onChange={(v) => set('commissionEnabled', v)} />
        {form.commissionEnabled && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('team.form.commissions.serviceRate')}>
              {(id) => <TextInput id={id} type="number" min={0} max={100} step="0.5" suffix="%" value={form.serviceRate} onChange={(e) => set('serviceRate', e.target.value === '' ? '' : Math.min(100, Math.max(0, Number(e.target.value))))} />}
            </Field>
            <Field label={t('team.form.commissions.productRate')}>
              {(id) => <TextInput id={id} type="number" min={0} max={100} step="0.5" suffix="%" value={form.productRate} onChange={(e) => set('productRate', e.target.value === '' ? '' : Math.min(100, Math.max(0, Number(e.target.value))))} />}
            </Field>
          </div>
        )}
      </div>
    </>
  )
}

function LearnMoreButton({ topic }: { topic: string }) {
  const { t } = useTranslation()
  return (
    <span className="inline-flex h-10 items-center rounded-md border border-line-strong bg-surface px-4 text-body-strong">
      <LearnMore topic={topic}>{t('team.common.learnMore')}</LearnMore>
    </span>
  )
}

export function PayRunsSection({ form, set }: SectionProps) {
  const { t } = useTranslation()
  const [methodOpen, setMethodOpen] = useState(false)
  const prs = form.payRunSettings
  const setPrs = (patch: Partial<FormState['payRunSettings']>) => set('payRunSettings', { ...prs, ...patch })
  return (
    <>
      <SectionTitle title={t('team.form.nav.payruns')} />
      <div className="card p-6">
        <Switch
          label={t('team.form.payruns.enable')}
          hint={
            <>
              {t('team.form.payruns.enableHint')} <LearnMore topic="pay runs" />
            </>
          }
          checked={form.payRunsEnabled}
          onChange={(v) => set('payRunsEnabled', v)}
        />
      </div>
      {form.payRunsEnabled && (
        <>
          <div className="card mt-5 p-6">
            <h3 className="font-display text-title-3 text-ink">{t('team.form.payruns.methodTitle')}</h3>
            <p className="mt-1 text-body text-muted">
              {t('team.form.payruns.methodBody')} <LearnMore topic="pay run payment methods" />
            </p>
            <div className="mt-4 flex items-center justify-between rounded-lg border border-line p-4">
              <div>
                <p className="text-body-strong text-ink">{t('team.form.payruns.manual')}</p>
                <p className="text-small text-muted">{t('team.form.payruns.manualHint')}</p>
              </div>
              <Button variant="link" onClick={() => setMethodOpen(true)}>
                {t('team.common.change')}
              </Button>
            </div>
          </div>
          <div className="card mt-5 p-6">
            <h3 className="font-display text-title-3 text-ink">{t('team.form.payruns.calcTitle')}</h3>
            <p className="mb-4 mt-1 text-body text-muted">{t('team.form.payruns.calcBody')}</p>
            <Field hint={prs.calculation === 'automatic' ? t('team.form.payruns.autoHint') : t('team.form.payruns.manualEntryHint')}>
              {(id) => (
                <Select
                  id={id}
                  aria-label={t('team.form.payruns.calcTitle')}
                  value={prs.calculation}
                  onChange={(e) => setPrs({ calculation: e.target.value as 'automatic' | 'manual' })}
                  options={[
                    { value: 'automatic', label: t('team.form.payruns.automatic') },
                    { value: 'manual', label: t('team.form.payruns.manualEntry') },
                  ]}
                />
              )}
            </Field>
          </div>
          <div className="card mt-5 flex flex-col gap-4 p-6">
            <div>
              <h3 className="font-display text-title-3 text-ink">{t('team.form.payruns.deductTitle')}</h3>
              <p className="mt-1 text-body text-muted">
                {t('team.form.payruns.deductBody')} <LearnMore topic="pay run deductions" />
              </p>
            </div>
            <Checkbox label={t('team.form.payruns.deductProcessing')} hint={t('team.form.payruns.deductProcessingHint')} checked={prs.deductProcessingFees} onChange={(v) => setPrs({ deductProcessingFees: v })} />
            <Checkbox label={t('team.form.payruns.deductNewClient')} hint={t('team.form.payruns.deductNewClientHint')} checked={prs.deductNewClientFees} onChange={(v) => setPrs({ deductNewClientFees: v })} />
          </div>
          <div className="card mt-5 flex flex-col gap-4 p-6">
            <div>
              <h3 className="font-display text-title-3 text-ink">{t('team.form.payruns.cashTitle')}</h3>
              <p className="mt-1 text-body text-muted">{t('team.form.payruns.cashBody')}</p>
            </div>
            <Checkbox label={t('team.form.payruns.cashLabel')} hint={t('team.form.payruns.cashHint')} checked={prs.cashAdvances} onChange={(v) => setPrs({ cashAdvances: v })} />
          </div>
        </>
      )}
      <Modal
        open={methodOpen}
        onClose={() => setMethodOpen(false)}
        title={t('team.form.payruns.methodTitle')}
        footer={
          <>
            <Button onClick={() => setMethodOpen(false)}>{t('team.common.cancel')}</Button>
            <Button
              variant="primary"
              onClick={() => {
                setMethodOpen(false)
                toast(t('team.form.payruns.methodApplied'))
              }}
            >
              {t('team.common.apply')}
            </Button>
          </>
        }
      >
        <div className="pb-2">
          <RadioGroup variant="cards" value="manual" onChange={() => undefined} options={[{ value: 'manual', label: t('team.form.payruns.paidManually'), hint: t('team.form.payruns.manualHint') }]} />
        </div>
      </Modal>
    </>
  )
}

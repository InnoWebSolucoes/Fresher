import clsx from 'clsx'
import { Pencil, PlusCircle, UserRound, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import type { Client, ID } from '@/types'
import { useDb } from '@/store/db'
import { now } from '@/lib/time'
import { ApiError } from '@/api/client'
import { blankClient, createClient, deleteClient, updateClient } from '@/api/clients'
import { Button, confirm, EmptyState, Field, FullscreenFrame, LearnMore, Menu, SectionNav, Select, Skeleton, Switch, TextInput, toast, usePageLoading } from '@/components/ui'
import { resizeImage } from '../lib/avatars'
import { countryOptions, GENDERS, LANGUAGES, MONTHS, pronounOptions } from '../lib/constants'
import { clientName, joinPhone, splitPhone } from '../lib/helpers'
import { ClientAvatar, PhoneField } from '../components/common'
import { ClientSearchModal } from '../components/ClientSearchModal'
import { TagPicker } from '../components/TagPicker'
import { AddressModal, addressLines, addressName, type AddressDraft } from '../components/AddressModal'

type Section = 'profile' | 'addresses' | 'emergency_contacts' | 'settings'
const SECTIONS: Section[] = ['profile', 'addresses', 'emergency_contacts', 'settings']

interface ContactDraft {
  id: ID
  fullName: string
  relationship: string
  email: string
  code: string
  phone: string
}

interface Draft {
  firstName: string
  lastName: string
  email: string
  phoneCode: string
  phone: string
  month: string
  day: string
  year: string
  gender: string
  pronouns: string
  sourceId: string
  referredById: string
  language: string
  occupation: string
  country: string
  additionalEmail: string
  additionalCode: string
  additionalPhone: string
  tagIds: ID[]
  addresses: AddressDraft[]
  contacts: [ContactDraft, ContactDraft]
  notifications: Client['notifications']
  marketing: Client['marketing']
}

const emptyContact = (n: number): ContactDraft => ({ id: `ec_${n}_${Math.random().toString(36).slice(2, 7)}`, fullName: '', relationship: '', email: '', code: '+351', phone: '' })

function toDraft(c: Omit<Client, 'id' | 'createdAt'>): Draft {
  const phone = splitPhone(c.phone)
  const extra = splitPhone(c.additionalPhone)
  const [year = '', month = '', day = ''] = c.birthday ? c.birthday.split('-') : []
  const contact = (primary: boolean, n: number): ContactDraft => {
    const e = c.emergencyContacts.find((x) => x.primary === primary)
    if (!e) return emptyContact(n)
    const p = splitPhone(e.phone)
    return { id: e.id, fullName: e.fullName, relationship: e.relationship, email: e.email, code: p.code, phone: p.number }
  }
  return {
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phoneCode: phone.code,
    phone: phone.number,
    month: month ? String(Number(month)) : '',
    day: day ? String(Number(day)) : '',
    year,
    gender: c.gender ?? '',
    pronouns: c.pronouns ?? '',
    sourceId: c.sourceId,
    referredById: c.referredById ?? '',
    language: c.language ?? '',
    occupation: c.occupation ?? '',
    country: c.country ?? '',
    additionalEmail: c.additionalEmail ?? '',
    additionalCode: extra.code,
    additionalPhone: extra.number,
    tagIds: [...c.tagIds],
    addresses: c.addresses.map((a) => ({ ...a })),
    contacts: [contact(true, 1), contact(false, 2)],
    notifications: { ...c.notifications },
    marketing: { ...c.marketing },
  }
}

const contactFilled = (c: ContactDraft) => Boolean(c.fullName.trim() || c.relationship.trim() || c.email.trim() || c.phone.trim())

/** Add a new client / Edit client full-screen form (clients.md §2). */
export function ClientFormPage({ mode }: { mode: 'add' | 'edit' }) {
  const { id } = useParams()
  const clients = useDb((s) => s.clients)
  const loading = usePageLoading()
  const client = mode === 'edit' ? clients.find((c) => c.id === id && !c.deletedAt) : undefined
  const { t } = useTranslation()
  const navigate = useNavigate()
  if (loading) {
    return (
      <FullscreenFrame closeLabel={t('clients.common.close')} title={mode === 'add' ? t('clients.form.addTitle') : t('clients.form.editTitle')} onClose={() => navigate('/clients/list')}>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24 w-24 rounded-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-2/3" />
        </div>
      </FullscreenFrame>
    )
  }
  if (mode === 'edit' && !client) {
    return (
      <FullscreenFrame closeLabel={t('clients.common.close')} title={t('clients.form.editTitle')} onClose={() => navigate('/clients/list')}>
        <EmptyState icon={<UserRound size={26} aria-hidden />} title={t('clients.drawer.notFound')} body={t('clients.drawer.notFoundBody')} action={<Button onClick={() => navigate('/clients/list')}>{t('clients.form.backToList')}</Button>} />
      </FullscreenFrame>
    )
  }
  return <ClientForm key={client?.id ?? 'new'} client={client} />
}

function ClientForm({ client }: { client?: Client }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const sources = useDb((s) => s.clientSources)
  const clients = useDb((s) => s.clients)
  const savedPhoto = client?.photo
  const [draft, setDraft] = useState<Draft>(() => toDraft(client ?? blankClient()))
  const [photo, setPhoto] = useState<string | null | undefined>(undefined)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [referrerOpen, setReferrerOpen] = useState(false)
  const [addressModal, setAddressModal] = useState<{ open: boolean; value?: AddressDraft }>({ open: false })
  const fileInput = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLDivElement>(null)
  const section = (SECTIONS.includes(params.get('section') as Section) ? params.get('section') : 'profile') as Section
  const returnTo = params.get('return')
  const focus = params.get('focus')

  const setSection = (s: Section) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (s === 'profile') next.delete('section')
        else next.set('section', s)
        next.delete('focus')
        return next
      },
      { replace: true },
    )

  useEffect(() => {
    if (!focus) return
    const timer = setTimeout(() => formRef.current?.querySelector<HTMLElement>(`[data-field="${focus}"]`)?.focus(), 50)
    return () => clearTimeout(timer)
  }, [focus, section])

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    if (errors[key as string]) setErrors((e) => ({ ...e, [key as string]: '' }))
  }
  const setContact = (index: 0 | 1, patch: Partial<ContactDraft>) => {
    setDraft((d) => {
      const contacts = [...d.contacts] as Draft['contacts']
      contacts[index] = { ...contacts[index], ...patch }
      return { ...d, contacts }
    })
    if (errors[`contact${index}`]) setErrors((e) => ({ ...e, [`contact${index}`]: '' }))
  }

  const schema = useMemo(() => {
    const email = z.union([z.literal(''), z.string().trim().email(t('clients.form.errors.email'))])
    const phone = z.string().refine((v) => !v.trim() || v.replace(/\D/g, '').length >= 6, t('clients.form.errors.phone'))
    return z
      .object({
        firstName: z.string().trim().min(1, t('clients.form.errors.firstName')).max(100),
        lastName: z.string().max(100),
        email,
        additionalEmail: email,
        phone,
        additionalPhone: phone,
        occupation: z.string().max(255, t('clients.form.errors.occupation')),
        month: z.string(),
        day: z.string(),
        year: z.string(),
      })
      .superRefine((v, ctx) => {
        const parts = [v.month, v.day, v.year]
        if (parts.every((p) => !p.trim())) return
        const m = Number(v.month)
        const d = Number(v.day)
        const y = Number(v.year)
        const date = new Date(y, m - 1, d)
        const valid = m >= 1 && m <= 12 && d >= 1 && y >= 1900 && y <= now().getFullYear() && date.getMonth() === m - 1 && date.getDate() === d
        if (!valid) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['birthday'], message: t('clients.form.errors.birthday') })
      })
  }, [t])

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return toast(t('clients.form.photoError'), 'error')
    try {
      setPhoto(await resizeImage(file))
    } catch {
      toast(t('clients.form.photoError'), 'error')
    }
  }

  const save = async () => {
    const parsed = schema.safeParse(draft)
    const next: Record<string, string> = {}
    if (!parsed.success) for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message
    const missingPhone = ([0, 1] as const).find((i) => contactFilled(draft.contacts[i]) && !draft.contacts[i].phone.trim())
    if (missingPhone !== undefined) next[`contact${missingPhone}`] = t('clients.form.errors.contactPhone')
    setErrors(next)
    if (Object.keys(next).length) {
      if (missingPhone !== undefined && Object.keys(next).length === 1) {
        setSection('emergency_contacts')
        toast(t('clients.form.errors.contactPhone'), 'error')
      } else {
        setSection('profile')
        toast(t('clients.form.errors.fix'), 'error')
      }
      return
    }
    const birthday = draft.year && draft.month && draft.day ? `${draft.year}-${draft.month.padStart(2, '0')}-${draft.day.padStart(2, '0')}` : undefined
    const patch: Partial<Client> & { firstName: string } = {
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      email: draft.email.trim(),
      phone: joinPhone(draft.phoneCode, draft.phone),
      birthday,
      gender: (draft.gender || undefined) as Client['gender'],
      pronouns: draft.pronouns || undefined,
      sourceId: draft.sourceId,
      referredById: draft.referredById || undefined,
      language: draft.language || undefined,
      occupation: draft.occupation.trim() || undefined,
      country: draft.country || undefined,
      additionalEmail: draft.additionalEmail.trim() || undefined,
      additionalPhone: joinPhone(draft.additionalCode, draft.additionalPhone) || undefined,
      tagIds: draft.tagIds,
      addresses: draft.addresses,
      emergencyContacts: draft.contacts
        .map((c, i) => ({ id: c.id, fullName: c.fullName.trim(), relationship: c.relationship.trim(), email: c.email.trim(), phone: joinPhone(c.code, c.phone), primary: i === 0 }))
        .filter((c) => c.fullName || c.phone || c.email || c.relationship),
      notifications: draft.notifications,
      marketing: draft.marketing,
      ...(photo !== undefined ? { photo: photo ?? undefined } : {}),
    }
    setSaving(true)
    try {
      let saved: Client
      if (client) {
        await updateClient(client.id, patch)
        saved = client
      } else saved = await createClient(patch)
      toast(client ? t('clients.form.updated') : t('clients.form.created'))
      navigate(returnPath(returnTo, saved.id, Boolean(client)))
    } catch (e) {
      if (e instanceof ApiError && e.code === 'duplicate_email') {
        setErrors({ email: t('clients.form.errors.duplicateEmail') })
        setSection('profile')
        toast(t('clients.form.errors.duplicateEmail'), 'error')
      } else throw e
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!client) return
    const ok = await confirm({ title: t('clients.drawer.deleteTitle'), body: t('clients.drawer.deleteBody'), confirmLabel: t('clients.common.delete'), tone: 'danger' })
    if (!ok) return
    await deleteClient(client.id)
    toast(t('clients.drawer.deleteToast'))
    navigate('/clients/list')
  }

  const close = () => navigate(returnTo ?? (client ? `/clients/list?drawer=client&id=${client.id}` : '/clients/list'))
  const referrer = clients.find((c) => c.id === draft.referredById)
  const shownPhoto = photo === undefined ? savedPhoto : photo
  const sourceOptions = [...sources].filter((s) => s.active || s.id === draft.sourceId).sort((a, b) => a.order - b.order)

  return (
    <FullscreenFrame closeLabel={t('clients.common.close')}
      onClose={close}
      maxWidth="max-w-4xl"
      nav={
        <SectionNav<Section>
          value={section}
          onChange={setSection}
          groups={[
            {
              heading: t('clients.form.personal'),
              items: [
                { value: 'profile', label: t('clients.form.profile') },
                { value: 'addresses', label: t('clients.form.addresses'), count: draft.addresses.length || undefined },
                { value: 'emergency_contacts', label: t('clients.form.emergency') },
              ],
            },
            { items: [{ value: 'settings', label: t('clients.form.settings') }] },
          ]}
        />
      }
      actions={
        <>
          {client && (
            <Button className="text-danger" onClick={() => void remove()}>
              {t('clients.common.delete')}
            </Button>
          )}
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            {t('clients.common.save')}
          </Button>
        </>
      }
    >
      <div ref={formRef}>
        <h1 className="mb-8 font-display text-display text-ink">{client ? t('clients.form.editTitle') : t('clients.form.addTitle')}</h1>
        <div className="mb-6 md:hidden">
          <Select value={section} onChange={(e) => setSection(e.target.value as Section)} options={SECTIONS.map((s) => ({ value: s, label: t(`clients.form.sectionLabels.${s}`) }))} aria-label={t('clients.form.sectionPicker')} />
        </div>

        {section === 'profile' && (
          <div className="flex flex-col gap-10">
            <section>
              <h2 className="font-display text-title-2 text-ink">{t('clients.form.profile')}</h2>
              <p className="mt-1 text-body text-muted">{t('clients.form.profileSubtitle')}</p>
              <div className="mt-6 flex items-center gap-4">
                <button type="button" onClick={() => fileInput.current?.click()} className="relative rounded-full" aria-label={t('clients.form.uploadPhoto')}>
                  {shownPhoto ? (
                    <img src={shownPhoto} alt="" className="h-28 w-28 rounded-full object-cover" />
                  ) : client ? (
                    <ClientAvatar client={client} size={112} initials />
                  ) : (
                    <span className="flex h-28 w-28 items-center justify-center rounded-full bg-primary-subtle text-primary">
                      <UserRound size={48} aria-hidden />
                    </span>
                  )}
                  <span className="absolute bottom-1 right-1 flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-sm">
                    <Pencil size={14} aria-hidden />
                  </span>
                </button>
                {shownPhoto && (
                  <Button variant="link" onClick={() => setPhoto(null)}>
                    {t('clients.form.removePhoto')}
                  </Button>
                )}
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    void pickPhoto(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
              </div>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <Field label={t('clients.form.firstName')} error={errors.firstName}>
                  {(fid) => <TextInput id={fid} data-field="firstName" value={draft.firstName} onChange={(e) => set('firstName', e.target.value)} placeholder={t('clients.form.firstNamePlaceholder')} invalid={Boolean(errors.firstName)} autoFocus={!client && !focus} />}
                </Field>
                <Field label={t('clients.form.lastName')} error={errors.lastName}>
                  {(fid) => <TextInput id={fid} data-field="lastName" value={draft.lastName} onChange={(e) => set('lastName', e.target.value)} placeholder={t('clients.form.lastNamePlaceholder')} />}
                </Field>
                <Field label={t('clients.form.email')} error={errors.email}>
                  {(fid) => <TextInput id={fid} data-field="email" type="email" value={draft.email} onChange={(e) => set('email', e.target.value)} placeholder={t('clients.form.emailPlaceholder')} invalid={Boolean(errors.email)} />}
                </Field>
                <Field label={t('clients.form.phone')} error={errors.phone}>
                  {(fid) => (
                    <span data-field="phone-wrap">
                      <PhoneField id={fid} code={draft.phoneCode} number={draft.phone} onCode={(v) => set('phoneCode', v)} onNumber={(v) => set('phone', v)} invalid={Boolean(errors.phone)} />
                    </span>
                  )}
                </Field>
                <Field label={t('clients.form.birthday')} error={errors.birthday}>
                  {(fid) => (
                    <div className="grid grid-cols-3 gap-2">
                      <Select id={fid} data-field="birthday" value={draft.month} onChange={(e) => set('month', e.target.value)} placeholder={t('clients.form.month')} options={MONTHS.map((m, i) => ({ value: String(i + 1), label: t(`clients.months.${i}`, { defaultValue: m }) }))} aria-label={t('clients.form.month')} />
                      <TextInput inputMode="numeric" maxLength={2} value={draft.day} onChange={(e) => set('day', e.target.value.replace(/\D/g, ''))} placeholder={t('clients.form.day')} aria-label={t('clients.form.day')} invalid={Boolean(errors.birthday)} />
                      <TextInput inputMode="numeric" maxLength={4} value={draft.year} onChange={(e) => set('year', e.target.value.replace(/\D/g, ''))} placeholder={t('clients.form.year')} aria-label={t('clients.form.year')} invalid={Boolean(errors.birthday)} />
                    </div>
                  )}
                </Field>
                <div className="hidden sm:block" />
                <Field label={t('clients.form.gender')}>
                  {(fid) => <Select id={fid} data-field="gender" value={draft.gender} onChange={(e) => set('gender', e.target.value)} placeholder={t('clients.form.selectOption')} options={GENDERS.map((g) => ({ value: g, label: t(`clients.gender.${g}`) }))} />}
                </Field>
                <Field label={t('clients.form.pronouns')}>
                  {(fid) => <Select id={fid} data-field="pronouns" value={draft.pronouns} onChange={(e) => set('pronouns', e.target.value)} placeholder={t('clients.form.selectOption')} options={pronounOptions()} />}
                </Field>
              </div>
            </section>

            <hr className="border-line" />

            <section>
              <h2 className="font-display text-title-2 text-ink">{t('clients.form.additional')}</h2>
              <p className="mt-1 text-body text-muted">{t('clients.form.additionalSubtitle')}</p>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <Field
                  label={t('clients.form.source')}
                  hint={
                    <>
                      {t('clients.form.sourceHint')} <LearnMore topic={t('pages.settingsClientSources.title')}>{t('clients.common.learnMore')}</LearnMore>
                    </>
                  }
                >
                  {(fid) => <Select id={fid} data-field="source" value={draft.sourceId} onChange={(e) => set('sourceId', e.target.value)} options={sourceOptions.map((s) => ({ value: s.id, label: s.name }))} />}
                </Field>
                <Field
                  label={t('clients.form.referredBy')}
                  hint={
                    <>
                      {t('clients.form.referredHint')} <LearnMore topic={t('clients.form.referredBy')}>{t('clients.common.learnMore')}</LearnMore>
                    </>
                  }
                >
                  {() => (
                    <div className="flex h-11 items-center gap-3 rounded-sm border border-line-strong bg-surface px-3">
                      {referrer ? <ClientAvatar client={referrer} size={26} /> : <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-primary-subtle text-primary"><UserRound size={14} aria-hidden /></span>}
                      <span className={clsx('flex-1 truncate text-body', referrer ? 'text-ink' : 'text-subtle')}>{referrer ? clientName(referrer) : t('clients.form.selectClient')}</span>
                      {referrer ? (
                        <button type="button" aria-label={t('clients.form.removeReferrer')} onClick={() => set('referredById', '')} className="rounded-full p-1 text-muted hover:bg-sunken">
                          <X size={16} aria-hidden />
                        </button>
                      ) : (
                        <button type="button" data-field="referredBy" onClick={() => setReferrerOpen(true)} className="text-body-strong text-primary hover:underline">
                          {t('clients.common.add')}
                        </button>
                      )}
                    </div>
                  )}
                </Field>
                <Field
                  label={t('clients.form.language')}
                  hint={
                    <>
                      {t('clients.form.languageHint')} <LearnMore topic={t('clients.form.language')}>{t('clients.common.learnMore')}</LearnMore>
                    </>
                  }
                >
                  {(fid) => <Select id={fid} data-field="language" value={draft.language} onChange={(e) => set('language', e.target.value)} placeholder={t('clients.form.selectLanguage')} options={LANGUAGES} />}
                </Field>
                <Field label={t('clients.form.occupation')} counter={{ value: draft.occupation.length, max: 255 }} error={errors.occupation}>
                  {(fid) => <TextInput id={fid} data-field="occupation" maxLength={255} value={draft.occupation} onChange={(e) => set('occupation', e.target.value)} placeholder={t('clients.form.occupationPlaceholder')} />}
                </Field>
                <Field label={t('clients.form.country')}>
                  {(fid) => <Select id={fid} data-field="country" value={draft.country} onChange={(e) => set('country', e.target.value)} placeholder={t('clients.form.selectCountry')} options={countryOptions()} />}
                </Field>
                <div className="hidden sm:block" />
                <Field label={t('clients.form.additionalEmail')} error={errors.additionalEmail}>
                  {(fid) => <TextInput id={fid} data-field="additionalEmail" type="email" value={draft.additionalEmail} onChange={(e) => set('additionalEmail', e.target.value)} placeholder={t('clients.form.additionalEmailPlaceholder')} invalid={Boolean(errors.additionalEmail)} />}
                </Field>
                <Field label={t('clients.form.additionalPhone')} error={errors.additionalPhone}>
                  {(fid) => <PhoneField id={fid} code={draft.additionalCode} number={draft.additionalPhone} onCode={(v) => set('additionalCode', v)} onNumber={(v) => set('additionalPhone', v)} invalid={Boolean(errors.additionalPhone)} />}
                </Field>
                <Field
                  className="sm:col-span-2"
                  label={t('clients.form.tags')}
                  hint={
                    <>
                      {t('clients.form.tagsHint')}{' '}
                      <button type="button" className="font-semibold text-primary hover:underline" onClick={() => navigate('/setup/clients/client-tags')}>
                        {t('clients.tags.clientSettings')}
                      </button>
                      .
                    </>
                  }
                >
                  {(fid) => (
                    <span data-field="tags" tabIndex={-1} className="block outline-none">
                      <TagPicker id={fid} value={draft.tagIds} onChange={(ids) => set('tagIds', ids)} autoFocus={focus === 'tags'} />
                    </span>
                  )}
                </Field>
              </div>
            </section>
          </div>
        )}

        {section === 'addresses' && (
          <section>
            <h2 className="font-display text-title-2 text-ink">{t('clients.form.addresses')}</h2>
            <p className="mt-1 text-body text-muted">{t('clients.form.addressesSubtitle')}</p>
            <div className="mt-6 flex flex-col gap-3">
              {draft.addresses.map((a) => (
                <div key={a.id} className="flex items-start justify-between rounded-lg border border-line bg-sunken p-5">
                  <div>
                    <p className="text-body-strong text-ink">{addressName(a)}</p>
                    {addressLines(a).map((line) => (
                      <p key={line} className="text-body-lg text-ink">
                        {line}
                      </p>
                    ))}
                  </div>
                  <Menu
                    label={t('clients.form.addressOptions')}
                    width={180}
                    groups={[
                      {
                        items: [
                          { label: t('clients.common.edit'), onSelect: () => setAddressModal({ open: true, value: a }) },
                          { label: t('clients.common.delete'), danger: true, onSelect: () => set('addresses', draft.addresses.filter((x) => x.id !== a.id)) },
                        ],
                      },
                    ]}
                  />
                </div>
              ))}
              {draft.addresses.length === 0 && <p className="rounded-lg border border-dashed border-line-strong p-6 text-center text-body text-muted">{t('clients.form.noAddresses')}</p>}
            </div>
            <button type="button" data-field="address" onClick={() => setAddressModal({ open: true })} className="mt-5 inline-flex items-center gap-2 text-body-lg font-semibold text-primary hover:underline">
              {t('clients.form.addAddress')}
              <PlusCircle size={20} aria-hidden />
            </button>
          </section>
        )}

        {section === 'emergency_contacts' && (
          <section>
            <h2 className="font-display text-title-2 text-ink">{t('clients.form.emergency')}</h2>
            <p className="mt-1 text-body text-muted">{t('clients.form.emergencySubtitle')}</p>
            {([0, 1] as const).map((i) => {
              const c = draft.contacts[i]
              return (
                <div key={i} className={clsx('mt-6', i === 1 && 'border-t border-line pt-8')}>
                  <h3 className="font-display text-title-3 text-ink">{i === 0 ? t('clients.form.primaryContact') : t('clients.form.secondaryContact')}</h3>
                  <div className="mt-4 grid gap-5 sm:grid-cols-2">
                    <Field label={t('clients.form.fullName')}>{(fid) => <TextInput id={fid} data-field={`contact${i}`} value={c.fullName} onChange={(e) => setContact(i, { fullName: e.target.value })} placeholder={t('clients.form.fullNamePlaceholder')} />}</Field>
                    <Field label={t('clients.form.relationship')}>{(fid) => <TextInput id={fid} value={c.relationship} onChange={(e) => setContact(i, { relationship: e.target.value })} placeholder={t('clients.form.relationshipPlaceholder')} />}</Field>
                    <Field label={t('clients.form.email')}>{(fid) => <TextInput id={fid} type="email" value={c.email} onChange={(e) => setContact(i, { email: e.target.value })} placeholder={t('clients.form.emailPlaceholder')} />}</Field>
                    <Field label={t('clients.form.phone')} error={errors[`contact${i}`]}>
                      {(fid) => <PhoneField id={fid} code={c.code} number={c.phone} onCode={(v) => setContact(i, { code: v })} onNumber={(v) => setContact(i, { phone: v })} invalid={Boolean(errors[`contact${i}`])} />}
                    </Field>
                  </div>
                </div>
              )
            })}
          </section>
        )}

        {section === 'settings' && (
          <section className="flex flex-col gap-10">
            <div>
              <h2 className="font-display text-title-2 text-ink">{t('clients.form.notificationsTitle')}</h2>
              <p className="mt-1 text-body text-muted">{t('clients.form.notificationsSubtitle')}</p>
              <div className="mt-5 flex flex-col gap-5">
                {(['email', 'sms', 'whatsapp'] as const).map((k) => (
                  <Switch key={k} label={t(`clients.form.notify.${k}`)} checked={draft.notifications[k]} onChange={(v) => set('notifications', { ...draft.notifications, [k]: v })} />
                ))}
              </div>
            </div>
            <div>
              <h2 className="font-display text-title-2 text-ink">{t('clients.form.marketingTitle')}</h2>
              <p className="mt-1 text-body text-muted">{t('clients.form.marketingSubtitle')}</p>
              <div className="mt-5 flex flex-col gap-5">
                {(['email', 'sms', 'whatsapp'] as const).map((k) => (
                  <Switch key={k} label={t(`clients.form.marketing.${k}`)} checked={draft.marketing[k]} onChange={(v) => set('marketing', { ...draft.marketing, [k]: v })} />
                ))}
              </div>
            </div>
          </section>
        )}
      </div>

      <ClientSearchModal open={referrerOpen} onClose={() => setReferrerOpen(false)} exclude={client ? [client.id] : []} title={t('clients.form.referredBy')} onPick={(c) => set('referredById', c.id)} />
      <AddressModal
        open={addressModal.open}
        value={addressModal.value}
        onClose={() => setAddressModal({ open: false })}
        onSave={(a) => set('addresses', draft.addresses.some((x) => x.id === a.id) ? draft.addresses.map((x) => (x.id === a.id ? a : x)) : [...draft.addresses, a])}
      />
    </FullscreenFrame>
  )
}

/** Where to go after saving: `?return=` (with the new client filled in), else the list or the client drawer. */
function returnPath(returnTo: string | null, id: ID, edit: boolean): string {
  if (!returnTo) return edit ? `/clients/list?drawer=client&id=${id}` : '/clients/list'
  if (returnTo.includes('{id}') || returnTo.includes(':id')) return returnTo.replace('{id}', id).replace(':id', id)
  if (!edit && returnTo.includes('drawer=')) {
    const [path, query = ''] = returnTo.split('?')
    const q = new URLSearchParams(query)
    q.set('d_client', id)
    return `${path}?${q.toString()}`
  }
  return returnTo
}

import clsx from 'clsx'
import { Check } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { useDb } from '@/store/db'
import { Button, EmptyState, FullscreenFrame, Menu, MenuButton, Modal, PageSkeleton, SectionNav, confirm, toast, usePageLoading } from '@/components/ui'
import { ApiError } from '@/api/client'
import { archiveMember, bookableLimitReached, createMember, updateMember } from '@/api/team'
import { AddressesSection, CommissionsSection, ContactsSection, LocationsSection, PayRunsSection, ProfileSection, ServicesSection, SettingsSection, WagesSection } from './memberForm/sections'
import { SECTION_KEYS, initialState, toInput, type FormState, type SectionKey } from './memberForm/state'

/** Add / edit team member, full screen with left nav (team.md §2). */
export function MemberFormPage() {
  const { id } = useParams()
  const loading = usePageLoading()
  const exists = useDb((s) => (id ? s.teamMembers.some((m) => m.id === id) : true))
  const { t } = useTranslation()
  const navigate = useNavigate()
  if (loading) {
    return (
      <FullscreenFrame title={id ? t('team.form.editTitleShort') : t('team.form.addTitle')}>
        <PageSkeleton rows={8} />
      </FullscreenFrame>
    )
  }
  if (!exists) {
    return (
      <FullscreenFrame onClose={() => navigate('/team/team-members')}>
        <EmptyState title={t('team.errors.notFoundTitle')} body={t('team.errors.notFound')} action={<Button onClick={() => navigate('/team/team-members')}>{t('team.form.backToList')}</Button>} />
      </FullscreenFrame>
    )
  }
  return <MemberForm key={id ?? 'new'} id={id} />
}

function MemberForm({ id }: { id?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const mode = id ? 'edit' : 'add'
  const { member, services, locations, defaultRole } = useDb(
    useShallow((s) => ({ member: id ? s.teamMembers.find((m) => m.id === id) : undefined, services: s.services, locations: s.locations, defaultRole: s.settings.defaultRole })),
  )
  const allServiceIds = useMemo(() => services.filter((s) => !s.archived).map((s) => s.id), [services])
  const [form, setForm] = useState<FormState>(() => initialState(member, { allServiceIds, firstLocationId: locations[0]?.id ?? '', defaultRole }))
  const initial = useRef(JSON.stringify(form))
  const dirty = JSON.stringify(form) !== initial.current
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [saving, setSaving] = useState(false)
  const [added, setAdded] = useState(false)
  const [planBlocked, setPlanBlocked] = useState(false)
  const roleRef = useRef<HTMLButtonElement>(null)

  const sectionParam = params.get('section') as SectionKey | null
  const section: SectionKey = sectionParam && SECTION_KEYS.includes(sectionParam) && !(sectionParam === 'payruns' && mode === 'add') ? sectionParam : 'profile'
  const go = (key: SectionKey) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('section', key)
      next.delete('focus')
      return next
    })

  // Grant access → ?section=settings&focus=role focuses the role select.
  const focus = params.get('focus')
  useEffect(() => {
    if (focus === 'role' && section === 'settings') {
      const timer = setTimeout(() => roleRef.current?.focus(), 50)
      return () => clearTimeout(timer)
    }
  }, [focus, section])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    if (errors[key as string]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const validate = (): Record<string, string | undefined> => {
    const e: Record<string, string | undefined> = {}
    if (!form.firstName.trim()) e.firstName = t('team.form.errors.firstName')
    if (mode === 'add' && !form.email.trim()) e.email = t('team.form.errors.email')
    else if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = t('team.form.errors.emailInvalid')
    const day = Number(form.birthDay)
    if ((form.birthDay && (day < 1 || day > 31)) || (form.birthDay && !form.birthMonth) || (form.birthYear && (Number(form.birthYear) < 1900 || form.birthYear.length !== 4))) e.birthday = t('team.form.errors.birthday')
    if (form.endDate && form.endDate < form.startDate) e.endDate = t('team.form.errors.endDate')
    if (form.bookable && form.locationIds.length === 0) e.locationIds = t('team.form.errors.locations')
    return e
  }

  const returnTo = params.get('returnTo')
  const leave = () => navigate(returnTo ?? '/team/team-members')
  const close = async () => {
    if (dirty && !(await confirm({ title: t('team.form.discardTitle'), body: t('team.form.discardBody'), confirmLabel: t('team.form.discard'), cancelLabel: t('team.common.goBack'), tone: 'danger' }))) return
    leave()
  }

  const save = async () => {
    const e = validate()
    setErrors(e)
    if (Object.values(e).some(Boolean)) {
      const first = e.firstName || e.email || e.birthday || e.endDate ? 'profile' : e.locationIds ? 'locations' : section
      go(first)
      toast(t('team.form.errors.fix'), 'error')
      return
    }
    if (bookableLimitReached(id ?? null, form.bookable)) {
      setPlanBlocked(true)
      return
    }
    setSaving(true)
    try {
      const input = toInput(form, allServiceIds)
      if (mode === 'add') {
        const { invited } = await createMember(input)
        if (invited) toast(t('team.toasts.inviteSent'))
        initial.current = JSON.stringify(form)
        setAdded(true)
        setTimeout(() => navigate('/team/team-members'), 1600)
      } else {
        const { invited } = await updateMember(id!, input)
        initial.current = JSON.stringify(form)
        toast(t('team.toasts.updated'))
        if (invited) toast(t('team.toasts.inviteSent'))
        leave()
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'plan_limit') setPlanBlocked(true)
      else if (err instanceof ApiError && err.code === 'email_taken') {
        setErrors({ email: t(err.message) })
        go('profile')
      } else toast(err instanceof ApiError ? t(err.message) : String(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  const archive = async () => {
    if (!member) return
    if (!(await confirm({ title: t('team.archive.title'), body: t('team.archive.body'), confirmLabel: t('team.common.confirm'), cancelLabel: t('team.common.goBack'), tone: 'primary' }))) return
    await archiveMember(member.id)
    toast(t('team.toasts.archived'))
    navigate('/team/team-members')
  }

  if (added) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 bg-surface" role="status" aria-live="polite">
        <span className="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent shadow-lg">
          <Check size={56} className="text-white" strokeWidth={3} aria-hidden />
        </span>
        <h1 className="font-display text-title-1 text-ink">{t('team.toasts.added')}</h1>
      </div>
    )
  }

  const serviceCount = form.serviceIds.filter((sid) => allServiceIds.includes(sid)).length
  const navGroups: { heading: string; items: { value: SectionKey; label: string; count?: number }[] }[] = [
    { heading: t('team.form.nav.personal'), items: [{ value: 'profile', label: t('team.form.nav.profile') }, { value: 'addresses', label: t('team.form.nav.addresses') }, { value: 'emergencyContacts', label: t('team.form.nav.emergencyContacts') }] },
    {
      heading: t('team.form.nav.workspace'),
      items: [
        { value: 'services', label: t('team.form.nav.services'), count: serviceCount },
        { value: 'locations', label: t('team.form.nav.locations'), count: form.locationIds.length },
        { value: 'settings', label: t('team.form.nav.settings') },
      ],
    },
    {
      heading: t('team.form.nav.pay'),
      items: [
        { value: 'wagesAndTimesheets', label: t('team.form.nav.wagesAndTimesheets') },
        { value: 'commissions', label: t('team.form.nav.commissions') },
        ...(mode === 'edit' ? [{ value: 'payruns' as const, label: t('team.form.nav.payruns') }] : []),
      ],
    },
  ]
  const nav = <SectionNav<SectionKey> value={section} onChange={go} groups={navGroups} />
  const title = mode === 'add' ? t('team.form.addTitle') : t('team.form.editTitle', { name: member?.firstName ?? '' })

  return (
    <FullscreenFrame
      title={title}
      onClose={close}
      nav={nav}
      actions={
        mode === 'add' ? (
          <Button variant="primary" loading={saving} onClick={save}>
            {t('team.common.add')}
          </Button>
        ) : (
          <>
            {member?.role !== 'owner' && (
              <Menu
                align="right"
                groups={[{ items: [{ label: t('team.actions.archive'), danger: true, onSelect: () => void archive() }] }]}
                trigger={({ open, toggle }) => (
                  <MenuButton open={open} toggle={toggle}>
                    {t('team.common.options')}
                  </MenuButton>
                )}
              />
            )}
            <Button variant="primary" loading={saving} onClick={save}>
              {t('team.common.save')}
            </Button>
          </>
        )
      }
    >
      {/* Phones: the section list becomes a sideways-scrolling row of chips. */}
      <PhoneSectionTabs groups={navGroups} value={section} onChange={go} />
      <div className="mt-6 md:mt-0">
        {section === 'profile' && <ProfileSection form={form} set={set} mode={mode} errors={errors} />}
        {section === 'addresses' && <AddressesSection form={form} set={set} />}
        {section === 'emergencyContacts' && <ContactsSection form={form} set={set} />}
        {section === 'services' && <ServicesSection form={form} set={set} />}
        {section === 'locations' && <LocationsSection form={form} set={set} error={errors.locationIds} />}
        {section === 'settings' && <SettingsSection form={form} set={set} member={member} roleRef={roleRef} />}
        {section === 'wagesAndTimesheets' && <WagesSection form={form} set={set} />}
        {section === 'commissions' && <CommissionsSection form={form} set={set} />}
        {section === 'payruns' && <PayRunsSection form={form} set={set} />}
      </div>
      <Modal
        open={planBlocked}
        onClose={() => setPlanBlocked(false)}
        title={t('team.billing.title')}
        footer={
          <>
            <Button onClick={() => setPlanBlocked(false)}>{t('team.common.cancel')}</Button>
            <Button variant="primary" onClick={() => navigate('/setup/billing/change-plan?reason=bookable')}>
              {t('team.billing.changePlan')}
            </Button>
          </>
        }
      >
        <p className="pb-2 text-body text-muted">{t('team.billing.body')}</p>
        <p className="pb-2 text-body text-muted">{t('team.billing.hint')}</p>
      </Modal>
    </FullscreenFrame>
  )
}

/** Phone-only row of section chips replacing the left section nav (hidden from md up). */
function PhoneSectionTabs({ groups, value, onChange }: { groups: { items: { value: SectionKey; label: string; count?: number }[] }[]; value: SectionKey; onChange: (v: SectionKey) => void }) {
  const active = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    active.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [value])
  return (
    <nav className="-mx-4 scroll-px-4 overflow-x-auto px-4 [scrollbar-width:none] md:hidden">
      <div className="flex w-max gap-2 pb-1">
        {groups
          .flatMap((g) => g.items)
          .map((item) => (
            <button
              key={item.value}
              ref={item.value === value ? active : undefined}
              type="button"
              onClick={() => onChange(item.value)}
              aria-current={item.value === value ? 'true' : undefined}
              className={clsx('inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-body-strong', item.value === value ? 'border-primary bg-primary text-on-primary' : 'border-line-strong bg-surface text-ink')}
            >
              {item.label}
              {item.count !== undefined && <span className={clsx('chip h-5 px-1.5 text-caption', item.value === value ? 'bg-on-primary/20 text-on-primary' : 'bg-sunken text-muted')}>{item.count}</span>}
            </button>
          ))}
      </div>
    </nav>
  )
}

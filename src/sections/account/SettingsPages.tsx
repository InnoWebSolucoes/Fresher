import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { Apple, ChevronRight, Info, KeyRound, LogOut, Monitor, Moon, Palette, ShieldCheck, Smartphone, Sun, UserRound } from 'lucide-react'
import { Button, Chip, Field, LearnMore, Modal, PageHeader, PageSkeleton, Switch, TextInput, confirm, toast, usePageLoading } from '@/components/ui'
import { useCurrentUser } from '@/store/session'
import { useUiStore, type ThemePreference } from '@/store/ui'
import { changePassword } from '@/api/auth'
import { createRequest, defaultSessions, sendPhoneVerification, setProfileHidden, setSocialLogin, signOutAllDevices, signOutSession, updatePersonalInfo, usePanels, verifyPhone } from '@/api/panels'
import { fmtDate } from '@/lib/format'
import type { User } from '@/types'
import { errorText, PendingRequestNote, SettingsCard, useOnlineProfile, usePendingRequest } from './shared'

// ─── Personal settings hub ────────────────────────────────────────────────

export function PersonalSettingsPage() {
  const { t } = useTranslation()
  const loading = usePageLoading()
  if (loading) return <PageSkeleton rows={3} />
  const cards: { to: string; key: 'info' | 'security' | 'appearance'; icon: ReactNode }[] = [
    { to: '/user-account/personal-settings/personal-info', key: 'info', icon: <UserRound size={22} aria-hidden /> },
    { to: '/user-account/personal-settings/login-security', key: 'security', icon: <ShieldCheck size={22} aria-hidden /> },
    { to: '/user-account/personal-settings/appearance', key: 'appearance', icon: <Palette size={22} aria-hidden /> },
  ]
  return (
    <div className="mx-auto max-w-[1120px]">
      <PageHeader
        title={t('account.personal.title')}
        subtitle={
          <>
            {t('account.personal.subtitle')} <LearnMore topic="personal settings">{t('account.common.learnMore')}</LearnMore>
          </>
        }
      />
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.key} to={c.to} className="card group flex flex-col gap-4 p-6 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-subtle text-primary">{c.icon}</span>
            <span>
              <span className="flex items-center justify-between font-display text-title-3 text-ink">
                {t(`account.personal.${c.key}.title`)}
                <ChevronRight size={18} className="text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
              <span className="mt-1 block text-body text-muted">{t(`account.personal.${c.key}.body`)}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

function SubPageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const { t } = useTranslation()
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-2 text-body">
        <Link to="/user-account/personal-settings" className="text-muted hover:text-ink hover:underline">
          {t('pages.personalSettings.title')}
        </Link>
        <span className="text-subtle" aria-hidden>
          •
        </span>
        <span className="text-ink">{title}</span>
      </nav>
      <PageHeader title={title} subtitle={subtitle} />
    </>
  )
}

// ─── Personal info ────────────────────────────────────────────────────────

const maskPhone = (phone?: string) => {
  if (!phone) return ''
  const digits = phone.replace(/\s/g, '')
  const prefix = digits.startsWith('+') ? digits.slice(0, 4) : ''
  return `${prefix} ${'*'.repeat(Math.max(0, digits.length - prefix.length - 3))}${digits.slice(-3)}`.trim()
}
const maskEmail = (email: string) => {
  const [name, domain] = email.split('@')
  if (!domain) return email
  return `${name[0]}${'*'.repeat(Math.max(1, name.length - 2))}${name.length > 1 ? name[name.length - 1] : ''}@${domain}`
}

export function PersonalInfoPage() {
  const { t } = useTranslation()
  const loading = usePageLoading()
  const user = useCurrentUser()
  const profile = useOnlineProfile(user?.id)
  const verified = usePanels((s) => (user ? s.verifiedPhones[user.id] : undefined))
  const [editOpen, setEditOpen] = useState(false)
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [hiding, setHiding] = useState(false)
  if (loading || !user) return <PageSkeleton rows={3} />

  const phoneVerified = !!user.phone && verified === user.phone
  const toggleHidden = async (hidden: boolean) => {
    setHiding(true)
    try {
      await setProfileHidden(user.id, hidden)
      toast(hidden ? t('account.info.hiddenToast') : t('account.info.shownToast'))
    } finally {
      setHiding(false)
    }
  }

  return (
    <div className="mx-auto max-w-[880px]">
      <SubPageHeader title={t('account.info.title')} subtitle={t('account.info.subtitle')} />
      <div className="flex flex-col gap-6">
        <SettingsCard title={t('account.info.contact')} action={<Button onClick={() => setEditOpen(true)}>{t('account.common.edit')}</Button>}>
          <dl className="flex flex-col divide-y divide-line">
            <div className="py-3 first:pt-0">
              <dt className="text-small text-muted">{t('account.info.legalName')}</dt>
              <dd className="mt-0.5 text-body text-ink">
                {user.firstName} {user.lastName}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <div>
                <dt className="text-small text-muted">{t('account.info.mobile')}</dt>
                <dd className="mt-0.5 flex items-center gap-2 text-body text-ink">
                  {user.phone ? maskPhone(user.phone) : <span className="text-muted">{t('account.info.notSet')}</span>}
                  {user.phone && <Chip tone={phoneVerified ? 'success' : 'warning'}>{phoneVerified ? t('account.info.verified') : t('account.info.notVerified')}</Chip>}
                </dd>
              </div>
              {user.phone && !phoneVerified && (
                <Button size="sm" onClick={() => setVerifyOpen(true)}>
                  {t('account.info.verify')}
                </Button>
              )}
            </div>
            <div className="py-3 last:pb-0">
              <dt className="text-small text-muted">{t('account.info.email')}</dt>
              <dd className="mt-0.5 text-body text-ink">{maskEmail(user.email)}</dd>
            </div>
          </dl>
        </SettingsCard>

        <SettingsCard title={t('account.info.visibility')}>
          <Switch checked={profile.hidden} disabled={hiding} onChange={toggleHidden} label={t('account.info.hideProfile')} hint={t('account.info.visibilityBody')} />
        </SettingsCard>

        <div className="flex gap-3 rounded-lg bg-info-subtle p-4">
          <Info size={20} className="mt-0.5 shrink-0 text-info" aria-hidden />
          <div>
            <p className="text-body-strong text-ink">{t('account.info.whichTitle')}</p>
            <p className="mt-0.5 text-body text-muted">{t('account.info.whichBody')}</p>
          </div>
        </div>
      </div>

      {editOpen && <EditInfoModal user={user} onClose={() => setEditOpen(false)} />}
      {verifyOpen && <VerifyPhoneModal user={user} onClose={() => setVerifyOpen(false)} />}
    </div>
  )
}

function EditInfoModal({ user, onClose }: { user: User; onClose: () => void }) {
  const { t } = useTranslation()
  const [form, setForm] = useState({ firstName: user.firstName, lastName: user.lastName, phone: user.phone ?? '', email: user.email })
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({})
  const [saving, setSaving] = useState(false)
  const field = (key: keyof typeof form) => ({
    value: form[key],
    invalid: !!errors[key],
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      setForm((f) => ({ ...f, [key]: e.target.value }))
      setErrors((er) => ({ ...er, [key]: undefined }))
    },
  })

  const save = async () => {
    const next: typeof errors = {}
    if (!form.firstName.trim()) next.firstName = t('account.info.required')
    if (!form.lastName.trim()) next.lastName = t('account.info.required')
    if (!form.email.trim()) next.email = t('account.info.required')
    setErrors(next)
    if (Object.keys(next).length) return
    setSaving(true)
    try {
      await updatePersonalInfo(user.id, form)
      toast(t('account.info.saved'))
      onClose()
    } catch (e) {
      setErrors({ email: errorText(e) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('account.info.modalTitle')}
      footer={
        <>
          <Button onClick={onClose}>{t('account.common.cancel')}</Button>
          <Button variant="primary" loading={saving} onClick={save}>
            {t('account.common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('account.info.firstName')} error={errors.firstName}>
          {(id) => <TextInput id={id} autoComplete="given-name" {...field('firstName')} />}
        </Field>
        <Field label={t('account.info.lastName')} error={errors.lastName}>
          {(id) => <TextInput id={id} autoComplete="family-name" {...field('lastName')} />}
        </Field>
        <Field className="sm:col-span-2" label={t('account.info.mobile')} error={errors.phone}>
          {(id) => <TextInput id={id} type="tel" autoComplete="tel" placeholder="+351" {...field('phone')} />}
        </Field>
        <Field className="sm:col-span-2" label={t('account.info.email')} hint={t('account.info.emailHint')} error={errors.email}>
          {(id) => <TextInput id={id} type="email" autoComplete="email" {...field('email')} />}
        </Field>
      </div>
    </Modal>
  )
}

function VerifyPhoneModal({ user, onClose }: { user: User; onClose: () => void }) {
  const { t } = useTranslation()
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const send = async () => {
    setBusy(true)
    setError('')
    try {
      await sendPhoneVerification(user.id)
      setSent(true)
      toast(t('account.info.codeSent'))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const verify = async () => {
    setBusy(true)
    setError('')
    try {
      await verifyPhone(user.id, code)
      toast(t('account.info.verifiedToast'))
      onClose()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('account.info.verifyTitle')}
      subtitle={t('account.info.verifyBody', { phone: user.phone })}
      footer={
        sent ? (
          <>
            <Button variant="ghost" disabled={busy} onClick={send}>
              {t('account.info.resend')}
            </Button>
            <Button variant="primary" loading={busy} disabled={code.trim().length !== 6} onClick={verify}>
              {t('account.info.verifyAction')}
            </Button>
          </>
        ) : (
          <Button variant="primary" icon={<Smartphone size={16} />} loading={busy} onClick={send}>
            {t('account.info.sendCode')}
          </Button>
        )
      }
    >
      {sent ? (
        <Field label={t('account.info.code')} error={error}>
          {(id) => <TextInput id={id} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} invalid={!!error} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />}
        </Field>
      ) : (
        error && <p className="text-small text-danger">{error}</p>
      )}
    </Modal>
  )
}

// ─── Login & security ─────────────────────────────────────────────────────

export function LoginSecurityPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loading = usePageLoading()
  const user = useCurrentUser()
  const storedSessions = usePanels((s) => (user ? s.sessions[user.id] : undefined))
  const storedLogins = usePanels((s) => (user ? s.logins[user.id] : undefined))
  const sessions = useMemo(() => storedSessions ?? defaultSessions(), [storedSessions])
  const logins = storedLogins ?? { google: true, apple: false }
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const deletion = usePendingRequest(user?.id, 'delete_account')
  const [busyProvider, setBusyProvider] = useState<'google' | 'apple' | null>(null)
  const [busySession, setBusySession] = useState<string | null>(null)
  if (loading || !user) return <PageSkeleton rows={5} />

  const toggleProvider = async (provider: 'google' | 'apple') => {
    const name = t(`account.security.${provider}`)
    const connected = logins[provider]
    if (connected) {
      const ok = await confirm({ title: t('account.security.disconnectTitle', { provider: name }), body: t('account.security.disconnectBody', { provider: name }), confirmLabel: t('account.security.disconnect'), tone: 'danger' })
      if (!ok) return
    }
    setBusyProvider(provider)
    try {
      await setSocialLogin(user.id, provider, !connected)
      toast(connected ? t('account.security.disconnectedToast', { provider: name }) : t('account.security.connectedToast', { provider: name }))
    } finally {
      setBusyProvider(null)
    }
  }

  const signOut = async (id: string, device: string) => {
    const ok = await confirm({ title: t('account.security.signOutTitle'), body: t('account.security.signOutBody', { device }), confirmLabel: t('account.security.signOut'), tone: 'danger' })
    if (!ok) return
    setBusySession(id)
    try {
      await signOutSession(user.id, id)
      toast(t('account.security.signedOut'))
    } finally {
      setBusySession(null)
    }
  }

  const requestDeletion = async () => {
    const ok = await confirm({ title: t('account.security.deleteConfirmTitle'), body: t('account.security.deleteConfirmBody', { email: user.email }), confirmLabel: t('account.security.deleteAction'), tone: 'danger' })
    if (!ok) return
    setDeleting(true)
    try {
      await createRequest(user.id, 'delete_account')
      toast(t('account.requests.emailed', { email: user.email }))
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setDeleting(false)
    }
  }

  const signOutAll = async () => {
    const ok = await confirm({ title: t('account.security.signOutAllTitle'), body: t('account.security.signOutAllBody'), confirmLabel: t('account.security.signOutAll'), tone: 'danger' })
    if (!ok) return
    setBusySession('all')
    await signOutAllDevices(user.id)
    navigate('/login', { replace: true })
  }

  const providerRow = (provider: 'google' | 'apple') => (
    <div className="flex items-center justify-between gap-4 py-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sunken font-display text-body-strong text-ink" aria-hidden>
          {provider === 'google' ? 'G' : <Apple size={18} />}
        </span>
        <div>
          <p className="text-body-strong text-ink">{t(`account.security.${provider}`)}</p>
          <p className={clsx('text-small', logins[provider] ? 'text-success' : 'text-muted')}>{logins[provider] ? t('account.security.connected') : t('account.security.notConnected')}</p>
        </div>
      </div>
      <Button size="sm" loading={busyProvider === provider} onClick={() => toggleProvider(provider)}>
        {logins[provider] ? t('account.security.disconnect') : t('account.security.connect')}
      </Button>
    </div>
  )

  return (
    <div className="mx-auto max-w-[880px]">
      <SubPageHeader title={t('account.security.title')} subtitle={t('account.security.subtitle')} />
      <div className="flex flex-col gap-6">
        <SettingsCard title={t('account.security.loginDetails')} body={t('account.security.loginDetailsBody')}>
          <div className="flex flex-col divide-y divide-line">
            <div className="flex items-center justify-between gap-4 pb-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sunken text-ink">
                  <KeyRound size={18} aria-hidden />
                </span>
                <div>
                  <p className="text-body-strong text-ink">{t('account.security.password')}</p>
                  <p className="text-small text-muted">{t('account.security.passwordBody')}</p>
                </div>
              </div>
              <Button size="sm" onClick={() => setPasswordOpen(true)}>
                {t('account.security.changePassword')}
              </Button>
            </div>
            {providerRow('google')}
            {providerRow('apple')}
          </div>
        </SettingsCard>

        <SettingsCard title={t('account.security.trusted')} body={t('account.security.trustedBody')}>
          <p className="rounded-md bg-sunken p-4 text-body text-muted">{t('account.security.trustedEmpty')}</p>
        </SettingsCard>

        <SettingsCard title={t('account.security.sessions')} body={t('account.security.sessionsBody')}>
          <ul className="flex flex-col divide-y divide-line">
            {sessions.map((s) => {
              const device = s.device || t('account.security.unknownDevice')
              return (
                <li key={s.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sunken text-ink">{/iOS|Android/.test(device) ? <Smartphone size={18} aria-hidden /> : <Monitor size={18} aria-hidden />}</span>
                    <div>
                      <p className="text-body-strong text-ink">
                        {device} {s.current && <span className="font-normal text-muted">{t('account.security.thisDevice')}</span>}
                      </p>
                      <p className="text-small text-muted">{t('account.security.signedIn', { date: fmtDate(s.signedInAt) })}</p>
                    </div>
                  </div>
                  {!s.current && (
                    <Button size="sm" loading={busySession === s.id} onClick={() => signOut(s.id, device)}>
                      {t('account.security.signOut')}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
          <Button className="mt-4" icon={<LogOut size={16} />} loading={busySession === 'all'} onClick={signOutAll}>
            {t('account.security.signOutAll')}
          </Button>
        </SettingsCard>

        <SettingsCard title={t('account.security.deleteTitle')} body={t('account.security.deleteBody')}>
          {deletion ? (
            <PendingRequestNote request={deletion} text={t('account.security.deletePending', { email: user.email })} />
          ) : (
            <Button variant="danger" loading={deleting} onClick={requestDeletion}>
              {t('account.security.deleteAction')}
            </Button>
          )}
        </SettingsCard>
      </div>

      {passwordOpen && <PasswordModal user={user} onClose={() => setPasswordOpen(false)} />}
    </div>
  )
}

function PasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const { t } = useTranslation()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [errors, setErrors] = useState<{ current?: string; next?: string; again?: string }>({})
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const e: typeof errors = {}
    if (!current) e.current = t('account.info.required')
    if (next.length < 8) e.next = t('account.security.minLength')
    else if (next === current) e.next = t('account.security.sameAsCurrent')
    if (again !== next) e.again = t('account.security.mismatch')
    setErrors(e)
    if (Object.keys(e).length) return
    setSaving(true)
    try {
      await changePassword(user.id, current, next)
      toast(t('account.security.passwordSaved'))
      onClose()
    } catch (err) {
      setErrors({ current: errorText(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('account.security.changePassword')}
      footer={
        <>
          <Button onClick={onClose}>{t('account.common.cancel')}</Button>
          <Button variant="primary" loading={saving} onClick={save}>
            {t('account.common.save')}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Field label={t('account.security.current')} error={errors.current}>
          {(id) => <TextInput id={id} type="password" autoComplete="current-password" value={current} invalid={!!errors.current} onChange={(e) => setCurrent(e.target.value)} />}
        </Field>
        <Field label={t('account.security.new')} error={errors.next} hint={t('account.security.minLength')}>
          {(id) => <TextInput id={id} type="password" autoComplete="new-password" value={next} invalid={!!errors.next} onChange={(e) => setNext(e.target.value)} />}
        </Field>
        <Field label={t('account.security.confirm')} error={errors.again}>
          {(id) => <TextInput id={id} type="password" autoComplete="new-password" value={again} invalid={!!errors.again} onChange={(e) => setAgain(e.target.value)} />}
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  )
}

// ─── Appearance ───────────────────────────────────────────────────────────

function ThemeArt({ mode }: { mode: 'light' | 'dark' }) {
  const dark = mode === 'dark'
  return (
    <div className={clsx('flex h-full w-full gap-1.5 p-2', dark ? 'bg-[#1d2322]' : 'bg-[#f4f6f5]')}>
      <div className={clsx('w-1/4 rounded-sm', dark ? 'bg-[#2c3433]' : 'bg-white')} />
      <div className="flex flex-1 flex-col gap-1.5">
        <div className={clsx('h-3 w-2/3 rounded-sm', dark ? 'bg-[#3a4443]' : 'bg-[#dfe5e3]')} />
        <div className={clsx('flex-1 rounded-sm', dark ? 'bg-[#2c3433]' : 'bg-white')} />
      </div>
    </div>
  )
}

export function AppearancePage() {
  const { t } = useTranslation()
  const loading = usePageLoading()
  const theme = useUiStore((s) => s.theme)
  if (loading) return <PageSkeleton rows={2} />

  const choose = (value: ThemePreference) => {
    if (value === theme) return
    useUiStore.getState().setTheme(value)
    toast(t('account.appearance.saved'))
  }

  const options: { value: ThemePreference; icon: ReactNode; art: ReactNode; hint?: string }[] = [
    { value: 'light', icon: <Sun size={16} aria-hidden />, art: <ThemeArt mode="light" /> },
    { value: 'dark', icon: <Moon size={16} aria-hidden />, art: <ThemeArt mode="dark" /> },
    {
      value: 'system',
      icon: <Monitor size={16} aria-hidden />,
      hint: t('account.appearance.systemHint'),
      art: (
        <div className="relative h-full w-full">
          <div className="absolute inset-0" style={{ clipPath: 'polygon(0 0, 100% 0, 0 100%)' }}>
            <ThemeArt mode="light" />
          </div>
          <div className="absolute inset-0" style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}>
            <ThemeArt mode="dark" />
          </div>
        </div>
      ),
    },
  ]

  return (
    <div className="mx-auto max-w-[880px]">
      <SubPageHeader title={t('account.appearance.title')} subtitle={t('account.appearance.subtitle')} />
      <SettingsCard title={t('account.appearance.theme')} body={t('account.appearance.themeBody')}>
        <div role="radiogroup" aria-label={t('account.appearance.theme')} className="grid gap-4 sm:grid-cols-3">
          {options.map((o) => {
            const selected = theme === o.value
            return (
              <label key={o.value} className={clsx('cursor-pointer rounded-lg border p-3 transition-colors focus-within:ring-2 focus-within:ring-primary', selected ? 'border-primary ring-1 ring-primary' : 'border-line hover:border-line-strong')}>
                <div className="aspect-[16/10] overflow-hidden rounded-md border border-line">{o.art}</div>
                <div className="mt-3 flex items-center gap-2">
                  <input type="radio" name="theme" className="h-5 w-5 accent-[rgb(var(--primary))]" checked={selected} onChange={() => choose(o.value)} />
                  {o.icon}
                  <span className="text-body-strong text-ink">{t(`account.appearance.${o.value}`)}</span>
                </div>
                {o.hint && <p className="ml-7 mt-0.5 text-small text-muted">{o.hint}</p>}
              </label>
            )
          })}
        </div>
      </SettingsCard>
    </div>
  )
}

import { ArrowLeft, Calendar, Check, Copy, Loader2, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useDb } from '@/store/db'
import { Button, Checkbox, EmptyState, Field, FullscreenFrame, LearnMore, RadioGroup, Select, TextInput, toast } from '@/components/ui'
import { addLinkedCalendar } from '@/api/team'
import { latency } from '@/api/client'

type Step = 'calendar-type' | 'google' | 'sync-type' | 'export-events-to-external' | 'import-events-from-external' | 'sync-success'

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
    </svg>
  )
}

/** Link a calendar wizard (team.md §2.10), with a simulated Google sign-in. */
export function CalendarSyncPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { step = 'calendar-type' } = useParams<{ step: Step }>()
  const [params] = useSearchParams()
  const memberId = params.get('memberId') ?? ''
  const member = useDb((s) => s.teamMembers.find((m) => m.id === memberId))
  const ownerEmail = useDb((s) => s.users.find((u) => u.role === 'owner')?.email ?? '')
  const [kind, setKind] = useState<'google' | 'other' | ''>((params.get('kind') as 'google' | 'other') ?? '')
  const [sync, setSync] = useState<'export' | 'import' | ''>((params.get('sync') as 'export' | 'import') ?? '')
  const [blocked, setBlocked] = useState(false)
  const [url, setUrl] = useState('')
  const [detail, setDetail] = useState<'all' | 'time'>('all')
  const [busy, setBusy] = useState(false)
  const [googleStage, setGoogleStage] = useState<'account' | 'consent'>('account')
  const [googleEmail, setGoogleEmail] = useState('')
  const [otherEmail, setOtherEmail] = useState('')

  const editUrl = `/team/team-members/edit/${memberId}?section=settings`
  const go = (next: Step, extra: Record<string, string> = {}) => navigate(`/team/team-members/calendar-sync/${next}?${new URLSearchParams({ memberId, ...extra }).toString()}`)

  if (!member) {
    return (
      <FullscreenFrame onClose={() => navigate('/team/team-members')}>
        <EmptyState title={t('team.errors.notFoundTitle')} body={t('team.errors.notFound')} action={<Button onClick={() => navigate('/team/team-members')}>{t('team.form.backToList')}</Button>} />
      </FullscreenFrame>
    )
  }
  const name = member.firstName

  const complete = async (calendar: { name: string; url: string }, mode: string) => {
    setBusy(true)
    const record = await addLinkedCalendar(member.id, calendar)
    setBusy(false)
    toast(t('team.sync.toast'))
    go('sync-success', { calendarId: record.id, mode })
  }

  const stepNumber = step === 'calendar-type' ? 1 : step === 'sync-type' || step === 'google' ? 2 : 3
  const progress = step === 'sync-success' ? 1 : stepNumber / 3
  const back = () => {
    if (step === 'calendar-type') navigate(editUrl)
    else if (step === 'sync-type' || step === 'google') go('calendar-type', kind ? { kind } : {})
    else go('sync-type', { kind: 'other', ...(sync ? { sync } : {}) })
  }

  let content: JSX.Element
  let primary: JSX.Element | null = null
  if (step === 'calendar-type') {
    content = (
      <>
        <h1 className="font-display text-title-1 text-ink">{t('team.sync.typeTitle')}</h1>
        <p className="mb-6 mt-2 text-body-lg text-muted">
          {t('team.sync.typeBody')} <LearnMore topic="calendar sync" />
        </p>
        <RadioGroup
          variant="cards"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'google', label: <span className="flex items-center gap-2"><GoogleMark />{t('team.sync.google')}</span> },
            { value: 'other', label: <span className="flex items-center gap-2"><Calendar size={20} aria-hidden />{t('team.sync.other')}</span> },
          ]}
        />
      </>
    )
    primary = (
      <Button variant="primary" disabled={!kind} onClick={() => (kind === 'google' ? go('google', { kind }) : go('sync-type', { kind }))}>
        {t('team.common.continue')}
      </Button>
    )
  } else if (step === 'google') {
    const accounts = [...new Set([member.email, ownerEmail].filter(Boolean))]
    content = (
      <div className="mx-auto max-w-md rounded-xl border border-line bg-surface p-8 shadow-sm">
        <div className="flex items-center gap-2 text-body text-muted">
          <GoogleMark />
          {t('team.sync.gSignIn')}
        </div>
        {googleStage === 'account' ? (
          <>
            <h1 className="mt-5 font-display text-title-2 text-ink">{t('team.sync.gChoose')}</h1>
            <p className="mt-1 text-body text-muted">{t('team.sync.gContinue')}</p>
            <ul className="mt-6 flex flex-col divide-y divide-line rounded-lg border border-line">
              {accounts.map((email) => (
                <li key={email}>
                  <button
                    type="button"
                    onClick={() => {
                      setGoogleEmail(email)
                      setGoogleStage('consent')
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-sunken"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-subtle text-body-strong text-primary">{email[0]?.toUpperCase()}</span>
                    <span className="text-body text-ink">{email}</span>
                  </button>
                </li>
              ))}
              <li className="flex gap-2 p-3">
                <TextInput type="email" placeholder={t('team.sync.gOther')} aria-label={t('team.sync.gOther')} value={otherEmail} onChange={(e) => setOtherEmail(e.target.value)} />
                <Button
                  disabled={!/^\S+@\S+\.\S+$/.test(otherEmail)}
                  onClick={() => {
                    setGoogleEmail(otherEmail.trim())
                    setGoogleStage('consent')
                  }}
                >
                  {t('team.common.next')}
                </Button>
              </li>
            </ul>
          </>
        ) : (
          <>
            <h1 className="mt-5 font-display text-title-2 text-ink">{t('team.sync.gConsentTitle')}</h1>
            <p className="mt-1 text-body text-muted">{googleEmail}</p>
            <ul className="mt-5 flex flex-col gap-3 text-body text-ink">
              <li className="flex gap-2">
                <ShieldCheck size={18} className="mt-0.5 text-primary" aria-hidden />
                {t('team.sync.gScope1')}
              </li>
              <li className="flex gap-2">
                <ShieldCheck size={18} className="mt-0.5 text-primary" aria-hidden />
                {t('team.sync.gScope2')}
              </li>
            </ul>
            <p className="mt-5 text-small text-muted">{t('team.sync.gTrust')}</p>
            <div className="mt-6 flex justify-end gap-2">
              <Button onClick={() => setGoogleStage('account')}>{t('team.common.cancel')}</Button>
              <Button
                variant="primary"
                loading={busy}
                onClick={async () => {
                  setBusy(true)
                  await latency(600, 1000)
                  await complete({ name: t('team.sync.googleName'), url: `https://calendar.google.com/calendar/ical/${encodeURIComponent(googleEmail)}/private-${crypto.randomUUID().slice(0, 8)}/basic.ics` }, 'google')
                }}
              >
                {t('team.sync.gAllow')}
              </Button>
            </div>
          </>
        )}
      </div>
    )
  } else if (step === 'sync-type') {
    content = (
      <>
        <h1 className="font-display text-title-1 text-ink">{t('team.sync.syncTitle')}</h1>
        <p className="mb-6 mt-2 text-body-lg text-muted">{t('team.sync.syncBody')}</p>
        <RadioGroup
          variant="cards"
          value={sync}
          onChange={setSync}
          options={[
            { value: 'export', label: t('team.sync.export'), hint: t('team.sync.exportHint', { name }) },
            { value: 'import', label: t('team.sync.import'), hint: t('team.sync.importHint') },
          ]}
        />
      </>
    )
    primary = (
      <Button variant="primary" disabled={!sync} onClick={() => go(sync === 'export' ? 'export-events-to-external' : 'import-events-from-external', { kind: 'other', sync })}>
        {t('team.common.continue')}
      </Button>
    )
  } else if (step === 'export-events-to-external') {
    content = (
      <>
        <h1 className="font-display text-title-1 text-ink">{t('team.sync.export')}</h1>
        <p className="mb-6 mt-2 text-body-lg text-muted">{t('team.sync.exportBody', { name })}</p>
        <div className="card flex flex-col gap-4 p-6">
          <h2 className="text-body-strong text-ink">{t('team.sync.eventsToSync')}</h2>
          <Checkbox label={t('team.sync.appointments')} hint={t('team.sync.appointmentsHint', { name })} checked disabled onChange={() => undefined} />
          <Checkbox label={t('team.sync.blocked')} hint={t('team.sync.blockedHint', { name })} checked={blocked} onChange={setBlocked} />
        </div>
      </>
    )
    primary = (
      <Button variant="primary" loading={busy} onClick={() => complete({ name: t('team.sync.exportName'), url: `https://calendar-export.innoweb.app/${crypto.randomUUID()}.ics${blocked ? '?blocked=1' : ''}` }, 'export')}>
        {t('team.common.complete')}
      </Button>
    )
  } else if (step === 'import-events-from-external') {
    const valid = /^(https?|webcal):\/\/\S+\.\S+/.test(url.trim())
    content = (
      <>
        <h1 className="font-display text-title-1 text-ink">{t('team.sync.import')}</h1>
        <p className="mb-6 mt-2 text-body-lg text-muted">{t('team.sync.importBody', { name })}</p>
        <div className="card flex flex-col gap-5 p-6">
          <Field label={t('team.sync.url')} hint={t('team.sync.urlHint')} error={url && !valid ? t('team.sync.urlInvalid') : undefined}>
            {(id) => <TextInput id={id} type="url" placeholder="https://calendar-export.innoweb.app/calendar.ics" value={url} onChange={(e) => setUrl(e.target.value)} />}
          </Field>
          <Field label={t('team.sync.detail')} hint={detail === 'all' ? t('team.sync.allHint') : t('team.sync.timeHint')}>
            {(id) => (
              <Select
                id={id}
                value={detail}
                onChange={(e) => setDetail(e.target.value as 'all' | 'time')}
                options={[
                  { value: 'all', label: t('team.sync.all') },
                  { value: 'time', label: t('team.sync.time') },
                ]}
              />
            )}
          </Field>
          <p className="text-small text-muted">{t('team.sync.detailHelper')}</p>
        </div>
      </>
    )
    primary = (
      <Button variant="primary" loading={busy} disabled={!valid} onClick={() => complete({ name: t('team.sync.importName'), url: url.trim() }, 'import')}>
        {t('team.common.complete')}
      </Button>
    )
  } else {
    const cal = member.linkedCalendars.find((c) => c.id === params.get('calendarId'))
    const mode = params.get('mode') ?? 'export'
    content = (
      <div className="flex flex-col items-center text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-white shadow-md">
          <Check size={40} strokeWidth={3} aria-hidden />
        </span>
        <h1 className="mt-6 font-display text-title-1 text-ink">{t('team.sync.successTitle')}</h1>
        <p className="mt-2 max-w-lg text-body-lg text-muted">{t(`team.sync.success_${mode}`, { name })}</p>
        {cal && mode === 'export' && (
          <div className="mt-8 w-full max-w-xl text-left">
            <Field label={t('team.sync.exportLink')} hint={t('team.sync.exportLinkHint', { name })}>
              {(id) => (
                <div className="flex gap-2">
                  <TextInput id={id} readOnly value={cal.url} onFocus={(e) => e.target.select()} />
                  <Button
                    icon={<Copy size={16} />}
                    aria-label={t('team.sync.copy')}
                    onClick={() => {
                      void navigator.clipboard?.writeText(cal.url).catch(() => undefined)
                      toast(t('team.form.settings.copied'))
                    }}
                  >
                    {t('team.sync.copy')}
                  </Button>
                </div>
              )}
            </Field>
          </div>
        )}
      </div>
    )
    primary = (
      <Button variant="primary" onClick={() => navigate(editUrl)}>
        {t('team.common.done')}
      </Button>
    )
  }

  return (
    <FullscreenFrame
      title={step === 'sync-success' ? undefined : t('team.sync.progress', { n: stepNumber })}
      progress={progress}
      onClose={() => navigate(editUrl)}
      maxWidth="max-w-2xl"
      actions={
        <>
          {step !== 'calendar-type' && step !== 'sync-success' && (
            <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={back}>
              {t('team.common.goBack')}
            </Button>
          )}
          {primary}
        </>
      }
    >
      {busy && step === 'google' && (
        <p className="mb-4 flex items-center justify-center gap-2 text-body text-muted" role="status">
          <Loader2 size={16} className="animate-spin" aria-hidden />
          {t('team.sync.connecting')}
        </p>
      )}
      {content}
    </FullscreenFrame>
  )
}

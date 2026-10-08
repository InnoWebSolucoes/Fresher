import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useDb } from '@/store/db'
import { useSessionStore } from '@/store/session'
import { Button, Field, TextInput, toast } from '@/components/ui'
import { ApiError } from '@/api/client'
import { acceptInvite, asRecord, useMemberExtras } from '@/api/team'

/** Accept a team invite: set a password, create the login, sign in (SPEC §8). */
export function AcceptInvitePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { token = '' } = useParams()
  const extras = useMemberExtras()
  const teamMembers = useDb((s) => s.teamMembers)
  const member = token ? teamMembers.find((m) => asRecord(m, extras).inviteToken === token) : undefined
  const workspace = useDb((s) => s.workspace.name)
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (password.length < 8) return setError(t('team.invite.errors.password'))
    if (password !== confirmPw) return setError(t('team.invite.errors.match'))
    setBusy(true)
    try {
      const user = await acceptInvite(token, password)
      useSessionStore.getState().setCurrentUser(user.id)
      toast(t('team.invite.toast'))
      navigate('/', { replace: true })
    } catch (e) {
      setError(e instanceof ApiError ? t(e.message) : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-canvas p-6">
      <div className="card w-full max-w-md p-8">
        <p className="font-display text-title-3 text-primary">Innoweb Bookings</p>
        {!member || member.invite?.status !== 'pending' ? (
          <>
            <h1 className="mt-4 font-display text-title-1 text-ink">{t('team.invite.invalidTitle')}</h1>
            <p className="mt-2 text-body text-muted">{t('team.invite.errors.invalid')}</p>
            <Button className="mt-6" onClick={() => navigate('/login')}>{t('team.invite.toLogin')}</Button>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            <h1 className="mt-4 font-display text-title-1 text-ink">{t('team.invite.title', { workspace })}</h1>
            <p className="mt-2 text-body text-muted">{t('team.invite.body', { name: member.firstName, email: member.email })}</p>
            <div className="mt-6 flex flex-col gap-4">
              <Field label={t('team.invite.password')} hint={t('team.invite.passwordHint')}>{(id) => <TextInput id={id} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
              <Field label={t('team.invite.confirm')} error={error}>{(id) => <TextInput id={id} type="password" autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />}</Field>
            </div>
            <Button type="submit" variant="primary" className="mt-6 w-full" loading={busy}>
              {t('team.invite.submit')}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}

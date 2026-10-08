import { useSessionStore } from '@/store/session'
import { commit, db } from '@/store/db'
import type { User } from '@/types'
import { ApiError, latency } from './client'
import { queueMessage } from './messaging'
import { nowISO } from '@/lib/time'
import { t } from './i18n'

const normalise = (email: string) => email.trim().toLowerCase()

export async function login(email: string, password: string): Promise<User> {
  await latency()
  const user = db().users.find((u) => u.email === normalise(email))
  if (!user || user.password !== password) {
    throw new ApiError('invalid_credentials', 'auth.errors.invalidCredentials')
  }
  if (user.role === 'none') {
    throw new ApiError('no_access', 'auth.errors.noAccess')
  }
  useSessionStore.getState().setCurrentUser(user.id)
  return user
}

export async function logout(): Promise<void> {
  await latency(150, 300)
  useSessionStore.getState().setCurrentUser(null)
}

/** Switch the session to another user without a password (demo panel "Switch role"). */
export async function switchUser(userId: string): Promise<void> {
  await latency(100, 200)
  useSessionStore.getState().setCurrentUser(userId)
}

/** Creates a one-time token and emails the reset link to the demo outbox. */
export async function requestPasswordReset(email: string): Promise<{ token: string | null }> {
  await latency()
  const user = db().users.find((u) => u.email === normalise(email))
  // Same response whether or not the account exists, like a real product.
  if (!user) return { token: null }
  const token = crypto.randomUUID()
  useSessionStore.getState().addReset({ token, email: user.email, createdAt: nowISO(), used: false })
  queueMessage({
    clientId: null,
    to: user.email,
    toName: `${user.firstName} ${user.lastName}`,
    channel: 'email',
    type: 'password_reset',
    subject: t('api.auth.reset.subject'),
    body: t('api.auth.reset.body', { firstName: user.firstName }),
    link: { label: t('auth.resetTitle'), href: `/reset-password?token=${token}` },
  })
  return { token }
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await latency()
  const session = useSessionStore.getState()
  const reset = session.resets.find((r) => r.token === token && !r.used)
  if (!reset) throw new ApiError('invalid_token', 'auth.errors.invalidToken')
  commit((d) => {
    const user = d.users.find((u) => u.email === reset.email)
    if (user) user.password = password
  })
  session.useReset(token)
}

export async function changePassword(userId: string, current: string, next: string): Promise<void> {
  await latency()
  const user = db().users.find((u) => u.id === userId)
  if (!user || user.password !== current) throw new ApiError('invalid_password', t('api.auth.currentPasswordIncorrect'))
  commit((d) => {
    const u = d.users.find((x) => x.id === userId)
    if (u) u.password = next
  })
}

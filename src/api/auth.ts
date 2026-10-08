import { useSessionStore, type DemoUser } from '@/store/session'
import { ApiError, latency } from './client'

const normalise = (email: string) => email.trim().toLowerCase()

export async function login(email: string, password: string): Promise<DemoUser> {
  await latency()
  const { users, _setCurrentUser } = useSessionStore.getState()
  const user = users.find((u) => u.email === normalise(email))
  if (!user || user.password !== password) {
    throw new ApiError('invalid_credentials', 'auth.errors.invalidCredentials')
  }
  if (user.role === 'none') {
    throw new ApiError('no_access', 'auth.errors.noAccess')
  }
  _setCurrentUser(user.id)
  return user
}

export async function logout(): Promise<void> {
  await latency(150, 300)
  useSessionStore.getState()._setCurrentUser(null)
}

/**
 * Creates a reset token. Phase 1 delivers the link to the demo outbox; the
 * token is returned so the UI can confirm it was "sent".
 */
export async function requestPasswordReset(email: string): Promise<{ token: string | null }> {
  await latency()
  const { users, resets, _setResets } = useSessionStore.getState()
  const user = users.find((u) => u.email === normalise(email))
  // Same response whether or not the account exists, like a real product.
  if (!user) return { token: null }
  const token = crypto.randomUUID()
  _setResets([...resets, { token, email: user.email, createdAt: new Date().toISOString(), used: false }])
  return { token }
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await latency()
  const { users, resets, _setUsers, _setResets } = useSessionStore.getState()
  const reset = resets.find((r) => r.token === token && !r.used)
  if (!reset) throw new ApiError('invalid_token', 'auth.errors.invalidToken')
  _setUsers(users.map((u) => (u.email === reset.email ? { ...u, password } : u)))
  _setResets(resets.map((r) => (r.token === token ? { ...r, used: true } : r)))
}

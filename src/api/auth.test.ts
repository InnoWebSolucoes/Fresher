import { login, logout, requestPasswordReset, resetPassword } from './auth'
import { SEED_USERS, useSessionStore } from '@/store/session'
import { canAccess, landingPath } from '@/lib/permissions'

beforeEach(() => {
  useSessionStore.setState({ users: SEED_USERS, currentUserId: null, resets: [] })
})

describe('auth api', () => {
  it('logs in the owner with the demo password', async () => {
    const user = await login('Owner@demo.app ', 'demo1234')
    expect(user.role).toBe('owner')
    expect(useSessionStore.getState().currentUserId).toBe('u-owner')
    await logout()
    expect(useSessionStore.getState().currentUserId).toBeNull()
  })

  it('rejects a wrong password', async () => {
    await expect(login('owner@demo.app', 'nope')).rejects.toMatchObject({ code: 'invalid_credentials' })
  })

  it('resets a password with a one-time token', async () => {
    const { token } = await requestPasswordReset('staff@demo.app')
    expect(token).toBeTruthy()
    await resetPassword(token!, 'newpass123')
    await expect(login('staff@demo.app', 'newpass123')).resolves.toMatchObject({ id: 'u-staff' })
    await expect(resetPassword(token!, 'again1234')).rejects.toMatchObject({ code: 'invalid_token' })
  })

  it('does not reveal whether an email exists', async () => {
    await expect(requestPasswordReset('nobody@demo.app')).resolves.toEqual({ token: null })
  })
})

describe('permissions', () => {
  it('hides Reports, Marketing and Settings from front-desk staff', () => {
    expect(canAccess('basic', 'reports')).toBe(false)
    expect(canAccess('basic', 'marketing')).toBe(false)
    expect(canAccess('basic', 'settings')).toBe(false)
    expect(canAccess('basic', 'calendar')).toBe(true)
    expect(landingPath('basic')).toBe('/calendar')
    expect(landingPath('owner')).toBe('/dashboard')
  })
})

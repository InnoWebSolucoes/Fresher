import { login, logout, requestPasswordReset, resetPassword } from './auth'
import { useSessionStore } from '@/store/session'
import { db, replaceAll } from '@/store/db'
import { buildSeed } from '@/mock/seed'
import { canAccess, landingPath } from '@/lib/permissions'

beforeAll(() => {
  replaceAll(buildSeed(new Date('2026-10-08T15:00:00')))
})

describe('auth api', () => {
  it('logs in the owner with the demo password', async () => {
    const user = await login('Owner@demo.app ', 'demo1234')
    expect(user.role).toBe('owner')
    expect(useSessionStore.getState().currentUserId).toBe('u_owner')
    await logout()
    expect(useSessionStore.getState().currentUserId).toBeNull()
  })

  it('rejects a wrong password', async () => {
    await expect(login('owner@demo.app', 'nope')).rejects.toMatchObject({ code: 'invalid_credentials' })
  })

  it('resets a password with a one-time token sent to the outbox', async () => {
    const { token } = await requestPasswordReset('staff@demo.app')
    expect(token).toBeTruthy()
    expect(db().messages[0]).toMatchObject({ type: 'password_reset', to: 'staff@demo.app' })
    await resetPassword(token!, 'newpass123')
    await expect(login('staff@demo.app', 'newpass123')).resolves.toMatchObject({ id: 'u_staff' })
    await expect(resetPassword(token!, 'again1234')).rejects.toMatchObject({ code: 'invalid_token' })
  })

  it('does not reveal whether an email exists', async () => {
    await expect(requestPasswordReset('nobody@demo.app')).resolves.toEqual({ token: null })
  })
})

describe('permissions', () => {
  it('hides Reports, Marketing and Settings from front-desk staff', () => {
    for (const role of ['basic', 'low'] as const) {
      expect(canAccess(role, 'reports')).toBe(false)
      expect(canAccess(role, 'marketing')).toBe(false)
      expect(canAccess(role, 'settings')).toBe(false)
      expect(canAccess(role, 'calendar')).toBe(true)
      expect(landingPath(role)).toBe('/calendar')
    }
    expect(landingPath('owner')).toBe('/dashboard')
  })
})

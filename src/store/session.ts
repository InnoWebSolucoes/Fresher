import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PermissionRole } from '@/lib/permissions'

export interface DemoUser {
  id: string
  email: string
  firstName: string
  lastName: string
  role: PermissionRole
  /** Demo only: logins are stored in the browser, never sent anywhere. */
  password: string
}

export interface PasswordReset {
  token: string
  email: string
  createdAt: string
  used: boolean
}

interface SessionState {
  users: DemoUser[]
  currentUserId: string | null
  resets: PasswordReset[]
  /** Store setters, called only from src/api. */
  _setCurrentUser: (id: string | null) => void
  _setUsers: (users: DemoUser[]) => void
  _setResets: (resets: PasswordReset[]) => void
}

// Ready-made logins from SPEC §4.
export const SEED_USERS: DemoUser[] = [
  { id: 'u-owner', email: 'owner@demo.app', firstName: 'Marta', lastName: 'Ribeiro', role: 'owner', password: 'demo1234' },
  { id: 'u-staff', email: 'staff@demo.app', firstName: 'João', lastName: 'Pereira', role: 'basic', password: 'demo1234' },
]

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      users: SEED_USERS,
      currentUserId: null,
      resets: [],
      _setCurrentUser: (id) => set({ currentUserId: id }),
      _setUsers: (users) => set({ users }),
      _setResets: (resets) => set({ resets }),
    }),
    { name: 'ib-session', version: 1 },
  ),
)

export function useCurrentUser(): DemoUser | null {
  return useSessionStore((s) => s.users.find((u) => u.id === s.currentUserId) ?? null)
}

export function initials(user: Pick<DemoUser, 'firstName' | 'lastName'>): string {
  return `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase()
}

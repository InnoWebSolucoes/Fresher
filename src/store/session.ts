import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useDb } from './db'
import type { User } from '@/types'

export interface PasswordReset {
  token: string
  email: string
  createdAt: string
  used: boolean
}

interface SessionState {
  currentUserId: string | null
  resets: PasswordReset[]
  setCurrentUser: (id: string | null) => void
  addReset: (reset: PasswordReset) => void
  useReset: (token: string) => void
}

/** Who is logged in on this browser (users themselves live in the db store). */
export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      currentUserId: null,
      resets: [],
      setCurrentUser: (id) => set({ currentUserId: id }),
      addReset: (reset) => set((s) => ({ resets: [...s.resets, reset] })),
      useReset: (token) => set((s) => ({ resets: s.resets.map((r) => (r.token === token ? { ...r, used: true } : r)) })),
    }),
    { name: 'ib-session', version: 2 },
  ),
)

export type DemoUser = User

export function useCurrentUser(): User | null {
  const id = useSessionStore((s) => s.currentUserId)
  const users = useDb((s) => s.users)
  return users?.find((u) => u.id === id) ?? null
}

export function initials(user: Pick<User, 'firstName' | 'lastName'>): string {
  return `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase()
}

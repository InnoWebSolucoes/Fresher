import { createContext, useContext, useEffect } from 'react'
import type { Client, ID } from '@/types'
import type { DrawerTab } from '../lib/constants'

export type DrawerAction =
  | { kind: 'staffAlert' }
  | { kind: 'note'; noteId?: ID }
  | { kind: 'allergy'; allergyId?: ID }
  | { kind: 'patchTest'; testId?: ID }
  | { kind: 'tags' }
  | { kind: 'reward' }
  | { kind: 'block' }
  | { kind: 'messages' }
  | { kind: 'sendForm' }
  | { kind: 'formResponse'; id: ID }
  | { kind: 'rewardActivity' }

export interface ClientDrawerCtx {
  client: Client
  tab: DrawerTab
  setTab: (tab: DrawerTab) => void
  act: (action: DrawerAction) => void
  /** Navigate to the edit form, returning to this drawer afterwards. */
  edit: (section?: string, focus?: string) => void
  close: () => void
}

export const ClientDrawerContext = createContext<ClientDrawerCtx | null>(null)

export function useClientDrawer(): ClientDrawerCtx {
  const ctx = useContext(ClientDrawerContext)
  if (!ctx) throw new Error('useClientDrawer outside the client drawer')
  return ctx
}

/** Escape closes a full-screen overlay without closing the drawer underneath. */
export function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])
}

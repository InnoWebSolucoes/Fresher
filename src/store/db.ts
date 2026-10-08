import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { produce, type Draft } from 'immer'
import { del, get, set } from 'idb-keyval'
import type { DbData } from '@/types'

/**
 * The single source of truth (SPEC §2). Persisted to IndexedDB through
 * idb-keyval, synced between tabs with BroadcastChannel.
 *
 * Rules:
 * - Components READ with `useDb(selector)`. Select raw slices (e.g.
 *   `s => s.clients`) and derive with useMemo; never return a new array or
 *   object from a selector (zustand v5 would loop). Use `useShallow` if you
 *   must pick several fields.
 * - Only src/api/* WRITES, through `commit()`.
 */
export interface DbState extends DbData {
  hydrated: boolean
  /** True once seed data exists. */
  ready: boolean
}

const idbStorage: StateStorage = {
  getItem: async (name) => (await get<string>(name)) ?? null,
  setItem: async (name, value) => {
    await set(name, value)
    channel?.postMessage({ type: 'db-updated', name, from: TAB_ID })
  },
  removeItem: async (name) => {
    await del(name)
  },
}

export const DB_KEY = 'ib-db'
const TAB_ID = Math.random().toString(36).slice(2)
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ib-sync') : null

export const useDb = create<DbState>()(
  persist(() => ({ hydrated: false, ready: false }) as unknown as DbState, {
    name: DB_KEY,
    version: 1,
    storage: createJSONStorage(() => (typeof indexedDB === 'undefined' ? localStorage : idbStorage)),
    partialize: (state) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { hydrated, ready, ...data } = state
      return data as DbState
    },
    onRehydrateStorage: () => (state) => {
      useDb.setState({ hydrated: true, ready: Boolean(state?.meta) })
    },
  }),
)

// Another tab wrote: pull the latest copy (debounced).
let syncTimer: ReturnType<typeof setTimeout> | undefined
channel?.addEventListener('message', (event: MessageEvent<{ type: string; from: string }>) => {
  if (event.data?.type !== 'db-updated' || event.data.from === TAB_ID) return
  clearTimeout(syncTimer)
  syncTimer = setTimeout(() => void useDb.persist.rehydrate(), 150)
})

/** Apply an immer recipe to the persisted data. Only src/api/* calls this. */
export function commit(recipe: (draft: Draft<DbData>) => void): void {
  useDb.setState((state) => produce(state, recipe as (draft: Draft<DbState>) => void))
}

/** Replace all data (seed / reset). */
export function replaceAll(data: DbData): void {
  useDb.setState({ ...data, hydrated: true, ready: true })
}

/** Synchronous snapshot for api functions and non-React code. */
export const db = (): DbState => useDb.getState()

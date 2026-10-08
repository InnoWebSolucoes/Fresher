import { useSessionStore } from '@/store/session'
import { commit, db } from '@/store/db'
import type { DbData, ID } from '@/types'
import { uid } from '@/lib/ids'
import { nowISO } from '@/lib/time'
import { t } from './i18n'

/** Simulated network latency for the mock API (SPEC §4: 300–800 ms). */
export function latency(min = 300, max = 800): Promise<void> {
  const ms = import.meta.env.MODE === 'test' ? 0 : min + Math.random() * (max - min)
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

/** Display name of whoever is logged in, for activity logs ("by Marta Ribeiro"). */
export function actorName(): string {
  const id = useSessionStore.getState().currentUserId
  const user = db().users?.find((u) => u.id === id)
  return user ? `${user.firstName} ${user.lastName}` : 'Marta Ribeiro'
}

export function actorTeamMemberId(): ID | undefined {
  const id = useSessionStore.getState().currentUserId
  return db().users?.find((u) => u.id === id)?.teamMemberId
}

export const activity = (title: string, detail?: string) => ({ id: uid('act'), at: nowISO(), by: actorName(), title, detail })

/** Keys of DbData that hold arrays of records with an id. */
export type CollectionKey = {
  [K in keyof DbData]: DbData[K] extends Array<{ id: ID }> ? K : never
}[keyof DbData]

type ItemOf<K extends CollectionKey> = DbData[K] extends Array<infer T> ? T : never

/**
 * Generic CRUD for any collection, with simulated latency. Sections use it for
 * simple records and write domain functions (src/api/<domain>.ts) for flows.
 */
export function crud<K extends CollectionKey>(key: K, prefix = String(key).slice(0, 4)) {
  return {
    async create(item: Omit<ItemOf<K>, 'id'> & { id?: ID }): Promise<ItemOf<K>> {
      await latency()
      const record = { ...item, id: item.id ?? uid(prefix) } as ItemOf<K>
      commit((d) => {
        ;(d[key] as unknown as ItemOf<K>[]).push(record)
      })
      return record
    },
    async update(id: ID, patch: Partial<ItemOf<K>>): Promise<void> {
      await latency()
      commit((d) => {
        const list = d[key] as unknown as (ItemOf<K> & { id: ID })[]
        const index = list.findIndex((x) => x.id === id)
        if (index === -1) throw new ApiError('not_found', t('api.errors.recordNotFound', { collection: String(key), id }))
        list[index] = { ...list[index], ...patch }
      })
    },
    async remove(id: ID): Promise<void> {
      await latency()
      commit((d) => {
        const list = d[key] as unknown as { id: ID }[]
        const index = list.findIndex((x) => x.id === id)
        if (index !== -1) list.splice(index, 1)
      })
    },
    /** Replace the whole collection (reorder, bulk edit). */
    async replaceAll(items: ItemOf<K>[]): Promise<void> {
      await latency()
      commit((d) => {
        ;(d as unknown as Record<string, unknown>)[key] = items
      })
    },
  }
}

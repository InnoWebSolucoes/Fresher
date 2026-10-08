import { useDb, commit } from '@/store/db'
import { latency } from './client'

/**
 * Section-owned data that has no shared collection lives in `db.ext[namespace]`.
 * Unlike a section-local persisted store, it is saved with the rest of the
 * demo, syncs between tabs, and is cleared by "Reset demo".
 *
 *   const links = useExt<Link[]>('online', 'links', [])
 *   await setExt('online', 'links', [...links, link])
 */
const EMPTY = Object.freeze({}) as Record<string, unknown>

export function readExt<T>(namespace: string, key: string, fallback: T): T {
  const bag = useDb.getState().ext?.[namespace] ?? EMPTY
  return (key in bag ? bag[key] : fallback) as T
}

/** React hook: re-renders when the value changes. */
export function useExt<T>(namespace: string, key: string, fallback: T): T {
  const value = useDb((s) => s.ext?.[namespace]?.[key])
  return (value === undefined ? fallback : value) as T
}

/** Write without simulated latency (for UI preferences that should feel instant). */
export function writeExt(namespace: string, key: string, value: unknown): void {
  commit((d) => {
    if (!d.ext) d.ext = {}
    if (!d.ext[namespace]) d.ext[namespace] = {}
    d.ext[namespace][key] = value
  })
}

/** Write with simulated API latency (for user actions that "save"). */
export async function setExt(namespace: string, key: string, value: unknown): Promise<void> {
  await latency(150, 400)
  writeExt(namespace, key, value)
}

export function updateExt<T>(namespace: string, key: string, fallback: T, recipe: (current: T) => T): void {
  writeExt(namespace, key, recipe(readExt(namespace, key, fallback)))
}

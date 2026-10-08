import type { ReactNode } from 'react'

/** Root key for the strings in ../en.more1.json. */
export const M = 'settings.more1'

/** Swap two entries of a list of ids (Move up / Move down). */
export function moved<T>(list: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction
  if (target < 0 || target >= list.length) return list
  const next = [...list]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

/** Bold value inside a summary sentence. */
export const B = ({ children }: { children?: ReactNode }) => <strong className="font-semibold text-ink">{children}</strong>

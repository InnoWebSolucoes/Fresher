import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/** Search params owned by drawers; cleared together when a drawer closes. Extra params must start with `d_`. */
const isDrawerParam = (key: string) => key === 'drawer' || key === 'tab' || key === 'id' || key === 'view' || key.startsWith('d_')

/**
 * Drawers open over the current page through `?drawer=<name>` (see
 * REFERENCE_MAP.md rule 3), so the page underneath keeps its own state.
 *   open('client', { id: 'cl_001', tab: 'sales' })
 *   open('checkout', { d_appointment: 'apt_1' })
 */
export function useDrawer() {
  const [params, setParams] = useSearchParams()

  const open = useCallback(
    (name: string, extra: Record<string, string | undefined> = {}) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        ;[...next.keys()].filter(isDrawerParam).forEach((key) => next.delete(key))
        next.set('drawer', name)
        Object.entries(extra).forEach(([key, value]) => {
          if (value !== undefined) next.set(key, value)
        })
        return next
      })
    },
    [setParams],
  )

  const close = useCallback(() => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      ;[...next.keys()].filter(isDrawerParam).forEach((key) => next.delete(key))
      return next
    })
  }, [setParams])

  /** Update params of the open drawer without closing it (e.g. switch tab). */
  const update = useCallback(
    (extra: Record<string, string | undefined>) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        Object.entries(extra).forEach(([key, value]) => (value === undefined ? next.delete(key) : next.set(key, value)))
        return next
      })
    },
    [setParams],
  )

  return { name: params.get('drawer'), tab: params.get('tab'), id: params.get('id'), params, open, close, update }
}

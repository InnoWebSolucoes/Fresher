import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/** Search params owned by drawers; cleared together when a drawer closes. */
const DRAWER_PARAMS = ['drawer', 'tab', 'id', 'view']

/**
 * Drawers open over the current page through `?drawer=<name>` (see
 * REFERENCE_MAP.md rule 3), so the page underneath keeps its own state.
 */
export function useDrawer() {
  const [params, setParams] = useSearchParams()

  const open = useCallback(
    (name: string, extra: Record<string, string> = {}) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        DRAWER_PARAMS.forEach((key) => next.delete(key))
        next.set('drawer', name)
        Object.entries(extra).forEach(([key, value]) => next.set(key, value))
        return next
      })
    },
    [setParams],
  )

  const close = useCallback(() => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      DRAWER_PARAMS.forEach((key) => next.delete(key))
      return next
    })
  }, [setParams])

  return { name: params.get('drawer'), tab: params.get('tab'), id: params.get('id'), open, close }
}

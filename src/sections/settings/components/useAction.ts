import { useCallback, useState } from 'react'
import { ApiError } from '@/api/client'
import { toast } from '@/components/ui'

/**
 * Runs an async action with a busy flag; shows `success` as a toast and any
 * ApiError message as an error toast. Returns true when it succeeded.
 *
 *   const [saving, run] = useAction()
 *   run(() => updateSettings(…), 'Settings updated', close)
 */
export function useAction(): [boolean, (fn: () => Promise<unknown>, success?: string, after?: () => void) => Promise<boolean>] {
  const [busy, setBusy] = useState(false)
  const run = useCallback(async (fn: () => Promise<unknown>, success?: string, after?: () => void) => {
    setBusy(true)
    try {
      await fn()
      if (success) toast(success)
      after?.()
      return true
    } catch (error) {
      toast(error instanceof ApiError || error instanceof Error ? error.message : String(error), 'error')
      return false
    } finally {
      setBusy(false)
    }
  }, [])
  return [busy, run]
}

/** Local form state for an edit modal: `draft` resets from `source` every time the modal opens. */
export function useDraft<T>(source: T): [T, (patch: Partial<T> | ((d: T) => T)) => void, (next: T) => void] {
  const [draft, setDraft] = useState<T>(source)
  const patch = useCallback((p: Partial<T> | ((d: T) => T)) => {
    setDraft((d) => (typeof p === 'function' ? (p as (d: T) => T)(d) : { ...d, ...p }))
  }, [])
  return [draft, patch, setDraft]
}

/**
 * Instant toggles (switches and checkboxes that save on change): shows the
 * new value while the save runs, then falls back to the stored value.
 *
 *   const [shown, toggle] = usePending<string>()
 *   <Checkbox checked={shown('a', stored.a)} onChange={(v) => void toggle('a', v, () => save(v))} />
 */
export function usePending<K extends string>(): [(key: K, stored: boolean) => boolean, (key: K, value: boolean, save: () => Promise<unknown>) => Promise<void>] {
  const [pending, setPending] = useState<Partial<Record<K, boolean>>>({})
  const shown = useCallback((key: K, stored: boolean) => pending[key] ?? stored, [pending])
  const toggle = useCallback(async (key: K, value: boolean, save: () => Promise<unknown>) => {
    setPending((p) => ({ ...p, [key]: value }))
    try {
      await save()
    } finally {
      setPending((p) => {
        const next = { ...p }
        delete next[key]
        return next
      })
    }
  }, [])
  return [shown, toggle]
}

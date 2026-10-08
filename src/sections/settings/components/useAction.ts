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

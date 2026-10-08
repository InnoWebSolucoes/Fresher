import { useEffect, type RefObject } from 'react'

/** Calls `onDismiss` on Escape or a pointer press outside every ref'd element. */
export function useDismiss(refs: RefObject<HTMLElement | null>[], open: boolean, onDismiss: () => void): void {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node
      if (refs.every((ref) => !ref.current?.contains(target))) onDismiss()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open, onDismiss, refs])
}

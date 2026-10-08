import { useCallback, useRef, type ComponentProps } from 'react'
import { Modal } from '@/components/ui'

/**
 * The kit's Modal re-runs its focus effect whenever `onClose` changes
 * identity, which moves focus back to the first field on every keystroke
 * when callers pass an inline arrow. This wrapper hands Modal a stable
 * onClose so typing in any field keeps focus. Use it for every settings dialog.
 */
export function SettingsModal(props: ComponentProps<typeof Modal>) {
  const latest = useRef(props.onClose)
  latest.current = props.onClose
  const onClose = useCallback(() => latest.current(), [])
  return <Modal {...props} onClose={onClose} />
}

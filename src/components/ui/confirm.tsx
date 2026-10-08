import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { create } from 'zustand'
import { Modal } from './Modal'
import { Button } from './Button'

interface ConfirmOptions {
  title: ReactNode
  body?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'primary'
}

interface ConfirmState {
  current: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null
}

const useConfirmStore = create<ConfirmState>(() => ({ current: null }))

/**
 * Promise-based confirmation for destructive actions:
 * `if (await confirm({ title: 'Delete client?', tone: 'danger' })) …`
 */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => useConfirmStore.setState({ current: { ...options, resolve } }))
}

/** Mounted once in the app root. */
export function ConfirmHost() {
  const { t } = useTranslation()
  const current = useConfirmStore((s) => s.current)
  const [busy] = useState(false)
  const close = (ok: boolean) => {
    current?.resolve(ok)
    useConfirmStore.setState({ current: null })
  }
  return (
    <Modal
      open={Boolean(current)}
      onClose={() => close(false)}
      title={current?.title}
      size="sm"
      footer={
        <>
          <Button onClick={() => close(false)}>{current?.cancelLabel ?? t('common.cancel')}</Button>
          <Button variant={current?.tone === 'primary' ? 'primary' : 'danger'} loading={busy} onClick={() => close(true)} data-testid="confirm-ok">
            {current?.confirmLabel ?? t('common.confirm')}
          </Button>
        </>
      }
    >
      {current?.body && <div className="text-body text-muted">{current.body}</div>}
    </Modal>
  )
}

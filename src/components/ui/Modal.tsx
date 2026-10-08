import clsx from 'clsx'
import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  subtitle?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Hide the × button (e.g. blocking flows). */
  hideClose?: boolean
  className?: string
}

const SIZES = { sm: 'max-w-[420px]', md: 'max-w-[560px]', lg: 'max-w-[720px]', xl: 'max-w-[1024px]' }

/** Centred modal dialog with Escape-to-close and initial focus. */
export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md', hideClose, className }: ModalProps) {
  const { t } = useTranslation()
  const panel = useRef<HTMLDivElement>(null)
  // Keep the latest onClose without re-running the focus effect on every render.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const focusable = panel.current?.querySelector<HTMLElement>('input, textarea, select, button:not([data-close])')
    ;(focusable ?? panel.current)?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      previous?.focus?.()
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={clsx('relative flex max-h-[92dvh] w-full flex-col rounded-t-xl bg-raised shadow-lg outline-none sm:max-h-[90vh] sm:rounded-xl', SIZES[size], className)}
      >
        {(title || !hideClose) && (
          <div className="flex items-start justify-between gap-4 px-4 pb-2 pt-5 sm:px-6 sm:pt-6">
            <div className="min-w-0">
              {title && <h2 className="font-display text-title-2 text-ink">{title}</h2>}
              {subtitle && <p className="mt-1 text-body text-muted">{subtitle}</p>}
            </div>
            {!hideClose && (
              <button type="button" data-close onClick={onClose} aria-label={t('common.close')} className="icon-btn -mr-2 -mt-1 shrink-0">
                <X size={20} aria-hidden />
              </button>
            )}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3 sm:px-6 sm:py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

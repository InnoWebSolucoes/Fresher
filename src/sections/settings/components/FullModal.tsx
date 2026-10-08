import clsx from 'clsx'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'

/**
 * Full-screen edit overlay used by every settings Edit / Add form (reference:
 * Close and Save or Add at the top right, big title and description, white
 * cards centred below). Sits under regular modals/confirm (z-80) and toasts
 * (z-100). Pass `inline` on 'full' layout routes.
 */
export function FullModal({
  open,
  onClose,
  title,
  subtitle,
  children,
  onSave,
  saveLabel,
  saving,
  saveDisabled,
  actions,
  onBack,
  progress,
  width = 'max-w-[720px]',
  testId,
  inline,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  onSave?: () => void
  saveLabel?: string
  saving?: boolean
  saveDisabled?: boolean
  /** Extra header buttons (left of Save). */
  actions?: ReactNode
  /** Round ← button at the top left (wizards). */
  onBack?: () => void
  /** 0–1 progress bar across the top (wizards). */
  progress?: number
  width?: string
  testId?: string
  /** Render in place (for 'full' layout routes) instead of as a portal overlay. */
  inline?: boolean
}) {
  const { t } = useTranslation()
  const panel = useRef<HTMLDivElement>(null)
  // Keep the latest onClose without re-running the focus effect on every render.
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const first = panel.current?.querySelector<HTMLElement>('[data-autofocus], input:not([type=checkbox]):not([type=radio]), textarea, select')
    ;(first ?? panel.current)?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Let a nested modal / menu handle its own Escape first.
      if (document.querySelector('[role="dialog"][aria-modal="true"]:not([data-fullmodal])')) return
      closeRef.current()
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    if (!inline) document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      if (!inline) document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [open, inline])

  if (!open) return null
  const frame = (
    <div
      ref={panel}
      role={inline ? 'region' : 'dialog'}
      aria-modal={inline ? undefined : true}
      data-fullmodal
      tabIndex={-1}
      aria-label={typeof title === 'string' ? title : undefined}
      className={clsx('flex flex-col bg-canvas outline-none', inline ? 'h-full min-h-0' : 'fixed inset-0 z-[75]')}
      data-testid={testId}
    >
      {progress !== undefined && (
        <div className="h-1 w-full shrink-0 bg-sunken" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-primary transition-all duration-base" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      <header className="flex shrink-0 items-center justify-between gap-3 px-6 py-4">
        <div>
          {onBack && (
            <button type="button" onClick={onBack} aria-label={t('common.back')} className="flex h-11 w-11 items-center justify-center rounded-full border border-line-strong bg-surface hover:bg-sunken">
              <ArrowLeft size={18} aria-hidden />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <Button onClick={onClose} data-testid="fullmodal-close">
            {t('common.close')}
          </Button>
          {onSave && (
            <Button variant="primary" className="px-6" onClick={onSave} loading={saving} disabled={saveDisabled} data-testid="fullmodal-save">
              {saveLabel ?? t('common.save')}
            </Button>
          )}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={clsx('mx-auto w-full px-6 pb-16 pt-2', width)}>
          {title && <h1 className="font-display text-[34px] font-bold leading-[42px] text-ink">{title}</h1>}
          {subtitle && <div className="mt-2 text-body-lg text-muted">{subtitle}</div>}
          <div className={clsx(title && 'mt-8')}>{children}</div>
        </div>
      </div>
    </div>
  )
  return inline ? frame : createPortal(frame, document.body)
}

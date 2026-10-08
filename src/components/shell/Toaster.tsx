import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useToastStore } from '@/store/toast'

/** Toasts: ink pill at the top centre (bottom on phones, clear of the top bar), auto-dismiss (DESIGN_TOKENS.md). */
export function Toaster() {
  const { t } = useTranslation()
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 pb-[env(safe-area-inset-bottom)] md:bottom-auto md:top-4 md:px-0 md:pb-0">
      {toasts.map((item) => (
        <div
          key={item.id}
          role="status"
          className={`pointer-events-auto flex max-w-full items-center gap-3 rounded-3xl py-2.5 pl-5 pr-2 text-body shadow-md md:rounded-full ${
            item.tone === 'error' ? 'bg-danger text-white' : 'bg-ink text-canvas'
          }`}
        >
          {item.message}
          <button type="button" onClick={() => dismiss(item.id)} aria-label={t('common.dismiss')} className="rounded-full p-1 hover:bg-white/15">
            <X size={16} aria-hidden />
          </button>
        </div>
      ))}
    </div>
  )
}

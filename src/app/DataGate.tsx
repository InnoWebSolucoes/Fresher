import { useEffect, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { replaceAll, useDb } from '@/store/db'
import { buildSeed, SEED_VERSION } from '@/mock/seed'
import { ConfirmHost } from '@/components/ui/confirm'
import { Wordmark } from '@/components/shell/Wordmark'

/** Waits for IndexedDB hydration and seeds the demo on first run (or after a seed upgrade). */
export function DataGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const hydrated = useDb((s) => s.hydrated)
  const ready = useDb((s) => s.ready)
  const version = useDb((s) => s.meta?.version)

  useEffect(() => {
    if (!hydrated) return
    if (!ready || version !== SEED_VERSION) {
      // Let the splash paint before the (synchronous) seed build.
      const t = setTimeout(() => replaceAll(buildSeed(new Date())), 30)
      return () => clearTimeout(t)
    }
  }, [hydrated, ready, version])

  if (!hydrated || !ready || version !== SEED_VERSION) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 bg-canvas" role="status" aria-live="polite">
        <Wordmark />
        <p className="flex items-center gap-2 text-body text-muted">
          <Loader2 size={18} className="animate-spin" aria-hidden />
          {hydrated ? t('dataGate.preparing') : t('common.loading')}
        </p>
      </div>
    )
  }
  return (
    <>
      {children}
      <ConfirmHost />
    </>
  )
}

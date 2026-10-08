import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useDrawer } from '@/lib/drawer'
import { SECTION_DRAWERS } from '@/app/sectionRegistry'

/** Phase and reference file for each top-bar drawer (REFERENCE_MAP.md, app shell). */
const DRAWERS: Record<string, { phase: number; ref: string; tabs?: string[] }> = {
  resources: { phase: 4, ref: 'top-bar.md §1, help.md', tabs: ['news', 'help', 'guides'] },
  search: { phase: 4, ref: 'top-bar.md §2' },
  'performance-insights': { phase: 4, ref: 'top-bar.md §3' },
  notifications: { phase: 4, ref: 'top-bar.md §4', tabs: ['appointments', 'reviews', 'tips', 'online-sales', 'actions'] },
  wallet: { phase: 4, ref: 'top-bar.md §6', tabs: ['accounts', 'credits'] },
  referral: { phase: 5, ref: 'profile-and-personal-settings.md §7' },
}

/** Right-hand drawers opened with `?drawer=<name>` over any page. */
export function DrawerHost() {
  const { t } = useTranslation()
  const drawer = useDrawer()
  const panelRef = useRef<HTMLDivElement>(null)
  const def = drawer.name ? DRAWERS[drawer.name] : undefined

  const { name, close } = drawer
  useEffect(() => {
    if (!name) return
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [name, close])

  const section = drawer.name ? SECTION_DRAWERS[drawer.name] : undefined
  if (drawer.name && section) {
    const Component = section.component
    return (
      <div className="fixed inset-0 z-50 flex justify-end" data-testid={`drawer-${drawer.name}`}>
        <button type="button" aria-label={t('drawers.closeDrawer')} className="absolute inset-0 cursor-default bg-ink/10" onClick={drawer.close} tabIndex={-1} />
        <div className="relative flex h-full max-w-full animate-[slideIn_var(--dur-slow)_var(--ease)]">
          <button
            type="button"
            onClick={drawer.close}
            aria-label={t('drawers.closeDrawer')}
            className="absolute -left-16 top-4 hidden h-12 w-12 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-md hover:bg-sunken sm:flex"
          >
            <X size={20} aria-hidden />
          </button>
          <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" className="flex h-full max-w-[100vw] flex-col overflow-hidden bg-surface shadow-lg outline-none" style={{ width: section.width ?? 480 }}>
            <Component id={drawer.id} params={drawer.params} close={drawer.close} />
          </div>
        </div>
      </div>
    )
  }
  if (!drawer.name || !def) return null
  const title = t(`drawers.${drawer.name}`)

  return (
    <div className="fixed inset-0 z-50 flex justify-end" data-testid={`drawer-${drawer.name}`}>
      <button type="button" aria-label={t('drawers.closeDrawer')} className="absolute inset-0 cursor-default bg-ink/10" onClick={drawer.close} tabIndex={-1} />
      <div className="relative flex h-full animate-[slideIn_var(--dur-slow)_var(--ease)]">
        <button
          type="button"
          onClick={drawer.close}
          aria-label={t('drawers.closeDrawer')}
          className="absolute -left-16 top-4 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-md hover:bg-sunken"
        >
          <X size={20} aria-hidden />
        </button>
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="flex h-full w-[480px] max-w-[100vw] flex-col bg-surface shadow-lg outline-none"
        >
          <div className="border-b border-line px-6 py-5">
            <h2 className="font-display text-title-2 text-ink">{title}</h2>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <p className="rounded-md bg-sunken p-4 text-body text-muted">{t('drawers.phaseNote', { phase: def.phase, ref: def.ref })}</p>
          </div>
          {def.tabs && (
            <div role="tablist" className="flex border-t border-line">
              {def.tabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={drawer.tab === tab}
                  onClick={() => drawer.open(drawer.name!, { tab })}
                  className={`flex-1 py-3 text-small ${drawer.tab === tab ? 'text-primary' : 'text-muted hover:text-ink'}`}
                >
                  {t(`drawers.tabs.${tab}`)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

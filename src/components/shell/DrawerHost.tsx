import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useDrawer } from '@/lib/drawer'
import { SECTION_DRAWERS } from '@/app/sectionRegistry'

/**
 * Right-hand drawers opened with `?drawer=<name>` over any page. As in the
 * reference, the page behind stays visible and isn't dimmed; clicking it
 * closes the drawer. A drawer marked `bare` draws its own close control.
 */
export function DrawerHost() {
  const { t } = useTranslation()
  const { name, id, params, close } = useDrawer()
  const panelRef = useRef<HTMLDivElement>(null)
  const def = name ? SECTION_DRAWERS[name] : undefined

  useEffect(() => {
    if (!name) return
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      // Menus, popovers and modals opened inside the drawer close first on Escape.
      if (e.key === 'Escape' && !document.querySelector('[role="menu"], [role="listbox"], [role="dialog"]:not([data-drawer-panel])')) close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [name, close])

  if (!name || !def) return null
  const Component = def.component
  return (
    <div className="fixed inset-0 z-50 flex justify-end" data-testid={`drawer-${name}`}>
      <button type="button" aria-label={t('drawers.closeDrawer')} className="absolute inset-0 cursor-default bg-transparent" onClick={close} tabIndex={-1} />
      <div className="relative flex h-full max-w-full animate-[slideIn_var(--dur-slow)_var(--ease)]">
        {!def.bare && (
          <button
            type="button"
            onClick={close}
            aria-label={t('drawers.closeDrawer')}
            className="absolute -left-16 top-4 hidden h-12 w-12 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-md hover:bg-sunken sm:flex"
          >
            <X size={20} aria-hidden />
          </button>
        )}
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          data-drawer-panel
          className="flex h-full max-w-[100vw] flex-col overflow-hidden border-l border-line bg-surface shadow-lg outline-none"
          style={{ width: def.width ?? 480 }}
        >
          <Component id={id} params={params} close={close} />
        </div>
      </div>
    </div>
  )
}

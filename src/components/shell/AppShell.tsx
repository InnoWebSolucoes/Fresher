import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { RAIL_ITEMS, railItemForPath, type RailItem } from '@/app/navigation'
import { useUiStore } from '@/store/ui'
import { useDismiss } from '@/lib/useDismiss'
import { TopBar } from './TopBar'
import { Rail } from './Rail'
import { SectionPanel } from './SectionPanel'
import { DrawerHost } from './DrawerHost'
import { Toaster } from './Toaster'

/**
 * Workspace shell (SPEC §6). Sections with sub-pages dock their left menu
 * panel on their own routes; clicking such a section elsewhere opens the
 * panel as an overlay until a link is chosen (reference home.md §1.3).
 */
export function AppShell() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const collapsed = useUiStore((s) => s.panelCollapsed)
  const setCollapsed = useUiStore((s) => s.setPanelCollapsed)
  const [flyoutId, setFlyoutId] = useState<string | null>(null)
  const flyoutRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLDivElement>(null)

  const current = railItemForPath(pathname)
  const docked = current?.panel ? current : undefined
  const flyout = RAIL_ITEMS.find((item) => item.id === flyoutId)

  const closeFlyout = useCallback(() => setFlyoutId(null), [])
  useDismiss([flyoutRef, railRef], flyoutId !== null, closeFlyout)
  useEffect(() => closeFlyout(), [pathname, closeFlyout])

  const onPanelItem = (item: RailItem) => {
    if (docked?.id === item.id) {
      setCollapsed(!collapsed)
      setFlyoutId(null)
    } else {
      setFlyoutId((id) => (id === item.id ? null : item.id))
    }
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="relative flex min-h-0 flex-1">
        <div ref={railRef} className="flex">
          <Rail flyoutId={flyoutId} onPanelItem={onPanelItem} />
        </div>
        {docked && !collapsed && <SectionPanel item={docked} onCollapse={() => setCollapsed(true)} />}
        <main id="main" className="relative min-w-0 flex-1 overflow-y-auto">
          {docked && collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              aria-label={t('nav.expandPanel')}
              className="absolute left-3 top-5 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-sm hover:bg-sunken"
            >
              <ChevronRight size={16} aria-hidden />
            </button>
          )}
          <Outlet />
        </main>
        {flyout?.panel && (
          <div ref={flyoutRef} className="absolute bottom-0 left-rail top-0 z-30 shadow-lg" data-testid="section-flyout">
            <SectionPanel item={flyout} onCollapse={closeFlyout} onNavigate={closeFlyout} />
          </div>
        )}
      </div>
      <DrawerHost />
      <Toaster />
    </div>
  )
}

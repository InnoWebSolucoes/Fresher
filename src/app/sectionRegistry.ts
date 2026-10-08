import type { ComponentType } from 'react'
import type { PageDef } from './routeRegistry'

/**
 * Collects what each section in src/sections/<name>/ registers, so sections
 * never edit shared files:
 * - pages.tsx   → `pages`: page id → component
 * - drawers.tsx → `drawers`: drawer name → { component, width }
 * - routes.ts   → `routes`: extra PageDef entries
 * - en.json     → strings under the top-level key <name> (t('<name>.key'))
 */
export interface DrawerProps {
  /** Value of the `id` search param. */
  id: string | null
  /** All drawer search params (tab, id, d_* extras). */
  params: URLSearchParams
  close: () => void
}

export interface DrawerDef {
  component: ComponentType<DrawerProps>
  /** Panel width in px (reference: 481 filters, 613 sale, 800 appointment, 1027 client, 1249 checkout). */
  width?: number
  /** Render without the standard header (component draws its own). */
  bare?: boolean
}

const pageModules = import.meta.glob<{ pages: Record<string, ComponentType> }>('../sections/*/pages.tsx', { eager: true })
const drawerModules = import.meta.glob<{ drawers: Record<string, DrawerDef> }>('../sections/*/drawers.tsx', { eager: true })
const routeModules = import.meta.glob<{ routes: PageDef[] }>('../sections/*/routes.ts', { eager: true })
const localeModules = import.meta.glob<{ default: Record<string, unknown> }>('../sections/*/en.json', { eager: true })

const sectionName = (path: string) => path.split('/')[2]

export const SECTION_PAGES: Record<string, ComponentType> = Object.assign({}, ...Object.values(pageModules).map((m) => m.pages ?? {}))
export const SECTION_DRAWERS: Record<string, DrawerDef> = Object.assign({}, ...Object.values(drawerModules).map((m) => m.drawers ?? {}))
export const SECTION_ROUTES: PageDef[] = Object.values(routeModules).flatMap((m) => m.routes ?? [])
export const SECTION_LOCALES: Record<string, unknown> = Object.fromEntries(
  Object.entries(localeModules)
    .map(([path, m]) => [sectionName(path), m.default] as const)
    .filter(([, value]) => value && Object.keys(value).length > 0),
)

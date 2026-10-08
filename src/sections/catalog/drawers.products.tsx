import type { DrawerDef } from '@/app/sectionRegistry'
import { ProductDrawer } from './products/ProductDrawer'
import { CATALOG_DRAWER_WIDTH } from './ui'

/** Product drawer `?drawer=product&id=…` (catalog.md §4). */
export const drawers: Record<string, DrawerDef> = {
  product: { component: ProductDrawer, width: CATALOG_DRAWER_WIDTH },
}

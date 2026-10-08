import type { DrawerDef } from '@/app/sectionRegistry'
import { ProductDrawer } from './products/ProductDrawer'

/** Product drawer `?drawer=product&id=…` (catalog.md §4). */
export const drawers: Record<string, DrawerDef> = {
  product: { component: ProductDrawer, width: 720 },
}

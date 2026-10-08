import type { DrawerDef } from '@/app/sectionRegistry'
import { StockOrderDrawer } from './inventory/StockOrderDrawer'
import { SupplierDrawer } from './inventory/SupplierDrawer'
import { CATALOG_DRAWER_WIDTH } from './ui'

/** Inventory drawers (catalog.md §6–§7). */
export const drawers: Record<string, DrawerDef> = {
  'stock-order': { component: StockOrderDrawer, width: CATALOG_DRAWER_WIDTH },
  supplier: { component: SupplierDrawer, width: CATALOG_DRAWER_WIDTH },
}

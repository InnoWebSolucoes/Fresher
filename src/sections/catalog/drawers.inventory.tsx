import type { DrawerDef } from '@/app/sectionRegistry'
import { StockOrderDrawer } from './inventory/StockOrderDrawer'
import { SupplierDrawer } from './inventory/SupplierDrawer'

/** Inventory drawers (catalog.md §6–§7). */
export const drawers: Record<string, DrawerDef> = {
  'stock-order': { component: StockOrderDrawer, width: 720 },
  supplier: { component: SupplierDrawer, width: 720 },
}

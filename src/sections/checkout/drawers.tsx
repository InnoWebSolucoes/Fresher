import type { DrawerDef } from '@/app/sectionRegistry'
import { CheckoutDrawer } from './CheckoutDrawer'
import { SaleDrawer } from './SaleDrawer'
import { GiftCardDrawer } from './GiftCardDrawer'

/** Drawers this section owns, keyed by drawer name (opened with useDrawer().open(name, params)). */
export const drawers: Record<string, DrawerDef> = {
  checkout: { component: CheckoutDrawer, width: 1249 },
  sale: { component: SaleDrawer, width: 613 },
  'gift-card': { component: GiftCardDrawer, width: 481 },
}

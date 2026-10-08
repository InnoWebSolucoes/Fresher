import type { DrawerDef } from '@/app/sectionRegistry'
import { CheckoutDrawer } from './CheckoutDrawer'
import { SaleDrawer } from './SaleDrawer'
import { GiftCardDrawer } from './GiftCardDrawer'

/** Drawers this section owns, keyed by drawer name (opened with useDrawer().open(name, params)). */
export const drawers: Record<string, DrawerDef> = {
  checkout: { component: CheckoutDrawer, width: 1249, bare: true },
  sale: { component: SaleDrawer, width: 613, bare: true },
  'gift-card': { component: GiftCardDrawer, width: 481, bare: true },
}

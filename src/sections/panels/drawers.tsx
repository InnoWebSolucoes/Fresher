import type { DrawerDef } from '@/app/sectionRegistry'
import { ResourcesDrawer } from './resources/ResourcesDrawer'
import { SearchDialog } from './SearchDialog'
import { PerformanceInsights } from './PerformanceInsights'
import { NotificationsDrawer } from './NotificationsDrawer'
import { WalletDrawer } from './WalletDrawer'
import { ReferralDrawer } from './ReferralDrawer'

/** Top-bar panels (top-bar.md, help.md, profile-and-personal-settings.md §7). */
export const drawers: Record<string, DrawerDef> = {
  resources: { component: ResourcesDrawer, width: 520, bare: true },
  // The search is a centred dialog: it renders its own overlay, the host panel stays empty.
  search: { component: SearchDialog, width: 0, bare: true },
  'performance-insights': { component: PerformanceInsights, width: 480, bare: true },
  notifications: { component: NotificationsDrawer, width: 480, bare: true },
  wallet: { component: WalletDrawer, width: 800, bare: true },
  referral: { component: ReferralDrawer, width: 480, bare: true },
}

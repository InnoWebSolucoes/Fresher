import type { DrawerDef } from '@/app/sectionRegistry'
import { ClientDrawer } from './drawer/ClientDrawer'

/** Drawers this section owns, keyed by drawer name (opened with useDrawer().open(name, params)). */
export const drawers: Record<string, DrawerDef> = {
  client: { component: ClientDrawer, width: 1027 },
}

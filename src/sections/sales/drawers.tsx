import type { DrawerDef } from '@/app/sectionRegistry'
import { RegisterPeriodDrawer } from './register/RegisterPeriodDrawer'

/** Drawers this section owns, keyed by drawer name (opened with useDrawer().open(name, params)). */
export const drawers: Record<string, DrawerDef> = {
  'register-period': { component: RegisterPeriodDrawer, width: 833, bare: true },
}

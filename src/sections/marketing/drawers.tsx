import type { DrawerDef } from '@/app/sectionRegistry'

/** Drawers this section owns, keyed by drawer name (opened with useDrawer().open(name, params)). */
export const drawers: Record<string, DrawerDef> = {}

import type { DrawerDef } from '@/app/sectionRegistry'
import { AppointmentDrawer, NewAppointmentDrawer } from './drawers/AppointmentDrawers'
import { BlockedTimeDrawer, FiltersDrawer, GroupDrawer, SettingsDrawer, WaitlistDrawer } from './drawers/SimpleDrawers'

/** Drawers this section owns, keyed by drawer name (opened with useDrawer().open(name, params)). */
export const drawers: Record<string, DrawerDef> = {
  appointment: { component: AppointmentDrawer, width: 800 },
  'new-appointment': { component: NewAppointmentDrawer, width: 800 },
  'visibility-filters': { component: FiltersDrawer, width: 481 },
  'calendar-settings': { component: SettingsDrawer, width: 481 },
  waitlist: { component: WaitlistDrawer, width: 481 },
  'appointment-group': { component: GroupDrawer, width: 481 },
  'blocked-time': { component: BlockedTimeDrawer, width: 481 },
}

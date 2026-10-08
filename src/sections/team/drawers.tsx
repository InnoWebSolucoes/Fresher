import type { DrawerDef } from '@/app/sectionRegistry'
import { TeamMemberDrawer } from './drawers/TeamMemberDrawer'
import { AddTimesheetDrawer, TimesheetDrawer } from './drawers/TimesheetDrawers'

/** Drawers this section owns, keyed by drawer name (opened with useDrawer().open(name, params)). */
export const drawers: Record<string, DrawerDef> = {
  'team-member': { component: TeamMemberDrawer, width: 1000 },
  timesheet: { component: TimesheetDrawer, width: 640 },
  'add-timesheet': { component: AddTimesheetDrawer, width: 480 },
}

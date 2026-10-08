import type { ComponentType } from 'react'
import { BlockedTimeTypesPage } from './BlockedTimeTypesPage'
import { ResourcesPage } from './ResourcesPage'
import { TimeCalendarPage } from './TimeCalendarPage'
import { WaitlistPage } from './WaitlistPage'

/** Page components of this settings group, keyed by page id (src/app/routeRegistry.ts). */
export const schedulingPages: Record<string, ComponentType> = {
  settingsTimeCalendar: TimeCalendarPage,
  settingsWaitlist: WaitlistPage,
  settingsBlockedTimeTypes: BlockedTimeTypesPage,
  settingsResources: ResourcesPage,
}

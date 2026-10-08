import type { ComponentType } from 'react'
import { AcceptInvitePage } from './pages/AcceptInvitePage'
import { CalendarSyncPage } from './pages/CalendarSyncPage'
import { MemberFormPage } from './pages/MemberFormPage'
import { PayPeriodsPage, SettlementsPage } from './pages/PayRunsPage'
import { PayRunWizardPage } from './pages/PayRunWizardPage'
import { RepeatingShiftsPage } from './pages/RepeatingShiftsPage'
import { ReorderPage } from './pages/ReorderPage'
import { ScheduledShiftsPage } from './pages/ScheduledShiftsPage'
import { TeamMembersPage } from './pages/TeamMembersPage'
import { TimesheetsPage } from './pages/TimesheetsPage'

/** Page components for this section, keyed by page id from src/app/routeRegistry.ts or ./routes.ts. */
export const pages: Record<string, ComponentType> = {
  teamMembers: TeamMembersPage,
  teamMemberAdd: MemberFormPage,
  teamMemberEdit: MemberFormPage,
  teamReorder: ReorderPage,
  calendarSync: CalendarSyncPage,
  scheduledShifts: ScheduledShiftsPage,
  repeatingShifts: RepeatingShiftsPage,
  timesheets: TimesheetsPage,
  payRuns: PayPeriodsPage,
  settlements: SettlementsPage,
  payRunNew: PayRunWizardPage,
  acceptInvite: AcceptInvitePage,
}

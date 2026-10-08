import type { ComponentType } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { CalendarPage } from './CalendarPage'
import { FormSelectionPage } from './FormSelectionPage'

function WaitlistPick() {
  const { id = '' } = useParams()
  return <CalendarPage pick={{ kind: 'waitlist', entryId: id }} />
}
function ReschedulePick() {
  const { id = '' } = useParams()
  return <CalendarPage pick={{ kind: 'reschedule', appointmentId: id }} />
}
function RebookPick() {
  const { id = '' } = useParams()
  return <CalendarPage pick={{ kind: 'rebook', appointmentId: id }} />
}
function GroupNewPick() {
  const [params] = useSearchParams()
  return <CalendarPage pick={{ kind: 'group', groupId: params.get('group_id') || 'new' }} />
}
function AddToGroupPick() {
  const { groupId = 'new' } = useParams()
  const [params] = useSearchParams()
  return <CalendarPage pick={{ kind: 'add-to-group', groupId, sourceId: params.get('source') || undefined }} />
}

/** Page components for this section, keyed by page id from src/app/routeRegistry.ts or ./routes.ts. */
export const pages: Record<string, ComponentType> = {
  calendar: () => <CalendarPage />,
  calendarPick: () => <CalendarPage pick={{ kind: 'book' }} />,
  calendarBookWaitlist: WaitlistPick,
  calendarReschedule: ReschedulePick,
  calendarRebook: RebookPick,
  calendarGroupNew: GroupNewPick,
  calendarAddToGroup: AddToGroupPick,
  calendarBlockedTime: () => <CalendarPage pick={{ kind: 'blocked' }} />,
  formSelection: FormSelectionPage,
}

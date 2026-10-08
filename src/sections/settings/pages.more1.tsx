import type { ComponentType } from 'react'
import { ResourceEditPage } from './more1/ResourceEditPage'
import { AppointmentStatusesPage, CancellationReasonsPage, ClosedPeriodsPage } from './more1/SchedulingLists'
import { AvailabilityPage, BookingOptionsPage, DynamicAssignmentPage } from './more1/OnlineBooking'
import { ClientConnectPage, ClientSourcesPage, ClientTagsPage } from './more1/ClientsPages'
import { CardTerminalsPage, PaymentMethodsPage, PaymentPolicyPage } from './more1/PaymentsPages'

/** Settings › Scheduling (rest), Clients and Payments pages (reference settings-scheduling/clients/payments.md). */
export const pages: Record<string, ComponentType> = {
  settingsResourceEdit: ResourceEditPage,
  settingsCancellationReasons: CancellationReasonsPage,
  settingsAppointmentStatuses: AppointmentStatusesPage,
  settingsClosedPeriods: ClosedPeriodsPage,
  settingsDynamicAssignment: DynamicAssignmentPage,
  settingsAvailability: AvailabilityPage,
  settingsBookingOptions: BookingOptionsPage,
  settingsClientSources: ClientSourcesPage,
  settingsClientTags: ClientTagsPage,
  settingsClientConnect: ClientConnectPage,
  settingsPaymentPolicy: PaymentPolicyPage,
  settingsPaymentMethods: PaymentMethodsPage,
  settingsCardTerminals: CardTerminalsPage,
}

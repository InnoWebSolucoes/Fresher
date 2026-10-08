import type { ComponentType } from 'react'
import { FormCreatePage, FormEditPage } from './more2/FormBuilderPage'
import { FormDetailsPage, FormPreviewPage } from './more2/FormDetailsPage'
import { PermissionAddPage } from './more2/PermissionAddPage'
import { PermissionRolesPage } from './more2/PermissionRolesPage'
import { PinSwitchingPage, PinSwitchingSetupPage } from './more2/PinSwitchingPages'
import { CommissionsSettingsPage, PayRunsSettingsPage, ShiftsSettingsPage, TimesheetsSettingsPage } from './more2/TeamSettingsPages'
import { TimeOffTypesPage } from './more2/TimeOffTypesPage'

/** Settings › Team and Settings › Forms pages (reference/settings-team.md, settings-forms.md). */
export const pages: Record<string, ComponentType> = {
  settingsPermissions: PermissionRolesPage,
  settingsPermissionAdd: PermissionAddPage,
  settingsTimeOff: TimeOffTypesPage,
  settingsTimesheets: TimesheetsSettingsPage,
  settingsShifts: ShiftsSettingsPage,
  settingsPayRuns: PayRunsSettingsPage,
  settingsCommissions: CommissionsSettingsPage,
  settingsPinSwitching: PinSwitchingPage,
  settingsPinSwitchingSetup: PinSwitchingSetupPage,
  settingsFormCreate: FormCreatePage,
  settingsFormEdit: FormEditPage,
  settingsFormDetails: FormDetailsPage,
  settingsFormPreview: FormPreviewPage,
}

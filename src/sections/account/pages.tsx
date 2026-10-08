import type { ComponentType } from 'react'
import { AccountPayRunsPage, AccountReviewsPage } from './ActivityPages'
import { MyProfileEditPage, MyProfilePage, PortfolioPage } from './ProfilePages'
import { AppearancePage, LoginSecurityPage, PersonalInfoPage, PersonalSettingsPage } from './SettingsPages'
import { WorkspaceSettingsPage, WorkspacesPage } from './WorkspacePages'

/** Page components for this section, keyed by page id from src/app/routeRegistry.ts or ./routes.ts. */
export const pages: Record<string, ComponentType> = {
  myProfile: MyProfilePage,
  myProfileEdit: MyProfileEditPage,
  portfolio: PortfolioPage,
  accountReviews: AccountReviewsPage,
  accountPayRuns: AccountPayRunsPage,
  workspaces: WorkspacesPage,
  workspaceSettings: WorkspaceSettingsPage,
  personalSettings: PersonalSettingsPage,
  personalInfo: PersonalInfoPage,
  loginSecurity: LoginSecurityPage,
  appearance: AppearancePage,
}

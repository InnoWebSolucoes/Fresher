import type { ComponentType } from 'react'
import { AddOnIntroPage } from './AddOnIntroPage'
import { AddOnManagePage } from './AddOnManagePage'
import { AddOnSetupPage } from './AddOnSetupPage'
import { AddOnsPage } from './AddOnsPage'
import { IntegrationIntroPage } from './IntegrationIntroPage'
import { PaymentsOnboardingPage } from './PaymentsOnboardingPage'

/** Page components for this section, keyed by page id from src/app/routeRegistry.ts or ./routes.ts. */
export const pages: Record<string, ComponentType> = {
  addons: AddOnsPage,
  addonIntro: AddOnIntroPage,
  addonSetup: AddOnSetupPage,
  addonManage: AddOnManagePage,
  integrationIntro: IntegrationIntroPage,
  paymentsOnboarding: PaymentsOnboardingPage,
}

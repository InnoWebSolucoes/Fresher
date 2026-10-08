import type { ComponentType } from 'react'
import { LinkBuilderPage } from './LinkBuilderPage'
import { FacebookSetupPage, MarketplaceProfilePage } from './MarketplacePages'
import { ProductStorePage } from './ProductStorePage'
import { ProfileDashboardPage } from './profile/ProfileDashboard'
import { ProfileWizardPage } from './profile/ProfileWizard'
import { SmartWebsitePage, SmartWebsiteWizardPage } from './website/SmartWebsite'

/** Page components for this section, keyed by page id from src/app/routeRegistry.ts or ./routes.ts. */
export const pages: Record<string, ComponentType> = {
  marketplaceProfile: MarketplaceProfilePage,
  profileWizard: ProfileWizardPage,
  profileDashboard: ProfileDashboardPage,
  facebookSetup: FacebookSetupPage,
  linkBuilder: LinkBuilderPage,
  smartWebsite: SmartWebsitePage,
  smartWebsiteWizard: SmartWebsiteWizardPage,
  productStore: ProductStorePage,
}

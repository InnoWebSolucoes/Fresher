import type { ComponentType } from 'react'
import { BlastCampaignsPage } from './pages/BlastCampaignsPage'
import { BlastBuilderPage } from './pages/BlastBuilderPage'
import { BlastDetailPage } from './pages/BlastDetailPage'
import { BlastBillingWizardPage } from './pages/BlastBillingWizardPage'
import { AutomationsPage } from './pages/AutomationsPage'
import { AutomationDetailPage } from './pages/AutomationDetailPage'
import { AutomationConfigurePage } from './pages/AutomationConfigurePage'
import { AutomationEmailPage } from './pages/AutomationEmailPage'
import { MessagesHistoryPage } from './pages/MessagesHistoryPage'
import { DealsIntroPage, DealsListPage } from './pages/DealsPages'
import { DealWizardPage } from './pages/DealWizardPage'
import { SmartPricingDetailsPage, SmartPricingIntroPage, SmartPricingSetupPage } from './pages/SmartPricingPages'

/** Page components for this section, keyed by page id from src/app/routeRegistry.ts or ./routes.ts. */
export const pages: Record<string, ComponentType> = {
  blastCampaigns: BlastCampaignsPage,
  blastBillingWizard: BlastBillingWizardPage,
  blastNew: BlastBuilderPage,
  blastEdit: BlastBuilderPage,
  blastDetail: BlastDetailPage,
  automations: AutomationsPage,
  automationDetail: AutomationDetailPage,
  automationConfigure: AutomationConfigurePage,
  automationEmail: AutomationEmailPage,
  messagesHistory: MessagesHistoryPage,
  deals: DealsIntroPage,
  dealsList: DealsListPage,
  dealNew: DealWizardPage,
  dealEdit: DealWizardPage,
  smartPricing: SmartPricingIntroPage,
  smartPricingSetup: SmartPricingSetupPage,
  smartPricingDetails: SmartPricingDetailsPage,
}

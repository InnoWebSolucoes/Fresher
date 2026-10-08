import type { ComponentType } from 'react'
import { PayNowPage } from './PayNowPage'
import { TaxRatesPage } from './TaxRatesPage'
import { ReceiptsPage } from './ReceiptsPage'
import { RegistersPage } from './RegistersPage'
import { TippingPage } from './TippingPage'
import { ServiceChargesPage } from './ServiceChargesPage'
import { GiftCardsPage } from './GiftCardsPage'
import { CheckoutMethodsPage } from './CheckoutMethodsPage'

/** Page components of this settings group, keyed by page id (src/app/routeRegistry.ts). */
export const salesPages: Record<string, ComponentType> = {
  settingsPayNow: PayNowPage,
  settingsTaxRates: TaxRatesPage,
  settingsReceipts: ReceiptsPage,
  settingsRegisters: RegistersPage,
  settingsTipping: TippingPage,
  settingsServiceCharges: ServiceChargesPage,
  settingsGiftCards: GiftCardsPage,
  settingsCheckoutMethods: CheckoutMethodsPage,
}

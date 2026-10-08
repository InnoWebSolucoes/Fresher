import type { ComponentType } from 'react'
import { BankAccountsPage, BillingDetailsPage, BillingPaymentMethodsPage, ChangePlanPage, CommunicationPage, InvoicesPage, SubscriptionsPage } from './pages'

/** Page components of this settings group, keyed by page id (src/app/routeRegistry.ts). */
export const billingPages: Record<string, ComponentType> = {
  billingDetails: BillingDetailsPage,
  billingBankAccounts: BankAccountsPage,
  billingPaymentMethods: BillingPaymentMethodsPage,
  billingCommunication: CommunicationPage,
  billingInvoices: InvoicesPage,
  billingSubscriptions: SubscriptionsPage,
  billingChangePlan: ChangePlanPage,
}

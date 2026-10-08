import type { ComponentType } from 'react'
import { DailySalesPage } from './daily/DailySalesPage'
import { RegisterPage } from './register/RegisterPage'
import { AppointmentsListPage } from './lists/AppointmentsListPage'
import { SalesListPage } from './lists/SalesListPage'
import { PaymentTransactionsPage } from './lists/PaymentTransactionsPage'
import { RefundSalePage } from './refund/RefundSalePage'
import { GiftCardsSoldPage } from './sold/GiftCardsSoldPage'
import { PackagesSoldPage } from './sold/PackagesSoldPage'
import { MembershipsSoldPage } from './sold/MembershipsSoldPage'
import { ProductOrdersPage } from './sold/ProductOrdersPage'

/** Page components for this section, keyed by page id from src/app/routeRegistry.ts or ./routes.ts. */
export const pages: Record<string, ComponentType> = {
  dailySales: DailySalesPage,
  register: RegisterPage,
  appointmentsList: AppointmentsListPage,
  salesList: SalesListPage,
  refundSale: RefundSalePage,
  paymentTransactions: PaymentTransactionsPage,
  giftCardsSold: GiftCardsSoldPage,
  packagesSold: PackagesSoldPage,
  membershipsSold: MembershipsSoldPage,
  productOrders: ProductOrdersPage,
}

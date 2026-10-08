import type { ComponentType } from 'react'
import { PaymentsProcessingPage } from './PaymentsPage'

/** Page components for this section, keyed by page id from src/app/routeRegistry.ts or ./routes.ts. */
export const pages: Record<string, ComponentType> = {
  paymentsProcessing: PaymentsProcessingPage,
}

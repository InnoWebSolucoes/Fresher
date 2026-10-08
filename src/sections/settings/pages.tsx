import type { ComponentType } from 'react'
import { businessPages } from './business'
import { schedulingPages } from './scheduling'
import { salesPages } from './sales'
import { clientsPages } from './clients'
import { teamPages } from './team'
import { formsPages } from './forms'
import { paymentsPages } from './payments'
import { billingPages } from './billing'

/** Page components for this section, keyed by page id from src/app/routeRegistry.ts or ./routes.ts. */
export const pages: Record<string, ComponentType> = {
  ...businessPages,
  ...schedulingPages,
  ...salesPages,
  ...clientsPages,
  ...teamPages,
  ...formsPages,
  ...paymentsPages,
  ...billingPages,
}

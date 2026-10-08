import type { ComponentType } from 'react'
import { ClientImportPage } from './more/ImportPage'
import { ClientMergePage } from './more/MergePage'
import { ClientLoyaltyPage } from './more/LoyaltyPage'
import { OnlineReputationPage } from './more/ReputationPage'

/** Import wizard, merge, loyalty and online reputation pages (ids from src/app/routeRegistry.ts). */
export const pages: Record<string, ComponentType> = {
  clientImport: ClientImportPage,
  clientMerge: ClientMergePage,
  clientLoyalty: ClientLoyaltyPage,
  onlineReputation: OnlineReputationPage,
}

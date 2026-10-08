import type { ComponentType } from 'react'
import { DataConnectorPage } from './DataConnectorPage'
import { ReportGroupPage } from './landing/ReportGroupPage'
import { ReportTablePage } from './ReportTablePage'

/** Page components for this section, keyed by page id from src/app/routeRegistry.ts or ./routes.ts. */
export const pages: Record<string, ComponentType> = {
  reportGroup: ReportGroupPage,
  reportTable: ReportTablePage,
  dataConnector: DataConnectorPage,
}

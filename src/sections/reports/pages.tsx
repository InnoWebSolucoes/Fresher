import type { ComponentType } from 'react'
import { ReportGroupPage } from '@/pages/reports/ReportGroupPage'
import { DataConnectorPage } from './DataConnectorPage'
import { ReportTablePage } from './ReportTablePage'

/** Page components for this section, keyed by page id from src/app/routeRegistry.ts or ./routes.ts. */
export const pages: Record<string, ComponentType> = {
  reportGroup: ReportGroupPage,
  reportTable: ReportTablePage,
  dataConnector: DataConnectorPage,
}

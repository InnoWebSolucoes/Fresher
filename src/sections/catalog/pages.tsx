import type { ComponentType } from 'react'
import { ServiceMenuPage } from './services/ServiceMenuPage'
import { ServiceEditorPage } from './services/ServiceEditorPage'
import { BundleEditorPage } from './services/BundleEditorPage'
import { BookingSequencePage, MenuOrderPage } from './services/MenuOrderPage'
import { BulkEditPage } from './services/BulkEditPage'
import { PackagesPage } from './packages/PackagesPage'
import { PackageEditorPage } from './packages/PackageEditorPage'

/** Page components for this section, keyed by page id from src/app/routeRegistry.ts or ./routes.ts. */
export const pages: Record<string, ComponentType> = {
  serviceMenu: ServiceMenuPage,
  serviceAdd: ServiceEditorPage,
  serviceEdit: ServiceEditorPage,
  bundleAdd: BundleEditorPage,
  bundleEdit: BundleEditorPage,
  menuOrder: MenuOrderPage,
  bookingSequence: BookingSequencePage,
  bulkEditServices: BulkEditPage,
  packages: PackagesPage,
  packageAdd: PackageEditorPage,
  packageEdit: PackageEditorPage,
}

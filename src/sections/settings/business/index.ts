import type { ComponentType } from 'react'
import { LandingPage } from './LandingPage'
import { BusinessDetailsPage } from './BusinessDetailsPage'
import { BusinessDetailsEditPage } from './BusinessDetailsEditPage'
import { LocationsPage } from './LocationsPage'
import { LocationNewPage } from './LocationNewPage'
import { LocationPage } from './LocationPage'

/** Page components of this settings group, keyed by page id (src/app/routeRegistry.ts). */
export const businessPages: Record<string, ComponentType> = {
  setup: LandingPage,
  settingsBusinessDetails: BusinessDetailsPage,
  settingsBusinessDetailsEdit: BusinessDetailsEditPage,
  settingsLocations: LocationsPage,
  settingsLocationNew: LocationNewPage,
  settingsLocation: LocationPage,
}

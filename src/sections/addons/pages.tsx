import type { ComponentType } from 'react'
import { AddOnsPage } from './AddOnsPage'

/** Page components for this section, keyed by page id from src/app/routeRegistry.ts or ./routes.ts. */
export const pages: Record<string, ComponentType> = {
  addons: AddOnsPage,
}

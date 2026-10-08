import type { ComponentType } from 'react'
import { HomePage } from './HomePage'

/** Page components for this section, keyed by page id from src/app/routeRegistry.ts or ./routes.ts. */
export const pages: Record<string, ComponentType> = {
  home: HomePage,
}

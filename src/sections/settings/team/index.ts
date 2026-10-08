import type { ComponentType } from 'react'
import { PermissionEditPage } from './PermissionEditPage'

/** Page components of this settings group, keyed by page id (src/app/routeRegistry.ts). */
export const teamPages: Record<string, ComponentType> = {
  settingsPermissionEdit: PermissionEditPage,
}

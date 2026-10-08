import type { ComponentType } from 'react'
import { FormTemplatesPage } from './FormTemplatesPage'

/** Page components of this settings group, keyed by page id (src/app/routeRegistry.ts). */
export const formsPages: Record<string, ComponentType> = {
  settingsFormTemplates: FormTemplatesPage,
}

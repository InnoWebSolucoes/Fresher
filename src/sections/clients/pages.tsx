import type { ComponentType } from 'react'
import { ClientsListPage } from './pages/ClientsListPage'
import { ClientFormPage } from './pages/ClientFormPage'

/** Page components for this section, keyed by page id from src/app/routeRegistry.ts or ./routes.ts. */
export const pages: Record<string, ComponentType> = {
  clientsList: ClientsListPage,
  clientAdd: () => <ClientFormPage mode="add" />,
  clientEdit: () => <ClientFormPage mode="edit" />,
}

import type { PermissionLevel } from '@/types'

/**
 * Default permission roles (reference/settings-team.md §1). `permissions`
 * maps a permission area to its enabled permission keys; an area with the
 * key 'active' is switched on. The full matrix UI lives in the settings
 * section; src/lib/permissions.ts maps roles to visible sections.
 */
export function defaultPermissionRoles(): PermissionLevel[] {
  const areas = (list: string[]) => Object.fromEntries(list.map((a) => [a, ['active']]))
  return [
    { id: 'basic', name: 'Basic', description: 'Partial access to Calendar, Sales, and Reports.', system: false, order: 0, permissions: areas(['calendar', 'sales']) },
    { id: 'low', name: 'Low', description: 'Partial access to Calendar, Sales, Clients, Online profile, Marketing, Team, Reports, and Workspace.', system: false, order: 1, permissions: areas(['calendar', 'sales', 'clients', 'online_profile', 'team']) },
    { id: 'medium', name: 'Medium', description: 'Partial access to Calendar, Sales, Clients, Catalog, Online profile, Marketing, Team, Reports, and Workspace.', system: false, order: 2, permissions: areas(['calendar', 'sales', 'clients', 'catalog', 'online_profile', 'marketing', 'team', 'workspace']) },
    { id: 'high', name: 'High', description: 'Full access to Clients, Online profile, Marketing, and Workspace. Partial access to Calendar, Sales, Catalog, Team, Reports, and Payments and wallet.', system: false, order: 3, permissions: areas(['calendar', 'sales', 'clients', 'catalog', 'online_profile', 'marketing', 'team', 'reports', 'payments_wallet', 'workspace']) },
    { id: 'owner', name: 'Workspace owner', description: 'Full access to all areas.', system: true, order: 4, permissions: areas(['calendar', 'sales', 'clients', 'catalog', 'online_profile', 'marketing', 'team', 'reports', 'payments_wallet', 'workspace']) },
    { id: 'none', name: 'No access', description: 'No access to workspace features.', system: true, order: 5, permissions: {} },
  ]
}

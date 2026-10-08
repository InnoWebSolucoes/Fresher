export type SectionId =
  | 'home'
  | 'calendar'
  | 'sales'
  | 'clients'
  | 'catalog'
  | 'online'
  | 'marketing'
  | 'team'
  | 'reports'
  | 'addons'
  | 'settings'
  | 'account'
  | 'connect'

/** Permission roles from reference/settings-team.md §1. */
export type PermissionRole = 'owner' | 'high' | 'medium' | 'low' | 'basic' | 'none'

/**
 * Which top-level sections each role can open. Phase 5 replaces this with the
 * editable permission matrix; until then it follows the role descriptions in
 * settings-team.md and SPEC §8 (staff don't see Reports, Marketing or Settings
 * unless their level allows it).
 */
const ROLE_SECTIONS: Record<PermissionRole, SectionId[]> = {
  owner: ['home', 'calendar', 'sales', 'clients', 'catalog', 'online', 'marketing', 'team', 'reports', 'addons', 'settings', 'account', 'connect'],
  high: ['home', 'calendar', 'sales', 'clients', 'catalog', 'online', 'marketing', 'team', 'reports', 'settings', 'account', 'connect'],
  medium: ['calendar', 'sales', 'clients', 'catalog', 'online', 'marketing', 'team', 'account', 'connect'],
  low: ['calendar', 'sales', 'clients', 'online', 'team', 'account', 'connect'],
  basic: ['calendar', 'sales', 'account'],
  none: [],
}

export function canAccess(role: PermissionRole, section: SectionId): boolean {
  // Custom roles created in Settings fall back to Medium access.
  return (ROLE_SECTIONS[role] ?? ROLE_SECTIONS.medium).includes(section)
}

/** Where a user lands after login: Home when allowed, otherwise the calendar. */
export function landingPath(role: PermissionRole): string {
  return canAccess(role, 'home') ? '/dashboard' : '/calendar'
}

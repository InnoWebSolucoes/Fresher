import type { PageDef } from '@/app/routeRegistry'

/** Membership editor routes (memberships list is in src/app/routeRegistry.ts). */
export const routes: PageDef[] = [
  { id: 'membershipAdd', path: '/catalogue/memberships/add', section: 'catalog', phase: 3, layout: 'full', ref: 'SPEC' },
  { id: 'membershipEdit', path: '/catalogue/memberships/edit/:id', section: 'catalog', phase: 3, layout: 'full', ref: 'SPEC' },
]

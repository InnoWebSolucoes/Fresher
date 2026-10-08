import type { PageDef } from '@/app/routeRegistry'

/** Extra routes this section adds beyond src/app/routeRegistry.ts. Give each a component in ./pages.tsx. */
export const routes: PageDef[] = [
  { id: 'blastEdit', path: '/marketing/blast-campaigns/:id/edit', section: 'marketing', phase: 4, layout: 'full', ref: 'SPEC §4 (campaign builder)' },
  { id: 'dealEdit', path: '/marketing/deals/edit/:id/:step', section: 'marketing', phase: 4, layout: 'full', ref: 'marketing.md §4' },
]

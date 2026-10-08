import type { PageDef } from '@/app/routeRegistry'

/** Extra routes this section adds beyond src/app/routeRegistry.ts. Give each a component in ./pages.tsx. */
export const routes: PageDef[] = [{ id: 'acceptInvite', path: '/invite/:token', section: 'team', phase: 4, layout: 'public', ref: 'SPEC §8' }]

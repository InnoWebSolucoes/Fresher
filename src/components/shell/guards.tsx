import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useCurrentUser } from '@/store/session'
import { canAccess, landingPath, usePermissionRoles, type SectionId } from '@/lib/permissions'
import { ForbiddenPage } from '@/pages/ForbiddenPage'

/** Protected routes: anyone not logged in goes to /login and comes back after. */
export function RequireAuth() {
  const user = useCurrentUser()
  const location = useLocation()
  if (!user) {
    const next = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to={`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} replace />
  }
  return <Outlet />
}

export function RequireSection({ section, children }: { section: SectionId; children: ReactNode }) {
  const user = useCurrentUser()
  usePermissionRoles()
  if (!user || !canAccess(user.role, section)) return <ForbiddenPage />
  return <>{children}</>
}

/** `/` sends each role to its landing page (Home for owners, Calendar for front desk). */
export function RoleLanding() {
  const user = useCurrentUser()
  return <Navigate to={user ? landingPath(user.role) : '/login'} replace />
}

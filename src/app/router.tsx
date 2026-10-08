import { Navigate, createBrowserRouter, type RouteObject } from 'react-router-dom'
import { AppShell } from '@/components/shell/AppShell'
import { FullscreenLayout } from '@/components/shell/FullscreenLayout'
import { AccountLayout } from '@/components/shell/AccountLayout'
import { SettingsLayout } from '@/components/shell/SettingsLayout'
import { RequireAuth, RequireSection, RoleLanding } from '@/components/shell/guards'
import { LoginPage } from '@/pages/auth/LoginPage'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { StubPage } from '@/pages/StubPage'
import { SettingsLandingPage } from '@/pages/settings/SettingsLandingPage'
import { ReportGroupPage } from '@/pages/reports/ReportGroupPage'
import { PAGES, REDIRECTS, type PageDef, type PageLayout } from './routeRegistry'
import { SECTION_PAGES, SECTION_ROUTES } from './sectionRegistry'

/** Pages that already render more than the generic stub in Phase 0. */
const CUSTOM: Record<string, () => JSX.Element> = {
  setup: () => <SettingsLandingPage />,
  reportGroup: () => <ReportGroupPage />,
}

function toRoute(page: PageDef): RouteObject {
  const SectionPage = SECTION_PAGES[page.id]
  const element = SectionPage ? <SectionPage /> : (CUSTOM[page.id]?.() ?? <StubPage page={page} />)
  return {
    path: page.path,
    element: <RequireSection section={page.section}>{element}</RequireSection>,
  }
}

const ALL_PAGES = [...PAGES, ...SECTION_ROUTES]
const byLayout = (layout: PageLayout) => ALL_PAGES.filter((page) => page.layout === layout).map(toRoute)

const redirects: RouteObject[] = REDIRECTS.map((r) => ({ path: r.from, element: <Navigate to={r.to} replace /> }))

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/', element: <RoleLanding /> },
      ...redirects,
      {
        element: <AppShell />,
        children: [
          ...byLayout('shell'),
          { element: <SettingsLayout />, children: byLayout('settings') },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      { element: <FullscreenLayout />, children: byLayout('full') },
      { element: <AccountLayout />, children: byLayout('account') },
    ],
  },
]

export const router = createBrowserRouter(routes, {
  future: {
    v7_relativeSplatPath: true,
    v7_fetcherPersist: true,
    v7_normalizeFormMethod: true,
    v7_partialHydration: true,
    v7_skipActionErrorRevalidation: true,
  },
})

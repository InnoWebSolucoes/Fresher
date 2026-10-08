import { Navigate, Outlet, createBrowserRouter, type RouteObject } from 'react-router-dom'
import { DemoPanel } from '@/sections/demo/DemoPanel'
import { ErrorPage } from '@/pages/ErrorPage'
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
import { PAGES, REDIRECTS, type PageDef, type PageLayout } from './routeRegistry'
import { SECTION_PAGES, SECTION_ROUTES } from './sectionRegistry'

function toRoute(page: PageDef): RouteObject {
  const SectionPage = SECTION_PAGES[page.id]
  const element = SectionPage ? <SectionPage /> : <StubPage page={page} />
  return {
    path: page.path,
    element: <RequireSection section={page.section}>{element}</RequireSection>,
  }
}

const ALL_PAGES = [...PAGES, ...SECTION_ROUTES]
const byLayout = (layout: PageLayout) => ALL_PAGES.filter((page) => page.layout === layout).map(toRoute)

const redirects: RouteObject[] = REDIRECTS.map((r) => ({ path: r.from, element: <Navigate to={r.to} replace /> }))

function RootLayout() {
  return (
    <>
      <Outlet />
      <DemoPanel />
    </>
  )
}

const appRoutes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  ...ALL_PAGES.filter((page) => page.layout === 'public').map((page) => {
    const Page = SECTION_PAGES[page.id]
    return { path: page.path, element: Page ? <Page /> : <StubPage page={page} /> }
  }),
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

export const routes: RouteObject[] = [{ element: <RootLayout />, errorElement: <ErrorPage />, children: appRoutes }]

/** "/" in development; "/bookings" when built for innoweb.agency/bookings (vite build --base). */
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

export const router = createBrowserRouter(routes, {
  basename,
  future: {
    v7_relativeSplatPath: true,
    v7_fetcherPersist: true,
    v7_normalizeFormMethod: true,
    v7_partialHydration: true,
    v7_skipActionErrorRevalidation: true,
  },
})

import { Outlet } from 'react-router-dom'
import { DrawerHost } from './DrawerHost'
import { Toaster } from './Toaster'

/** Full-screen forms and wizards: no rail, each page renders its own header. Drawers still open over them. */
export function FullscreenLayout() {
  return (
    <div className="flex h-full flex-col bg-canvas">
      <Outlet />
      <DrawerHost />
      <Toaster />
    </div>
  )
}

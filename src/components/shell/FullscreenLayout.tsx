import { Outlet } from 'react-router-dom'
import { Toaster } from './Toaster'

/** Full-screen forms and wizards: no rail, each page renders its own header. */
export function FullscreenLayout() {
  return (
    <div className="flex h-full flex-col bg-canvas">
      <Outlet />
      <Toaster />
    </div>
  )
}

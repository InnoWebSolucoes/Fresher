import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import './i18n'
import './styles/index.css'
import { router } from './app/router'
import { applyTheme, useUiStore } from './store/ui'

applyTheme(useUiStore.getState().theme)
useUiStore.subscribe((state) => applyTheme(state.theme))
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(useUiStore.getState().theme))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} future={{ v7_startTransition: true }} />
  </StrictMode>,
)

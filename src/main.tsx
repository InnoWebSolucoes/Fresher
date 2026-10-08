import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import './i18n'
import './styles/index.css'
import { router } from './app/router'
import { DataGate } from './app/DataGate'
import { applyTheme, useUiStore } from './store/ui'
import { useLang } from './i18n/language'

applyTheme(useUiStore.getState().theme)
useUiStore.subscribe((state) => applyTheme(state.theme))
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(useUiStore.getState().theme))

/** Switching language re-mounts the pages so every date, amount and label is redrawn (the URL, drawers and data stay). */
function App() {
  const lang = useLang()
  return (
    <DataGate>
      <RouterProvider key={lang} router={router} future={{ v7_startTransition: true }} />
    </DataGate>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

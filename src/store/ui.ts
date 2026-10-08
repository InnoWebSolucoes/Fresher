import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemePreference = 'light' | 'dark' | 'system'

interface UiState {
  /** Docked left menu panel collapsed (persists, SPEC §6). */
  panelCollapsed: boolean
  theme: ThemePreference
  /** Starred report slugs (reports.md §1.5). */
  favouriteReports: string[]
  toggleFavouriteReport: (slug: string) => void
  setPanelCollapsed: (collapsed: boolean) => void
  setTheme: (theme: ThemePreference) => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      panelCollapsed: false,
      theme: 'system',
      favouriteReports: [],
      toggleFavouriteReport: (slug) =>
        set((s) => ({
          favouriteReports: s.favouriteReports.includes(slug) ? s.favouriteReports.filter((x) => x !== slug) : [...s.favouriteReports, slug],
        })),
      setPanelCollapsed: (panelCollapsed) => set({ panelCollapsed }),
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'ib-ui', version: 1 },
  ),
)

export function applyTheme(theme: ThemePreference): void {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

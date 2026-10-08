import { useDb } from '@/store/db'

/** Raw slices used across the settings pages (select raw, derive with useMemo). */
export const useSettings = () => useDb((s) => s.settings)
export const useWorkspace = () => useDb((s) => s.workspace)
export const useLocations = () => useDb((s) => s.locations)
export const useTeamMembers = () => useDb((s) => s.teamMembers)

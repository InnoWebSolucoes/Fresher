import { readSettingsExtra, updateSettingsExtra, useSettingsExtra } from '@/api/settings'
import type { ID, Settings } from '@/types'
import type { MapView } from './shared'

/**
 * Per-location settings the shared Location type doesn't hold (stored in
 * settings.extras['biz.locationExtras'][locationId]).
 */
export interface LocationExtras {
  /** "I don't have a business address (mobile and online services only)". */
  noAddress?: boolean
  map?: MapView
  /** Tipping: workspace defaults or custom values for this location. */
  tipping?: { mode: 'workspace' | 'custom'; pos: boolean; terminal: boolean; online: boolean; values: number[]; include: Settings['tipping']['include'] }
  /** Tax defaults: workspace defaults or custom for this location. */
  taxDefaults?: { mode: 'workspace' | 'custom'; services: ID | null; products: ID | null; memberships: ID | null }
  /** Receipt details: business details source and note. */
  receipt?: { source: 'billing' | 'location' | 'custom'; companyName: string; address: string; note: string }
}

export const LOCATION_EXTRAS_KEY = 'biz.locationExtras'
const EMPTY: Record<ID, LocationExtras> = {}
const NONE: LocationExtras = {}

export function useAllLocationExtras(): Record<ID, LocationExtras> {
  return useSettingsExtra(LOCATION_EXTRAS_KEY, EMPTY)
}

export function useLocationExtras(id: ID): LocationExtras {
  return useAllLocationExtras()[id] ?? NONE
}

export function readLocationExtras(id: ID): LocationExtras {
  return readSettingsExtra(LOCATION_EXTRAS_KEY, EMPTY)[id] ?? NONE
}

export function saveLocationExtras(id: ID, patch: Partial<LocationExtras>): Promise<void> {
  return updateSettingsExtra(LOCATION_EXTRAS_KEY, EMPTY, (all) => ({ ...all, [id]: { ...(all[id] ?? {}), ...patch } }))
}

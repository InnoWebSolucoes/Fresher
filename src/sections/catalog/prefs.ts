import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { del, get, set } from 'idb-keyval'
import type { ExtraTime, ID } from '@/types'

/**
 * Catalog settings the shared data model has no field for yet (see the
 * section report): booking sequence, bundle menu positions, per-service
 * upselling switches, per-bundle extra time and bundle portfolio images.
 * Section-local, persisted to IndexedDB.
 */
export interface Upselling {
  service: boolean
  membership: boolean
  package: boolean
}

interface CatalogPrefs {
  bookingSequence: ID[]
  bundleOrder: Record<ID, number>
  upselling: Record<ID, Upselling>
  bundleExtraTime: Record<ID, Record<ID, ExtraTime[]>>
  bundleImages: Record<ID, string[]>
  setBookingSequence: (ids: ID[]) => void
  setBundleOrder: (order: Record<ID, number>) => void
  setUpselling: (serviceId: ID, value: Upselling) => void
  setBundleExtras: (bundleId: ID, extra: Record<ID, ExtraTime[]>, images: string[]) => void
}

const idbStorage: StateStorage = {
  getItem: async (name) => (await get<string>(name)) ?? null,
  setItem: async (name, value) => set(name, value),
  removeItem: async (name) => del(name),
}

export const DEFAULT_UPSELLING: Upselling = { service: false, membership: true, package: true }

export const useCatalogPrefs = create<CatalogPrefs>()(
  persist(
    (setState) => ({
      bookingSequence: [],
      bundleOrder: {},
      upselling: {},
      bundleExtraTime: {},
      bundleImages: {},
      setBookingSequence: (ids) => setState({ bookingSequence: ids }),
      setBundleOrder: (order) => setState((s) => ({ bundleOrder: { ...s.bundleOrder, ...order } })),
      setUpselling: (serviceId, value) => setState((s) => ({ upselling: { ...s.upselling, [serviceId]: value } })),
      setBundleExtras: (bundleId, extra, images) => setState((s) => ({ bundleExtraTime: { ...s.bundleExtraTime, [bundleId]: extra }, bundleImages: { ...s.bundleImages, [bundleId]: images } })),
    }),
    { name: 'ib-catalog-prefs', storage: createJSONStorage(() => (typeof indexedDB === 'undefined' ? localStorage : idbStorage)) },
  ),
)

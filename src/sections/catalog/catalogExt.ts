import type { ID } from '@/types'
import { readExt, useExt } from '@/api/ext'
import { CATALOG_EXT, DEFAULT_UPSELLING, type BundleExtras, type Upselling } from '@/api/catalog'

/**
 * Readers for the catalog settings kept in `db.ext.catalog` (see CatalogExt in
 * @/api/catalog): booking sequence, bundle menu positions, per-service
 * upselling switches, and per-bundle extra time and images. Writes go through
 * the catalog API (saveBookingSequence, saveMenuOrder, saveService, saveBundle).
 */
const NO_IDS: ID[] = []
const NO_ORDER: Record<ID, number> = {}
const NO_UPSELLING: Record<ID, Upselling> = {}
const NO_EXTRAS: Record<ID, BundleExtras> = {}
const EMPTY_EXTRAS: BundleExtras = { extraTime: {}, images: [] }

export const useBookingSequence = () => useExt<ID[]>(CATALOG_EXT, 'bookingSequence', NO_IDS)
export const useBundleOrder = () => useExt<Record<ID, number>>(CATALOG_EXT, 'bundleOrder', NO_ORDER)

/** Saved upselling switches of a service (defaults for a new one). */
export const readUpselling = (serviceId: ID | null | undefined): Upselling => (serviceId && readExt(CATALOG_EXT, 'upselling', NO_UPSELLING)[serviceId]) || DEFAULT_UPSELLING

/** Saved extra time overrides and images of a bundle (empty for a new one). */
export const readBundleExtras = (bundleId: ID | null | undefined): BundleExtras => (bundleId && readExt(CATALOG_EXT, 'bundleExtras', NO_EXTRAS)[bundleId]) || EMPTY_EXTRAS

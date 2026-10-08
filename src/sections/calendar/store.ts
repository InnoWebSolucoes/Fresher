import { create } from 'zustand'
import type { ExtraTime, ID, ISODate, RepeatRule, ServiceAddOn } from '@/types'
import { EMPTY_FILTERS, type CalendarFilters, type CalView } from './lib'

/** One service line while an appointment is being created or edited. */
export interface DraftItem {
  key: string
  /** Existing AppointmentItem id when editing. */
  itemId?: ID
  serviceId: ID
  variantId?: ID
  name: string
  /** null = Any team member. */
  teamMemberId: ID | null
  durationMin: number
  extraTime: ExtraTime[]
  price: number
  originalPrice?: number
  priceNote?: string
  dealId?: ID
  preferred: boolean
  addOns: ServiceAddOn[]
  resourceId?: ID
}

export interface AppointmentDraft {
  clientId: ID | null
  /** True once "Walk-In" was chosen explicitly. */
  walkIn: boolean
  locationId: ID
  date: ISODate
  /** null until a time is chosen (Services › Time flow). */
  start: string | null
  items: DraftItem[]
  repeat: RepeatRule
  note: string
  paymentPolicy: boolean
  groupId?: ID | 'new'
  waitlistEntryId?: ID
}

export interface PreviewBlock {
  date: ISODate
  locationId: ID
  label: string
  items: { key: string; teamMemberId: ID; start: string; durationMin: number; extraTime: ExtraTime[]; serviceId: ID; name: string }[]
}

export interface MinimizedDrawer {
  kind: 'appointment' | 'new-appointment'
  id?: ID
  label: string
}

export const NO_REPEAT: RepeatRule = { frequency: 'none', interval: 1, unit: 'week', ends: 'never' }

interface CalendarUiState {
  /** Last calendar view (drawers clear the `view` param, so the page remembers it). */
  lastView: CalView
  filters: CalendarFilters
  /** A new-appointment draft kept across "Pick from calendar" and minimise. */
  draft: AppointmentDraft | null
  preview: PreviewBlock | null
  minimized: MinimizedDrawer | null
  focus: { date: ISODate; start: string; nonce: number } | null
  setLastView: (view: CalView) => void
  setFilters: (filters: CalendarFilters) => void
  setDraft: (draft: AppointmentDraft | null) => void
  setPreview: (preview: PreviewBlock | null) => void
  setMinimized: (m: MinimizedDrawer | null) => void
  focusOn: (date: ISODate, start: string) => void
}

export const useCalendarUi = create<CalendarUiState>()((set) => ({
  lastView: 'day',
  filters: EMPTY_FILTERS,
  draft: null,
  preview: null,
  minimized: null,
  focus: null,
  setLastView: (lastView) => set({ lastView }),
  setFilters: (filters) => set({ filters }),
  setDraft: (draft) => set({ draft }),
  setPreview: (preview) => set({ preview }),
  setMinimized: (minimized) => set({ minimized }),
  focusOn: (date, start) => set({ focus: { date, start, nonce: Date.now() } }),
}))

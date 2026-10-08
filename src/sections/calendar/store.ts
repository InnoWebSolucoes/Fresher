import { create } from 'zustand'
import type { ExtraTime, ID, ISODate, RepeatRule, ServiceAddOn } from '@/types'
import { EMPTY_FILTERS, type CalendarFilters } from './lib'

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
  /** Set when the draft holds unsaved edits of an existing appointment (minimised or under the client drawer). */
  editingId?: ID
}

export interface PreviewBlock {
  date: ISODate
  locationId: ID
  label: string
  items: { key: string; teamMemberId: ID; start: string; durationMin: number; extraTime: ExtraTime[]; serviceId: ID; name: string }[]
}

/** Blocked time being added or edited, drawn on the grid while the drawer is open. */
export interface BlockedPreview {
  date: ISODate
  locationId: ID
  teamMemberId: ID
  start: string
  end: string
  label: string
  /** The saved block this preview replaces while editing. */
  replaceId?: ID
}

export interface MinimizedDrawer {
  kind: 'appointment' | 'new-appointment'
  id?: ID
  label: string
  /** Client photo shown on the minimised pill. */
  photo?: string
}

export const NO_REPEAT: RepeatRule = { frequency: 'none', interval: 1, unit: 'week', ends: 'never' }

interface CalendarUiState {
  filters: CalendarFilters
  /** A new-appointment draft kept across "Pick from calendar", minimise and the client drawer. */
  draft: AppointmentDraft | null
  preview: PreviewBlock | null
  blockedPreview: BlockedPreview | null
  minimized: MinimizedDrawer | null
  /** Appointment drawer waiting underneath the client drawer (reopened when that closes). */
  stacked: MinimizedDrawer | null
  focus: { date: ISODate; start: string; nonce: number } | null
  setFilters: (filters: CalendarFilters) => void
  setDraft: (draft: AppointmentDraft | null) => void
  setPreview: (preview: PreviewBlock | null) => void
  setBlockedPreview: (preview: BlockedPreview | null) => void
  setMinimized: (m: MinimizedDrawer | null) => void
  setStacked: (m: MinimizedDrawer | null) => void
  focusOn: (date: ISODate, start: string) => void
}

export const useCalendarUi = create<CalendarUiState>()((set) => ({
  filters: EMPTY_FILTERS,
  draft: null,
  preview: null,
  blockedPreview: null,
  minimized: null,
  stacked: null,
  focus: null,
  setFilters: (filters) => set({ filters }),
  setDraft: (draft) => set({ draft }),
  setPreview: (preview) => set({ preview }),
  setBlockedPreview: (blockedPreview) => set({ blockedPreview }),
  setMinimized: (minimized) => set({ minimized }),
  setStacked: (stacked) => set({ stacked }),
  focusOn: (date, start) => set({ focus: { date, start, nonce: Date.now() } }),
}))

import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { readExt, setExt, useExt } from '@/api/ext'
import { findAddOn, isAddOnOn } from '@/api/addons'
import { ApiError } from '@/api/client'
import type { PresetKey } from '@/components/ui'
import { uid } from '@/lib/ids'
import { nowISO } from '@/lib/time'
import { useDb } from '@/store/db'
import type { Filters, RangeFilters } from './engine/types'

/**
 * Section data kept in `db.ext.reports` (BUILD_GUIDE "Updates"): custom
 * reports, folders and Customize settings of standard reports. All of it
 * needs the Insights add-on (reports.md §1.6, §2.7).
 */
export const NS = 'reports'

export type AdvOp = 'eq' | 'between' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'not_contains' | 'is' | 'is_not'

/** Advanced filter rule (reports.md §2.5): "where <field> <operator> <value>". */
export interface AdvRule {
  id: string
  field: string
  op: AdvOp
  value: string
  value2?: string
}

/** Customize drawer settings (reports.md §2.7). Undefined = report default. */
export interface ReportConfig {
  /** Grouping keys shown in the Group by menu. */
  groupings?: string[]
  /** Visible column keys after the grouping column, in order. */
  columns?: string[]
  datePicker?: 'range' | 'single'
  defaultDate?: PresetKey
  /** Filter sections shown in the Filters drawer. */
  filters?: string[]
  chart?: { show: boolean; metric?: string; kind?: 'bar' | 'line' }
}

/** Saved view of a custom report (what Duplicate copies). */
export interface ReportView {
  groupBy?: string
  shortcut?: PresetKey
  from?: string
  to?: string
  filters?: Filters
  ranges?: RangeFilters
  rules?: AdvRule[]
}

export interface CustomReport {
  id: string
  name: string
  description: string
  /** Slug of the standard report it is built on. */
  base: string
  createdById: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  config: ReportConfig
  view: ReportView
}

export interface ReportFolder {
  id: string
  name: string
  /** Report slugs (standard) or `custom_<id>` (custom). */
  items: string[]
  createdAt: string
}

const NO_CUSTOM: CustomReport[] = []
const NO_FOLDERS: ReportFolder[] = []
const NO_CONFIGS: Record<string, ReportConfig> = {}

export const customSlug = (id: string) => `custom_${id}`
export const isCustomSlug = (slug: string) => slug.startsWith('custom_')
export const customIdOf = (slug: string) => slug.slice('custom_'.length)

export const useCustomReports = () => useExt<CustomReport[]>(NS, 'custom', NO_CUSTOM)
export const useFolders = () => useExt<ReportFolder[]>(NS, 'folders', NO_FOLDERS)
export const useConfigs = () => useExt<Record<string, ReportConfig>>(NS, 'configs', NO_CONFIGS)

/** True when the Insights add-on is active or on trial. */
export function useInsights(): boolean {
  return isAddOnOn(findAddOn(useDb((s) => s.addOns), 'insights'))
}

/** Opens the Insights gate (reports.md §1.6) and comes back here afterwards. */
export function useInsightsGate(): () => void {
  const navigate = useNavigate()
  const location = useLocation()
  return useCallback(() => navigate(`/add-ons/add-on/insights/intro?return=${encodeURIComponent(location.pathname + location.search)}`), [navigate, location.pathname, location.search])
}

// ─── Custom reports ─────────────────────────────────────────────────────────

export interface CustomReportInput {
  name: string
  description: string
  base: string
  config?: ReportConfig
  view?: ReportView
  folderId?: string
}

export async function createCustomReport(input: CustomReportInput, author: { id: string | null; name: string }): Promise<CustomReport> {
  const name = input.name.trim()
  if (!name) throw new ApiError('name_required', 'Enter a report name')
  const at = nowISO()
  const report: CustomReport = { id: uid('rep'), name, description: input.description.trim(), base: input.base, createdById: author.id, createdBy: author.name, createdAt: at, updatedAt: at, config: input.config ?? {}, view: input.view ?? {} }
  await setExt(NS, 'custom', [...readExt(NS, 'custom', NO_CUSTOM), report])
  if (input.folderId) await addToFolder(input.folderId, customSlug(report.id))
  return report
}

export async function updateCustomReport(id: string, patch: Partial<Pick<CustomReport, 'name' | 'description' | 'config' | 'view'>>): Promise<void> {
  if (patch.name !== undefined && !patch.name.trim()) throw new ApiError('name_required', 'Enter a report name')
  await setExt(
    NS,
    'custom',
    readExt(NS, 'custom', NO_CUSTOM).map((r) => (r.id === id ? { ...r, ...patch, name: patch.name?.trim() ?? r.name, updatedAt: nowISO() } : r)),
  )
}

export async function deleteCustomReport(id: string): Promise<void> {
  const slug = customSlug(id)
  await setExt(NS, 'custom', readExt(NS, 'custom', NO_CUSTOM).filter((r) => r.id !== id))
  await setExt(NS, 'folders', readExt(NS, 'folders', NO_FOLDERS).map((f) => ({ ...f, items: f.items.filter((x) => x !== slug) })))
}

// ─── Folders ───────────────────────────────────────────────────────────────

export async function createFolder(name: string): Promise<ReportFolder> {
  const clean = name.trim()
  if (!clean) throw new ApiError('name_required', 'Enter a folder name')
  const folders = readExt(NS, 'folders', NO_FOLDERS)
  if (folders.some((f) => f.name.toLowerCase() === clean.toLowerCase())) throw new ApiError('duplicate', 'A folder with this name already exists')
  const folder: ReportFolder = { id: uid('fld'), name: clean, items: [], createdAt: nowISO() }
  await setExt(NS, 'folders', [...folders, folder])
  return folder
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const clean = name.trim()
  if (!clean) throw new ApiError('name_required', 'Enter a folder name')
  const folders = readExt(NS, 'folders', NO_FOLDERS)
  if (folders.some((f) => f.id !== id && f.name.toLowerCase() === clean.toLowerCase())) throw new ApiError('duplicate', 'A folder with this name already exists')
  await setExt(NS, 'folders', folders.map((f) => (f.id === id ? { ...f, name: clean } : f)))
}

export async function deleteFolder(id: string): Promise<void> {
  await setExt(NS, 'folders', readExt(NS, 'folders', NO_FOLDERS).filter((f) => f.id !== id))
}

export async function addToFolder(folderId: string, slug: string): Promise<void> {
  await setExt(NS, 'folders', readExt(NS, 'folders', NO_FOLDERS).map((f) => (f.id === folderId && !f.items.includes(slug) ? { ...f, items: [...f.items, slug] } : f)))
}

export async function removeFromFolder(folderId: string, slug: string): Promise<void> {
  await setExt(NS, 'folders', readExt(NS, 'folders', NO_FOLDERS).map((f) => (f.id === folderId ? { ...f, items: f.items.filter((x) => x !== slug) } : f)))
}

// ─── Customize settings of standard reports ────────────────────────────────

export async function saveReportConfig(slug: string, config: ReportConfig | null): Promise<void> {
  if (isCustomSlug(slug)) return updateCustomReport(customIdOf(slug), { config: config ?? {} })
  const all = { ...readExt(NS, 'configs', NO_CONFIGS) }
  if (config) all[slug] = config
  else delete all[slug]
  await setExt(NS, 'configs', all)
}

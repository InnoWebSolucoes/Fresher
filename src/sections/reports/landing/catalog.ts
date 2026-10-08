import { BarChart3, Banknote, CalendarDays, CircleUserRound, Columns3, LineChart, List, Package, Rocket, Smile, Star, Tag, Users, type LucideIcon } from 'lucide-react'
import { REPORTS, type ReportDef, type ReportGroup } from '@/app/reportCatalog'
import { customSlug, type CustomReport } from '../data'

/** Category tabs (reports.md §1.2). Dashboards and the premium overview reports only show under All reports. */
export const CATEGORIES = ['all', 'salesPerformance', 'finances', 'appointments', 'team', 'clients', 'inventory', 'other'] as const
export type Category = (typeof CATEGORIES)[number]

/** Left-panel groups in display order with their route ids (reports.md §1.1). */
export const GROUPS = [
  { id: '1', key: 'all', icon: List },
  { id: '2', key: 'favourites', icon: Star },
  { id: '6', key: 'dashboards', icon: BarChart3 },
  { id: '3', key: 'standard', icon: Columns3 },
  { id: '4', key: 'premium', icon: Rocket },
  { id: '5', key: 'custom', icon: CircleUserRound },
] as const

export type GroupKey = (typeof GROUPS)[number]['key']

const CATEGORY_ICONS: Record<ReportGroup, LucideIcon> = {
  dashboards: BarChart3,
  premium: LineChart,
  salesPerformance: Tag,
  finances: Banknote,
  appointments: CalendarDays,
  team: Users,
  clients: Smile,
  inventory: Package,
}

export const categoryIcon = (group: ReportGroup) => CATEGORY_ICONS[group]

/** One row of the landing list: a standard report or a custom one. */
export interface ReportItem {
  slug: string
  name: string
  description: string
  group: ReportGroup
  premium: boolean
  custom?: CustomReport
  /** Catalogue position (category sort). */
  order: number
  updatedAt: string
}

export function standardItems(): ReportItem[] {
  return REPORTS.map((r, i) => ({ slug: r.slug, name: r.name, description: r.description, group: r.group, premium: r.premium, order: i, updatedAt: '' }))
}

export function customItems(custom: CustomReport[]): ReportItem[] {
  return custom.map((c) => {
    const base = REPORTS.find((r) => r.slug === c.base)
    const order = base ? REPORTS.indexOf(base) + 0.5 : REPORTS.length
    return { slug: customSlug(c.id), name: c.name, description: c.description || base?.description || '', group: base?.group ?? 'salesPerformance', premium: false, custom: c, order, updatedAt: c.updatedAt }
  })
}

export const baseDef = (slug: string): ReportDef | undefined => REPORTS.find((r) => r.slug === slug)

export function inCategory(item: ReportItem, category: string): boolean {
  if (category === 'all') return true
  if (category === 'other') return false
  return item.group === category
}

export type SortKey = 'category' | 'updated' | 'az' | 'za'

export function sortItems(items: ReportItem[], sort: SortKey): ReportItem[] {
  const list = [...items]
  switch (sort) {
    case 'az':
      return list.sort((a, b) => a.name.localeCompare(b.name))
    case 'za':
      return list.sort((a, b) => b.name.localeCompare(a.name))
    case 'updated':
      return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.order - b.order)
    default:
      return list.sort((a, b) => a.order - b.order)
  }
}

/** Breadcrumb category of a report page ("All reports · Sales · Sales summary"); none for dashboards and the premium overview. */
export const breadcrumbCategory = (group: ReportGroup): string | null => (group === 'dashboards' || group === 'premium' ? null : group)

import type { Review } from '@/types'

export type Sort = 'recent' | 'highest' | 'lowest'

export interface ReviewFilters {
  locations: string[]
  ratings: number[]
  platforms: Review['platform'][]
  types: ('with' | 'without')[]
  contains: ('images' | 'text')[]
  services: string[]
  team: string[]
  status: ('new' | 'needs' | 'done')[]
}

export const EMPTY_FILTERS: ReviewFilters = { locations: [], ratings: [], platforms: [], types: [], contains: [], services: [], team: [], status: [] }

export const filterCount = (f: ReviewFilters) => f.ratings.length + f.platforms.length + f.types.length + f.contains.length + f.services.length + f.team.length + f.status.length + f.locations.length

export const toggle = <T>(list: T[], value: T): T[] => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value])

export function average(reviews: Pick<Review, 'rating'>[]): number {
  if (!reviews.length) return 0
  return reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
}

export function ratingCounts(reviews: Pick<Review, 'rating'>[]): Record<number, number> {
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const r of reviews) counts[r.rating] += 1
  return counts
}

interface Ctx {
  locationOf: (r: Review) => string | undefined
  from: string
  to: string
  query: string
  clientName: (r: Review) => string
  /** ISO timestamp 7 days ago (for the "New" status). */
  weekAgo: string
}

export function applyFilters(reviews: Review[], f: ReviewFilters, ctx: Ctx): Review[] {
  const q = ctx.query.trim().toLowerCase()
  return reviews.filter((r) => {
    const day = r.at.slice(0, 10)
    if (day < ctx.from || day > ctx.to) return false
    if (f.locations.length) {
      const loc = ctx.locationOf(r)
      if (!loc || !f.locations.includes(loc)) return false
    }
    if (f.ratings.length && !f.ratings.includes(r.rating)) return false
    if (f.platforms.length && !f.platforms.includes(r.platform)) return false
    if (f.types.length && !f.types.includes(r.reply ? 'with' : 'without')) return false
    if (f.contains.length && !f.contains.some((c) => (c === 'images' ? r.hasImages : r.text.trim().length > 0))) return false
    if (f.services.length && !(r.serviceName && f.services.includes(r.serviceName))) return false
    if (f.team.length && !(r.teamMemberId && f.team.includes(r.teamMemberId))) return false
    if (f.status.length) {
      const states = [!r.reply && r.at >= ctx.weekAgo ? 'new' : null, !r.reply ? 'needs' : null, r.reply ? 'done' : null]
      if (!f.status.some((s) => states.includes(s))) return false
    }
    if (q && !`${r.text} ${r.serviceName ?? ''} ${ctx.clientName(r)}`.toLowerCase().includes(q)) return false
    return true
  })
}

export function sortReviews(reviews: Review[], sort: Sort): Review[] {
  const list = [...reviews]
  if (sort === 'recent') return list.sort((a, b) => b.at.localeCompare(a.at))
  if (sort === 'highest') return list.sort((a, b) => b.rating - a.rating || b.at.localeCompare(a.at))
  return list.sort((a, b) => a.rating - b.rating || b.at.localeCompare(a.at))
}

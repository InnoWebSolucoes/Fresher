import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { ID } from '@/types'
import { useDb } from '@/store/db'
import { makeEvaluator, type Evaluator } from './segmentEval'
import { isPaidSale, saleItemsTotal } from './helpers'

/** Per-client sales value (paid sales, without tips) and review stats. */
export function useClientMetrics() {
  const { sales, reviews } = useDb(useShallow((s) => ({ sales: s.sales, reviews: s.reviews })))
  return useMemo(() => {
    const salesTotal = new Map<ID, number>()
    for (const sale of sales) {
      if (!sale.clientId || !isPaidSale(sale)) continue
      salesTotal.set(sale.clientId, (salesTotal.get(sale.clientId) ?? 0) + saleItemsTotal(sale))
    }
    const reviewStats = new Map<ID, { count: number; sum: number }>()
    for (const r of reviews) {
      const s = reviewStats.get(r.clientId) ?? { count: 0, sum: 0 }
      s.count++
      s.sum += r.rating
      reviewStats.set(r.clientId, s)
    }
    return { salesTotal, reviewStats }
  }, [sales, reviews])
}

/** Segment evaluator over the live data (memoised per data snapshot). */
export function useSegmentEvaluator(): Evaluator {
  const data = useDb(
    useShallow((s) => ({
      clients: s.clients,
      appointments: s.appointments,
      sales: s.sales,
      clientPackages: s.clientPackages,
      clientMemberships: s.clientMemberships,
      giftCards: s.giftCards,
    })),
  )
  return useMemo(() => makeEvaluator(data), [data])
}

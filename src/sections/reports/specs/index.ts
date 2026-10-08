import type { Spec } from '../engine/types'
import { APPOINTMENT_SPECS } from './appointments'
import { FINANCE_SPECS } from './finance'
import { INVENTORY_SPECS } from './inventory'
import { PREMIUM_SPECS } from './premium'
import { SALES_SPECS } from './sales'
import { TEAM_SPECS } from './team'

export const SPECS: Record<string, Spec> = Object.fromEntries([...PREMIUM_SPECS, ...SALES_SPECS, ...FINANCE_SPECS, ...APPOINTMENT_SPECS, ...TEAM_SPECS, ...INVENTORY_SPECS].map((s) => [s.slug, s]))

import { commit, db } from '@/store/db'
import type { CashRegister, ID, RegisterSession } from '@/types'
import { uid } from '@/lib/ids'
import { nowISO } from '@/lib/time'
import { round2 } from '@/lib/format'
import { actorName, ApiError, latency } from './client'

/** Cash registers (sales.md §2): setup, open, cash in/out, counts and close. */

export async function createRegister(input: Omit<CashRegister, 'id' | 'archived' | 'order'>): Promise<CashRegister> {
  await latency()
  const record: CashRegister = { ...input, id: uid('reg'), archived: false, order: db().registers.length }
  commit((d) => {
    d.registers.push(record)
  })
  return record
}

export async function updateRegister(id: ID, patch: Partial<CashRegister>): Promise<void> {
  await latency()
  commit((d) => {
    const reg = d.registers.find((r) => r.id === id)
    if (reg) Object.assign(reg, patch)
  })
}

export function currentSession(registerId: ID): RegisterSession | undefined {
  return db().registerSessions.find((s) => s.registerId === registerId && !s.closedAt)
}

/** Expected cash in a session: float + cash payments + cash in − cash out. */
export function expectedCash(session: RegisterSession): number {
  const payments = db().payments.filter((p) => p.registerSessionId === session.id && p.method === 'cash' && p.status === 'succeeded')
  const cashPayments = payments.reduce((s, p) => s + p.amount, 0)
  const ins = session.movements.filter((m) => m.type === 'cash_in').reduce((s, m) => s + m.amount, 0)
  const outs = session.movements.filter((m) => m.type === 'cash_out').reduce((s, m) => s + m.amount, 0)
  return round2(session.openingFloat + cashPayments + ins - outs)
}

export async function openRegister(registerId: ID, openingFloat: number, note?: string): Promise<RegisterSession> {
  await latency()
  if (currentSession(registerId)) throw new ApiError('already_open', 'This register is already open')
  const by = actorName()
  const at = nowISO()
  const session: RegisterSession = {
    id: uid('rs'),
    registerId,
    openedAt: at,
    openedBy: by,
    openingFloat: round2(openingFloat),
    movements: [
      { id: uid('mv'), type: 'opening_float', reason: 'Opening float', amount: round2(openingFloat), note, at, by },
    ],
  }
  commit((d) => {
    d.registerSessions.push(session)
  })
  return session
}

export async function cashMovement(sessionId: ID, type: 'cash_in' | 'cash_out', reason: string, amount: number, note?: string): Promise<void> {
  await latency()
  commit((d) => {
    const s = d.registerSessions.find((x) => x.id === sessionId)
    if (!s || s.closedAt) throw new ApiError('closed', 'Register is closed')
    s.movements.push({ id: uid('mv'), type, reason, amount: round2(amount), note, at: nowISO(), by: actorName() })
  })
}

/** Midday count: records counted amounts per payment type. */
export async function countRegister(sessionId: ID, counted: Record<string, number>, note?: string): Promise<void> {
  await latency()
  commit((d) => {
    const s = d.registerSessions.find((x) => x.id === sessionId)
    if (!s) return
    s.counted = counted
    s.movements.push({ id: uid('mv'), type: 'count', reason: 'Register counted', amount: round2(counted.cash ?? 0), note, at: nowISO(), by: actorName() })
  })
}

export async function closeRegister(sessionId: ID, input: { counted: Record<string, number>; closingFloat: number; cashToBank: number; note?: string }): Promise<void> {
  await latency()
  commit((d) => {
    const s = d.registerSessions.find((x) => x.id === sessionId)
    if (!s) return
    const at = nowISO()
    s.counted = input.counted
    s.closingFloat = round2(input.closingFloat)
    s.cashToBank = round2(input.cashToBank)
    s.note = input.note
    s.closedAt = at
    s.closedBy = actorName()
    s.movements.push({ id: uid('mv'), type: 'closed', reason: 'Register closed', amount: round2(input.counted.cash ?? 0), note: input.note, at, by: actorName() })
  })
}

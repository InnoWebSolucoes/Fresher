import { createContext, useCallback, useContext, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { ApiError } from '@/api/client'
import { checkout, salePaid, type PaymentInput } from '@/api/sales'
import { db, useDb } from '@/store/db'
import { useCurrentUser } from '@/store/session'
import { useDrawer } from '@/lib/drawer'
import { round2 } from '@/lib/format'
import { toast } from '@/components/ui'
import type { GiftCard, ID, Sale, TeamMember } from '@/types'
import { cartTotals, linesFromAppointment, linesFromSale, newKey, toCartItems, toPaymentInputs, type Line, type PendingPayment, type Step, type Tip } from './model'

export type TipChoice = { kind: 'none' } | { kind: 'percent'; value: number } | { kind: 'custom' }

export type CartCategory = null | 'appointments' | 'services' | 'products' | 'packages' | 'memberships' | 'giftCards'

export type MainView = 'step' | 'client' | 'split'

export type CheckoutModal =
  | { kind: 'editLine'; key: string }
  | { kind: 'giftCard'; key: string | null }
  | { kind: 'customTip' }
  | { kind: 'splitTip' }
  | { kind: 'cash'; split: boolean }
  | { kind: 'redeemFind'; split: boolean }
  | { kind: 'redeem'; card: GiftCard; split: boolean }
  | { kind: 'splitSelect' }
  | { kind: 'otherAmount'; method: 'other' | 'custom'; customMethodId?: ID; label: string }
  | { kind: 'terminal' }
  | { kind: 'selfCheckout' }
  | { kind: 'qr' }
  | { kind: 'manualCard' }
  | { kind: 'cartDiscount' }
  | { kind: 'receiptNote' }
  | { kind: 'serviceCharge' }
  | { kind: 'openRegister' }
  | { kind: 'quickSale' }
  | { kind: 'quickPayment' }
  | { kind: 'sellCustom'; type: 'package' | 'membership' }

export type FinalizeMode = 'pay' | 'unpaid' | 'draft'

export interface CheckoutState {
  locationId: ID
  setLocationId: (id: ID) => void
  clientId: ID | null
  setClientId: (id: ID | null) => void
  lines: Line[]
  addLine: (line: Omit<Line, 'key'>) => string
  updateLine: (key: string, patch: Partial<Line>) => void
  removeLine: (key: string) => void
  appointmentId?: ID
  linkAppointment: (appointmentId: ID) => boolean
  feeOnly: boolean
  tips: Tip[]
  setTips: (tips: Tip[]) => void
  tipChoice: TipChoice
  setTipChoice: (c: TipChoice) => void
  tipBase: number
  cartDiscount: Sale['cartDiscount']
  setCartDiscount: (d: Sale['cartDiscount']) => void
  serviceCharges: Sale['serviceCharges']
  setServiceCharges: (c: Sale['serviceCharges']) => void
  receiptNote: string
  setReceiptNote: (n: string) => void
  payments: PendingPayment[]
  addPayment: (p: Omit<PendingPayment, 'key'>) => void
  removePayment: (key: string) => void
  existingSale?: Sale
  /** Payments already on the existing sale. */
  alreadyPaid: number
  /** Deposit held on the appointment, applied automatically by checkout(). */
  deposit: number
  totals: ReturnType<typeof cartTotals>
  pendingTotal: number
  due: number
  step: Step
  goto: (step: Step) => void
  view: MainView
  setView: (v: MainView) => void
  category: CartCategory
  setCategory: (c: CartCategory) => void
  modal: CheckoutModal | null
  setModal: Dispatch<SetStateAction<CheckoutModal | null>>
  members: TeamMember[]
  defaultMemberId: ID | null
  memberForService: (serviceId: ID) => ID | null
  tippingEnabled: boolean
  busy: boolean
  /** Create / pay the sale. Throws on validation or API errors (e.g. card_declined). */
  finalize: (mode: FinalizeMode, extra?: PaymentInput[]) => Promise<Sale>
  /** Open the sale drawer for a finished sale with the right toast. */
  complete: (sale: Sale, mode: FinalizeMode) => void
  /** finalize + complete with error toasts (footer buttons). */
  submit: (mode: FinalizeMode) => Promise<void>
  close: () => void
}

const Ctx = createContext<CheckoutState | null>(null)
export const CheckoutProvider = Ctx.Provider

export function useCheckout(): CheckoutState {
  const value = useContext(Ctx)
  if (!value) throw new Error('useCheckout outside CheckoutProvider')
  return value
}

interface Init {
  locationId: ID
  clientId: ID | null
  lines: Line[]
  appointmentId?: ID
  feeOnly: boolean
  existingSaleId?: ID
  tips: Tip[]
  cartDiscount: Sale['cartDiscount']
  serviceCharges: Sale['serviceCharges']
  receiptNote: string
  step: Step
  modal: CheckoutModal | null
  paidSaleId?: ID
}

/** Build the starting cart from the drawer params (d_appointment, d_sale, d_client, d_add, d_mode). */
function initialState(params: URLSearchParams, userMemberId: ID | undefined): Init {
  const data = db()
  const memberLocation = data.teamMembers.find((m) => m.id === userMemberId)?.locationIds[0]
  const fallbackLocation = params.get('d_location') ?? memberLocation ?? data.locations[0]?.id ?? ''
  const tipping = data.settings.tipping.pos
  const init: Init = { locationId: fallbackLocation, clientId: params.get('d_client') || null, lines: [], feeOnly: false, tips: [], cartDiscount: undefined, serviceCharges: [], receiptNote: '', step: 'cart', modal: null }

  const loadSale = (sale: Sale) => {
    init.existingSaleId = sale.id
    init.lines = linesFromSale(sale)
    init.clientId = sale.clientId
    init.locationId = sale.locationId
    init.appointmentId = sale.appointmentId
    init.tips = sale.tips
    init.cartDiscount = sale.cartDiscount
    init.serviceCharges = sale.serviceCharges
    init.receiptNote = sale.receiptNote ?? ''
    init.step = 'payment'
  }

  const saleId = params.get('d_sale')
  const sale = saleId ? data.sales.find((s) => s.id === saleId) : undefined
  const apptId = params.get('d_appointment')
  const appt = apptId ? data.appointments.find((a) => a.id === apptId) : undefined

  if (sale) {
    if (sale.status === 'completed' || sale.status === 'refunded' || sale.status === 'voided') init.paidSaleId = sale.id
    else loadSale(sale)
  } else if (appt) {
    const linked = appt.saleId ? data.sales.find((s) => s.id === appt.saleId) : undefined
    if (linked && (linked.status === 'completed' || linked.status === 'refunded')) init.paidSaleId = linked.id
    else if (linked && linked.status !== 'voided') loadSale(linked)
    else {
      const { lines, feeOnly } = linesFromAppointment(appt)
      init.lines = lines
      init.feeOnly = feeOnly
      init.appointmentId = appt.id
      init.clientId = appt.clientId
      init.locationId = appt.locationId
      init.step = tipping && !feeOnly ? 'tip' : 'payment'
    }
  }

  const add = params.get('d_add')
  if (add) {
    const memberId = userMemberId && data.teamMembers.some((m) => m.id === userMemberId && !m.archived) ? userMemberId : (data.teamMembers.find((m) => !m.archived && m.bookable)?.id ?? null)
    for (const token of add.split(',').map((s) => s.trim()).filter(Boolean)) {
      const [type, ref] = token.split(':')
      if (type === 'package') {
        const def = data.packages.find((p) => p.id === ref)
        if (def) init.lines.push({ key: newKey(), type: 'package', refId: def.id, name: def.name, detail: `${def.benefits.length} benefit${def.benefits.length === 1 ? '' : 's'}`, quantity: 1, unitPrice: def.price, teamMemberId: memberId })
      } else if (type === 'membership') {
        const def = data.memberships.find((m) => m.id === ref)
        if (def) init.lines.push({ key: newKey(), type: 'membership', refId: def.id, name: def.name, detail: def.interval === 'month' ? 'Monthly' : 'Weekly', quantity: 1, unitPrice: def.firstPeriodPrice ?? def.price, teamMemberId: memberId })
      } else if (type === 'product') {
        const def = data.products.find((p) => p.id === ref)
        if (def) init.lines.push({ key: newKey(), type: 'product', refId: def.id, name: def.name, quantity: 1, unitPrice: def.retailPrice, teamMemberId: memberId })
      } else if (type === 'service') {
        const def = data.services.find((s) => s.id === ref)
        if (def) {
          const canDo = (m: TeamMember) => m.serviceIds === 'all' || m.serviceIds.includes(def.id)
          const member = data.teamMembers.find((m) => m.id === memberId && canDo(m)) ?? data.teamMembers.find((m) => !m.archived && m.bookable && canDo(m))
          init.lines.push({ key: newKey(), type: 'service', refId: def.id, name: def.name, quantity: 1, unitPrice: def.price, teamMemberId: member?.id ?? memberId })
        }
      } else if (type === 'gift_card') {
        const value = Number(ref) || data.settings.giftCards.values[0] || 25
        const key = newKey()
        init.lines.push({ key, type: 'gift_card', name: 'Gift Card', quantity: 1, unitPrice: value, teamMemberId: memberId, giftCard: { value, expiry: data.settings.giftCards.expiry, isGift: true, sendEmail: true } })
        init.modal = { kind: 'giftCard', key }
      }
    }
  }
  if (params.get('d_mode') === 'quick-payment') init.modal = { kind: 'quickPayment' }
  const step = params.get('d_step')
  if (step === 'cart' || step === 'tip' || step === 'payment') init.step = step
  return init
}

export function useCheckoutState(params: URLSearchParams, close: () => void): CheckoutState {
  const { t } = useTranslation()
  const drawer = useDrawer()
  const user = useCurrentUser()
  const [init] = useState(() => initialState(params, user?.teamMemberId))
  const data = useDb(useShallow((s) => ({ teamMembers: s.teamMembers, services: s.services, sales: s.sales, payments: s.payments, appointments: s.appointments, settings: s.settings })))

  const [locationId, setLocationId] = useState(init.locationId)
  const [clientId, setClientId] = useState<ID | null>(init.clientId)
  const [lines, setLines] = useState<Line[]>(init.lines)
  const [appointmentId, setAppointmentId] = useState<ID | undefined>(init.appointmentId)
  const [feeOnly] = useState(init.feeOnly)
  const [tips, setTipsState] = useState<Tip[]>(init.tips)
  const [tipChoice, setTipChoice] = useState<TipChoice>(init.tips.length ? { kind: 'custom' } : { kind: 'none' })
  const [cartDiscount, setCartDiscount] = useState<Sale['cartDiscount']>(init.cartDiscount)
  const [serviceCharges, setServiceCharges] = useState<Sale['serviceCharges']>(init.serviceCharges)
  const [receiptNote, setReceiptNote] = useState(init.receiptNote)
  const [payments, setPayments] = useState<PendingPayment[]>([])
  const [view, setView] = useState<MainView>('step')
  const [category, setCategory] = useState<CartCategory>(null)
  const [modal, setModal] = useState<CheckoutModal | null>(init.modal)
  const [busy, setBusy] = useState(false)

  // A paid sale or appointment opens its sale instead of a new checkout.
  useEffect(() => {
    if (init.paidSaleId) drawer.open('sale', { id: init.paidSaleId })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const existingSale = init.existingSaleId ? data.sales.find((s) => s.id === init.existingSaleId) : undefined
  const alreadyPaid = existingSale ? salePaid(existingSale, data.payments) : 0
  const appointment = appointmentId ? data.appointments.find((a) => a.id === appointmentId) : undefined
  const depositPayment = !existingSale && appointment?.deposit?.paymentId ? data.payments.find((p) => p.id === appointment.deposit?.paymentId && p.kind === 'deposit' && !p.saleId) : undefined
  const deposit = depositPayment?.amount ?? 0

  const totals = useMemo(() => cartTotals(lines, tips, cartDiscount, serviceCharges), [lines, tips, cartDiscount, serviceCharges])
  const pendingTotal = round2(payments.reduce((s, p) => s + p.amount, 0))
  const due = round2(totals.total - alreadyPaid - deposit - pendingTotal)

  const members = useMemo(() => data.teamMembers.filter((m) => !m.archived).sort((a, b) => a.order - b.order), [data.teamMembers])
  const userMember = members.find((m) => m.id === user?.teamMemberId)
  const defaultMemberId = userMember?.id ?? members.find((m) => m.bookable)?.id ?? members[0]?.id ?? null
  const memberForService = useCallback(
    (serviceId: ID) => {
      const canDo = (m: TeamMember) => m.bookable && (m.serviceIds === 'all' || m.serviceIds.includes(serviceId))
      if (userMember && canDo(userMember)) return userMember.id
      return members.find((m) => canDo(m) && m.locationIds.includes(locationId))?.id ?? members.find(canDo)?.id ?? defaultMemberId
    },
    [members, userMember, locationId, defaultMemberId],
  )

  const tipping = data.settings.tipping
  const tipBase = useMemo(() => {
    const inc = tipping.include
    const allowed = (type: Line['type']) =>
      (type === 'service' && inc.services) || (type === 'service_addon' && inc.addons) || (type === 'product' && inc.products) || (type === 'membership' && inc.memberships) || (type === 'package' && inc.packages) || (type === 'gift_card' && inc.giftCards) || type === 'manual' || type === 'no_show_fee' || type === 'late_cancellation_fee'
    const sum = lines.filter((l) => allowed(l.type)).reduce((s, l) => s + (inc.discounts ? cartTotals([l], [], undefined, []).itemsTotal : l.unitPrice * l.quantity), 0)
    return round2(sum)
  }, [lines, tipping.include])

  // Percentage tips follow the cart.
  useEffect(() => {
    if (tipChoice.kind !== 'percent') return
    const amount = round2((tipBase * tipChoice.value) / 100)
    setTipsState((prev) => {
      const memberId = prev[0]?.teamMemberId ?? lines.find((l) => l.teamMemberId)?.teamMemberId ?? defaultMemberId
      if (!memberId) return prev
      if (prev.length === 1 && prev[0].amount === amount && prev[0].teamMemberId === memberId) return prev
      return [{ teamMemberId: memberId, amount }]
    })
  }, [tipChoice, tipBase, lines, defaultMemberId])

  const currentStep = params.get('d_step')
  const step: Step = currentStep === 'cart' || currentStep === 'tip' || currentStep === 'payment' ? currentStep : init.step
  const { update } = drawer
  const goto = useCallback(
    (next: Step) => {
      setView('step')
      setCategory(null)
      update({ d_step: next })
    },
    [update],
  )

  const addLine = useCallback((line: Omit<Line, 'key'>) => {
    const key = newKey()
    setLines((prev) => {
      if (line.type === 'product' && line.refId) {
        const same = prev.find((l) => l.type === 'product' && l.refId === line.refId && !l.discount && l.unitPrice === line.unitPrice)
        if (same) return prev.map((l) => (l.key === same.key ? { ...l, quantity: l.quantity + line.quantity } : l))
      }
      return [...prev, { ...line, key }]
    })
    return key
  }, [])
  const updateLine = useCallback((key: string, patch: Partial<Line>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l))), [])
  const removeLine = useCallback(
    (key: string) => {
      const next = lines.filter((l) => l.key !== key)
      setLines(next)
      if (appointmentId && !next.some((l) => l.appointmentId === appointmentId)) setAppointmentId(undefined)
    },
    [lines, appointmentId],
  )

  const linkAppointment = useCallback(
    (id: ID) => {
      const appt = db().appointments.find((a) => a.id === id)
      if (!appt) return false
      if (appointmentId && appointmentId !== id) {
        toast(t('checkout.cart.oneAppointment'), 'error')
        return false
      }
      const { lines: apptLines } = linesFromAppointment({ ...appt, status: appt.status === 'no_show' || appt.status === 'cancelled' ? 'booked' : appt.status })
      setLines((prev) => [...prev.filter((l) => l.appointmentId !== id), ...apptLines])
      setAppointmentId(id)
      setLocationId(appt.locationId)
      if (!clientId && appt.clientId) setClientId(appt.clientId)
      return true
    },
    [appointmentId, clientId, t],
  )

  const setTips = useCallback((next: Tip[]) => setTipsState(next.filter((x) => x.amount > 0)), [])
  const addPayment = useCallback((p: Omit<PendingPayment, 'key'>) => setPayments((prev) => [...prev, { ...p, key: newKey() }]), [])
  const removePayment = useCallback((key: string) => setPayments((prev) => prev.filter((p) => p.key !== key)), [])

  const finalize = useCallback(
    async (mode: FinalizeMode, extra: PaymentInput[] = []): Promise<Sale> => {
      if (!lines.length) throw new ApiError('empty', t('checkout.errors.emptyCart'))
      if (!clientId && lines.some((l) => (l.type === 'package' || l.type === 'membership') && l.refId)) throw new ApiError('client_required', t('checkout.errors.clientRequired'))
      if (lines.some((l) => l.quantity <= 0 || !Number.isFinite(l.unitPrice))) throw new ApiError('invalid', t('checkout.errors.invalidLine'))
      setBusy(true)
      try {
        return await checkout({
          saleId: existingSale?.id,
          clientId,
          locationId,
          appointmentId: feeOnly ? undefined : appointmentId,
          items: toCartItems(lines),
          tips: tips.filter((x) => x.amount > 0),
          cartDiscount,
          serviceCharges,
          receiptNote: receiptNote.trim() || undefined,
          payments: mode === 'draft' ? [] : [...toPaymentInputs(payments), ...extra],
          saveAs: mode === 'draft' ? 'draft' : 'unpaid',
        })
      } finally {
        setBusy(false)
      }
    },
    [lines, clientId, existingSale?.id, locationId, feeOnly, appointmentId, tips, cartDiscount, serviceCharges, receiptNote, payments, t],
  )

  const complete = useCallback(
    (sale: Sale, mode: FinalizeMode) => {
      const message =
        mode === 'draft'
          ? t('checkout.toasts.draftSaved')
          : sale.status === 'completed'
            ? t('checkout.toasts.saleCompleted', { number: sale.number })
            : sale.status === 'part_paid'
              ? t('checkout.toasts.savedPartPaid')
              : t('checkout.toasts.savedUnpaid')
      toast(message)
      drawer.open('sale', { id: sale.id })
    },
    [drawer, t],
  )

  const submit = useCallback(
    async (mode: FinalizeMode) => {
      try {
        const sale = await finalize(mode)
        complete(sale, mode)
      } catch (e) {
        toast(e instanceof Error ? e.message : t('checkout.errors.generic'), 'error')
      }
    },
    [finalize, complete, t],
  )

  return {
    locationId,
    setLocationId,
    clientId,
    setClientId,
    lines,
    addLine,
    updateLine,
    removeLine,
    appointmentId,
    linkAppointment,
    feeOnly,
    tips,
    setTips,
    tipChoice,
    setTipChoice,
    tipBase,
    cartDiscount,
    setCartDiscount,
    serviceCharges,
    setServiceCharges,
    receiptNote,
    setReceiptNote,
    payments,
    addPayment,
    removePayment,
    existingSale,
    alreadyPaid,
    deposit,
    totals,
    pendingTotal,
    due,
    step,
    goto,
    view,
    setView,
    category,
    setCategory,
    modal,
    setModal,
    members,
    defaultMemberId,
    memberForService,
    tippingEnabled: tipping.pos,
    busy,
    finalize,
    complete,
    submit,
    close,
  }
}

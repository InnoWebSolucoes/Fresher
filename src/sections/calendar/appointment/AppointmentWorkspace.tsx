import clsx from 'clsx'
import { parseISO } from 'date-fns'
import { format } from '@/lib/dates'
import { ArrowLeft, ChevronDown, ChevronRight, ClipboardList, CreditCard, FileText, LocateFixed, Minimize2, MoreVertical, NotebookPen, Plus, ShieldCheck, UsersRound } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Checkbox, Modal, confirm, toast, type MenuGroup } from '@/components/ui'
import { addAppointmentNote, createAppointment, rescheduleAppointment, setStatus, undoNoShow, updateAppointment } from '@/api/appointments'
import { setAppointmentPaymentPolicy, setAppointmentRepeat } from '@/api/calendar'
import { crud } from '@/api/client'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { STATUS_STYLES } from '@/styles/palette'
import { fullName, money } from '@/lib/format'
import type { Slot } from '@/lib/availability'
import type { Appointment, AppointmentStatus, ClientNote, ID, Service } from '@/types'
import { useAvailabilityData, useLocationMembers, usePaymentsActive } from '../hooks'
import { useCalendarUi, type AppointmentDraft, type DraftItem, type MinimizedDrawer } from '../store'
import { DropMenu, FloatingDrawerButtons, UnsavedChangesModal, useLeaveGuard } from '../ui'
import { ClientPanel } from './ClientPanel'
import { draftFromAppointment, draftItemFromService, layout, resolveMember, sameItems, toAppointmentItems, toNewItems, totals } from './editor'
import { AppointmentHeader, RepeatPanel } from './HeaderControls'
import { NoteModal } from './NoteModal'
import { EditServicePanel, ServiceLine, ServicePicker, useCategoryEdge } from './ServicePanels'
import { CancelScreen, NoShowScreen } from './StatusModals'
import { TimeStep } from './TimeStep'

export type Panel = 'main' | 'services' | 'time' | 'pick-service' | 'edit-service' | 'activity' | 'repeat'

const STATUS_CHOICES: AppointmentStatus[] = ['booked', 'confirmed', 'arrived', 'started']

/** Strips markup that could run script from stored note HTML. */
export const safeHtml = (html: string) =>
  html
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
export const plainText = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

interface WorkspaceProps {
  appointment?: Appointment
  initial: AppointmentDraft
  defaultMember?: ID | null
  close: () => void
}

/** Client column + appointment column used by both appointment drawers (calendar.md §7, §9). */
export function AppointmentWorkspace({ appointment, initial, defaultMember = null, close }: WorkspaceProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const drawer = useDrawer()
  const isNew = !appointment
  const availability = useAvailabilityData()
  const members = useLocationMembers(initial.locationId)
  const services = useDb((s) => s.services)
  const notes = useDb((s) => s.clientNotes)
  const formResponses = useDb((s) => s.formResponses)
  const formTemplates = useDb((s) => s.formTemplates)
  const sale = useDb((s) => (appointment?.saleId ? s.sales.find((x) => x.id === appointment.saleId) : undefined))
  const policy = useDb((s) => s.settings.paymentPolicy)
  const paymentsActive = usePaymentsActive()
  const edge = useCategoryEdge()
  const ui = useCalendarUi()

  const [draft, setDraft] = useState<AppointmentDraft>(initial)
  const [panel, setPanel] = useState<Panel>(() => (isNew ? (!initial.items.length ? 'pick-service' : initial.start ? 'main' : 'services') : 'main'))
  const [returnPanel, setReturnPanel] = useState<Panel>('main')
  const [editIndex, setEditIndex] = useState<number | null>(null)
  const [replacing, setReplacing] = useState(false)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [showTotals, setShowTotals] = useState(false)
  const [modal, setModal] = useState<'note' | 'noShow' | 'cancel' | 'notify' | 'editNote' | 'viewNote' | null>(null)
  const [activeNote, setActiveNote] = useState<ClientNote | null>(null)
  const [notify, setNotify] = useState(true)
  const [saving, setSaving] = useState(false)

  const status = appointment?.status
  const paid = sale?.status === 'completed'
  const readOnly = Boolean(appointment && (status === 'completed' || status === 'no_show' || status === 'cancelled' || paid))
  const baseline = useMemo(() => (appointment ? draftFromAppointment(appointment) : null), [appointment])
  const dirty = isNew
    ? draft.items.length > 0 || Boolean(draft.clientId) || Boolean(draft.note)
    : Boolean(baseline && (!sameItems(draft.items, baseline.items) || draft.date !== baseline.date || draft.start !== baseline.start || draft.clientId !== baseline.clientId))
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const guard = useLeaveGuard(dirty)
  /** Close on purpose (after saving, cancelling…) without the unsaved-changes question. */
  const closeNow = () => guard.bypass(close)

  // Keep an existing appointment in sync with the store while untouched.
  useEffect(() => {
    if (appointment && !dirtyRef.current) setDraft(draftFromAppointment(appointment))
  }, [appointment])

  const draftClient = useDb((s) => (draft.clientId ? s.clients.find((c) => c.id === draft.clientId) : undefined))
  const clientLabel = draftClient ? fullName(draftClient) : t('calendar.walkIn')

  // Live preview block on the grid while creating.
  const setPreview = ui.setPreview
  useEffect(() => {
    if (!isNew || !draft.start || !draft.items.length) {
      setPreview(null)
      return
    }
    setPreview({
      date: draft.date,
      locationId: draft.locationId,
      label: draftClient ? fullName(draftClient) : t('calendar.walkIn'),
      items: layout(draft.items, draft.start)
        .map(({ item, start }) => ({ key: item.key, teamMemberId: item.teamMemberId ?? defaultMember ?? '', start, durationMin: item.durationMin, extraTime: item.extraTime, serviceId: item.serviceId, name: item.name }))
        .filter((i) => i.teamMemberId),
    })
  }, [isNew, draft, draftClient, defaultMember, setPreview, t])
  useEffect(() => () => setPreview(null), [setPreview])

  const eligibleFor = (serviceId: ID) => {
    const service = services.find((s) => s.id === serviceId)
    return members.filter((m) => !service || ((m.serviceIds === 'all' || m.serviceIds.includes(service.id)) && (service.teamMemberIds === 'all' || service.teamMemberIds.includes(m.id))))
  }
  const memberFor = (index: number) => resolveMember(availability, draft, index, eligibleFor(draft.items[index].serviceId)) ?? members[0]?.id ?? ''

  const laid = layout(draft.items, draft.start)
  const sums = totals(draft.items, appointment?.deposit?.amount ?? 0)
  const appointmentNotes = useMemo(() => (appointment ? notes.filter((n) => n.appointmentId === appointment.id) : []), [notes, appointment])
  const forms = useMemo(() => (appointment ? formResponses.filter((f) => f.appointmentId === appointment.id) : []), [formResponses, appointment])

  // ─── Item edits ────────────────────────────────────────────────────
  const patchItems = (fn: (items: DraftItem[]) => DraftItem[]) => setDraft((d) => ({ ...d, items: fn(d.items) }))

  const onPickService = (service: Service, variantId?: ID) => {
    const lastMember = draft.items.length ? draft.items[draft.items.length - 1].teamMemberId : defaultMember
    const canDo = (id: ID | null) => Boolean(id && eligibleFor(service.id).some((m) => m.id === id))
    if (replacing && editIndex !== null) {
      const old = draft.items[editIndex]
      const next = draftItemFromService(service, canDo(old.teamMemberId) ? old.teamMemberId : null, variantId)
      patchItems((items) => items.map((it, i) => (i === editIndex ? { ...next, key: old.key, itemId: old.itemId, preferred: old.preferred && canDo(old.teamMemberId) } : it)))
      setReplacing(false)
      setPanel('edit-service')
      return
    }
    const item = draftItemFromService(service, canDo(lastMember) ? lastMember : null, variantId)
    patchItems((items) => [...items, item])
    setPanel(draft.start || !isNew ? 'main' : 'services')
  }

  const openEdit = (index: number, from: Panel) => {
    setEditIndex(index)
    setReturnPanel(from)
    setPanel('edit-service')
  }

  // ─── Saving ────────────────────────────────────────────────────────
  const saveNew = async (): Promise<Appointment | null> => {
    if (!draft.items.length) {
      setPanel('pick-service')
      return null
    }
    if (!draft.start) {
      setPanel('time')
      return null
    }
    setSaving(true)
    try {
      const created = await createAppointment({
        clientId: draft.clientId,
        locationId: draft.locationId,
        date: draft.date,
        items: toNewItems(draft, memberFor),
        source: draft.walkIn || !draft.clientId ? 'walk_in' : 'phone',
        note: draft.note || undefined,
        repeat: draft.repeat.frequency !== 'none' ? draft.repeat : undefined,
        groupId: draft.groupId,
        waitlistEntryId: draft.waitlistEntryId,
      })
      if (draft.paymentPolicy) await setAppointmentPaymentPolicy(created.id, true)
      toast(t(draft.groupId === 'new' ? 'calendar.toasts.groupCreated' : draft.groupId ? 'calendar.toasts.addedToGroup' : 'calendar.toasts.created'))
      ui.setDraft(null)
      ui.setPreview(null)
      return useDb.getState().appointments.find((a) => a.id === created.id) ?? created
    } catch (err) {
      toast(err instanceof Error ? err.message : t('calendar.toasts.error'), 'error')
      return null
    } finally {
      setSaving(false)
    }
  }

  const saveExisting = async (sendNotification: boolean) => {
    if (!appointment || !baseline) return
    setSaving(true)
    try {
      const timeChanged = draft.date !== baseline.date || draft.start !== baseline.start
      const otherChanged = !sameItems(draft.items, baseline.items) || draft.clientId !== baseline.clientId
      if (timeChanged) await rescheduleAppointment(appointment.id, { date: draft.date, start: draft.start ?? baseline.start ?? '09:00' }, { notify: sendNotification })
      if (otherChanged) await updateAppointment(appointment.id, { clientId: draft.clientId, items: toAppointmentItems(draft, memberFor) }, t('calendar.toasts.updated'))
      toast(t(timeChanged ? 'calendar.toasts.rescheduled' : 'calendar.toasts.updated'))
      const fresh = useDb.getState().appointments.find((a) => a.id === appointment.id)
      if (fresh) setDraft(draftFromAppointment(fresh))
      setModal(null)
    } catch (err) {
      toast(err instanceof Error ? err.message : t('calendar.toasts.error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const onSave = async () => {
    if (isNew) {
      const created = await saveNew()
      if (!created) return
      if (created.groupId) guard.bypass(() => drawer.open('appointment-group', { id: created.groupId }))
      else closeNow()
      return
    }
    const timeChanged = baseline && (draft.date !== baseline.date || draft.start !== baseline.start)
    if (timeChanged && appointment?.clientId) {
      setNotify(true)
      setModal('notify')
    } else void saveExisting(false)
  }

  const onCheckout = async () => {
    if (isNew) {
      const created = await saveNew()
      if (created) guard.bypass(() => drawer.open('checkout', { d_appointment: created.id }))
    } else if (appointment) drawer.open('checkout', { d_appointment: appointment.id })
  }

  const exitWithoutSaving = () => {
    if (isNew) {
      ui.setDraft(null)
      ui.setPreview(null)
    }
    guard.leave()
  }

  const pickQuery = (extra: Record<string, string> = {}) =>
    `?${new URLSearchParams({ date: draft.date, view: 'day', location_id: draft.locationId, calendar_selected_resources: 'e-working', ...extra }).toString()}`

  /** Keep the drawer's state so it can come back (minimised pill, or under the client drawer). */
  const stash = (): MinimizedDrawer | null => {
    if (isNew) {
      ui.setDraft(draft)
      return { kind: 'new-appointment', label: draftClient ? fullName(draftClient) : t('calendar.minimized.newAppointment'), photo: draftClient?.photo }
    }
    if (!appointment) return null
    ui.setDraft(dirty ? { ...draft, editingId: appointment.id } : null)
    return { kind: 'appointment', id: appointment.id, label: clientLabel, photo: draftClient?.photo }
  }

  const minimize = () => {
    const entry = stash()
    if (entry) ui.setMinimized(entry)
    closeNow()
  }

  /** "View profile": the client drawer opens on top; closing it brings this drawer back. */
  const openClientProfile = (clientId: ID) => {
    const entry = stash()
    if (entry) ui.setStacked(entry)
    guard.bypass(() => drawer.open('client', { id: clientId }))
  }

  /** Leave for a full page (edit client details) and keep this drawer minimised to come back to. */
  const leaveTo = (path: string) => {
    const entry = stash()
    if (entry) ui.setMinimized(entry)
    guard.bypass(() => navigate(path))
  }

  const changeStatus = async (next: AppointmentStatus) => {
    if (!appointment) return
    try {
      await setStatus(appointment.id, next)
      close()
    } catch (err) {
      toast(err instanceof Error ? err.message : t('calendar.toasts.error'), 'error')
    }
  }

  /**
   * Payments isn't set up: open the Payments add-on page (as the reference
   * does); its Close comes back to this drawer with the draft intact.
   */
  const openPaymentsPage = () => {
    stash()
    const back = new URLSearchParams(location.search)
    ;[...back.keys()].filter((k) => k === 'drawer' || k === 'id' || k === 'tab' || k.startsWith('d_')).forEach((k) => back.delete(k))
    back.set('drawer', isNew ? 'new-appointment' : 'appointment')
    if (appointment) back.set('id', appointment.id)
    if (isNew || dirty) back.set('d_resume', '1')
    guard.bypass(() => navigate(`/payments/payment-processing?return=${encodeURIComponent(`${location.pathname}?${back.toString()}`)}`))
  }

  const togglePolicy = async () => {
    const turningOn = isNew ? !draft.paymentPolicy : !appointment?.paymentPolicy
    if (turningOn && !paymentsActive) return openPaymentsPage()
    if (isNew) {
      setDraft((d) => ({ ...d, paymentPolicy: !d.paymentPolicy }))
      return
    }
    if (!appointment) return
    await setAppointmentPaymentPolicy(appointment.id, !appointment.paymentPolicy)
    toast(t(appointment.paymentPolicy ? 'calendar.toasts.policyRemoved' : 'calendar.toasts.policyAdded'))
  }

  const policyOn = isNew ? draft.paymentPolicy : Boolean(appointment?.paymentPolicy)

  // ─── Options menu ──────────────────────────────────────────────────
  const optionGroups: MenuGroup[] = (() => {
    const note = { label: t('calendar.options.addNote'), icon: <NotebookPen size={16} />, onSelect: () => setModal('note') }
    const policyItem = { label: t(policyOn ? 'calendar.options.removePolicy' : 'calendar.options.addPolicy'), icon: <ShieldCheck size={16} />, onSelect: () => void togglePolicy() }
    if (isNew) return [{ heading: t('calendar.options.quickActions'), items: [note, policyItem] }]
    if (!appointment) return []
    const activityItem = { label: t('calendar.options.activity'), onSelect: () => setPanel('activity') }
    const groupItem = appointment.groupId
      ? { label: t('calendar.options.viewGroup'), onSelect: () => drawer.open('appointment-group', { id: appointment.groupId }) }
      : { label: t('calendar.options.addToGroup'), onSelect: () => drawer.open('appointment-group', { d_appointment: appointment.id }) }
    const rebook = { label: t('calendar.options.rebook'), onSelect: () => navigate(`/calendar/rebook-appointment/${appointment.id}${pickQuery()}`) }
    const form = { label: t('calendar.options.addForm'), icon: <ClipboardList size={16} />, disabled: !appointment.clientId, onSelect: () => navigate(`/clients/form-selection/select?appointmentId=${appointment.id}`) }
    if (status === 'no_show') {
      return [{ items: [note] }, { items: [activityItem, groupItem] }, { items: [rebook, { label: t('calendar.options.undoNoShow'), onSelect: () => void undo() }] }]
    }
    if (readOnly) return [{ heading: t('calendar.options.quickActions'), items: [note, form] }, { items: [activityItem, rebook] }]
    return [
      { heading: t('calendar.options.quickActions'), items: [note, form, policyItem] },
      { items: [activityItem, { label: t('calendar.options.repeat'), onSelect: () => setPanel('repeat') }, groupItem, rebook] },
      {
        items: [
          { label: t('calendar.options.reschedule'), onSelect: () => navigate(`/calendar/reschedule-appointment/${appointment.id}${pickQuery()}`) },
          { label: t('calendar.options.noShow'), danger: true, onSelect: () => setModal('noShow') },
          { label: t('calendar.options.cancel'), danger: true, onSelect: () => setModal('cancel') },
        ],
      },
    ]
  })()

  const undo = async () => {
    if (!appointment) return
    await undoNoShow(appointment.id)
    toast(t('calendar.toasts.noShowUndone'))
  }

  const applyRepeat = async (rule: AppointmentDraft['repeat']) => {
    if (isNew || !appointment) {
      setDraft((d) => ({ ...d, repeat: rule }))
      setPanel('main')
      return
    }
    setSaving(true)
    try {
      const added = await setAppointmentRepeat(appointment.id, rule)
      toast(rule.frequency === 'none' ? t('calendar.toasts.repeatRemoved') : t('calendar.toasts.repeatSaved', { count: added + 1 }))
      setPanel('main')
    } finally {
      setSaving(false)
    }
  }

  // ─── Render helpers ────────────────────────────────────────────────
  const editingItem = editIndex !== null ? draft.items[editIndex] : null
  const statusColor = appointment ? STATUS_STYLES[appointment.status].header : undefined

  const statusMenu = appointment && (
    <DropMenu
      align="right"
      width={200}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          disabled={readOnly}
          onClick={toggle}
          aria-expanded={open}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-white/80 px-4 text-body-strong text-white hover:bg-white/10 disabled:cursor-default"
          data-testid="status-menu"
        >
          {STATUS_STYLES[appointment.status].label}
          {!readOnly && <ChevronDown size={16} aria-hidden />}
        </button>
      )}
      groups={[
        {
          items: [
            ...STATUS_CHOICES.map((s) => ({ label: STATUS_STYLES[s].label, checked: s === appointment.status, onSelect: () => void changeStatus(s) })),
            { label: t('calendar.status.noShowShort'), onSelect: () => setModal('noShow') },
            { label: t('calendar.options.cancel'), danger: true, onSelect: () => setModal('cancel') },
          ],
        },
      ]}
    />
  )

  const totalsBlock = (
    <div className="mb-3 md:mb-4">
      <div className="flex justify-between text-body text-muted">
        <span>{t('calendar.totals.total')}</span>
        <span>{money(sums.total)}</span>
      </div>
      {showTotals && (
        <div className="mt-1 flex flex-col gap-0.5 text-body text-muted">
          <div className="flex justify-between">
            <span>{t('calendar.totals.subtotal')}</span>
            <span>{money(sums.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>{t('calendar.totals.tax')}</span>
            <span>{money(sums.tax)}</span>
          </div>
          {sums.deposit > 0 && (
            <div className="flex justify-between text-success">
              <span>{t('calendar.totals.deposit')}</span>
              <span>-{money(sums.deposit)}</span>
            </div>
          )}
        </div>
      )}
      <button type="button" onClick={() => setShowTotals((v) => !v)} aria-expanded={showTotals} className="mt-1 flex w-full items-center justify-between text-body-lg font-semibold text-ink">
        <span className="inline-flex items-center gap-1.5">
          {t('calendar.totals.toPay')} <ChevronRight size={16} className={clsx('transition-transform', showTotals && 'rotate-90')} aria-hidden />
        </span>
        <span>{money(paid ? 0 : sums.toPay)}</span>
      </button>
    </div>
  )

  const optionsButton = (
    <DropMenu
      placement="top"
      width={270}
      groups={optionGroups}
      trigger={({ open, toggle }) => (
        <button type="button" onClick={toggle} aria-expanded={open} aria-label={t('calendar.options.label')} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line-strong hover:bg-sunken" data-testid="appointment-options">
          <MoreVertical size={18} aria-hidden />
        </button>
      )}
    />
  )

  const footerButtons = () => {
    if (isNew && panel === 'services')
      return (
        <Button variant="primary" size="lg" className="flex-1" disabled={!draft.items.length} onClick={() => setPanel('time')} data-testid="continue">
          {t('calendar.common.continue')}
        </Button>
      )
    if (isNew && panel === 'time')
      return (
        <Button
          variant="primary"
          size="lg"
          className="flex-1"
          disabled={!slot}
          onClick={() => {
            if (!slot) return
            setDraft((d) => ({ ...d, start: slot.start, items: d.items.map((it, i) => (it.teamMemberId ? it : { ...it, teamMemberId: slot.assignments.find((a) => a.itemIndex === i)?.teamMemberId ?? null })) }))
            setPanel('main')
          }}
          data-testid="continue"
        >
          {t('calendar.common.continue')}
        </Button>
      )
    if (isNew)
      return (
        <>
          {optionsButton}
          <Button size="lg" className="flex-1" loading={saving} onClick={onCheckout}>
            {t('calendar.footer.checkout')}
          </Button>
          <Button variant="primary" size="lg" className="flex-1" loading={saving} onClick={onSave} data-testid="appointment-save">
            {t('calendar.common.save')}
          </Button>
        </>
      )
    if (!appointment) return null
    if (status === 'no_show')
      return (
        <>
          {optionsButton}
          <Button variant="primary" size="lg" className="flex-1" onClick={close}>
            {t('calendar.footer.done')}
          </Button>
        </>
      )
    if (dirty)
      return (
        <>
          <Button size="lg" className="flex-1" onClick={() => baseline && setDraft(baseline)}>
            {t('calendar.footer.discard')}
          </Button>
          <Button variant="primary" size="lg" className="flex-1" loading={saving} onClick={onSave} data-testid="appointment-save">
            {t('calendar.common.save')}
          </Button>
        </>
      )
    if (appointment.saleId && sale)
      return (
        <>
          {optionsButton}
          <Button variant="primary" size="lg" className="flex-1" onClick={() => drawer.open('sale', { id: sale.id })} data-testid="view-sale">
            {t('calendar.footer.viewSale')}
          </Button>
        </>
      )
    return (
      <>
        {optionsButton}
        <Button size="lg" className="flex-1" iconRight={<CreditCard size={18} className="text-success" />} onClick={() => (paymentsActive ? drawer.open('checkout', { d_appointment: appointment.id, d_step: 'payment' }) : openPaymentsPage())} data-testid="appointment-pay-now">
          {t('calendar.footer.payNow')}
        </Button>
        <Button variant="primary" size="lg" className="flex-1" onClick={onCheckout} data-testid="appointment-checkout">
          {t('calendar.footer.checkout')}
        </Button>
      </>
    )
  }

  const breadcrumb = (
    <nav className="mb-2 flex items-center gap-2 text-body text-muted" aria-label={t('calendar.steps.label')}>
      <button type="button" onClick={() => setPanel('services')} className={clsx(panel === 'services' ? 'font-semibold text-ink' : 'hover:text-ink')}>
        {t('calendar.steps.services')}
      </button>
      <ChevronRight size={14} aria-hidden />
      <span className={clsx(panel === 'time' && 'font-semibold text-ink')}>{t('calendar.steps.time')}</span>
    </nav>
  )

  const renderMainColumn = () => {
    if (panel === 'edit-service' && editingItem && editIndex !== null)
      return (
        <EditServicePanel
          key={editingItem.key + editingItem.serviceId}
          item={editingItem}
          members={members}
          onBack={() => setPanel(returnPanel)}
          onChangeService={() => {
            setReplacing(true)
            setPanel('pick-service')
          }}
          onDelete={() => {
            patchItems((items) => items.filter((_, i) => i !== editIndex))
            setEditIndex(null)
            setPanel(draft.items.length > 1 ? returnPanel : 'pick-service')
          }}
          onApply={(item) => {
            patchItems((items) => items.map((it, i) => (i === editIndex ? item : it)))
            setEditIndex(null)
            setPanel(returnPanel)
          }}
        />
      )
    if (panel === 'repeat') return <RepeatPanel value={draft.repeat} date={draft.date} onBack={() => setPanel('main')} onApply={(rule) => void applyRepeat(rule)} applying={saving} />
    if (panel === 'activity' && appointment)
      return (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6">
          <Button size="sm" icon={<ArrowLeft size={16} />} onClick={() => setPanel('main')}>
            {t('calendar.common.back')}
          </Button>
          <h2 className="mt-4 font-display text-title-2 text-ink md:text-title-1">{t('calendar.activity.title')}</h2>
          <ol className="relative mt-6 flex flex-col gap-5 border-l border-line pl-6 max-md:gap-4 max-md:pl-5">
            {[...appointment.activity]
              .sort((a, b) => b.at.localeCompare(a.at))
              .map((entry) => (
                <li key={entry.id} className="relative rounded-lg border border-line p-5 max-md:p-4">
                  <span className="absolute -left-[31px] top-6 h-2.5 w-2.5 rounded-full bg-line-strong max-md:-left-[27px]" aria-hidden />
                  <p className="text-body-lg font-semibold text-ink">{entry.title}</p>
                  <p className="text-small text-muted">{format(parseISO(entry.at), 'MMM d, yyyy, HH:mm')}</p>
                  {entry.detail && <p className="mt-2 text-body text-ink">{entry.detail}</p>}
                </li>
              ))}
          </ol>
          <p className="mt-6 text-body text-muted">{t('calendar.activity.footer')}</p>
        </div>
      )
    if (panel === 'pick-service')
      return (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6">
          <ServicePicker
            locationId={draft.locationId}
            onPick={onPickService}
            onBack={
              draft.items.length || replacing
                ? () => {
                    if (replacing) {
                      setReplacing(false)
                      setPanel('edit-service')
                    } else setPanel(draft.start || !isNew ? 'main' : 'services')
                  }
                : undefined
            }
          />
        </div>
      )
    if (panel === 'services' || panel === 'time')
      return (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6">
            {breadcrumb}
            {panel === 'services' ? (
              <>
                <h2 className="mb-6 font-display text-title-2 text-ink max-md:mb-4 md:text-title-1">{t('calendar.steps.servicesTitle')}</h2>
                <div className="flex flex-col gap-5">
                  {draft.items.map((item, index) => (
                    <ServiceLine
                      key={item.key}
                      item={item}
                      start={null}
                      edgeColor={edge(item.serviceId)}
                      members={eligibleFor(item.serviceId)}
                      showMemberChip
                      onMember={(id) => patchItems((items) => items.map((it, i) => (i === index ? { ...it, teamMemberId: id, preferred: id ? it.preferred : false } : it)))}
                      onEdit={() => openEdit(index, 'services')}
                      onRemove={() => patchItems((items) => items.filter((_, i) => i !== index))}
                    />
                  ))}
                </div>
                <Button icon={<Plus size={16} />} className="mt-5 rounded-full" onClick={() => setPanel('pick-service')}>
                  {t('calendar.service.add')}
                </Button>
              </>
            ) : (
              <TimeStep
                draft={draft}
                members={members}
                selected={slot}
                onSelect={setSlot}
                onDate={(date) => setDraft((d) => ({ ...d, date }))}
                onMember={(id) => patchItems((items) => items.map((it) => ({ ...it, teamMemberId: id && eligibleFor(it.serviceId).some((m) => m.id === id) ? id : null, preferred: false })))}
                onPickFromCalendar={() => {
                  ui.setDraft({ ...draft, start: null })
                  ui.setPreview(null)
                  guard.bypass(() => navigate(`/calendar/pick-from-calendar${pickQuery()}`))
                }}
              />
            )}
          </div>
          <div className="border-t border-line px-4 py-3 md:px-8 md:py-5">
            {totalsBlock}
            <div className="flex gap-2 md:gap-3">{footerButtons()}</div>
          </div>
        </>
      )

    // Summary
    return (
      <>
        <AppointmentHeader
          date={draft.date}
          start={draft.start}
          repeat={appointment?.repeat ?? draft.repeat}
          color={statusColor}
          readOnly={readOnly}
          onDate={(date) => setDraft((d) => ({ ...d, date }))}
          onTime={(start) => setDraft((d) => ({ ...d, start }))}
          onRepeat={() => setPanel('repeat')}
          right={statusMenu}
        />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6">
          <h3 className="mb-4 text-title-3 font-semibold text-ink">{t('calendar.service.title')}</h3>
          <div className="flex flex-col gap-5">
            {laid.map(({ item, start }, index) => (
              <ServiceLine
                key={item.key}
                item={item}
                start={start}
                edgeColor={edge(item.serviceId)}
                members={members}
                readOnly={readOnly}
                onEdit={() => openEdit(index, 'main')}
                onRemove={() => {
                  if (draft.items.length === 1) {
                    toast(t('calendar.service.needOne'), 'error')
                    return
                  }
                  patchItems((items) => items.filter((_, i) => i !== index))
                }}
              />
            ))}
          </div>
          {!readOnly && (
            <Button icon={<Plus size={16} />} className="mt-5 rounded-full" onClick={() => setPanel('pick-service')} data-testid="add-service">
              {t('calendar.service.add')}
            </Button>
          )}
          {appointment?.deposit && (
            <div className="mt-6 flex items-center justify-between rounded-lg bg-success-subtle px-4 py-3 text-body text-success">
              <span>{t('calendar.totals.depositPaid', { date: format(parseISO(appointment.deposit.paidAt), 'd MMM yyyy') })}</span>
              <b>{money(appointment.deposit.amount)}</b>
            </div>
          )}
          {policyOn && (
            <div className="mt-6 rounded-lg border border-line p-4">
              <p className="flex items-center gap-2 text-body-strong text-ink">
                <ShieldCheck size={16} className="text-primary" aria-hidden /> {t('calendar.policy.title')}
              </p>
              <p className="mt-1 text-small text-muted">
                {paymentsActive ? t('calendar.policy.summary', { deposit: policy.depositPct, hours: policy.cancellationWindowHours, late: policy.lateCancelFeePct, noShow: policy.noShowFeePct }) : t('calendar.policy.inactive')}
              </p>
            </div>
          )}
          {isNew && draft.note && (
            <div className="mt-8">
              <h3 className="mb-3 text-title-3 font-semibold text-ink">{t('calendar.records.title')}</h3>
              <div className="flex items-start gap-3">
                <FileText size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden />
                <div className="min-w-0 flex-1 text-body text-ink [&_h1]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5" dangerouslySetInnerHTML={{ __html: safeHtml(draft.note) }} />
                <Button size="sm" variant="ghost" onClick={() => setModal('note')}>
                  {t('calendar.service.edit')}
                </Button>
              </div>
            </div>
          )}
          {appointmentNotes.length > 0 && (
            <div className="mt-8">
              <h3 className="mb-3 text-title-3 font-semibold text-ink">{t('calendar.records.title')}</h3>
              <ul className="flex flex-col gap-4">
                {appointmentNotes.map((n) => (
                  <li key={n.id} className="flex items-start gap-3">
                    <FileText size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-3 text-body text-ink">{plainText(n.html)}</p>
                      <p className="text-small text-muted">{t('calendar.records.by', { date: format(parseISO(n.createdAt), 'EEE, MMM d, HH:mm'), name: n.by })}</p>
                    </div>
                    <DropMenu
                      align="right"
                      width={160}
                      trigger={({ toggle }) => (
                        <button type="button" onClick={toggle} aria-label={t('calendar.records.actions')} className="icon-btn h-8 w-8">
                          <MoreVertical size={16} aria-hidden />
                        </button>
                      )}
                      groups={[
                        {
                          items: [
                            { label: t('calendar.records.view'), onSelect: () => (setActiveNote(n), setModal('viewNote')) },
                            { label: t('calendar.records.edit'), onSelect: () => (setActiveNote(n), setModal('editNote')) },
                            {
                              label: t('calendar.records.copy'),
                              onSelect: () => {
                                void navigator.clipboard?.writeText(plainText(n.html))
                                toast(t('calendar.toasts.copied'))
                              },
                            },
                            {
                              label: t('calendar.records.delete'),
                              danger: true,
                              onSelect: async () => {
                                if (!(await confirm({ title: t('calendar.records.deleteTitle'), body: t('calendar.records.deleteBody'), confirmLabel: t('calendar.records.delete'), tone: 'danger' }))) return
                                await crud('clientNotes').remove(n.id)
                                toast(t('calendar.toasts.noteDeleted'))
                              },
                            },
                          ],
                        },
                      ]}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {forms.length > 0 && (
            <div className="mt-8">
              <h3 className="mb-3 text-title-3 font-semibold text-ink">{t('calendar.forms.title')}</h3>
              <ul className="flex flex-col gap-2">
                {forms.map((f) => (
                  <li key={f.id} className="flex items-center justify-between rounded-md border border-line px-4 py-3 text-body">
                    <span className="flex items-center gap-2 text-ink">
                      <ClipboardList size={16} className="text-muted" aria-hidden />
                      {formTemplates.find((x) => x.id === f.templateId)?.name}
                    </span>
                    <span className={clsx('chip', f.status === 'completed' ? 'bg-success-subtle text-success' : 'bg-info-subtle text-info')}>{t(`calendar.forms.status.${f.status}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {appointment?.cancellation && <p className="mt-6 text-body text-danger">{t('calendar.status.wasCancelled')}</p>}
        </div>
        <div className="border-t border-line px-4 py-3 md:px-8 md:py-5">
          {totalsBlock}
          <div className="flex gap-2 md:gap-3">{footerButtons()}</div>
        </div>
      </>
    )
  }

  const floating = [
    { label: t('calendar.drawer.minimize'), icon: <Minimize2 size={20} />, onClick: minimize },
    { label: t('calendar.drawer.focus'), icon: <LocateFixed size={20} />, onClick: () => ui.focusOn(draft.date, draft.start ?? '09:00') },
    ...(appointment?.groupId ? [{ label: t('calendar.drawer.viewGroup'), icon: <UsersRound size={20} />, onClick: () => drawer.open('appointment-group', { id: appointment.groupId }) }] : []),
  ]

  return (
    <div className="group/ws flex h-full flex-col max-md:min-h-0 md:flex-row" data-cal-drawer data-testid={isNew ? 'new-appointment-drawer' : 'appointment-drawer'}>
      <FloatingDrawerButtons drawerWidth={800} buttons={floating} />
      <aside className="shrink-0 border-line max-md:max-h-[40%] max-md:overflow-y-auto max-md:border-b max-md:has-[[data-client-search]]:max-h-none max-md:has-[[data-client-search]]:min-h-0 max-md:has-[[data-client-search]]:flex-1 md:w-[320px] md:overflow-y-auto md:border-r">
        <ClientPanel
          clientId={draft.clientId}
          walkIn={draft.walkIn}
          readOnly={readOnly}
          onChange={(clientId, walkIn) => setDraft((d) => ({ ...d, clientId, walkIn }))}
          onViewProfile={openClientProfile}
          onLeaveTo={leaveTo}
        />
      </aside>
      <section className="flex min-w-0 flex-1 flex-col max-md:min-h-0 max-md:group-has-[[data-client-search]]/ws:hidden">{renderMainColumn()}</section>

      <NoteModal
        open={modal === 'note'}
        clientName={draftClient ? fullName(draftClient) : undefined}
        clientPhoto={draftClient?.photo}
        onClient={
          draftClient
            ? () => {
                setModal(null)
                openClientProfile(draftClient.id)
              }
            : undefined
        }
        initialHtml={isNew ? draft.note : ''}
        onClose={() => setModal(null)}
        onSave={async (html) => {
          if (isNew || !appointment) {
            setDraft((d) => ({ ...d, note: html }))
            return
          }
          await addAppointmentNote(appointment.id, html)
          toast(t('calendar.toasts.noteAdded'))
        }}
      />
      <NoteModal
        open={modal === 'editNote' && Boolean(activeNote)}
        title={t('calendar.records.editTitle')}
        clientName={draftClient ? fullName(draftClient) : undefined}
        clientPhoto={draftClient?.photo}
        initialHtml={activeNote?.html ?? ''}
        onClose={() => setModal(null)}
        onSave={async (html) => {
          if (!activeNote) return
          await crud('clientNotes').update(activeNote.id, { html })
          toast(t('calendar.toasts.noteUpdated'))
        }}
      />
      <Modal open={modal === 'viewNote' && Boolean(activeNote)} onClose={() => setModal(null)} title={t('calendar.records.viewTitle')} subtitle={activeNote ? t('calendar.records.by', { date: format(parseISO(activeNote.createdAt), 'EEE, MMM d, HH:mm'), name: activeNote.by }) : undefined}>
        <div className="text-body text-ink [&_h1]:text-title-3 [&_h1]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5" dangerouslySetInnerHTML={{ __html: safeHtml(activeNote?.html ?? '') }} />
      </Modal>
      <Modal
        open={modal === 'notify'}
        onClose={() => setModal(null)}
        title={t('calendar.update.title')}
        footer={
          <>
            <Button onClick={() => setModal(null)}>{t('calendar.common.cancel')}</Button>
            <Button variant="primary" loading={saving} onClick={() => void saveExisting(notify)}>
              {t('calendar.update.update')}
            </Button>
          </>
        }
      >
        <Checkbox checked={notify} onChange={setNotify} label={t('calendar.update.notify', { name: clientLabel })} hint={t('calendar.update.notifyHint', { name: clientLabel })} />
      </Modal>
      {appointment && (
        <>
          <NoShowScreen appointment={appointment} open={modal === 'noShow'} onClose={() => setModal(null)} onDone={() => setModal(null)} />
          <CancelScreen
            appointment={appointment}
            open={modal === 'cancel'}
            onClose={() => setModal(null)}
            onDone={() => {
              setModal(null)
              closeNow()
            }}
          />
        </>
      )}
      <UnsavedChangesModal open={guard.asking} onBack={guard.stay} onExit={exitWithoutSaving} />
    </div>
  )
}

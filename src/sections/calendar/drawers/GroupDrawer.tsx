import { parseISO } from 'date-fns'
import { format } from '@/lib/dates'
import { Plus, SquareMousePointer, UserRoundPlus } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, EmptyState, confirm, toast } from '@/components/ui'
import type { DrawerProps } from '@/app/sectionRegistry'
import { addToGroup, cancelAppointment, markNoShow, removeFromGroup, ungroup } from '@/api/appointments'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { fullName, money } from '@/lib/format'
import { durationLabel } from '@/lib/time'
import { itemTotalMinutes } from '@/lib/availability'
import { STATUS_STYLES } from '@/styles/palette'
import type { Appointment } from '@/types'
import { apptStart, apptTotal } from '../blocks'
import { TEAM_PARAM, useCalendarParams } from '../hooks'
import { ClientAvatar, DropMenu } from '../ui'
import { DrawerShell, PillTrigger, RoundButton } from './Shell'

const OPEN_STATUSES = ['booked', 'confirmed', 'arrived', 'started']

/** Group appointment drawer (calendar.md §12): start a group, or view and manage one. */
export function GroupDrawer({ id, params, close }: DrawerProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const drawer = useDrawer()
  const { date, locationId } = useCalendarParams()
  const group = useDb((s) => (id ? s.groups.find((g) => g.id === id) : undefined))
  const appointments = useDb((s) => s.appointments)
  const clients = useDb((s) => s.clients)
  const sales = useDb((s) => s.sales)
  const reasons = useDb((s) => s.settings.cancellationReasons)
  const source = params.get('d_appointment')
  const sourceAppt = source ? appointments.find((a) => a.id === source) : undefined
  const [busy, setBusy] = useState(false)

  const members = useMemo(
    () => (group ? group.appointmentIds.map((aid) => appointments.find((a) => a.id === aid)).filter((a): a is Appointment => Boolean(a)).sort((a, b) => apptStart(a).localeCompare(apptStart(b))) : []),
    [group, appointments],
  )
  const groupDate = members[0]?.date ?? sourceAppt?.date ?? date
  const groupLocation = members[0]?.locationId ?? sourceAppt?.locationId ?? locationId

  /** Pick modes for this group stay on the group's day. */
  const pickQuery = (extra: Record<string, string> = {}) => `?${new URLSearchParams({ date: groupDate, view: 'day', location_id: groupLocation, [TEAM_PARAM]: 'e-all', ...extra }).toString()}`
  const createNew = () => navigate(`/calendar/book-appointment-for-group/new${pickQuery(group ? { group_id: group.id } : {})}`)
  const selectExisting = () => navigate(`/calendar/add-to-group/${group ? group.id : 'new'}${pickQuery(!group && source ? { source } : {})}`)

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      toast(err instanceof Error ? err.message : t('calendar.toasts.error'), 'error')
    } finally {
      setBusy(false)
    }
  }

  // ─── No group yet: choose how to start one ─────────────────────────
  if (!id) {
    const option = (icon: ReactNode, label: string, onClick: () => void, testId: string) => (
      <button type="button" onClick={onClick} disabled={busy} className="flex w-full items-center gap-5 rounded-xl border border-line bg-surface p-6 text-left transition-colors hover:bg-sunken disabled:opacity-60 max-md:gap-4 max-md:p-4" data-testid={testId}>
        <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary max-md:h-14 max-md:w-14">{icon}</span>
        <span className="text-body-lg font-semibold text-ink">{label}</span>
      </button>
    )
    return (
      <DrawerShell testId="group-drawer" title={t('calendar.group.title')}>
        <div className="flex flex-col gap-5">
          {source
            ? option(<UserRoundPlus size={30} aria-hidden />, t('calendar.group.createGroup'), () =>
                run(async () => {
                  const gid = await addToGroup('new', source)
                  toast(t('calendar.toasts.groupCreated'))
                  drawer.open('appointment-group', { id: gid })
                }),
              'group-create')
            : option(<Plus size={30} aria-hidden />, t('calendar.group.createNew'), createNew, 'group-create')}
          {option(<SquareMousePointer size={30} aria-hidden />, t('calendar.group.selectExisting'), selectExisting, 'group-select-existing')}
        </div>
      </DrawerShell>
    )
  }

  if (!group) {
    return (
      <DrawerShell testId="group-drawer" title={t('calendar.group.title')}>
        <EmptyState title={t('calendar.group.notFoundTitle')} body={t('calendar.group.notFoundBody')} />
      </DrawerShell>
    )
  }

  // ─── Existing group ────────────────────────────────────────────────
  const organiser = clients.find((c) => c.id === group.organiserClientId) ?? clients.find((c) => c.id === members[0]?.clientId)
  const live = members.filter((a) => a.status !== 'cancelled')
  const total = live.reduce((s, a) => s + apptTotal(a), 0)
  const open = members.filter((a) => OPEN_STATUSES.includes(a.status))
  const isPaid = (a: Appointment) => (a.saleId ? sales.find((s) => s.id === a.saleId)?.status === 'completed' : false)

  const checkoutGroup = () => {
    // One sale for every attended, unpaid appointment in the group.
    if (!live.some((a) => a.status !== 'no_show' && !isPaid(a))) return toast(t('calendar.group.allPaid'))
    drawer.open('checkout', { d_group: group.id })
  }

  const noShowAll = async () => {
    if (!open.length) return toast(t('calendar.group.nothingToUpdate'))
    if (!(await confirm({ title: t('calendar.group.noShowAllTitle'), body: t('calendar.group.noShowAllBody', { count: open.length }), confirmLabel: t('calendar.group.noShowAll'), tone: 'danger' }))) return
    await run(async () => {
      for (const a of open) await markNoShow(a.id, { notify: Boolean(a.clientId) })
      toast(t('calendar.toasts.noShowAll'))
    })
  }

  const cancelAll = async () => {
    if (!open.length) return toast(t('calendar.group.nothingToUpdate'))
    if (!(await confirm({ title: t('calendar.group.cancelAllTitle'), body: t('calendar.group.cancelAllBody', { count: open.length }), confirmLabel: t('calendar.group.cancelAll'), tone: 'danger' }))) return
    await run(async () => {
      const reasonId = [...reasons].sort((a, b) => a.order - b.order)[0]?.id ?? 'cr_none'
      for (const a of open) await cancelAppointment(a.id, { reasonId, notify: Boolean(a.clientId) })
      toast(t('calendar.toasts.cancelled'))
      close()
    })
  }

  const removeMember = (appt: Appointment) =>
    run(async () => {
      await removeFromGroup(appt.id)
      toast(t('calendar.toasts.removedFromGroup'))
      if (group.appointmentIds.length <= 1) {
        await ungroup(group.id)
        close()
      }
    })

  return (
    <DrawerShell
      testId="group-drawer"
      title={t('calendar.group.title')}
      subtitle={t('calendar.group.subtitle', { date: format(parseISO(groupDate), 'EEE d MMM'), name: fullName(organiser, t('calendar.walkIn')) })}
      footer={
        <div className="flex w-full flex-col gap-4">
          <div className="flex items-center justify-between text-body-lg font-semibold text-ink">
            <span>{t('calendar.group.total')}</span>
            <span data-testid="group-total">{money(total)}</span>
          </div>
          <div className="flex gap-3">
            <DropMenu
              placement="top"
              width={300}
              trigger={({ open: menuOpen, toggle }) => <RoundButton onClick={toggle} aria-expanded={menuOpen} aria-label={t('calendar.group.moreOptions')} disabled={busy} data-testid="group-more" />}
              groups={[
                {
                  heading: t('calendar.group.addToGroup'),
                  items: [
                    { label: t('calendar.group.createNew'), icon: <Plus size={16} />, onSelect: createNew },
                    { label: t('calendar.group.selectExisting'), icon: <SquareMousePointer size={16} />, onSelect: selectExisting },
                  ],
                },
                {
                  items: [
                    { label: t('calendar.group.checkout'), onSelect: checkoutGroup },
                    {
                      label: t('calendar.group.ungroup'),
                      onSelect: () =>
                        void run(async () => {
                          await ungroup(group.id)
                          toast(t('calendar.toasts.ungrouped'))
                          close()
                        }),
                    },
                    { label: t('calendar.group.noShowAll'), danger: true, onSelect: () => void noShowAll() },
                    { label: t('calendar.group.cancelAll'), danger: true, onSelect: () => void cancelAll() },
                  ],
                },
              ]}
            />
            <Button size="lg" className="flex-1 rounded-full" onClick={close} data-testid="group-close">
              {t('calendar.group.close')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {members.map((a) => (
          <GroupMemberCard key={a.id} appt={a} paid={isPaid(a)} onView={() => drawer.open('appointment', { id: a.id })} onRemove={() => void removeMember(a)} />
        ))}
        {!members.length && <p className="text-body text-muted">{t('calendar.group.empty')}</p>}
        <div>
          <DropMenu
            width={290}
            trigger={({ open: menuOpen, toggle }) => (
              <PillTrigger open={menuOpen} onClick={toggle} data-testid="group-add">
                {t('calendar.group.addToGroup')}
              </PillTrigger>
            )}
            groups={[
              {
                items: [
                  { label: t('calendar.group.createNew'), icon: <Plus size={16} />, onSelect: createNew },
                  { label: t('calendar.group.selectExisting'), icon: <SquareMousePointer size={16} />, onSelect: selectExisting },
                ],
              },
            ]}
          />
        </div>
      </div>
    </DrawerShell>
  )
}

function GroupMemberCard({ appt, paid, onView, onRemove }: { appt: Appointment; paid: boolean; onView: () => void; onRemove: () => void }) {
  const { t } = useTranslation()
  const client = useDb((s) => (appt.clientId ? s.clients.find((c) => c.id === appt.clientId) : undefined))
  const status = STATUS_STYLES[appt.status]
  return (
    <div className="rounded-xl border border-line bg-surface p-6 max-md:p-4" data-testid="group-member">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-body-lg font-semibold text-ink">{fullName(client, t('calendar.walkIn'))}</p>
          {client?.email && <p className="truncate text-body text-muted">{client.email}</p>}
        </div>
        <ClientAvatar name={client?.firstName} photo={client?.photo} walkIn={!client} size={56} />
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {appt.items.map((item) => (
          <div key={item.id} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-body-lg text-ink">{item.name}</p>
              <p className="text-small text-muted tabular">
                {item.start} • {durationLabel(itemTotalMinutes(item.durationMin, item.extraTime))}
              </p>
            </div>
            <span className="text-body-lg text-ink">{money(item.price + item.addOns.reduce((s, o) => s + o.price, 0))}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <DropMenu
          width={220}
          trigger={({ open, toggle }) => (
            <PillTrigger open={open} onClick={toggle}>
              {t('calendar.group.actions')}
            </PillTrigger>
          )}
          groups={[
            {
              items: [
                { label: t('calendar.group.viewAppointment'), onSelect: onView },
                { label: t('calendar.group.removeFromGroup'), onSelect: onRemove },
              ],
            },
          ]}
        />
        <span className="flex items-center gap-1.5">
          {paid && <span className="chip bg-success-subtle text-success">{t('calendar.group.paid')}</span>}
          <span className="chip" style={{ background: status.bg, color: status.fg }}>
            {status.label}
          </span>
        </span>
      </div>
    </div>
  )
}


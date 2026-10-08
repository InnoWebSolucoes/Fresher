import { format, parseISO } from 'date-fns'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Checkbox, EmptyState, Field, Select, Switch, TextArea, TextInput, confirm, toast } from '@/components/ui'
import type { DrawerProps } from '@/app/sectionRegistry'
import { addToGroup, deleteBlockedTime, removeWaitlistEntry, saveBlockedTime, ungroup } from '@/api/appointments'
import { saveCalendarSettings } from '@/api/calendar'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { fullName, money } from '@/lib/format'
import { todayISO, toClock, toMinutes } from '@/lib/time'
import type { Settings } from '@/types'
import { useCalendarParams } from '../hooks'
import { EMPTY_FILTERS, FILTER_CHANNELS, FILTER_PAYMENTS, FILTER_STATUSES, FILTER_TYPES, clockOptions, memberName, type CalendarFilters } from '../lib'
import { useCalendarUi } from '../store'

function Shell({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex h-full flex-col" data-cal-drawer>
      <div className="px-8 pb-4 pt-8">
        <h2 className="font-display text-title-1 text-ink">{title}</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-6">{children}</div>
      {footer && <div className="flex gap-3 border-t border-line px-8 py-5">{footer}</div>}
    </div>
  )
}

const ZOOMS: Settings['calendarZoom'][] = [48, 96, 144, 288]

export function SettingsDrawer({ close }: DrawerProps) {
  const { t } = useTranslation()
  const zoom = useDb((s) => s.settings.calendarZoom)
  const quick = useDb((s) => s.settings.quickActions)
  const [z, setZ] = useState(ZOOMS.indexOf(zoom))
  const [q, setQ] = useState(quick)
  const [busy, setBusy] = useState(false)
  return (
    <Shell
      title={t('calendar.settings.title')}
      footer={
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          loading={busy}
          onClick={async () => {
            setBusy(true)
            await saveCalendarSettings({ calendarZoom: ZOOMS[z], quickActions: q })
            toast(t('calendar.toasts.settingsSaved'))
            close()
          }}
        >
          {t('calendar.settings.apply')}
        </Button>
      }
    >
      <div className="flex justify-between text-body-strong text-ink">
        <span>{t('calendar.settings.zoom')}</span>
        <span className="font-normal">{t(`calendar.settings.zoomLevels.${z}`)}</span>
      </div>
      <input type="range" min={0} max={3} step={1} value={z} onChange={(e) => setZ(Number(e.target.value))} className="mt-3 w-full accent-[rgb(var(--primary))]" aria-label={t('calendar.settings.zoom')} />
      <div className="my-6 border-t border-line" />
      <Switch checked={q} onChange={setQ} label={t('calendar.settings.quick')} hint={t('calendar.settings.quickHint')} />
    </Shell>
  )
}

export function FiltersDrawer({ close }: DrawerProps) {
  const { t } = useTranslation()
  const applied = useCalendarUi((s) => s.filters)
  const setFilters = useCalendarUi((s) => s.setFilters)
  const [f, setF] = useState<CalendarFilters>(applied)
  const toggle = (key: keyof CalendarFilters, value: string) => setF((cur) => ({ ...cur, [key]: cur[key].includes(value) ? cur[key].filter((x) => x !== value) : [...cur[key], value] }))
  const group = (key: keyof CalendarFilters, label: string, values: readonly string[]) => (
    <section className="border-b border-line py-4">
      <h3 className="mb-3 text-body-lg font-semibold text-ink">{label}</h3>
      <div className="flex flex-col gap-2.5">
        {values.map((v) => (
          <Checkbox key={v} label={t(`calendar.filters.values.${v}`)} checked={f[key].includes(v)} onChange={() => toggle(key, v)} />
        ))}
      </div>
    </section>
  )
  return (
    <Shell
      title={t('calendar.filters.title')}
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={() => setF(EMPTY_FILTERS)}>
            {t('calendar.filters.clear')}
          </Button>
          <Button
            variant="primary"
            size="lg"
            className="flex-1"
            onClick={() => {
              setFilters(f)
              close()
            }}
          >
            {t('calendar.filters.apply')}
          </Button>
        </>
      }
    >
      {group('status', t('calendar.filters.status'), FILTER_STATUSES)}
      {group('type', t('calendar.filters.type'), FILTER_TYPES)}
      {group('channel', t('calendar.filters.channel'), FILTER_CHANNELS)}
      {group('payment', t('calendar.filters.payment'), FILTER_PAYMENTS)}
    </Shell>
  )
}

export function WaitlistDrawer() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const entries = useDb((s) => s.waitlist)
  const clients = useDb((s) => s.clients)
  const services = useDb((s) => s.services)
  const waiting = entries.filter((w) => w.status === 'waiting')
  return (
    <Shell title={t('calendar.waitlist.title')}>
      {!waiting.length && <EmptyState title={t('calendar.waitlist.emptyTitle')} body={t('calendar.waitlist.emptyBody')} />}
      <div className="flex flex-col gap-4">
        {waiting.map((w) => {
          const client = clients.find((c) => c.id === w.clientId)
          return (
            <div key={w.id} className="rounded-lg border border-line p-5">
              <p className="text-body-lg text-ink">{fullName(client, t('calendar.walkIn'))}</p>
              {w.preferences.map((p, i) => (
                <p key={i} className="text-small text-muted">
                  {format(parseISO(p.date), 'MMM d')}, {p.from ? `${p.from} – ${p.to}` : t('calendar.waitlist.anyTime')}
                </p>
              ))}
              {w.items.map((it, i) => {
                const s = services.find((x) => x.id === it.serviceId)
                return (
                  <p key={i} className="mt-2 flex justify-between text-body text-ink">
                    <span>{s?.name}</span>
                    <span>{s ? money(s.price) : ''}</span>
                  </p>
                )
              })}
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="primary" onClick={() => navigate(`/calendar/book-from-waitlist-entry/${w.id}?calendar_selected_resources=e-working`)}>
                  {t('calendar.waitlist.bookNow')}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={async () => {
                    if (!(await confirm({ title: t('calendar.waitlist.remove'), tone: 'danger', confirmLabel: t('calendar.waitlist.remove') }))) return
                    await removeWaitlistEntry(w.id)
                    toast(t('calendar.toasts.waitlistRemoved'))
                  }}
                >
                  {t('calendar.waitlist.remove')}
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </Shell>
  )
}

export function GroupDrawer({ id, params, close }: DrawerProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const drawer = useDrawer()
  const group = useDb((s) => s.groups.find((g) => g.id === id))
  const appointments = useDb((s) => s.appointments)
  const clients = useDb((s) => s.clients)
  const source = params.get('d_appointment')
  const members = group ? appointments.filter((a) => group.appointmentIds.includes(a.id)) : []
  if (!group) {
    return (
      <Shell title={t('calendar.group.title')}>
        <div className="flex flex-col gap-4">
          <Button
            size="lg"
            onClick={async () => {
              if (source) {
                const gid = await addToGroup('new', source)
                toast(t('calendar.toasts.groupCreated'))
                drawer.open('appointment-group', { id: gid })
              } else navigate('/calendar/book-appointment-for-group/new?calendar_selected_resources=e-working')
            }}
          >
            {t(source ? 'calendar.group.createGroup' : 'calendar.group.createNew')}
          </Button>
          <Button size="lg" onClick={() => navigate(`/calendar/add-to-group/new${source ? `?source=${source}` : ''}`)}>
            {t('calendar.group.selectExisting')}
          </Button>
        </div>
      </Shell>
    )
  }
  const total = members.reduce((s, a) => s + a.items.reduce((x, i) => x + i.price, 0), 0)
  return (
    <Shell
      title={t('calendar.group.title')}
      footer={
        <>
          <Button
            size="lg"
            variant="danger"
            onClick={async () => {
              await ungroup(group.id)
              toast(t('calendar.toasts.ungrouped'))
              close()
            }}
          >
            {t('calendar.group.ungroup')}
          </Button>
          <Button size="lg" className="flex-1" onClick={close}>
            {t('calendar.common.close')} · {money(total)}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {members.map((a) => (
          <button key={a.id} type="button" onClick={() => drawer.open('appointment', { id: a.id })} className="rounded-lg border border-line p-5 text-left hover:bg-sunken">
            <p className="text-body-lg text-ink">{fullName(clients.find((c) => c.id === a.clientId), t('calendar.walkIn'))}</p>
            <p className="text-small text-muted">
              {a.items[0]?.name} · {a.items[0]?.start}
            </p>
          </button>
        ))}
        <Button onClick={() => navigate(`/calendar/add-to-group/${group.id}`)}>{t('calendar.group.selectExisting')}</Button>
      </div>
    </Shell>
  )
}

export function BlockedTimeDrawer({ id, params, close }: DrawerProps) {
  const { t } = useTranslation()
  const { locationId } = useCalendarParams()
  const existing = useDb((s) => s.blockedTimes.find((b) => b.id === id))
  const types = useDb((s) => s.blockedTimeTypes)
  const teamMembers = useDb((s) => s.teamMembers)
  const start0 = existing?.start ?? params.get('d_time') ?? '09:00'
  const [form, setForm] = useState({
    typeId: existing?.typeId ?? '',
    title: existing?.title ?? '',
    date: existing?.date ?? params.get('d_date') ?? todayISO(),
    start: start0,
    end: existing?.end ?? toClock(toMinutes(start0) + 15),
    member: existing?.teamMemberId ?? params.get('d_member') ?? teamMembers[0]?.id ?? '',
    description: existing?.description ?? '',
    online: existing?.onlineBookingAllowed ?? false,
  })
  const [busy, setBusy] = useState(false)
  const times = clockOptions(5)
  const invalid = toMinutes(form.end) <= toMinutes(form.start)
  const save = async () => {
    setBusy(true)
    const type = types.find((x) => x.id === form.typeId)
    await saveBlockedTime({ id: existing?.id, teamMemberId: form.member, locationId: existing?.locationId ?? locationId, date: form.date, start: form.start, end: form.end, typeId: form.typeId || undefined, title: form.title || type?.name || '', description: form.description, onlineBookingAllowed: form.online })
    toast(t('calendar.toasts.blockedAdded'))
    close()
  }
  return (
    <Shell
      title={t(existing ? 'calendar.blocked.editTitle' : 'calendar.blocked.addTitle')}
      footer={
        <>
          {existing && (
            <Button
              size="lg"
              variant="danger"
              onClick={async () => {
                if (!(await confirm({ title: t('calendar.blocked.deleteTitle'), body: t('calendar.blocked.deleteBody'), confirmLabel: t('calendar.blocked.delete'), tone: 'danger' }))) return
                await deleteBlockedTime(existing.id)
                toast(t('calendar.toasts.blockedDeleted'))
                close()
              }}
            >
              {t('calendar.blocked.delete')}
            </Button>
          )}
          <Button variant="primary" size="lg" className="flex-1" disabled={invalid} loading={busy} onClick={save}>
            {t('calendar.common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('calendar.blocked.type')}>
          {(fid) => (
            <Select
              id={fid}
              value={form.typeId}
              onChange={(e) => {
                const type = types.find((x) => x.id === e.target.value)
                setForm((f) => ({ ...f, typeId: e.target.value, end: type ? toClock(toMinutes(f.start) + type.durationMin) : f.end }))
              }}
              options={[{ value: '', label: t('calendar.blocked.custom') }, ...types.map((x) => ({ value: x.id, label: `${x.emoji} ${x.name}` }))]}
            />
          )}
        </Field>
        {!form.typeId && <Field label={t('calendar.blocked.titleField')} optional>{(fid) => <TextInput id={fid} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />}</Field>}
        <Field label={t('calendar.blocked.date')}>{(fid) => <TextInput id={fid} type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />}</Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('calendar.blocked.start')}>{(fid) => <Select id={fid} value={form.start} onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))} options={times} />}</Field>
          <Field label={t('calendar.blocked.end')} error={invalid ? t('calendar.blocked.endError') : undefined}>
            {(fid) => <Select id={fid} value={form.end} onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))} options={times} />}
          </Field>
        </div>
        <Field label={t('calendar.blocked.member')}>
          {(fid) => <Select id={fid} value={form.member} onChange={(e) => setForm((f) => ({ ...f, member: e.target.value }))} options={teamMembers.filter((m) => m.bookable && !m.archived).map((m) => ({ value: m.id, label: memberName(m) }))} />}
        </Field>
        <Field label={t('calendar.blocked.description')} optional counter={{ value: form.description.length, max: 255 }}>
          {(fid) => <TextArea id={fid} maxLength={255} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />}
        </Field>
        <Checkbox checked={form.online} onChange={(v) => setForm((f) => ({ ...f, online: v }))} label={t('calendar.blocked.online')} />
      </div>
    </Shell>
  )
}

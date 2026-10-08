import clsx from 'clsx'
import { parseISO } from 'date-fns'
import { format } from '@/lib/dates'
import { ClipboardList, LogIn, LogOut, MoreVertical, Timer, Users } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import type { DrawerProps } from '@/app/sectionRegistry'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { durationLabel } from '@/lib/time'
import { Button, EmptyState, Menu, SearchInput, confirm, toast } from '@/components/ui'
import { deleteTimesheet } from '@/api/team'
import { MemberAvatar, Row } from '../components/common'
import { TimesheetForm } from '../components/TimesheetForm'
import { memberName, sortMembers } from '../lib/members'
import { timesheetTotals } from '../lib/timesheets'

/** "Add timesheet": select a team member, then the timesheet form (team.md §5.1). */
export function AddTimesheetDrawer({ params, close }: DrawerProps) {
  const { t } = useTranslation()
  const drawer = useDrawer()
  const navigate = useNavigate()
  const teamMembers = useDb((s) => s.teamMembers)
  const [q, setQ] = useState('')
  const memberId = params.get('d_member')
  const member = teamMembers.find((m) => m.id === memberId)
  const eligible = useMemo(() => sortMembers(teamMembers.filter((m) => !m.archived && m.wages.enabled), 'custom'), [teamMembers])

  if (member) {
    return <TimesheetForm member={member} defaultDate={params.get('d_date') ?? undefined} onCancel={() => drawer.update({ d_member: undefined })} onSaved={(ts) => drawer.open('timesheet', { id: ts.id })} />
  }
  const visible = eligible.filter((m) => memberName(m).toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-6 py-5">
        <h2 className="font-display text-title-2 text-ink">{t('team.timesheets.selectTitle')}</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <SearchInput value={q} onChange={setQ} placeholder={t('team.timesheets.selectSearch')} />
        <p className="mb-2 mt-5 text-body-strong text-ink">{t('team.timesheets.membersHeading')}</p>
        {eligible.length === 0 ? (
          <EmptyState
            icon={<Users size={22} />}
            title={t('team.timesheets.noMembersTitle')}
            body={t('team.timesheets.noMembersBody')}
            action={
              <Button
                onClick={() => {
                  close()
                  navigate('/team/team-members')
                }}
              >
                {t('team.timesheets.viewMembers')}
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col">
            {visible.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => drawer.update({ d_member: m.id })} className="flex w-full items-center gap-3 rounded-md px-2 py-3 text-left hover:bg-sunken">
                  <MemberAvatar member={m} size={40} />
                  <span>
                    <span className="block text-body-strong text-ink">{memberName(m)}</span>
                    <span className="block text-small text-muted">{m.jobTitle}</span>
                  </span>
                </button>
              </li>
            ))}
            {visible.length === 0 && <p className="py-6 text-center text-body text-muted">{t('team.list.noResults')}</p>}
          </ul>
        )}
      </div>
    </div>
  )
}

/** Timesheet drawer with Timesheet / Activity tabs (team.md §5.2). */
export function TimesheetDrawer({ id, close }: DrawerProps) {
  const { t } = useTranslation()
  const drawer = useDrawer()
  const { timesheet, teamMembers, locations, types } = useDb(useShallow((s) => ({ timesheet: s.timesheets.find((x) => x.id === id), teamMembers: s.teamMembers, locations: s.locations, types: s.blockedTimeTypes })))
  const tab = drawer.tab === 'activity' ? 'activity' : 'timesheet'
  const [editing, setEditing] = useState(false)
  const member = teamMembers.find((m) => m.id === timesheet?.teamMemberId)

  if (!timesheet || !member) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState title={t('team.timesheets.notFound')} action={<Button onClick={close}>{t('team.common.close')}</Button>} />
      </div>
    )
  }
  if (editing) return <TimesheetForm member={member} timesheet={timesheet} onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} />

  const location = locations.find((l) => l.id === timesheet.locationId)
  const totals = timesheetTotals(timesheet, types)
  const remove = async () => {
    if (!(await confirm({ title: t('team.timesheets.deleteTitle'), body: t('team.timesheets.deleteBody'), confirmLabel: t('team.common.delete'), tone: 'danger' }))) return
    await deleteTimesheet(timesheet.id)
    toast(t('team.timesheets.toastDeleted'))
    close()
  }
  const clockedOut = timesheet.status === 'clocked_out'

  return (
    <div className="flex h-full">
      <nav className="flex w-[120px] shrink-0 flex-col border-r border-line py-4" role="tablist" aria-orientation="vertical">
        {(
          [
            ['timesheet', Timer],
            ['activity', ClipboardList],
          ] as const
        ).map(([key, Icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => drawer.update({ tab: key })}
            className={clsx('flex flex-col items-center gap-1.5 border-l-2 px-2 py-4 text-small', tab === key ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink')}
          >
            <Icon size={20} aria-hidden />
            {t(`team.timesheets.tabs.${key}`)}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1 overflow-y-auto px-6 py-6">
        {tab === 'timesheet' ? (
          <>
            <div className="flex items-center justify-between">
              <span className={clsx('chip h-8 gap-1.5 px-3 text-body-strong', clockedOut ? 'bg-success text-white' : 'bg-info-subtle text-info')}>
                <Timer size={16} aria-hidden />
                {clockedOut ? t('team.timesheets.status.clockedOutTitle') : t('team.timesheets.status.clockedInTitle')}
              </span>
              <Menu
                align="right"
                groups={[
                  {
                    items: [
                      { label: t('team.common.edit'), onSelect: () => setEditing(true) },
                      { label: t('team.timesheets.delete'), danger: true, onSelect: () => void remove() },
                    ],
                  },
                ]}
                trigger={({ open, toggle }) => (
                  <button type="button" className="icon-btn rounded-full border border-line" aria-label={t('team.common.actions')} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
                    <MoreVertical size={18} />
                  </button>
                )}
              />
            </div>
            <h2 className="mt-5 font-display text-title-1 text-ink">{t('team.timesheets.formTitle', { name: member.firstName })}</h2>
            <p className="mt-1 text-body text-muted">{format(parseISO(timesheet.date), 'EEE, MMM d, yyyy')}</p>
            <div className="mt-6 flex items-center gap-4">
              <MemberAvatar member={member} size={56} />
              <div>
                <p className="text-body-lg font-semibold text-ink">{memberName(member)}</p>
                <p className="text-body text-muted">{location?.name}</p>
              </div>
            </div>
            <ol className="mt-6 flex flex-col">
              <TimelineItem icon={<LogIn size={18} />} label={t('team.timesheets.clockedIn')} value={timesheet.clockIn} />
              {[...timesheet.breaks]
                .sort((a, b) => a.start.localeCompare(b.start))
                .map((b) => {
                  const type = types.find((x) => x.id === b.typeId)
                  return (
                    <TimelineItem
                      key={b.id}
                      icon={<span aria-hidden>{type?.emoji ?? '⏸'}</span>}
                      label={type?.name ?? t('team.timesheets.break')}
                      sub={type?.paid ? t('team.timesheets.paid') : t('team.timesheets.unpaid')}
                      value={`${b.start} - ${b.end ?? ''}`}
                      valueSub={b.end ? durationLabel(Math.max(0, totalsFor(b.start, b.end))) : undefined}
                    />
                  )
                })}
              {timesheet.clockOut && <TimelineItem icon={<LogOut size={18} />} label={t('team.timesheets.clockedOut')} value={timesheet.clockOut} last />}
            </ol>
            <div className="mt-6 border-t border-line pt-4">
              <Row label={t('team.timesheets.hoursWorked')} value={durationLabel(totals.worked)} />
              <Row label={t('team.timesheets.unpaidBreaks')} value={durationLabel(totals.unpaid)} />
              <Row label={t('team.timesheets.totalPaid')} value={durationLabel(totals.paid)} strong />
            </div>
          </>
        ) : (
          <>
            <h2 className="font-display text-title-2 text-ink">{t('team.timesheets.activityTitle')}</h2>
            <ol className="mt-6 flex flex-col gap-6">
              {[...timesheet.activity].reverse().map((a) => (
                <li key={a.id} className="border-l-2 border-primary-subtle pl-4">
                  <p className="text-body-strong text-ink">{a.title}</p>
                  <p className="text-small text-muted">{t('team.timesheets.activityAt', { date: format(parseISO(a.at), 'EEEE, MMMM d, yyyy'), time: format(parseISO(a.at), 'HH:mm') })}</p>
                  <p className="mt-1 text-body text-ink">{/created/i.test(a.title) ? t('team.timesheets.createdBy', { name: a.by.split(' ')[0] }) : t('team.timesheets.updatedBy', { name: a.by.split(' ')[0] })}</p>
                  {a.detail && (
                    <ul className="mt-2 flex flex-col gap-1 text-body text-muted">
                      {a.detail.split('\n').map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  )
}

const totalsFor = (start: string, end: string) => {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return eh * 60 + em - (sh * 60 + sm)
}

function TimelineItem({ icon, label, sub, value, valueSub, last }: { icon: ReactNode; label: string; sub?: string; value: string; valueSub?: string; last?: boolean }) {
  return (
    <li className="relative flex gap-3 pb-5">
      {!last && <span className="absolute left-[11px] top-7 h-[calc(100%-28px)] w-px bg-line-strong" aria-hidden />}
      <span className="flex h-6 w-6 shrink-0 items-center justify-center text-primary">{icon}</span>
      <div className="flex flex-1 justify-between gap-3">
        <div>
          <p className="text-body-lg text-ink">{label}</p>
          {sub && <p className="text-small text-muted">{sub}</p>}
        </div>
        <div className="text-right">
          <p className="text-body-lg text-ink tabular">{value}</p>
          {valueSub && <p className="text-small text-muted">{valueSub}</p>}
        </div>
      </div>
    </li>
  )
}

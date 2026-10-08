import clsx from 'clsx'
import { parseISO } from 'date-fns'
import { format } from '@/lib/dates'
import { ArrowDownUp, ArrowRight, Info } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useShallow } from 'zustand/react/shallow'
import type { DrawerProps } from '@/app/sectionRegistry'
import type { TeamMember } from '@/types'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { PALETTE } from '@/styles/palette'
import { money, money2, num } from '@/lib/format'
import { todayISO } from '@/lib/time'
import { Button, EmptyState, Select, Skeleton, toast } from '@/components/ui'
import { asRecord, linkedUser, sendInvite, useMemberExtras, type TriState } from '@/api/team'
import { ActionsPill, MemberAvatar, PortalMenu } from '../components/common'
import { useMemberActions } from '../components/useMemberActions'
import { colorLabel, countryLabel, memberName, roleName } from '../lib/members'
import { change, memberPerformance, PERF_PERIODS, type PerfPeriod } from '../lib/perf'

type Tab = 'overview' | 'personal' | 'workspace' | 'pay'
const TABS: Tab[] = ['overview', 'personal', 'workspace', 'pay']

/** View team member drawer (team.md §3). */
export function TeamMemberDrawer({ id, close }: DrawerProps) {
  const { t } = useTranslation()
  const drawer = useDrawer()
  const navigate = useNavigate()
  const { member, roles } = useDb(useShallow((s) => ({ member: s.teamMembers.find((m) => m.id === id), roles: s.settings.permissionRoles })))
  const actions = useMemberActions({ onDeleted: close })
  const [inviting, setInviting] = useState(false)
  const raw = drawer.tab === 'compensation' ? 'pay' : drawer.tab
  const tab: Tab = TABS.includes(raw as Tab) ? (raw as Tab) : 'overview'

  if (!member) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState title={t('team.errors.notFoundTitle')} body={t('team.errors.notFound')} action={<Button onClick={close}>{t('team.common.close')}</Button>} />
      </div>
    )
  }
  const edit = (section: string, extra = '') => navigate(`/team/team-members/edit/${member.id}?section=${section}${extra}`)
  const hasLogin = Boolean(linkedUser(member.id))

  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b border-line md:w-[380px] md:border-b-0 md:border-r">
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="font-display text-title-2 text-ink">{member.firstName}</h2>
              {member.jobTitle && <p className="text-body text-muted">{member.jobTitle}</p>}
              {member.archived && <p className="text-small text-subtle">{t('team.list.archived')}</p>}
              <div className="mt-3">
                <PortalMenu align="left" groups={[{ items: actions.items(member, 'drawer') }]} trigger={({ open, toggle }) => <ActionsPill open={open} toggle={toggle} label={t('team.common.actions')} />} />
              </div>
            </div>
            <MemberAvatar member={member} size={112} />
          </div>
          {member.role !== 'owner' && (
            <div className="mt-6 rounded-lg bg-primary-subtle/60 p-4">
              {member.invite?.status === 'pending' && !hasLogin ? (
                <>
                  <p className="text-body text-ink">{t('team.drawer.invitePending', { email: member.email, date: format(parseISO(member.invite.sentAt), 'MMM d, yyyy') })}</p>
                  <button
                    type="button"
                    disabled={inviting}
                    className="mt-3 inline-flex items-center gap-2 text-body-strong text-primary hover:underline disabled:opacity-50"
                    onClick={async () => {
                      setInviting(true)
                      await sendInvite(member.id)
                      setInviting(false)
                      toast(t('team.toasts.inviteSent'))
                    }}
                  >
                    {t('team.drawer.resend')}
                    <ArrowRight size={16} aria-hidden />
                  </button>
                </>
              ) : (
                <>
                  <p className="text-body text-ink">{t('team.drawer.roleInfo', { name: member.firstName, role: roleName(roles, member.role) })}</p>
                  {member.role !== 'none' && !hasLogin && member.email.trim() && (
                    <>
                      <p className="mt-1 text-small text-muted">{t('team.drawer.notInvited', { name: member.firstName })}</p>
                      <button
                        type="button"
                        disabled={inviting}
                        className="mt-3 inline-flex items-center gap-2 text-body-strong text-primary hover:underline disabled:opacity-50"
                        onClick={async () => {
                          setInviting(true)
                          await sendInvite(member.id)
                          setInviting(false)
                          toast(t('team.toasts.inviteSent'))
                        }}
                      >
                        {t('team.drawer.sendInvite')}
                        <ArrowRight size={16} aria-hidden />
                      </button>
                    </>
                  )}
                  {member.role === 'none' ? (
                    <button type="button" className="mt-3 inline-flex items-center gap-2 text-body-strong text-primary hover:underline" onClick={() => edit('settings', '&focus=role')}>
                      {t('team.drawer.grantAccess')}
                      <ArrowRight size={16} aria-hidden />
                    </button>
                  ) : (
                    <button type="button" className="mt-3 inline-flex items-center gap-2 text-body-strong text-primary hover:underline" onClick={() => actions.openRole(member)}>
                      {t('team.actions.editRole')}
                      <ArrowRight size={16} aria-hidden />
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-line p-3 md:flex-col md:overflow-visible" role="tablist" aria-orientation="vertical">
          {TABS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => drawer.update({ tab: key })}
              className={clsx('h-11 shrink-0 rounded-md px-4 text-left text-body', tab === key ? 'bg-primary-subtle font-semibold text-primary' : 'text-ink hover:bg-sunken')}
            >
              {t(`team.drawer.tabs.${key}`)}
            </button>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1 overflow-y-auto bg-canvas p-6">
        {tab === 'overview' && <OverviewTab member={member} />}
        {tab === 'personal' && <PersonalTab member={member} onEdit={() => edit('profile')} />}
        {tab === 'workspace' && <WorkspaceTab member={member} onEdit={() => edit('settings')} />}
        {tab === 'pay' && <PayTab member={member} onEdit={() => edit('wagesAndTimesheets')} />}
      </div>
      {actions.modals}
    </div>
  )
}

function TabHeader({ title, onEdit }: { title: string; onEdit?: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="mb-5 flex items-center justify-between">
      <h2 className="font-display text-title-1 text-ink">{title}</h2>
      {onEdit && <Button onClick={onEdit}>{t('team.common.edit')}</Button>}
    </div>
  )
}

function Block({ title, rows }: { title: string; rows: { label: string; value: ReactNode }[] }) {
  return (
    <section className="card mb-4 p-5">
      <h3 className="mb-3 font-display text-title-3 text-ink">{title}</h3>
      <dl className="flex flex-col divide-y divide-line">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-6 py-2.5">
            <dt className="text-body text-muted">{r.label}</dt>
            <dd className="text-right text-body text-ink">{r.value || '-'}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function Kpi({ label, value, delta, children }: { label: string; value: string; delta: number; children?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="card p-5">
      <p className="flex items-center gap-1.5 text-body-strong text-ink">
        {label}
        <Info size={14} className="text-subtle" aria-hidden />
      </p>
      <p className="mt-2 font-display text-title-1 text-ink tabular">{value}</p>
      <p className="mt-2 flex items-center gap-2 text-small text-muted">
        <span className={clsx('chip h-6 gap-1 ring-1 ring-line', delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : 'text-ink')}>
          <ArrowDownUp size={12} aria-hidden />
          {`${delta > 0 ? '+' : ''}${delta}%`}
        </span>
        {t('team.drawer.vsPrev')}
      </p>
      {children}
    </div>
  )
}

function OverviewTab({ member }: { member: TeamMember }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [period, setPeriod] = useState<PerfPeriod>('week_to_date')
  const data = useDb(useShallow((s) => ({ sales: s.sales, appointments: s.appointments, shiftPatterns: s.shiftPatterns, shiftOverrides: s.shiftOverrides, closedPeriods: s.closedPeriods, timeOff: s.timeOff })))
  const perf = useMemo(() => memberPerformance(data, member.id, period, todayISO()), [data, member.id, period])
  const color = PALETTE[member.color].edge
  const { current: c, previous: p } = perf
  return (
    <>
      <h2 className="font-display text-title-1 text-ink">{t('team.drawer.tabs.overview')}</h2>
      <div className="mb-5 mt-4 flex items-end justify-between gap-4">
        <div>
          <h3 className="text-body-lg font-semibold text-ink">{t('team.drawer.dashboard')}</h3>
          <button type="button" className="text-body text-primary hover:underline" onClick={() => navigate(`/reports/table/performance?teamMemberId=${member.id}`)}>
            {t('team.drawer.fullDashboard')}
          </button>
        </div>
        <Select aria-label={t('team.drawer.period')} value={period} onChange={(e) => setPeriod(e.target.value as PerfPeriod)} options={PERF_PERIODS.map((x) => ({ value: x, label: t(`team.drawer.periods.${x}`) }))} className="w-auto rounded-full" />
      </div>
      <Kpi label={t('team.drawer.kpi.sales')} value={money2(c.sales)} delta={change(c.sales, p.sales)}>
        <div className="mt-4 h-[180px]" aria-hidden>
          {c.daily.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={c.daily.map((d) => ({ label: format(parseISO(d.date), 'MMM d'), value: d.value }))} margin={{ top: 5, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="rgb(var(--border))" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: 'rgb(var(--text-muted))' }} interval="preserveStartEnd" />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: 'rgb(var(--text-muted))' }} tickFormatter={(v: number) => money(v)} width={56} />
                <Tooltip formatter={(v: number) => money2(v)} contentStyle={{ borderRadius: 10, border: '1px solid rgb(var(--border))', background: 'rgb(var(--surface-raised))' }} />
                <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center rounded-md bg-sunken text-small text-muted">{money2(c.sales)}</div>
          )}
        </div>
      </Kpi>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Kpi label={t('team.drawer.kpi.appointments')} value={String(c.appointments)} delta={change(c.appointments, p.appointments)} />
        <Kpi label={t('team.drawer.kpi.clients')} value={String(c.clients)} delta={change(c.clients, p.clients)} />
        <Kpi label={t('team.drawer.kpi.occupancy')} value={`${c.occupancy}%`} delta={change(c.occupancy, p.occupancy)} />
        <Kpi label={t('team.drawer.kpi.retention')} value={`${c.retention}%`} delta={change(c.retention, p.retention)} />
      </div>
    </>
  )
}

function PersonalTab({ member, onEdit }: { member: TeamMember; onEdit: () => void }) {
  const { t } = useTranslation()
  const rec = asRecord(member, useMemberExtras())
  const birthday = member.birthday ? (member.birthday.startsWith('0000') ? format(parseISO(`2000${member.birthday.slice(4)}`), 'MMM d') : format(parseISO(member.birthday), 'MMM d, yyyy')) : ''
  return (
    <>
      <TabHeader title={t('team.drawer.tabs.personal')} onEdit={onEdit} />
      <Block
        title={t('team.form.nav.profile')}
        rows={[
          { label: t('team.drawer.fullName'), value: memberName(member) },
          { label: t('team.form.profile.email'), value: member.email },
          { label: t('team.form.profile.phone'), value: member.phone },
          { label: t('team.form.profile.additionalPhone'), value: rec.additionalPhone },
          { label: t('team.drawer.dob'), value: birthday },
          { label: t('team.form.profile.country'), value: countryLabel(member.country) },
          { label: t('team.form.profile.gender'), value: member.gender ? t(`team.gender.${member.gender}`, { defaultValue: member.gender }) : '' },
          { label: t('team.form.profile.pronouns'), value: member.pronouns ? t(`team.pronouns.${member.pronouns}`, { defaultValue: member.pronouns }) : '' },
          {
            label: t('team.form.profile.color'),
            value: (
              <span className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: PALETTE[member.color].edge }} aria-hidden />
                {colorLabel(member.color)}
              </span>
            ),
          },
          { label: t('team.form.profile.jobTitle'), value: member.jobTitle },
        ]}
      />
      <Block
        title={t('team.form.work.title')}
        rows={[
          { label: t('team.drawer.employment'), value: `${format(parseISO(member.startDate), 'MMM d, yyyy')} - ${member.endDate ? format(parseISO(member.endDate), 'MMM d, yyyy') : t('team.drawer.present')}` },
          { label: t('team.form.work.employmentType'), value: member.employmentType ? t(`team.employment.${member.employmentType}`) : '' },
          { label: t('team.form.work.memberId'), value: member.teamMemberCode },
        ]}
      />
      {(rec.addresses?.length ?? 0) > 0 && (
        <Block title={t('team.form.nav.addresses')} rows={rec.addresses!.map((a) => ({ label: t(`team.form.addresses.types.${a.type}`), value: [a.line1, `${a.postcode} ${a.city}`].filter(Boolean).join(', ') }))} />
      )}
      {(rec.emergencyContacts?.length ?? 0) > 0 && <Block title={t('team.form.nav.emergencyContacts')} rows={rec.emergencyContacts!.map((c) => ({ label: c.fullName, value: c.phone }))} />}
    </>
  )
}

function WorkspaceTab({ member, onEdit }: { member: TeamMember; onEdit: () => void }) {
  const { t } = useTranslation()
  const { locations, roles } = useDb(useShallow((s) => ({ locations: s.locations, roles: s.settings.permissionRoles })))
  return (
    <>
      <TabHeader title={t('team.drawer.tabs.workspace')} onEdit={onEdit} />
      <Block title={t('team.form.nav.services')} rows={[{ label: t('team.drawer.provides'), value: member.serviceIds === 'all' ? t('team.drawer.allServices') : t('team.drawer.nServices', { count: member.serviceIds.length }) }]} />
      <Block
        title={t('team.form.nav.settings')}
        rows={[
          { label: t('team.form.settings.bookingsTitle'), value: member.bookable ? t('team.drawer.enabled') : t('team.drawer.disabled') },
          { label: t('team.form.settings.roleTitle'), value: roleName(roles, member.role) },
          { label: t('team.form.settings.linkedTitle'), value: member.linkedCalendars.length ? String(member.linkedCalendars.length) : t('team.drawer.none') },
        ]}
      />
      <section className="card p-5">
        <h3 className="mb-3 font-display text-title-3 text-ink">{t('team.form.locations.title')}</h3>
        {member.locationIds.length === 0 && <p className="text-body text-muted">-</p>}
        {member.locationIds.map((lid) => {
          const l = locations.find((x) => x.id === lid)
          return l ? (
            <div key={lid} className="py-2">
              <p className="text-body-strong text-ink">{l.name}</p>
              <p className="text-small text-muted">{`${l.address.line1}, ${l.address.postcode} ${l.address.city}`}</p>
            </div>
          ) : null
        })}
      </section>
    </>
  )
}

function PayTab({ member, onEdit }: { member: TeamMember; onEdit: () => void }) {
  const { t } = useTranslation()
  const rec = asRecord(member, useMemberExtras())
  const ts = rec.timesheetSettings
  const tri = (v: TriState | undefined) => (v === 'enabled' ? t('team.form.wages.enabled') : v === 'disabled' ? t('team.form.wages.disabled') : t('team.form.wages.default'))
  const prs = rec.payRunSettings
  return (
    <>
      <TabHeader title={t('team.drawer.tabs.pay')} onEdit={onEdit} />
      <Block
        title={t('team.form.nav.wagesAndTimesheets')}
        rows={
          member.wages.enabled
            ? [
                { label: t('team.form.wages.rate'), value: rec.compensationType === 'none' ? t('team.form.wages.none') : money2(member.wages.hourlyRate) },
                { label: t('team.form.wages.overtime'), value: member.wages.overtime ? t('team.drawer.enabled') : t('team.drawer.none') },
                { label: t('team.form.wages.location'), value: tri(ts?.proximity) },
                { label: t('team.form.wages.autoIn'), value: tri(ts?.autoClockIn) },
                { label: t('team.form.wages.autoOut'), value: tri(ts?.autoClockOut) },
                { label: t('team.form.wages.autoBreaks'), value: tri(ts?.autoBreaks) },
              ]
            : [{ label: t('team.drawer.wages'), value: t('team.common.off') }]
        }
      />
      <Block
        title={t('team.form.nav.commissions')}
        rows={
          member.commission.enabled
            ? [
                { label: t('team.form.commissions.serviceRate'), value: `${num(Math.round(member.commission.serviceRate * 1000) / 10)}%` },
                { label: t('team.form.commissions.productRate'), value: `${num(Math.round(member.commission.productRate * 1000) / 10)}%` },
              ]
            : [{ label: t('team.form.nav.commissions'), value: t('team.common.off') }]
        }
      />
      <Block
        title={t('team.form.nav.payruns')}
        rows={
          member.payRuns.enabled
            ? [
                { label: t('team.drawer.preferredMethod'), value: t('team.form.payruns.manual') },
                { label: t('team.drawer.processingFees'), value: prs?.deductProcessingFees ? t('team.drawer.memberPays') : t('team.drawer.businessPays') },
                { label: t('team.drawer.newClientFees'), value: prs?.deductNewClientFees ? t('team.drawer.memberPays') : t('team.drawer.businessPays') },
                { label: t('team.drawer.cashAdvances'), value: prs?.cashAdvances ? t('team.drawer.enabled') : t('team.drawer.disabled') },
              ]
            : [{ label: t('team.form.nav.payruns'), value: t('team.common.off') }]
        }
      />
    </>
  )
}

/** Skeleton while the drawer content loads. */
export function DrawerSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  )
}

import clsx from 'clsx'
import { addWeeks, parseISO } from 'date-fns'
import { CalendarClock, Check, ChevronDown, ChevronLeft, ChevronRight, MapPin, RotateCw, Search, Settings, SlidersHorizontal, Users } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar } from '@/components/ui'
import { useDb } from '@/store/db'
import { useCurrentUser } from '@/store/session'
import type { ID, ISODate, TeamMember } from '@/types'
import { todayISO, toISODate } from '@/lib/time'
import { CAL_VIEWS, memberName, parseTeam, rangeLabel, stepDate, teamValue, type CalView } from './lib'
import { CountBadge, Dropdown, DropMenu, MonthsPicker, Pill } from './ui'

export type AddAction = 'appointment' | 'group' | 'blocked' | 'sale' | 'quick-payment'

interface ToolbarProps {
  date: ISODate
  view: CalView
  locationId: ID
  team: string
  members: TeamMember[]
  filterCount: number
  waitlistCount: number
  pickMode: boolean
  /** Group pick modes keep the group's day: date navigation and view are disabled. */
  lockDate?: boolean
  onPatch: (values: Record<string, string | undefined>) => void
  onFilters: () => void
  onSettings: () => void
  onWaitlist: () => void
  onAdd: (action: AddAction) => void
}

export function CalendarToolbar(p: ToolbarProps) {
  const { t } = useTranslation()
  const today = todayISO()
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-canvas px-4 py-3" data-testid="calendar-toolbar">
      <Pill disabled={p.lockDate} onClick={() => p.onPatch({ date: today })}>
        {t('calendar.toolbar.today')}
      </Pill>
      <div className={clsx('inline-flex h-9 items-stretch rounded-full border border-line-strong bg-surface', p.lockDate && 'pointer-events-none opacity-50')} aria-disabled={p.lockDate || undefined}>
        <button type="button" disabled={p.lockDate} className="flex w-10 items-center justify-center rounded-l-full hover:bg-sunken" aria-label={t('calendar.toolbar.prev')} onClick={() => p.onPatch({ date: stepDate(p.view, p.date, -1) })}>
          <ChevronLeft size={18} aria-hidden />
        </button>
        <DatePopover date={p.date} view={p.view} onSelect={(date) => p.onPatch({ date })} />
        <button type="button" disabled={p.lockDate} className="flex w-10 items-center justify-center rounded-r-full hover:bg-sunken" aria-label={t('calendar.toolbar.next')} onClick={() => p.onPatch({ date: stepDate(p.view, p.date, 1) })}>
          <ChevronRight size={18} aria-hidden />
        </button>
      </div>
      <LocationSelector locationId={p.locationId} onSelect={(id) => p.onPatch({ location_id: id, calendar_selected_resources: 'e-all' })} />
      <TeamSelector team={p.team} members={p.members} onSelect={(value) => p.onPatch({ calendar_selected_resources: value })} />
      <Pill active={p.filterCount > 0} onClick={p.onFilters} aria-label={t('calendar.toolbar.filters')} title={t('calendar.toolbar.filters')} className="w-[52px] px-0">
        <SlidersHorizontal size={18} aria-hidden />
      </Pill>
      <div className="ml-auto flex items-center gap-2">
        <Pill onClick={p.onSettings} aria-label={t('calendar.toolbar.settings')} title={t('calendar.toolbar.settings')} className="w-[52px] px-0">
          <Settings size={18} aria-hidden />
        </Pill>
        <Pill onClick={p.onWaitlist} aria-label={t('calendar.toolbar.waitlist')} title={t('calendar.toolbar.waitlist')} className={clsx(p.waitlistCount ? 'px-3' : 'w-[52px] px-0')}>
          <CalendarClock size={18} aria-hidden />
          {p.waitlistCount > 0 && <CountBadge value={p.waitlistCount} />}
        </Pill>
        <div className={clsx('inline-flex h-9 items-stretch rounded-full border border-line-strong bg-surface', p.lockDate && 'pointer-events-none opacity-50')} aria-disabled={p.lockDate || undefined}>
          <button
            type="button"
            disabled={p.lockDate}
            onClick={() => p.onPatch({ date: today, view: 'day', calendar_selected_resources: 'e-working' })}
            className="flex w-10 items-center justify-center rounded-l-full border-r border-line hover:bg-sunken"
            aria-label={t('calendar.toolbar.resetAria')}
            title={t('calendar.toolbar.reset')}
          >
            <RotateCw size={16} aria-hidden />
          </button>
          <DropMenu
            align="right"
            width={180}
            trigger={({ open, toggle }) => (
              <button type="button" onClick={toggle} aria-expanded={open} aria-haspopup="menu" className="inline-flex items-center gap-2 rounded-r-full pl-4 pr-3 text-body hover:bg-sunken">
                {t(`calendar.views.${p.view}`)}
                <ChevronDown size={16} aria-hidden />
              </button>
            )}
            groups={[{ items: CAL_VIEWS.map((v) => ({ label: t(`calendar.views.${v}`), checked: v === p.view, onSelect: () => p.onPatch({ view: v }) })) }]}
          />
        </div>
        <DropMenu
          align="right"
          width={220}
          trigger={({ open, toggle }) => (
            <button
              type="button"
              onClick={toggle}
              disabled={p.pickMode}
              aria-expanded={open}
              aria-haspopup="menu"
              className="inline-flex h-9 items-center gap-2 rounded-full bg-ink px-4 text-body-strong text-canvas hover:opacity-90 disabled:opacity-50"
              data-testid="calendar-add"
            >
              {t('calendar.toolbar.add')}
              <ChevronDown size={16} aria-hidden />
            </button>
          )}
          groups={[
            {
              items: (['appointment', 'group', 'blocked', 'sale', 'quick-payment'] as AddAction[]).map((a) => ({ label: t(`calendar.add.${a}`), onSelect: () => p.onAdd(a) })),
            },
          ]}
        />
      </div>
    </div>
  )
}

const SHORTCUTS = [1, 2, 3, 4, 5]
const MORE_SHORTCUTS = [6, 7, 8, 10, 12]

function DatePopover({ date, view, onSelect }: { date: ISODate; view: CalView; onSelect: (date: ISODate) => void }) {
  const { t } = useTranslation()
  return (
    <Dropdown
      trigger={({ open, toggle }) => (
        <button type="button" onClick={toggle} aria-expanded={open} className={clsx('min-w-[175px] border-x border-line px-4 text-body text-ink hover:bg-sunken', open && 'bg-sunken')} data-testid="calendar-date-label">
          {rangeLabel(view, date)}
        </button>
      )}
      panelClassName="p-6"
    >
      {(close) => {
        const pick = (d: ISODate) => {
          onSelect(d)
          close()
        }
        return (
          <div>
            <MonthsPicker value={date} onSelect={pick} wide />
            <div className="mt-6 flex flex-nowrap items-center gap-2">
              {SHORTCUTS.map((w) => (
                <Pill key={w} onClick={() => pick(toISODate(addWeeks(parseISO(todayISO()), w)))}>
                  {t('calendar.toolbar.inWeeks', { count: w })}
                </Pill>
              ))}
              <DropMenu
                width={170}
                trigger={({ open, toggle }) => (
                  <Pill onClick={toggle} aria-expanded={open}>
                    {t('calendar.toolbar.more')} <ChevronDown size={14} aria-hidden />
                  </Pill>
                )}
                groups={[{ items: MORE_SHORTCUTS.map((w) => ({ label: t('calendar.toolbar.inWeeks', { count: w }), onSelect: () => pick(toISODate(addWeeks(parseISO(todayISO()), w))) })) }]}
              />
            </div>
          </div>
        )
      }}
    </Dropdown>
  )
}

function LocationSelector({ locationId, onSelect }: { locationId: ID; onSelect: (id: ID) => void }) {
  const { t } = useTranslation()
  const locations = useDb((s) => s.locations)
  const current = locations.find((l) => l.id === locationId)
  return (
    <DropMenu
      width={260}
      trigger={({ open, toggle }) => (
        <Pill onClick={toggle} aria-expanded={open} aria-label={t('calendar.toolbar.location')} data-testid="calendar-location">
          <MapPin size={16} aria-hidden />
          {current?.internalName ?? current?.name}
          <ChevronDown size={16} aria-hidden />
        </Pill>
      )}
      groups={[{ heading: t('calendar.toolbar.location'), items: locations.map((l) => ({ label: l.name, hint: `${l.address.line1}, ${l.address.city}`, checked: l.id === locationId, onSelect: () => onSelect(l.id) })) }]}
    />
  )
}

function TeamSelector({ team, members, onSelect }: { team: string; members: TeamMember[]; onSelect: (value: string) => void }) {
  const { t } = useTranslation()
  const user = useCurrentUser()
  const [query, setQuery] = useState('')
  const parsed = parseTeam(team)
  const me = members.find((m) => m.id === user?.teamMemberId)
  const selectedIds = parsed.mode === 'custom' ? parsed.ids.filter((id) => members.some((m) => m.id === id)) : members.map((m) => m.id)
  const label =
    parsed.mode === 'working'
      ? t('calendar.team.scheduled')
      : parsed.mode === 'all' || selectedIds.length === members.length
        ? t('calendar.team.all')
        : selectedIds.length === 1
          ? memberName(members.find((m) => m.id === selectedIds[0]))
          : t('calendar.team.count', { count: selectedIds.length })
  const filtered = useMemo(() => members.filter((m) => memberName(m).toLowerCase().includes(query.trim().toLowerCase())), [members, query])

  const toggle = (id: ID) => {
    const next = selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]
    if (!next.length) return
    onSelect(next.length === members.length ? 'e-all' : teamValue(members.filter((m) => next.includes(m.id)).map((m) => m.id)))
  }

  const row = (active: boolean, icon: ReactNode, text: string, onClick: () => void) => (
    <button type="button" onClick={onClick} className={clsx('flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-body', active ? 'bg-primary-subtle text-ink' : 'text-ink hover:bg-sunken')}>
      {icon}
      <span className="flex-1 truncate">{text}</span>
      {active && <Check size={16} className="text-primary" aria-hidden />}
    </button>
  )

  return (
    <Dropdown
      width={380}
      trigger={({ open, toggle: toggleOpen }) => (
        <Pill onClick={toggleOpen} aria-expanded={open} data-testid="calendar-team">
          <span className="max-w-[180px] truncate">{label}</span>
          <ChevronDown size={16} className={clsx('transition-transform', open && 'rotate-180')} aria-hidden />
        </Pill>
      )}
      panelClassName="p-3"
    >
      {(close) => (
        <div>
          <label className="relative mb-2 block">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('calendar.team.search')} aria-label={t('calendar.team.search')} className="input h-10 pl-9" />
          </label>
          {row(parsed.mode === 'working', <CalendarClock size={18} className="text-muted" aria-hidden />, t('calendar.team.scheduled'), () => {
            onSelect('e-working')
            close()
          })}
          {row(parsed.mode === 'all', <Users size={18} className="text-muted" aria-hidden />, t('calendar.team.all'), () => {
            onSelect('e-all')
            close()
          })}
          {me &&
            row(parsed.mode === 'custom' && selectedIds.length === 1 && selectedIds[0] === me.id, <Avatar name={memberName(me)} color={me.color} size={26} />, t('calendar.team.you', { name: memberName(me) }), () => {
              onSelect(teamValue([me.id]))
              close()
            })}
          <div className="my-2 border-t border-line" />
          <label className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-sunken">
            <input type="checkbox" className="h-5 w-5 accent-[rgb(var(--primary))]" checked={selectedIds.length === members.length} onChange={() => onSelect('e-all')} />
            <span className="text-body-strong text-ink">{t('calendar.team.allMembers')}</span>
          </label>
          <div className="max-h-64 overflow-y-auto">
            {filtered.map((m) => (
              <label key={m.id} className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-sunken">
                <input type="checkbox" className="h-5 w-5 accent-[rgb(var(--primary))]" checked={selectedIds.includes(m.id)} onChange={() => toggle(m.id)} />
                <Avatar name={memberName(m)} color={m.color} size={28} />
                <span className="truncate text-body text-ink">{memberName(m)}</span>
              </label>
            ))}
            {!filtered.length && <p className="px-3 py-2 text-small text-muted">{t('calendar.team.noResults')}</p>}
          </div>
        </div>
      )}
    </Dropdown>
  )
}

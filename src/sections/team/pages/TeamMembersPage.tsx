import { differenceInCalendarDays, parseISO } from 'date-fns'
import { ChevronDown, ChevronUp, SlidersHorizontal, Users } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import type { TeamMember } from '@/types'
import { useDb } from '@/store/db'
import { useMemberExtras } from '@/api/team'
import { exportCsv, exportedFileName, exportXlsx } from '@/lib/export'
import { todayISO } from '@/lib/time'
import { Button, Checkbox, Chip, DataTable, EmptyState, Menu, MenuButton, Page, PageHeader, PageSkeleton, RadioGroup, SearchInput, SideDrawer, Toolbar, toast, usePageLoading, type Column } from '@/components/ui'
import { ActionsPill, MemberAvatar, PortalMenu, SortMenu } from '../components/common'
import { ShareLinkModal } from '../components/ShareLinkModal'
import { useMemberActions } from '../components/useMemberActions'
import { TimeOffModal } from '../components/TimeOffModal'
import { MEMBER_SORTS, memberName, roleName, sortMembers, type MemberSort } from '../lib/members'

type Status = 'all' | 'active' | 'archived'
type MemberType = 'bookable' | 'nonBookable'
const STATUS_PARAM = 'staff-overview-list-status'

export function TeamMembersPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loading = usePageLoading()
  const [params, setParams] = useSearchParams()
  const { teamMembers, locations, roles, plan } = useDb(useShallow((s) => ({ teamMembers: s.teamMembers, locations: s.locations, roles: s.settings.permissionRoles, plan: s.workspace.plan })))
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<MemberSort>('custom')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const status = (params.get(STATUS_PARAM) as Status | null) ?? 'active'
  const [locationFilter, setLocationFilter] = useState<string[]>([])
  const [typeFilter, setTypeFilter] = useState<MemberType[]>([])
  const actions = useMemberActions()
  const extras = useMemberExtras()

  // `?d_timeoff=<memberId>` opens Add time off directly (calendar links here).
  const timeOffParam = params.get('d_timeoff')
  const closeTimeOffParam = () =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('d_timeoff')
      return next
    })

  const activeCount = teamMembers.filter((m) => !m.archived).length
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = teamMembers.filter((m) => {
      if (status === 'active' && m.archived) return false
      if (status === 'archived' && !m.archived) return false
      if (locationFilter.length && !m.locationIds.some((l) => locationFilter.includes(l))) return false
      if (typeFilter.length && !typeFilter.includes(m.bookable ? 'bookable' : 'nonBookable')) return false
      if (q && !`${memberName(m)} ${m.email} ${m.phone ?? ''} ${m.jobTitle}`.toLowerCase().includes(q)) return false
      return true
    })
    return sortMembers(list, sort, extras)
  }, [teamMembers, status, locationFilter, typeFilter, search, sort, extras])

  const filterCount = (status !== 'active' ? 1 : 0) + (locationFilter.length ? 1 : 0) + (typeFilter.length ? 1 : 0)

  const exportRows = (fmt: 'csv' | 'xlsx') => {
    const table = {
      headers: (['firstName', 'lastName', 'email', 'phone', 'jobTitle', 'role', 'bookings', 'locations', 'startDate', 'status'] as const).map((key) => t(`team.export.headers.${key}`)),
      rows: rows.map((m) => [
        m.firstName,
        m.lastName,
        m.email,
        m.phone ?? '',
        m.jobTitle,
        roleName(roles, m.role),
        m.bookable ? t('team.drawer.enabled') : t('team.drawer.disabled'),
        m.locationIds.map((id) => locations.find((l) => l.id === id)?.name ?? '').join(', '),
        m.startDate,
        m.archived ? t('team.list.archived') : t('team.filters.active'),
      ]),
    }
    if (fmt === 'csv') exportCsv(exportedFileName(), [table])
    else void exportXlsx(exportedFileName(), [table])
    toast(t('team.toasts.reportGenerated'))
  }

  const columns: Column<TeamMember>[] = [
    {
      key: 'name',
      header: t('team.list.name'),
      sortValue: (m) => memberName(m).toLowerCase(),
      cell: (m) => (
        <div className="flex items-center gap-3">
          <MemberAvatar member={m} size={48} />
          <div className="min-w-0">
            <p className="text-body-strong text-ink">{memberName(m)}</p>
            {m.jobTitle && <p className="text-small text-muted">{m.jobTitle}</p>}
            {m.archived && <p className="text-small text-subtle">{t('team.list.archived')}</p>}
          </div>
        </div>
      ),
    },
    {
      key: 'contact',
      header: t('team.list.contact'),
      cell: (m) => (
        <div className="flex flex-col text-body">
          {m.email && (
            <a href={`mailto:${m.email}`} onClick={(e) => e.stopPropagation()} className="text-muted hover:text-primary hover:underline">
              {m.email}
            </a>
          )}
          {m.phone && (
            <a href={`tel:${m.phone.replace(/\s/g, '')}`} onClick={(e) => e.stopPropagation()} className="text-muted hover:text-primary hover:underline">
              {m.phone}
            </a>
          )}
        </div>
      ),
    },
    {
      key: 'role',
      header: t('team.list.role'),
      cell: (m) => (
        <div>
          <p className="text-body text-ink">{roleName(roles, m.role)}</p>
          {m.invite?.status === 'pending' && (
            <Chip tone="warning" className="mt-1">
              {t('team.list.invitePending')}
            </Chip>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (m) => (
        <PortalMenu groups={[{ items: actions.items(m) }]} trigger={({ open, toggle }) => <ActionsPill open={open} toggle={toggle} label={t('team.common.actions')} />} />
      ),
    },
  ]

  if (loading) return <Page><PageSkeleton /></Page>

  const trialDays = plan.status === 'trial' ? Math.max(0, differenceInCalendarDays(parseISO(plan.trialEndsAt), parseISO(todayISO()))) : null

  return (
    <Page>
      <PageHeader
        title={t('team.list.title')}
        count={activeCount}
        actions={
          <>
            <Menu
              align="right"
              width={240}
              groups={[
                {
                  items: [
                    { label: t('team.list.options.share'), onSelect: () => setShareOpen(true) },
                    { label: t('team.list.options.order'), onSelect: () => navigate('/team/team-members/reorder') },
                    { label: t('team.list.options.settings'), onSelect: () => navigate('/setup/team/permissions') },
                  ],
                },
                {
                  heading: t('team.list.options.export'),
                  items: [
                    { label: t('team.list.options.csv'), onSelect: () => exportRows('csv') },
                    { label: t('team.list.options.excel'), onSelect: () => exportRows('xlsx') },
                  ],
                },
              ]}
              trigger={({ open, toggle }) => (
                <MenuButton open={open} toggle={toggle}>
                  {t('team.common.options')}
                </MenuButton>
              )}
            />
            <Button variant="primary" onClick={() => navigate('/team/team-members/add')}>
              {t('team.common.add')}
            </Button>
          </>
        }
      />

      {trialDays !== null && (
        <div className="mb-5 flex items-center justify-between gap-4 rounded-lg border border-accent/40 bg-accent-subtle px-5 py-3">
          <p className="text-body text-ink">{t('team.list.trial', { days: trialDays })}</p>
          <Button variant="primary" size="sm" onClick={() => navigate('/setup/billing/subscriptions')}>
            {t('team.list.activatePlan')}
          </Button>
        </div>
      )}

      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder={t('team.list.search')} className="md:max-w-[320px]" />
        <Button className="rounded-full" icon={<SlidersHorizontal size={16} />} onClick={() => setFiltersOpen(true)}>
          {t('team.common.filters')}
          {filterCount > 0 && <span className="chip h-5 bg-primary px-1.5 text-caption text-on-primary">{filterCount}</span>}
        </Button>
        <div className="ml-auto">
          <SortMenu value={sort} onChange={setSort} options={MEMBER_SORTS.map((s) => ({ value: s, label: t(`team.sort.${s}`) }))} />
        </div>
      </Toolbar>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(m) => m.id}
        onRowClick={(m) => navigate(`/team/team-members/edit/${m.id}`)}
        selectable={{ selected, onChange: setSelected }}
        empty={
          teamMembers.length === 0 ? (
            <EmptyState icon={<Users size={24} />} title={t('team.list.emptyTitle')} body={t('team.list.emptyBody')} action={<Button variant="primary" onClick={() => navigate('/team/team-members/add')}>{t('team.common.add')}</Button>} />
          ) : (
            <EmptyState title={t('team.list.noResults')} body={t('team.list.noResultsBody')} action={<Button onClick={() => { setSearch(''); setLocationFilter([]); setTypeFilter([]); setParams({}) }}>{t('team.common.clearFilters')}</Button>} />
          )
        }
      />

      <FiltersDrawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        locations={locations}
        initial={{ locations: locationFilter, types: typeFilter, status }}
        onApply={(f) => {
          setLocationFilter(f.locations)
          setTypeFilter(f.types)
          setParams((prev) => {
            const next = new URLSearchParams(prev)
            if (f.status === 'active') next.delete(STATUS_PARAM)
            else next.set(STATUS_PARAM, f.status)
            return next
          })
          setFiltersOpen(false)
        }}
      />
      <ShareLinkModal open={shareOpen} onClose={() => setShareOpen(false)} />
      {actions.modals}
      <TimeOffModal open={Boolean(timeOffParam)} memberId={timeOffParam} onClose={closeTimeOffParam} />
    </Page>
  )
}

function Collapsible({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="border-b border-line py-4 last:border-0">
      <button type="button" className="flex w-full items-center justify-between text-left text-body-strong text-ink" aria-expanded={open} onClick={() => setOpen(!open)}>
        {title}
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open && <div className="mt-3 flex flex-col gap-3">{children}</div>}
    </div>
  )
}

function FiltersDrawer({
  open,
  onClose,
  locations,
  initial,
  onApply,
}: {
  open: boolean
  onClose: () => void
  locations: { id: string; name: string; address: { line1: string; postcode: string; city: string } }[]
  initial: { locations: string[]; types: MemberType[]; status: Status }
  onApply: (f: { locations: string[]; types: MemberType[]; status: Status }) => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(initial)
  useEffect(() => {
    if (open) setDraft(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value])
  return (
    <SideDrawer
      open={open}
      onClose={onClose}
      title={t('team.filters.title')}
      footer={
        <>
          <Button onClick={() => setDraft({ locations: [], types: [], status: 'active' })}>{t('team.common.clearFilters')}</Button>
          <Button variant="primary" onClick={() => onApply(draft)}>
            {t('team.common.apply')}
          </Button>
        </>
      }
    >
      <Collapsible title={t('team.filters.locations')}>
        <Checkbox label={t('team.filters.selectAll')} checked={draft.locations.length === locations.length} onChange={(v) => setDraft({ ...draft, locations: v ? locations.map((l) => l.id) : [] })} />
        {locations.map((l) => (
          <Checkbox key={l.id} label={l.name} hint={`${l.address.line1}, ${l.address.postcode} ${l.address.city}`} checked={draft.locations.includes(l.id)} onChange={() => setDraft({ ...draft, locations: toggle(draft.locations, l.id) })} />
        ))}
      </Collapsible>
      <Collapsible title={t('team.filters.type')}>
        <Checkbox label={t('team.filters.bookable')} checked={draft.types.includes('bookable')} onChange={() => setDraft({ ...draft, types: toggle(draft.types, 'bookable') })} />
        <Checkbox label={t('team.filters.nonBookable')} checked={draft.types.includes('nonBookable')} onChange={() => setDraft({ ...draft, types: toggle(draft.types, 'nonBookable') })} />
      </Collapsible>
      <Collapsible title={t('team.filters.status')}>
        <RadioGroup<Status>
          value={draft.status}
          onChange={(v) => setDraft({ ...draft, status: v })}
          options={[
            { value: 'all', label: t('team.filters.all') },
            { value: 'active', label: t('team.filters.active') },
            { value: 'archived', label: t('team.filters.archived') },
          ]}
        />
      </Collapsible>
    </SideDrawer>
  )
}

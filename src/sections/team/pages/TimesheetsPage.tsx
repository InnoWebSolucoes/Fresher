import { SlidersHorizontal, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import type { Timesheet } from '@/types'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { durationLabel } from '@/lib/time'
import { fmtDate } from '@/lib/format'
import { Button, Chip, DataTable, EmptyState, IntroPage, Menu, MenuButton, Modal, Page, PageHeader, PageSkeleton, RadioGroup, SearchInput, Toolbar, toast, usePageLoading, type Column } from '@/components/ui'
import { enableTimesheets } from '@/api/team'
import { MemberAvatar, SortMenu, Tour } from '../components/common'
import { RangePicker, resolveRange, type RangeValue } from '../components/RangePicker'
import { memberName } from '../lib/members'
import { isLate, timesheetTotals } from '../lib/timesheets'

const SORTS = ['dateDesc', 'dateAsc', 'memberAsc', 'memberDesc', 'breaksDesc', 'breaksAsc'] as const
type Sort = (typeof SORTS)[number]
type StatusFilter = 'all' | 'clocked_in' | 'clocked_out'
type PunctualityFilter = 'all' | 'on_time' | 'late'

/** Timesheets list (team.md §5). */
export function TimesheetsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const drawer = useDrawer()
  const loading = usePageLoading()
  const { enabled, timesheets, teamMembers, locations, types, shiftPatterns, shiftOverrides } = useDb(
    useShallow((s) => ({ enabled: s.settings.timesheets.enabled, timesheets: s.timesheets, teamMembers: s.teamMembers, locations: s.locations, types: s.blockedTimeTypes, shiftPatterns: s.shiftPatterns, shiftOverrides: s.shiftOverrides })),
  )
  const [starting, setStarting] = useState(false)
  const [tour, setTour] = useState(false)
  const [q, setQ] = useState('')
  const [range, setRange] = useState<RangeValue>(() => resolveRange('this_week'))
  const [sort, setSort] = useState<Sort>('dateDesc')
  const [filters, setFilters] = useState<{ status: StatusFilter; punctuality: PunctualityFilter }>({ status: 'all', punctuality: 'all' })
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [draft, setDraft] = useState(filters)

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase()
    const list = timesheets.filter((ts) => {
      if (ts.date < range.from || ts.date > range.to) return false
      const m = teamMembers.find((x) => x.id === ts.teamMemberId)
      if (!m) return false
      if (query && !memberName(m).toLowerCase().includes(query)) return false
      if (filters.status !== 'all' && ts.status !== filters.status) return false
      if (filters.punctuality !== 'all') {
        const late = isLate({ shiftPatterns, shiftOverrides }, ts)
        if (filters.punctuality === 'late' ? !late : late) return false
      }
      return true
    })
    const name = (ts: Timesheet) => memberName(teamMembers.find((m) => m.id === ts.teamMemberId)!)
    const breaks = (ts: Timesheet) => timesheetTotals(ts, types).breaks
    const sorters: Record<Sort, (a: Timesheet, b: Timesheet) => number> = {
      dateDesc: (a, b) => b.date.localeCompare(a.date) || b.clockIn.localeCompare(a.clockIn),
      dateAsc: (a, b) => a.date.localeCompare(b.date) || a.clockIn.localeCompare(b.clockIn),
      memberAsc: (a, b) => name(a).localeCompare(name(b)),
      memberDesc: (a, b) => name(b).localeCompare(name(a)),
      breaksDesc: (a, b) => breaks(b) - breaks(a),
      breaksAsc: (a, b) => breaks(a) - breaks(b),
    }
    return [...list].sort(sorters[sort])
  }, [timesheets, teamMembers, range, q, filters, sort, types, shiftPatterns, shiftOverrides])

  if (loading) return <Page><PageSkeleton /></Page>

  if (!enabled) {
    return (
      <Page>
        <IntroPage
          title={t('team.timesheets.introTitle')}
          body={t('team.timesheets.introBody')}
          bullets={[t('team.timesheets.intro1'), t('team.timesheets.intro2'), t('team.timesheets.intro3')]}
          primary={{
            label: t('team.common.startNow'),
            loading: starting,
            onClick: async () => {
              setStarting(true)
              await enableTimesheets()
              setStarting(false)
              setTour(true)
              toast(t('team.timesheets.toastEnabled'))
            },
          }}
        />
      </Page>
    )
  }

  const eligible = teamMembers.some((m) => !m.archived && m.wages.enabled)
  const filterCount = (filters.status !== 'all' ? 1 : 0) + (filters.punctuality !== 'all' ? 1 : 0)
  const columns: Column<Timesheet>[] = [
    {
      key: 'member',
      header: t('team.timesheets.cols.member'),
      cell: (ts) => {
        const m = teamMembers.find((x) => x.id === ts.teamMemberId)!
        return (
          <div className="flex items-center gap-3">
            <MemberAvatar member={m} size={40} />
            <div>
              <p className="text-body-strong text-ink">{memberName(m)}</p>
              <p className="text-small text-muted">{locations.find((l) => l.id === ts.locationId)?.name}</p>
            </div>
          </div>
        )
      },
    },
    { key: 'date', header: t('team.timesheets.cols.date'), sortValue: (ts) => ts.date, cell: (ts) => fmtDate(ts.date) },
    { key: 'clock', header: t('team.timesheets.cols.clock'), sortValue: (ts) => ts.clockIn, cell: (ts) => `${ts.clockIn} - ${ts.clockOut ?? ''}` },
    { key: 'breaks', header: t('team.timesheets.cols.breaks'), sortValue: (ts) => timesheetTotals(ts, types).breaks, cell: (ts) => durationLabel(timesheetTotals(ts, types).breaks) },
    { key: 'hours', header: t('team.timesheets.cols.hours'), cell: (ts) => (ts.clockOut ? durationLabel(timesheetTotals(ts, types).worked) : '-') },
    {
      key: 'status',
      header: t('team.timesheets.cols.status'),
      cell: (ts) => (
        <div className="flex flex-wrap gap-1.5">
          <Chip tone={ts.status === 'clocked_out' ? 'success' : 'info'}>{ts.status === 'clocked_out' ? t('team.timesheets.status.clockedOut') : t('team.timesheets.status.clockedIn')}</Chip>
          {isLate({ shiftPatterns, shiftOverrides }, ts) && <Chip tone="warning">{t('team.timesheets.late')}</Chip>}
        </div>
      ),
    },
  ]

  return (
    <Page wide>
      <PageHeader
        title={t('team.timesheets.title')}
        subtitle={t('team.timesheets.subtitle')}
        actions={
          <>
            <Menu
              align="right"
              groups={[{ items: [{ label: t('team.timesheets.settings'), onSelect: () => navigate('/setup/team/timesheets') }] }]}
              trigger={({ open, toggle }) => (
                <MenuButton open={open} toggle={toggle}>
                  {t('team.common.options')}
                </MenuButton>
              )}
            />
            <Button variant="primary" onClick={() => drawer.open('add-timesheet')}>
              {t('team.common.add')}
            </Button>
          </>
        }
      />
      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder={t('team.common.search')} className="md:max-w-[300px]" />
        <RangePicker value={range} onChange={setRange} presets={['today', 'yesterday', 'this_week', 'last_week', 'month_to_date', 'year_to_date']} />
        <Button
          className="rounded-full"
          icon={<SlidersHorizontal size={16} />}
          onClick={() => {
            setDraft(filters)
            setFiltersOpen(true)
          }}
        >
          {t('team.common.filters')}
          {filterCount > 0 && <span className="chip h-5 bg-primary px-1.5 text-caption text-on-primary">{filterCount}</span>}
        </Button>
        <div className="ml-auto">
          <SortMenu value={sort} onChange={setSort} options={SORTS.map((s) => ({ value: s, label: t(`team.timesheets.sort.${s}`) }))} />
        </div>
      </Toolbar>

      {!eligible ? (
        <div className="card">
          <EmptyState icon={<Users size={24} />} title={t('team.timesheets.noMembersTitle')} body={t('team.timesheets.noMembersBody')} action={<Button onClick={() => navigate('/team/team-members')}>{t('team.timesheets.viewMembers')}</Button>} />
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(ts) => ts.id}
          onRowClick={(ts) => drawer.open('timesheet', { id: ts.id })}
          empty={
            <EmptyState
              title={t('team.timesheets.emptyTitle')}
              body={t('team.timesheets.emptyBody')}
              action={
                <Button variant="primary" onClick={() => drawer.open('add-timesheet')}>
                  {t('team.timesheets.addTimesheet')}
                </Button>
              }
            />
          }
        />
      )}

      <Modal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title={t('team.common.filters')}
        size="lg"
        footer={
          <>
            <Button onClick={() => setDraft({ status: 'all', punctuality: 'all' })}>{t('team.common.clearFilters')}</Button>
            <Button
              variant="primary"
              onClick={() => {
                setFilters(draft)
                setFiltersOpen(false)
              }}
            >
              {t('team.common.apply')}
            </Button>
          </>
        }
      >
        <div className="grid gap-6 pb-2 sm:grid-cols-2">
          <fieldset>
            <legend className="label">{t('team.timesheets.filters.status')}</legend>
            <RadioGroup<StatusFilter>
              value={draft.status}
              onChange={(v) => setDraft({ ...draft, status: v })}
              options={[
                { value: 'all', label: t('team.timesheets.filters.all') },
                { value: 'clocked_in', label: t('team.timesheets.status.clockedIn') },
                { value: 'clocked_out', label: t('team.timesheets.status.clockedOut') },
              ]}
            />
          </fieldset>
          <fieldset>
            <legend className="label">{t('team.timesheets.filters.punctuality')}</legend>
            <RadioGroup<PunctualityFilter>
              value={draft.punctuality}
              onChange={(v) => setDraft({ ...draft, punctuality: v })}
              options={[
                { value: 'all', label: t('team.timesheets.filters.allClockIns') },
                { value: 'on_time', label: t('team.timesheets.filters.onTime') },
                { value: 'late', label: t('team.timesheets.late') },
              ]}
            />
          </fieldset>
        </div>
      </Modal>

      {tour && (
        <Tour
          onClose={() => setTour(false)}
          steps={[
            { title: t('team.timesheets.tour1Title'), body: t('team.timesheets.tour1') },
            { title: t('team.timesheets.tour2Title'), body: t('team.timesheets.tour2') },
            { title: t('team.timesheets.tour3Title'), body: t('team.timesheets.tour3') },
          ]}
        />
      )}
    </Page>
  )
}

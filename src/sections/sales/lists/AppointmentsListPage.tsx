import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { DataTable, DateRangeButton, Field, Page, PageHeader, PageSkeleton, SearchInput, Select, StatusChip, Toolbar, resolvePreset, usePageLoading, type Column, type DateRangeValue, type PresetKey } from '@/components/ui'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { durationLabel } from '@/lib/time'
import { fmtDateTime, money2, round2 } from '@/lib/format'
import { exportCsv, exportedFileName, exportPdf, exportXlsx, type ExportTable } from '@/lib/export'
import type { Appointment, AppointmentStatus } from '@/types'
import { ExportMenu, FilterButton, FilterChips, FiltersModal, SortHeader, SortMenu, TableLink, sortBy, useFilters, type ExportFormat, type FilterChip, type SortDir } from '../shared/ui'
import { matches, useLookups } from '../shared/data'

export const WIDE_PRESETS: PresetKey[] = ['today', 'yesterday', 'last_7_days', 'last_30_days', 'last_90_days', 'last_month', 'last_year', 'week_to_date', 'month_to_date', 'quarter_to_date', 'year_to_date', 'tomorrow', 'next_7_days', 'next_month', 'next_30_days', 'all_time']

type SortKey = 'created-on' | 'scheduled-on' | 'duration'
const SORT_OPTIONS: { key: SortKey; dir: SortDir }[] = [
  { key: 'created-on', dir: 'asc' },
  { key: 'created-on', dir: 'desc' },
  { key: 'scheduled-on', dir: 'asc' },
  { key: 'scheduled-on', dir: 'desc' },
  { key: 'duration', dir: 'asc' },
  { key: 'duration', dir: 'desc' },
]

const STATUSES: AppointmentStatus[] = ['booked', 'confirmed', 'arrived', 'started', 'completed', 'cancelled', 'no_show']
/** URL value for the status filter (`?report-appointment-status-label=completed`). */
const statusParam = (s: AppointmentStatus) => (s === 'no_show' ? 'no-show' : s === 'cancelled' ? 'canceled' : s)
const statusFromParam = (v: string | null): AppointmentStatus | 'all' => STATUSES.find((s) => statusParam(s) === v) ?? 'all'

const CHANNELS = ['all', 'online', 'marketplace', 'book_now_link', 'facebook', 'instagram', 'google', 'automations', 'blast', 'offline'] as const
type ChannelFilter = (typeof CHANNELS)[number]

interface Row {
  appt: Appointment
  ref: string
  client: string
  clientId: string | null
  service: string
  createdBy: string
  createdAt: string
  scheduled: string
  duration: number
  member: string
  price: number
}

export function AppointmentsListPage() {
  const { t } = useTranslation()
  const loading = usePageLoading()
  const drawer = useDrawer()
  const [params, setParams] = useSearchParams()
  const appointments = useDb((s) => s.appointments)
  const lookups = useLookups()
  const [query, setQuery] = useState('')
  const [range, setRange] = useState<DateRangeValue>(() => resolvePreset('month_to_date'))
  const filters = useFilters<{ member: string; channel: ChannelFilter }>({ member: 'all', channel: 'all' })
  const [statusDraft, setStatusDraft] = useState<AppointmentStatus | 'all'>('all')

  const status = statusFromParam(params.get('report-appointment-status-label'))
  const sortKey = (['created-on', 'scheduled-on', 'duration'] as SortKey[]).find((k) => k === params.get('report-sort-by')) ?? 'scheduled-on'
  const sortDir: SortDir = params.get('report-sort-order') === 'asc' ? 'asc' : 'desc'

  const setParam = (patch: Record<string, string | null>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      Object.entries(patch).forEach(([k, v]) => (v === null ? next.delete(k) : next.set(k, v)))
      return next
    })
  const setSort = (key: SortKey, dir: SortDir) => setParam({ 'report-sort-by': key, 'report-sort-order': dir })
  const toggleSort = (key: SortKey) => setSort(key, sortKey === key && sortDir === 'desc' ? 'asc' : 'desc')
  const setStatus = (s: AppointmentStatus | 'all') => setParam({ 'report-appointment-status-label': s === 'all' ? null : statusParam(s) })

  const rows = useMemo(() => {
    const list: Row[] = appointments
      .filter((a) => a.date >= range.from && a.date <= range.to)
      .filter((a) => status === 'all' || a.status === status)
      .filter((a) => filters.applied.member === 'all' || a.items.some((i) => i.teamMemberId === filters.applied.member))
      .filter((a) => {
        const c = filters.applied.channel
        if (c === 'all') return true
        if (c === 'online') return a.channel !== 'offline'
        return a.channel === c
      })
      .map((a) => {
        const client = a.clientId ? lookups.client.get(a.clientId) : undefined
        const first = a.items[0]
        return {
          appt: a,
          ref: `#${a.ref}`,
          client: client ? `${client.firstName} ${client.lastName}` : t('sales.common.walkIn'),
          clientId: client?.id ?? null,
          service: a.items.map((i) => i.name).join(', '),
          createdBy: a.createdBy,
          createdAt: a.createdAt,
          scheduled: `${a.date}T${first?.start ?? '00:00'}`,
          duration: a.items.reduce((s, i) => s + i.durationMin + i.extraTime.reduce((x, e) => x + e.durationMin, 0), 0),
          member: [...new Set(a.items.map((i) => lookups.member.get(i.teamMemberId)).filter(Boolean).map((m) => `${m!.firstName} ${m!.lastName}`))].join(', '),
          price: round2(a.items.reduce((s, i) => s + i.price + i.addOns.reduce((x, o) => x + o.price, 0), 0)),
        }
      })
      .filter((r) => !query.trim() || matches(r.ref, query) || matches(r.appt.ref, query) || matches(r.client, query))
    const value = sortKey === 'created-on' ? (r: Row) => r.createdAt : sortKey === 'duration' ? (r: Row) => r.duration : (r: Row) => r.scheduled
    return sortBy(list, value, sortDir)
  }, [appointments, range, status, filters.applied, lookups, query, sortKey, sortDir, t])

  const scheduledLabel = (r: Row) => fmtDateTime(r.scheduled)
  const columns: Column<Row>[] = [
    { key: 'ref', header: t('sales.appointments.cols.ref'), cell: (r) => <TableLink onClick={() => drawer.open('appointment', { id: r.appt.id })}>{r.ref}</TableLink> },
    { key: 'client', header: t('sales.appointments.cols.client'), cell: (r) => (r.clientId ? <TableLink onClick={() => drawer.open('client', { id: r.clientId! })}>{r.client}</TableLink> : r.client) },
    { key: 'service', header: t('sales.appointments.cols.service'), cell: (r) => <span className="block max-w-[220px] truncate">{r.service}</span> },
    { key: 'createdBy', header: t('sales.appointments.cols.createdBy'), cell: (r) => r.createdBy },
    { key: 'created', header: <SortHeader label={t('sales.appointments.cols.created')} active={sortKey === 'created-on'} dir={sortDir} onClick={() => toggleSort('created-on')} />, cell: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.createdAt)}</span> },
    { key: 'scheduled', header: <SortHeader label={t('sales.appointments.cols.scheduled')} active={sortKey === 'scheduled-on'} dir={sortDir} onClick={() => toggleSort('scheduled-on')} />, cell: (r) => <span className="whitespace-nowrap">{scheduledLabel(r)}</span> },
    { key: 'duration', header: <SortHeader label={t('sales.appointments.cols.duration')} active={sortKey === 'duration'} dir={sortDir} onClick={() => toggleSort('duration')} />, cell: (r) => <span className="whitespace-nowrap">{durationLabel(r.duration)}</span> },
    { key: 'member', header: t('sales.appointments.cols.member'), cell: (r) => <span className="whitespace-nowrap">{r.member}</span> },
    { key: 'price', header: t('sales.appointments.cols.price'), align: 'right', cell: (r) => money2(r.price) },
    { key: 'status', header: t('sales.appointments.cols.status'), cell: (r) => <StatusChip status={r.appt.status} /> },
  ]

  const channelLabel = (c: ChannelFilter) => t(`sales.appointments.channels.${c}`)
  const statusLabel = (s: AppointmentStatus | 'all') => (s === 'all' ? t('sales.appointments.allStatuses') : t(`sales.appointmentStatus.${s}`))
  const memberName = (id: string) => {
    const m = lookups.member.get(id)
    return m ? `${m.firstName} ${m.lastName}` : ''
  }
  const chips: FilterChip[] = [
    ...(filters.applied.member !== 'all' ? [{ key: 'member', label: memberName(filters.applied.member), onRemove: () => filters.setApplied({ ...filters.applied, member: 'all' }) }] : []),
    ...(filters.applied.channel !== 'all' ? [{ key: 'channel', label: channelLabel(filters.applied.channel), onRemove: () => filters.setApplied({ ...filters.applied, channel: 'all' }) }] : []),
    ...(status !== 'all' ? [{ key: 'status', label: statusLabel(status), onRemove: () => setStatus('all') }] : []),
  ]

  const onExport = async (format: ExportFormat) => {
    const table: ExportTable = {
      headers: [t('sales.appointments.cols.ref'), t('sales.appointments.cols.client'), t('sales.appointments.cols.service'), t('sales.appointments.cols.createdBy'), t('sales.appointments.cols.created'), t('sales.appointments.cols.scheduled'), t('sales.appointments.cols.duration'), t('sales.appointments.cols.member'), t('sales.appointments.cols.price'), t('sales.appointments.cols.status')],
      rows: rows.map((r) => [r.ref, r.client, r.service, r.createdBy, fmtDateTime(r.createdAt), scheduledLabel(r), durationLabel(r.duration), r.member, format === 'pdf' ? money2(r.price) : r.price.toFixed(2), t(`sales.appointmentStatus.${r.appt.status}`)]),
    }
    const name = exportedFileName()
    if (format === 'csv') exportCsv(name, [table])
    else if (format === 'xlsx') await exportXlsx(name, [table])
    else await exportPdf(name, { title: t('sales.appointments.title'), tables: [table], orientation: 'landscape' })
  }

  if (loading)
    return (
      <Page wide>
        <PageSkeleton />
      </Page>
    )

  return (
    <Page wide>
      <PageHeader title={t('sales.appointments.title')} subtitle={t('sales.appointments.subtitle')} actions={<ExportMenu onExport={onExport} />} />
      <Toolbar>
        <SearchInput value={query} onChange={setQuery} placeholder={t('sales.appointments.search')} className="max-w-xs" />
        <DateRangeButton value={range} onChange={setRange} presets={WIDE_PRESETS} />
        <FilterButton
          count={chips.length}
          onClick={() => {
            setStatusDraft(status)
            filters.openModal()
          }}
        />
        <div className="ml-auto">
          <SortMenu
            value={`${sortKey}:${sortDir}`}
            options={SORT_OPTIONS.map((o) => ({ value: `${o.key}:${o.dir}`, label: t(`sales.appointments.sort.${o.key}.${o.dir}`) }))}
            onChange={(v) => {
              const [key, dir] = v.split(':') as [SortKey, SortDir]
              setSort(key, dir)
            }}
          />
        </div>
      </Toolbar>
      <FilterChips
        chips={chips}
        onClearAll={() => {
          filters.reset()
          setStatus('all')
        }}
      />
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.appt.id} onRowClick={(r) => drawer.open('appointment', { id: r.appt.id })} empty={<NoResults />} />
      <FiltersModal
        open={filters.open}
        onClose={filters.close}
        onClear={() => {
          filters.clearDraft()
          setStatusDraft('all')
        }}
        onApply={() => {
          filters.apply()
          setStatus(statusDraft)
        }}
      >
        <Field label={t('sales.appointments.filters.member')}>
          {(id) => (
            <Select
              id={id}
              value={filters.draft.member}
              onChange={(e) => filters.setDraft({ ...filters.draft, member: e.target.value })}
              options={[{ value: 'all', label: t('sales.common.allTeamMembers') }, ...lookups.members.filter((m) => !m.archived).map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName}` }))]}
            />
          )}
        </Field>
        <Field label={t('sales.appointments.filters.channel')}>
          {(id) => <Select id={id} value={filters.draft.channel} onChange={(e) => filters.setDraft({ ...filters.draft, channel: e.target.value as ChannelFilter })} options={CHANNELS.map((c) => ({ value: c, label: channelLabel(c) }))} />}
        </Field>
        <Field label={t('sales.appointments.filters.status')}>
          {(id) => <Select id={id} value={statusDraft} onChange={(e) => setStatusDraft(e.target.value as AppointmentStatus | 'all')} options={(['all', ...STATUSES] as const).map((s) => ({ value: s, label: statusLabel(s) }))} />}
        </Field>
      </FiltersModal>
    </Page>
  )
}

export function NoResults() {
  const { t } = useTranslation()
  return (
    <div className="px-6 py-12 text-center">
      <p className="font-display text-title-3 text-ink">{t('sales.common.noResults')}</p>
      <p className="mt-1 text-body text-muted">{t('sales.common.noResultsHint')}</p>
    </div>
  )
}


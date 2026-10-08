import clsx from 'clsx'
import { ArrowDown, ArrowUpDown, Ban, BadgeCheck, ChevronDown, ListOrdered, SlidersHorizontal, UserRound, Users, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Client, ID } from '@/types'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { exportCsv, exportedFileName, exportXlsx } from '@/lib/export'
import { fmtDate, money, num } from '@/lib/format'
import { Button, confirm, EmptyState, LearnMore, Menu, MenuButton, Page, PageHeader, PageSkeleton, SearchInput, SideDrawer, toast, Toolbar, usePageLoading } from '@/components/ui'
import { deleteClients, findDuplicateGroups } from '@/api/clients'
import { useExt, writeExt } from '@/api/ext'
import { ClientAvatar, FilterGroup, OptionList } from '../components/common'
import { AddTagsModal, BlockClientModal } from '../components/ClientDialogs'
import { SegmentsPickerModal } from '../components/SegmentsPickerModal'
import { GENDERS, SORTS, type SortKey } from '../lib/constants'
import { clientName } from '../lib/helpers'
import { useClientMetrics, useSegmentEvaluator } from '../lib/hooks'

type Group = 'all' | 'marketplace' | 'manual'
type Blocked = 'all' | 'include' | 'exclude'
type Verified = 'all' | 'verified' | 'not'
type Gender = 'all' | NonNullable<Client['gender']>

interface Filters {
  segmentIds: ID[]
  group: Group
  blocked: Blocked
  verified: Verified
  gender: Gender
}

const NO_FILTERS: Filters = { segmentIds: [], group: 'all', blocked: 'all', verified: 'all', gender: 'all' }
const PAGE_SIZE = 50

const activeCount = (f: Filters) => (f.segmentIds.length ? 1 : 0) + (f.group !== 'all' ? 1 : 0) + (f.blocked !== 'all' ? 1 : 0) + (f.verified !== 'all' ? 1 : 0) + (f.gender !== 'all' ? 1 : 0)

/** Clients list (clients.md §1). */
export function ClientsListPage() {
  const { t } = useTranslation()
  const loading = usePageLoading()
  const navigate = useNavigate()
  const drawer = useDrawer()
  const [params, setParams] = useSearchParams()
  const clients = useDb((s) => s.clients)
  const tags = useDb((s) => s.clientTags)
  const segments = useDb((s) => s.segments)
  const sources = useDb((s) => s.clientSources)
  const metrics = useClientMetrics()
  const evaluator = useSegmentEvaluator()

  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('created_desc')
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [draft, setDraft] = useState<Filters>(NO_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [openGroups, setOpenGroups] = useState<string[]>([])
  const [segmentsOpen, setSegmentsOpen] = useState(false)
  const [selected, setSelected] = useState<Set<ID>>(new Set())
  const [page, setPage] = useState(0)
  const bannerHidden = useExt<boolean>('clients', 'importBannerDismissed', false)
  const [tagsModal, setTagsModal] = useState(false)
  const [blockModal, setBlockModal] = useState(false)

  const urlTagIds = useMemo(() => [...params.keys()].filter((k) => k.startsWith('client-list-tag-ids')).map((k) => params.get(k)!).filter(Boolean), [params])
  const urlSegment = params.get('segment')

  const live = useMemo(() => clients.filter((c) => !c.deletedAt), [clients])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const qDigits = q.replace(/\D/g, '')
    const segmentSets = filters.segmentIds.map((id) => segments.find((s) => s.id === id)).filter(Boolean).map((s) => evaluator.ids(s!))
    const urlSet = urlSegment ? segments.find((s) => s.id === urlSegment) : undefined
    const urlIds = urlSet ? evaluator.ids(urlSet) : null
    const list = live.filter((c) => {
      if (q && !(clientName(c).toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || (qDigits.length >= 3 && c.phone.replace(/\D/g, '').includes(qDigits)))) return false
      if (urlTagIds.length && !urlTagIds.some((id) => c.tagIds.includes(id))) return false
      if (urlIds && !urlIds.has(c.id)) return false
      if (segmentSets.length && !segmentSets.some((set) => set.has(c.id))) return false
      if (filters.group === 'marketplace' && !c.marketplace) return false
      if (filters.group === 'manual' && c.marketplace) return false
      if (filters.blocked === 'include' && !c.blocked) return false
      if (filters.blocked === 'exclude' && c.blocked) return false
      if (filters.verified === 'verified' && !c.marketplace) return false
      if (filters.verified === 'not' && c.marketplace) return false
      if (filters.gender !== 'all' && c.gender !== filters.gender) return false
      return true
    })
    const [key, dir] = sort.split('_') as ['first' | 'last' | 'gender' | 'created', 'asc' | 'desc']
    const value = (c: Client) => (key === 'first' ? c.firstName : key === 'last' ? c.lastName : key === 'gender' ? (c.gender ?? '') : c.createdAt).toLowerCase()
    return [...list].sort((a, b) => value(a).localeCompare(value(b)) * (dir === 'asc' ? 1 : -1))
  }, [live, query, filters, sort, urlTagIds, urlSegment, segments, evaluator])

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const visible = rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)
  const selectedIds = [...selected].filter((id) => rows.some((r) => r.id === id))
  const allSelected = visible.length > 0 && visible.every((r) => selected.has(r.id))

  const exportRows = (kind: 'csv' | 'xlsx') => {
    const headers = [t('clients.export.firstName'), t('clients.export.lastName'), t('clients.export.email'), t('clients.export.mobile'), t('clients.export.gender'), t('clients.export.birthday'), t('clients.export.source'), t('clients.export.tags'), t('clients.export.blocked'), t('clients.export.sales'), t('clients.export.reviews'), t('clients.export.createdAt')]
    const data = rows.map((c) => [
      c.firstName,
      c.lastName,
      c.email,
      c.phone,
      c.gender ? t(`clients.gender.${c.gender}`) : '',
      c.birthday ?? '',
      sources.find((s) => s.id === c.sourceId)?.name ?? '',
      c.tagIds.map((id) => tags.find((x) => x.id === id)?.name).filter(Boolean).join('|'),
      c.blocked ? t('clients.common.yes') : t('clients.common.no'),
      num(metrics.salesTotal.get(c.id) ?? 0, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }),
      metrics.reviewStats.get(c.id)?.count ?? 0,
      fmtDate(c.createdAt),
    ])
    const name = exportedFileName()
    if (kind === 'csv') exportCsv(name, [{ headers, rows: data }])
    else void exportXlsx(name, [{ headers, rows: data }])
    toast(t('clients.export.done'))
  }

  const mergeScan = () => {
    const groups = findDuplicateGroups(clients)
    if (groups.length === 0) return toast(t('clients.list.noDuplicates'))
    navigate(`/clients/list/merge/${groups[0][0].id}`)
  }

  const bulkDelete = async () => {
    const ok = await confirm({ title: t('clients.list.deleteTitle'), body: t('clients.list.deleteBody'), confirmLabel: t('clients.common.delete'), tone: 'danger' })
    if (!ok) return
    await deleteClients(selectedIds)
    toast(selectedIds.length === 1 ? t('clients.drawer.deleteToast') : t('clients.list.deletedMany', { count: selectedIds.length }))
    setSelected(new Set())
  }

  const clearUrlFilters = () =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      ;[...next.keys()].filter((k) => k.startsWith('client-list-tag-ids') || k === 'segment').forEach((k) => next.delete(k))
      return next
    })

  const filterCount = activeCount(filters)
  const toggleGroup = (g: string) => setOpenGroups((o) => (o.includes(g) ? o.filter((x) => x !== g) : [...o, g]))

  if (loading) {
    return (
      <Page>
        <PageSkeleton rows={8} />
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader
        title={t('clients.list.title')}
        count={live.length}
        subtitle={
          <>
            {t('clients.list.subtitle')} <LearnMore topic={t('clients.list.title')}>{t('clients.common.learnMore')}</LearnMore>
          </>
        }
        actions={
          <>
            <Menu
              width={220}
              trigger={({ open, toggle }) => (
                <MenuButton open={open} toggle={toggle}>
                  {t('clients.common.options')}
                </MenuButton>
              )}
              groups={[
                {
                  items: [
                    { label: t('clients.list.importClients'), onSelect: () => navigate('/clients/client-import/upload') },
                    { label: t('clients.list.mergeClients'), onSelect: mergeScan },
                  ],
                },
                {
                  heading: t('clients.list.export'),
                  items: [
                    { label: t('clients.list.excel'), onSelect: () => exportRows('xlsx') },
                    { label: t('clients.list.csv'), onSelect: () => exportRows('csv') },
                  ],
                },
              ]}
            />
            <Button variant="primary" onClick={() => navigate('/clients/list/add')}>
              {t('clients.common.add')}
            </Button>
          </>
        }
      />

      {!bannerHidden && (
        <section className="relative mb-6 overflow-hidden rounded-xl bg-gradient-to-r from-ink via-primary-active to-primary p-7 text-white shadow-sm">
          <div className="relative z-10 max-w-[60%]">
            <h2 className="font-display text-title-2">{t('clients.banner.title')}</h2>
            <p className="mt-1 text-body-lg text-white/85">{t('clients.banner.body')}</p>
            <div className="mt-5 flex items-center gap-5">
              <button type="button" onClick={() => navigate('/clients/client-import/upload')} className="h-10 rounded-full bg-white px-5 text-body-strong text-ink hover:bg-white/90">
                {t('clients.banner.start')}
              </button>
              <LearnMore topic={t('clients.list.importClients')}>
                <span className="text-body-strong text-white">{t('clients.common.learnMore')}</span>
              </LearnMore>
            </div>
          </div>
          <div aria-hidden className="absolute -right-6 top-0 hidden h-full w-[40%] sm:block">
            {[
              ['right-[46%] top-[52%] h-24 w-24 bg-accent/90', 'AM'],
              ['right-[24%] top-[8%] h-24 w-24 bg-white/85 text-primary', 'JR'],
              ['right-[56%] top-[14%] h-14 w-14 bg-primary-subtle text-primary', 'LS'],
              ['right-[18%] top-[56%] h-28 w-28 bg-accent-subtle text-warning', 'MC'],
              ['-right-2 top-[44%] h-24 w-24 bg-info-subtle text-info', 'TP'],
            ].map(([cls, text]) => (
              <span key={text} className={clsx('absolute flex items-center justify-center rounded-full font-display text-title-3 shadow-md', cls)}>
                {text}
              </span>
            ))}
          </div>
          <button
            type="button"
            aria-label={t('clients.common.dismiss')}
            onClick={() => writeExt('clients', 'importBannerDismissed', true)}
            className="absolute right-4 top-4 z-10 rounded-full p-1.5 text-white hover:bg-white/15"
          >
            <X size={18} aria-hidden />
          </button>
        </section>
      )}

      <Toolbar>
        <SearchInput
          value={query}
          onChange={(v) => {
            setQuery(v)
            setPage(0)
          }}
          placeholder={t('clients.list.search')}
          className="max-w-xs"
        />
        <Button
          icon={<SlidersHorizontal size={16} aria-hidden />}
          className={clsx('rounded-full', filterCount > 0 && 'border-primary')}
          onClick={() => {
            setDraft(filters)
            setFiltersOpen(true)
          }}
        >
          {t('clients.list.filters')}
          {filterCount > 0 && <span className="chip h-5 bg-primary px-1.5 text-caption text-on-primary">{filterCount}</span>}
        </Button>
        <div className="ml-auto">
          <Menu
            width={260}
            trigger={({ toggle, open }) => (
              <Button className="rounded-full" iconRight={<ArrowUpDown size={16} aria-hidden />} onClick={toggle} aria-expanded={open} aria-haspopup="menu">
                {t(`clients.sort.${sort}`)}
              </Button>
            )}
            groups={[{ items: SORTS.map((key) => ({ label: t(`clients.sort.${key}`), checked: key === sort, onSelect: () => setSort(key) })) }]}
          />
        </div>
      </Toolbar>

      {(urlTagIds.length > 0 || urlSegment) && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {urlTagIds.map((id) => (
            <span key={id} className="chip gap-1.5 bg-primary-subtle font-semibold text-primary">
              {tags.find((x) => x.id === id)?.name ?? id}
            </span>
          ))}
          {urlSegment && <span className="chip bg-primary-subtle font-semibold text-primary">{segments.find((s) => s.id === urlSegment)?.name ?? urlSegment}</span>}
          <span className="chip bg-sunken text-muted">{rows.length}</span>
          <Button variant="link" onClick={clearUrlFilters}>
            {t('clients.list.clearAll')}
          </Button>
        </div>
      )}

      {live.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Users size={26} aria-hidden />}
            title={t('clients.list.emptyTitle')}
            body={t('clients.list.emptyBody')}
            action={
              <div className="flex gap-2">
                <Button onClick={() => navigate('/clients/client-import/upload')}>{t('clients.list.importClients')}</Button>
                <Button variant="primary" onClick={() => navigate('/clients/list/add')}>
                  {t('clients.common.add')}
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-body">
              <thead>
                <tr className="h-14 border-b border-line">
                  <th className="w-12 px-4">
                    <input
                      type="checkbox"
                      aria-label={t('clients.list.selectAll')}
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = selectedIds.length > 0 && !allSelected
                      }}
                      onChange={(e) => {
                        const next = new Set(selected)
                        visible.forEach((r) => (e.target.checked ? next.add(r.id) : next.delete(r.id)))
                        setSelected(next)
                      }}
                      className="h-4 w-4 accent-[rgb(var(--primary))]"
                    />
                  </th>
                  {selectedIds.length > 0 ? (
                    <th colSpan={5} className="pr-4">
                      <div className="flex items-center gap-3">
                        <span className="text-body-strong text-ink">{t('clients.list.selected', { count: selectedIds.length })}</span>
                        <span aria-hidden className="text-muted">•</span>
                        <Button variant="link" onClick={() => setSelected(new Set())}>
                          {t('clients.list.deselect')}
                        </Button>
                        <div className="ml-auto flex items-center gap-2">
                          <Menu
                            width={200}
                            trigger={({ open, toggle }) => (
                              <Button size="sm" className="rounded-full" onClick={toggle} aria-expanded={open} iconRight={<ChevronDown size={14} aria-hidden />}>
                                {t('clients.list.bulkEdit')}
                              </Button>
                            )}
                            groups={[
                              {
                                items: [
                                  { label: t('clients.list.blockClients'), onSelect: () => setBlockModal(true) },
                                  { label: t('clients.list.addTags'), onSelect: () => setTagsModal(true) },
                                ],
                              },
                            ]}
                          />
                          <Button size="sm" className="rounded-full text-danger" onClick={() => void bulkDelete()}>
                            {t('clients.common.delete')}
                          </Button>
                        </div>
                      </div>
                    </th>
                  ) : (
                    <>
                      <th className="px-4 text-body-strong text-ink">{t('clients.list.colName')}</th>
                      <th className="px-4 text-body-strong text-ink">{t('clients.list.colMobile')}</th>
                      <th className="px-4 text-body-strong text-ink">{t('clients.list.colReviews')}</th>
                      <th className="px-4 text-body-strong text-ink">{t('clients.list.colSales')}</th>
                      <th className="px-4 text-body-strong text-ink">
                        <button type="button" className="inline-flex items-center gap-1 hover:text-primary" onClick={() => setSort(sort === 'created_desc' ? 'created_asc' : 'created_desc')}>
                          {t('clients.list.colCreated')}
                          {sort.startsWith('created') && <ArrowDown size={14} aria-hidden className={sort === 'created_asc' ? 'rotate-180' : ''} />}
                        </button>
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => {
                  const r = metrics.reviewStats.get(c.id)
                  return (
                    <tr key={c.id} onClick={() => drawer.open('client', { id: c.id })} className={clsx('h-[88px] cursor-pointer border-b border-line last:border-0 hover:bg-sunken/60', selected.has(c.id) && 'bg-primary-subtle/40')}>
                      <td className="px-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={t('clients.list.selectRow', { name: clientName(c) })}
                          checked={selected.has(c.id)}
                          onChange={(e) => {
                            const next = new Set(selected)
                            if (e.target.checked) next.add(c.id)
                            else next.delete(c.id)
                            setSelected(next)
                          }}
                          className="h-4 w-4 accent-[rgb(var(--primary))]"
                        />
                      </td>
                      <td className="px-4">
                        <div className="flex items-center gap-4">
                          <ClientAvatar client={c} size={56} />
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 truncate text-body-lg text-ink">
                              {clientName(c)}
                              {c.blocked && <span className="chip h-5 bg-danger-subtle px-2 text-caption text-danger">{t('clients.drawer.blocked')}</span>}
                            </p>
                            <p className="truncate text-body text-muted">{c.email || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 text-ink">{c.phone || '-'}</td>
                      <td className="whitespace-nowrap px-4 text-ink">{r ? `${num(r.sum / r.count, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ★ (${r.count})` : '-'}</td>
                      <td className="whitespace-nowrap px-4 tabular text-ink">{money(metrics.salesTotal.get(c.id) ?? 0)}</td>
                      <td className="whitespace-nowrap px-4 text-ink">{fmtDate(c.createdAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {rows.length === 0 ? (
            <EmptyState
              icon={<UserRound size={26} aria-hidden />}
              title={t('clients.list.noResultsTitle')}
              body={t('clients.list.noResultsBody')}
              action={
                <Button
                  onClick={() => {
                    setQuery('')
                    setFilters(NO_FILTERS)
                    clearUrlFilters()
                  }}
                >
                  {t('clients.list.clearFilters')}
                </Button>
              }
            />
          ) : (
            <div className="flex items-center justify-center gap-4 border-t border-line px-4 py-4 text-body text-muted">
              {pages > 1 && (
                <Button size="sm" variant="ghost" disabled={current === 0} onClick={() => setPage(current - 1)}>
                  {t('clients.common.previous')}
                </Button>
              )}
              <span>{t('clients.list.viewing', { from: current * PAGE_SIZE + 1, to: Math.min(rows.length, (current + 1) * PAGE_SIZE), total: rows.length })}</span>
              {pages > 1 && (
                <Button size="sm" variant="ghost" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
                  {t('clients.common.next')}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      <SideDrawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title={t('clients.filters.title')}
        footer={
          <>
            <Button className="flex-1" onClick={() => setDraft(NO_FILTERS)}>
              {t('clients.list.clearFilters')}
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => {
                setFilters(draft)
                setPage(0)
                setFiltersOpen(false)
              }}
            >
              {t('clients.common.apply')}
            </Button>
          </>
        }
      >
        <FilterGroup
          icon={<Users size={20} aria-hidden />}
          title={t('clients.filters.segments')}
          count={draft.segmentIds.length || undefined}
          open={draft.segmentIds.length > 0}
          onClear={() => setDraft({ ...draft, segmentIds: [] })}
          action={
            <button type="button" className="text-body-strong text-primary hover:underline" onClick={() => setSegmentsOpen(true)}>
              {t('clients.common.edit')}
            </button>
          }
        >
          <div className="flex flex-wrap gap-2">
            {draft.segmentIds.map((id) => (
              <span key={id} className="chip bg-primary-subtle font-semibold text-primary">
                {segments.find((s) => s.id === id)?.name}
              </span>
            ))}
          </div>
        </FilterGroup>
        <FilterGroup icon={<ListOrdered size={20} aria-hidden />} title={t('clients.filters.group')} count={draft.group !== 'all' ? 1 : undefined} onClear={() => setDraft({ ...draft, group: 'all' })} open={openGroups.includes('group')} onToggle={() => toggleGroup('group')}>
          <OptionList<Group>
            value={draft.group}
            onChange={(group) => setDraft({ ...draft, group })}
            options={[
              { value: 'all', label: t('clients.filters.allTypes') },
              { value: 'marketplace', label: t('clients.filters.marketplace') },
              { value: 'manual', label: t('clients.filters.manual') },
            ]}
          />
        </FilterGroup>
        <FilterGroup icon={<Ban size={20} aria-hidden />} title={t('clients.filters.blocked')} count={draft.blocked !== 'all' ? 1 : undefined} onClear={() => setDraft({ ...draft, blocked: 'all' })} open={openGroups.includes('blocked')} onToggle={() => toggleGroup('blocked')}>
          <OptionList<Blocked>
            value={draft.blocked}
            onChange={(blocked) => setDraft({ ...draft, blocked })}
            options={[
              { value: 'all', label: t('clients.filters.allClients') },
              { value: 'include', label: t('clients.filters.includeBlocked') },
              { value: 'exclude', label: t('clients.filters.excludeBlocked') },
            ]}
          />
        </FilterGroup>
        <FilterGroup icon={<BadgeCheck size={20} aria-hidden />} title={t('clients.filters.verified')} count={draft.verified !== 'all' ? 1 : undefined} onClear={() => setDraft({ ...draft, verified: 'all' })} open={openGroups.includes('verified')} onToggle={() => toggleGroup('verified')}>
          <OptionList<Verified>
            value={draft.verified}
            onChange={(verified) => setDraft({ ...draft, verified })}
            options={[
              { value: 'all', label: t('clients.filters.allClients') },
              { value: 'verified', label: t('clients.filters.isVerified') },
              { value: 'not', label: t('clients.filters.notVerified') },
            ]}
          />
        </FilterGroup>
        <FilterGroup icon={<UserRound size={20} aria-hidden />} title={t('clients.filters.gender')} count={draft.gender !== 'all' ? 1 : undefined} onClear={() => setDraft({ ...draft, gender: 'all' })} open={openGroups.includes('gender')} onToggle={() => toggleGroup('gender')}>
          <OptionList<Gender> value={draft.gender} onChange={(gender) => setDraft({ ...draft, gender })} options={[{ value: 'all', label: t('clients.filters.allGenders') }, ...GENDERS.map((g) => ({ value: g, label: t(`clients.gender.${g}`) }))]} />
        </FilterGroup>
      </SideDrawer>

      <SegmentsPickerModal open={segmentsOpen} onClose={() => setSegmentsOpen(false)} value={draft.segmentIds} onApply={(segmentIds) => setDraft({ ...draft, segmentIds })} />
      <AddTagsModal open={tagsModal} onClose={() => setTagsModal(false)} clientIds={selectedIds} onDone={() => setSelected(new Set())} />
      <BlockClientModal open={blockModal} onClose={() => setBlockModal(false)} clientIds={selectedIds} onDone={() => setSelected(new Set())} />
    </Page>
  )
}

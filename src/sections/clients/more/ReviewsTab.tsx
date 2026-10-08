import clsx from 'clsx'
import { Building2, ImageIcon, Layers, MessageSquare, Scissors, SlidersHorizontal, Star, Tag, Users } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Review } from '@/types'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { fmtDate } from '@/lib/format'
import { now } from '@/lib/time'
import { replyToReview } from '@/api/clients'
import { Button, Card, Chip, EmptyState, Menu, MenuButton, SearchInput, SideDrawer, TextArea, confirm, resolvePreset, toast, type PresetKey } from '@/components/ui'
import { CheckList, ClientAvatar, FilterGroup, StarBars, Stars } from '../components/common'
import { clientName } from '../lib/helpers'
import { GoogleMark } from './GoogleConnectModal'
import { applyFilters, average, EMPTY_FILTERS, filterCount, ratingCounts, sortReviews, toggle, type ReviewFilters, type Sort } from './reviews'

const PERIODS: PresetKey[] = ['all_time', 'last_7_days', 'last_30_days', 'last_90_days', 'week_to_date', 'month_to_date', 'quarter_to_date', 'year_to_date']
const SORTS: Sort[] = ['recent', 'highest', 'lowest']
const PAGE = 20

export function AllReviewsTab({ reviews, connected, onConnect }: { reviews: Review[]; connected: boolean; onConnect: () => void }) {
  const { t } = useTranslation()
  const locations = useDb((s) => s.locations)
  const appointments = useDb((s) => s.appointments)
  const clients = useDb((s) => s.clients)
  const [period, setPeriod] = useState<PresetKey>('all_time')
  const [sort, setSort] = useState<Sort>('recent')
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<ReviewFilters>(EMPTY_FILTERS)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [limit, setLimit] = useState(PAGE)

  const apptLocation = useMemo(() => new Map(appointments.map((a) => [a.id, a.locationId])), [appointments])
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients])
  const range = useMemo(() => resolvePreset(period), [period])
  const filtered = useMemo(() => {
    const weekAgo = new Date(now().getTime() - 7 * 864e5).toISOString()
    const list = applyFilters(reviews, filters, {
      from: range.from,
      to: range.to,
      query,
      weekAgo,
      locationOf: (r) => (r.appointmentId ? apptLocation.get(r.appointmentId) : undefined),
      clientName: (r) => clientName(clientById.get(r.clientId)),
    })
    return sortReviews(list, sort)
  }, [apptLocation, clientById, filters, query, range, reviews, sort])

  const update = (patch: Partial<ReviewFilters>) => {
    setFilters((f) => ({ ...f, ...patch }))
    setLimit(PAGE)
  }
  const clearAll = () => {
    setFilters(EMPTY_FILTERS)
    setQuery('')
    setPeriod('all_time')
    setLimit(PAGE)
  }
  const count = filterCount(filters)
  const locationLabel = filters.locations.length === 0 || filters.locations.length === locations.length ? t('clients.more.reputation.allLocations') : filters.locations.length === 1 ? (locations.find((l) => l.id === filters.locations[0])?.name ?? '') : t('clients.more.reputation.locationsCount', { count: filters.locations.length })

  const chip = (active: boolean, label: ReactNode, onClick: () => void, key: string) => (
    <button key={key} type="button" aria-pressed={active} onClick={onClick} className={clsx('chip h-8 gap-1 border px-3 text-small font-semibold transition-colors', active ? 'border-primary bg-primary text-on-primary' : 'border-line-strong bg-surface text-ink hover:bg-sunken')}>
      {label}
    </button>
  )

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Menu
          align="left"
          label={t(`clients.more.reputation.period.${period}`)}
          trigger={({ open, toggle: tg }) => (
            <MenuButton open={open} toggle={tg}>
              {t(`clients.more.reputation.period.${period}`)}
            </MenuButton>
          )}
          groups={[{ items: PERIODS.map((p) => ({ label: t(`clients.more.reputation.period.${p}`), checked: p === period, onSelect: () => setPeriod(p) })) }]}
        />
        <Menu
          align="left"
          label={locationLabel}
          trigger={({ open, toggle: tg }) => (
            <MenuButton open={open} toggle={tg}>
              {locationLabel}
            </MenuButton>
          )}
          groups={[
            { items: [{ label: t('clients.more.reputation.allLocations'), checked: filters.locations.length === 0, onSelect: () => update({ locations: [] }) }] },
            { items: locations.map((l) => ({ label: l.name, checked: filters.locations.includes(l.id), onSelect: () => update({ locations: toggle(filters.locations, l.id) }) })) },
          ]}
        />
        <Button icon={<SlidersHorizontal size={16} />} onClick={() => setDrawerOpen(true)}>
          {t('clients.more.reputation.filters')}
          {count > 0 && <span className="chip ml-1 h-5 bg-primary px-1.5 text-caption text-on-primary">{count}</span>}
        </Button>
        <SearchInput value={query} onChange={setQuery} placeholder={t('clients.more.reputation.search')} className="max-w-[280px]" />
        <div className="ml-auto">
          <Menu
            label={t(`clients.more.reputation.sort.${sort}`)}
            trigger={({ open, toggle: tg }) => (
              <MenuButton open={open} toggle={tg}>
                {t(`clients.more.reputation.sort.${sort}`)}
              </MenuButton>
            )}
            groups={[{ items: SORTS.map((s) => ({ label: t(`clients.more.reputation.sort.${s}`), checked: s === sort, onSelect: () => setSort(s) })) }]}
          />
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="lg:sticky lg:top-4">
          <p className="flex items-center gap-2 font-display text-[40px] font-bold leading-none text-ink tabular">
            {average(filtered).toFixed(1)}
            <Star size={28} className="fill-accent text-accent" aria-hidden />
          </p>
          <p className="mt-2 text-body text-muted">{t('clients.more.reputation.onAllPlatforms', { count: filtered.length })}</p>
          <StarBars counts={ratingCounts(filtered)} className="mt-5" />
          <div className="mt-6 flex flex-col gap-5 border-t border-line pt-5">
            <QuickGroup title={t('clients.more.reputation.groups.rating')}>
              {[5, 4, 3, 2, 1].map((n) =>
                chip(
                  filters.ratings.includes(n),
                  <>
                    {n} <Star size={12} className="fill-current" aria-hidden />
                  </>,
                  () => update({ ratings: toggle(filters.ratings, n) }),
                  String(n),
                ),
              )}
            </QuickGroup>
            <QuickGroup title={t('clients.more.reputation.groups.platform')}>
              {chip(filters.platforms.includes('marketplace'), t('clients.more.reputation.platformInnoweb'), () => update({ platforms: toggle(filters.platforms, 'marketplace') }), 'mp')}
              {chip(filters.platforms.includes('google'), t('clients.more.reputation.platformGoogle'), () => update({ platforms: toggle(filters.platforms, 'google') }), 'g')}
            </QuickGroup>
            <QuickGroup title={t('clients.more.reputation.groups.type')}>
              {chip(filters.types.includes('without'), t('clients.more.reputation.type.without'), () => update({ types: toggle(filters.types, 'without') }), 'without')}
              {chip(filters.types.includes('with'), t('clients.more.reputation.type.with'), () => update({ types: toggle(filters.types, 'with') }), 'with')}
            </QuickGroup>
            <QuickGroup title={t('clients.more.reputation.groups.contains')}>
              {chip(filters.contains.includes('images'), t('clients.more.reputation.contains.images'), () => update({ contains: toggle(filters.contains, 'images') }), 'images')}
              {chip(filters.contains.includes('text'), t('clients.more.reputation.contains.text'), () => update({ contains: toggle(filters.contains, 'text') }), 'text')}
            </QuickGroup>
            <Button variant="link" className="self-start" onClick={() => setDrawerOpen(true)}>
              {t('clients.more.reputation.viewAllFilters')}
            </Button>
          </div>
        </Card>

        <div className="min-w-0">
          {filtered.length === 0 ? (
            <Card>
              {reviews.length === 0 ? (
                <EmptyState
                  className="py-14"
                  icon={<Star size={40} className="fill-accent text-accent" />}
                  title={t('clients.more.reputation.emptyTitle')}
                  body={t('clients.more.reputation.emptyBody')}
                  action={connected ? undefined : <Button onClick={onConnect}>{t('clients.more.reputation.linkGoogle')}</Button>}
                />
              ) : (
                <EmptyState className="py-14" title={t('clients.more.reputation.noMatchTitle')} body={t('clients.more.reputation.noMatchBody')} action={<Button onClick={clearAll}>{t('clients.more.common.clearFilters')}</Button>} />
              )}
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {filtered.slice(0, limit).map((r) => (
                <ReviewCard key={r.id} review={r} />
              ))}
              <div className="flex items-center justify-between pt-2 text-small text-muted">
                <span>{t('clients.more.reputation.showing', { shown: Math.min(limit, filtered.length), total: filtered.length })}</span>
                {limit < filtered.length && <Button onClick={() => setLimit((l) => l + PAGE)}>{t('clients.more.reputation.loadMore')}</Button>}
              </div>
            </div>
          )}
        </div>
      </div>

      {drawerOpen && <FiltersDrawer value={filters} reviews={reviews} onClose={() => setDrawerOpen(false)} onApply={(f) => update(f)} />}
    </div>
  )
}

function QuickGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-body-strong text-ink">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

/* ─── Review card with reply ─────────────────────────────────────────────── */

function ReviewCard({ review }: { review: Review }) {
  const { t } = useTranslation()
  const drawer = useDrawer()
  const clients = useDb((s) => s.clients)
  const members = useDb((s) => s.teamMembers)
  const client = clients.find((c) => c.id === review.clientId)
  const member = members.find((m) => m.id === review.teamMemberId)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState(false)
  const [saving, setSaving] = useState(false)

  const startEdit = () => {
    setDraft(review.reply?.text ?? '')
    setError(false)
    setEditing(true)
  }
  const save = async () => {
    if (!draft.trim()) {
      setError(true)
      return
    }
    const had = !!review.reply
    setSaving(true)
    try {
      await replyToReview(review.id, draft)
      toast(had ? t('clients.more.reputation.replyUpdated') : t('clients.more.reputation.replyPosted'))
      setEditing(false)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setSaving(false)
    }
  }
  const remove = async () => {
    const ok = await confirm({ title: t('clients.more.reputation.deleteReplyTitle'), body: t('clients.more.reputation.deleteReplyBody'), confirmLabel: t('clients.more.common.delete'), tone: 'danger' })
    if (!ok) return
    await replyToReview(review.id, '')
    toast(t('clients.more.reputation.replyDeleted'))
  }

  return (
    <article className="card p-5">
      <header className="flex items-start gap-3">
        {client ? <ClientAvatar client={client} size={44} /> : <span className="h-11 w-11 shrink-0 rounded-full bg-sunken" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {client ? (
              <button type="button" onClick={() => drawer.open('client', { id: client.id, tab: 'reviews' })} className="truncate text-body-strong text-ink hover:underline">
                {clientName(client)}
              </button>
            ) : (
              <span className="text-body-strong text-ink">{t('clients.more.common.dash')}</span>
            )}
            <Chip tone={review.platform === 'google' ? 'info' : 'primary'} className="gap-1">
              {review.platform === 'google' && <GoogleMark size={12} />}
              {review.platform === 'google' ? t('clients.more.reputation.platformGoogle') : t('clients.more.reputation.platformInnoweb')}
            </Chip>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-muted">
            <Stars value={review.rating} />
            <span>{fmtDate(review.at)}</span>
            {review.serviceName && <span>{member ? t('clients.more.reputation.viaService', { service: review.serviceName, member: member.firstName }) : review.serviceName}</span>}
          </div>
        </div>
      </header>
      <p className={clsx('mt-3 text-body', review.text.trim() ? 'text-ink' : 'italic text-muted')}>{review.text.trim() || t('clients.more.reputation.noText')}</p>
      {review.hasImages && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-small text-muted">
          <ImageIcon size={14} aria-hidden />
          {t('clients.more.reputation.withImages')}
        </p>
      )}

      {editing ? (
        <div className="mt-4">
          <label htmlFor={`reply-${review.id}`} className="sr-only">
            {t('clients.more.reputation.reply')}
          </label>
          <TextArea
            id={`reply-${review.id}`}
            autoFocus
            value={draft}
            maxLength={1000}
            invalid={error}
            placeholder={t('clients.more.reputation.replyPlaceholder')}
            onChange={(e) => {
              setDraft(e.target.value)
              setError(false)
            }}
          />
          {error && <p className="mt-1.5 text-small text-danger">{t('clients.more.reputation.replyRequired')}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <Button onClick={() => setEditing(false)} disabled={saving}>
              {t('clients.more.common.cancel')}
            </Button>
            <Button variant="primary" loading={saving} onClick={() => void save()}>
              {review.reply ? t('clients.more.common.save') : t('clients.more.reputation.postReply')}
            </Button>
          </div>
        </div>
      ) : review.reply ? (
        <div className="mt-4 rounded-md bg-sunken px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-small font-semibold text-ink">
              {t('clients.more.reputation.yourReply')} <span className="font-normal text-muted">· {fmtDate(review.reply.at)}</span>
            </p>
            <Menu
              groups={[
                {
                  items: [
                    { label: t('clients.more.reputation.editReply'), onSelect: startEdit },
                    { label: t('clients.more.reputation.deleteReply'), danger: true, onSelect: () => void remove() },
                  ],
                },
              ]}
            />
          </div>
          <p className="mt-1 text-body text-ink">{review.reply.text}</p>
        </div>
      ) : (
        <Button variant="link" icon={<MessageSquare size={16} />} className="mt-3" onClick={startEdit}>
          {t('clients.more.reputation.reply')}
        </Button>
      )}
    </article>
  )
}

/* ─── Filters drawer ─────────────────────────────────────────────────────── */

type GroupKey = 'location' | 'rating' | 'service' | 'team' | 'type' | 'contains' | 'status' | 'platform'

function FiltersDrawer({ value, reviews, onClose, onApply }: { value: ReviewFilters; reviews: Review[]; onClose: () => void; onApply: (f: ReviewFilters) => void }) {
  const { t } = useTranslation()
  const locations = useDb((s) => s.locations)
  const members = useDb((s) => s.teamMembers)
  const [draft, setDraft] = useState(value)
  const [open, setOpen] = useState<GroupKey | null>('rating')
  const services = useMemo(() => [...new Set(reviews.map((r) => r.serviceName).filter((s): s is string => !!s))].sort(), [reviews])
  const flip = (k: GroupKey) => setOpen((o) => (o === k ? null : k))
  const set = (patch: Partial<ReviewFilters>) => setDraft((d) => ({ ...d, ...patch }))

  return (
    <SideDrawer
      open
      onClose={onClose}
      title={t('clients.more.reputation.allFilters')}
      footer={
        <>
          <Button onClick={() => setDraft(EMPTY_FILTERS)}>{t('clients.more.common.clearFilters')}</Button>
          <Button
            variant="primary"
            onClick={() => {
              onApply(draft)
              onClose()
            }}
          >
            {t('clients.more.common.apply')}
          </Button>
        </>
      }
    >
      <FilterGroup icon={<Building2 size={20} />} title={t('clients.more.reputation.groups.location')} count={draft.locations.length} open={open === 'location'} onToggle={() => flip('location')} onClear={() => set({ locations: [] })}>
        <CheckList options={locations.map((l) => ({ value: l.id, label: l.name }))} value={draft.locations} onChange={(v) => set({ locations: v })} />
      </FilterGroup>
      <FilterGroup icon={<Star size={20} />} title={t('clients.more.reputation.groups.rating')} count={draft.ratings.length} open={open === 'rating'} onToggle={() => flip('rating')} onClear={() => set({ ratings: [] })}>
        <CheckList options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: '★'.repeat(n) }))} value={draft.ratings.map(String)} onChange={(v) => set({ ratings: v.map(Number) })} />
      </FilterGroup>
      <FilterGroup icon={<Layers size={20} />} title={t('clients.more.reputation.groups.platform')} count={draft.platforms.length} open={open === 'platform'} onToggle={() => flip('platform')} onClear={() => set({ platforms: [] })}>
        <CheckList
          options={[
            { value: 'marketplace', label: t('clients.more.reputation.platformInnoweb') },
            { value: 'google', label: t('clients.more.reputation.platformGoogle') },
          ]}
          value={draft.platforms}
          onChange={(v) => set({ platforms: v as ReviewFilters['platforms'] })}
        />
      </FilterGroup>
      <FilterGroup icon={<Scissors size={20} />} title={t('clients.more.reputation.groups.service')} count={draft.services.length} open={open === 'service'} onToggle={() => flip('service')} onClear={() => set({ services: [] })}>
        <div className="max-h-72 overflow-y-auto">
          <CheckList options={services.map((s) => ({ value: s, label: s }))} value={draft.services} onChange={(v) => set({ services: v })} />
        </div>
      </FilterGroup>
      <FilterGroup icon={<Users size={20} />} title={t('clients.more.reputation.groups.team')} count={draft.team.length} open={open === 'team'} onToggle={() => flip('team')} onClear={() => set({ team: [] })}>
        <CheckList options={members.map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName}`.trim() }))} value={draft.team} onChange={(v) => set({ team: v })} />
      </FilterGroup>
      <FilterGroup icon={<MessageSquare size={20} />} title={t('clients.more.reputation.groups.type')} count={draft.types.length} open={open === 'type'} onToggle={() => flip('type')} onClear={() => set({ types: [] })}>
        <CheckList
          options={[
            { value: 'without', label: t('clients.more.reputation.type.without') },
            { value: 'with', label: t('clients.more.reputation.type.with') },
          ]}
          value={draft.types}
          onChange={(v) => set({ types: v as ReviewFilters['types'] })}
        />
      </FilterGroup>
      <FilterGroup icon={<ImageIcon size={20} />} title={t('clients.more.reputation.groups.contains')} count={draft.contains.length} open={open === 'contains'} onToggle={() => flip('contains')} onClear={() => set({ contains: [] })}>
        <CheckList
          options={[
            { value: 'images', label: t('clients.more.reputation.contains.images') },
            { value: 'text', label: t('clients.more.reputation.contains.text') },
          ]}
          value={draft.contains}
          onChange={(v) => set({ contains: v as ReviewFilters['contains'] })}
        />
      </FilterGroup>
      <FilterGroup icon={<Tag size={20} />} title={t('clients.more.reputation.groups.status')} count={draft.status.length} open={open === 'status'} onToggle={() => flip('status')} onClear={() => set({ status: [] })}>
        <CheckList
          options={[
            { value: 'new', label: t('clients.more.reputation.status.new') },
            { value: 'needs', label: t('clients.more.reputation.status.needs') },
            { value: 'done', label: t('clients.more.reputation.status.done') },
          ]}
          value={draft.status}
          onChange={(v) => set({ status: v as ReviewFilters['status'] })}
        />
      </FilterGroup>
    </SideDrawer>
  )
}

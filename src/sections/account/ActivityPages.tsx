import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { MessageSquareReply, SlidersHorizontal, Star, Wallet } from 'lucide-react'
import { Avatar, Button, Chip, DataTable, DateRangeButton, DetailList, EmptyState, LearnMore, Menu, MenuButton, Modal, PageHeader, PageSkeleton, RadioGroup, SearchInput, SideDrawer, TextArea, Toolbar, resolvePreset, toast, usePageLoading, type Column, type DateRangeValue } from '@/components/ui'
import { useDb } from '@/store/db'
import { replyToReview } from '@/api/panels'
import { fmtDate, fullName, money2 } from '@/lib/format'
import type { PayRun, PayRunLine, Review } from '@/types'
import { errorText, Stars, useMyTeamMember } from './shared'

const inRange = (iso: string, range: DateRangeValue) => {
  const d = iso.slice(0, 10)
  return d >= range.from && d <= range.to
}

// ─── Reviews ──────────────────────────────────────────────────────────────

type SortKey = 'recent' | 'oldest' | 'highest' | 'lowest'
type ReplyFilter = 'all' | 'with' | 'without'

export function AccountReviewsPage() {
  const { t } = useTranslation()
  const loading = usePageLoading()
  const member = useMyTeamMember()
  const reviews = useDb((s) => s.reviews)
  const clients = useDb((s) => s.clients)
  const workspace = useDb((s) => s.workspace)
  const [range, setRange] = useState<DateRangeValue>(() => resolvePreset('all_time'))
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')
  const [rating, setRating] = useState<'all' | '1' | '2' | '3' | '4' | '5'>('all')
  const [replyFilter, setReplyFilter] = useState<ReplyFilter>('all')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [scope, setScope] = useState<'all' | 'ws'>('all')
  const [draftRating, setDraftRating] = useState(rating)
  const [draftReply, setDraftReply] = useState(replyFilter)

  const clientName = useMemo(() => {
    const map = new Map(clients.map((c) => [c.id, fullName(c)]))
    return (id: string) => map.get(id) ?? '-'
  }, [clients])

  const inDates = useMemo(() => (member ? reviews.filter((r) => r.teamMemberId === member.id && inRange(r.at, range)) : []), [reviews, member, range])

  const summary = useMemo(() => {
    const counts = [5, 4, 3, 2, 1].map((star) => ({ star, count: inDates.filter((r) => r.rating === star).length }))
    const avg = inDates.length ? inDates.reduce((s, r) => s + r.rating, 0) / inDates.length : 0
    return { counts, avg, total: inDates.length }
  }, [inDates])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = inDates.filter((r) => {
      if (rating !== 'all' && r.rating !== Number(rating)) return false
      if (replyFilter === 'with' && !r.reply) return false
      if (replyFilter === 'without' && r.reply) return false
      if (q && !`${clientName(r.clientId)} ${r.text} ${r.serviceName ?? ''}`.toLowerCase().includes(q)) return false
      return true
    })
    const by: Record<SortKey, (a: Review, b: Review) => number> = {
      recent: (a, b) => b.at.localeCompare(a.at),
      oldest: (a, b) => a.at.localeCompare(b.at),
      highest: (a, b) => b.rating - a.rating || b.at.localeCompare(a.at),
      lowest: (a, b) => a.rating - b.rating || b.at.localeCompare(a.at),
    }
    return list.sort(by[sort])
  }, [inDates, rating, replyFilter, search, sort, clientName])

  const activeFilters = (rating !== 'all' ? 1 : 0) + (replyFilter !== 'all' ? 1 : 0)
  if (loading) return <PageSkeleton />

  const openFilters = () => {
    setDraftRating(rating)
    setDraftReply(replyFilter)
    setFiltersOpen(true)
  }

  return (
    <div className="mx-auto max-w-[1120px]">
      <PageHeader
        title={t('account.reviews.title')}
        subtitle={
          <>
            {t('account.reviews.subtitle')} <LearnMore topic="reviews">{t('account.common.learnMore')}</LearnMore>
          </>
        }
      />
      <Toolbar>
        <DateRangeButton value={range} onChange={setRange} presets={['all_time', 'today', 'last_7_days', 'last_30_days', 'last_90_days', 'last_month', 'last_year']} />
        <Menu
          align="left"
          trigger={({ open, toggle }) => (
            <MenuButton open={open} toggle={toggle}>
              {scope === 'all' ? t('account.reviews.allWorkspaces') : workspace.name}
            </MenuButton>
          )}
          groups={[{ items: [{ label: t('account.reviews.allWorkspaces'), checked: scope === 'all', onSelect: () => setScope('all') }, { label: workspace.name, checked: scope === 'ws', onSelect: () => setScope('ws') }] }]}
        />
        <Button icon={<SlidersHorizontal size={16} />} onClick={openFilters}>
          {t('account.reviews.filters')}
          {activeFilters > 0 && <span className="chip h-5 bg-primary px-1.5 text-caption text-on-primary">{activeFilters}</span>}
        </Button>
        <SearchInput value={search} onChange={setSearch} placeholder={t('account.reviews.search')} />
        <Menu
          trigger={({ open, toggle }) => (
            <MenuButton open={open} toggle={toggle}>
              {t(`account.reviews.sort.${sort}`)}
            </MenuButton>
          )}
          groups={[{ items: (['recent', 'oldest', 'highest', 'lowest'] as SortKey[]).map((k) => ({ label: t(`account.reviews.sort.${k}`), checked: sort === k, onSelect: () => setSort(k) })) }]}
        />
      </Toolbar>

      <div className="grid items-start gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="card p-6">
          <p className="font-display text-display text-ink">{summary.avg.toFixed(1)}</p>
          <Stars value={summary.avg} size={18} className="mt-1" />
          <p className="mt-1 text-small text-muted">{t('account.reviews.outOf')}</p>
          <p className="mt-1 text-body-strong text-ink">{t('account.reviews.count', { count: summary.total })}</p>
          <ul className="mt-5 flex flex-col gap-1">
            {summary.counts.map(({ star, count }) => {
              const active = rating === String(star)
              return (
                <li key={star}>
                  <button
                    type="button"
                    onClick={() => setRating(active ? 'all' : (String(star) as typeof rating))}
                    aria-pressed={active}
                    className={clsx('flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-small', active ? 'bg-primary-subtle' : 'hover:bg-sunken')}
                  >
                    <span className="flex w-6 items-center gap-0.5 text-ink">
                      {star}
                      <Star size={12} className="fill-warning text-warning" aria-hidden />
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-sunken">
                      <span className="block h-full rounded-full bg-warning" style={{ width: `${summary.total ? (count / summary.total) * 100 : 0}%` }} />
                    </span>
                    <span className="w-8 text-right text-muted">{count}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </aside>

        <div className="flex flex-col gap-4">
          {visible.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={<Star size={24} aria-hidden />}
                title={t('account.reviews.emptyTitle')}
                body={t('account.reviews.emptyBody')}
                action={
                  (activeFilters > 0 || search || range.preset !== 'all_time') && (
                    <Button
                      onClick={() => {
                        setRating('all')
                        setReplyFilter('all')
                        setSearch('')
                        setRange(resolvePreset('all_time'))
                      }}
                    >
                      {t('account.reviews.clear')}
                    </Button>
                  )
                }
              />
            </div>
          ) : (
            visible.slice(0, 60).map((r) => <ReviewCard key={r.id} review={r} clientName={clientName(r.clientId)} />)
          )}
        </div>
      </div>

      <SideDrawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title={t('account.reviews.filters')}
        footer={
          <>
            <Button
              onClick={() => {
                setDraftRating('all')
                setDraftReply('all')
              }}
            >
              {t('account.reviews.clear')}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setRating(draftRating)
                setReplyFilter(draftReply)
                setFiltersOpen(false)
              }}
            >
              {t('account.reviews.apply')}
            </Button>
          </>
        }
      >
        <h3 className="mb-3 text-body-strong text-ink">{t('account.reviews.rating')}</h3>
        <RadioGroup
          value={draftRating}
          onChange={setDraftRating}
          options={[{ value: 'all' as const, label: t('account.reviews.all') }, ...(['5', '4', '3', '2', '1'] as const).map((v) => ({ value: v, label: <Stars value={Number(v)} size={14} /> }))]}
        />
        <h3 className="mb-3 mt-6 text-body-strong text-ink">{t('account.reviews.replyStatus')}</h3>
        <RadioGroup
          value={draftReply}
          onChange={setDraftReply}
          options={[
            { value: 'all', label: t('account.reviews.all') },
            { value: 'with', label: t('account.reviews.withReplies') },
            { value: 'without', label: t('account.reviews.withoutReplies') },
          ]}
        />
      </SideDrawer>
    </div>
  )
}

function ReviewCard({ review, clientName }: { review: Review; clientName: string }) {
  const { t } = useTranslation()
  const [replying, setReplying] = useState(false)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const post = async () => {
    setSaving(true)
    setError('')
    try {
      await replyToReview(review.id, text)
      toast(t('account.reviews.replied'))
      setReplying(false)
      setText('')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className="card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={clientName} size={40} />
          <div className="min-w-0">
            <p className="truncate text-body-strong text-ink">{clientName}</p>
            <p className="text-small text-muted">
              {fmtDate(review.at)}
              {review.serviceName && ` · ${review.serviceName}`}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Chip tone="outline">{t(`account.reviews.${review.platform}`)}</Chip>
          <Stars value={review.rating} />
        </div>
      </div>
      <p className={clsx('mt-3 text-body', review.text ? 'text-ink' : 'italic text-muted')}>{review.text || t('account.reviews.noText')}</p>
      {review.reply ? (
        <div className="mt-4 rounded-md bg-sunken p-4">
          <p className="text-small text-muted">
            {t('account.reviews.yourReply')} · {fmtDate(review.reply.at)}
          </p>
          <p className="mt-1 text-body text-ink">{review.reply.text}</p>
        </div>
      ) : replying ? (
        <div className="mt-4">
          <TextArea autoFocus rows={3} value={text} invalid={!!error} placeholder={t('account.reviews.replyPlaceholder', { name: clientName.split(' ')[0] })} onChange={(e) => setText(e.target.value)} aria-label={t('account.reviews.reply')} />
          {error && <p className="mt-1.5 text-small text-danger">{error}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <Button onClick={() => setReplying(false)}>{t('account.common.cancel')}</Button>
            <Button variant="primary" loading={saving} onClick={post}>
              {t('account.reviews.postReply')}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="link" className="mt-3" icon={<MessageSquareReply size={16} />} onClick={() => setReplying(true)}>
          {t('account.reviews.reply')}
        </Button>
      )}
    </article>
  )
}

// ─── Pay runs ─────────────────────────────────────────────────────────────

interface PayRow {
  run: PayRun
  line: PayRunLine
}

export function AccountPayRunsPage() {
  const { t } = useTranslation()
  const loading = usePageLoading()
  const member = useMyTeamMember()
  const payRuns = useDb((s) => s.payRuns)
  const workspace = useDb((s) => s.workspace)
  const [range, setRange] = useState<DateRangeValue>(() => resolvePreset('last_30_days'))
  const [status, setStatus] = useState<'all' | PayRun['status']>('all')
  const [draftStatus, setDraftStatus] = useState(status)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [open, setOpen] = useState<PayRow | null>(null)

  const rows = useMemo<PayRow[]>(() => {
    if (!member) return []
    return payRuns
      .filter((run) => run.periodEnd >= range.from && run.periodStart <= range.to && (status === 'all' || run.status === status))
      .flatMap((run) => run.lines.filter((l) => l.teamMemberId === member.id).map((line) => ({ run, line })))
      .sort((a, b) => b.run.periodEnd.localeCompare(a.run.periodEnd))
  }, [payRuns, member, range, status])

  const totals = useMemo(() => ({ total: rows.reduce((s, r) => s + r.line.total, 0), paid: rows.reduce((s, r) => s + r.line.paid, 0) }), [rows])
  if (loading) return <PageSkeleton />

  const statusTone = (s: PayRun['status']) => (s === 'completed' ? 'success' : s === 'approved' ? 'info' : s === 'needs_review' ? 'warning' : 'neutral')
  const period = (run: PayRun) => `${fmtDate(run.periodStart)} – ${fmtDate(run.periodEnd)}`

  const columns: Column<PayRow>[] = [
    { key: 'period', header: t('account.payRuns.cols.period'), cell: (r) => <span className="text-body-strong text-ink">{period(r.run)}</span>, sortValue: (r) => r.run.periodEnd },
    { key: 'workspace', header: t('account.payRuns.cols.workspace'), cell: () => workspace.name },
    { key: 'status', header: t('account.payRuns.cols.status'), cell: (r) => <Chip tone={statusTone(r.run.status)}>{t(`account.payRuns.statuses.${r.run.status}`)}</Chip> },
    { key: 'wages', header: t('account.payRuns.cols.wages'), cell: (r) => money2(r.line.wages), sortValue: (r) => r.line.wages, align: 'right' },
    { key: 'commissions', header: t('account.payRuns.cols.commissions'), cell: (r) => money2(r.line.commissions), sortValue: (r) => r.line.commissions, align: 'right' },
    { key: 'tips', header: t('account.payRuns.cols.tips'), cell: (r) => money2(r.line.tips), sortValue: (r) => r.line.tips, align: 'right' },
    { key: 'total', header: t('account.payRuns.cols.total'), cell: (r) => <span className="text-body-strong">{money2(r.line.total)}</span>, sortValue: (r) => r.line.total, align: 'right' },
    { key: 'paid', header: t('account.payRuns.cols.paid'), cell: (r) => money2(r.line.paid), sortValue: (r) => r.line.paid, align: 'right' },
  ]

  return (
    <div className="mx-auto max-w-[1120px]">
      <PageHeader
        title={t('account.payRuns.title')}
        subtitle={
          <>
            {t('account.payRuns.subtitle')} <LearnMore topic="pay runs">{t('account.common.learnMore')}</LearnMore>
          </>
        }
      />
      <Toolbar>
        <DateRangeButton value={range} onChange={setRange} presets={['last_30_days', 'last_7_days', 'last_90_days', 'last_month', 'last_3_months', 'last_year', 'all_time']} />
        <Button
          icon={<SlidersHorizontal size={16} />}
          onClick={() => {
            setDraftStatus(status)
            setFiltersOpen(true)
          }}
        >
          {t('account.payRuns.filters')}
          {status !== 'all' && <span className="chip h-5 bg-primary px-1.5 text-caption text-on-primary">1</span>}
        </Button>
      </Toolbar>

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Wallet size={24} aria-hidden />}
            title={t('account.payRuns.emptyTitle')}
            body={t('account.payRuns.emptyBody')}
            action={
              <div className="flex flex-col items-center gap-4">
                <Button
                  variant="primary"
                  onClick={() => {
                    setRange(resolvePreset('all_time'))
                    setStatus('all')
                  }}
                >
                  {t('account.payRuns.viewAllTime')}
                </Button>
                <p className="text-small text-muted">{t('account.payRuns.notRight')}</p>
              </div>
            }
          />
        </div>
      ) : (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            <div className="card p-5">
              <p className="text-small text-muted">{t('account.payRuns.totalEarned')}</p>
              <p className="mt-1 font-display text-title-1 text-ink">{money2(totals.total)}</p>
            </div>
            <div className="card p-5">
              <p className="text-small text-muted">{t('account.payRuns.totalPaid')}</p>
              <p className="mt-1 font-display text-title-1 text-ink">{money2(totals.paid)}</p>
            </div>
            <div className="card p-5">
              <p className="text-small text-muted">{t('account.payRuns.title')}</p>
              <p className="mt-1 font-display text-title-1 text-ink">{t('account.payRuns.runs', { count: rows.length })}</p>
            </div>
          </div>
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.run.id} onRowClick={setOpen} />
          <p className="mt-4 text-small text-muted">{t('account.payRuns.notRight')}</p>
        </>
      )}

      <SideDrawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title={t('account.payRuns.filters')}
        footer={
          <>
            <Button onClick={() => setDraftStatus('all')}>{t('account.reviews.clear')}</Button>
            <Button
              variant="primary"
              onClick={() => {
                setStatus(draftStatus)
                setFiltersOpen(false)
              }}
            >
              {t('account.reviews.apply')}
            </Button>
          </>
        }
      >
        <h3 className="mb-3 text-body-strong text-ink">{t('account.payRuns.status')}</h3>
        <RadioGroup
          value={draftStatus}
          onChange={setDraftStatus}
          options={[{ value: 'all' as const, label: t('account.payRuns.allStatuses') }, ...(['draft', 'needs_review', 'approved', 'completed'] as const).map((s) => ({ value: s, label: t(`account.payRuns.statuses.${s}`) }))]}
        />
      </SideDrawer>

      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `${t('account.payRuns.detailTitle')} · ${period(open.run)}` : ''} subtitle={open ? t(`account.payRuns.source.${open.run.source}`) : undefined} footer={<Button onClick={() => setOpen(null)}>{t('account.common.close')}</Button>}>
        {open && (
          <>
            <div className="mb-5 flex items-center gap-3">
              <Chip tone={statusTone(open.run.status)}>{t(`account.payRuns.statuses.${open.run.status}`)}</Chip>
              <span className="text-small text-muted">{open.run.completedAt ? t('account.payRuns.paidOn', { date: fmtDate(open.run.completedAt) }) : t('account.payRuns.notPaid')}</span>
            </div>
            <DetailList
              rows={[
                { label: t('account.payRuns.cols.workspace'), value: workspace.name },
                { label: t('account.payRuns.cols.wages'), value: money2(open.line.wages) },
                { label: t('account.payRuns.cols.commissions'), value: money2(open.line.commissions) },
                { label: t('account.payRuns.cols.tips'), value: money2(open.line.tips) },
                { label: t('account.payRuns.cols.other'), value: money2(open.line.other) },
                { label: t('account.payRuns.cols.total'), value: <strong>{money2(open.line.total)}</strong> },
                { label: t('account.payRuns.cols.paid'), value: money2(open.line.paid) },
              ]}
            />
          </>
        )}
      </Modal>
    </div>
  )
}

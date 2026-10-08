import clsx from 'clsx'
import { Cake, CalendarPlus, Clock, Crown, Euro, PenLine, Plus, Search, Smile, Store, Users } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { ClientSegment } from '@/types'
import { useDb } from '@/store/db'
import { deleteSegment, duplicateSegment } from '@/api/clients'
import { Button, Chip, confirm, EmptyState, LearnMore, Menu, MenuButton, Page, PageHeader, PageSkeleton, PillTabs, SearchInput, toast, usePageLoading } from '@/components/ui'
import { useSegmentEvaluator } from '../lib/hooks'
import { ActionsTrigger } from '../components/common'

type Tab = 'standard' | 'custom'

const STANDARD_ICONS: Record<string, ReactNode> = {
  new: <Smile size={22} aria-hidden />,
  recent: <CalendarPlus size={22} aria-hidden />,
  first: <Store size={22} aria-hidden />,
  loyal: <Crown size={22} aria-hidden />,
  lapsed: <Clock size={22} aria-hidden />,
  spenders: <Euro size={22} aria-hidden />,
  birthdays: <Cake size={22} aria-hidden />,
}

export const blastPath = (segmentId?: string) => `/marketing/blast-campaigns/new${segmentId ? `?segment=${segmentId}` : ''}`

/** Shared segment actions (cards here and the edit page's Options menu). */
export function useSegmentActions() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return {
    duplicate: async (segment: ClientSegment) => {
      const copy = await duplicateSegment(segment.id)
      toast(t('clients.segments.toast.duplicated'))
      return copy
    },
    remove: async (segment: ClientSegment) => {
      const ok = await confirm({ title: t('clients.segments.confirmDelete.title'), body: t('clients.segments.confirmDelete.body', { name: segment.name }), confirmLabel: t('clients.segments.confirmDelete.confirm'), tone: 'danger' })
      if (!ok) return false
      await deleteSegment(segment.id)
      toast(t('clients.segments.toast.deleted'))
      return true
    },
    viewClients: (segment: ClientSegment) => navigate(`/clients/list?segment=${segment.id}`),
    sendBlast: (segment: ClientSegment) => navigate(blastPath(segment.id)),
  }
}

function SegmentCard({ segment, count }: { segment: ClientSegment; count: number }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const actions = useSegmentActions()
  const custom = !segment.standard
  return (
    <li className="card flex items-start gap-3 p-4 md:items-center md:gap-4 md:p-5">
      <span className={clsx('flex h-10 w-10 shrink-0 md:h-12 md:w-12 items-center justify-center rounded-full', custom ? 'bg-accent text-on-accent' : 'bg-primary text-on-primary')}>
        {custom ? <PenLine size={20} aria-hidden /> : (STANDARD_ICONS[segment.key ?? ''] ?? <Users size={22} aria-hidden />)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <button type="button" className="text-left text-body-strong text-ink hover:underline" onClick={() => navigate(`/clients/segments/edit/${segment.id}/rules`)}>
            {segment.name}
          </button>
          <Chip tone="primary" className="tabular">
            {count}
          </Chip>
        </p>
        <p className="mt-0.5 text-body text-muted">{segment.description}</p>
      </div>
      <Menu
        width={240}
        trigger={({ open, toggle }) => <ActionsTrigger label={t('clients.segments.actions')} open={open} toggle={toggle} />}
        groups={[
          {
            items: [
              { label: t('clients.segments.editSegment'), onSelect: () => navigate(`/clients/segments/edit/${segment.id}/rules`) },
              { label: t('clients.segments.duplicate'), onSelect: () => void actions.duplicate(segment) },
              ...(custom ? [{ label: t('clients.segments.deleteSegment'), danger: true, onSelect: () => void actions.remove(segment) }] : []),
            ],
          },
          {
            items: [
              {
                label: (
                  <span className="flex items-center justify-between gap-2">
                    {t('clients.segments.viewClients')}
                    <Chip tone="primary" className="tabular">
                      {count}
                    </Chip>
                  </span>
                ),
                onSelect: () => actions.viewClients(segment),
              },
              { label: t('clients.segments.sendBlast'), onSelect: () => actions.sendBlast(segment) },
            ],
          },
        ]}
      />
    </li>
  )
}

/** Client segments (clients.md §5): Standard / Custom tabs, search, segment cards with live counts. */
export function SegmentsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loading = usePageLoading()
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'custom' ? 'custom' : 'standard'
  const [query, setQuery] = useState('')
  const segments = useDb((s) => s.segments)
  const evaluator = useSegmentEvaluator()

  const counts = useMemo(() => new Map(segments.map((s) => [s.id, evaluator.count(s)])), [segments, evaluator])
  const q = query.trim().toLowerCase()
  const match = (s: ClientSegment) => !q || s.name.toLowerCase().includes(q)
  const standard = segments.filter((s) => s.standard && match(s))
  const custom = segments.filter((s) => !s.standard && match(s))
  const anyCustom = segments.some((s) => !s.standard)

  const setTab = (next: Tab) => {
    const p = new URLSearchParams(params)
    if (next === 'custom') p.set('tab', 'custom')
    else p.delete('tab')
    setParams(p, { replace: true })
  }

  const create = () => navigate('/clients/segments/create/rules')

  const list = (items: ClientSegment[]) => (
    <ul className="flex flex-col gap-3">
      {items.map((s) => (
        <SegmentCard key={s.id} segment={s} count={counts.get(s.id) ?? 0} />
      ))}
    </ul>
  )

  if (loading)
    return (
      <Page>
        <PageSkeleton rows={7} />
      </Page>
    )

  const noResults = q && (tab === 'standard' ? standard.length + custom.length === 0 : custom.length === 0)

  return (
    <Page>
      <PageHeader
        title={t('clients.segments.title')}
        count={segments.length}
        subtitle={
          <>
            {t('clients.segments.subtitle')} <LearnMore topic={t('clients.topics.segments')}>{t('clients.common.learnMore')}</LearnMore>
          </>
        }
        actions={
          <>
            <Menu
              width={220}
              trigger={({ open, toggle }) => (
                <MenuButton open={open} toggle={toggle}>
                  {t('clients.segments.options')}
                </MenuButton>
              )}
              groups={[{ items: [{ label: t('clients.segments.sendBlast'), onSelect: () => navigate(blastPath()) }] }]}
            />
            <Button variant="primary" onClick={create}>
              {t('clients.segments.add')}
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <PillTabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'standard', label: t('clients.segments.tabs.standard') },
            { value: 'custom', label: t('clients.segments.tabs.custom') },
          ]}
        />
        <SearchInput value={query} onChange={setQuery} placeholder={t('clients.segments.search')} className="min-w-0 basis-full md:min-w-[240px] md:max-w-xs md:basis-0" />
      </div>

      {noResults ? (
        <EmptyState
          icon={<Search size={24} aria-hidden />}
          title={t('clients.segments.noResults')}
          body={t('clients.segments.noResultsBody', { query: query.trim() })}
          action={<Button onClick={() => setQuery('')}>{t('clients.segments.clearSearch')}</Button>}
        />
      ) : tab === 'standard' ? (
        <>
          {list(standard)}
          {custom.length > 0 && (
            <>
              <h2 className="mb-4 mt-10 font-display text-title-3 text-ink">{t('clients.segments.customHeading')}</h2>
              {list(custom)}
            </>
          )}
        </>
      ) : anyCustom ? (
        list(custom)
      ) : (
        <EmptyState
          icon={<PenLine size={24} aria-hidden />}
          title={t('clients.segments.emptyCustom')}
          body={t('clients.segments.emptyCustomBody')}
          action={
            <Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={create}>
              {t('clients.segments.addSegment')}
            </Button>
          }
        />
      )}

      {!noResults && (tab === 'standard' || anyCustom) && (
        <div className="mt-4">
          <Button icon={<Plus size={16} aria-hidden />} onClick={create}>
            {t('clients.segments.addSegment')}
          </Button>
        </div>
      )}
    </Page>
  )
}

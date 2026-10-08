import { ArrowDownUp, SlidersHorizontal, Ticket, Timer, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate } from 'react-router-dom'
import { useDb } from '@/store/db'
import type { Deal } from '@/types'
import { Button, Checkbox, Chip, EmptyState, IntroPage, LearnMore, Menu, Page, PageHeader, PageSkeleton, SearchInput, Select, SideDrawer, Toolbar, confirm, toast, usePageLoading } from '@/components/ui'
import { duplicateDeal, setDealStatus } from '@/api/marketing'
import { money } from '@/lib/format'
import { dealDates, discountLabel, useDealScope } from '../helpers'

const TYPE_ICONS = { promotion: Ticket, flash_sale: Zap, last_minute: Timer }
type Sort = 'newest' | 'oldest' | 'name' | 'sales'

export function DealsIntroPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const deals = useDb((s) => s.deals)
  if (deals.length) return <Navigate to="/marketing/deals/list" replace />
  return (
    <Page wide>
      <IntroPage
        badge={t('marketing.deals.intro.badge')}
        title={t('marketing.deals.intro.title')}
        body={t('marketing.deals.intro.body')}
        bullets={[t('marketing.deals.intro.b1'), t('marketing.deals.intro.b2'), t('marketing.deals.intro.b3'), t('marketing.deals.intro.b4')]}
        primary={{ label: t('marketing.deals.intro.start'), onClick: () => navigate('/marketing/deals/new/type') }}
      />
    </Page>
  )
}

export function DealsListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loading = usePageLoading()
  const deals = useDb((s) => s.deals)
  const services = useDb((s) => s.services)
  const scope = useDealScope()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('newest')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [types, setTypes] = useState<Deal['type'][]>([])
  const [statuses, setStatuses] = useState<Deal['status'][]>(['active', 'inactive'])
  const [draftTypes, setDraftTypes] = useState(types)
  const [draftStatuses, setDraftStatuses] = useState(statuses)

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = deals.filter((d) => (!needle || d.name.toLowerCase().includes(needle)) && (!types.length || types.includes(d.type)) && statuses.includes(d.status))
    const sorted = [...list]
    if (sort === 'newest') sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    if (sort === 'oldest') sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name))
    if (sort === 'sales') sorted.sort((a, b) => b.salesTotal - a.salesTotal)
    return sorted
  }, [deals, q, types, statuses, sort])
  const filterCount = types.length + (statuses.length === 2 && statuses.includes('active') && statuses.includes('inactive') ? 0 : 1)

  const summary = (d: Deal) => {
    const base = t('marketing.deals.summary', { type: t(`marketing.deals.types.${d.type}`), value: discountLabel(d), scope: scope(d, services) })
    return d.type === 'last_minute' && d.lastMinuteHours ? `${base} · ${t('marketing.deals.withinHours', { count: d.lastMinuteHours })}` : base
  }

  const archive = async (d: Deal) => {
    if (!(await confirm({ title: t('marketing.deals.archive.title'), body: t('marketing.deals.archive.body', { name: d.name }), confirmLabel: t('marketing.deals.archive.confirm'), tone: 'danger' }))) return
    await setDealStatus(d.id, 'archived')
    toast(t('marketing.deals.toast.archived'))
  }

  if (loading) {
    return (
      <Page>
        <PageSkeleton />
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader
        title={t('marketing.deals.title')}
        count={deals.filter((d) => d.status !== 'archived').length}
        subtitle={
          <>
            {t('marketing.deals.subtitle')} <LearnMore topic={t('marketing.common.topics.deals')}>{t('marketing.common.learnMore')}</LearnMore>
          </>
        }
        actions={
          <Button variant="primary" onClick={() => navigate('/marketing/deals/new/type')} data-testid="deal-add">
            {t('marketing.common.add')}
          </Button>
        }
      />
      <Toolbar className="bg-transparent p-0">
        <SearchInput value={q} onChange={setQ} placeholder={t('marketing.deals.search')} className="max-w-xs" />
        <Button
          icon={<SlidersHorizontal size={16} />}
          className="rounded-full"
          onClick={() => {
            setDraftTypes(types)
            setDraftStatuses(statuses)
            setFiltersOpen(true)
          }}
        >
          {t('marketing.common.filters')}
          {filterCount > 0 && <span className="chip h-5 bg-primary px-1.5 text-caption text-on-primary">{filterCount}</span>}
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <ArrowDownUp size={16} className="text-muted" aria-hidden />
          <Select
            aria-label={t('marketing.deals.sortLabel')}
            className="h-10 w-56 rounded-full"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            options={(['newest', 'oldest', 'name', 'sales'] as Sort[]).map((s) => ({ value: s, label: t(`marketing.deals.sort.${s}`) }))}
          />
        </div>
      </Toolbar>

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Ticket size={24} />}
            title={deals.length ? t('marketing.deals.emptyFiltered') : t('marketing.deals.empty')}
            body={t('marketing.deals.emptyBody')}
            action={
              <Button variant="primary" onClick={() => navigate('/marketing/deals/new/type')}>
                {t('marketing.deals.create')}
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((d) => {
            const Icon = TYPE_ICONS[d.type]
            return (
              <li key={d.id} className="card flex flex-wrap items-center gap-5 px-6 py-5" data-testid={`deal-${d.id}`}>
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-warning">
                  <Icon size={26} aria-hidden />
                </span>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => navigate(`/marketing/deals/edit/${d.id}/details`)}>
                  <p className="text-body-lg font-semibold text-ink">{d.name}</p>
                  <p className="text-body text-muted">{summary(d)}</p>
                  <p className="text-body text-muted">
                    {dealDates(d, t('marketing.common.ongoing'))}
                    {d.code && <span className="ml-2 rounded-xs bg-sunken px-1.5 py-0.5 font-mono text-caption text-ink">{d.code}</span>}
                  </p>
                </button>
                <Chip tone={d.status === 'active' ? 'success' : d.status === 'archived' ? 'outline' : 'neutral'}>{t(`marketing.common.${d.status}`)}</Chip>
                <div className="w-28 text-right">
                  <p className="text-body text-muted">{t('marketing.deals.totalSales')}</p>
                  <p className="text-body-strong text-ink">{money(d.salesTotal)}</p>
                </div>
                <Menu
                  label={t('marketing.common.options')}
                  groups={[
                    {
                      items: [
                        { label: t('marketing.common.edit'), onSelect: () => navigate(`/marketing/deals/edit/${d.id}/details`) },
                        ...(d.status === 'archived'
                          ? [
                              {
                                label: t('marketing.deals.actions.restore'),
                                onSelect: async () => {
                                  await setDealStatus(d.id, 'inactive')
                                  toast(t('marketing.deals.toast.restored'))
                                },
                              },
                            ]
                          : [
                              {
                                label: d.status === 'active' ? t('marketing.deals.actions.deactivate') : t('marketing.deals.actions.activate'),
                                onSelect: async () => {
                                  await setDealStatus(d.id, d.status === 'active' ? 'inactive' : 'active')
                                  toast(d.status === 'active' ? t('marketing.deals.toast.deactivated') : t('marketing.deals.toast.activated'))
                                },
                              },
                            ]),
                        {
                          label: t('marketing.deals.actions.duplicate'),
                          onSelect: async () => {
                            await duplicateDeal(d.id)
                            toast(t('marketing.deals.toast.duplicated'))
                          },
                        },
                        ...(d.status !== 'archived' ? [{ label: t('marketing.deals.actions.archive'), onSelect: () => void archive(d) }] : []),
                      ],
                    },
                    { items: [{ label: t('marketing.deals.actions.campaign'), onSelect: () => navigate(`/marketing/blast-campaigns/new?deal=${d.id}`), disabled: d.status !== 'active', hint: d.status !== 'active' ? t('marketing.deals.actions.campaignHint') : undefined }] },
                  ]}
                />
              </li>
            )
          })}
        </ul>
      )}
      <p className="mt-6 text-center text-body text-muted">{t('marketing.deals.showing', { count: rows.length, total: deals.length })}</p>

      <SideDrawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title={t('marketing.common.filters')}
        footer={
          <>
            <Button
              onClick={() => {
                setDraftTypes([])
                setDraftStatuses(['active', 'inactive'])
              }}
            >
              {t('marketing.common.clear')}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setTypes(draftTypes)
                setStatuses(draftStatuses.length ? draftStatuses : ['active', 'inactive'])
                setFiltersOpen(false)
              }}
            >
              {t('marketing.common.apply')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-6">
          <fieldset>
            <legend className="mb-3 text-body-strong text-ink">{t('marketing.deals.filterType')}</legend>
            <div className="flex flex-col gap-3">
              {(['promotion', 'flash_sale', 'last_minute'] as const).map((ty) => (
                <Checkbox key={ty} label={t(`marketing.deals.types.${ty}`)} checked={draftTypes.includes(ty)} onChange={(v) => setDraftTypes(v ? [...draftTypes, ty] : draftTypes.filter((x) => x !== ty))} />
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-3 text-body-strong text-ink">{t('marketing.deals.filterStatus')}</legend>
            <div className="flex flex-col gap-3">
              {(['active', 'inactive', 'archived'] as const).map((st) => (
                <Checkbox key={st} label={t(`marketing.common.${st}`)} checked={draftStatuses.includes(st)} onChange={(v) => setDraftStatuses(v ? [...draftStatuses, st] : draftStatuses.filter((x) => x !== st))} />
              ))}
            </div>
          </fieldset>
        </div>
      </SideDrawer>
    </Page>
  )
}

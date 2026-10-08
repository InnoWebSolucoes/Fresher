import clsx from 'clsx'
import { ArrowDownUp, BarChart3, ChevronDown, FolderOpen, LineChart, Plus, Search, Star } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, EmptyState, LearnMore, Menu, MenuButton, PageSkeleton, confirm, toast, usePageLoading, type MenuGroup } from '@/components/ui'
import { useCurrentUser } from '@/store/session'
import { useUiStore } from '@/store/ui'
import { deleteCustomReport, deleteFolder, removeFromFolder, useCustomReports, useFolders, useInsights, useInsightsGate, type CustomReport, type ReportFolder } from '../data'
import { CATEGORIES, categoryIcon, customItems, inCategory, sortItems, standardItems, type ReportItem, type SortKey } from './catalog'
import { AddToFolderModal, CustomReportModal, FolderModal } from './modals'
import { ReportsLayout, useGroupCounts } from './ReportsLayout'

const GROUP_KEYS: Record<string, 'all' | 'favourites' | 'dashboards' | 'standard' | 'premium' | 'custom'> = { '1': 'all', '2': 'favourites', '6': 'dashboards', '3': 'standard', '4': 'premium', '5': 'custom' }
const SORTS: SortKey[] = ['category', 'updated', 'az', 'za']
type CreatedBy = 'anyone' | 'innoweb' | 'me'

/** /reports/report-group/:groupId?category= (reports.md §1). Folders use the id `f_<folderId>`. */
export function ReportGroupPage() {
  const { groupId = '1' } = useParams()
  const folders = useFolders()
  const folder = groupId.startsWith('f_') ? folders.find((f) => f.id === groupId.slice(2)) : undefined
  if (!GROUP_KEYS[groupId] && !folder) return <Navigate to="/reports/report-group/1?category=all" replace />
  return (
    <ReportsLayout active={groupId}>
      <GroupView key={groupId} groupId={groupId} folder={folder} />
    </ReportsLayout>
  )
}

function GroupView({ groupId, folder }: { groupId: string; folder?: ReportFolder }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loading = usePageLoading()
  const [params, setParams] = useSearchParams()
  const user = useCurrentUser()
  const insights = useInsights()
  const gate = useInsightsGate()
  const counts = useGroupCounts()
  const custom = useCustomReports()
  const favourites = useUiStore((s) => s.favouriteReports)
  const toggleFavourite = useUiStore((s) => s.toggleFavouriteReport)
  const [query, setQuery] = useState('')
  const [createdBy, setCreatedBy] = useState<CreatedBy>('anyone')
  const [sort, setSort] = useState<SortKey>('category')
  const [createOpen, setCreateOpen] = useState(false)
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null)
  const [editing, setEditing] = useState<CustomReport | null>(null)
  const [folderTarget, setFolderTarget] = useState<ReportItem | null>(null)
  const [folderModal, setFolderModal] = useState<'new' | 'rename' | null>(null)
  const key = folder ? 'folder' : GROUP_KEYS[groupId]
  const category = (CATEGORIES as readonly string[]).includes(params.get('category') ?? '') ? (params.get('category') as string) : 'all'

  const all = useMemo(() => [...standardItems(), ...(insights ? customItems(custom) : [])], [custom, insights])
  const inGroup = useMemo(() => {
    switch (key) {
      case 'favourites':
        return all.filter((r) => favourites.includes(r.slug))
      case 'dashboards':
        return all.filter((r) => r.group === 'dashboards')
      case 'standard':
        return all.filter((r) => !r.premium && !r.custom)
      case 'premium':
        return all.filter((r) => r.premium)
      case 'custom':
        return all.filter((r) => r.custom)
      case 'folder':
        return insights && folder ? (folder.items.map((s) => all.find((r) => r.slug === s)).filter(Boolean) as ReportItem[]) : []
      default:
        return all
    }
  }, [all, key, favourites, folder, insights])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = inGroup
      .filter((r) => inCategory(r, category))
      .filter((r) => !q || `${r.name} ${r.description}`.toLowerCase().includes(q))
      .filter((r) => createdBy === 'anyone' || (createdBy === 'innoweb' ? !r.custom : r.custom?.createdById === user?.id))
    return sortItems(list, sort)
  }, [inGroup, category, query, createdBy, sort, user?.id])

  if (loading) return <PageSkeleton />

  const gated = (key === 'custom' || key === 'folder') && !insights
  const showTabs = key !== 'dashboards' && !gated
  const showCreatedBy = key === 'all'
  const title = folder ? folder.name : t(`reports.landing.titles.${key}`)
  const subtitle = key === 'all' ? (
    <>
      {t('reports.landing.subtitles.all')} <LearnMore topic="Reports">{t('reports.page.learnMore')}</LearnMore>
    </>
  ) : key === 'standard' || key === 'premium' ? (
    t(`reports.landing.subtitles.${key}`)
  ) : undefined
  const count = folder ? inGroup.length : counts[key as keyof typeof counts]

  const addGroups: MenuGroup[] = [
    {
      items: [
        { label: t('reports.landing.addReport'), hint: t('reports.landing.addReportHint'), onSelect: () => setCreateOpen(true) },
        { label: t('reports.landing.addFolderItem'), hint: t('reports.landing.addFolderHint'), onSelect: () => setFolderModal('new') },
      ],
    },
  ]

  const removeFolder = async () => {
    if (!folder) return
    const ok = await confirm({ title: t('reports.folder.deleteTitle', { name: folder.name }), body: t('reports.folder.deleteBody'), confirmLabel: t('reports.folder.delete'), tone: 'danger' })
    if (!ok) return
    await deleteFolder(folder.id)
    toast(t('reports.folder.deleted'))
    navigate('/reports/report-group/1?category=all')
  }

  const cardMenu = (item: ReportItem): MenuGroup[] => {
    const items: MenuGroup['items'] = []
    if (item.custom) items.push({ label: t('reports.custom.editDetails'), onSelect: () => setEditing(item.custom!) })
    if (item.group !== 'dashboards') items.push({ label: t('reports.page.duplicate'), onSelect: () => setDuplicateOf(item.slug) })
    if (folder) items.push({ label: t('reports.folder.remove'), onSelect: () => void removeFromFolder(folder.id, item.slug).then(() => toast(t('reports.folder.removed', { folder: folder.name }))) })
    else items.push({ label: t('reports.folder.addToTitle'), onSelect: () => setFolderTarget(item) })
    const groups: MenuGroup[] = [{ items }]
    if (item.custom) {
      const report = item.custom
      groups.push({
        items: [
          {
            label: t('reports.custom.delete'),
            danger: true,
            onSelect: async () => {
              const ok = await confirm({ title: t('reports.custom.deleteTitle', { name: report.name }), body: t('reports.custom.deleteBody'), confirmLabel: t('reports.custom.delete'), tone: 'danger' })
              if (!ok) return
              await deleteCustomReport(report.id)
              toast(t('reports.custom.deleted'))
            },
          },
        ],
      })
    }
    return groups
  }

  const duplicateBase = duplicateOf?.startsWith('custom_') ? custom.find((c) => `custom_${c.id}` === duplicateOf) : undefined

  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-3 font-display text-title-1 text-ink">
            {title}
            <span className="chip h-6 bg-sunken px-2 text-caption text-muted">{count}</span>
          </h1>
          {subtitle && <p className="mt-1 text-body-lg text-muted">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {folder && insights && (
            <Menu
              trigger={({ open, toggle }) => <MenuButton open={open} toggle={toggle}>{t('reports.page.options')}</MenuButton>}
              groups={[{ items: [{ label: t('reports.folder.renameTitle'), onSelect: () => setFolderModal('rename') }, { label: t('reports.folder.delete'), danger: true, onSelect: () => void removeFolder() }] }]}
            />
          )}
          {insights ? (
            <Menu trigger={({ open, toggle }) => <MenuButton primary open={open} toggle={toggle}>{t('reports.landing.add')}</MenuButton>} groups={addGroups} width={280} />
          ) : (
            <Button variant="primary" icon={<Plus size={16} />} onClick={gate}>
              {t('reports.landing.add')}
            </Button>
          )}
        </div>
      </header>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <label className="relative block w-full max-w-[440px]">
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('reports.landing.search')} aria-label={t('reports.landing.search')} className="h-11 w-full rounded-full border border-line-strong bg-surface pl-10 pr-4 text-body text-ink placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </label>
        <div className="flex items-center gap-2">
          {showCreatedBy && (
            <Menu
              width={240}
              trigger={({ open, toggle }) => (
                <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={toggle} className={clsx('inline-flex h-11 items-center gap-2 rounded-full border bg-surface px-5 text-body-strong text-ink hover:bg-sunken', open ? 'border-primary ring-2 ring-primary/20' : 'border-line-strong')}>
                  {createdBy === 'anyone' ? t('reports.landing.createdBy') : t(`reports.landing.createdByOptions.${createdBy}`)}
                  <ChevronDown size={16} className={clsx('transition-transform', open && 'rotate-180')} aria-hidden />
                </button>
              )}
              groups={[{ heading: t('reports.landing.createdBy'), items: (['anyone', 'innoweb', 'me'] as const).map((v) => ({ label: t(`reports.landing.createdByOptions.${v}`), checked: createdBy === v, onSelect: () => setCreatedBy(v) })) }]}
            />
          )}
          <Menu
            width={240}
            trigger={({ open, toggle }) => (
              <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={toggle} className={clsx('inline-flex h-11 items-center gap-2 rounded-full border bg-surface px-5 text-body-strong text-ink hover:bg-sunken', open ? 'border-primary ring-2 ring-primary/20' : 'border-line-strong')}>
                {t(`reports.landing.sort.${sort}`)}
                <ArrowDownUp size={16} aria-hidden />
              </button>
            )}
            groups={[{ heading: t('reports.landing.sortBy'), items: SORTS.map((s) => ({ label: t(`reports.landing.sort.${s}`), checked: sort === s, onSelect: () => setSort(s) })) }]}
          />
        </div>
      </div>

      {showTabs && (
        <div className="mb-5 flex flex-wrap gap-1" role="tablist" aria-label={t('reports.landing.categoriesLabel')}>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={category === c}
              onClick={() => setParams((p) => { const n = new URLSearchParams(p); n.set('category', c); return n }, { replace: true })}
              className={clsx('h-10 rounded-full px-5 text-body-strong transition-colors', category === c ? 'bg-ink text-canvas' : 'text-ink hover:bg-sunken')}
            >
              {t(`reports.categories.${c}`)}
            </button>
          ))}
        </div>
      )}

      {gated ? (
        <div className="card">
          <EmptyState
            icon={<BarChart3 size={26} />}
            title={t('reports.landing.premiumFeature')}
            body={t('reports.landing.premiumFeatureBody')}
            action={<Button onClick={gate}>{t('reports.page.learnMore')}</Button>}
          />
        </div>
      ) : visible.length === 0 ? (
        <div className="card">
          <GroupEmpty groupKey={key} category={category} query={query} favouritesTotal={inGroup.length} onCreate={() => setCreateOpen(true)} onBrowse={() => navigate('/reports/report-group/1?category=all')} />
        </div>
      ) : (
        <ul className="flex flex-col gap-3" aria-label={title}>
          {visible.map((item) => {
            const fav = favourites.includes(item.slug)
            const Icon = item.custom ? LineChart : categoryIcon(item.group)
            return (
              <li key={item.slug} className="card relative flex items-center gap-4 px-6 py-5 transition-shadow hover:shadow-sm">
                <span className={clsx('flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-sunken', item.group === 'dashboards' ? 'text-success' : 'text-primary')}>
                  <Icon size={22} aria-hidden />
                </span>
                <Link to={`/reports/table/${item.slug}`} className="min-w-0 flex-1 before:absolute before:inset-0 before:rounded-lg focus-visible:outline-none focus-visible:before:ring-2 focus-visible:before:ring-primary">
                  <span className="block text-body-strong text-ink">{item.name}</span>
                  <span className="block text-body text-muted">{item.description}</span>
                  {item.custom && <span className="mt-1 block text-small text-subtle">{t('reports.custom.byline', { name: item.custom.createdBy || t('reports.custom.unknown') })}</span>}
                </Link>
                {item.premium && <span className="chip relative h-7 shrink-0 bg-primary-subtle px-3 text-primary ring-1 ring-primary/40">{t('reports.premium')}</span>}
                {item.custom && <span className="chip relative h-7 shrink-0 bg-sunken px-3 text-muted">{t('reports.custom.chip')}</span>}
                <button type="button" aria-pressed={fav} aria-label={t(fav ? 'reports.removeFavourite' : 'reports.addFavourite')} title={t(fav ? 'reports.removeFavourite' : 'reports.addFavourite')} onClick={() => toggleFavourite(item.slug)} className="icon-btn relative h-10 w-10">
                  <Star size={20} className={fav ? 'fill-accent text-accent' : 'text-ink'} aria-hidden />
                </button>
                {insights && (
                  <span className="relative">
                    <Menu label={t('reports.landing.reportActions', { name: item.name })} groups={cardMenu(item)} />
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <CustomReportModal open={createOpen} onClose={() => setCreateOpen(false)} folderId={folder?.id} />
      <CustomReportModal
        open={Boolean(duplicateOf)}
        onClose={() => setDuplicateOf(null)}
        base={duplicateBase?.base ?? duplicateOf ?? undefined}
        name={duplicateOf ? t('reports.custom.copyName', { name: all.find((r) => r.slug === duplicateOf)?.name ?? '' }) : undefined}
        config={duplicateBase?.config ?? (duplicateOf ? {} : undefined)}
        view={duplicateBase?.view ?? (duplicateOf ? {} : undefined)}
        folderId={folder?.id}
      />
      <CustomReportModal open={Boolean(editing)} report={editing ?? undefined} onClose={() => setEditing(null)} />
      <AddToFolderModal slug={folderTarget?.slug ?? null} name={folderTarget?.name ?? ''} onClose={() => setFolderTarget(null)} />
      <FolderModal open={folderModal !== null} folder={folderModal === 'rename' ? folder : undefined} onClose={() => setFolderModal(null)} onSaved={(f) => folderModal === 'new' && navigate(`/reports/report-group/f_${f.id}?category=all`)} />
    </>
  )
}

function GroupEmpty({ groupKey, category, query, favouritesTotal, onCreate, onBrowse }: { groupKey: string; category: string; query: string; favouritesTotal: number; onCreate: () => void; onBrowse: () => void }) {
  const { t } = useTranslation()
  if (query.trim()) return <EmptyState icon={<Search size={24} />} title={t('reports.landing.empty.searchTitle')} body={t('reports.landing.empty.searchBody')} />
  if (groupKey === 'favourites' && favouritesTotal === 0) return <EmptyState icon={<Star size={26} />} title={t('reports.emptyTitle')} body={t('reports.emptyBody')} />
  if (category === 'other') return <EmptyState icon={<LineChart size={26} />} title={t('reports.landing.empty.otherTitle')} body={t('reports.landing.empty.otherBody')} />
  if (groupKey === 'custom')
    return (
      <EmptyState
        icon={<LineChart size={26} />}
        title={t('reports.landing.empty.customTitle')}
        body={t('reports.landing.empty.customBody')}
        action={
          <Button variant="primary" icon={<Plus size={16} />} onClick={onCreate}>
            {t('reports.landing.addReport')}
          </Button>
        }
      />
    )
  if (groupKey === 'folder' && category === 'all') return <EmptyState icon={<FolderOpen size={26} />} title={t('reports.landing.empty.folderTitle')} body={t('reports.landing.empty.folderBody')} action={<Button onClick={onBrowse}>{t('reports.landing.empty.browse')}</Button>} />
  return <EmptyState icon={<LineChart size={26} />} title={t('reports.landing.empty.categoryTitle', { category: t(`reports.categories.${category}`) })} body={t('reports.landing.empty.categoryBody')} />
}

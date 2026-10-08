import clsx from 'clsx'
import { addDays, differenceInMinutes, parseISO } from 'date-fns'
import { format } from '@/lib/dates'
import {
  ArrowDown,
  ArrowDownAZ,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpZA,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  EyeOff,
  FileSpreadsheet,
  FileText,
  FileType,
  Pencil,
  Save,
  Settings,
  SlidersHorizontal,
  Star,
  Trash2,
  Undo2,
  WrapText,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { REPORTS, type ReportDef } from '@/app/reportCatalog'
import { Button, Chip, EmptyState, Menu, MenuButton, PageSkeleton, confirm, resolvePreset, toast, usePageLoading, type DateRangeValue, type PresetKey } from '@/components/ui'
import { useDrawer } from '@/lib/drawer'
import { now, todayISO } from '@/lib/time'
import { useUiStore } from '@/store/ui'
import { AdvancedFilters } from './components/AdvancedFilters'
import { CustomizeDrawer } from './components/CustomizeDrawer'
import { FiltersDrawer } from './components/FiltersDrawer'
import { GroupByMenu } from './components/GroupByMenu'
import { Pill, Popover } from './components/Popover'
import { ReportChart } from './components/ReportChart'
import { RANGE_PRESETS, ReportDateRange } from './components/ReportDateRange'
import { DashboardPage, DASHBOARDS } from './dashboards/DashboardPage'
import {
  customSlug,
  deleteCustomReport,
  isCustomSlug,
  saveReportConfig,
  updateCustomReport,
  useConfigs,
  useCustomReports,
  useInsights,
  useInsightsGate,
  type AdvRule,
  type CustomReport,
  type ReportConfig,
  type ReportView,
} from './data'
import { useCtx } from './engine/context'
import { exportReportCsv, exportReportPdf, exportReportXlsx, type ExportInput } from './engine/exporter'
import { optionLabel } from './engine/filters'
import { formatCell, isNumeric } from './engine/format'
import { L } from './engine/labels'
import type { Cell, Col, ColType, Filters, Link as RowLink, RangeFilters, Result, Spec } from './engine/types'
import { EMPTY_VIEW, applyRules, sortRows, visibleColumns, type ColumnView } from './engine/view'
import { breadcrumbCategory } from './landing/catalog'
import { CustomReportModal } from './landing/modals'
import { SPECS } from './specs'

const PAGE_SIZE = 100
const LOADED_AT = new Date()
const LANDING = '/reports/report-group/1?category=all'

/** Premium reports without Insights show blurred sample data (reports.md §2.9). */
function sampleData(result: Result): Result {
  let seed = 7
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }
  const scramble = (cells: Record<string, Cell>) => Object.fromEntries(Object.entries(cells).map(([k, v], i) => [k, i > 0 && typeof v === 'number' ? Math.round(rand() * 90000) / 10 : v]))
  const rows = result.rows.length ? result.rows : Array.from({ length: 8 }, (_, i) => ({ key: `s${i}`, cells: Object.fromEntries(result.columns.map((c, j) => [c.key, j === 0 ? '········' : 0])) }))
  return { ...result, rows: rows.map((r) => ({ ...r, cells: scramble(r.cells) })), total: result.total ? scramble(result.total) : null }
}

/** /reports/table/:slug — a dashboard (reports.md §3), a standard report (§2) or a custom report (Insights). */
export function ReportTablePage() {
  const { slug = '' } = useParams()
  if (DASHBOARDS.includes(slug)) return <DashboardPage key={slug} slug={slug} />
  return <ReportResolver key={slug} slug={slug} />
}

function ReportResolver({ slug }: { slug: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loading = usePageLoading()
  const customReports = useCustomReports()
  const insights = useInsights()
  const gate = useInsightsGate()
  const custom = isCustomSlug(slug) ? customReports.find((c) => customSlug(c.id) === slug) : undefined
  const baseSlug = custom?.base ?? slug
  const def = REPORTS.find((r) => r.slug === baseSlug)
  const spec = SPECS[baseSlug]
  if (loading) return <div className="mx-auto max-w-[1400px] px-8 py-8"><PageSkeleton /></div>
  if (!def || !spec || (isCustomSlug(slug) && !custom))
    return (
      <div className="mx-auto max-w-[1400px] px-8 py-8">
        <div className="card">
          <EmptyState icon={<BarChart3 size={26} />} title={t('reports.page.notFound')} body={t('reports.page.notFoundBody')} action={<Button variant="primary" onClick={() => navigate(LANDING)}>{t('reports.page.allReports')}</Button>} />
        </div>
      </div>
    )
  if (custom && !insights)
    return (
      <div className="mx-auto max-w-[1400px] px-8 py-8">
        <Button icon={<ArrowLeft size={16} />} className="mb-6 rounded-full" onClick={() => navigate(LANDING)}>{t('reports.page.back')}</Button>
        <div className="card">
          <EmptyState icon={<BarChart3 size={26} />} title={t('reports.landing.premiumFeature')} body={t('reports.landing.premiumFeatureBody')} action={<Button onClick={gate}>{t('reports.page.learnMore')}</Button>} />
        </div>
      </div>
    )
  return <ReportPage slug={slug} def={def} spec={spec} custom={custom} />
}

interface UrlState {
  groupBy: string
  range: DateRangeValue
  filters: Filters
  ranges: RangeFilters
}

/** Read the report state from the query string (?groupBy=item&shortcut=month_to_date&f_type=service). */
function readUrl(params: URLSearchParams, fallback: UrlState): UrlState {
  if (!params.has('shortcut')) return { ...fallback, groupBy: params.get('groupBy') ?? fallback.groupBy }
  const preset = params.get('shortcut') as PresetKey
  const range = preset === 'custom' ? { preset, from: params.get('from') ?? todayISO(), to: params.get('to') ?? todayISO() } : resolvePreset((RANGE_PRESETS as string[]).includes(preset) ? preset : fallback.range.preset)
  const filters: Filters = {}
  const ranges: RangeFilters = {}
  params.forEach((value, key) => {
    if (key.startsWith('f_') && value) filters[key.slice(2)] = value.split(',')
    if (key.startsWith('r_')) {
      const [min, max] = value.split('~')
      ranges[key.slice(2)] = { min: min === '' ? undefined : Number(min), max: max === '' || max === undefined ? undefined : Number(max) }
    }
  })
  return { groupBy: params.get('groupBy') ?? fallback.groupBy, range, filters, ranges }
}

function writeUrl(n: URLSearchParams, s: Partial<UrlState>) {
  if (s.groupBy !== undefined) {
    if (s.groupBy) n.set('groupBy', s.groupBy)
    else n.delete('groupBy')
  }
  if (s.range) {
    n.set('shortcut', s.range.preset)
    if (s.range.preset === 'custom') {
      n.set('from', s.range.from)
      n.set('to', s.range.to)
    } else {
      n.delete('from')
      n.delete('to')
    }
  }
  if (s.filters) {
    ;[...n.keys()].filter((k) => k.startsWith('f_')).forEach((k) => n.delete(k))
    Object.entries(s.filters).forEach(([k, v]) => v.length && n.set(`f_${k}`, v.join(',')))
  }
  if (s.ranges) {
    ;[...n.keys()].filter((k) => k.startsWith('r_')).forEach((k) => n.delete(k))
    Object.entries(s.ranges).forEach(([k, r]) => (r.min !== undefined || r.max !== undefined) && n.set(`r_${k}`, `${r.min ?? ''}~${r.max ?? ''}`))
  }
}

/** Report page anatomy (reports.md §2): header, toolbar, chips, chart, table, footer. */
function ReportPage({ slug, def, spec, custom }: { slug: string; def: ReportDef; spec: Spec; custom?: CustomReport }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const drawer = useDrawer()
  const ctx = useCtx()
  const insights = useInsights()
  const gate = useInsightsGate()
  const configs = useConfigs()
  const favourites = useUiStore((s) => s.favouriteReports)
  const toggleFav = useUiStore((s) => s.toggleFavouriteReport)
  const [params, setParams] = useSearchParams()
  const config: ReportConfig | undefined = insights ? (custom ? custom.config : configs[def.slug]) : undefined
  const name = custom?.name ?? def.name
  const description = custom ? custom.description || def.description : def.description

  // Group by options shown (Customize › Grouping) and defaults.
  const allGroupings = useMemo(() => spec.groupings ?? [], [spec.groupings])
  const shownGroupings = useMemo(() => {
    if (!config?.groupings) return allGroupings.filter((g) => !g.hidden)
    const byKey = new Map(allGroupings.map((g) => [g.key, g]))
    return config.groupings.map((k) => byKey.get(k)).filter(Boolean) as typeof allGroupings
  }, [allGroupings, config?.groupings])
  const datePicker = config?.datePicker ?? 'range'
  const defaultPreset: PresetKey = config?.defaultDate ?? custom?.view.shortcut ?? spec.range ?? 'all_time'
  const fallback = useMemo<UrlState>(() => {
    const v: ReportView = custom?.view ?? {}
    const range = v.shortcut === 'custom' && v.from && v.to ? { preset: 'custom' as const, from: v.from, to: v.to } : resolvePreset(defaultPreset)
    return { groupBy: spec.groupBy ? (v.groupBy ?? (spec.defaultGroupBy && shownGroupings.some((g) => g.key === spec.defaultGroupBy) ? spec.defaultGroupBy : undefined) ?? shownGroupings[0]?.key ?? allGroupings[0]?.key ?? '') : '', range, filters: v.filters ?? {}, ranges: v.ranges ?? {} }
  }, [custom?.view, defaultPreset, spec.groupBy, spec.defaultGroupBy, shownGroupings, allGroupings])
  // Only the report's own params (not drawer params) drive the data.
  const stateKey = useMemo(() => {
    const n = new URLSearchParams()
    params.forEach((v, k) => (k === 'groupBy' || k === 'shortcut' || k === 'from' || k === 'to' || k.startsWith('f_') || k.startsWith('r_')) && n.append(k, v))
    return n.toString()
  }, [params])
  const state = useMemo(() => readUrl(new URLSearchParams(stateKey), fallback), [stateKey, fallback])
  const { filters, ranges } = state
  const groupBy = spec.groupBy && allGroupings.some((g) => g.key === state.groupBy) ? state.groupBy : fallback.groupBy
  const single = datePicker === 'single'
  const range: DateRangeValue = useMemo(() => {
    if (!single) return state.range
    const day = state.range.to > todayISO() ? todayISO() : state.range.to
    return { ...state.range, from: day, to: day }
  }, [single, state.range])

  // Put the initial state in the URL once so drill-downs can go back.
  const initialized = params.has('shortcut')
  useEffect(() => {
    if (initialized) return
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev)
        writeUrl(n, { ...fallback, groupBy: n.get('groupBy') ?? fallback.groupBy })
        return n
      },
      { replace: true },
    )
  }, [initialized, fallback, setParams])

  const update = useCallback(
    (s: Partial<UrlState>, push = false) =>
      setParams(
        (prev) => {
          const n = new URLSearchParams(prev)
          if (!n.has('shortcut')) writeUrl(n, { ...fallback, groupBy: n.get('groupBy') ?? fallback.groupBy })
          writeUrl(n, s)
          return n
        },
        { replace: !push },
      ),
    [setParams, fallback],
  )

  const [rules, setRules] = useState<AdvRule[]>(() => custom?.view.rules ?? [])
  const [colView, setColView] = useState<ColumnView>(EMPTY_VIEW)
  const [extra, setExtra] = useState<Record<string, string>>(() => Object.fromEntries((spec.selectors ?? []).map((s) => [s.key, s.default])))
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [advOpen, setAdvOpen] = useState(false)
  const [seedField, setSeedField] = useState<string | null>(null)
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [duplicateOpen, setDuplicateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [page, setPage] = useState(0)
  const locked = def.premium && !insights
  const fav = favourites.includes(slug)

  const built = useMemo(() => spec.build(ctx, { range: spec.range ? range : resolvePreset('all_time'), groupBy, filters, ranges, extra }), [spec, ctx, range, groupBy, filters, ranges, extra])
  const result = useMemo(() => (locked ? sampleData(built) : built), [built, locked])
  const ruled = useMemo(() => applyRules(result, rules), [result, rules])
  const columns = useMemo(() => visibleColumns(ruled, config, colView), [ruled, config, colView])
  const rows = useMemo(() => sortRows(ruled.rows, colView.sort, ruled.columns), [ruled, colView.sort])
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const pageRows = rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)
  // Back to the first page whenever the data changes shape.
  useEffect(() => {
    setPage(0)
  }, [stateKey, rules])

  const filterKeys = useMemo(() => [...spec.filters, ...(spec.premiumFilters ?? []).filter((k) => !spec.filters.includes(k))], [spec])
  const shownFilterKeys = config?.filters ?? filterKeys
  const activeFilters = Object.entries(filters).flatMap(([key, values]) => values.map((value) => ({ key, value })))
  const activeRanges = Object.entries(ranges).filter(([, r]) => r && (r.min !== undefined || r.max !== undefined))
  const filterCount = activeFilters.length + activeRanges.length
  const advFields = useMemo(() => [...result.columns.slice(1).filter((c) => isNumeric(c.type)), ...result.columns.filter((c) => !isNumeric(c.type))], [result.columns])
  const statement = result.rows.some((r) => r.kind)
  const chart = config?.chart?.show ? config.chart : null
  const chartMetric = chart ? (columns.find((c) => c.key === chart.metric) ?? result.columns.find((c) => c.key === chart.metric) ?? columns.find((c, i) => i > 0 && c.type === 'money') ?? columns.find((c, i) => i > 0 && isNumeric(c.type))) : undefined
  const minutesAgo = Math.max(1, differenceInMinutes(now(), LOADED_AT) + 1)
  const category = breadcrumbCategory(def.group)

  const follow = (link: RowLink) => {
    if (link.kind === 'sale' && link.id) drawer.open('sale', { id: link.id })
    else if (link.kind === 'appointment' && link.id) drawer.open('appointment', { id: link.id })
    else if (link.kind === 'client' && link.id) drawer.open('client', { id: link.id })
    else if (link.kind === 'report' && link.to) navigate(`/reports/table/${link.to}`)
    else if (link.kind === 'drill' && link.drill) {
      const d = link.drill
      update({ ...(d.filter ? { filters: { ...filters, [d.filter.key]: [d.filter.value] } } : {}), ...(d.range ? { range: { preset: 'custom', ...d.range } } : {}), ...(d.groupBy ? { groupBy: d.groupBy } : {}) }, true)
    }
  }

  const removeFilter = (key: string, value: string) => {
    const next = { ...filters, [key]: filters[key].filter((v) => v !== value) }
    if (!next[key].length) delete next[key]
    update({ filters: next })
  }
  const removeRange = (key: string) => {
    const next = { ...ranges }
    delete next[key]
    update({ ranges: next })
  }
  const clearAll = () => {
    update({ filters: {}, ranges: {} })
    setRules([])
  }

  const exportInput = (): ExportInput => ({ slug: custom ? custom.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || def.slug : def.slug, name, columns, rows, total: ruled.total, range: spec.range ? range : null, groupedBy: spec.groupBy && groupBy ? L(`dim.${groupBy}`) : null })
  const runExport = async (kind: 'csv' | 'xlsx' | 'pdf') => {
    if (locked) return gate()
    if (kind === 'csv') exportReportCsv(exportInput())
    else if (kind === 'xlsx') await exportReportXlsx(exportInput())
    else await exportReportPdf(exportInput())
    toast(t('reports.page.exported', { format: t(`reports.page.formats.${kind}`) }))
  }

  const saveView = async () => {
    if (!custom) return
    await updateCustomReport(custom.id, { view: { groupBy, shortcut: range.preset, from: range.preset === 'custom' ? range.from : undefined, to: range.preset === 'custom' ? range.to : undefined, filters, ranges, rules } })
    toast(t('reports.custom.viewSaved'))
  }
  const removeCustom = async () => {
    if (!custom) return
    const ok = await confirm({ title: t('reports.custom.deleteTitle', { name: custom.name }), body: t('reports.custom.deleteBody'), confirmLabel: t('reports.custom.delete'), tone: 'danger' })
    if (!ok) return
    await deleteCustomReport(custom.id)
    toast(t('reports.custom.deleted'))
    navigate('/reports/report-group/5?category=all')
  }

  const saveConfig = async (next: ReportConfig | null) => {
    await saveReportConfig(slug, next)
    toast(next ? t('reports.customize.saved') : t('reports.customize.resetDone'))
    const nextGroupings = next?.groupings ?? allGroupings.filter((g) => !g.hidden).map((g) => g.key)
    const nextPreset = next?.defaultDate ?? spec.range ?? 'all_time'
    update({ ...(spec.groupBy && !nextGroupings.includes(groupBy) ? { groupBy: nextGroupings[0] ?? '' } : {}), ...(nextPreset !== defaultPreset ? { range: resolvePreset(nextPreset) } : {}) })
  }

  const moveColumn = (key: string, dir: -1 | 1) => {
    const keys = columns.slice(1).map((c) => c.key)
    const i = keys.indexOf(key)
    const j = i + dir
    if (i < 0 || j < 0 || j >= keys.length) return
    ;[keys[i], keys[j]] = [keys[j], keys[i]]
    setColView((v) => ({ ...v, order: keys }))
  }

  const optionGroups = [
    {
      items: [
        { label: t('reports.page.duplicate'), icon: <Copy size={16} />, onSelect: () => (insights ? setDuplicateOpen(true) : gate()) },
        { label: t(fav ? 'reports.removeFavourite' : 'reports.addFavourite'), icon: <Star size={16} />, onSelect: () => toggleFav(slug) },
        ...(custom
          ? [
              { label: t('reports.custom.saveView'), icon: <Save size={16} />, onSelect: () => void saveView() },
              { label: t('reports.custom.editDetails'), icon: <Pencil size={16} />, onSelect: () => setEditOpen(true) },
              { label: t('reports.custom.delete'), icon: <Trash2 size={16} />, danger: true, onSelect: () => void removeCustom() },
            ]
          : []),
      ],
    },
    {
      heading: t('reports.page.export'),
      items: [
        { label: t('reports.page.formats.csv'), icon: <FileText size={16} />, onSelect: () => void runExport('csv') },
        { label: t('reports.page.formats.xlsx'), icon: <FileSpreadsheet size={16} />, onSelect: () => void runExport('xlsx') },
        { label: t('reports.page.formats.pdf'), icon: <FileType size={16} />, onSelect: () => void runExport('pdf') },
      ],
    },
  ]

  const hasTotal = Boolean(ruled.total && rows.length)

  return (
    <div className="mx-auto w-full max-w-[1400px] px-8 py-8">
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Button icon={<ArrowLeft size={16} />} className="rounded-full" onClick={() => navigate(custom ? '/reports/report-group/5?category=all' : LANDING)}>
          {t('reports.page.back')}
        </Button>
        <nav aria-label={t('reports.page.breadcrumb')} className="flex flex-wrap items-center gap-2 text-body text-muted">
          <Link to={LANDING} className="hover:text-ink hover:underline">{t('reports.landing.groups.all')}</Link>
          {custom && (
            <>
              <span aria-hidden>·</span>
              <Link to="/reports/report-group/5?category=all" className="hover:text-ink hover:underline">{t('reports.landing.groups.custom')}</Link>
            </>
          )}
          {!custom && category && (
            <>
              <span aria-hidden>·</span>
              <Link to={`/reports/report-group/1?category=${category}`} className="hover:text-ink hover:underline">{t(`reports.categories.${category}`)}</Link>
            </>
          )}
          <span aria-hidden>·</span>
          <span className="text-ink" aria-current="page">{name}</span>
        </nav>
      </div>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-3 font-display text-title-1 text-ink">
            {name}
            <button type="button" className="icon-btn h-9 w-9" aria-label={t(fav ? 'reports.removeFavourite' : 'reports.addFavourite')} title={t(fav ? 'reports.removeFavourite' : 'reports.addFavourite')} aria-pressed={fav} onClick={() => toggleFav(slug)}>
              <Star size={22} className={fav ? 'fill-accent text-accent' : 'text-ink'} aria-hidden />
            </button>
            {def.premium && <span className="chip h-7 bg-primary-subtle px-3 text-small text-primary">{t('reports.premium')}</span>}
            {custom && <Chip>{t('reports.custom.chip')}</Chip>}
          </h1>
          <p className="mt-1 text-body-lg text-muted">
            {description} {t('reports.page.dataFrom', { count: minutesAgo })}
          </p>
          {custom && <p className="mt-1 text-small text-subtle">{t('reports.custom.basedOnLine', { name: def.name, by: custom.createdBy || t('reports.custom.unknown') })}</p>}
        </div>
        <Menu trigger={({ open, toggle }) => <MenuButton open={open} toggle={toggle}>{t('reports.page.options')}</MenuButton>} groups={optionGroups} width={260} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {spec.groupBy && allGroupings.length > 0 && <GroupByMenu value={groupBy} options={shownGroupings.length ? shownGroupings : allGroupings} insights={insights} onChange={(k) => update({ groupBy: k })} onGate={gate} />}
        {(spec.selectors ?? []).map((sel) => (
          <ChoicePill key={sel.key} heading={L(`selector.${sel.key}`)} value={extra[sel.key] ?? sel.default} options={sel.options.map((o) => ({ value: o, label: L(`${sel.key}.${o}`) }))} onChange={(v) => setExtra((x) => ({ ...x, [sel.key]: v }))} />
        ))}
        {spec.range && spec.asOf && <DateStepper day={range.to > todayISO() ? todayISO() : range.to} onChange={(day) => update({ range: day === todayISO() ? resolvePreset('today') : { preset: 'custom', from: day, to: day } })} />}
        {spec.range && !spec.asOf && <ReportDateRange value={range} single={single} onChange={(v) => update({ range: single ? { preset: 'custom', from: v.from, to: v.from } : v })} />}
        {filterKeys.length > 0 && (
          <Pill onClick={() => setFiltersOpen(true)} active={filterCount > 0}>
            <SlidersHorizontal size={18} aria-hidden />
            {t('reports.page.filters')}
            {filterCount > 0 && <span className="rounded-full bg-primary px-2 text-caption text-on-primary">{filterCount}</span>}
          </Pill>
        )}
        {spec.advanced && (
          <AdvancedFilters
            fields={advFields}
            rules={rules}
            open={advOpen}
            seedField={seedField}
            onOpenChange={(o) => {
              setAdvOpen(o)
              if (!o) setSeedField(null)
            }}
            onApply={(next) => {
              setRules(next)
              toast(next.length ? t('reports.adv.applied', { count: next.length }) : t('reports.adv.cleared'))
            }}
          />
        )}
        <span className="flex-1" />
        {spec.customize && (
          <button type="button" className="flex h-11 w-11 items-center justify-center rounded-full border border-line-strong bg-surface text-ink hover:bg-sunken" aria-label={t('reports.customize.title')} title={t('reports.customize.title')} onClick={() => setCustomizeOpen(true)}>
            <Settings size={20} aria-hidden />
          </button>
        )}
      </div>

      {(filterCount > 0 || rules.length > 0 || colView.hidden.length > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {activeFilters.map((f) => (
            <ChipX key={`${f.key}:${f.value}`} label={optionLabel(ctx, f.key, f.value)} title={t(`reports.filterName.${f.key}`, { defaultValue: f.key })} onRemove={() => removeFilter(f.key, f.value)} />
          ))}
          {activeRanges.map(([key, r]) => (
            <ChipX key={key} label={`${t(`reports.filterName.${key}`, { defaultValue: key })}: ${r.min ?? 0} – ${r.max ?? '∞'}`} onRemove={() => removeRange(key)} />
          ))}
          {rules.map((rule) => {
            const col = result.columns.find((c) => c.key === rule.field)
            return <ChipX key={rule.id} label={`${col?.label ?? rule.field} ${t(`reports.adv.ops.${rule.op}`)} ${rule.value}${rule.op === 'between' ? ` – ${rule.value2 ?? ''}` : ''}`} onRemove={() => setRules((rs) => rs.filter((x) => x.id !== rule.id))} />
          })}
          {colView.hidden.length > 0 && (
            <button type="button" className="chip h-8 gap-1 bg-sunken px-3 text-muted hover:text-ink" onClick={() => setColView((v) => ({ ...v, hidden: [] }))}>
              <EyeOff size={14} aria-hidden />
              {t('reports.page.hiddenColumns', { count: colView.hidden.length })}
            </button>
          )}
          {(filterCount > 0 || rules.length > 0) && (
            <Button variant="ghost" size="sm" onClick={clearAll}>
              {t('reports.page.clearFilters')}
            </Button>
          )}
        </div>
      )}

      {chart && chartMetric && !locked && rows.length > 0 && <ReportChart rows={rows} label={columns[0]} metric={chartMetric} kind={chart.kind ?? 'bar'} />}

      <div className="relative overflow-hidden rounded-lg border border-line bg-surface">
        <div className={clsx('overflow-x-auto', locked && 'pointer-events-none select-none blur-[4px]')} aria-hidden={locked || undefined}>
          <table className="w-full min-w-max border-collapse text-left text-body">
            <thead>
              <tr className="border-b border-line">
                {columns.map((c, i) => (
                  <HeaderCell
                    key={c.key}
                    col={c}
                    index={i}
                    count={columns.length}
                    sortable={!statement}
                    sort={colView.sort?.key === c.key ? colView.sort.dir : null}
                    unwrapped={colView.unwrapped.includes(c.key)}
                    advanced={spec.advanced}
                    onAdvanced={() => {
                      setSeedField(c.key)
                      setAdvOpen(true)
                    }}
                    onSort={(dir) => setColView((v) => ({ ...v, sort: { key: c.key, dir } }))}
                    onMove={(dir) => moveColumn(c.key, dir)}
                    onWrap={() => setColView((v) => ({ ...v, unwrapped: v.unwrapped.includes(c.key) ? v.unwrapped.filter((k) => k !== c.key) : [...v.unwrapped, c.key] }))}
                    onHide={() => setColView((v) => ({ ...v, hidden: [...v.hidden, c.key], sort: v.sort?.key === c.key ? null : v.sort }))}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {hasTotal && (
                <tr className="border-b border-line bg-sunken font-semibold">
                  {columns.map((c, i) => {
                    const v = ruled.total![c.key]
                    return (
                      <td key={c.key} className={clsx('whitespace-nowrap px-5 py-4', i > 0 && isNumeric(c.type) && 'text-right tabular')}>
                        {i === 0 ? String(v ?? '') : v === undefined || v === null ? '' : formatCell(v, c.type)}
                      </td>
                    )
                  })}
                </tr>
              )}
              {pageRows.map((r) => (
                <tr key={r.key} className={clsx('border-b border-line last:border-0', r.kind === 'bold' && 'bg-sunken font-semibold', r.kind === 'section' && 'border-0')}>
                  {columns.map((c, i) => {
                    const type: ColType = r.type && i > 0 ? r.type : c.type
                    const link = r.links?.[c.key]
                    const text = r.kind === 'section' && i > 0 ? '' : i === 0 && r.kind ? String(r.cells[c.key] ?? '') : formatCell(r.cells[c.key], type)
                    const wrap = !isNumeric(type) && !colView.unwrapped.includes(c.key)
                    return (
                      <td
                        key={c.key}
                        className={clsx(
                          'px-5 py-4 align-top',
                          wrap ? 'min-w-[120px] max-w-[320px] whitespace-normal break-words' : 'whitespace-nowrap',
                          isNumeric(type) && 'text-right tabular',
                          r.indent && i === 0 && 'pl-10',
                          r.kind === 'section' && 'pb-2 pt-7 text-body-strong',
                        )}
                      >
                        {link && !locked ? (
                          <button type="button" className="text-left text-primary hover:underline" onClick={() => follow(link)}>
                            {text}
                          </button>
                        ) : (
                          text
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-6 py-12 text-center">
                    <p className="text-body-strong text-ink">{t('reports.page.noResults')}</p>
                    <p className="text-body text-muted">{t('reports.page.noResultsBody')}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {rows.length > 0 && !statement && (
          <div className="flex items-center justify-center gap-4 border-t border-line px-4 py-4 text-body text-muted">
            {pages > 1 && (
              <button type="button" className="icon-btn h-9 w-9" aria-label={t('reports.page.prevPage')} disabled={current === 0} onClick={() => setPage(current - 1)}>
                <ChevronLeft size={18} aria-hidden />
              </button>
            )}
            <p aria-label={t('reports.page.viewingA11y', { from: current * PAGE_SIZE + 1, to: Math.min(rows.length, (current + 1) * PAGE_SIZE), total: rows.length })}>
              {t('reports.page.viewingPrefix')} <strong className="text-ink">{current * PAGE_SIZE + 1} - {Math.min(rows.length, (current + 1) * PAGE_SIZE)}</strong> {t('reports.page.viewingOf')} <strong className="text-ink">{rows.length}</strong> {t('reports.page.viewingSuffix')}
            </p>
            {pages > 1 && (
              <button type="button" className="icon-btn h-9 w-9" aria-label={t('reports.page.nextPage')} disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
                <ChevronRight size={18} aria-hidden />
              </button>
            )}
          </div>
        )}
        {locked && (
          <div className="absolute inset-x-0 top-20 flex flex-col items-center gap-2 px-6 text-center">
            <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-md bg-primary text-on-primary">
              <BarChart3 size={22} aria-hidden />
            </span>
            <p className="font-display text-title-3 text-ink">{t('reports.page.premiumTitle')}</p>
            <p className="text-body text-muted">{t('reports.page.premiumBody')}</p>
            <div className="mt-3 flex gap-2">
              <Button variant="primary" className="rounded-full" onClick={gate}>{t('reports.page.upgrade')}</Button>
              <Button className="rounded-full" onClick={() => drawer.open('resources', { tab: 'help', d_view: 'help-center', d_q: t('reports.topics.insights') })}>{t('reports.page.learnMore')}</Button>
            </div>
          </div>
        )}
      </div>

      <FiltersDrawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        ctx={ctx}
        keys={filterKeys.filter((k) => shownFilterKeys.includes(k))}
        premiumKeys={spec.premiumFilters}
        locked={!insights}
        filters={filters}
        ranges={ranges}
        onGate={gate}
        onAdvanced={spec.advanced ? () => setAdvOpen(true) : undefined}
        onApply={(f, r) => {
          update({ filters: f, ranges: r })
          toast(t('reports.filters.applied'))
        }}
      />
      <CustomizeDrawer
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        insights={insights}
        onGate={gate}
        config={config}
        onSave={saveConfig}
        groupings={spec.groupBy ? allGroupings : undefined}
        columns={result.columns}
        filterKeys={filterKeys}
        hasDate={Boolean(spec.range) && !spec.asOf}
        defaultPreset={spec.range}
      />
      <CustomReportModal
        open={duplicateOpen}
        onClose={() => setDuplicateOpen(false)}
        base={def.slug}
        name={t('reports.custom.copyName', { name })}
        config={config ?? {}}
        view={{ groupBy, shortcut: range.preset, from: range.preset === 'custom' ? range.from : undefined, to: range.preset === 'custom' ? range.to : undefined, filters, ranges, rules }}
      />
      {custom && <CustomReportModal open={editOpen} report={custom} onClose={() => setEditOpen(false)} />}
    </div>
  )
}

/** ‹ Today's date | Thursday, 8 Oct 2026 › — point-in-time reports (Stock on hand). */
function DateStepper({ day, onChange }: { day: string; onChange: (day: string) => void }) {
  const { t } = useTranslation()
  const today = todayISO()
  const shift = (n: number) => format(addDays(parseISO(day), n), 'yyyy-MM-dd')
  return (
    <div className="inline-flex h-11 items-stretch overflow-hidden rounded-full border border-line-strong bg-surface text-body-strong text-ink">
      <button type="button" className="flex w-11 items-center justify-center hover:bg-sunken" aria-label={t('reports.page.prevDay')} onClick={() => onChange(shift(-1))}>
        <ChevronLeft size={18} aria-hidden />
      </button>
      <button type="button" className={clsx('border-x border-line-strong px-4 hover:bg-sunken', day === today && 'bg-sunken')} onClick={() => onChange(today)}>
        {t('reports.page.todaysDate')}
      </button>
      <span className="flex items-center px-4">{format(parseISO(day), 'EEEE, d MMM yyyy')}</span>
      <button type="button" className="flex w-11 items-center justify-center border-l border-line-strong hover:bg-sunken disabled:opacity-40" aria-label={t('reports.page.nextDay')} disabled={day >= today} onClick={() => onChange(shift(1))}>
        <ChevronRight size={18} aria-hidden />
      </button>
    </div>
  )
}

function ChipX({ label, title, onRemove }: { label: string; title?: string; onRemove: () => void }) {
  const { t } = useTranslation()
  return (
    <span className="chip h-8 gap-1.5 bg-primary-subtle px-3 text-primary" title={title}>
      {label}
      <button type="button" aria-label={`${t('reports.page.removeFilter')}: ${label}`} onClick={onRemove} className="rounded-full hover:bg-primary/10">
        <X size={14} aria-hidden />
      </button>
    </span>
  )
}

/** Toolbar pill with a radio list (Performance over time: metric and time unit). */
function ChoicePill({ heading, value, options, onChange }: { heading: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  const label = options.find((o) => o.value === value)?.label ?? value
  return (
    <Popover
      label={heading}
      className="w-[260px] py-3"
      trigger={({ open, toggle }) => (
        <Pill open={open} onClick={toggle} aria-label={`${heading}: ${label}`}>
          {label}
          <ChevronDown size={16} className={clsx('transition-transform', open && 'rotate-180')} aria-hidden />
        </Pill>
      )}
    >
      {(close) => (
        <div role="radiogroup" aria-label={heading}>
          <p className="px-5 pb-2 pt-1 text-body-strong text-ink">{heading}</p>
          {options.map((o) => (
            <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => { onChange(o.value); close() }} className="flex w-full items-center gap-3 px-5 py-2.5 text-left text-body text-ink hover:bg-sunken">
              <span className={clsx('flex h-5 w-5 items-center justify-center rounded-full border-2', value === o.value ? 'border-primary' : 'border-line-strong')}>{value === o.value && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}</span>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </Popover>
  )
}

/** Clickable column header with its menu (reports.md §2.6). */
function HeaderCell({
  col,
  index,
  count,
  sortable,
  sort,
  unwrapped,
  advanced,
  onAdvanced,
  onSort,
  onMove,
  onWrap,
  onHide,
}: {
  col: Col
  index: number
  count: number
  sortable: boolean
  sort: 'asc' | 'desc' | null
  unwrapped: boolean
  advanced: boolean
  onAdvanced: () => void
  onSort: (dir: 'asc' | 'desc') => void
  onMove: (dir: -1 | 1) => void
  onWrap: () => void
  onHide: () => void
}) {
  const { t } = useTranslation()
  const numeric = index > 0 && isNumeric(col.type)
  const items: { label: string; icon: ReactNode; onSelect: () => void; divider?: boolean }[] = [
    ...(advanced ? [{ label: t('reports.colMenu.advanced'), icon: <SlidersHorizontal size={16} />, onSelect: onAdvanced }] : []),
    ...(sortable ? [{ label: t('reports.colMenu.sortAsc'), icon: <ArrowDownAZ size={16} />, onSelect: () => onSort('asc') }, { label: t('reports.colMenu.sortDesc'), icon: <ArrowUpZA size={16} />, onSelect: () => onSort('desc') }] : []),
    ...(index > 1 ? [{ label: t('reports.colMenu.moveLeft'), icon: <ArrowLeft size={16} />, onSelect: () => onMove(-1), divider: true }] : []),
    ...(index > 0 && index < count - 1 ? [{ label: t('reports.colMenu.moveRight'), icon: <ArrowRight size={16} />, onSelect: () => onMove(1), divider: index <= 1 }] : []),
    ...(!numeric ? [{ label: unwrapped ? t('reports.colMenu.wrap') : t('reports.colMenu.unwrap'), icon: unwrapped ? <WrapText size={16} /> : <Undo2 size={16} />, onSelect: onWrap, divider: true }] : []),
    ...(index > 0 ? [{ label: t('reports.colMenu.hide'), icon: <EyeOff size={16} />, onSelect: onHide, divider: numeric }] : []),
  ]
  return (
    <th className={clsx('whitespace-nowrap px-2 py-2 text-body-strong', numeric && 'text-right')} aria-sort={sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : undefined}>
      <Popover
        label={col.label}
        align={numeric ? 'right' : 'left'}
        className="w-[260px] p-1.5"
        trigger={({ open, toggle }) => (
          <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={toggle} className={clsx('inline-flex h-10 items-center gap-1.5 rounded-md px-3 hover:bg-sunken', open && 'bg-sunken')}>
            {col.label}
            {sort === 'asc' && <ArrowUp size={14} aria-hidden />}
            {sort === 'desc' && <ArrowDown size={14} aria-hidden />}
          </button>
        )}
      >
        {(close) => (
          <div role="menu" aria-label={col.label}>
            {items.map((it) => (
              <div key={it.label}>
                {it.divider && <div className="mx-3 my-1 border-t border-line" />}
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-body font-normal text-ink hover:bg-sunken"
                  onClick={() => {
                    close()
                    it.onSelect()
                  }}
                >
                  <span className="text-ink">{it.icon}</span>
                  {it.label}
                </button>
              </div>
            ))}
          </div>
        )}
      </Popover>
    </th>
  )
}

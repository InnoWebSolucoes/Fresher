import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import clsx from 'clsx'
import { ArrowLeft, ArrowRight, BarChart3, CalendarDays, ChevronRight, Columns3, GripVertical, ListOrdered, Search, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Select, Switch } from '@/components/ui'
import type { ReportConfig } from '../data'
import { isNumeric } from '../engine/format'
import { L } from '../engine/labels'
import type { Col, GroupingOpt } from '../engine/types'
import { RANGE_PRESETS } from './ReportDateRange'

type View = 'root' | 'grouping' | 'columns' | 'date' | 'filters' | 'chart'

interface Props {
  open: boolean
  onClose: () => void
  insights: boolean
  onGate: () => void
  /** Saved settings (undefined = defaults). */
  config: ReportConfig | undefined
  onSave: (config: ReportConfig | null) => Promise<void>
  groupings: GroupingOpt[] | undefined
  /** Every column the report can show (first = grouping column). */
  columns: Col[]
  filterKeys: string[]
  hasDate: boolean
  defaultPreset: string | null
}

/** Customize drawer (reports.md §2.7): read-only without Insights, editable with it. */
export function CustomizeDrawer(props: Props) {
  return props.open ? <DrawerBody {...props} /> : null
}

/** Effective settings: saved values or the report defaults. */
export function effectiveConfig(config: ReportConfig | undefined, groupings: GroupingOpt[] | undefined, columns: Col[], filterKeys: string[], defaultPreset: string | null): Required<Omit<ReportConfig, 'defaultDate'>> & { defaultDate: string | null } {
  return {
    groupings: config?.groupings ?? (groupings ?? []).filter((g) => !g.hidden).map((g) => g.key),
    columns: config?.columns ?? columns.slice(1).filter((c) => !c.hidden).map((c) => c.key),
    datePicker: config?.datePicker ?? 'range',
    defaultDate: config?.defaultDate ?? defaultPreset,
    filters: config?.filters ?? filterKeys,
    chart: config?.chart ?? { show: false },
  }
}

function DrawerBody({ onClose, insights, onGate, config, onSave, groupings, columns, filterKeys, hasDate, defaultPreset }: Props) {
  const { t } = useTranslation()
  const [view, setView] = useState<View>('root')
  const [draft, setDraft] = useState(() => effectiveConfig(config, groupings, columns, filterKeys, defaultPreset))
  const [busy, setBusy] = useState<'save' | 'reset' | null>(null)
  const measures = columns.slice(1)
  const disabled = !insights

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = async () => {
    setBusy('save')
    await onSave({ groupings: draft.groupings, columns: draft.columns, datePicker: draft.datePicker, defaultDate: (draft.defaultDate ?? undefined) as ReportConfig['defaultDate'], filters: draft.filters, chart: draft.chart })
    setBusy(null)
    onClose()
  }
  const reset = async () => {
    setBusy('reset')
    await onSave(null)
    setBusy(null)
    onClose()
  }

  const rows: { view: View; icon: typeof ListOrdered; summary: string }[] = [
    ...(groupings?.length ? [{ view: 'grouping' as View, icon: ListOrdered, summary: t('reports.customize.ofShown', { shown: draft.groupings.length, total: groupings.length }) }] : []),
    { view: 'columns', icon: Columns3, summary: t('reports.customize.ofShown', { shown: draft.columns.length, total: measures.length }) },
    ...(hasDate ? [{ view: 'date' as View, icon: CalendarDays, summary: t(`reports.customize.pickerTypes.${draft.datePicker}`) }] : []),
    { view: 'filters', icon: SlidersHorizontal, summary: t('reports.customize.ofShown', { shown: draft.filters.length, total: filterKeys.length }) },
    { view: 'chart', icon: BarChart3, summary: draft.chart.show ? t('reports.customize.enabled') : t('reports.customize.disabled') },
  ]

  const titleKey = view === 'root' ? 'title' : `titles.${view}`
  const subtitle = view === 'grouping' ? t('reports.customize.subtitles.grouping') : view === 'columns' ? t('reports.customize.subtitles.columns') : undefined

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <button type="button" aria-label={t('reports.common.closeDrawer')} tabIndex={-1} className="absolute inset-0 cursor-default bg-transparent" onClick={onClose} />
      <div className="relative flex h-full animate-[slideIn_var(--dur-slow)_var(--ease)]">
        <button type="button" onClick={onClose} aria-label={t('reports.common.closeDrawer')} className="absolute -left-16 top-4 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface shadow-md hover:bg-sunken">
          <X size={20} aria-hidden />
        </button>
        <div role="dialog" aria-modal="true" aria-label={t(`reports.customize.${titleKey}`)} className="flex h-full w-[600px] max-w-[100vw] flex-col bg-surface shadow-lg">
          <div className="min-h-0 flex-1 overflow-y-auto px-10 py-6">
            {view !== 'root' && (
              <Button icon={<ArrowLeft size={16} />} className="mb-5 rounded-full" onClick={() => setView('root')}>
                {t('reports.page.back')}
              </Button>
            )}
            <h2 className="font-display text-title-1 text-ink">{t(`reports.customize.${titleKey}`)}</h2>
            {subtitle && <p className="mt-1 text-body-lg text-muted">{subtitle}</p>}
            {!insights && <InsightsBanner onGate={onGate} />}
            {insights && view === 'root' && <p className="mt-2 text-body text-muted">{t('reports.customize.intro')}</p>}

            {view === 'root' && (
              <ul className="mt-6 divide-y divide-line">
                {rows.map((r) => (
                  <li key={r.view}>
                    <button type="button" className="flex w-full items-center gap-4 py-5 text-left hover:bg-sunken/60" onClick={() => setView(r.view)}>
                      <r.icon size={26} className="shrink-0 text-ink" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-body-strong text-ink">{t(`reports.customize.rows.${r.view}`)}</span>
                        <span className="block text-body text-muted">{r.summary}</span>
                      </span>
                      <ChevronRight size={20} className="text-ink" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {view === 'grouping' && groupings && (
              <ShownHidden
                searchLabel={t('reports.customize.searchGrouping')}
                disabled={disabled}
                all={groupings.map((g) => ({ key: g.key, label: L(`dim.${g.key}`) }))}
                shown={draft.groupings}
                locked={[draft.groupings[0]]}
                lockedLabel={(label) => t('reports.customize.defaultSuffix', { label })}
                onChange={(groupingsNext) => setDraft((d) => ({ ...d, groupings: groupingsNext }))}
              />
            )}
            {view === 'columns' && (
              <ShownHidden
                searchLabel={t('reports.customize.searchColumns')}
                disabled={disabled}
                sortable
                header={t('reports.customize.groupingColumn')}
                all={measures.map((c) => ({ key: c.key, label: c.label }))}
                shown={draft.columns}
                onChange={(cols) => setDraft((d) => ({ ...d, columns: cols }))}
              />
            )}
            {view === 'date' && (
              <div className="mt-6 flex flex-col gap-5">
                <div>
                  <label className="label" htmlFor="customize-picker">
                    {t('reports.customize.pickerType')}
                  </label>
                  <Select id="customize-picker" disabled={disabled} value={draft.datePicker} onChange={(e) => setDraft((d) => ({ ...d, datePicker: e.target.value as 'range' | 'single' }))} options={(['range', 'single'] as const).map((v) => ({ value: v, label: t(`reports.customize.pickerTypes.${v}`) }))} />
                </div>
                <div>
                  <label className="label" htmlFor="customize-default-date">
                    {t('reports.customize.defaultDate')}
                  </label>
                  <Select id="customize-default-date" disabled={disabled} value={draft.defaultDate ?? 'month_to_date'} onChange={(e) => setDraft((d) => ({ ...d, defaultDate: e.target.value }))} options={RANGE_PRESETS.map((p) => ({ value: p, label: t(`reports.range.${p}`) }))} />
                  {draft.datePicker === 'single' && <p className="mt-1.5 text-small text-muted">{t('reports.customize.singleHint')}</p>}
                </div>
              </div>
            )}
            {view === 'filters' && (
              <ShownHidden searchLabel={t('reports.customize.searchFilters')} disabled={disabled} all={filterKeys.map((k) => ({ key: k, label: t(`reports.filterName.${k}`, { defaultValue: k }) }))} shown={draft.filters} onChange={(f) => setDraft((d) => ({ ...d, filters: f }))} />
            )}
            {view === 'chart' && (
              <div className="mt-6 flex flex-col gap-5">
                <Switch disabled={disabled} label={t('reports.customize.showChart')} checked={draft.chart.show} onChange={(v) => setDraft((d) => ({ ...d, chart: { ...d.chart, show: v } }))} />
                {draft.chart.show && (
                  <>
                    <div>
                      <label className="label" htmlFor="customize-chart-kind">
                        {t('reports.customize.chartType')}
                      </label>
                      <Select id="customize-chart-kind" disabled={disabled} value={draft.chart.kind ?? 'bar'} onChange={(e) => setDraft((d) => ({ ...d, chart: { ...d.chart, kind: e.target.value as 'bar' | 'line' } }))} options={(['bar', 'line'] as const).map((k) => ({ value: k, label: t(`reports.customize.chartKinds.${k}`) }))} />
                    </div>
                    <div>
                      <label className="label" htmlFor="customize-chart-metric">
                        {t('reports.customize.chartMetric')}
                      </label>
                      <Select
                        id="customize-chart-metric"
                        disabled={disabled}
                        value={draft.chart.metric ?? measures.find((c) => c.type === 'money' && draft.columns.includes(c.key))?.key ?? measures.find((c) => isNumeric(c.type) && draft.columns.includes(c.key))?.key ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, chart: { ...d.chart, metric: e.target.value } }))}
                        options={measures.filter((c) => isNumeric(c.type)).map((c) => ({ value: c.key, label: c.label }))}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          {insights && (
            <div className="flex items-center justify-between gap-2 border-t border-line px-10 py-4">
              <Button variant="ghost" loading={busy === 'reset'} onClick={() => void reset()}>
                {t('reports.customize.reset')}
              </Button>
              <Button variant="primary" loading={busy === 'save'} onClick={() => void save()}>
                {t('reports.common.save')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function InsightsBanner({ onGate }: { onGate: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="mt-6 overflow-hidden rounded-xl bg-gradient-to-r from-primary to-info p-6 text-on-primary">
      <p className="flex items-center gap-3 text-body-strong">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-surface text-primary">
          <BarChart3 size={18} aria-hidden />
        </span>
        {t('reports.customize.bannerTag')}
      </p>
      <p className="mt-4 max-w-[260px] font-display text-title-3">{t('reports.customize.bannerTitle')}</p>
      <button type="button" className="mt-4 inline-flex items-center gap-2 text-body-strong hover:underline" onClick={onGate}>
        {t('reports.page.learnMore')}
        <ArrowRight size={16} aria-hidden />
      </button>
    </div>
  )
}

interface Item {
  key: string
  label: string
}

/** "Shown in list" / "Hidden in list" checkbox lists with search (grouping, columns, filters). */
function ShownHidden({ all, shown, onChange, disabled, searchLabel, sortable, header, locked = [], lockedLabel }: { all: Item[]; shown: string[]; onChange: (shown: string[]) => void; disabled: boolean; searchLabel: string; sortable?: boolean; header?: string; locked?: string[]; lockedLabel?: (label: string) => string }) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const match = (i: Item) => i.label.toLowerCase().includes(q.trim().toLowerCase())
  const byKey = new Map(all.map((i) => [i.key, i]))
  const shownItems = shown.map((k) => byKey.get(k)).filter(Boolean) as Item[]
  const hiddenItems = all.filter((i) => !shown.includes(i.key))
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    onChange(arrayMove(shown, shown.indexOf(String(e.active.id)), shown.indexOf(String(e.over.id))))
  }
  const row = (i: Item, checked: boolean) => {
    const isLocked = locked.includes(i.key)
    const label = isLocked && lockedLabel ? lockedLabel(i.label) : i.label
    const box = (
      <label className={clsx('flex flex-1 items-center gap-3 py-2.5', disabled || isLocked ? 'cursor-not-allowed' : 'cursor-pointer')}>
        <input type="checkbox" className="h-5 w-5 accent-[rgb(var(--primary))] disabled:cursor-not-allowed" checked={checked} disabled={disabled || isLocked} onChange={() => onChange(checked ? shown.filter((k) => k !== i.key) : [...shown, i.key])} />
        <span className={clsx('text-body-lg', disabled || isLocked ? 'text-muted' : 'text-ink')}>{label}</span>
      </label>
    )
    return sortable && checked && !disabled ? <SortableRow key={i.key} id={i.key}>{box}</SortableRow> : <li key={i.key} className="flex items-center">{box}</li>
  }
  return (
    <div className="mt-6">
      <label className="relative mb-6 block">
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
        <input type="search" className="input h-12 pl-11" placeholder={searchLabel} aria-label={searchLabel} value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <h3 className="text-body-strong text-ink">{t('reports.customize.shown')}</h3>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={shown} strategy={verticalListSortingStrategy}>
          <ul className="mt-1">
            {header && (
              <li className="flex items-center">
                <label className="flex flex-1 cursor-not-allowed items-center gap-3 py-2.5">
                  <input type="checkbox" className="h-5 w-5 accent-[rgb(var(--primary))]" checked disabled />
                  <span className="text-body-lg text-muted">{header}</span>
                </label>
              </li>
            )}
            {shownItems.filter(match).map((i) => row(i, true))}
          </ul>
        </SortableContext>
      </DndContext>
      {hiddenItems.length > 0 && (
        <>
          <h3 className="mt-6 text-body-strong text-ink">{t('reports.customize.hidden')}</h3>
          <ul className="mt-1">{hiddenItems.filter(match).map((i) => row(i, false))}</ul>
        </>
      )}
    </div>
  )
}

function SortableRow({ id, children }: { id: string; children: ReactNode }) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={clsx('flex items-center gap-2 bg-surface', isDragging && 'relative z-10 shadow-md')}>
      {children}
      <button type="button" ref={setActivatorNodeRef} className="icon-btn h-9 w-9 cursor-grab" aria-label={t('reports.customize.reorder')} {...attributes} {...listeners}>
        <GripVertical size={18} aria-hidden />
      </button>
    </li>
  )
}

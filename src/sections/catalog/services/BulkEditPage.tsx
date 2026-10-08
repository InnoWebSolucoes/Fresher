import clsx from 'clsx'
import { ChevronDown, ChevronRight, Redo2, Settings2, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button, Checkbox, Field, FullscreenFrame, Menu, Modal, MoneyInput, SearchInput, Select, Skeleton, Switch, confirm, toast, usePageLoading } from '@/components/ui'
import { useDb } from '@/store/db'
import { durationLabel } from '@/lib/time'
import { PALETTE } from '@/styles/palette'
import type { ID, Service } from '@/types'
import { bulkUpdateServices, isOffMenu } from '@/api/catalog'
import { TREATMENT_TYPES, serviceTotalDuration, totalExtra, treatmentLabel } from '../lib'
import { DurationSelect, FiltersButton } from '../ui'
import { usePriceTypeOptions, type PriceType } from './serviceParts'

type ColumnKey = 'name' | 'category' | 'treatment' | 'priceType' | 'price' | 'duration' | 'extra' | 'total' | 'team' | 'online'
const COLUMNS: ColumnKey[] = ['name', 'category', 'treatment', 'priceType', 'price', 'duration', 'extra', 'total', 'team', 'online']
const WIDTHS: Record<ColumnKey, string> = { name: 'w-[240px]', category: 'w-[220px]', treatment: 'w-[220px]', priceType: 'w-[140px]', price: 'w-[140px]', duration: 'w-[160px]', extra: 'w-[160px]', total: 'w-[130px]', team: 'w-[170px]', online: 'w-[120px]' }

/** Bulk edit services spreadsheet with undo/redo (catalog.md §1.4). */
export function BulkEditPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loading = usePageLoading()
  const stored = useDb((s) => s.services)
  const categories = useDb((s) => s.serviceCategories)
  const teamMembers = useDb((s) => s.teamMembers)
  const priceTypes = usePriceTypeOptions()
  const original = useMemo(() => stored.filter((s) => !isOffMenu(s, categories)), [stored, categories])
  const menuCategories = useMemo(() => [...categories].filter((c) => !c.archived).sort((a, b) => a.order - b.order), [categories])
  const [rows, setRows] = useState<Service[]>(() => structuredClone(original))
  const [past, setPast] = useState<Service[][]>([])
  const [future, setFuture] = useState<Service[][]>([])
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<ID>>(new Set())
  const [selected, setSelected] = useState<Set<ID>>(new Set())
  const [hidden, setHidden] = useState<Set<ColumnKey>>(new Set())
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [catFilter, setCatFilter] = useState<ID[]>([])
  const [onlineFilter, setOnlineFilter] = useState<'all' | 'on' | 'off'>('all')
  const [saving, setSaving] = useState(false)

  const changed = useMemo(() => rows.filter((r) => JSON.stringify(r) !== JSON.stringify(original.find((o) => o.id === r.id))), [rows, original])
  const dirty = changed.length > 0
  const activeMembers = teamMembers.filter((m) => !m.archived)

  const commitRows = (next: Service[]) => {
    setPast((p) => [...p.slice(-49), rows])
    setFuture([])
    setRows(next)
  }
  const patch = (id: ID, change: Partial<Service>) => commitRows(rows.map((r) => (r.id === id ? { ...r, ...change } : r)))
  const patchVariant = (id: ID, variantId: ID, change: Partial<Service['variants'][number]>) => commitRows(rows.map((r) => (r.id === id ? { ...r, variants: r.variants.map((v) => (v.id === variantId ? { ...v, ...change } : v)) } : r)))
  const undo = () => {
    if (!past.length) return
    setFuture((f) => [rows, ...f])
    setRows(past[past.length - 1])
    setPast((p) => p.slice(0, -1))
  }
  const redo = () => {
    if (!future.length) return
    setPast((p) => [...p, rows])
    setRows(future[0])
    setFuture((f) => f.slice(1))
  }

  const q = query.trim().toLowerCase()
  const visible = rows
    .filter((r) => (!q || r.name.toLowerCase().includes(q)) && (!catFilter.length || catFilter.includes(r.categoryId)) && (onlineFilter === 'all' || (onlineFilter === 'on' ? r.onlineBooking : !r.onlineBooking)))
    .sort((a, b) => (categories.find((c) => c.id === a.categoryId)?.order ?? 0) - (categories.find((c) => c.id === b.categoryId)?.order ?? 0) || a.order - b.order)
  const show = (k: ColumnKey) => !hidden.has(k)
  const catName = (id: ID) => categories.find((c) => c.id === id)?.name ?? ''

  const close = async () => {
    if (dirty && !(await confirm({ title: t('catalog.bulk.discardTitle'), body: t('catalog.bulk.discardBody'), confirmLabel: t('catalog.bulk.discard') }))) return
    navigate('/catalogue/services')
  }
  const save = async () => {
    setSaving(true)
    await bulkUpdateServices(changed)
    setSaving(false)
    toast(t('catalog.toasts.bulkSaved', { count: changed.length }))
    navigate('/catalogue/services')
  }
  const applySelected = (change: Partial<Service>) => {
    commitRows(rows.map((r) => (selected.has(r.id) ? { ...r, ...change } : r)))
    toast(t('catalog.toasts.bulkApplied', { count: selected.size }))
  }

  const teamLabel = (s: Service) => (s.teamMemberIds === 'all' ? t('catalog.bulk.allMembers', { count: activeMembers.length }) : t('catalog.bulk.members', { count: s.teamMemberIds.length }))

  return (
    <FullscreenFrame closeLabel={t('catalog.common.close')}
      onClose={() => void close()}
      maxWidth="max-w-none"
      actions={
        <Button variant="primary" loading={saving} disabled={!dirty} onClick={() => void save()}>
          {t('catalog.common.save')}
        </Button>
      }
    >
      <h1 className="font-display text-display text-ink">{t('catalog.bulk.title')}</h1>
      <p className="mt-2 text-body-lg text-muted">{t('catalog.bulk.subtitle')}</p>
      <div className="mt-6 flex flex-wrap items-center gap-2 rounded-lg bg-sunken p-3">
        <SearchInput value={query} onChange={setQuery} placeholder={t('catalog.bulk.search')} className="max-w-xs" />
        <FiltersButton count={catFilter.length + (onlineFilter !== 'all' ? 1 : 0)} onClick={() => setFiltersOpen(true)} />
        {selected.size > 0 && (
          <Menu
            align="left"
            width={280}
            trigger={({ open, toggle }) => (
              <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={toggle} className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-body-strong text-on-primary">
                {t('catalog.bulk.selectedActions', { count: selected.size })}
                <ChevronDown size={16} aria-hidden />
              </button>
            )}
            groups={[
              {
                items: [
                  { label: t('catalog.bulk.enableOnline'), onSelect: () => applySelected({ onlineBooking: true }) },
                  { label: t('catalog.bulk.disableOnline'), onSelect: () => applySelected({ onlineBooking: false }) },
                  { label: t('catalog.bulk.allTeam'), onSelect: () => applySelected({ teamMemberIds: 'all' }) },
                ],
              },
              { heading: t('catalog.bulk.moveTo'), items: menuCategories.map((c) => ({ label: c.name, onSelect: () => applySelected({ categoryId: c.id }) })) },
            ]}
          />
        )}
        <div className="ml-auto flex items-center gap-1">
          <button type="button" className="icon-btn" aria-label={t('catalog.bulk.undo')} title={t('catalog.bulk.undo')} disabled={!past.length} onClick={undo}>
            <Undo2 size={18} aria-hidden />
          </button>
          <button type="button" className="icon-btn" aria-label={t('catalog.bulk.redo')} title={t('catalog.bulk.redo')} disabled={!future.length} onClick={redo}>
            <Redo2 size={18} aria-hidden />
          </button>
          <Menu
            width={260}
            label={t('catalog.bulk.columns')}
            trigger={({ open, toggle }) => (
              <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={t('catalog.bulk.columns')} onClick={toggle} className="flex h-10 w-10 items-center justify-center rounded-full border border-line-strong bg-surface hover:bg-sunken">
                <Settings2 size={18} aria-hidden />
              </button>
            )}
            groups={[{ heading: t('catalog.bulk.columns'), items: COLUMNS.filter((c) => c !== 'name').map((c) => ({ label: t(`catalog.bulk.col.${c}`), checked: show(c), onSelect: () => setHidden((h) => { const n = new Set(h); if (n.has(c)) n.delete(c); else n.add(c); return n }) })) }]}
          />
        </div>
      </div>
      {dirty && <p className="mt-3 text-small text-muted">{t('catalog.bulk.unsaved', { count: changed.length })}</p>}

      {loading ? (
        <Skeleton className="mt-6 h-96 w-full" />
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-max border-collapse text-left text-body">
            <thead>
              <tr className="border-b border-line">
                <th className="sticky left-0 z-10 w-[340px] border-r border-line bg-surface px-4 py-3">
                  <div className="flex items-center gap-3">
                    <input type="checkbox" aria-label={t('catalog.common.selectAll')} checked={visible.length > 0 && visible.every((r) => selected.has(r.id))} onChange={(e) => setSelected(new Set(e.target.checked ? visible.map((r) => r.id) : []))} className="h-5 w-5 accent-[rgb(var(--primary))]" />
                    <span className="text-body-strong text-ink">{t('catalog.bulk.service')}</span>
                  </div>
                </th>
                {COLUMNS.filter(show).map((c) => (
                  <th key={c} className={clsx('whitespace-nowrap px-3 py-3 text-body-strong text-ink', WIDTHS[c])}>
                    {t(`catalog.bulk.col.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length + 1} className="px-6 py-10 text-center text-muted">
                    {t('catalog.common.noResults')}
                  </td>
                </tr>
              )}
              {visible.map((s) => {
                const cat = categories.find((c) => c.id === s.categoryId)
                const open = expanded.has(s.id)
                const hasVariants = s.variants.length > 0
                return [
                  <tr key={s.id} className={clsx('border-b border-line', selected.has(s.id) && 'bg-primary-subtle/30')}>
                    <td className="sticky left-0 z-10 border-r border-line bg-surface px-4 py-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          aria-label={t('catalog.common.selectRow')}
                          checked={selected.has(s.id)}
                          onChange={(e) => {
                            const n = new Set(selected)
                            if (e.target.checked) n.add(s.id)
                            else n.delete(s.id)
                            setSelected(n)
                          }}
                          className="h-5 w-5 accent-[rgb(var(--primary))]"
                        />
                        <button type="button" className={clsx('icon-btn h-8 w-8', !hasVariants && 'invisible')} aria-label={t('catalog.bulk.toggleVariants')} aria-expanded={open} onClick={() => setExpanded((x) => { const n = new Set(x); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n })}>
                          {open ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
                        </button>
                        <div className="flex min-w-0 flex-1 items-center gap-3 rounded-md bg-sunken px-3 py-2">
                          <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: PALETTE[cat?.color ?? 'blue'].edge }} aria-hidden />
                          <span className="min-w-0">
                            <span className="block truncate text-body-strong text-ink">{s.name}</span>
                            <span className="block truncate text-small text-muted">
                              {durationLabel(s.durationMin)} · {catName(s.categoryId)}
                              {hasVariants && ` · ${t('catalog.bulk.variants', { count: s.variants.length })}`}
                            </span>
                          </span>
                        </div>
                      </div>
                    </td>
                    {show('name') && (
                      <td className="px-3 py-2">
                        <input value={s.name} aria-label={t('catalog.bulk.col.name')} onChange={(e) => patch(s.id, { name: e.target.value })} className="input" />
                      </td>
                    )}
                    {show('category') && (
                      <td className="px-3 py-2">
                        <Select value={s.categoryId} aria-label={t('catalog.bulk.col.category')} options={menuCategories.map((c) => ({ value: c.id, label: c.name }))} onChange={(e) => patch(s.id, { categoryId: e.target.value })} />
                      </td>
                    )}
                    {show('treatment') && (
                      <td className="px-3 py-2">
                        <input list="catalog-treatment-types" value={s.treatmentType} aria-label={t('catalog.bulk.col.treatment')} onChange={(e) => patch(s.id, { treatmentType: e.target.value })} className="input" />
                      </td>
                    )}
                    {show('priceType') && <td className="px-3 py-2">{hasVariants ? <span className="text-muted">—</span> : <Select value={s.priceType} aria-label={t('catalog.bulk.col.priceType')} options={priceTypes} onChange={(e) => patch(s.id, { priceType: e.target.value as PriceType })} />}</td>}
                    {show('price') && <td className="px-3 py-2">{hasVariants ? <span className="text-muted">—</span> : <MoneyInput value={s.price} disabled={s.priceType === 'free'} aria-label={t('catalog.bulk.col.price')} onChange={(v) => patch(s.id, { price: v === '' ? 0 : v })} />}</td>}
                    {show('duration') && (
                      <td className="px-3 py-2">
                        <DurationSelect value={s.durationMin} onChange={(v) => patch(s.id, { durationMin: v })} />
                      </td>
                    )}
                    {show('extra') && (
                      <td className="px-3 py-2">
                        <DurationSelect value={totalExtra(s.extraTime)} allowZero onChange={(v) => patch(s.id, { extraTime: v === 0 ? [] : [{ type: s.extraTime[0]?.type ?? 'processing', durationMin: v }] })} />
                      </td>
                    )}
                    {show('total') && <td className="whitespace-nowrap px-3 py-2 text-ink">{durationLabel(serviceTotalDuration(s))}</td>}
                    {show('team') && (
                      <td className="whitespace-nowrap px-3 py-2">
                        <button type="button" className="text-primary hover:underline" onClick={() => navigate(`/catalogue/services/service/edit/${s.id}?section=team`)}>
                          {teamLabel(s)}
                        </button>
                      </td>
                    )}
                    {show('online') && (
                      <td className="px-3 py-2">
                        <Switch checked={s.onlineBooking} onChange={(v) => patch(s.id, { onlineBooking: v })} />
                      </td>
                    )}
                  </tr>,
                  ...(open
                    ? [{ id: 'base', name: s.name, priceType: s.priceType, price: s.price, durationMin: s.durationMin }, ...s.variants].map((v) => (
                        <tr key={`${s.id}-${v.id}`} className="border-b border-line bg-sunken/40">
                          <td className="sticky left-0 z-10 border-r border-line bg-sunken px-4 py-2 pl-[88px] text-body text-muted">{v.id === 'base' ? t('catalog.bulk.baseVariant') : v.name}</td>
                          {show('name') && <td className="px-3 py-2">{v.id === 'base' ? <span className="text-muted">{s.name}</span> : <input value={v.name} aria-label={t('catalog.variant.name')} onChange={(e) => patchVariant(s.id, v.id, { name: e.target.value })} className="input" />}</td>}
                          {show('category') && <td className="px-3 py-2 text-muted">—</td>}
                          {show('treatment') && <td className="px-3 py-2 text-muted">—</td>}
                          {show('priceType') && (
                            <td className="px-3 py-2">
                              <Select value={v.priceType} aria-label={t('catalog.bulk.col.priceType')} options={priceTypes} onChange={(e) => (v.id === 'base' ? patch(s.id, { priceType: e.target.value as PriceType }) : patchVariant(s.id, v.id, { priceType: e.target.value as PriceType }))} />
                            </td>
                          )}
                          {show('price') && (
                            <td className="px-3 py-2">
                              <MoneyInput value={v.price} disabled={v.priceType === 'free'} aria-label={t('catalog.bulk.col.price')} onChange={(val) => (v.id === 'base' ? patch(s.id, { price: val === '' ? 0 : val }) : patchVariant(s.id, v.id, { price: val === '' ? 0 : val }))} />
                            </td>
                          )}
                          {show('duration') && (
                            <td className="px-3 py-2">
                              <DurationSelect value={v.durationMin} onChange={(val) => (v.id === 'base' ? patch(s.id, { durationMin: val }) : patchVariant(s.id, v.id, { durationMin: val }))} />
                            </td>
                          )}
                          {show('extra') && <td className="px-3 py-2 text-muted">—</td>}
                          {show('total') && <td className="whitespace-nowrap px-3 py-2 text-ink">{durationLabel(v.durationMin + totalExtra(s.extraTime))}</td>}
                          {show('team') && <td className="px-3 py-2 text-muted">—</td>}
                          {show('online') && <td className="px-3 py-2 text-muted">—</td>}
                        </tr>
                      ))
                    : []),
                ]
              })}
            </tbody>
          </table>
          <datalist id="catalog-treatment-types">
            {TREATMENT_TYPES.map((tt) => (
              <option key={tt.name} value={tt.name} label={treatmentLabel(tt.name)} />
            ))}
          </datalist>
        </div>
      )}

      <Modal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title={t('catalog.common.filters')}
        footer={
          <>
            <Button
              onClick={() => {
                setCatFilter([])
                setOnlineFilter('all')
              }}
            >
              {t('catalog.common.clearFilters')}
            </Button>
            <Button variant="primary" onClick={() => setFiltersOpen(false)}>
              {t('catalog.common.apply')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 pb-2">
          <div>
            <p className="mb-2 text-body-strong text-ink">{t('catalog.bulk.col.category')}</p>
            <div className="flex flex-col gap-2">
              {menuCategories.map((c) => (
                  <Checkbox key={c.id} checked={catFilter.includes(c.id)} onChange={(v) => setCatFilter(v ? [...catFilter, c.id] : catFilter.filter((x) => x !== c.id))} label={c.name} />
                ))}
            </div>
          </div>
          <Field label={t('catalog.bulk.col.online')}>
            {(fid) => (
              <Select
                id={fid}
                value={onlineFilter}
                onChange={(e) => setOnlineFilter(e.target.value as typeof onlineFilter)}
                options={[
                  { value: 'all', label: t('catalog.menuFilters.allStatus') },
                  { value: 'on', label: t('catalog.common.enabled') },
                  { value: 'off', label: t('catalog.common.disabled') },
                ]}
              />
            )}
          </Field>
        </div>
      </Modal>
    </FullscreenFrame>
  )
}

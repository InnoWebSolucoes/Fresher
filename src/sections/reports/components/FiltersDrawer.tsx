import clsx from 'clsx'
import { BarChart3, ChevronDown, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Checkbox, Chip, Modal, TextInput } from '@/components/ui'
import type { Ctx } from '../engine/context'
import { FILTERS, type FilterOption } from '../engine/filters'
import type { Filters, RangeFilters } from '../engine/types'

interface Props {
  open: boolean
  onClose: () => void
  ctx: Ctx
  keys: string[]
  premiumKeys?: string[]
  locked: boolean
  filters: Filters
  ranges: RangeFilters
  onApply: (filters: Filters, ranges: RangeFilters) => void
  /** "Advanced filters" shortcut at the top (standard list reports). */
  onAdvanced?: () => void
  onGate?: () => void
}

/** Report Filters drawer (reports.md §2.4): collapsible sections, Premium tags, Clear filters / Apply. */
export function FiltersDrawer(props: Props) {
  // Remount the body each time the drawer opens so the draft starts from the applied filters.
  return props.open ? <FiltersDrawerBody {...props} /> : null
}

function FiltersDrawerBody({ onClose, ctx, keys, premiumKeys = [], locked, filters, ranges, onApply, onAdvanced, onGate }: Props) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<Filters>(filters)
  const [draftRanges, setDraftRanges] = useState<RangeFilters>(ranges)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [segmentsOpen, setSegmentsOpen] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !segmentsOpen && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, segmentsOpen])

  const toggle = (key: string, value: string, on: boolean) =>
    setDraft((d) => {
      const list = new Set(d[key] ?? [])
      if (on) list.add(value)
      else list.delete(value)
      const next = { ...d, [key]: [...list] }
      if (!next[key].length) delete next[key]
      return next
    })

  const setRange = (key: string, side: 'min' | 'max', raw: string) =>
    setDraftRanges((r) => {
      const v = raw === '' ? undefined : Number(raw)
      const next = { ...r, [key]: { ...r[key], [side]: v !== undefined && Number.isFinite(v) ? v : undefined } }
      if (next[key].min === undefined && next[key].max === undefined) delete next[key]
      return next
    })

  const rangeError = (key: string) => {
    const r = draftRanges[key]
    return r && r.min !== undefined && r.max !== undefined && r.min > r.max
  }
  const invalid = Object.keys(draftRanges).some(rangeError)

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <button type="button" aria-label={t('reports.common.closeDrawer')} tabIndex={-1} className="absolute inset-0 cursor-default bg-transparent" onClick={onClose} />
      <div className="relative flex h-full animate-[slideIn_var(--dur-slow)_var(--ease)]">
        <button type="button" onClick={onClose} aria-label={t('reports.common.closeDrawer')} className="absolute -left-16 top-4 hidden h-12 w-12 items-center justify-center rounded-full border border-line bg-surface shadow-md hover:bg-sunken md:flex">
          <X size={20} aria-hidden />
        </button>
        <div role="dialog" aria-modal="true" aria-label={t('reports.page.filters')} className="flex h-full w-screen max-w-[100vw] flex-col bg-surface shadow-lg md:w-[600px]">
          {/* Phones: full-screen panel with the close button in a bar on top. */}
          <div className="flex h-12 shrink-0 items-center justify-end border-b border-line px-2 md:hidden">
            <button type="button" onClick={onClose} aria-label={t('reports.common.closeDrawer')} className="icon-btn">
              <X size={20} aria-hidden />
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-4 md:flex-nowrap md:gap-4 md:px-10 md:pb-4 md:pt-8">
            <h2 className="font-display text-title-2 text-ink md:text-title-1">{t('reports.page.filters')}</h2>
            {onAdvanced && (
              <Button
                className="rounded-full"
                icon={
                  <span className="flex h-6 w-6 items-center justify-center rounded-xs bg-primary text-on-primary">
                    <BarChart3 size={14} aria-hidden />
                  </span>
                }
                onClick={() => {
                  onClose()
                  onAdvanced()
                }}
              >
                {t('reports.adv.button')}
              </Button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 md:px-10">
            {keys.length === 0 && <p className="py-6 text-body text-muted">{t('reports.page.noFilters')}</p>}
            {keys.map((key) => {
              const def = FILTERS[key]
              if (!def) return null
              const premium = premiumKeys.includes(key)
              const disabled = premium && locked
              const isOpen = expanded === key
              const count = def.kind === 'range' ? (draftRanges[key] ? 1 : 0) : (draft[key]?.length ?? 0)
              const Icon = def.icon
              const options = def.options?.(ctx) ?? []
              if (def.kind === 'segments') {
                const selected = options.filter((o) => draft[key]?.includes(o.value))
                return (
                  <section key={key} className="border-b border-line">
                    <div className="flex items-center gap-4 py-4">
                      <Icon size={22} className="text-ink" aria-hidden />
                      <span className="flex-1 text-body-lg text-ink">{t(`reports.filterName.${key}`, { defaultValue: key })}</span>
                      {count > 0 && <span className="rounded-full bg-primary px-2 text-caption text-on-primary">{count}</span>}
                      <Button variant="link" onClick={() => (disabled ? onGate?.() : setSegmentsOpen(key))}>
                        {t('reports.filters.edit')}
                      </Button>
                    </div>
                    {selected.length > 0 && (
                      <ul className="flex flex-wrap gap-2 pb-4 pl-10">
                        {selected.map((o) => (
                          <li key={o.value} className="chip gap-1 bg-primary-subtle text-primary">
                            {o.label}
                            <button type="button" aria-label={t('reports.page.removeFilter')} onClick={() => toggle(key, o.value, false)}>
                              <X size={14} aria-hidden />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <SegmentsModal open={segmentsOpen === key} options={options} value={draft[key] ?? []} onClose={() => setSegmentsOpen(null)} onApply={(values) => setDraft((d) => { const next = { ...d, [key]: values }; if (!values.length) delete next[key]; return next })} />
                  </section>
                )
              }
              return (
                <section key={key} className="border-b border-line">
                  <button type="button" className={clsx('-mx-3 flex w-[calc(100%+1.5rem)] items-center gap-4 rounded-md px-3 py-4 text-left', isOpen && 'bg-sunken')} aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : key)}>
                    <Icon size={22} className="text-ink" aria-hidden />
                    <span className="flex-1 text-body-lg text-ink">{t(`reports.filterName.${key}`, { defaultValue: key })}</span>
                    {premium && <Chip tone="primary">{t('reports.premium')}</Chip>}
                    {count > 0 && <span className="rounded-full bg-primary px-2 text-caption text-on-primary">{count}</span>}
                    <ChevronDown size={20} className={clsx('text-ink transition-transform', isOpen && 'rotate-180')} aria-hidden />
                  </button>
                  {isOpen && (
                    <div className="pb-4 pl-10 pt-2">
                      {disabled && (
                        <p className="mb-3 flex flex-wrap items-center gap-2 text-small text-muted">
                          {t('reports.page.premiumLocked')}
                          {onGate && (
                            <Button variant="link" onClick={onGate}>
                              {t('reports.page.upgrade')}
                            </Button>
                          )}
                        </p>
                      )}
                      {def.kind === 'range' ? (
                        <div className="grid grid-cols-2 gap-3">
                          <TextInput type="number" aria-label={t('reports.page.min')} placeholder={t('reports.page.min')} prefix="€" disabled={disabled} value={draftRanges[key]?.min ?? ''} invalid={rangeError(key)} onChange={(e) => setRange(key, 'min', e.target.value)} />
                          <TextInput type="number" aria-label={t('reports.page.max')} placeholder={t('reports.page.max')} prefix="€" disabled={disabled} value={draftRanges[key]?.max ?? ''} invalid={rangeError(key)} onChange={(e) => setRange(key, 'max', e.target.value)} />
                          {rangeError(key) && <p className="col-span-2 text-small text-danger">{t('reports.filters.rangeError')}</p>}
                        </div>
                      ) : options.length === 0 ? (
                        <p className="text-body text-muted">{t('reports.filters.noOptions')}</p>
                      ) : (
                        <div className="flex max-h-80 flex-col gap-3 overflow-y-auto">
                          {options.map((o) => (
                            <Checkbox key={o.value} label={o.label} hint={o.hint} disabled={disabled} checked={draft[key]?.includes(o.value) ?? false} onChange={(on) => toggle(key, o.value, on)} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
          <div className="flex gap-3 border-t border-line px-4 py-3 md:px-10 md:py-5">
            <Button size="lg" className="flex-1 rounded-full" onClick={() => { setDraft({}); setDraftRanges({}) }}>
              {t('reports.page.clearFilters')}
            </Button>
            <Button size="lg" className="flex-1 rounded-full" variant="primary" disabled={invalid} onClick={() => { onApply(draft, draftRanges); onClose() }}>
              {t('reports.page.apply')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Client segments picker (reports.md §2.4): search, "All segments N", each segment with its description. */
function SegmentsModal({ open, options, value, onClose, onApply }: { open: boolean; options: FilterOption[]; value: string[]; onClose: () => void; onApply: (values: string[]) => void }) {
  return open ? <SegmentsBody options={options} value={value} onClose={onClose} onApply={onApply} /> : null
}

function SegmentsBody({ options, value, onClose, onApply }: { options: FilterOption[]; value: string[]; onClose: () => void; onApply: (values: string[]) => void }) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<string[]>(value)
  const list = options.filter((o) => `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))
  const all = picked.length === options.length && options.length > 0
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t('reports.filters.segmentsTitle')}
      subtitle={
        <>
          {t('reports.filters.segmentsBody')}{' '}
          <Link to="/clients/segments" className="text-primary hover:underline">
            {t('reports.filters.segmentsLink')}
          </Link>
        </>
      }
      footer={
        <div className="flex w-full items-center justify-between">
          <span className="text-body text-muted">{t('reports.filters.selected', { count: picked.length })}</span>
          <Button variant="primary" onClick={() => { onApply(picked); onClose() }}>
            {t('reports.page.apply')}
          </Button>
        </div>
      }
    >
      <label className="relative mb-4 block">
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
        <input type="search" className="input h-12 pl-11" placeholder={t('reports.filters.search')} aria-label={t('reports.filters.search')} value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="flex flex-col divide-y divide-line">
        <Checkbox
          className="py-3"
          label={
            <span className="flex items-center gap-2 font-semibold">
              {t('reports.page.allSegments')}
              <span className="chip h-5 bg-sunken px-1.5 text-caption text-muted">{options.length}</span>
            </span>
          }
          checked={all}
          onChange={(on) => setPicked(on ? options.map((o) => o.value) : [])}
        />
        {list.map((o) => (
          <Checkbox key={o.value} className="py-3" label={<span className="font-semibold">{o.label}</span>} hint={o.hint} checked={picked.includes(o.value)} onChange={(on) => setPicked((p) => (on ? [...p, o.value] : p.filter((x) => x !== o.value)))} />
        ))}
      </div>
    </Modal>
  )
}

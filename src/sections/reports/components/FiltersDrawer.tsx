import clsx from 'clsx'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Checkbox, Chip, SideDrawer, TextInput } from '@/components/ui'
import type { Ctx } from '../engine/context'
import { FILTERS } from '../engine/filters'
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
}

/** Report Filters drawer (reports.md §2.4): collapsible sections, Clear filters / Apply. */
export function FiltersDrawer(props: Props) {
  // Remount the body each time the drawer opens so the draft starts from the applied filters.
  return props.open ? <FiltersDrawerBody {...props} /> : null
}

function FiltersDrawerBody({ open, onClose, ctx, keys, premiumKeys = [], locked, filters, ranges, onApply }: Props) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<Filters>(filters)
  const [draftRanges, setDraftRanges] = useState<RangeFilters>(ranges)
  const [expanded, setExpanded] = useState<string | null>(keys[0] ?? null)
  const allKeys = [...keys, ...premiumKeys.filter((k) => !keys.includes(k))]

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
      return { ...r, [key]: { ...r[key], [side]: Number.isFinite(v) ? v : undefined } }
    })

  return (
    <SideDrawer
      open={open}
      onClose={onClose}
      title={t('reports.page.filters')}
      footer={
        <div className="flex gap-3">
          <Button className="flex-1" onClick={() => { setDraft({}); setDraftRanges({}) }}>{t('reports.page.clearFilters')}</Button>
          <Button className="flex-1" variant="primary" onClick={() => { onApply(draft, draftRanges); onClose() }}>{t('reports.page.apply')}</Button>
        </div>
      }
    >
      <div className="flex flex-col">
        {allKeys.map((key) => {
          const def = FILTERS[key]
          if (!def) return null
          const premium = premiumKeys.includes(key)
          const disabled = premium && locked
          const isOpen = expanded === key
          const count = draft[key]?.length ?? 0
          const Icon = def.icon
          return (
            <section key={key} className="border-b border-line py-1 last:border-0">
              <button type="button" className="flex w-full items-center gap-3 py-3 text-left" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : key)}>
                <Icon size={18} className="text-muted" aria-hidden />
                <span className="flex-1 text-body-strong text-ink">{t(`reports.filterName.${key}`, { defaultValue: key })}</span>
                {premium && <Chip tone="primary">{t('reports.premium')}</Chip>}
                {count > 0 && <span className="rounded-full bg-primary px-2 text-caption text-on-primary">{count}</span>}
                <ChevronDown size={18} className={clsx('text-muted transition-transform', isOpen && 'rotate-180')} aria-hidden />
              </button>
              {isOpen && (
                <div className="pb-3 pl-8">
                  {disabled && <p className="mb-2 text-small text-muted">{t('reports.page.premiumLocked')}</p>}
                  {def.kind === 'range' ? (
                    <div className="grid grid-cols-2 gap-3">
                      <TextInput type="number" aria-label={t('reports.page.min')} placeholder={t('reports.page.min')} prefix="€" disabled={disabled} value={draftRanges[key]?.min ?? ''} onChange={(e) => setRange(key, 'min', e.target.value)} />
                      <TextInput type="number" aria-label={t('reports.page.max')} placeholder={t('reports.page.max')} prefix="€" disabled={disabled} value={draftRanges[key]?.max ?? ''} onChange={(e) => setRange(key, 'max', e.target.value)} />
                    </div>
                  ) : (
                    <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
                      {(def.options?.(ctx) ?? []).map((o) => (
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
    </SideDrawer>
  )
}

import clsx from 'clsx'
import { Check, ChevronDown, ChevronUp, Loader2, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ID } from '@/types'
import { useDb } from '@/store/db'
import { useDismiss } from '@/lib/useDismiss'
import { PALETTE } from '@/styles/palette'
import { createTag } from '@/api/clients'

/**
 * "Select or create a tag" combobox (clients.md §1 Add tags, §2 Tags):
 * typing offers "Create a 'VIP' tag"; selected tags show as removable chips.
 */
export function TagPicker({ value, onChange, id, autoFocus }: { value: ID[]; onChange: (ids: ID[]) => void; id?: string; autoFocus?: boolean }) {
  const { t } = useTranslation()
  const tags = useDb((s) => s.clientTags)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const refs = useMemo(() => [ref], [])
  useDismiss(refs, open, () => setOpen(false))

  const sorted = useMemo(() => [...tags].sort((a, b) => a.order - b.order), [tags])
  const q = query.trim().toLowerCase()
  const matches = sorted.filter((tag) => tag.name.toLowerCase().includes(q))
  const exact = sorted.some((tag) => tag.name.toLowerCase() === q)
  const selected = sorted.filter((tag) => value.includes(tag.id))

  const toggle = (tagId: ID) => onChange(value.includes(tagId) ? value.filter((v) => v !== tagId) : [...value, tagId])
  const create = async () => {
    if (!q || creating) return
    setCreating(true)
    try {
      const tag = await createTag(query.trim().slice(0, 15))
      onChange([...value.filter((v) => v !== tag.id), tag.id])
      setQuery('')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div ref={ref} className="relative">
      <div className={clsx('flex min-h-11 flex-wrap items-center gap-1.5 rounded-sm border bg-surface py-1.5 pl-3 pr-10', open ? 'border-primary ring-2 ring-primary/30' : 'border-line-strong')} onClick={() => setOpen(true)}>
        {selected.map((tag) => (
          <span key={tag.id} className="chip gap-1 pr-1 font-semibold" style={{ background: PALETTE[tag.color]?.fill, color: PALETTE[tag.color]?.text }}>
            {tag.name}
            <button
              type="button"
              aria-label={t('clients.tags.remove', { name: tag.name })}
              onClick={(e) => {
                e.stopPropagation()
                toggle(tag.id)
              }}
              className="rounded-full p-0.5 hover:bg-black/10"
            >
              <X size={12} aria-hidden />
            </button>
          </span>
        ))}
        <input
          id={id}
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (matches.length === 1 && exact) toggle(matches[0].id)
              else if (!exact) void create()
            }
            if (e.key === 'Backspace' && !query && value.length) onChange(value.slice(0, -1))
          }}
          placeholder={selected.length ? '' : t('clients.tags.placeholder')}
          className="h-8 min-w-[120px] flex-1 bg-transparent text-body text-ink outline-none placeholder:text-subtle"
        />
        <button type="button" tabIndex={-1} aria-hidden onClick={() => setOpen((o) => !o)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">
          {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>
      {open && (
        <div role="listbox" className="absolute left-0 right-0 top-full z-[90] mt-1 max-h-64 overflow-y-auto rounded-lg border border-line bg-raised p-1.5 shadow-md">
          {q && !exact && (
            <button type="button" onClick={() => void create()} className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-body font-semibold text-primary hover:bg-sunken">
              {creating && <Loader2 size={14} className="animate-spin" aria-hidden />}
              {t('clients.tags.create', { name: query.trim().slice(0, 15) })}
            </button>
          )}
          {matches.map((tag) => (
            <button key={tag.id} type="button" role="option" aria-selected={value.includes(tag.id)} onClick={() => toggle(tag.id)} className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-body text-ink hover:bg-sunken">
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: PALETTE[tag.color]?.edge }} aria-hidden />
                {tag.name}
              </span>
              {value.includes(tag.id) && <Check size={16} className="text-primary" aria-hidden />}
            </button>
          ))}
          {!q && sorted.length === 0 && <p className="px-3 py-2.5 text-body text-muted">{t('clients.tags.none')}</p>}
          {q && exact && matches.length === 0 && <p className="px-3 py-2.5 text-body text-muted">{t('clients.tags.none')}</p>}
        </div>
      )}
    </div>
  )
}

/** Tag chip (outlined, as on the client card). */
export function TagChip({ tagId }: { tagId: ID }) {
  const tag = useDb((s) => s.clientTags.find((x) => x.id === tagId))
  if (!tag) return null
  return (
    <span className="chip whitespace-nowrap font-semibold ring-1" style={{ color: PALETTE[tag.color]?.text, background: PALETTE[tag.color]?.fill, boxShadow: `inset 0 0 0 1px ${PALETTE[tag.color]?.edge}55` }}>
      {tag.name}
    </span>
  )
}

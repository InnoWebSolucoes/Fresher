import clsx from 'clsx'
import { ArrowDownUp, Check, ChevronDown, ImagePlus, Loader2, Minus, Package, Plus, SlidersHorizontal, Sparkles, Store, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button, Field, FullscreenFrame, Menu, Modal, SectionNav, Skeleton, TextArea, TextInput, toast } from '@/components/ui'
import { useDismiss } from '@/lib/useDismiss'
import { useDrawer } from '@/lib/drawer'
import { durationLong } from '@/lib/time'
import { PALETTE } from '@/styles/palette'
import type { Location, PaletteColor, Product, ServiceCategory } from '@/types'
import { saveCategory } from '@/api/catalog'
import { CATEGORY_COLORS, DURATIONS, TREATMENT_TYPES } from './lib'

// ─── Small pieces ──────────────────────────────────────────────────────────

export function FiltersButton({ count = 0, onClick }: { count?: number; onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <button type="button" onClick={onClick} className="inline-flex h-10 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-body-strong text-ink hover:bg-sunken">
      {t('catalog.common.filters')}
      {count > 0 ? <span className="chip h-5 bg-primary px-1.5 text-caption text-on-primary">{count}</span> : <SlidersHorizontal size={16} aria-hidden />}
    </button>
  )
}

export function PillButton({ children, onClick, icon }: { children: ReactNode; onClick: () => void; icon?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex h-10 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-body-strong text-ink hover:bg-sunken">
      {icon}
      {children}
    </button>
  )
}

export function SortButton<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const current = options.find((o) => o.value === value)
  return (
    <Menu
      width={260}
      trigger={({ open, toggle }) => (
        <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={toggle} className="inline-flex h-10 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-body-strong text-ink hover:bg-sunken">
          {current?.label}
          <ArrowDownUp size={16} aria-hidden />
        </button>
      )}
      groups={[{ items: options.map((o) => ({ label: o.label, checked: o.value === value, onSelect: () => onChange(o.value) })) }]}
    />
  )
}

export function OnOffChip({ on }: { on: boolean }) {
  const { t } = useTranslation()
  return <span className={clsx('chip h-6', on ? 'bg-success-subtle text-success' : 'bg-sunken text-muted')}>{on ? t('catalog.common.on') : t('catalog.common.off')}</span>
}

export function CountBadge({ value, active }: { value: number; active?: boolean }) {
  return <span className={clsx('chip h-5 min-w-[20px] justify-center px-1.5 text-caption', active ? 'bg-surface text-primary' : 'bg-sunken text-muted')}>{value}</span>
}

/** −  n  + quantity stepper. */
export function Stepper({ value, onChange, min = 0, max = 9999, label, className }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label?: string; className?: string }) {
  const { t } = useTranslation()
  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n)))
  return (
    <div className={clsx('inline-flex h-11 items-center rounded-sm border border-line-strong bg-surface', className)}>
      <button type="button" aria-label={t('catalog.common.decrease')} disabled={value <= min} onClick={() => onChange(clamp(value - 1))} className="flex h-full w-10 items-center justify-center text-ink hover:bg-sunken disabled:opacity-40">
        <Minus size={16} aria-hidden />
      </button>
      <input
        type="number"
        inputMode="numeric"
        aria-label={label ?? t('catalog.common.quantity')}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(clamp(Number(e.target.value || 0)))}
        className="h-full w-14 bg-transparent text-center text-body-strong text-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button type="button" aria-label={t('catalog.common.increase')} disabled={value >= max} onClick={() => onChange(clamp(value + 1))} className="flex h-full w-10 items-center justify-center text-ink hover:bg-sunken disabled:opacity-40">
        <Plus size={16} aria-hidden />
      </button>
    </div>
  )
}

export function DurationSelect({ id, value, onChange, allowZero, placeholder, className }: { id?: string; value: number; onChange: (v: number) => void; allowZero?: boolean; placeholder?: string; className?: string }) {
  const values = useMemo(() => {
    const list = allowZero ? [0, ...DURATIONS] : DURATIONS
    return list.includes(value) ? list : [...list, value].sort((a, b) => a - b)
  }, [allowZero, value])
  return (
    <select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))} className={clsx('input', className)}>
      {placeholder !== undefined && <option value={value}>{placeholder}</option>}
      {values.map((v) => (
        <option key={v} value={v}>
          {v === 0 ? '0 min' : durationLong(v)}
        </option>
      ))}
    </select>
  )
}

export function ColorDotSwatch({ color, size = 16 }: { color: PaletteColor; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: PALETTE[color]?.edge ?? '#999' }} aria-hidden />
}

interface DotOption {
  value: string
  label: string
  color?: PaletteColor
  hint?: string
}

/** Select-like dropdown that shows a colour dot per option and an optional footer action ("Add category"). */
export function DotSelect({ id, value, options, onChange, placeholder, footer, invalid }: { id?: string; value: string; options: DotOption[]; onChange: (v: string) => void; placeholder?: string; footer?: { label: string; onClick: () => void }; invalid?: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const refs = useMemo(() => [ref], [])
  const close = useCallback(() => setOpen(false), [])
  useDismiss(refs, open, close)
  const current = options.find((o) => o.value === value)
  return (
    <div ref={ref} className="relative">
      <button id={id} type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={clsx('input flex items-center gap-3 text-left', invalid && 'border-danger')}>
        {current?.color && <ColorDotSwatch color={current.color} />}
        <span className={clsx('min-w-0 flex-1 truncate', !current && 'text-subtle')}>{current?.label ?? placeholder}</span>
        <ChevronDown size={16} className="shrink-0 text-muted" aria-hidden />
      </button>
      {open && (
        <div role="listbox" className="absolute left-0 right-0 top-full z-[60] mt-1 max-h-72 overflow-y-auto rounded-lg border border-line bg-raised p-1.5 shadow-md">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
              className={clsx('flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-body hover:bg-sunken', o.value === value && 'bg-primary-subtle/60')}
            >
              {o.color && <ColorDotSwatch color={o.color} />}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{o.label}</span>
                {o.hint && <span className="block text-small text-muted">{o.hint}</span>}
              </span>
              {o.value === value && <Check size={16} className="text-primary" aria-hidden />}
            </button>
          ))}
          {footer && (
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                footer.onClick()
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-md border-t border-line px-3 py-2.5 text-left text-body-strong text-primary hover:bg-sunken"
            >
              <Plus size={16} aria-hidden />
              {footer.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function ColorSelect({ id, value, onChange }: { id?: string; value: PaletteColor; onChange: (c: PaletteColor) => void }) {
  const { t } = useTranslation()
  return <DotSelect id={id} value={value} onChange={(v) => onChange(v as PaletteColor)} options={CATEGORY_COLORS.map((c) => ({ value: c, label: t(`catalog.colors.${c}`), color: c }))} />
}

/** Searchable treatment type combobox (catalog.md §1.1). */
export function TreatmentCombobox({ id, value, onChange }: { id?: string; value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const refs = useMemo(() => [ref], [])
  const close = useCallback(() => setOpen(false), [])
  useDismiss(refs, open, close)
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return TREATMENT_TYPES.filter((tt) => !q || tt.name.toLowerCase().includes(q) || tt.group.toLowerCase().includes(q)).slice(0, 40)
  }, [query])
  const pick = (v: string) => {
    onChange(v)
    setQuery('')
    setOpen(false)
  }
  return (
    <div ref={ref} className="relative">
      <div className={clsx('input flex items-center gap-2 pr-2', open && 'border-primary ring-2 ring-primary/30')}>
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          value={open ? query : value}
          placeholder={open ? value || t('catalog.service.treatmentSearch') : t('catalog.service.treatmentPlaceholder')}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (matches[0]) pick(matches[0].name)
              else if (query.trim()) pick(query.trim())
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-subtle"
        />
        <ChevronDown size={16} className="shrink-0 text-muted" aria-hidden />
      </div>
      {open && (
        <div role="listbox" className="absolute left-0 right-0 top-full z-[60] mt-1 max-h-72 overflow-y-auto rounded-lg border border-line bg-raised p-1.5 shadow-md">
          {matches.map((m) => (
            <button key={m.name} type="button" role="option" aria-selected={m.name === value} onClick={() => pick(m.name)} className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-body hover:bg-sunken">
              <span>
                {m.name} <span className="text-muted">({m.group})</span>
              </span>
              {m.name === value && <Check size={16} className="text-primary" aria-hidden />}
            </button>
          ))}
          {query.trim() && !matches.some((m) => m.name.toLowerCase() === query.trim().toLowerCase()) && (
            <button type="button" onClick={() => pick(query.trim())} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-body-strong text-primary hover:bg-sunken">
              <Plus size={16} aria-hidden />
              {t('catalog.service.useCustomTreatment', { name: query.trim() })}
            </button>
          )}
          {!matches.length && !query.trim() && <p className="px-3 py-2 text-body text-muted">{t('catalog.common.noResults')}</p>}
        </div>
      )}
    </div>
  )
}

/** Description textarea with the simulated "✨ Generate with AI" button. */
export function AiDescription({ id, value, onChange, max, placeholder, generate }: { id?: string; value: string; onChange: (v: string) => void; max: number; placeholder: string; generate: () => string }) {
  const { t } = useTranslation()
  const [writing, setWriting] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval>>()
  useEffect(() => () => clearInterval(timer.current), [])
  const run = () => {
    const full = generate().slice(0, max)
    setWriting(true)
    let i = 0
    onChange('')
    clearInterval(timer.current)
    setTimeout(() => {
      timer.current = setInterval(() => {
        i = Math.min(full.length, i + 6)
        onChange(full.slice(0, i))
        if (i >= full.length) {
          clearInterval(timer.current)
          setWriting(false)
        }
      }, 24)
    }, 700)
  }
  return (
    <div className={clsx('rounded-sm border border-line-strong bg-surface focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30', writing && 'bg-gradient-to-r from-primary-subtle to-surface')}>
      <textarea id={id} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} readOnly={writing} className="min-h-[96px] w-full resize-y bg-transparent px-3 py-2.5 text-body text-ink outline-none placeholder:text-subtle" />
      <div className="px-3 pb-3">
        <button type="button" onClick={run} disabled={writing} className="inline-flex h-9 items-center gap-2 rounded-full border border-primary/40 bg-surface px-4 text-body-strong text-ink shadow-xs hover:bg-primary-subtle disabled:cursor-wait">
          {writing ? <Loader2 size={16} className="animate-spin text-primary" aria-hidden /> : <Sparkles size={16} className="text-primary" aria-hidden />}
          {writing ? t('catalog.common.aiWriting') : t('catalog.common.aiGenerate')}
        </button>
      </div>
    </div>
  )
}

// ─── Category modal ────────────────────────────────────────────────────────

export function CategoryModal({ open, onClose, category, onSaved }: { open: boolean; onClose: () => void; category?: ServiceCategory; onSaved?: (c: ServiceCategory) => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [color, setColor] = useState<PaletteColor>('blue')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!open) return
    setName(category?.name ?? '')
    setColor(category?.color ?? 'blue')
    setDescription(category?.description ?? '')
    setError('')
  }, [open, category])
  const submit = async () => {
    if (!name.trim()) {
      setError(t('catalog.category.nameRequired'))
      return
    }
    setSaving(true)
    const saved = await saveCategory(category?.id ?? null, { name: name.trim(), color, description: description.trim() })
    setSaving(false)
    toast(category ? t('catalog.toasts.categoryUpdated') : t('catalog.toasts.categoryCreated'))
    onSaved?.(saved)
    onClose()
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={category ? t('catalog.category.editTitle') : t('catalog.category.addTitle')}
      footer={
        <>
          <Button onClick={onClose}>{t('catalog.common.cancel')}</Button>
          <Button variant="primary" loading={saving} onClick={() => void submit()}>
            {category ? t('catalog.common.save') : t('catalog.common.add')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 pb-2 sm:grid-cols-2">
        <Field label={t('catalog.category.name')} error={error}>
          {(id) => <TextInput id={id} value={name} maxLength={100} placeholder={t('catalog.category.namePlaceholder')} invalid={Boolean(error)} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void submit()} />}
        </Field>
        <Field label={t('catalog.category.color')}>{(id) => <ColorSelect id={id} value={color} onChange={setColor} />}</Field>
        <Field className="sm:col-span-2" label={t('catalog.category.description')} counter={{ value: description.length, max: 255 }}>
          {(id) => <TextArea id={id} value={description} maxLength={255} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
      </div>
    </Modal>
  )
}

// ─── Images ────────────────────────────────────────────────────────────────

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/avif', 'image/webp']
const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

function SortableImage({ src, index, onRemove }: { src: string; index: number; onRemove: () => void }) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: src })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={clsx('group relative aspect-square overflow-hidden rounded-md border border-line bg-sunken', isDragging && 'z-10 shadow-md')}>
      <img src={src} alt={t('catalog.common.imageAlt', { n: index + 1 })} className="h-full w-full cursor-grab object-cover" {...attributes} {...listeners} />
      {index === 0 && <span className="chip absolute left-2 top-2 h-5 bg-surface/90 text-caption text-ink">{t('catalog.common.cover')}</span>}
      <button type="button" onClick={onRemove} aria-label={t('catalog.common.removeImage')} className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-surface/90 text-ink shadow-sm hover:bg-danger hover:text-white">
        <X size={14} aria-hidden />
      </button>
    </div>
  )
}

/** Drop zone + sortable thumbnails; images are stored as data URLs (max 3 MB each). */
export function ImageUploader({ images, onChange, maxMb = 3, compact }: { images: string[]; onChange: (images: string[]) => void; maxMb?: number; compact?: boolean }) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files)
    const accepted: string[] = []
    for (const file of list) {
      if (!IMAGE_TYPES.includes(file.type)) {
        toast(t('catalog.common.imageType', { name: file.name }), 'error')
        continue
      }
      if (file.size > maxMb * 1024 * 1024) {
        toast(t('catalog.common.imageTooBig', { name: file.name, mb: maxMb }), 'error')
        continue
      }
      accepted.push(await readAsDataUrl(file))
    }
    if (accepted.length) {
      onChange([...images, ...accepted.filter((a) => !images.includes(a))])
      toast(t('catalog.common.imagesAdded', { count: accepted.length }))
    }
  }
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    onChange(arrayMove(images, images.indexOf(String(e.active.id)), images.indexOf(String(e.over.id))))
  }
  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          void addFiles(e.dataTransfer.files)
        }}
        className={clsx('flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-center transition-colors', compact ? 'px-4 py-8' : 'px-6 py-10', dragOver ? 'border-primary bg-primary-subtle' : 'border-line-strong bg-primary-subtle/30')}
      >
        <ImagePlus size={28} className="text-primary" aria-hidden />
        <p className="text-body-strong text-ink">{t('catalog.common.dropImages')}</p>
        <Button size="sm" onClick={() => input.current?.click()}>
          {t('catalog.common.chooseFile')}
        </Button>
        <p className="text-small text-muted">{t('catalog.common.imageHint', { mb: maxMb })}</p>
        <input
          ref={input}
          type="file"
          accept={IMAGE_TYPES.join(',')}
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
      {images.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={images} strategy={rectSortingStrategy}>
            <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {images.map((src, i) => (
                <SortableImage key={src} src={src} index={i} onRemove={() => onChange(images.filter((x) => x !== src))} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}

export function ProductThumb({ product, size = 56 }: { product?: Pick<Product, 'images' | 'name'>; size?: number }) {
  const src = product?.images[0]
  return (
    <span className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-surface text-muted" style={{ width: size, height: size }}>
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <Package size={Math.round(size * 0.42)} aria-hidden />}
    </span>
  )
}

// ─── Layout ────────────────────────────────────────────────────────────────

/** Highlights the section currently in view and scrolls to a section on click. */
export function useScrollSpy<T extends string>(ids: T[]): [T, (id: T) => void] {
  const [active, setActive] = useState<T>(ids[0])
  const key = ids.join('|')
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id.replace(/^sec-/, '') as T)
      },
      { rootMargin: '-15% 0px -70% 0px' },
    )
    key.split('|').forEach((id) => {
      const el = document.getElementById(`sec-${id}`)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [key])
  const scrollTo = useCallback((id: T) => {
    setActive(id)
    document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])
  return [active, scrollTo]
}

/** Section card inside full-screen editors (anchor id `sec-<id>`). */
export function SectionCard({ id, title, subtitle, titleExtra, action, children, className }: { id?: string; title?: ReactNode; subtitle?: ReactNode; titleExtra?: ReactNode; action?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <section id={id ? `sec-${id}` : undefined} className={clsx('card scroll-mt-6 p-6 sm:p-8', className)}>
      {(title || action) && (
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title && (
              <h2 className="flex items-center gap-3 font-display text-title-2 text-ink">
                {title}
                {titleExtra}
              </h2>
            )}
            {subtitle && <p className="mt-1 text-body text-muted">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

/** Full-screen editor: Close / Save header, big page title (as in the reference), scroll-spy left nav. */
export function EditorFrame<T extends string>({
  title,
  onClose,
  actions,
  nav,
  children,
  loading,
  maxWidth = 'max-w-4xl',
}: {
  title: string
  onClose: () => void
  actions: ReactNode
  nav?: { groups: { heading?: string; items: { value: T; label: string; count?: number }[] }[] }
  children: ReactNode
  loading?: boolean
  maxWidth?: string
}) {
  const { t } = useTranslation()
  const ids = useMemo(() => nav?.groups.flatMap((g) => g.items.map((i) => i.value)) ?? [], [nav])
  const [active, scrollTo] = useScrollSpy<T>(ids)
  return (
    <FullscreenFrame closeLabel={t('catalog.common.close')} onClose={onClose} actions={actions} maxWidth={maxWidth} nav={nav && !loading ? <SectionNav groups={nav.groups} value={active} onChange={scrollTo} /> : undefined}>
      {loading ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <>
          <h1 className="mb-6 font-display text-display text-ink">{title}</h1>
          <div className="flex flex-col gap-6 pb-24">{children}</div>
        </>
      )}
    </FullscreenFrame>
  )
}

/** Width of the product, supplier and stock order drawers (catalog.md §4, §6, §7). */
export const CATALOG_DRAWER_WIDTH = 1012

/** Drawer body used by the product, supplier and stock order drawers: left hero + vertical tabs, grey right pane. */
export function TwoPaneDrawer<T extends string>({ hero, tabs, tab, onTab, children }: { hero: ReactNode; tabs: { value: T; label: string }[]; tab: T; onTab: (t: T) => void; children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-[360px] shrink-0 flex-col overflow-y-auto border-r border-line bg-surface">
        <div className="flex flex-col items-center gap-2 border-b border-line px-6 pb-6 pt-8 text-center">{hero}</div>
        <nav className="flex flex-col gap-1 p-4" role="tablist" aria-orientation="vertical">
          {tabs.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={tab === item.value}
              onClick={() => onTab(item.value)}
              className={clsx('flex h-11 items-center rounded-md px-4 text-left text-body', tab === item.value ? 'bg-primary-subtle font-semibold text-primary' : 'text-ink hover:bg-sunken')}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto bg-sunken px-8 py-8">{children}</div>
    </div>
  )
}

/** Big title of the right-hand pane ("Product details", "Stock order details") with an optional action. */
export function PaneTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      <h2 className="font-display text-title-1 text-ink">{title}</h2>
      {action}
    </div>
  )
}

/** Rounded icon tile shown at the top of a drawer hero (stock order, product placeholder). */
export function HeroTile({ children, badge }: { children: ReactNode; badge?: ReactNode }) {
  return (
    <div className="relative mb-2 flex h-28 w-28 items-center justify-center rounded-lg border border-line bg-surface text-ink">
      {children}
      {badge && <span className="absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-full bg-accent text-on-accent shadow-sm">{badge}</span>}
    </div>
  )
}

/** Card of label → value rows (drawer detail panes). */
export function InfoCard({ title, action, rows, children }: { title: string; action?: ReactNode; rows?: { label: ReactNode; value: ReactNode; block?: boolean }[]; children?: ReactNode }) {
  return (
    <section className="mb-4 rounded-lg border border-line bg-surface p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="font-display text-title-3 text-ink">{title}</h3>
        {action}
      </div>
      {rows && (
        <dl className="flex flex-col gap-3">
          {rows.map((r, i) =>
            r.block ? (
              <div key={i}>
                <dt className="text-body-strong text-ink">{r.label}</dt>
                <dd className="mt-0.5 whitespace-pre-line text-body text-muted">{r.value || '-'}</dd>
              </div>
            ) : (
              <div key={i} className="flex items-start justify-between gap-4">
                <dt className="text-body text-ink">{r.label}</dt>
                <dd className="text-right text-body text-muted">{r.value === '' || r.value === undefined || r.value === null ? '-' : r.value}</dd>
              </div>
            ),
          )}
        </dl>
      )}
      {children}
    </section>
  )
}

export function LocationCard({ location, onChange }: { location?: Location; onChange?: () => void }) {
  const { t } = useTranslation()
  if (!location) return null
  return (
    <div className="flex items-center gap-4 rounded-lg border border-line bg-surface p-4">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-primary">
        <Store size={22} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body-strong text-ink">{location.name}</p>
        <p className="text-small text-muted">{[location.address.line1, location.address.postcode, location.address.city].filter(Boolean).join(', ')}</p>
      </div>
      {onChange && (
        <button type="button" onClick={onChange} className="text-body-strong text-primary hover:underline">
          {t('catalog.common.change')}
        </button>
      )}
    </div>
  )
}

/** Modal to pick a location ("Change"). */
export function LocationPicker({ open, onClose, locations, value, onChange }: { open: boolean; onClose: () => void; locations: Location[]; value: string; onChange: (id: string) => void }) {
  const { t } = useTranslation()
  return (
    <Modal open={open} onClose={onClose} title={t('catalog.common.selectLocation')} size="sm">
      <div className="flex flex-col gap-2 pb-3">
        {locations.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => {
              onChange(l.id)
              onClose()
            }}
            className={clsx('flex items-center gap-3 rounded-lg border p-3 text-left', l.id === value ? 'border-primary bg-primary-subtle/40' : 'border-line hover:bg-sunken')}
          >
            <Store size={18} className="text-primary" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-body-strong text-ink">{l.name}</span>
              <span className="block text-small text-muted">{l.address.line1}</span>
            </span>
            {l.id === value && <Check size={16} className="text-primary" aria-hidden />}
          </button>
        ))}
      </div>
    </Modal>
  )
}

/** Big check + title + subtitle (stock order ready / received). */
export function SuccessHero({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-white shadow-md">
        <Check size={44} aria-hidden />
      </span>
      <h1 className="mt-6 font-display text-title-1 text-ink">{title}</h1>
      <p className="mt-2 max-w-xl text-body-lg text-muted">{subtitle}</p>
    </div>
  )
}

/** Filter pills with counts (All 1 / Uncounted 0 / …). */
export function CountPills<T extends string>({ items, value, onChange }: { items: { value: T; label: string; count: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          onClick={() => onChange(item.value)}
          className={clsx('inline-flex h-10 items-center gap-2 rounded-full px-4 text-body-strong transition-colors', value === item.value ? 'bg-primary text-on-primary' : 'border border-line-strong bg-surface text-ink hover:bg-sunken')}
        >
          {item.label}
          <CountBadge value={item.count} active={value === item.value} />
        </button>
      ))}
    </div>
  )
}

/** List page skeleton: two-column cards (service menu, packages). */
export function CardsSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-5 w-96" />
      <Skeleton className="mt-2 h-16 w-full" />
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Skeleton className="h-64 w-full" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}

/** Translated badge and "Learn more" button for the shared IntroPage (feature intro pages). */
export function useIntroProps(topic: string) {
  const { t } = useTranslation()
  const drawer = useDrawer()
  return {
    badge: t('catalog.common.includedInPlan'),
    secondary: (
      <Button size="lg" onClick={() => drawer.open('resources', { tab: 'help', d_view: 'help-center', d_q: topic })}>
        {t('catalog.common.learnMore')}
      </Button>
    ),
  }
}

/** Light-grey toolbar card (search, filters, sort). */
export function ToolbarCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('mb-6 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface p-3', className)}>{children}</div>
}

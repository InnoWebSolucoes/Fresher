import clsx from 'clsx'
import { Calendar1, CalendarDays, Check, ChevronDown, Coins, ContactRound, Globe, Heart, Pencil, Plus, Search, Settings, Tag, Trash2, UsersRound } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Checkbox, Field, Modal, TextInput, toast } from '@/components/ui'
import type { DrawerProps } from '@/app/sectionRegistry'
import { createFilterPreset, deleteFilterPreset, renameFilterPreset } from '@/api/calendar'
import { isOffMenu } from '@/api/catalog'
import { useDb } from '@/store/db'
import { money } from '@/lib/format'
import { durationLong } from '@/lib/time'
import type { SavedFilter } from '@/types'
import { EMPTY_FILTERS, FILTER_CHANNELS, FILTER_CREATED, FILTER_PAYMENTS, FILTER_REQUESTED, FILTER_STATUSES, FILTER_TYPES, activeFilterCount, normaliseFilters, type CalendarFilters } from '../lib'
import { useCalendarUi } from '../store'
import { CountBadge, Dropdown, DropMenu, FullScreen } from '../ui'
import { CountChip, DrawerShell, PillTrigger, RoundButton, TriCheckbox } from './Shell'

type ListKey = 'status' | 'type' | 'channel' | 'payment' | 'created' | 'requested'

const GROUPS: { key: ListKey; icon: ReactNode; values: readonly string[]; radio?: boolean }[] = [
  { key: 'status', icon: <CalendarDays size={20} />, values: FILTER_STATUSES },
  { key: 'type', icon: <ContactRound size={20} />, values: FILTER_TYPES },
  { key: 'channel', icon: <Globe size={20} />, values: FILTER_CHANNELS },
  { key: 'payment', icon: <Coins size={20} />, values: FILTER_PAYMENTS },
  { key: 'created', icon: <Calendar1 size={20} />, values: FILTER_CREATED, radio: true },
  { key: 'requested', icon: <Heart size={20} />, values: FILTER_REQUESTED },
]

const countOf = (f: CalendarFilters, key: keyof CalendarFilters) => (key === 'created' ? (f.created.length && f.created[0] !== 'any' ? 1 : 0) : f[key].length)

/** "All filters" (calendar.md §3): accordion groups, Services and Client segments modals, saved presets. */
export function FiltersDrawer({ close }: DrawerProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const applied = useCalendarUi((s) => s.filters)
  const setFilters = useCalendarUi((s) => s.setFilters)
  const presets = useDb((s) => s.settings.savedFilters)
  const [f, setF] = useState<CalendarFilters>(applied)
  // Groups with a selection start open.
  const [expanded, setExpanded] = useState<Set<ListKey>>(() => new Set(GROUPS.filter((g) => countOf(applied, g.key) > 0).map((g) => g.key)))
  const [modal, setModal] = useState<'services' | 'segments' | 'create' | null>(null)
  const [manage, setManage] = useState(false)
  const selectedCount = activeFilterCount(f)

  const toggleGroup = (key: ListKey) =>
    setExpanded((cur) => {
      const next = new Set(cur)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const toggleValue = (key: keyof CalendarFilters, value: string) => setF((cur) => ({ ...cur, [key]: cur[key].includes(value) ? cur[key].filter((x) => x !== value) : [...cur[key], value] }))
  const clearKey = (key: keyof CalendarFilters) => setF((cur) => ({ ...cur, [key]: [] }))

  const applyPreset = (preset: SavedFilter) => {
    const next = normaliseFilters(preset.filters)
    setF(next)
    setFilters(next)
    setExpanded(new Set(GROUPS.filter((g) => countOf(next, g.key) > 0).map((g) => g.key)))
    toast(t('calendar.toasts.presetApplied', { name: preset.name }))
  }

  const groupHeader = (key: keyof CalendarFilters, icon: ReactNode, open: boolean | null, onToggle?: () => void, extra?: ReactNode) => {
    const count = countOf(f, key)
    return (
      <div className={clsx('flex items-center gap-4 rounded-lg px-3 py-4', open && 'bg-sunken')}>
        <span className="shrink-0 text-ink" aria-hidden>
          {icon}
        </span>
        {onToggle ? (
          <button type="button" onClick={onToggle} aria-expanded={Boolean(open)} className="flex min-w-0 flex-1 items-center gap-2 text-left text-body-lg text-ink" data-testid={`filter-group-${key}`}>
            {t(`calendar.filters.groups.${key}`)}
            {count > 0 && <CountBadge value={count} />}
          </button>
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-2 text-body-lg text-ink">
            {t(`calendar.filters.groups.${key}`)}
            {count > 0 && <CountBadge value={count} />}
          </span>
        )}
        {count > 0 && (
          <button type="button" onClick={() => clearKey(key)} className="text-body text-ink hover:underline">
            {t('calendar.filters.clearGroup')}
          </button>
        )}
        {extra}
        {onToggle && (
          <button type="button" onClick={onToggle} aria-label={t(`calendar.filters.groups.${key}`)} className="shrink-0 text-ink">
            <ChevronDown size={18} className={clsx('transition-transform', open && 'rotate-180')} aria-hidden />
          </button>
        )}
      </div>
    )
  }

  const editLink = (onClick: () => void, testId: string) => (
    <button type="button" onClick={onClick} className="shrink-0 text-body text-primary hover:underline" data-testid={testId}>
      {t('calendar.filters.edit')}
    </button>
  )

  const renderGroup = (g: (typeof GROUPS)[number]) => {
    const open = expanded.has(g.key)
    return (
      <section key={g.key} className="border-b border-line last:border-b-0">
        {groupHeader(g.key, g.icon, open, () => toggleGroup(g.key))}
        {open && (
          <div className="flex flex-col gap-3 pb-5 pl-[52px] pr-3 pt-2">
            {g.radio
              ? g.values.map((v) => {
                  const checked = (f.created[0] ?? 'any') === v
                  return (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      onClick={() => setF((cur) => ({ ...cur, created: v === 'any' ? [] : [v] }))}
                      className="flex items-center justify-between py-1.5 text-left text-body-lg text-ink hover:text-primary"
                    >
                      {t(`calendar.filters.created.${v}`)}
                      {checked && <Check size={20} aria-hidden />}
                    </button>
                  )
                })
              : g.values.map((v) => (
                  <Checkbox key={v} label={t(`calendar.filters.values.${v}`)} hint={g.key === 'requested' ? t(`calendar.filters.hints.${v}`) : undefined} checked={f[g.key].includes(v)} onChange={() => toggleValue(g.key, v)} />
                ))}
          </div>
        )}
      </section>
    )
  }

  return (
    <DrawerShell
      testId="filters-drawer"
      title={t('calendar.filters.title')}
      headerRight={
        <Dropdown
          align="right"
          width={260}
          trigger={({ open, toggle }) => (
            <PillTrigger open={open} onClick={toggle} data-testid="saved-filters">
              {t('calendar.filters.savedFilters')}
            </PillTrigger>
          )}
          panelClassName="p-1.5"
        >
          {(closeMenu) =>
            presets.length ? (
              <div role="menu">
                {presets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      closeMenu()
                      applyPreset(preset)
                    }}
                    className="flex w-full rounded-md px-3 py-2.5 text-left text-body text-ink hover:bg-sunken"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-3 py-2.5 text-muted" aria-disabled>
                <p className="text-body">{t('calendar.filters.noSaved')}</p>
                <p className="text-small text-subtle">{t('calendar.filters.noSavedHint')}</p>
              </div>
            )
          }
        </Dropdown>
      }
      footer={
        <>
          <DropMenu
            placement="top"
            width={290}
            trigger={({ open, toggle }) => <RoundButton onClick={toggle} aria-expanded={open} aria-label={t('calendar.filters.options')} data-testid="filters-options" />}
            groups={[
              {
                items: [
                  { label: t('calendar.filters.saveAsPreset'), icon: <Plus size={16} />, disabled: selectedCount === 0, hint: selectedCount === 0 ? t('calendar.filters.preset.needFilter') : undefined, onSelect: () => setModal('create') },
                  { label: t('calendar.filters.manage'), icon: <Settings size={16} />, onSelect: () => setManage(true) },
                ],
              },
            ]}
          />
          <Button
            size="lg"
            className="flex-1 rounded-full"
            onClick={() => {
              setF(EMPTY_FILTERS)
              if (activeFilterCount(applied)) {
                setFilters(EMPTY_FILTERS)
                toast(t('calendar.toasts.filtersCleared'))
              }
            }}
          >
            {t('calendar.filters.clear')}
          </Button>
          <Button
            variant="primary"
            size="lg"
            className="flex-1 rounded-full"
            onClick={() => {
              setFilters(f)
              close()
            }}
            data-testid="filters-apply"
          >
            {t('calendar.filters.apply')}
          </Button>
        </>
      }
    >
      <div className="-mx-3">
        {GROUPS.slice(0, 4).map(renderGroup)}
        <section className="border-b border-line">{groupHeader('services', <Tag size={20} />, null, undefined, editLink(() => setModal('services'), 'filter-services-edit'))}</section>
        {GROUPS.slice(4).map(renderGroup)}
        <section>{groupHeader('segments', <UsersRound size={20} />, null, undefined, editLink(() => setModal('segments'), 'filter-segments-edit'))}</section>
      </div>

      <ServicesModal open={modal === 'services'} value={f.services} onClose={() => setModal(null)} onApply={(services) => setF((cur) => ({ ...cur, services }))} />
      <SegmentsModal
        open={modal === 'segments'}
        value={f.segments}
        onClose={() => setModal(null)}
        onApply={(segments) => setF((cur) => ({ ...cur, segments }))}
        onOpenSegments={() => {
          setModal(null)
          navigate('/clients/segments')
        }}
      />
      <PresetNameModal
        open={modal === 'create'}
        title={t('calendar.filters.preset.createTitle')}
        subtitle={t('calendar.filters.preset.createSubtitle')}
        initial=""
        onClose={() => setModal(null)}
        onSave={async (name) => {
          await createFilterPreset(name, f as unknown as Record<string, string[]>)
          toast(t('calendar.toasts.presetSaved'))
        }}
      />
      <ManagePresets open={manage} onClose={() => setManage(false)} />
    </DrawerShell>
  )
}

/** "Services" modal: search, Select all, categories and service checkboxes. */
function ServicesModal({ open, value, onClose, onApply }: { open: boolean; value: string[]; onClose: () => void; onApply: (ids: string[]) => void }) {
  const { t } = useTranslation()
  const services = useDb((s) => s.services)
  const categories = useDb((s) => s.serviceCategories)
  const [selected, setSelected] = useState<string[]>(value)
  const [query, setQuery] = useState('')
  const [openFor, setOpenFor] = useState(false)
  if (open !== openFor) {
    setOpenFor(open)
    if (open) {
      setSelected(value)
      setQuery('')
    }
  }
  const live = useMemo(() => services.filter((s) => !isOffMenu(s, categories)), [services, categories])
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...categories]
      .filter((c) => !c.archived)
      .sort((a, b) => a.order - b.order)
      .map((c) => ({ category: c, items: live.filter((s) => s.categoryId === c.id && (!q || s.name.toLowerCase().includes(q))).sort((a, b) => a.order - b.order) }))
      .filter((g) => g.items.length)
  }, [categories, live, query])
  const visibleIds = groups.flatMap((g) => g.items.map((s) => s.id))
  const allChecked = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id))
  const someChecked = visibleIds.some((id) => selected.includes(id))
  const setMany = (ids: string[], on: boolean) => setSelected((cur) => (on ? [...new Set([...cur, ...ids])] : cur.filter((id) => !ids.includes(id))))

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('calendar.filters.servicesModal.title')}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <span className="text-body text-ink">{t('calendar.filters.servicesModal.selected', { count: selected.length })}</span>
          <Button
            variant="primary"
            className="rounded-full"
            onClick={() => {
              onApply(selected)
              onClose()
            }}
            data-testid="services-modal-apply"
          >
            {t('calendar.filters.apply')}
          </Button>
        </div>
      }
    >
      <label className="relative mb-4 block">
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('calendar.filters.servicesModal.search')} aria-label={t('calendar.filters.servicesModal.search')} className="input h-12 pl-11" />
      </label>
      {groups.length ? (
        <>
          <label className="flex cursor-pointer items-center gap-3 border-b border-line py-4">
            <TriCheckbox checked={allChecked} indeterminate={someChecked} onChange={(on) => setMany(visibleIds, on)} />
            <span className="text-body-strong text-ink">{t('calendar.filters.servicesModal.selectAll')}</span>
            <CountChip value={visibleIds.length} />
          </label>
          {groups.map(({ category, items }) => {
            const ids = items.map((s) => s.id)
            const every = ids.every((id) => selected.includes(id))
            const some = ids.some((id) => selected.includes(id))
            return (
              <div key={category.id} className="border-b border-line last:border-b-0">
                <label className="flex cursor-pointer items-center gap-3 py-4">
                  <TriCheckbox checked={every} indeterminate={some} onChange={(on) => setMany(ids, on)} />
                  <span className="text-body-strong text-ink">{category.name}</span>
                  <CountChip value={items.length} />
                </label>
                {items.map((s) => (
                  <label key={s.id} className="flex cursor-pointer items-center gap-3 border-t border-line py-3 pl-8">
                    <TriCheckbox checked={selected.includes(s.id)} onChange={(on) => setMany([s.id], on)} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-body-lg text-ink">{s.name}</span>
                      <span className="block text-body text-muted">{durationLong(s.durationMin)}</span>
                    </span>
                    <span className="text-body-lg text-ink">{money(s.price)}</span>
                  </label>
                ))}
              </div>
            )
          })}
        </>
      ) : (
        <p className="py-6 text-center text-body text-muted">{t('calendar.filters.servicesModal.empty')}</p>
      )}
    </Modal>
  )
}

/** "Client segments" modal: search, All segments and each segment with its description. */
function SegmentsModal({ open, value, onClose, onApply, onOpenSegments }: { open: boolean; value: string[]; onClose: () => void; onApply: (ids: string[]) => void; onOpenSegments: () => void }) {
  const { t } = useTranslation()
  const segments = useDb((s) => s.segments)
  const [selected, setSelected] = useState<string[]>(value)
  const [query, setQuery] = useState('')
  const [openFor, setOpenFor] = useState(false)
  if (open !== openFor) {
    setOpenFor(open)
    if (open) {
      setSelected(value)
      setQuery('')
    }
  }
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return segments.filter((s) => !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
  }, [segments, query])
  const ids = list.map((s) => s.id)
  const every = ids.length > 0 && ids.every((id) => selected.includes(id))
  const some = ids.some((id) => selected.includes(id))
  const setMany = (many: string[], on: boolean) => setSelected((cur) => (on ? [...new Set([...cur, ...many])] : cur.filter((id) => !many.includes(id))))

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('calendar.filters.segmentsModal.title')}
      subtitle={
        <>
          {t('calendar.filters.segmentsModal.subtitle')}{' '}
          <button type="button" onClick={onOpenSegments} className="text-primary hover:underline">
            {t('calendar.filters.segmentsModal.link')}
          </button>
        </>
      }
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <span className="text-body text-muted">{t('calendar.filters.segmentsModal.selected', { count: selected.length })}</span>
          <Button
            variant="primary"
            className="rounded-full"
            onClick={() => {
              onApply(selected)
              onClose()
            }}
            data-testid="segments-modal-apply"
          >
            {t('calendar.filters.apply')}
          </Button>
        </div>
      }
    >
      <label className="relative mb-4 block">
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('calendar.filters.segmentsModal.search')} aria-label={t('calendar.filters.segmentsModal.search')} className="input h-12 pl-11" />
      </label>
      {list.length ? (
        <>
          <label className="flex cursor-pointer items-center gap-3 border-b border-line py-4">
            <TriCheckbox checked={every} indeterminate={some} onChange={(on) => setMany(ids, on)} />
            <span className="text-body-strong text-ink">{t('calendar.filters.segmentsModal.all')}</span>
            <CountChip value={list.length} />
          </label>
          {list.map((s) => (
            <label key={s.id} className="flex cursor-pointer items-center gap-3 border-b border-line py-4 last:border-b-0">
              <TriCheckbox checked={selected.includes(s.id)} onChange={(on) => setMany([s.id], on)} />
              <span className="min-w-0">
                <span className="block text-body-strong text-ink">{s.name}</span>
                <span className="block text-small text-muted">{s.description}</span>
              </span>
            </label>
          ))}
        </>
      ) : (
        <p className="py-6 text-center text-body text-muted">{t('calendar.filters.segmentsModal.empty')}</p>
      )}
    </Modal>
  )
}

/** "Create a new filter preset" / "Edit saved filter": one Preset name field and Save. */
function PresetNameModal({ open, title, subtitle, initial, ignoreId, onClose, onSave }: { open: boolean; title: string; subtitle?: string; initial: string; ignoreId?: string; onClose: () => void; onSave: (name: string) => Promise<void> }) {
  const { t } = useTranslation()
  const presets = useDb((s) => s.settings.savedFilters)
  const [name, setName] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [openFor, setOpenFor] = useState(false)
  if (open !== openFor) {
    setOpenFor(open)
    if (open) setName(initial)
  }
  const trimmed = name.trim()
  const taken = presets.some((p) => p.id !== ignoreId && p.name.toLowerCase() === trimmed.toLowerCase())
  const unchanged = trimmed === initial.trim()
  const save = async () => {
    if (!trimmed || taken || unchanged) return
    setBusy(true)
    try {
      await onSave(trimmed)
      onClose()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" title={title} subtitle={subtitle}>
      <form
        className="flex flex-col gap-8 pb-3 pt-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Field label={t('calendar.filters.preset.name')} error={taken ? t('calendar.filters.preset.nameTaken') : undefined}>
          {(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('calendar.filters.preset.placeholder')} maxLength={60} invalid={taken} data-testid="preset-name" />}
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full rounded-full" disabled={!trimmed || taken || unchanged} loading={busy} data-testid="preset-save">
          {t('calendar.filters.preset.save')}
        </Button>
      </form>
    </Modal>
  )
}

/** "Manage filter presets": full-screen list with Edit and Delete. */
function ManagePresets({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const presets = useDb((s) => s.settings.savedFilters)
  const [editing, setEditing] = useState<SavedFilter | null>(null)
  const [removing, setRemoving] = useState<SavedFilter | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <FullScreen open={open} onClose={onClose} closeLabel={t('calendar.common.close')} closeVariant="primary" narrow label={t('calendar.filters.preset.manageTitle')}>
      <h1 className="font-display text-[44px] font-bold leading-[52px] text-ink">{t('calendar.filters.preset.manageTitle')}</h1>
      <div className="mt-10 flex flex-col gap-3" data-testid="manage-presets">
        {presets.length ? (
          presets.map((preset) => (
            <div key={preset.id} className="flex items-center gap-3 rounded-lg border border-line px-5 py-4">
              <span className="min-w-0 flex-1 truncate text-body-strong text-ink">{preset.name}</span>
              <button type="button" onClick={() => setEditing(preset)} aria-label={t('calendar.filters.preset.editAria', { name: preset.name })} title={t('calendar.filters.edit')} className="icon-btn h-10 w-10">
                <Pencil size={18} aria-hidden />
              </button>
              <button type="button" onClick={() => setRemoving(preset)} aria-label={t('calendar.filters.preset.deleteAria', { name: preset.name })} title={t('calendar.filters.preset.delete')} className="icon-btn h-10 w-10">
                <Trash2 size={18} aria-hidden />
              </button>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center rounded-lg border border-line px-6 py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-subtle text-primary">
              <Heart size={28} className="fill-primary/30" aria-hidden />
            </span>
            <p className="mt-5 text-title-3 font-semibold text-ink">{t('calendar.filters.preset.emptyTitle')}</p>
            <p className="mt-1 text-body text-muted">{t('calendar.filters.preset.emptyBody')}</p>
          </div>
        )}
      </div>
      <PresetNameModal
        open={Boolean(editing)}
        title={t('calendar.filters.preset.editTitle')}
        initial={editing?.name ?? ''}
        ignoreId={editing?.id}
        onClose={() => setEditing(null)}
        onSave={async (name) => {
          if (!editing) return
          await renameFilterPreset(editing.id, name)
          toast(t('calendar.toasts.presetUpdated'))
        }}
      />
      <Modal open={Boolean(removing)} onClose={() => setRemoving(null)} size="md" title={t('calendar.filters.preset.removeTitle')}>
        <p className="pt-2 text-body text-ink">{t('calendar.filters.preset.removeBody')}</p>
        <Button
          size="lg"
          className="mb-3 mt-8 w-full rounded-full !text-danger"
          loading={busy}
          onClick={async () => {
            if (!removing) return
            setBusy(true)
            try {
              await deleteFilterPreset(removing.id)
              toast(t('calendar.toasts.presetDeleted'))
              setRemoving(null)
            } finally {
              setBusy(false)
            }
          }}
          data-testid="preset-delete"
        >
          {t('calendar.filters.preset.delete')}
        </Button>
      </Modal>
    </FullScreen>
  )
}

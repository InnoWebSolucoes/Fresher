import clsx from 'clsx'
import { BookOpen, GripVertical, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button, EmptyState, FullscreenFrame, LearnMore, Menu, MenuButton, Skeleton, toast, usePageLoading } from '@/components/ui'
import { useDb } from '@/store/db'
import { durationLong } from '@/lib/time'
import { money } from '@/lib/format'
import { PALETTE } from '@/styles/palette'
import type { ID } from '@/types'
import { saveMenuOrder } from '@/api/catalog'
import { useCatalogPrefs } from '../prefs'
import { ServicePickerModal } from './BundleEditorPage'

function useDndSensors() {
  return useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
}

function SortableRow({ id, children, className, handleLabel }: { id: string; children: ReactNode; className?: string; handleLabel: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={clsx(className, isDragging && 'relative z-10 shadow-md')}>
      <button type="button" aria-label={handleLabel} className="flex h-9 w-9 shrink-0 cursor-grab items-center justify-center rounded-md text-muted hover:bg-sunken active:cursor-grabbing" {...attributes} {...listeners}>
        <GripVertical size={18} aria-hidden />
      </button>
      {children}
    </div>
  )
}

/** Set menu order (catalog.md §1.4): drag categories and the services inside them. */
export function MenuOrderPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loading = usePageLoading()
  const categories = useDb((s) => s.serviceCategories)
  const services = useDb((s) => s.services)
  const bundles = useDb((s) => s.bundles)
  const bundleOrder = useCatalogPrefs((s) => s.bundleOrder)
  const setBundleOrder = useCatalogPrefs((s) => s.setBundleOrder)
  const sensors = useDndSensors()
  const [mode, setMode] = useState<'all' | 'categories'>('all')
  const [saving, setSaving] = useState(false)

  const initial = useMemo(() => {
    const cats = [...categories].sort((a, b) => a.order - b.order).map((c) => c.id)
    const items: Record<ID, ID[]> = {}
    cats.forEach((cid) => {
      const merged = [
        ...services.filter((s) => s.categoryId === cid && !s.archived).map((s) => ({ id: s.id, order: s.order })),
        ...bundles.filter((b) => b.categoryId === cid && !b.archived).map((b) => ({ id: b.id, order: bundleOrder[b.id] ?? -1 })),
      ].sort((a, b) => a.order - b.order)
      items[cid] = merged.map((m) => m.id)
    })
    return { cats, items }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [cats, setCats] = useState(initial.cats)
  const [items, setItems] = useState(initial.items)
  const dirty = JSON.stringify({ cats, items }) !== JSON.stringify(initial)

  const label = (id: ID) => services.find((s) => s.id === id)?.name ?? bundles.find((b) => b.id === id)?.name ?? ''

  const onCatsEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    setCats((list) => arrayMove(list, list.indexOf(String(e.active.id)), list.indexOf(String(e.over!.id))))
  }
  const onItemsEnd = (cid: ID) => (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    setItems((all) => ({ ...all, [cid]: arrayMove(all[cid], all[cid].indexOf(String(e.active.id)), all[cid].indexOf(String(e.over!.id))) }))
  }

  const save = async () => {
    setSaving(true)
    await saveMenuOrder(cats, items)
    const order: Record<ID, number> = {}
    Object.values(items).forEach((ids) =>
      ids.forEach((id, i) => {
        if (bundles.some((b) => b.id === id)) order[id] = i
      }),
    )
    setBundleOrder(order)
    setSaving(false)
    toast(t('catalog.toasts.menuOrderSaved'))
    navigate('/catalogue/services')
  }

  return (
    <FullscreenFrame
      title={t('catalog.order.title')}
      onClose={() => navigate('/catalogue/services')}
      actions={
        <Button variant="primary" loading={saving} disabled={!dirty} onClick={() => void save()}>
          {t('catalog.common.save')}
        </Button>
      }
    >
      <h1 className="font-display text-display text-ink">{t('catalog.order.title')}</h1>
      <p className="mt-2 text-body-lg text-muted">{t('catalog.order.subtitle')}</p>
      <div className="mt-6">
        <Menu
          align="left"
          trigger={({ open, toggle }) => (
            <MenuButton open={open} toggle={toggle}>
              {mode === 'all' ? t('catalog.order.modeAll') : t('catalog.order.modeCategories')}
            </MenuButton>
          )}
          groups={[
            {
              items: [
                { label: t('catalog.order.modeAll'), checked: mode === 'all', onSelect: () => setMode('all') },
                { label: t('catalog.order.modeCategories'), checked: mode === 'categories', onSelect: () => setMode('categories') },
              ],
            },
          ]}
        />
      </div>
      {loading ? (
        <div className="mt-6 flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onCatsEnd}>
          <SortableContext items={cats} strategy={verticalListSortingStrategy}>
            <div className="mt-6 flex flex-col gap-4 pb-16">
              {cats.map((cid) => {
                const cat = categories.find((c) => c.id === cid)
                if (!cat) return null
                return (
                  <SortableRow key={cid} id={cid} handleLabel={t('catalog.order.dragCategory', { name: cat.name })} className="flex flex-wrap items-start gap-2 rounded-lg border border-line bg-surface p-4">
                    <div className="min-w-0 flex-1">
                      <p className="flex h-9 items-center font-display text-title-3 text-ink">{cat.name}</p>
                      {mode === 'all' && (
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onItemsEnd(cid)}>
                          <SortableContext items={items[cid] ?? []} strategy={verticalListSortingStrategy}>
                            <div className="mt-3 flex flex-col gap-2">
                              {(items[cid] ?? []).length === 0 && <p className="text-body text-muted">{t('catalog.menu.emptyCategory')}</p>}
                              {(items[cid] ?? []).map((id) => (
                                <SortableRow key={id} id={id} handleLabel={t('catalog.order.dragItem', { name: label(id) })} className="flex items-center gap-2 overflow-hidden rounded-lg border border-line bg-surface pr-4">
                                  <span className="-order-1 w-1.5 self-stretch" style={{ background: PALETTE[cat.color].edge }} aria-hidden />
                                  <span className="py-3 text-body-lg text-ink">{label(id)}</span>
                                  {bundles.some((b) => b.id === id) && <span className="chip ml-2 h-5 bg-sunken text-caption text-muted">{t('catalog.order.bundle')}</span>}
                                </SortableRow>
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                      )}
                    </div>
                  </SortableRow>
                )
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </FullscreenFrame>
  )
}

/** Set booking sequence (catalog.md §1.4). */
export function BookingSequencePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loading = usePageLoading()
  const services = useDb((s) => s.services)
  const categories = useDb((s) => s.serviceCategories)
  const stored = useCatalogPrefs((s) => s.bookingSequence)
  const setBookingSequence = useCatalogPrefs((s) => s.setBookingSequence)
  const sensors = useDndSensors()
  const [ids, setIds] = useState<ID[]>(stored)
  const [touched, setTouched] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!touched) setIds(stored)
  }, [stored, touched])

  const update = (next: ID[]) => {
    setTouched(true)
    setIds(next)
  }
  const onEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    update(arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))))
  }
  const save = async () => {
    setSaving(true)
    await new Promise((r) => setTimeout(r, 400))
    setBookingSequence(ids)
    setSaving(false)
    toast(t('catalog.toasts.sequenceSaved'))
    navigate('/catalogue/services')
  }
  const list = ids.map((id) => services.find((s) => s.id === id)).filter((s) => s !== undefined)

  return (
    <FullscreenFrame
      title={t('catalog.sequence.title')}
      onClose={() => navigate('/catalogue/services')}
      actions={
        <Button variant="primary" loading={saving} onClick={() => void save()}>
          {t('catalog.common.save')}
        </Button>
      }
    >
      <h1 className="font-display text-display text-ink">{t('catalog.sequence.title')}</h1>
      <p className="mt-2 text-body-lg text-muted">
        {t('catalog.sequence.subtitle')} <LearnMore topic="Booking sequence">{t('catalog.common.learnMore')}</LearnMore>
      </p>
      {loading ? (
        <Skeleton className="mt-6 h-64 w-full" />
      ) : list.length === 0 ? (
        <div className="card mt-6">
          <EmptyState icon={<BookOpen size={26} />} title={t('catalog.sequence.emptyTitle')} body={t('catalog.sequence.emptyBody')} action={<Button onClick={() => setPickerOpen(true)}>{t('catalog.bundle.addService')}</Button>} />
        </div>
      ) : (
        <div className="mt-6 pb-16">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onEnd}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2">
                {list.map((s, i) => {
                  const cat = categories.find((c) => c.id === s.categoryId)
                  return (
                    <SortableRow key={s.id} id={s.id} handleLabel={t('catalog.order.dragItem', { name: s.name })} className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-subtle text-body-strong text-primary">{i + 1}</span>
                      <span className="h-10 w-1 rounded-full" style={{ background: PALETTE[cat?.color ?? 'blue'].edge }} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-body-lg text-ink">{s.name}</span>
                        <span className="block text-body text-muted">
                          {cat?.name} · {durationLong(s.durationMin)} · {money(s.price)}
                        </span>
                      </span>
                      <button type="button" className="icon-btn" aria-label={t('catalog.common.remove')} onClick={() => update(ids.filter((x) => x !== s.id))}>
                        <Trash2 size={18} aria-hidden />
                      </button>
                    </SortableRow>
                  )
                })}
              </div>
            </SortableContext>
          </DndContext>
          <Button className="mt-4" icon={<Plus size={16} />} onClick={() => setPickerOpen(true)}>
            {t('catalog.bundle.addService')}
          </Button>
        </div>
      )}
      <ServicePickerModal
        open={pickerOpen}
        exclude={ids}
        onClose={() => setPickerOpen(false)}
        onPick={(s) => {
          update([...ids, s.id])
          setPickerOpen(false)
        }}
      />
    </FullscreenFrame>
  )
}

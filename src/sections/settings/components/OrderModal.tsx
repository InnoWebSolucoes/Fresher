import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { FullModal } from './FullModal'

export interface OrderItem {
  id: string
  label: ReactNode
  leading?: ReactNode
}

/**
 * "… order — Drag and drop the order of items, these will be reflected in all
 * lists." Full screen with Close / Save order at the top right and one card
 * per item (drag with the mouse, or Space + arrows + Space on the handle).
 */
export function OrderModal({
  open,
  onClose,
  title,
  description,
  items,
  onSave,
  saveLabel,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  items: OrderItem[]
  /** Return false to keep the modal open (e.g. the save failed). */
  onSave: (ids: string[]) => Promise<unknown> | void
  saveLabel?: string
}) {
  const { t } = useTranslation()
  const [order, setOrder] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (open) setOrder(items.map((i) => i.id))
    // Only reset when the modal opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const byId = new Map(items.map((i) => [i.id, i]))
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    setOrder((prev) => arrayMove(prev, prev.indexOf(String(active.id)), prev.indexOf(String(over.id))))
  }
  const save = async () => {
    setSaving(true)
    try {
      const result = await onSave(order)
      if (result !== false) onClose()
    } finally {
      setSaving(false)
    }
  }
  return (
    <FullModal open={open} onClose={onClose} title={title} subtitle={description ?? t('settings.common.orderDescription')} onSave={() => void save()} saving={saving} saveLabel={saveLabel ?? t('settings.common.saveOrder')} testId="order-modal">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-3">
            {order.map((id) => {
              const item = byId.get(id)
              return item ? <SortableRow key={id} item={item} /> : null
            })}
          </ul>
        </SortableContext>
      </DndContext>
    </FullModal>
  )
}

function SortableRow({ item }: { item: OrderItem }) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`card flex items-center gap-3 px-6 py-5 ${isDragging ? 'relative z-10 shadow-md' : ''}`} data-testid={`order-row-${item.id}`}>
      {item.leading}
      <span className="min-w-0 flex-1 truncate text-body-strong text-ink">{item.label}</span>
      <button type="button" className="cursor-grab touch-none rounded-sm p-1 text-muted hover:bg-sunken active:cursor-grabbing" aria-label={t('settings.common.dragToReorder')} {...attributes} {...listeners}>
        <GripVertical size={18} aria-hidden />
      </button>
    </li>
  )
}

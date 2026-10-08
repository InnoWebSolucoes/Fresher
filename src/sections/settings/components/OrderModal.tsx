import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import { SettingsModal } from './SettingsModal'

export interface OrderItem {
  id: string
  label: ReactNode
  leading?: ReactNode
}

/**
 * "… order — Drag and drop the order of items, these will be reflected in all
 * lists." with draggable rows (mouse or keyboard: Space, arrows, Space) and
 * Save order.
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
  onSave: (ids: string[]) => Promise<void> | void
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
      await onSave(order)
      onClose()
    } finally {
      setSaving(false)
    }
  }
  return (
    <SettingsModal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={description ?? t('settings.common.orderDescription')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={saving} onClick={save} data-testid="save-order">
            {saveLabel ?? t('settings.common.saveOrder')}
          </Button>
        </>
      }
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-2 py-1">
            {order.map((id) => {
              const item = byId.get(id)
              return item ? <SortableRow key={id} item={item} /> : null
            })}
          </ul>
        </SortableContext>
      </DndContext>
    </SettingsModal>
  )
}

function SortableRow({ item }: { item: OrderItem }) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 rounded-md border border-line bg-surface px-3 py-3 ${isDragging ? 'z-10 shadow-md' : ''}`}
    >
      <button type="button" className="cursor-grab touch-none rounded-sm p-1 text-muted hover:bg-sunken active:cursor-grabbing" aria-label={t('settings.common.dragToReorder')} {...attributes} {...listeners}>
        <GripVertical size={18} aria-hidden />
      </button>
      {item.leading}
      <span className="min-w-0 flex-1 truncate text-body-strong text-ink">{item.label}</span>
    </li>
  )
}

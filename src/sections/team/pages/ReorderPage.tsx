import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { TeamMember } from '@/types'
import { useDb } from '@/store/db'
import { Button, FullscreenFrame, PageSkeleton, toast, usePageLoading } from '@/components/ui'
import { reorderMembers } from '@/api/team'
import { MemberAvatar } from '../components/common'
import { memberName, sortMembers } from '../lib/members'

/** "Change the team members order" (team.md §1.1, team-08). */
export function ReorderPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loading = usePageLoading()
  const teamMembers = useDb((s) => s.teamMembers)
  const initial = useMemo(() => sortMembers(teamMembers.filter((m) => !m.archived), 'custom').map((m) => m.id), [teamMembers])
  const [order, setOrder] = useState<string[] | null>(null)
  const ids = order ?? initial
  const [saving, setSaving] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    setOrder(arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))))
  }
  const save = async () => {
    setSaving(true)
    const archived = sortMembers(teamMembers.filter((m) => m.archived), 'custom').map((m) => m.id)
    await reorderMembers([...ids, ...archived])
    setSaving(false)
    toast(t('team.reorder.toast'))
    navigate('/team/team-members')
  }

  return (
    <FullscreenFrame
      title={t('team.reorder.title')}
      onClose={() => navigate('/team/team-members')}
      maxWidth="max-w-xl"
      actions={
        <Button variant="primary" loading={saving} onClick={save}>
          {t('team.common.save')}
        </Button>
      }
    >
      <h1 className="font-display text-title-1 text-ink">{t('team.reorder.title')}</h1>
      <p className="mb-6 mt-2 text-body-lg text-muted">{t('team.reorder.body')}</p>
      {loading ? (
        <PageSkeleton rows={4} />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-2">
              {ids.map((id) => {
                const m = teamMembers.find((x) => x.id === id)
                return m ? <SortableRow key={id} member={m} /> : null
              })}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </FullscreenFrame>
  )
}

function SortableRow({ member }: { member: TeamMember }) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: member.id })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`card flex items-center gap-4 p-4 ${isDragging ? 'z-10 shadow-lg ring-2 ring-primary' : ''}`}
    >
      <button type="button" className="icon-btn h-9 w-9 cursor-grab touch-none active:cursor-grabbing" aria-label={t('team.reorder.drag', { name: memberName(member) })} {...attributes} {...listeners}>
        <GripVertical size={18} aria-hidden />
      </button>
      <MemberAvatar member={member} size={44} />
      <div className="min-w-0">
        <p className="text-body-strong text-ink">{memberName(member)}</p>
        {member.jobTitle && <p className="text-small text-muted">{member.jobTitle}</p>}
      </div>
    </li>
  )
}

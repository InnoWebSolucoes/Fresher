import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { TeamMember } from '@/types'
import { confirm, toast, type MenuItem } from '@/components/ui'
import { archiveMember, deleteMember, unarchiveMember } from '@/api/team'
import { EditRoleModal } from './EditRoleModal'
import { TimeOffModal } from './TimeOffModal'
import { calendarLink, shiftsLink } from '../lib/members'

/**
 * Row / drawer "Actions" for a team member (team.md §1.4, §3) plus the
 * modals they open. Render `modals` once in the component that uses it.
 */
export function useMemberActions(options: { onArchived?: () => void; onDeleted?: () => void } = {}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [roleMember, setRoleMember] = useState<TeamMember | null>(null)
  const [timeOffFor, setTimeOffFor] = useState<string | null>(null)

  const archive = async (m: TeamMember) => {
    const ok = await confirm({ title: t('team.archive.title'), body: t('team.archive.body'), confirmLabel: t('team.common.confirm'), cancelLabel: t('team.common.goBack'), tone: 'primary' })
    if (!ok) return
    await archiveMember(m.id)
    toast(t('team.toasts.archived'))
    options.onArchived?.()
  }
  const unarchive = async (m: TeamMember) => {
    await unarchiveMember(m.id)
    toast(t('team.toasts.unarchived'))
  }
  const remove = async (m: TeamMember) => {
    const ok = await confirm({ title: t('team.delete.title'), body: t('team.delete.body'), confirmLabel: t('team.common.delete'), tone: 'danger' })
    if (!ok) return
    await deleteMember(m.id)
    toast(t('team.toasts.deleted'))
    options.onDeleted?.()
  }

  const items = (m: TeamMember, variant: 'list' | 'drawer' = 'list'): MenuItem[] => {
    if (m.archived) {
      return [
        { label: t('team.actions.unarchive'), onSelect: () => void unarchive(m) },
        { label: t('team.actions.delete'), danger: true, onSelect: () => void remove(m) },
      ]
    }
    const owner = m.role === 'owner'
    const list: MenuItem[] = [{ label: t('team.actions.edit'), onSelect: () => navigate(`/team/team-members/edit/${m.id}`) }]
    if (!owner && (variant === 'drawer' || !m.bookable)) list.push({ label: t('team.actions.editRole'), onSelect: () => setRoleMember(m) })
    if (m.bookable) list.push({ label: t('team.actions.viewCalendar'), onSelect: () => navigate(calendarLink(m)) })
    list.push({ label: t('team.actions.viewShifts'), onSelect: () => navigate(shiftsLink(m)) })
    list.push({ label: t('team.actions.addTimeOff'), onSelect: () => setTimeOffFor(m.id) })
    if (!owner) list.push({ label: t('team.actions.archive'), danger: true, onSelect: () => void archive(m) })
    return list
  }

  const modals: ReactNode = (
    <>
      <EditRoleModal member={roleMember} onClose={() => setRoleMember(null)} />
      <TimeOffModal open={timeOffFor !== null} memberId={timeOffFor} onClose={() => setTimeOffFor(null)} />
    </>
  )

  return { items, modals, openRole: setRoleMember, openTimeOff: setTimeOffFor }
}

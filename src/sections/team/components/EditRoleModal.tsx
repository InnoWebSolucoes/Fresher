import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TeamMember } from '@/types'
import type { PermissionRole } from '@/lib/permissions'
import { Button, Field, Modal, toast } from '@/components/ui'
import { inviteWouldSend, setMemberRole } from '@/api/team'
import { RoleSelect } from './RoleSelect'
import { memberName } from '../lib/members'

/** "Edit permission role for <name>" (team.md §1.4, team-05c). */
export function EditRoleModal({ member, onClose }: { member: TeamMember | null; onClose: () => void }) {
  if (!member) return null
  return <EditRoleForm key={member.id} member={member} onClose={onClose} />
}

function EditRoleForm({ member, onClose }: { member: TeamMember; onClose: () => void }) {
  const { t } = useTranslation()
  const [role, setRole] = useState<PermissionRole>(member.role)
  const [busy, setBusy] = useState(false)
  const willInvite = role !== member.role && inviteWouldSend(member.id, role, member.email)
  const confirmRole = async () => {
    setBusy(true)
    const { invited } = await setMemberRole(member.id, role)
    setBusy(false)
    toast(invited ? t('team.toasts.inviteSent') : t('team.toasts.roleUpdated'))
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={t('team.editRole.title', { name: memberName(member) })}
      subtitle={t('team.editRole.subtitle')}
      footer={
        <>
          <Button onClick={onClose}>{t('team.common.close')}</Button>
          <Button variant="primary" loading={busy} onClick={confirmRole}>
            {t('team.common.confirm')}
          </Button>
        </>
      }
    >
      <div className="pb-4">
        <Field label={t('team.form.settings.roleTitle')} hint={willInvite ? t('team.form.settings.inviteNotice', { email: member.email }) : undefined}>
          {(id) => <RoleSelect id={id} value={role} onChange={setRole} inline />}
        </Field>
      </div>
    </Modal>
  )
}

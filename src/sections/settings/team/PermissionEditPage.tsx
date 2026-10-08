import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { savePermissionRole } from '@/api/settings'
import { Button, EmptyState, PageSkeleton, confirm, usePageLoading } from '@/components/ui'
import type { PermissionLevel } from '@/types'
import { Banner } from '../components/ui'
import { useAction } from '../components/useAction'
import { isReadOnlyRole, normalizePermissions, resolvePermissions, samePermissions, type PermissionSet } from './catalogue'
import { describePermissions, markRoleSaved, useRoles, useSavedRoles } from './data'
import { PermissionMatrix } from './PermissionMatrix'
import { TeamFullPage } from './parts'

const LIST = '/setup/team/permissions'

/** Full-screen "Edit <Name> permission role" (settings-team.md §1, §8). */
export function PermissionEditPage() {
  const { roleId = '' } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const roles = useRoles()
  const role = roles.find((r) => r.id === roleId)
  if (!role) {
    return (
      <TeamFullPage onClose={() => navigate(LIST)}>
        <EmptyState title={t('settings.tm.edit.notFound')} action={<Button variant="primary" onClick={() => navigate(LIST)}>{t('settings.tm.edit.backToRoles')}</Button>} />
      </TeamFullPage>
    )
  }
  return <Editor key={role.id} role={role} />
}

function Editor({ role }: { role: PermissionLevel }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const saved = useSavedRoles()
  const loading = usePageLoading()
  const [initial] = useState<PermissionSet>(() => resolvePermissions(role, saved))
  const [draft, setDraft] = useState<PermissionSet>(initial)
  const [busy, run] = useAction()
  const readOnly = isReadOnlyRole(role)
  const dirty = !samePermissions(initial, draft)

  const leave = async (path: string) => {
    if (dirty && !(await confirm({ title: t('settings.tm.edit.discardTitle'), body: t('settings.tm.edit.discardBody'), confirmLabel: t('settings.tm.edit.discard'), tone: 'danger' }))) return
    navigate(path)
  }

  const save = () =>
    run(
      async () => {
        const custom = !['basic', 'low', 'medium', 'high'].includes(role.id)
        await savePermissionRole({ ...role, permissions: normalizePermissions(draft), description: custom ? describePermissions(draft, t) : role.description })
        await markRoleSaved(role.id)
      },
      t('settings.tm.edit.toast'),
      () => navigate(LIST),
    )

  return (
    <TeamFullPage onClose={() => void leave(LIST)} onSave={readOnly ? undefined : save} saving={busy} width="max-w-[1280px]" testId="permission-edit">
      {loading ? (
        <PageSkeleton rows={8} />
      ) : (
        <PermissionMatrix
          value={draft}
          onChange={readOnly ? undefined : setDraft}
          title={t('settings.tm.edit.title', { name: role.name })}
          subtitle={t('settings.tm.edit.subtitle')}
          note={readOnly ? <Banner tone="info">{t(role.id === 'owner' ? 'settings.tm.edit.ownerNote' : 'settings.tm.edit.noneNote')}</Banner> : undefined}
          onGoToInsights={() => void leave('/reports')}
        />
      )}
    </TeamFullPage>
  )
}

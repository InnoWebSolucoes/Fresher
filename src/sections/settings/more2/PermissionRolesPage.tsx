import { ArrowDown, ArrowUp, CircleCheck, Copy, ListOrdered, Pencil, ShieldCheck, Star, Trash2, UserPlus, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { createPermissionRole, deletePermissionRole, moveSettingsListItem, reorderSettingsList, savePermissionRole, updateSettings } from '@/api/settings'
import { Button, Checkbox, EmptyState, Field, RadioGroup, TextInput, confirm, type MenuGroup } from '@/components/ui'
import { fullName } from '@/lib/format'
import type { PermissionRole } from '@/lib/permissions'
import { useDb } from '@/store/db'
import type { ID, PermissionLevel, TeamMember } from '@/types'
import { FullModal } from '../components/FullModal'
import { OrderModal } from '../components/OrderModal'
import { ActionsPill, FormCard, ListCard, ListRow, ModalForm, PillMenu, SettingsPage } from '../components/ui'
import { useAction } from '../components/useAction'
import { normalizePermissions, resolvePermissions } from '../team/catalogue'
import {
  assignBuiltInRoleMembers,
  assignCustomRoleMembers,
  copyName,
  eligibleMembers,
  forgetCustomRole,
  isBuiltIn,
  markRoleSaved,
  nameTaken,
  useCustomMembers,
  useRoleMembers,
  useRoles,
  useSavedRoles,
} from '../team/data'
import { MemberAvatars, RoleIcon } from '../team/parts'

export const PERMISSIONS_BASE = '/setup/team/permissions'

type ModalState = { kind: 'rename' | 'members'; role: PermissionLevel } | { kind: 'order' } | { kind: 'default' } | null

/** Settings › Team › Permission roles (settings-team.md §1). */
export function PermissionRolesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const roles = useRoles()
  const membersByRole = useRoleMembers()
  const saved = useSavedRoles()
  const customMembers = useCustomMembers()
  const defaultRole = useDb((s) => s.settings.defaultRole)
  const [busy, run] = useAction()
  const [modal, setModal] = useState<ModalState>(null)
  const main = useMemo(() => roles.filter((r) => !r.system), [roles])
  const other = useMemo(() => roles.filter((r) => r.system), [roles])

  const duplicate = (role: PermissionLevel) =>
    run(async () => {
      const created = await createPermissionRole({
        name: copyName(roles, role.name, t('settings.more2.roles.copySuffix')),
        description: role.description,
        permissions: normalizePermissions(resolvePermissions(role, saved)),
      })
      await markRoleSaved(created.id)
    }, t('settings.more2.roles.toast.duplicated'))

  const remove = async (role: PermissionLevel) => {
    const ok = await confirm({
      title: t('settings.more2.roles.deleteTitle'),
      body: t('settings.more2.roles.deleteBody', { name: role.name }),
      confirmLabel: t('settings.common.delete'),
      cancelLabel: t('settings.common.cancel'),
      tone: 'danger',
    })
    if (!ok) return
    await run(async () => {
      if ((customMembers[role.id] ?? []).length) throw new Error(t('settings.more2.roles.deleteInUse'))
      await deletePermissionRole(role.id)
      await forgetCustomRole(role.id)
    }, t('settings.more2.roles.toast.deleted'))
  }

  const setDefault = (role: PermissionLevel) =>
    run(
      () =>
        updateSettings((s) => {
          s.defaultRole = role.id as PermissionRole
        }),
      t('settings.more2.roles.toast.defaultSet', { name: role.name }),
    )

  const groupsFor = (role: PermissionLevel, index: number): MenuGroup[] => {
    const edit = { label: t('settings.more2.roles.actions.editPermissions'), icon: <ShieldCheck size={16} />, onSelect: () => navigate(`${PERMISSIONS_BASE}/${role.id}/edit`) }
    const manage = { label: t('settings.more2.roles.actions.manageMembers'), icon: <Users size={16} />, onSelect: () => setModal({ kind: 'members', role }) }
    if (role.system) return [{ items: role.id === 'none' ? [edit, manage] : [edit] }]
    const builtIn = isBuiltIn(role.id)
    const next = roles[roles.indexOf(role) + 1]
    return [
      {
        items: [
          edit,
          manage,
          { label: t('settings.more2.roles.actions.rename'), icon: <Pencil size={16} />, onSelect: () => setModal({ kind: 'rename', role }) },
          { label: t('settings.more2.roles.actions.duplicate'), icon: <Copy size={16} />, onSelect: () => void duplicate(role), disabled: busy },
          {
            label: t('settings.more2.roles.actions.setDefault'),
            icon: <Star size={16} />,
            onSelect: () => void setDefault(role),
            disabled: busy || !builtIn || defaultRole === role.id,
            hint: !builtIn ? t('settings.more2.roles.defaultBuiltInOnly') : defaultRole === role.id ? t('settings.more2.roles.alreadyDefault') : undefined,
          },
          {
            label: t('settings.common.delete'),
            icon: <Trash2 size={16} />,
            danger: true,
            onSelect: () => void remove(role),
            disabled: busy || builtIn,
            hint: builtIn ? t('settings.more2.roles.builtInNoDelete') : undefined,
          },
        ],
      },
      {
        items: [
          { label: t('settings.common.moveUp'), icon: <ArrowUp size={16} />, onSelect: () => void run(() => moveSettingsListItem('permissionRoles', role.id, -1), t('settings.common.orderUpdated')), disabled: busy || index === 0 },
          { label: t('settings.common.moveDown'), icon: <ArrowDown size={16} />, onSelect: () => void run(() => moveSettingsListItem('permissionRoles', role.id, 1), t('settings.common.orderUpdated')), disabled: busy || !next || next.system },
        ],
      },
    ]
  }

  const row = (role: PermissionLevel, index: number) => {
    const members = membersByRole.get(role.id) ?? []
    return (
      <ListRow
        key={role.id}
        testId={`role-${role.id}`}
        leading={<RoleIcon roleId={role.id} />}
        title={
          <span className="flex items-center gap-2">
            <span className="min-w-0 md:truncate">{role.name}</span>
            {defaultRole === role.id && (
              <span className="inline-flex items-center gap-1 text-caption text-muted" title={t('settings.more2.roles.defaultBadge')}>
                <CircleCheck size={16} aria-hidden />
                <span className="sr-only">{t('settings.more2.roles.defaultBadge')}</span>
              </span>
            )}
          </span>
        }
        subtitle={
          <>
            {role.description}
            {/* Phones: the avatars sit under the description so the text keeps its width. */}
            {members.length > 0 && (
              <div className="mt-2 md:hidden">
                <MemberAvatars members={members} />
              </div>
            )}
          </>
        }
        trailing={
          <>
            <div className="hidden md:contents">
              <MemberAvatars members={members} />
            </div>
            <ActionsPill width={260} groups={groupsFor(role, index)} testId={`role-actions-${role.id}`} />
          </>
        }
      />
    )
  }

  return (
    <SettingsPage
      title={t('settings.more2.roles.title')}
      description={t('settings.more2.roles.description')}
      learnMore={t('settings.more2.roles.title')}
      actions={
        <>
          <PillMenu
            label={t('settings.common.options')}
            width={280}
            groups={[
              {
                items: [
                  { label: t('settings.common.changeOrder'), icon: <ListOrdered size={16} />, onSelect: () => setModal({ kind: 'order' }) },
                  { label: t('settings.more2.roles.editDefault'), icon: <Star size={16} />, onSelect: () => setModal({ kind: 'default' }) },
                ],
              },
            ]}
          />
          <Button variant="primary" onClick={() => navigate(`${PERMISSIONS_BASE}/add/add-permission-role`)} data-testid="roles-add">
            {t('settings.common.add')}
          </Button>
        </>
      }
    >
      <ListCard>{main.map((role, i) => row(role, i))}</ListCard>
      {other.length > 0 && (
        <ListCard>
          <h2 className="font-display text-title-3 text-ink">{t('settings.more2.roles.other')}</h2>
          {other.map((role, i) => row(role, main.length + i))}
        </ListCard>
      )}

      {modal?.kind === 'rename' && <RenameModal role={modal.role} roles={roles} onClose={() => setModal(null)} />}
      {modal?.kind === 'members' && <MembersModal role={modal.role} current={membersByRole.get(modal.role.id) ?? []} onClose={() => setModal(null)} />}
      {modal?.kind === 'default' && <DefaultRoleModal roles={main.filter((r) => isBuiltIn(r.id))} current={defaultRole} onClose={() => setModal(null)} />}
      <OrderModal
        open={modal?.kind === 'order'}
        onClose={() => setModal(null)}
        title={t('settings.more2.roles.orderTitle')}
        items={main.map((r) => ({ id: r.id, label: r.name, leading: <RoleIcon roleId={r.id} size={18} /> }))}
        saveLabel={t('settings.common.save')}
        onSave={async (ids) => {
          await run(
            () =>
              reorderSettingsList(
                'permissionRoles',
                [...ids, ...other.map((r) => r.id)],
              ),
            t('settings.common.orderUpdated'),
          )
        }}
      />
    </SettingsPage>
  )
}

function RenameModal({ role, roles, onClose }: { role: PermissionLevel; roles: PermissionLevel[]; onClose: () => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState(role.name)
  const [busy, run] = useAction()
  const trimmed = name.trim()
  const taken = trimmed !== '' && nameTaken(roles, trimmed, role.id)
  const save = () => {
    if (!trimmed || taken || trimmed === role.name) return
    void run(() => savePermissionRole({ ...role, name: trimmed }), t('settings.more2.roles.toast.renamed'), onClose)
  }
  return (
    <FullModal open onClose={onClose} title={t('settings.more2.roles.renameTitle')} subtitle={t('settings.more2.roles.renameSubtitle')} onSave={save} saving={busy} saveDisabled={!trimmed || taken || trimmed === role.name} testId="rename-modal">
      <FormCard>
        <ModalForm onSubmit={save}>
          <Field label={t('settings.more2.roles.name')} counter={{ value: name.length, max: 50 }} error={taken ? t('settings.more2.roles.nameTaken') : !trimmed ? t('settings.common.required') : undefined}>
            {(id) => <TextInput id={id} value={name} maxLength={50} onChange={(e) => setName(e.target.value)} invalid={taken || !trimmed} data-testid="rename-name" />}
          </Field>
        </ModalForm>
      </FormCard>
    </FullModal>
  )
}

function MembersModal({ role, current, onClose }: { role: PermissionLevel; current: TeamMember[]; onClose: () => void }) {
  const { t } = useTranslation()
  const all = useDb((s) => s.teamMembers)
  const roles = useRoles()
  const membersByRole = useRoleMembers()
  const eligible = useMemo(() => eligibleMembers(all), [all])
  const [selected, setSelected] = useState<ID[]>(() => current.filter((m) => m.role !== 'owner').map((m) => m.id))
  const [picking, setPicking] = useState(current.length > 0)
  const [busy, run] = useAction()
  const roleOf = (memberId: ID) => {
    for (const [roleId, list] of membersByRole) if (list.some((m) => m.id === memberId)) return roles.find((r) => r.id === roleId)?.name
    return undefined
  }
  const toggle = (id: ID, on: boolean) => setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)))
  const save = () =>
    run(
      () => (isBuiltIn(role.id) || role.id === 'none' ? assignBuiltInRoleMembers(role.id as PermissionRole, selected) : assignCustomRoleMembers(role.id, selected)),
      t('settings.more2.roles.toast.membersUpdated'),
      onClose,
    )
  return (
    <FullModal
      open
      onClose={onClose}
      title={t('settings.more2.roles.membersTitle', { name: role.name })}
      subtitle={role.description}
      onSave={() => void save()}
      saving={busy}
      saveDisabled={!picking && current.length === 0}
      testId="members-modal"
    >
      {!picking ? (
        <div className="card">
          <EmptyState
            icon={<Users size={24} aria-hidden />}
            title={t('settings.more2.roles.noMembersTitle')}
            body={t('settings.more2.roles.noMembersBody', { name: role.name })}
            action={
              <Button variant="primary" icon={<UserPlus size={16} aria-hidden />} onClick={() => setPicking(true)}>
                {t('settings.more2.roles.addMember')}
              </Button>
            }
          />
        </div>
      ) : eligible.length === 0 ? (
        <p className="card px-6 py-10 text-center text-body text-muted">{t('settings.more2.roles.noEligible')}</p>
      ) : (
        <ul className="card flex flex-col divide-y divide-line px-6">
          {eligible.map((m) => {
            const currentRole = roleOf(m.id)
            return (
              <li key={m.id} className="py-4">
                <Checkbox
                  checked={selected.includes(m.id)}
                  onChange={(on) => toggle(m.id, on)}
                  label={fullName(m)}
                  hint={currentRole ? t('settings.more2.roles.currentRole', { role: currentRole }) : undefined}
                />
              </li>
            )
          })}
        </ul>
      )}
    </FullModal>
  )
}

function DefaultRoleModal({ roles, current, onClose }: { roles: PermissionLevel[]; current: PermissionRole; onClose: () => void }) {
  const { t } = useTranslation()
  const [value, setValue] = useState<string>(current)
  const [busy, run] = useAction()
  const save = () =>
    run(
      () =>
        updateSettings((s) => {
          s.defaultRole = value as PermissionRole
        }),
      t('settings.more2.roles.toast.defaultUpdated'),
      onClose,
    )
  return (
    <FullModal open onClose={onClose} title={t('settings.more2.roles.editDefault')} subtitle={t('settings.more2.roles.editDefaultSubtitle')} onSave={() => void save()} saving={busy} saveDisabled={value === current} testId="default-role-modal">
      <RadioGroup variant="cards" name="default-role" value={value} onChange={setValue} options={roles.map((r) => ({ value: r.id, label: r.name, hint: r.description }))} />
    </FullModal>
  )
}

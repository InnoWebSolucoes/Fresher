import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { createPermissionRole } from '@/api/settings'
import { Checkbox, Field, Switch, TextInput, confirm } from '@/components/ui'
import { fullName } from '@/lib/format'
import { useDb } from '@/store/db'
import type { ID } from '@/types'
import { useAction } from '../components/useAction'
import { PERMISSION_AREAS, defaultPermissions, isAreaActive, normalizePermissions, toggleArea, type PermissionSet } from '../team/catalogue'
import { assignCustomRoleMembers, describePermissions, eligibleMembers, markRoleSaved, nameTaken, useRoleMembers, useRoles } from '../team/data'
import { StepCrumbs, TeamFullPage } from '../team/parts'
import { PERMISSIONS_BASE } from './PermissionRolesPage'

const STEPS = ['add-permission-role', 'choose-permissions', 'choose-team-members'] as const

/** Add permission role wizard: name → permissions → team members (settings-team.md §1 "Add"). */
export function PermissionAddPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { step: slug = STEPS[0] } = useParams()
  const roles = useRoles()
  const membersByRole = useRoleMembers()
  const allMembers = useDb((s) => s.teamMembers)
  const eligible = useMemo(() => eligibleMembers(allMembers), [allMembers])
  const [name, setName] = useState('')
  const [touched, setTouched] = useState(false)
  const [perms, setPerms] = useState<PermissionSet>(() => defaultPermissions('custom'))
  const [members, setMembers] = useState<ID[]>([])
  const [busy, run] = useAction()

  const index = Math.max(0, STEPS.indexOf(slug as (typeof STEPS)[number]))
  const trimmed = name.trim()
  const taken = trimmed !== '' && nameTaken(roles, trimmed)
  const nameError = taken ? t('settings.more2.roles.nameTaken') : touched && !trimmed ? t('settings.common.required') : undefined

  // Deep links past step 1 without a name go back to the start.
  useEffect(() => {
    if (index > 0 && !trimmed) navigate(`${PERMISSIONS_BASE}/add/${STEPS[0]}`, { replace: true })
  }, [index, trimmed, navigate])

  const go = (i: number) => navigate(`${PERMISSIONS_BASE}/add/${STEPS[i]}`)
  const dirty = trimmed !== '' || members.length > 0

  const close = async () => {
    if (dirty && !(await confirm({ title: t('settings.tm.edit.discardTitle'), body: t('settings.tm.edit.discardBody'), confirmLabel: t('settings.tm.edit.discard'), cancelLabel: t('settings.common.cancel'), tone: 'danger' }))) return
    navigate(PERMISSIONS_BASE)
  }

  const create = () =>
    run(
      async () => {
        const role = await createPermissionRole({ name: trimmed, description: describePermissions(perms, t), permissions: normalizePermissions(perms) })
        await markRoleSaved(role.id)
        if (members.length) await assignCustomRoleMembers(role.id, members)
      },
      t('settings.more2.add.toast'),
      () => navigate(PERMISSIONS_BASE),
    )

  const next = () => {
    if (index === 0) {
      setTouched(true)
      if (!trimmed || taken) return
      go(1)
    } else if (index === 1) go(2)
    else void create()
  }

  const roleName = (memberId: ID) => {
    for (const [roleId, list] of membersByRole) if (list.some((m) => m.id === memberId)) return roles.find((r) => r.id === roleId)?.name
    return undefined
  }
  const allSelected = eligible.length > 0 && eligible.every((m) => members.includes(m.id))
  const stepLabels = [t('settings.more2.add.step1'), t('settings.more2.add.step2'), t('settings.more2.add.step3')]
  const headings = [
    [t('settings.more2.add.step1'), t('settings.more2.add.step1Subtitle')],
    [t('settings.more2.add.step2'), t('settings.more2.add.step2Subtitle', { name: trimmed })],
    [t('settings.more2.add.step3'), t('settings.more2.add.step3Subtitle', { name: trimmed })],
  ][index]

  return (
    <TeamFullPage
      step={{ total: 3, current: index }}
      onBack={index > 0 ? () => go(index - 1) : undefined}
      onClose={() => void close()}
      onSave={next}
      saving={busy}
      saveDisabled={index === 0 && (!trimmed || taken)}
      saveLabel={index === 2 ? t('settings.more2.add.create') : t('settings.common.continue')}
      testId="permission-add"
    >
      <StepCrumbs steps={stepLabels} current={index} onSelect={go} />
      <h1 className="font-display text-[34px] font-bold leading-[42px] text-ink">{headings[0]}</h1>
      <p className="mt-2 text-body-lg text-muted">{headings[1]}</p>
      <div className="mt-8">
        {index === 0 && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              next()
            }}
          >
            <Field label={t('settings.more2.roles.name')} counter={{ value: name.length, max: 50 }} error={nameError}>
              {(id) => (
                <TextInput
                  id={id}
                  value={name}
                  maxLength={50}
                  placeholder={t('settings.more2.add.namePlaceholder')}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setTouched(true)}
                  invalid={Boolean(nameError)}
                  data-autofocus
                  data-testid="role-name"
                />
              )}
            </Field>
          </form>
        )}
        {index === 1 && (
          <>
            <ul className="card divide-y divide-line">
              {PERMISSION_AREAS.map((area) => {
                const Icon = area.icon
                const on = isAreaActive(perms, area.key)
                return (
                  <li key={area.key} className="flex items-center gap-4 px-5 py-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-sunken text-ink">
                      <Icon size={18} aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-body-strong text-ink">{t(`settings.tm.perm.${area.key}.title`)}</p>
                      <p className="text-small text-muted">{t(`settings.tm.perm.${area.key}.description`)}</p>
                    </div>
                    <Switch checked={on} onChange={(v) => setPerms((p) => toggleArea(p, area.key, v))} label={<span className="sr-only">{t('settings.tm.matrix.activeSwitch', { area: t(`settings.tm.perm.${area.key}.title`) })}</span>} />
                  </li>
                )
              })}
            </ul>
            <p className="mt-4 text-small text-muted">{describePermissions(perms, t)}</p>
            <p className="mt-1 text-small text-muted">{t('settings.more2.add.fineTune')}</p>
          </>
        )}
        {index === 2 &&
          (eligible.length === 0 ? (
            <p className="card px-6 py-10 text-center text-body text-muted">{t('settings.more2.roles.noEligible')}</p>
          ) : (
            <div className="card">
              <div className="border-b border-line px-5 py-4">
                <Checkbox checked={allSelected} onChange={(on) => setMembers(on ? eligible.map((m) => m.id) : [])} label={t('settings.more2.add.selectAll', { count: eligible.length })} />
              </div>
              <ul className="divide-y divide-line">
                {eligible.map((m) => {
                  const current = roleName(m.id)
                  return (
                    <li key={m.id} className="px-5 py-3">
                      <Checkbox
                        checked={members.includes(m.id)}
                        onChange={(on) => setMembers((list) => (on ? [...list, m.id] : list.filter((x) => x !== m.id)))}
                        label={fullName(m)}
                        hint={current ? t('settings.more2.roles.currentRole', { role: current }) : undefined}
                      />
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
      </div>
    </TeamFullPage>
  )
}

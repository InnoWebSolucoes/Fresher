import { ArrowDown, ArrowUp, CalendarOff, ListOrdered, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { reorderTimeOffTypes, updateSettings } from '@/api/settings'
import { Button, Field, TextInput, confirm } from '@/components/ui'
import { uid } from '@/lib/ids'
import { db, useDb } from '@/store/db'
import type { TimeOffType } from '@/types'
import { FullModal } from '../components/FullModal'
import { OrderModal } from '../components/OrderModal'
import { ActionsPill, FormCard, ListCard, ListRow, LockMark, ModalForm, PillMenu, SettingsPage } from '../components/ui'
import { OverlayOptions, deleteItem } from '../scheduling/shared'
import { useAction } from '../components/useAction'

type ModalState = { kind: 'add' } | { kind: 'edit'; type: TimeOffType } | { kind: 'order' } | null

/** Settings › Team › Time off types (settings-team.md §2). */
export function TimeOffTypesPage() {
  const { t } = useTranslation()
  const types = useDb((s) => s.settings.timeOffTypes)
  const [modal, setModal] = useState<ModalState>(null)
  const [busy, run] = useAction()

  const move = (index: number, dir: -1 | 1) => {
    const ids = types.map((x) => x.id)
    const target = index + dir
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    void run(() => reorderTimeOffTypes(ids), t('settings.common.orderUpdated'))
  }

  const remove = async (type: TimeOffType, after?: () => void) => {
    const used = db().timeOff.filter((x) => x.typeId === type.id).length
    const ok = await confirm({
      title: t('settings.more2.timeOff.deleteTitle'),
      body: used ? t('settings.more2.timeOff.deleteBodyUsed', { name: type.name, count: used }) : t('settings.more2.timeOff.deleteBody', { name: type.name }),
      confirmLabel: t('settings.common.delete'),
      cancelLabel: t('settings.common.cancel'),
      tone: 'danger',
    })
    if (!ok) return
    await run(
      () =>
        updateSettings((s) => {
          s.timeOffTypes = s.timeOffTypes.filter((x) => x.id !== type.id)
        }),
      t('settings.more2.timeOff.toast.deleted'),
      after,
    )
  }

  return (
    <SettingsPage
      title={t('settings.more2.timeOff.title')}
      description={t('settings.more2.timeOff.description')}
      learnMore={t('settings.more2.timeOff.title')}
      actions={
        <>
          <PillMenu label={t('settings.common.options')} width={220} groups={[{ items: [{ label: t('settings.common.changeOrder'), icon: <ListOrdered size={16} />, onSelect: () => setModal({ kind: 'order' }) }] }]} />
          <Button variant="primary" onClick={() => setModal({ kind: 'add' })} data-testid="time-off-add">
            {t('settings.common.add')}
          </Button>
        </>
      }
    >
      <ListCard>
        {types.map((type, i) => (
          <ListRow
            key={type.id}
            testId={`time-off-type-${type.id}`}
            leading={<CalendarOff size={20} className="text-primary" aria-hidden />}
            title={type.name}
            subtitle={type.system ? t('settings.common.system') : undefined}
            onClick={type.system ? undefined : () => setModal({ kind: 'edit', type })}
            trailing={
              type.system ? (
                <LockMark label={t('settings.more2.timeOff.systemHint')} />
              ) : (
                <ActionsPill
                  groups={[
                    {
                      items: [
                        { label: t('settings.common.edit'), icon: <Pencil size={16} />, onSelect: () => setModal({ kind: 'edit', type }) },
                        { label: t('settings.common.delete'), icon: <Trash2 size={16} />, danger: true, onSelect: () => void remove(type), disabled: busy },
                      ],
                    },
                    {
                      items: [
                        { label: t('settings.common.moveUp'), icon: <ArrowUp size={16} />, onSelect: () => move(i, -1), disabled: busy || i === 0 },
                        { label: t('settings.common.moveDown'), icon: <ArrowDown size={16} />, onSelect: () => move(i, 1), disabled: busy || i === types.length - 1 },
                      ],
                    },
                  ]}
                />
              )
            }
          />
        ))}
      </ListCard>

      {(modal?.kind === 'add' || modal?.kind === 'edit') && (
        <TypeModal type={modal.kind === 'edit' ? modal.type : null} types={types} onClose={() => setModal(null)} onDelete={(type) => void remove(type, () => setModal(null))} />
      )}
      <OrderModal
        open={modal?.kind === 'order'}
        onClose={() => setModal(null)}
        title={t('settings.more2.timeOff.orderTitle')}
        items={types.map((x) => ({ id: x.id, label: x.name }))}
        onSave={async (ids) => {
          await run(() => reorderTimeOffTypes(ids), t('settings.common.orderUpdated'))
        }}
      />
    </SettingsPage>
  )
}

function TypeModal({ type, types, onClose, onDelete }: { type: TimeOffType | null; types: TimeOffType[]; onClose: () => void; onDelete: (type: TimeOffType) => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState(type?.name ?? '')
  const [touched, setTouched] = useState(false)
  const [busy, run] = useAction()
  const trimmed = name.trim()
  const taken = types.some((x) => x.id !== type?.id && x.name.trim().toLowerCase() === trimmed.toLowerCase())
  const error = taken ? t('settings.more2.timeOff.nameTaken') : touched && !trimmed ? t('settings.common.required') : undefined

  const save = () => {
    setTouched(true)
    if (!trimmed || taken) return
    void run(
      () =>
        updateSettings((s) => {
          if (type) {
            const item = s.timeOffTypes.find((x) => x.id === type.id)
            if (item) item.name = trimmed
          } else s.timeOffTypes.push({ id: uid('to'), name: trimmed, system: false })
        }),
      t(type ? 'settings.more2.timeOff.toast.updated' : 'settings.more2.timeOff.toast.added'),
      onClose,
    )
  }

  return (
    <FullModal
      open
      onClose={onClose}
      title={t(type ? 'settings.more2.timeOff.editTitle' : 'settings.more2.timeOff.addTitle')}
      subtitle={type ? undefined : t('settings.more2.timeOff.addSubtitle')}
      onSave={save}
      saving={busy}
      saveLabel={type ? undefined : t('settings.common.add')}
      actions={type && <OverlayOptions groups={[{ items: [deleteItem(t('settings.common.delete'), () => onDelete(type))] }]} />}
      testId="time-off-modal"
    >
      <FormCard>
        <ModalForm onSubmit={save}>
          <Field label={t('settings.more2.timeOff.reason')} error={error} counter={{ value: name.length, max: 50 }}>
            {(id) => <TextInput id={id} value={name} maxLength={50} placeholder={t('settings.more2.timeOff.reasonPlaceholder')} onChange={(e) => setName(e.target.value)} onBlur={() => setTouched(true)} invalid={Boolean(error)} data-testid="time-off-name" />}
          </Field>
        </ModalForm>
      </FormCard>
    </FullModal>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Field, Modal, TextArea, TextInput } from '@/components/ui'
import { resourceTypesApi } from '@/api/settings'
import { useDb } from '@/store/db'
import type { ResourceType } from '@/types'
import { IconPicker } from '../components/pickers'
import { useAction } from '../components/useAction'

const K = 'settings.sched.resources'

/**
 * "New resource type" dialog (settings-scheduling.md §4: Choose name and
 * icon 0/255, Description (Optional) 0/1000, Add disabled until a name is
 * entered). Also used to edit a type.
 */
export function ResourceTypeModal({ type, initialName = '', initialIcon = 'door-open', onClose, onSaved }: { type: ResourceType | null; initialName?: string; initialIcon?: string; onClose: () => void; onSaved?: (type: ResourceType) => void }) {
  const { t } = useTranslation()
  const types = useDb((s) => s.resourceTypes)
  const [name, setName] = useState(type?.name ?? initialName)
  const [icon, setIcon] = useState(type?.icon ?? initialIcon)
  const [description, setDescription] = useState(type?.description ?? '')
  const [saving, run] = useAction()
  const nameRef = useRef<HTMLInputElement>(null)
  // The dialog focuses its first control (the icon button); start in the name field instead.
  useEffect(() => {
    const timer = window.setTimeout(() => nameRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [])
  const trimmed = name.trim()
  const duplicate = types.some((x) => x.id !== type?.id && x.name.trim().toLowerCase() === trimmed.toLowerCase())

  const save = () => {
    if (!trimmed || duplicate) return
    const input = { name: trimmed, icon, description: description.trim() }
    void run(
      async () => {
        if (type) {
          await resourceTypesApi.update(type.id, input)
          onSaved?.({ ...type, ...input })
        } else {
          const created = await resourceTypesApi.create(input)
          onSaved?.(created)
        }
      },
      t(type ? `${K}.typeUpdated` : `${K}.typeCreated`),
      onClose,
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t(type ? `${K}.editTypeTitle` : `${K}.newTypeTitle`)}
      footer={
        <Button variant="primary" className="px-6" disabled={!trimmed || duplicate} loading={saving} onClick={save} data-testid="resource-type-save">
          {t(type ? 'settings.common.save' : 'settings.common.add')}
        </Button>
      }
    >
      <form
        className="flex flex-col gap-5 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <Field label={t(`${K}.typeNameIcon`)} counter={{ value: name.length, max: 255 }} error={duplicate ? t(`${K}.typeDuplicate`) : undefined}>
          {(id) => (
            <div className="flex gap-2.5">
              <IconPicker value={icon} onChange={setIcon} />
              <TextInput ref={nameRef} id={id} className="flex-1" value={name} maxLength={255} invalid={duplicate} placeholder={t(`${K}.typeNamePlaceholder`)} onChange={(e) => setName(e.target.value)} data-testid="resource-type-name" />
            </div>
          )}
        </Field>
        <Field label={t(`${K}.descriptionLabel`)} optional counter={{ value: description.length, max: 1000 }}>
          {(id) => <TextArea id={id} value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
      </form>
    </Modal>
  )
}

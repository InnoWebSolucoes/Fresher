import { CalendarOff, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, EmptyState, Field, Select, TextInput, confirm } from '@/components/ui'
import { blockedTimeTypesApi } from '@/api/settings'
import { useDb } from '@/store/db'
import { durationLong } from '@/lib/time'
import type { BlockedTimeType } from '@/types'
import { ActionsPill, FormCard, ListCard, ListRow, SettingsPage } from '../components/ui'
import { FullModal } from '../components/FullModal'
import { EmojiPicker } from '../components/pickers'
import { useAction, useDraft } from '../components/useAction'
import { BLOCK_DURATIONS, durationOption, withValue } from './options'
import { OverlayOptions, deleteItem, rowActions } from './shared'

const K = 'settings.sched.btt'
const DEFAULT_EMOJI = '🕒'

/** Settings › Scheduling › Blocked time types (settings-scheduling.md §3). */
export function BlockedTimeTypesPage() {
  const { t } = useTranslation()
  const types = useDb((s) => s.blockedTimeTypes)
  const [editing, setEditing] = useState<BlockedTimeType | 'new' | null>(null)
  const [, run] = useAction()

  const remove = async (type: BlockedTimeType) => {
    const ok = await confirm({ title: t(`${K}.deleteTitle`), body: t(`${K}.deleteBody`, { name: type.name }), confirmLabel: t('settings.common.delete'), tone: 'danger' })
    if (!ok) return false
    return run(() => blockedTimeTypesApi.remove(type.id), t(`${K}.deleted`))
  }

  return (
    <SettingsPage
      title={t(`${K}.title`)}
      description={t(`${K}.description`)}
      learnMore="Blocked time types"
      actions={
        <Button variant="primary" onClick={() => setEditing('new')} data-testid="add-blocked-time-type">
          {t('settings.common.add')}
        </Button>
      }
    >
      {types.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<CalendarOff size={24} aria-hidden />}
            title={t(`${K}.emptyTitle`)}
            body={t(`${K}.emptyBody`)}
            action={
              <Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setEditing('new')}>
                {t(`${K}.addTitle`)}
              </Button>
            }
          />
        </div>
      ) : (
        <ListCard testId="blocked-time-types">
          {types.map((type) => (
            <ListRow
              key={type.id}
              testId={`btt-${type.id}`}
              leading={<span aria-hidden>{type.emoji || DEFAULT_EMOJI}</span>}
              title={type.name}
              subtitle={`${durationLong(type.durationMin)} • ${t(type.paid ? `${K}.paid` : `${K}.unpaid`)}`}
              onClick={() => setEditing(type)}
              trailing={<ActionsPill groups={rowActions(t, { onEdit: () => setEditing(type), onDelete: () => void remove(type) })} />}
            />
          ))}
        </ListCard>
      )}
      {editing && <BlockedTimeTypeModal type={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDelete={remove} />}
    </SettingsPage>
  )
}

function BlockedTimeTypeModal({ type, onClose, onDelete }: { type: BlockedTimeType | null; onClose: () => void; onDelete: (type: BlockedTimeType) => Promise<boolean> }) {
  const { t } = useTranslation()
  const [draft, patch] = useDraft({ emoji: type?.emoji ?? '', name: type?.name ?? '', durationMin: type?.durationMin ?? 60, paid: type?.paid ?? true })
  const [error, setError] = useState('')
  const [saving, run] = useAction()
  const save = () => {
    const name = draft.name.trim()
    if (!name) {
      setError(t(`${K}.nameRequired`))
      return
    }
    const record = { emoji: draft.emoji || DEFAULT_EMOJI, name, durationMin: draft.durationMin, paid: draft.paid }
    void run(() => (type ? blockedTimeTypesApi.update(type.id, record) : blockedTimeTypesApi.create(record)), t(type ? `${K}.updated` : `${K}.added`), onClose)
  }
  return (
    <FullModal
      open
      onClose={onClose}
      title={t(type ? `${K}.editTitle` : `${K}.addTitle`)}
      subtitle={type ? undefined : t(`${K}.addSubtitle`)}
      onSave={save}
      saveLabel={type ? undefined : t('settings.common.add')}
      saving={saving}
      actions={type && <OverlayOptions groups={[{ items: [deleteItem(t('settings.common.delete'), () => void onDelete(type).then((ok) => ok && onClose()))] }]} />}
      testId="blocked-time-type-modal"
    >
      <FormCard>
        <Field label={t(`${K}.type`)} error={error}>
          {(id) => (
            <div className="flex gap-2.5">
              <EmojiPicker value={draft.emoji} onChange={(emoji) => patch({ emoji })} />
              <TextInput
                id={id}
                className="flex-1"
                value={draft.name}
                maxLength={100}
                invalid={Boolean(error)}
                placeholder={t(`${K}.typePlaceholder`)}
                onChange={(e) => {
                  patch({ name: e.target.value })
                  if (error) setError('')
                }}
                data-testid="btt-name"
              />
            </div>
          )}
        </Field>
        <Field label={t(`${K}.duration`)}>
          {(id) => (
            <Select
              id={id}
              value={String(draft.durationMin)}
              onChange={(e) => patch({ durationMin: Number(e.target.value) })}
              options={withValue(BLOCK_DURATIONS, draft.durationMin).map((m) => ({ value: String(m), label: durationOption(t, m) }))}
            />
          )}
        </Field>
        <Field label={t(`${K}.compensation`)}>
          {(id) => (
            <Select
              id={id}
              value={draft.paid ? 'paid' : 'unpaid'}
              onChange={(e) => patch({ paid: e.target.value === 'paid' })}
              options={[
                { value: 'paid', label: t(`${K}.paid`) },
                { value: 'unpaid', label: t(`${K}.unpaid`) },
              ]}
            />
          )}
        </Field>
      </FormCard>
    </FullModal>
  )
}

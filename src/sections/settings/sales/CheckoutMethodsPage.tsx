import { Banknote, ChevronDown, ChevronUp, CircleDollarSign, Pencil, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Checkbox, EmptyState, Field, TextInput, confirm } from '@/components/ui'
import { moveSettingsListItem, reorderSettingsList, updateSettings } from '@/api/settings'
import { uid } from '@/lib/ids'
import type { CustomPaymentMethod } from '@/types'
import { ActionsPill, ActiveLabel, FormCard, ListCard, ListRow, LockMark, ModalForm, PillMenu, SettingsPage } from '../components/ui'
import { FullModal } from '../components/FullModal'
import { OverlayOptions, deleteItem } from '../scheduling/shared'
import { OrderModal } from '../components/OrderModal'
import { useAction } from '../components/useAction'
import { useSettings } from '../hooks'

const NAME_MAX = 40

/** Settings › Sales › Custom checkout methods (settings-sales.md §8). */
export function CheckoutMethodsPage() {
  const { t } = useTranslation()
  const methods = useSettings().customPaymentMethods
  const sorted = useMemo(() => [...methods].sort((a, b) => a.order - b.order), [methods])
  const [editing, setEditing] = useState<CustomPaymentMethod | 'new' | null>(null)
  const [orderOpen, setOrderOpen] = useState(false)
  const [, run] = useAction()

  const remove = async (m: CustomPaymentMethod): Promise<boolean> => {
    const ok = await confirm({ title: t('settings.sale.methods.deleteTitle'), body: t('settings.sale.methods.deleteBody', { name: m.name }), confirmLabel: t('settings.common.delete'), tone: 'danger' })
    if (!ok) return false
    return run(
      () =>
        updateSettings((s) => {
          s.customPaymentMethods = s.customPaymentMethods
            .filter((x) => x.id !== m.id)
            .sort((a, b) => a.order - b.order)
            .map((x, i) => ({ ...x, order: i }))
        }),
      t('settings.sale.methods.deleted'),
    )
  }
  const move = (m: CustomPaymentMethod, direction: -1 | 1) => void run(() => moveSettingsListItem('customPaymentMethods', m.id, direction), t('settings.common.orderUpdated'))

  return (
    <SettingsPage
      title={t('settings.sale.methods.title')}
      description={t('settings.sale.methods.description')}
      learnMore={t('settings.sale.methods.title')}
      actions={
        <>
          <PillMenu label={t('settings.common.options')} width={220} groups={[{ items: [{ label: t('settings.common.changeOrder'), onSelect: () => setOrderOpen(true), disabled: sorted.length < 2 }] }]} />
          <Button variant="primary" onClick={() => setEditing('new')} data-testid="add-payment-method">
            {t('settings.common.add')}
          </Button>
        </>
      }
    >
      {sorted.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<CircleDollarSign size={26} aria-hidden />}
            title={t('settings.sale.methods.emptyTitle')}
            body={t('settings.sale.methods.emptyBody')}
            action={
              <Button variant="primary" onClick={() => setEditing('new')}>
                {t('settings.common.add')}
              </Button>
            }
          />
        </div>
      ) : (
        <ListCard>
          {sorted.map((m, index) => (
            <ListRow
              key={m.id}
              testId={`method-row-${m.id}`}
              leading={m.system ? <Banknote size={20} className="text-success" aria-hidden /> : <CircleDollarSign size={20} className="text-primary" aria-hidden />}
              title={m.name}
              subtitle={<ActiveLabel active={m.active} />}
              onClick={m.system ? undefined : () => setEditing(m)}
              trailing={
                m.system ? (
                  <LockMark label={t('settings.sale.methods.systemHint')} />
                ) : (
                  <ActionsPill
                    groups={[
                      {
                        items: [
                          { label: t('settings.common.edit'), icon: <Pencil size={16} />, onSelect: () => setEditing(m) },
                          { label: t('settings.common.delete'), icon: <Trash2 size={16} />, danger: true, onSelect: () => void remove(m) },
                        ],
                      },
                      {
                        items: [
                          { label: t('settings.common.moveUp'), icon: <ChevronUp size={16} />, disabled: index === 0, onSelect: () => move(m, -1) },
                          { label: t('settings.common.moveDown'), icon: <ChevronDown size={16} />, disabled: index === sorted.length - 1, onSelect: () => move(m, 1) },
                        ],
                      },
                    ]}
                  />
                )
              }
            />
          ))}
        </ListCard>
      )}

      <MethodModal editing={editing} onClose={() => setEditing(null)} methods={sorted} onDelete={remove} />
      <OrderModal
        open={orderOpen}
        onClose={() => setOrderOpen(false)}
        title={t('settings.sale.methods.orderTitle')}
        items={sorted.map((m) => ({ id: m.id, label: m.name, leading: m.system ? <Banknote size={18} className="text-success" aria-hidden /> : <CircleDollarSign size={18} className="text-primary" aria-hidden /> }))}
        onSave={async (ids) => {
          await run(() => reorderSettingsList('customPaymentMethods', ids), t('settings.common.orderUpdated'))
        }}
      />
    </SettingsPage>
  )
}

/** "Add payment method" / "Edit payment method". */
function MethodModal({ editing, onClose, methods, onDelete }: { editing: CustomPaymentMethod | 'new' | null; onClose: () => void; methods: CustomPaymentMethod[]; onDelete: (m: CustomPaymentMethod) => Promise<boolean> }) {
  const { t } = useTranslation()
  const isNew = editing === 'new'
  const current = editing && editing !== 'new' ? editing : null
  const [name, setName] = useState('')
  const [active, setActive] = useState(true)
  const [error, setError] = useState('')
  const [openedFor, setOpenedFor] = useState<CustomPaymentMethod | 'new' | null>(null)
  const [saving, run] = useAction()
  if (editing !== openedFor) {
    setOpenedFor(editing)
    setName(current?.name ?? '')
    setActive(current?.active ?? true)
    setError('')
  }
  const save = () => {
    const trimmed = name.trim()
    if (!trimmed) return setError(t('settings.sale.methods.nameRequired'))
    if (methods.some((m) => m.id !== current?.id && m.name.trim().toLowerCase() === trimmed.toLowerCase())) return setError(t('settings.sale.methods.nameTaken'))
    if (current)
      void run(
        () =>
          updateSettings((s) => {
            const item = s.customPaymentMethods.find((m) => m.id === current.id)
            if (item) {
              item.name = trimmed
              item.active = active
            }
          }),
        t('settings.sale.methods.updated'),
        onClose,
      )
    else
      void run(
        () =>
          updateSettings((s) => {
            const order = s.customPaymentMethods.reduce((max, m) => Math.max(max, m.order), -1) + 1
            s.customPaymentMethods.push({ id: uid('cpm'), name: trimmed, system: false, active: true, order })
          }),
        t('settings.sale.methods.created'),
        onClose,
      )
  }
  return (
    <FullModal
      open={editing !== null}
      onClose={onClose}
      title={isNew ? t('settings.sale.methods.addTitle') : t('settings.sale.methods.editTitle')}
      onSave={save}
      saving={saving}
      saveLabel={isNew ? t('settings.common.add') : undefined}
      actions={
        current && (
          <OverlayOptions
            groups={[
              {
                items: [
                  deleteItem(t('settings.common.delete'), async () => {
                    if (await onDelete(current)) onClose()
                  }),
                ],
              },
            ]}
          />
        )
      }
      testId="method-modal"
    >
      <FormCard>
        <ModalForm onSubmit={save}>
          <Field label={t('settings.sale.methods.name')} error={error}>
            {(id) => (
              <TextInput
                id={id}
                value={name}
                maxLength={NAME_MAX}
                placeholder={t('settings.sale.methods.namePlaceholder')}
                invalid={Boolean(error)}
                onChange={(e) => {
                  setError('')
                  setName(e.target.value)
                }}
                data-testid="method-name"
              />
            )}
          </Field>
          {current && <Checkbox label={t('settings.common.active')} hint={t('settings.sale.methods.activeHint')} checked={active} onChange={setActive} />}
        </ModalForm>
      </FormCard>
    </FullModal>
  )
}

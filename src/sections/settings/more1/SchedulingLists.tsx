import { CalendarOff, Info, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, EmptyState, Field, Select, TextInput, confirm } from '@/components/ui'
import { closedPeriodsApi, moveSettingsListItem, reorderSettingsList, updateSettings } from '@/api/settings'
import { uid } from '@/lib/ids'
import { fmtDayLong } from '@/lib/format'
import { todayISO } from '@/lib/time'
import { useDb } from '@/store/db'
import { PALETTE } from '@/styles/palette'
import type { CancellationReason, ClosedPeriod, CustomStatus, PaletteColor } from '@/types'
import { useLocations, useSettings } from '../hooks'
import { ActionsPill, Banner, FormCard, ListCard, ListRow, LockMark, ModalForm, PillMenu, SettingsPage } from '../components/ui'
import { FullModal } from '../components/FullModal'
import { OrderModal } from '../components/OrderModal'
import { ColorSwatches, IconFor, IconPicker } from '../components/pickers'
import { useAction } from '../components/useAction'
import { OverlayOptions, deleteItem, rowActions } from '../scheduling/shared'
import { M } from './shared'

const ORDER_UPDATED = 'settings.common.orderUpdated'

/** Options › Delete in the header of an edit form. */
function DeleteOptions({ onDelete }: { onDelete: () => void }) {
  const { t } = useTranslation()
  return <OverlayOptions groups={[{ items: [deleteItem(t('settings.common.delete'), onDelete)] }]} />
}

// ─── Cancellation reasons (§5) ───────────────────────────────────────────

const CR = `${M}.reasons`

export function CancellationReasonsPage() {
  const { t } = useTranslation()
  const raw = useSettings().cancellationReasons
  const reasons = useMemo(() => [...raw].sort((a, b) => a.order - b.order), [raw])
  const [editing, setEditing] = useState<CancellationReason | 'new' | null>(null)
  const [ordering, setOrdering] = useState(false)
  const [, run] = useAction()

  const remove = async (r: CancellationReason) => {
    const ok = await confirm({ title: t(`${CR}.deleteTitle`), body: t(`${CR}.deleteBody`, { name: r.name }), confirmLabel: t('settings.common.delete'), tone: 'danger' })
    if (!ok) return false
    return run(
      () =>
        updateSettings((s) => {
          s.cancellationReasons = s.cancellationReasons.filter((x) => x.id !== r.id)
        }),
      t(`${CR}.deleted`),
    )
  }

  return (
    <SettingsPage
      title={t(`${CR}.title`)}
      description={t(`${CR}.description`)}
      learnMore="Cancellation reasons"
      actions={
        <>
          <PillMenu label={t('settings.common.options')} width={200} groups={[{ items: [{ label: t('settings.common.changeOrder'), onSelect: () => setOrdering(true), disabled: reasons.length < 2 }] }]} />
          <Button variant="primary" onClick={() => setEditing('new')} data-testid="reason-add">
            {t('settings.common.add')}
          </Button>
        </>
      }
    >
      {reasons.length === 0 ? (
        <div className="card">
          <EmptyState title={t(`${CR}.emptyTitle`)} body={t(`${CR}.emptyBody`)} action={<Button variant="primary" onClick={() => setEditing('new')}>{t('settings.common.add')}</Button>} />
        </div>
      ) : (
        <ListCard testId="reasons-list">
          {reasons.map((r, i) => (
            <ListRow
              key={r.id}
              testId={`reason-${r.id}`}
              title={r.name}
              onClick={() => setEditing(r)}
              trailing={
                <ActionsPill
                  groups={rowActions(t, {
                    onEdit: () => setEditing(r),
                    onDelete: () => void remove(r),
                    move: {
                      canUp: i > 0,
                      canDown: i < reasons.length - 1,
                      onUp: () => void run(() => moveSettingsListItem('cancellationReasons', r.id, -1), t(ORDER_UPDATED)),
                      onDown: () => void run(() => moveSettingsListItem('cancellationReasons', r.id, 1), t(ORDER_UPDATED)),
                    },
                  })}
                />
              }
            />
          ))}
        </ListCard>
      )}
      {editing && <ReasonModal reason={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDelete={remove} />}
      <OrderModal
        open={ordering}
        onClose={() => setOrdering(false)}
        title={t(`${CR}.orderTitle`)}
        items={reasons.map((r) => ({ id: r.id, label: r.name }))}
        onSave={(ids) => run(() => reorderSettingsList('cancellationReasons', ids), t(ORDER_UPDATED))}
      />
    </SettingsPage>
  )
}

function ReasonModal({ reason, onClose, onDelete }: { reason: CancellationReason | null; onClose: () => void; onDelete: (r: CancellationReason) => Promise<boolean> }) {
  const { t } = useTranslation()
  const [name, setName] = useState(reason?.name ?? '')
  const [touched, setTouched] = useState(false)
  const [saving, run] = useAction()
  const error = touched && !name.trim() ? t('settings.common.required') : undefined
  const save = () => {
    setTouched(true)
    if (!name.trim()) return
    void run(
      () =>
        updateSettings((s) => {
          if (reason) {
            const item = s.cancellationReasons.find((x) => x.id === reason.id)
            if (item) item.name = name.trim()
          } else s.cancellationReasons.push({ id: uid('cr'), name: name.trim(), order: s.cancellationReasons.length })
        }),
      t(reason ? `${CR}.updated` : `${CR}.added`),
      onClose,
    )
  }
  return (
    <FullModal
      open
      onClose={onClose}
      title={t(reason ? `${CR}.editTitle` : `${CR}.addTitle`)}
      onSave={save}
      saving={saving}
      saveLabel={reason ? undefined : t('settings.common.add')}
      actions={reason && <DeleteOptions onDelete={() => void onDelete(reason).then((ok) => ok && onClose())} />}
      testId="reason-modal"
    >
      <FormCard>
        <ModalForm onSubmit={save}>
          <Field label={t(`${CR}.name`)} error={error}>
            {(id) => <TextInput id={id} value={name} maxLength={100} invalid={!!error} placeholder={t(`${CR}.namePlaceholder`)} onChange={(e) => setName(e.target.value)} data-testid="reason-name" />}
          </Field>
        </ModalForm>
      </FormCard>
    </FullModal>
  )
}

// ─── Appointment statuses (§6) ───────────────────────────────────────────

const ST = `${M}.statuses`

export function AppointmentStatusesPage() {
  const { t } = useTranslation()
  const raw = useSettings().appointmentStatuses
  const statuses = useMemo(() => [...raw].sort((a, b) => Number(b.system) - Number(a.system) || a.order - b.order), [raw])
  const custom = statuses.filter((s) => !s.system)
  const [editing, setEditing] = useState<CustomStatus | 'new' | null>(null)
  const [, run] = useAction()

  const remove = async (s: CustomStatus) => {
    const ok = await confirm({ title: t(`${ST}.deleteTitle`), body: t(`${ST}.deleteBody`, { name: s.name }), confirmLabel: t('settings.common.delete'), tone: 'danger' })
    if (!ok) return false
    return run(
      () =>
        updateSettings((d) => {
          d.appointmentStatuses = d.appointmentStatuses.filter((x) => x.id !== s.id)
        }),
      t(`${ST}.deleted`),
    )
  }
  const move = (s: CustomStatus, direction: -1 | 1) => {
    const ids = custom.map((x) => x.id)
    const index = ids.indexOf(s.id)
    const target = index + direction
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    const system = statuses.filter((x) => x.system).map((x) => x.id)
    void run(() => reorderSettingsList('appointmentStatuses', [...system, ...ids]), t(ORDER_UPDATED))
  }

  return (
    <SettingsPage
      title={t(`${ST}.title`)}
      description={t(`${ST}.description`)}
      learnMore="Appointment statuses"
      actions={
        <Button variant="primary" onClick={() => setEditing('new')} data-testid="status-add">
          {t('settings.common.add')}
        </Button>
      }
    >
      <ListCard testId="statuses-list">
        {statuses.map((s) => {
          const palette = PALETTE[s.color] ?? PALETTE.orange
          const index = custom.findIndex((x) => x.id === s.id)
          return (
            <ListRow
              key={s.id}
              testId={`status-${s.id}`}
              accent={palette.edge}
              tile={false}
              leading={
                <span className="flex h-11 w-11 items-center justify-center rounded-md" style={{ background: palette.fill, color: palette.text }}>
                  <IconFor name={s.icon} size={22} />
                </span>
              }
              title={s.name}
              subtitle={s.system ? t('settings.common.system') : undefined}
              onClick={s.system ? undefined : () => setEditing(s)}
              trailing={
                s.system ? (
                  <LockMark label={t(`${ST}.systemLocked`)} />
                ) : (
                  <ActionsPill
                    groups={rowActions(t, {
                      onEdit: () => setEditing(s),
                      onDelete: () => void remove(s),
                      move: { canUp: index > 0, canDown: index < custom.length - 1, onUp: () => move(s, -1), onDown: () => move(s, 1) },
                    })}
                  />
                )
              }
            />
          )
        })}
      </ListCard>
      {editing && <StatusModal status={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDelete={remove} />}
    </SettingsPage>
  )
}

function StatusModal({ status, onClose, onDelete }: { status: CustomStatus | null; onClose: () => void; onDelete: (s: CustomStatus) => Promise<boolean> }) {
  const { t } = useTranslation()
  const all = useSettings().appointmentStatuses
  const [name, setName] = useState(status?.name ?? '')
  const [icon, setIcon] = useState(status?.icon ?? 'star')
  const [color, setColor] = useState<PaletteColor>(status?.color ?? 'orange')
  const [touched, setTouched] = useState(false)
  const [saving, run] = useAction()
  const trimmed = name.trim()
  const duplicate = all.some((x) => x.id !== status?.id && x.name.trim().toLowerCase() === trimmed.toLowerCase())
  const error = touched && !trimmed ? t('settings.common.required') : duplicate ? t(`${ST}.duplicate`) : undefined
  const save = () => {
    setTouched(true)
    if (!trimmed || duplicate) return
    void run(
      () =>
        updateSettings((s) => {
          if (status) {
            const item = s.appointmentStatuses.find((x) => x.id === status.id)
            if (item) Object.assign(item, { name: trimmed, icon, color })
          } else s.appointmentStatuses.push({ id: uid('st'), name: trimmed, icon, color, system: false, order: s.appointmentStatuses.length })
        }),
      t(status ? `${ST}.updated` : `${ST}.added`),
      onClose,
    )
  }
  return (
    <FullModal
      open
      onClose={onClose}
      title={t(status ? `${ST}.editTitle` : `${ST}.addTitle`)}
      onSave={save}
      saving={saving}
      saveLabel={status ? undefined : t('settings.common.add')}
      actions={status && <DeleteOptions onDelete={() => void onDelete(status).then((ok) => ok && onClose())} />}
      testId="status-modal"
    >
      <FormCard>
        <ModalForm onSubmit={save}>
          <Field label={t(`${ST}.nameIcon`)} counter={{ value: name.length, max: 20 }} error={error}>
            {(id) => (
              <div className="flex gap-2.5">
                <IconPicker value={icon} onChange={setIcon} />
                <TextInput id={id} className="flex-1" value={name} maxLength={20} invalid={!!error} onChange={(e) => setName(e.target.value)} data-testid="status-name" />
              </div>
            )}
          </Field>
          <div>
            <p className="mb-2 text-body-strong text-ink">{t(`${ST}.color`)}</p>
            <ColorSwatches value={color} onChange={setColor} label={t(`${ST}.color`)} />
          </div>
        </ModalForm>
      </FormCard>
    </FullModal>
  )
}

// ─── Closed periods (§7) ─────────────────────────────────────────────────

const CP = `${M}.closed`

export function ClosedPeriodsPage() {
  const { t } = useTranslation()
  const raw = useDb((s) => s.closedPeriods)
  const locations = useLocations()
  const periods = useMemo(() => [...raw].sort((a, b) => a.startDate.localeCompare(b.startDate)), [raw])
  const [editing, setEditing] = useState<ClosedPeriod | 'new' | null>(null)
  const [, run] = useAction()

  const where = (p: ClosedPeriod) => (p.locationIds.length === 0 ? t('settings.common.allLocations') : p.locationIds.map((id) => locations.find((l) => l.id === id)?.name ?? id).join(', '))
  const when = (p: ClosedPeriod) => (p.startDate === p.endDate ? fmtDayLong(p.startDate) : `${fmtDayLong(p.startDate)} – ${fmtDayLong(p.endDate)}`)
  const remove = async (p: ClosedPeriod) => {
    const ok = await confirm({ title: t(`${CP}.deleteTitle`), body: t(`${CP}.deleteBody`, { name: p.description || when(p) }), confirmLabel: t('settings.common.delete'), tone: 'danger' })
    if (!ok) return false
    return run(() => closedPeriodsApi.remove(p.id), t(`${CP}.deleted`))
  }

  return (
    <SettingsPage
      title={t(`${CP}.title`)}
      description={t(`${CP}.description`)}
      learnMore="Closed periods"
      actions={
        <Button variant="primary" onClick={() => setEditing('new')} data-testid="closed-add">
          {t('settings.common.add')}
        </Button>
      }
    >
      {periods.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<CalendarOff size={28} aria-hidden />}
            title={t(`${CP}.emptyTitle`)}
            body={t(`${CP}.emptyBody`)}
            action={
              <Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setEditing('new')}>
                {t(`${CP}.addTitle`)}
              </Button>
            }
          />
        </div>
      ) : (
        <ListCard testId="closed-list">
          {periods.map((p) => (
            <ListRow
              key={p.id}
              testId={`closed-${p.id}`}
              title={when(p)}
              subtitle={
                <>
                  <span className="block text-ink">{p.description || '-'}</span>
                  <span className="block">{where(p)}</span>
                </>
              }
              onClick={() => setEditing(p)}
              trailing={<ActionsPill groups={rowActions(t, { onEdit: () => setEditing(p), onDelete: () => void remove(p) })} />}
            />
          ))}
        </ListCard>
      )}
      {editing && <ClosedModal period={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDelete={remove} />}
    </SettingsPage>
  )
}

function ClosedModal({ period, onClose, onDelete }: { period: ClosedPeriod | null; onClose: () => void; onDelete: (p: ClosedPeriod) => Promise<boolean> }) {
  const { t } = useTranslation()
  const locations = useLocations()
  const today = todayISO()
  const [start, setStart] = useState(period?.startDate ?? today)
  const [end, setEnd] = useState(period?.endDate ?? today)
  const [description, setDescription] = useState(period?.description ?? '')
  const [location, setLocation] = useState(period?.locationIds.length === 1 ? period.locationIds[0] : '')
  const [saving, run] = useAction()
  const rangeError = start && end && end < start ? t(`${CP}.endBeforeStart`) : undefined
  const save = () => {
    if (!start || !end || rangeError) return
    const input = { startDate: start, endDate: end, description: description.trim(), locationIds: location ? [location] : [] }
    void run(() => (period ? closedPeriodsApi.update(period.id, input) : closedPeriodsApi.create(input)), t(period ? `${CP}.updated` : `${CP}.added`), onClose)
  }
  return (
    <FullModal
      open
      onClose={onClose}
      title={t(period ? `${CP}.editTitle` : `${CP}.addTitle`)}
      subtitle={t(`${CP}.subtitle`)}
      onSave={save}
      saving={saving}
      saveDisabled={!start || !end || !!rangeError}
      saveLabel={period ? undefined : t('settings.common.add')}
      actions={period && <DeleteOptions onDelete={() => void onDelete(period).then((ok) => ok && onClose())} />}
      testId="closed-modal"
    >
      <FormCard>
        <ModalForm onSubmit={save}>
          <Banner tone="info">{t(`${CP}.info`)}</Banner>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t(`${CP}.start`)}>{(id) => <TextInput id={id} type="date" value={start} onChange={(e) => setStart(e.target.value)} data-testid="closed-start" />}</Field>
            <Field label={t(`${CP}.end`)} error={rangeError}>
              {(id) => <TextInput id={id} type="date" value={end} min={start} invalid={!!rangeError} onChange={(e) => setEnd(e.target.value)} data-testid="closed-end" />}
            </Field>
          </div>
          <Field label={t(`${CP}.descriptionLabel`)}>
            {(id) => <TextInput id={id} value={description} maxLength={100} placeholder={t(`${CP}.descriptionPlaceholder`)} onChange={(e) => setDescription(e.target.value)} data-testid="closed-description" />}
          </Field>
          {locations.length > 1 && (
            <Field label={t(`${CP}.location`)}>
              {(id) => <Select id={id} value={location} onChange={(e) => setLocation(e.target.value)} options={[{ value: '', label: t('settings.common.allLocations') }, ...locations.map((l) => ({ value: l.id, label: l.name }))]} />}
            </Field>
          )}
          <p className="flex items-center gap-2 text-small text-muted">
            <Info size={14} aria-hidden />
            {t(`${CP}.calendarHint`)}
          </p>
        </ModalForm>
      </FormCard>
    </FullModal>
  )
}

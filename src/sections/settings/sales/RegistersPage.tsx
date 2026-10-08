import { Archive, ArchiveRestore, ChevronDown, ChevronUp, Eye, Pencil, Store } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Checkbox, Chip, EmptyState, Field, MoneyInput, SearchInput, Select, TextInput, confirm, toast } from '@/components/ui'
import { createRegister, currentSession, updateRegister } from '@/api/register'
import { reorderRegisters } from '@/api/settings'
import { useDrawer } from '@/lib/drawer'
import { useDb } from '@/store/db'
import type { CashRegister, ID, RegisterSettings } from '@/types'
import { ActionsPill, FormCard, ListCard, ListRow, PillMenu, SectionHeading, SettingsPage } from '../components/ui'
import { FullModal } from '../components/FullModal'
import { OrderModal } from '../components/OrderModal'
import { useAction } from '../components/useAction'
import { useLocations } from '../hooks'

type Filter = 'active' | 'archived'
type FloatWhen = NonNullable<RegisterSettings['minFloat']>['when']

interface RegisterDraft {
  name: string
  locationId: ID
  requireOpen: boolean
  minFloatOn: boolean
  minFloatAmount: number | ''
  minFloatWhen: FloatWhen
  middayCounts: boolean
  promptLeftOpen: boolean
  autoPrint: boolean
  autoEmail: boolean
}

const NAME_MAX = 32

/** Settings › Sales › Registers (settings-sales.md §4). */
export function RegistersPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const drawer = useDrawer()
  const registers = useDb((s) => s.registers)
  const sessions = useDb((s) => s.registerSessions)
  const locations = useLocations()
  const [filter, setFilter] = useState<Filter>('active')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<CashRegister | 'new' | null>(null)
  const [reorderOpen, setReorderOpen] = useState(false)
  const [, run] = useAction()

  const locationName = (id: ID) => locations.find((l) => l.id === id)?.name ?? ''
  const sorted = useMemo(() => [...registers].sort((a, b) => a.order - b.order), [registers])
  const inFilter = useMemo(() => sorted.filter((r) => (filter === 'archived' ? r.archived : !r.archived)), [sorted, filter])
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return inFilter
    return inFilter.filter((r) => r.name.toLowerCase().includes(q) || (locations.find((l) => l.id === r.locationId)?.name ?? '').toLowerCase().includes(q))
  }, [inFilter, query, locations])
  const openIds = useMemo(() => new Set(sessions.filter((s) => !s.closedAt).map((s) => s.registerId)), [sessions])

  const view = (reg: CashRegister) => {
    const session = currentSession(reg.id) ?? [...sessions].filter((s) => s.registerId === reg.id).sort((a, b) => b.openedAt.localeCompare(a.openedAt))[0]
    if (session) drawer.open('register-period', { id: session.id })
    else toast(t('settings.sale.registers.neverOpened', { name: reg.name }))
  }

  const move = (reg: CashRegister, direction: -1 | 1) => {
    const index = inFilter.findIndex((r) => r.id === reg.id)
    const neighbour = inFilter[index + direction]
    if (!neighbour) return
    const ids = sorted.map((r) => r.id)
    const a = ids.indexOf(reg.id)
    const b = ids.indexOf(neighbour.id)
    ;[ids[a], ids[b]] = [ids[b], ids[a]]
    void run(() => reorderRegisters(ids), t('settings.common.orderUpdated'))
  }

  const archive = async (reg: CashRegister) => {
    if (!reg.archived && openIds.has(reg.id)) {
      toast(t('settings.sale.registers.closeFirst', { name: reg.name }), 'error')
      return
    }
    if (reg.archived) {
      await run(() => updateRegister(reg.id, { archived: false }), t('settings.sale.registers.unarchived'))
      return
    }
    const ok = await confirm({
      title: t('settings.sale.registers.archiveTitle'),
      body: t('settings.sale.registers.archiveBody', { name: reg.name }),
      confirmLabel: t('settings.sale.registers.archive'),
      tone: 'danger',
    })
    if (ok) await run(() => updateRegister(reg.id, { archived: true }), t('settings.sale.registers.archived'))
  }

  const actions = (
    <>
      <PillMenu
        label={t('settings.common.options')}
        groups={[
          {
            items: [
              { label: t('settings.sale.registers.goToSales'), onSelect: () => navigate('/sales/sales-list') },
              { label: t('settings.sale.registers.reorder'), onSelect: () => setReorderOpen(true), disabled: sorted.filter((r) => !r.archived).length < 2 },
            ],
          },
        ]}
      />
      <Button variant="primary" onClick={() => setEditing('new')} data-testid="add-register">
        {t('settings.common.add')}
      </Button>
    </>
  )

  return (
    <SettingsPage title={t('settings.sale.registers.title')} description={t('settings.sale.registers.description')} learnMore={t('settings.sale.registers.title')} actions={actions}>
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={query} onChange={setQuery} placeholder={t('settings.common.search')} className="max-w-[320px]" />
        <PillMenu
          label={filter === 'active' ? t('settings.common.active') : t('settings.sale.registers.archivedFilter')}
          align="left"
          width={200}
          groups={[
            {
              items: [
                { label: t('settings.common.active'), checked: filter === 'active', onSelect: () => setFilter('active') },
                { label: t('settings.sale.registers.archivedFilter'), checked: filter === 'archived', onSelect: () => setFilter('archived') },
              ],
            },
          ]}
        />
      </div>

      {visible.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Store size={26} aria-hidden />}
            title={query ? t('settings.common.noResults') : filter === 'archived' ? t('settings.sale.registers.emptyArchived') : t('settings.sale.registers.emptyTitle')}
            body={query ? undefined : filter === 'archived' ? t('settings.sale.registers.emptyArchivedBody') : t('settings.sale.registers.emptyBody')}
            action={
              query ? (
                <Button onClick={() => setQuery('')}>{t('settings.sale.registers.clearSearch')}</Button>
              ) : filter === 'archived' ? (
                <Button onClick={() => setFilter('active')}>{t('settings.sale.registers.showActive')}</Button>
              ) : (
                <Button variant="primary" onClick={() => setEditing('new')}>
                  {t('settings.common.add')}
                </Button>
              )
            }
          />
        </div>
      ) : (
        <ListCard>
          {visible.map((reg) => {
            const index = inFilter.findIndex((r) => r.id === reg.id)
            return (
              <ListRow
                key={reg.id}
                testId={`register-row-${reg.id}`}
                leading={<Store size={20} aria-hidden />}
                title={reg.name}
                subtitle={locationName(reg.locationId)}
                trailing={
                  <>
                    {!reg.archived && openIds.has(reg.id) && <Chip tone="success">{t('settings.sale.registers.open')}</Chip>}
                    {reg.archived && <Chip>{t('settings.sale.registers.archivedChip')}</Chip>}
                    <ActionsPill
                      groups={[
                        {
                          items: [
                            { label: t('settings.sale.registers.view'), icon: <Eye size={16} />, onSelect: () => view(reg) },
                            { label: t('settings.sale.registers.edit'), icon: <Pencil size={16} />, onSelect: () => setEditing(reg) },
                            reg.archived
                              ? { label: t('settings.sale.registers.unarchive'), icon: <ArchiveRestore size={16} />, onSelect: () => void archive(reg) }
                              : { label: t('settings.sale.registers.archive'), icon: <Archive size={16} />, onSelect: () => void archive(reg) },
                          ],
                        },
                        {
                          items: [
                            { label: t('settings.common.moveUp'), icon: <ChevronUp size={16} />, disabled: index <= 0, onSelect: () => move(reg, -1) },
                            { label: t('settings.common.moveDown'), icon: <ChevronDown size={16} />, disabled: index === -1 || index >= inFilter.length - 1, onSelect: () => move(reg, 1) },
                          ],
                        },
                      ]}
                    />
                  </>
                }
              />
            )
          })}
        </ListCard>
      )}

      <RegisterModal editing={editing} onClose={() => setEditing(null)} />
      <OrderModal
        open={reorderOpen}
        onClose={() => setReorderOpen(false)}
        title={t('settings.sale.registers.reorderTitle')}
        description={t('settings.sale.registers.reorderDescription')}
        saveLabel={t('settings.common.save')}
        items={sorted
          .filter((r) => !r.archived)
          .map((r) => ({
            id: r.id,
            label: (
              <span className="flex flex-col">
                <span className="truncate">{r.name}</span>
                <span className="truncate text-small font-normal text-muted">{locationName(r.locationId)}</span>
              </span>
            ),
          }))}
        onSave={(ids) => run(() => reorderRegisters([...ids, ...sorted.filter((r) => r.archived).map((r) => r.id)]), t('settings.common.orderUpdated'))}
      />
    </SettingsPage>
  )
}

const toDraft = (reg: CashRegister | null, locationId: ID): RegisterDraft => ({
  name: reg?.name ?? '',
  locationId: reg?.locationId ?? locationId,
  requireOpen: reg ? reg.settings.requireOpen : true,
  minFloatOn: Boolean(reg?.settings.minFloat),
  minFloatAmount: reg?.settings.minFloat?.amount ?? 50,
  minFloatWhen: reg?.settings.minFloat?.when ?? 'both',
  middayCounts: reg?.settings.middayCounts ?? false,
  promptLeftOpen: reg?.settings.promptLeftOpen ?? false,
  autoPrint: reg?.settings.autoPrint ?? false,
  autoEmail: reg?.settings.autoEmail ?? false,
})

/** "Set up register preferences" (Add) and "Edit cash register" (Edit register). */
function RegisterModal({ editing, onClose }: { editing: CashRegister | 'new' | null; onClose: () => void }) {
  const { t } = useTranslation()
  const locations = useLocations()
  const registers = useDb((s) => s.registers)
  const isNew = editing === 'new'
  const current = editing && editing !== 'new' ? editing : null
  const [draft, setDraft] = useState<RegisterDraft>(() => toDraft(null, locations[0]?.id ?? ''))
  const [openedFor, setOpenedFor] = useState<CashRegister | 'new' | null>(null)
  const [errors, setErrors] = useState<{ name?: string; amount?: string }>({})
  const [saving, run] = useAction()
  if (editing !== openedFor) {
    setOpenedFor(editing)
    if (editing) {
      setDraft(toDraft(current, locations[0]?.id ?? ''))
      setErrors({})
    }
  }
  const patch = (p: Partial<RegisterDraft>) => setDraft((d) => ({ ...d, ...p }))
  const locationName = locations.find((l) => l.id === draft.locationId)?.name ?? ''

  const save = () => {
    const errs: typeof errors = {}
    const name = draft.name.trim()
    if (!name) errs.name = t('settings.sale.registers.nameRequired')
    else if (registers.some((r) => r.id !== current?.id && !r.archived && r.locationId === draft.locationId && r.name.trim().toLowerCase() === name.toLowerCase())) errs.name = t('settings.sale.registers.nameTaken')
    if (draft.minFloatOn && (draft.minFloatAmount === '' || draft.minFloatAmount <= 0)) errs.amount = t('settings.sale.registers.amountRequired')
    setErrors(errs)
    if (Object.keys(errs).length) return
    const settings: RegisterSettings = {
      requireOpen: draft.requireOpen,
      minFloat: draft.minFloatOn ? { amount: Math.round(Number(draft.minFloatAmount) * 100) / 100, when: draft.minFloatWhen } : undefined,
      middayCounts: draft.middayCounts,
      promptLeftOpen: draft.promptLeftOpen,
      autoPrint: draft.autoPrint,
      autoEmail: draft.autoEmail,
    }
    if (current) void run(() => updateRegister(current.id, { name, settings }), t('settings.sale.registers.updated'), onClose)
    else void run(() => createRegister({ name, locationId: draft.locationId, settings }), t('settings.sale.registers.created'), onClose)
  }

  const option = (key: 'requireOpen' | 'middayCounts' | 'promptLeftOpen' | 'autoPrint' | 'autoEmail') => (
    <Checkbox label={t(`settings.sale.registers.opt.${key}`)} hint={t(`settings.sale.registers.opt.${key}Hint`)} checked={draft[key]} onChange={(v) => patch({ [key]: v } as Partial<RegisterDraft>)} />
  )

  return (
    <FullModal
      open={editing !== null}
      onClose={onClose}
      title={isNew ? t('settings.sale.registers.addTitle') : t('settings.sale.registers.editTitle')}
      subtitle={isNew ? t('settings.sale.registers.addSubtitle', { location: locationName }) : undefined}
      onSave={save}
      saving={saving}
      saveLabel={isNew ? t('settings.common.continue') : undefined}
      testId="register-modal"
    >
      <FormCard>
        <div className="flex flex-col gap-5">
          {isNew && locations.length > 1 && (
            <Field label={t('settings.sale.registers.location')}>
              {(id) => <Select id={id} value={draft.locationId} options={locations.map((l) => ({ value: l.id, label: l.name }))} onChange={(e) => patch({ locationId: e.target.value })} />}
            </Field>
          )}
          <Field label={t('settings.sale.registers.name')} counter={{ value: draft.name.length, max: NAME_MAX }} error={errors.name}>
            {(id) => (
              <TextInput
                id={id}
                value={draft.name}
                maxLength={NAME_MAX}
                placeholder={t('settings.sale.registers.namePlaceholder')}
                invalid={Boolean(errors.name)}
                onChange={(e) => {
                  setErrors((er) => ({ ...er, name: undefined }))
                  patch({ name: e.target.value })
                }}
              />
            )}
          </Field>
        </div>
        <SectionHeading title={t('settings.sale.registers.advanced')} className="mb-5 mt-8" />
        <div className="flex flex-col gap-5">
          {option('requireOpen')}
          <div>
            <Checkbox label={t('settings.sale.registers.opt.minFloat')} hint={t('settings.sale.registers.opt.minFloatHint')} checked={draft.minFloatOn} onChange={(minFloatOn) => patch({ minFloatOn })} />
            {draft.minFloatOn && (
              <div className="mt-4 grid gap-4 pl-8 sm:grid-cols-2">
                <Field label={t('settings.sale.registers.amount')} error={errors.amount}>
                  {(id) => (
                    <MoneyInput
                      id={id}
                      value={draft.minFloatAmount}
                      onChange={(v) => {
                        setErrors((er) => ({ ...er, amount: undefined }))
                        patch({ minFloatAmount: v })
                      }}
                    />
                  )}
                </Field>
                <Field label={t('settings.sale.registers.requiredWhen')}>
                  {(id) => (
                    <Select
                      id={id}
                      value={draft.minFloatWhen}
                      options={[
                        { value: 'opening', label: t('settings.sale.registers.when.opening') },
                        { value: 'closing', label: t('settings.sale.registers.when.closing') },
                        { value: 'both', label: t('settings.sale.registers.when.both') },
                      ]}
                      onChange={(e) => patch({ minFloatWhen: e.target.value as FloatWhen })}
                    />
                  )}
                </Field>
              </div>
            )}
          </div>
          {option('middayCounts')}
          {option('promptLeftOpen')}
          {option('autoPrint')}
          {option('autoEmail')}
        </div>
      </FormCard>
    </FullModal>
  )
}

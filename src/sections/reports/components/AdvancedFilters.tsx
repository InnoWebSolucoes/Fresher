import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import clsx from 'clsx'
import { BarChart3, Check, ChevronDown, CircleDollarSign, Clock, GripVertical, Hash, Percent, Plus, Tag, Trash2, Type, type LucideIcon } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import { uid } from '@/lib/ids'
import { useDismiss } from '@/lib/useDismiss'
import type { AdvOp, AdvRule } from '../data'
import { isNumeric } from '../engine/format'
import type { Col, ColType } from '../engine/types'
import { NUMBER_OPS, TEXT_OPS, ruleIsComplete } from '../engine/view'
import { Popover } from './Popover'

const OP_SYMBOL: Record<AdvOp, string> = { eq: '=', between: '→←', gt: '>', gte: '≥', lt: '<', lte: '≤', contains: '∋', not_contains: '∌', is: '=', is_not: '≠' }

const fieldIcon = (type: ColType): LucideIcon => (type === 'money' ? CircleDollarSign : type === 'pct' ? Percent : type === 'hours' || type === 'mins' ? Clock : type === 'int' ? Tag : type === 'num' ? Hash : Type)

export const newRule = (field: Col | undefined): AdvRule => ({ id: uid('rule'), field: field?.key ?? '', op: field && !isNumeric(field.type) ? 'contains' : 'eq', value: '' })

interface Props {
  fields: Col[]
  rules: AdvRule[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onApply: (rules: AdvRule[]) => void
  /** Column picked in the header menu: a rule for it is added when the panel opens. */
  seedField: string | null
}

/** "Advanced filters" toolbar button and rules popover (reports.md §2.5). */
export function AdvancedFilters({ fields, rules, open, onOpenChange, onApply, seedField }: Props) {
  const { t } = useTranslation()
  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      label={t('reports.adv.title')}
      className="w-[860px] max-w-[calc(100vw-2rem)]"
      trigger={({ toggle }) => (
        <button type="button" onClick={toggle} aria-expanded={open} className="inline-flex h-11 items-center gap-2 rounded-full px-3 text-body-strong text-ink hover:bg-sunken">
          <span className="flex h-6 w-6 items-center justify-center rounded-xs bg-primary text-on-primary">
            <BarChart3 size={14} aria-hidden />
          </span>
          {t('reports.adv.button')}
          {rules.length > 0 && <span className="rounded-full bg-primary px-2 text-caption text-on-primary">{rules.length}</span>}
        </button>
      )}
    >
      {(close) => (
        <Panel
          fields={fields}
          initial={rules}
          seedField={seedField}
          onApply={(next) => {
            onApply(next)
            close()
          }}
        />
      )}
    </Popover>
  )
}

function Panel({ fields, initial, seedField, onApply }: { fields: Col[]; initial: AdvRule[]; seedField: string | null; onApply: (rules: AdvRule[]) => void }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<AdvRule[]>(() => {
    const seed = seedField ? fields.find((f) => f.key === seedField) : undefined
    if (seed) return [...initial, newRule(seed)]
    return initial.length ? initial : [newRule(fields.find((f) => isNumeric(f.type)) ?? fields[0])]
  })
  const [errors, setErrors] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const types = useMemo(() => new Map(fields.map((f) => [f.key, f.type])), [fields])
  const update = (id: string, patch: Partial<AdvRule>) => setDraft((d) => d.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    setDraft((d) => arrayMove(d, d.findIndex((r) => r.id === e.active.id), d.findIndex((r) => r.id === e.over!.id)))
  }
  const apply = () => {
    const incomplete = draft.filter((r) => !ruleIsComplete(r, types.get(r.field)))
    if (incomplete.length) return setErrors(true)
    onApply(draft)
  }

  return (
    <div className="p-5">
      <p className="mb-3 text-body text-muted">{t('reports.adv.title')}</p>
      {draft.length === 0 && <p className="py-3 text-body text-muted">{t('reports.adv.noRules')}</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={draft.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {draft.map((rule, i) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                index={i}
                fields={fields}
                type={types.get(rule.field)}
                showError={errors && !ruleIsComplete(rule, types.get(rule.field))}
                onChange={(patch) => update(rule.id, patch)}
                onDelete={() => setDraft((d) => d.filter((r) => r.id !== rule.id))}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <div className="mt-4 flex items-center gap-2">
        <Button variant="ghost" className="text-primary" icon={<Plus size={16} />} onClick={() => setDraft((d) => [...d, newRule(fields.find((f) => isNumeric(f.type)) ?? fields[0])])}>
          {t('reports.adv.addRule')}
        </Button>
        <span className="flex-1" />
        <Button variant="ghost" onClick={() => { setDraft([]); setErrors(false) }}>
          {t('reports.adv.clearAll')}
        </Button>
        <Button variant="primary" onClick={apply}>
          {t('reports.page.apply')}
        </Button>
      </div>
    </div>
  )
}

function RuleRow({ rule, index, fields, type, showError, onChange, onDelete }: { rule: AdvRule; index: number; fields: Col[]; type: ColType | undefined; showError: boolean; onChange: (patch: Partial<AdvRule>) => void; onDelete: () => void }) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: rule.id })
  const numeric = type ? isNumeric(type) : true
  const ops = numeric ? NUMBER_OPS : TEXT_OPS
  const field = fields.find((f) => f.key === rule.field)
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={clsx('flex items-start gap-2 rounded-md bg-raised', isDragging && 'relative z-10 shadow-md')}>
      <span className="w-16 shrink-0 pt-2.5 text-right text-body text-ink">{index === 0 ? t('reports.adv.where') : t('reports.adv.and')}</span>
      <FieldPicker fields={fields} value={field} onChange={(f) => onChange({ field: f.key, op: isNumeric(f.type) ? (isNumeric(type ?? 'int') ? rule.op : 'eq') : 'contains', value: '', value2: undefined })} />
      <Dropdown
        label={t(`reports.adv.ops.${rule.op}`)}
        width="w-[170px]"
        items={ops.map((op) => ({ key: op, label: t(`reports.adv.ops.${op}`), symbol: OP_SYMBOL[op], selected: op === rule.op }))}
        onPick={(op) => onChange({ op: op as AdvOp })}
        ariaLabel={t('reports.adv.operator')}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex gap-2">
          <input
            className={clsx('input h-10', showError && rule.value.trim() === '' && 'border-danger')}
            aria-label={t('reports.adv.value')}
            placeholder={rule.op === 'between' ? t('reports.adv.from') : numeric ? t('reports.adv.numberValue') : t('reports.adv.value')}
            inputMode={numeric ? 'decimal' : undefined}
            type={numeric ? 'number' : 'text'}
            step="any"
            value={rule.value}
            onChange={(e) => onChange({ value: e.target.value })}
          />
          {rule.op === 'between' && (
            <input className={clsx('input h-10', showError && !rule.value2 && 'border-danger')} aria-label={t('reports.adv.to')} placeholder={t('reports.adv.to')} type="number" step="any" value={rule.value2 ?? ''} onChange={(e) => onChange({ value2: e.target.value })} />
          )}
        </div>
        {showError && <p className="mt-1 text-small text-danger">{t('reports.adv.incomplete')}</p>}
        {type === 'hours' && <p className="mt-1 text-small text-muted">{t('reports.adv.hoursHint')}</p>}
      </div>
      <button type="button" className="icon-btn h-10 w-10 shrink-0" aria-label={t('reports.adv.deleteRule')} title={t('reports.adv.deleteRule')} onClick={onDelete}>
        <Trash2 size={18} aria-hidden />
      </button>
      <button type="button" ref={setActivatorNodeRef} className="icon-btn h-10 w-8 shrink-0 cursor-grab" aria-label={t('reports.adv.drag')} title={t('reports.adv.drag')} {...attributes} {...listeners}>
        <GripVertical size={18} aria-hidden />
      </button>
    </div>
  )
}

function FieldPicker({ fields, value, onChange }: { fields: Col[]; value: Col | undefined; onChange: (field: Col) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const refs = useMemo(() => [ref], [])
  useDismiss(refs, open, () => setOpen(false))
  const list = fields.filter((f) => f.label.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <div ref={ref} className="relative w-[230px] shrink-0">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={t('reports.adv.field')} onClick={() => setOpen((o) => !o)} className="input flex h-10 items-center justify-between gap-2 text-left">
        <span className="truncate">{value?.label ?? t('reports.adv.selectField')}</span>
        <ChevronDown size={16} className="shrink-0 text-muted" aria-hidden />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 w-[300px] rounded-lg border border-line bg-raised p-3 shadow-md">
          <input autoFocus className="input mb-2 h-10" placeholder={t('reports.adv.filterBy')} aria-label={t('reports.adv.filterBy')} value={q} onChange={(e) => setQ(e.target.value)} />
          <ul role="listbox" className="max-h-72 overflow-y-auto">
            {list.map((f) => {
              const Icon = fieldIcon(f.type)
              return (
                <li key={f.key}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={value?.key === f.key}
                    onClick={() => {
                      onChange(f)
                      setOpen(false)
                      setQ('')
                    }}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-body text-ink hover:bg-sunken"
                  >
                    <Icon size={18} className="shrink-0 text-muted" aria-hidden />
                    <span className="flex-1">{f.label}</span>
                    {value?.key === f.key && <Check size={16} className="text-primary" aria-hidden />}
                  </button>
                </li>
              )
            })}
            {list.length === 0 && <li className="px-2 py-2 text-body text-muted">{t('reports.adv.noFields')}</li>}
          </ul>
        </div>
      )}
    </div>
  )
}

function Dropdown({ label, items, onPick, width, ariaLabel }: { label: string; items: { key: string; label: string; symbol?: string; selected?: boolean }[]; onPick: (key: string) => void; width: string; ariaLabel: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const refs = useMemo(() => [ref], [])
  useDismiss(refs, open, () => setOpen(false))
  return (
    <div ref={ref} className={clsx('relative shrink-0', width)}>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel} onClick={() => setOpen((o) => !o)} className="input flex h-10 items-center justify-between gap-2 text-left">
        <span className="truncate">{label}</span>
        <ChevronDown size={16} className="shrink-0 text-muted" aria-hidden />
      </button>
      {open && (
        <ul role="listbox" className="absolute left-0 top-full z-10 mt-1 w-[250px] rounded-lg border border-line bg-raised p-1.5 shadow-md">
          {items.map((it) => (
            <li key={it.key}>
              <button
                type="button"
                role="option"
                aria-selected={it.selected}
                onClick={() => {
                  onPick(it.key)
                  setOpen(false)
                }}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-body text-ink hover:bg-sunken"
              >
                {it.symbol && <span className="w-5 text-center text-muted" aria-hidden>{it.symbol}</span>}
                <span className="flex-1">{it.label}</span>
                {it.selected && <Check size={16} className="text-ink" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

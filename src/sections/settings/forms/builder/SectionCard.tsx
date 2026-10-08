import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import clsx from 'clsx'
import { ArrowDown, ArrowUp, Copy, GripVertical, MessageSquarePlus, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, Menu, TextArea, TextInput } from '@/components/ui'
import type { FormSection } from '@/types'
import { ClientDetailsFields } from '../FormRunner'
import { BLOCK_ICONS, BLOCK_TYPES, newBlock, type FormBlock, type FormBlockType } from '../shared'

/** Error display rule shared by the builder: after "Next step" or once a field was left. */
export interface ErrorState {
  errors: Record<string, string>
  visible: (key: string) => boolean
  touch: (key: string) => void
}

/**
 * One section on the builder canvas: "Section n of m: Client details|Custom
 * section" tab, Options ⋮ (Move up, Move down, Duplicate, Delete) and, for
 * custom sections, an editable title and question blocks.
 */
export function SectionCard({
  section,
  index,
  total,
  autoFocus,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
  errorState,
}: {
  section: FormSection
  index: number
  total: number
  autoFocus?: boolean
  onChange: (next: FormSection) => void
  onMove: (direction: -1 | 1) => void
  onDuplicate: () => void
  onDelete: () => void
  errorState: ErrorState
}) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id })
  const custom = section.kind === 'custom'
  const kindLabel = t(custom ? 'settings.frm.builder.customSection' : 'settings.frm.builder.clientDetails')
  const titleKey = `title:${section.id}`
  const blocksKey = `blocks:${section.id}`
  const titleError = errorState.visible(titleKey) ? errorState.errors[titleKey] : undefined
  const blocksError = errorState.visible(blocksKey) ? errorState.errors[blocksKey] : undefined

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={clsx('relative', isDragging && 'z-10 opacity-80')} data-testid={`builder-section-${index}`}>
      <div className="inline-flex max-w-full items-center gap-1.5 rounded-t-md bg-primary py-2 pl-2 pr-4 text-body-strong text-on-primary">
        <button type="button" className="cursor-grab touch-none rounded-sm p-1 hover:bg-white/15 active:cursor-grabbing" aria-label={t('settings.frm.builder.dragSection')} {...attributes} {...listeners}>
          <GripVertical size={16} aria-hidden />
        </button>
        <span className="truncate">{t('settings.frm.builder.sectionTab', { index: index + 1, total, kind: kindLabel })}</span>
      </div>
      <div className={clsx('rounded-b-lg rounded-tr-lg border bg-surface shadow-xs', titleError || blocksError ? 'border-danger' : 'border-line')}>
        <div className="flex items-start gap-3 px-8 pb-2 pt-7">
          <div className="min-w-0 flex-1">
            {custom ? (
              <>
                <input
                  data-error={titleError ? 'true' : undefined}
                  autoFocus={autoFocus}
                  value={section.title}
                  onChange={(e) => onChange({ ...section, title: e.target.value })}
                  onBlur={() => errorState.touch(titleKey)}
                  placeholder={t('settings.frm.builder.sectionTitlePlaceholder')}
                  aria-label={t('settings.frm.builder.sectionTitle')}
                  aria-invalid={Boolean(titleError)}
                  maxLength={120}
                  className={clsx(
                    '-ml-2 w-full rounded-sm border bg-transparent px-2 py-1 font-display text-title-2 text-ink placeholder:text-subtle hover:border-line-strong focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30',
                    titleError ? 'border-danger' : 'border-transparent',
                  )}
                />
                {titleError && <p className="mt-1 text-small text-danger">{titleError}</p>}
              </>
            ) : (
              <h2 className="py-1 font-display text-title-2 text-ink">{t('settings.frm.builder.personalInformation')}</h2>
            )}
          </div>
          <Menu
            label={t('settings.frm.builder.sectionOptions')}
            width={200}
            groups={[
              {
                items: [
                  { label: t('settings.common.moveUp'), icon: <ArrowUp size={16} />, onSelect: () => onMove(-1), disabled: index === 0 },
                  { label: t('settings.common.moveDown'), icon: <ArrowDown size={16} />, onSelect: () => onMove(1), disabled: index === total - 1 },
                  ...(custom ? [{ label: t('settings.frm.actions.duplicate'), icon: <Copy size={16} />, onSelect: onDuplicate }] : []),
                ],
              },
              { items: [{ label: t('settings.common.delete'), icon: <Trash2 size={16} />, danger: true, onSelect: onDelete }] },
            ]}
          />
        </div>
        {custom ? (
          <BlocksEditor section={section} onChange={onChange} errorState={errorState} blocksError={blocksError} />
        ) : (
          <div className="divide-y divide-line pb-3">
            <ClientDetailsFields prefix={section.id} readOnly />
          </div>
        )}
      </div>
    </div>
  )
}

function BlocksEditor({ section, onChange, errorState, blocksError }: { section: FormSection; onChange: (next: FormSection) => void; errorState: ErrorState; blocksError?: string }) {
  const { t } = useTranslation()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const blocks = section.blocks
  const setBlocks = (next: FormBlock[]) => onChange({ ...section, blocks: next })
  const update = (id: string, label: string) => setBlocks(blocks.map((b) => (b.id === id ? { ...b, label } : b)))
  const move = (i: number, dir: -1 | 1) => {
    const target = i + dir
    if (target < 0 || target >= blocks.length) return
    setBlocks(arrayMove(blocks, i, target))
  }
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const from = blocks.findIndex((b) => b.id === e.active.id)
    const to = blocks.findIndex((b) => b.id === e.over?.id)
    if (from !== -1 && to !== -1) setBlocks(arrayMove(blocks, from, to))
  }
  const add = (type: FormBlockType) => setBlocks([...blocks, newBlock(type)])

  return (
    <div className="pb-6">
      {blocks.length === 0 ? (
        <div className="mx-8 my-4 flex flex-col items-center gap-1 rounded-lg border border-dashed border-line-strong px-6 py-8 text-center">
          <MessageSquarePlus size={24} className="mb-1 text-primary" aria-hidden />
          <p className="text-body-strong text-ink">{t('settings.frm.builder.noQuestionsTitle')}</p>
          <p className="text-body text-muted">{t('settings.frm.builder.noQuestionsBody')}</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            <ul className="divide-y divide-line border-y border-line">
              {blocks.map((block, i) => (
                <BlockRow
                  key={block.id}
                  block={block}
                  index={i}
                  count={blocks.length}
                  onLabel={(label) => update(block.id, label)}
                  onMove={(dir) => move(i, dir)}
                  onDelete={() => setBlocks(blocks.filter((b) => b.id !== block.id))}
                  errorState={errorState}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      {blocksError && <p className="mx-8 mt-3 text-small text-danger">{blocksError}</p>}
      <div className="mt-4 px-8">
        <Menu
          align="left"
          width={300}
          groups={[
            {
              items: BLOCK_TYPES.map((type) => {
                const Icon = BLOCK_ICONS[type]
                return { label: t(`settings.frm.blocks.${type}.name`), hint: t(`settings.frm.blocks.${type}.hint`), icon: <Icon size={16} />, onSelect: () => add(type) }
              }),
            },
          ]}
          trigger={({ open, toggle }) => (
            <Button icon={<Plus size={16} aria-hidden />} onClick={toggle} aria-haspopup="menu" aria-expanded={open} data-testid="add-question">
              {t('settings.frm.builder.addQuestion')}
            </Button>
          )}
        />
      </div>
    </div>
  )
}

function BlockRow({ block, index, count, onLabel, onMove, onDelete, errorState }: { block: FormBlock; index: number; count: number; onLabel: (label: string) => void; onMove: (dir: -1 | 1) => void; onDelete: () => void; errorState: ErrorState }) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })
  const Icon = BLOCK_ICONS[block.type]
  const key = `block:${block.id}`
  const error = errorState.visible(key) ? errorState.errors[key] : undefined
  const typeName = t(`settings.frm.blocks.${block.type}.name`)
  const inputProps = {
    value: block.label,
    onChange: (e: { target: { value: string } }) => onLabel(e.target.value),
    onBlur: () => errorState.touch(key),
    placeholder: t(`settings.frm.blocks.${block.type}.placeholder`),
    'aria-label': typeName,
    invalid: Boolean(error),
    'data-error': error ? 'true' : undefined,
    autoFocus: !block.label,
  }
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={clsx('flex items-start gap-2 bg-surface py-5 pl-4 pr-6', isDragging && 'relative z-10 shadow-md')}>
      <button type="button" className="mt-7 cursor-grab touch-none rounded-sm p-1 text-muted hover:bg-sunken active:cursor-grabbing" aria-label={t('settings.frm.builder.dragBlock')} {...attributes} {...listeners}>
        <GripVertical size={18} aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        <p className="mb-2 flex items-center gap-1.5 text-caption uppercase tracking-wide text-muted">
          <Icon size={14} aria-hidden />
          {typeName}
        </p>
        {block.type === 'paragraph' ? <TextArea {...inputProps} className="min-h-[88px]" maxLength={1000} /> : <TextInput {...inputProps} maxLength={240} />}
        {error && <p className="mt-1.5 text-small text-danger">{error}</p>}
        <AnswerHint type={block.type} />
      </div>
      <div className="mt-6">
        <Menu
          label={t('settings.frm.builder.blockOptions')}
          width={200}
          groups={[
            {
              items: [
                { label: t('settings.common.moveUp'), icon: <ArrowUp size={16} />, onSelect: () => onMove(-1), disabled: index === 0 },
                { label: t('settings.common.moveDown'), icon: <ArrowDown size={16} />, onSelect: () => onMove(1), disabled: index === count - 1 },
              ],
            },
            { items: [{ label: t('settings.common.delete'), icon: <Trash2 size={16} />, danger: true, onSelect: onDelete }] },
          ]}
        />
      </div>
    </li>
  )
}

/** Greyed-out picture of the answer control under a question. */
function AnswerHint({ type }: { type: FormBlockType }) {
  const { t } = useTranslation()
  if (type === 'paragraph') return null
  return (
    <div className="mt-3" aria-hidden>
      {type === 'yes_no' && (
        <div className="flex gap-2">
          {[t('settings.common.yes'), t('settings.common.no')].map((label) => (
            <span key={label} className="flex h-9 min-w-[88px] items-center gap-2 rounded-md border border-line px-3 text-body text-subtle">
              <span className="h-3.5 w-3.5 rounded-full border border-line-strong" />
              {label}
            </span>
          ))}
        </div>
      )}
      {type === 'short_text' && <div className="flex h-10 items-center rounded-sm border border-line px-3 text-body text-subtle">{t('settings.frm.builder.shortAnswerHint')}</div>}
      {type === 'long_text' && <div className="h-20 rounded-sm border border-line px-3 py-2 text-body text-subtle">{t('settings.frm.builder.longAnswerHint')}</div>}
      {type === 'checkbox' && (
        <span className="flex items-center gap-2 text-body text-subtle">
          <span className="h-4 w-4 rounded-xs border border-line-strong" />
          {t('settings.frm.builder.checkboxHint')}
        </span>
      )}
      {type === 'signature' && <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-line-strong text-body text-subtle">{t('settings.frm.preview.signHere')}</div>}
    </div>
  )
}

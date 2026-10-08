import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import clsx from 'clsx'
import { ArrowLeft, IdCard, LayoutList, Star } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { formTemplatesApi } from '@/api/settings'
import { Button, Checkbox, EmptyState, Field, FullscreenFrame, Modal, RadioGroup, Segmented, Select, Switch, TextInput, confirm } from '@/components/ui'
import { now } from '@/lib/time'
import { useDb } from '@/store/db'
import type { FormSection, FormTemplate, ID } from '@/types'
import { useAction } from '../components/useAction'
import { SectionCard } from '../forms/builder/SectionCard'
import { FormRunner, SideArrow } from '../forms/FormRunner'
import { EMPTY_DRAFT, FORMS_BASE, cloneSection, newSection, sectionErrors, servicesLabel, templatePath, type TemplateDraft } from '../forms/shared'

/** Add form template (settings-forms.md §1.2). */
export function FormCreatePage() {
  return <FormBuilder template={null} />
}

/** Edit form template (settings-forms.md §1.2). */
export function FormEditPage() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const template = useDb((s) => s.formTemplates.find((f) => f.id === id))
  if (!template) {
    return (
      <FullscreenFrame onClose={() => navigate(FORMS_BASE)} closeLabel={t('common.close')}>
        <EmptyState
          title={t('settings.more2.forms.notFound')}
          action={
            <Button variant="primary" onClick={() => navigate(FORMS_BASE)}>
              {t('settings.more2.forms.backToTemplates')}
            </Button>
          }
        />
      </FullscreenFrame>
    )
  }
  return <FormBuilder key={template.id} template={template} />
}

function toDraft(tpl: FormTemplate | null): TemplateDraft {
  if (!tpl) return { ...EMPTY_DRAFT, sections: [] }
  return {
    name: tpl.name,
    sections: tpl.sections.map((s) => ({ ...s, blocks: s.blocks.map((b) => ({ ...b })) })),
    request: tpl.request,
    frequency: tpl.frequency,
    serviceIds: tpl.serviceIds === 'all' ? 'all' : [...tpl.serviceIds],
    signatureRequired: tpl.signatureRequired,
  }
}

function FormBuilder({ template }: { template: FormTemplate | null }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [initial] = useState(() => toDraft(template))
  const [draft, setDraft] = useState<TemplateDraft>(initial)
  const [step, setStep] = useState<0 | 1>(0)
  const [mode, setMode] = useState<'builder' | 'preview'>('builder')
  const [submitted, setSubmitted] = useState(false)
  const [touched, setTouched] = useState<Set<string>>(() => new Set())
  const [lastAdded, setLastAdded] = useState<ID | null>(null)
  const [previewStep, setPreviewStep] = useState(0)
  const [nameTouched, setNameTouched] = useState(false)
  const [servicesOpen, setServicesOpen] = useState(false)
  const [busy, run] = useAction()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  const sections = draft.sections
  const errors = useMemo(() => sectionErrors(t, sections), [t, sections])
  const errorState = {
    errors,
    visible: (key: string) => submitted || touched.has(key),
    touch: (key: string) => setTouched((s) => (s.has(key) ? s : new Set(s).add(key))),
  }
  const hasClientDetails = sections.some((s) => s.kind === 'client_details')
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const nameError = nameTouched && !draft.name.trim() ? t('settings.more2.forms.nameRequired') : undefined

  const setSections = (next: FormSection[]) => setDraft((d) => ({ ...d, sections: next }))
  const addSection = (kind: FormSection['kind']) => {
    if (kind === 'client_details' && hasClientDetails) return
    const section = newSection(kind)
    setLastAdded(section.id)
    setMode('builder')
    setSections(kind === 'client_details' ? [section, ...sections] : [...sections, section])
  }
  const moveSection = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target >= 0 && target < sections.length) setSections(arrayMove(sections, index, target))
  }
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const from = sections.findIndex((s) => s.id === e.active.id)
    const to = sections.findIndex((s) => s.id === e.over?.id)
    if (from !== -1 && to !== -1) setSections(arrayMove(sections, from, to))
  }
  const deleteSection = async (section: FormSection) => {
    if (section.blocks.length && !(await confirm({ title: t('settings.more2.forms.deleteSectionTitle'), body: t('settings.more2.forms.deleteSectionBody'), confirmLabel: t('settings.common.delete'), cancelLabel: t('settings.common.cancel'), tone: 'danger' }))) return
    setSections(sections.filter((s) => s.id !== section.id))
  }

  const exit = async () => {
    if (dirty && !(await confirm({ title: t('settings.more2.forms.exitTitle'), body: t('settings.more2.forms.exitBody'), confirmLabel: t('settings.more2.forms.exit'), cancelLabel: t('settings.more2.forms.goBack'), tone: 'danger' }))) return
    navigate(template ? templatePath(template.id, 'details') : FORMS_BASE)
  }

  const nextStep = () => {
    setSubmitted(true)
    if (Object.keys(errors).length) {
      setMode('builder')
      window.setTimeout(() => document.querySelector<HTMLElement>('[data-error="true"]')?.focus(), 0)
      return
    }
    setPreviewStep(0)
    setStep(1)
  }

  const save = () => {
    setNameTouched(true)
    const name = draft.name.trim()
    if (!name) return
    const payload = { ...draft, name }
    void run(
      async () => {
        if (template) {
          await formTemplatesApi.update(template.id, payload)
          return template.id
        }
        const created = await formTemplatesApi.create({ ...payload, status: 'inactive', createdAt: now().toISOString() })
        return created.id
      },
      t(template ? 'settings.frm.toast.updated' : 'settings.frm.toast.created'),
      () => navigate(FORMS_BASE),
    )
  }

  const stepTitle = t(step === 0 ? 'settings.more2.forms.step1Title' : 'settings.more2.forms.step2Title')
  // Phones show only "Step 1 of 2" in the header; the step title opens the page body instead.
  const title = (
    <span className="flex flex-col items-center leading-tight">
      <span className="text-small font-normal text-muted">{t('settings.frm.preview.step', { step: step + 1, total: 2 })}</span>
      <span className="hidden md:inline">{stepTitle}</span>
    </span>
  )
  const phoneHeading = <h2 className="font-display text-title-2 text-ink md:hidden">{stepTitle}</h2>

  const palette = (
    <div className="flex flex-col gap-3">
      <p className="text-caption font-semibold uppercase tracking-wide text-ink">{t('settings.more2.forms.sections')}</p>
      <PaletteTile icon={<IdCard size={22} aria-hidden />} label={t('settings.frm.builder.clientDetails')} hint={hasClientDetails ? t('settings.more2.forms.clientDetailsAdded') : undefined} disabled={hasClientDetails} onClick={() => addSection('client_details')} />
      <PaletteTile icon={<Star size={22} className="text-warning" aria-hidden />} label={t('settings.frm.builder.customSection')} onClick={() => addSection('custom')} testId="palette-custom" />
    </div>
  )

  return (
    <FullscreenFrame
      title={title}
      closeLabel={t('common.close')}
      onClose={() => void exit()}
      nav={step === 0 ? palette : undefined}
      maxWidth={step === 0 ? 'max-w-[880px]' : 'max-w-[1240px]'}
      actions={
        step === 0 ? (
          <Button variant="primary" className="md:px-6" disabled={sections.length === 0} onClick={nextStep} data-testid="form-next-step">
            {t('settings.frm.preview.next')}
          </Button>
        ) : (
          <>
            <Button variant="ghost" className="hidden md:inline-flex" onClick={() => setStep(0)}>
              {t('settings.common.previous')}
            </Button>
            <Button variant="primary" className="md:px-6" loading={busy} onClick={save} data-testid="form-save">
              {t('settings.common.save')}
            </Button>
          </>
        )
      }
    >
      {step === 0 ? (
        <div className="flex flex-col gap-6">
          {phoneHeading}
          {/* Palette for narrow screens (the side nav is hidden below md). */}
          <div className="flex flex-wrap gap-2 md:hidden">
            <Button size="sm" disabled={hasClientDetails} onClick={() => addSection('client_details')}>
              {t('settings.frm.builder.clientDetails')}
            </Button>
            <Button size="sm" onClick={() => addSection('custom')}>
              {t('settings.frm.builder.customSection')}
            </Button>
          </div>
          {sections.length > 0 && (
            <Segmented
              className="w-full [&>button]:flex-1"
              value={mode}
              onChange={setMode}
              items={[
                { value: 'builder', label: t('settings.more2.forms.builder') },
                { value: 'preview', label: t('settings.frm.actions.preview') },
              ]}
            />
          )}
          {sections.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line-strong bg-surface px-5 py-10 text-center md:px-6 md:py-16" data-testid="builder-empty">
              <span className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-primary-subtle text-primary">
                <LayoutList size={28} aria-hidden />
              </span>
              <p className="font-display text-title-3 text-ink">{t('settings.more2.forms.emptyTitle')}</p>
              <p className="text-body text-muted">
                {t('settings.more2.forms.emptyBody')}{' '}
                <button type="button" className="text-body-strong text-primary hover:underline" onClick={() => addSection('custom')} data-testid="builder-click-here">
                  {t('settings.more2.forms.clickHere')}
                </button>{' '}
                {t('settings.more2.forms.emptyBodyEnd')}
              </p>
            </div>
          ) : mode === 'preview' ? (
            <FormRunner sections={sections} signatureRequired={draft.signatureRequired} testId="builder-preview" />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-8">
                  {sections.map((section, i) => (
                    <SectionCard
                      key={section.id}
                      section={section}
                      index={i}
                      total={sections.length}
                      autoFocus={section.id === lastAdded}
                      onChange={(next) => setSections(sections.map((s) => (s.id === section.id ? next : s)))}
                      onMove={(dir) => moveSection(i, dir)}
                      onDuplicate={() => {
                        const copy = cloneSection(section)
                        setSections([...sections.slice(0, i + 1), copy, ...sections.slice(i + 1)])
                      }}
                      onDelete={() => void deleteSection(section)}
                      errorState={errorState}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      ) : (
        <div className="grid gap-6 md:gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div className="flex items-center justify-between gap-3 md:hidden">
            {phoneHeading}
            <Button variant="ghost" size="sm" icon={<ArrowLeft size={16} aria-hidden />} onClick={() => setStep(0)}>
              {t('settings.common.previous')}
            </Button>
          </div>
          <div className="flex flex-col divide-y divide-line">
            <section className="flex flex-col gap-5 pb-8">
              <h2 className="font-display text-title-2 text-ink">{t('settings.more2.forms.detailsHeading')}</h2>
              <Field label={t('settings.more2.forms.name')} hint={t('settings.more2.forms.nameHint')} error={nameError}>
                {(id) => (
                  <TextInput id={id} value={draft.name} maxLength={80} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} onBlur={() => setNameTouched(true)} invalid={Boolean(nameError)} data-testid="form-name" />
                )}
              </Field>
            </section>
            <section className="flex flex-col gap-5 py-8">
              <h2 className="font-display text-title-2 text-ink">{t('settings.more2.forms.completeHeading')}</h2>
              <RadioGroup
                variant="cards"
                name="form-request"
                value={draft.request}
                onChange={(v) => setDraft((d) => ({ ...d, request: v }))}
                options={[
                  { value: 'before', label: t('settings.frm.values.before'), hint: t('settings.more2.forms.beforeHint') },
                  { value: 'manual', label: t('settings.frm.values.manual'), hint: t('settings.more2.forms.manualHint') },
                ]}
              />
              <Field label={t('settings.more2.forms.askComplete')}>
                {(id) => (
                  <Select
                    id={id}
                    value={draft.frequency}
                    onChange={(e) => setDraft((d) => ({ ...d, frequency: e.target.value as TemplateDraft['frequency'] }))}
                    options={[
                      { value: 'every', label: t('settings.frm.values.every') },
                      { value: 'once', label: t('settings.frm.values.once') },
                    ]}
                  />
                )}
              </Field>
              <div>
                <p className="mb-1.5 text-body-strong text-ink">{t('settings.more2.forms.askWhenBooking')}</p>
                <div className="flex items-center justify-between gap-3 rounded-sm bg-sunken px-4 py-3">
                  <span className="min-w-0 text-body text-ink">{servicesLabel(t, draft.serviceIds)}</span>
                  <button type="button" className="text-body-strong text-primary hover:underline" onClick={() => setServicesOpen(true)} data-testid="form-services-edit">
                    {t('settings.common.edit')}
                  </button>
                </div>
              </div>
            </section>
            <section className="flex flex-col gap-4 pt-8">
              <h2 className="font-display text-title-2 text-ink">{t('settings.frm.preview.signature')}</h2>
              <Switch checked={draft.signatureRequired} onChange={(v) => setDraft((d) => ({ ...d, signatureRequired: v }))} label={t('settings.more2.forms.requireSignature')} />
            </section>
          </div>
          <div className="flex items-start justify-center gap-4 lg:sticky lg:top-0">
            <div className="mt-48 hidden xl:block">
              <SideArrow dir="prev" label={t('settings.frm.preview.previous')} onClick={() => setPreviewStep((s) => Math.max(0, s - 1))} disabled={previewStep === 0} />
            </div>
            <FormRunner
              className="w-full max-w-[560px]"
              sections={sections}
              signatureRequired={draft.signatureRequired}
              step={previewStep}
              onStepChange={setPreviewStep}
              badge={<span className="rounded-full border border-line-strong bg-sunken px-3 py-0.5 text-small text-muted">{t('settings.more2.forms.formPreview')}</span>}
              testId="details-preview"
            />
            <div className="mt-48 hidden xl:block">
              <SideArrow dir="next" label={t('settings.frm.preview.next')} onClick={() => setPreviewStep((s) => Math.min(sections.length - 1, s + 1))} disabled={previewStep >= sections.length - 1} />
            </div>
          </div>
        </div>
      )}
      {servicesOpen && <ServicesModal value={draft.serviceIds} onClose={() => setServicesOpen(false)} onSave={(serviceIds) => setDraft((d) => ({ ...d, serviceIds }))} />}
    </FullscreenFrame>
  )
}

function PaletteTile({ icon, label, hint, disabled, onClick, testId }: { icon: ReactNode; label: string; hint?: string; disabled?: boolean; onClick: () => void; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={hint}
      data-testid={testId}
      className={clsx('flex flex-col items-center gap-2 rounded-lg border border-line bg-surface px-3 py-6 text-center text-body-strong transition-colors', disabled ? 'cursor-not-allowed text-subtle' : 'text-ink hover:border-primary hover:bg-primary-subtle/40')}
    >
      {icon}
      {label}
      {hint && <span className="text-caption font-normal text-subtle">{hint}</span>}
    </button>
  )
}

function ServicesModal({ value, onClose, onSave }: { value: TemplateDraft['serviceIds']; onClose: () => void; onSave: (v: TemplateDraft['serviceIds']) => void }) {
  const { t } = useTranslation()
  const services = useDb((s) => s.services)
  const categories = useDb((s) => s.serviceCategories)
  const active = useMemo(() => services.filter((s) => !s.archived), [services])
  const groups = useMemo(
    () =>
      [...categories]
        .sort((a, b) => a.order - b.order)
        .map((c) => ({ category: c, items: active.filter((s) => s.categoryId === c.id) }))
        .filter((g) => g.items.length),
    [categories, active],
  )
  const [selected, setSelected] = useState<ID[]>(() => (value === 'all' ? active.map((s) => s.id) : value))
  const all = selected.length === active.length
  const toggle = (ids: ID[], on: boolean) => setSelected((s) => (on ? Array.from(new Set([...s, ...ids])) : s.filter((x) => !ids.includes(x))))
  return (
    <Modal
      open
      onClose={onClose}
      title={t('settings.more2.forms.servicesTitle')}
      subtitle={t('settings.more2.forms.servicesSubtitle')}
      footer={
        <>
          <Button onClick={onClose}>{t('settings.common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={selected.length === 0}
            onClick={() => {
              onSave(all ? 'all' : selected)
              onClose()
            }}
            data-testid="services-save"
          >
            {t('settings.common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Checkbox checked={all} onChange={(on) => setSelected(on ? active.map((s) => s.id) : [])} label={t('settings.frm.values.allServices')} hint={t('settings.more2.forms.selectedCount', { count: selected.length })} />
        {groups.map(({ category, items }) => {
          const ids = items.map((s) => s.id)
          return (
            <div key={category.id} className="border-t border-line pt-3">
              <Checkbox checked={ids.every((id) => selected.includes(id))} onChange={(on) => toggle(ids, on)} label={<span className="text-body-strong">{category.name}</span>} />
              <div className="ml-8 mt-2 flex flex-col gap-2">
                {items.map((s) => (
                  <Checkbox key={s.id} checked={selected.includes(s.id)} onChange={(on) => toggle([s.id], on)} label={s.name} />
                ))}
              </div>
            </div>
          )
        })}
        {selected.length === 0 && <p className="text-small text-danger">{t('settings.more2.forms.servicesRequired')}</p>}
      </div>
    </Modal>
  )
}

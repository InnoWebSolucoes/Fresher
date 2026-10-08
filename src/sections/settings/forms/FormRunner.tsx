import clsx from 'clsx'
import { ArrowLeft, ArrowRight, CheckCircle2, Eraser } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Field, Select, TextArea, TextInput } from '@/components/ui'
import type { FormSection } from '@/types'
import type { FormBlock } from './shared'

/**
 * The form as a client fills it in (settings-forms.md §1.2 "Form preview",
 * §1.3 Preview): one section per step, "Step n of m", real inputs,
 * Previous / Next step and Submit on the last step (simulated).
 */

const COUNTRY_CODES = ['+351', '+34', '+33', '+44', '+49', '+55', '+1']

type Answers = Record<string, string>

export function FormRunner({
  sections,
  signatureRequired,
  step: controlledStep,
  onStepChange,
  badge,
  onClose,
  className,
  testId,
}: {
  sections: FormSection[]
  signatureRequired?: boolean
  step?: number
  onStepChange?: (step: number) => void
  /** Small pill above the step counter ("Form preview"). */
  badge?: ReactNode
  /** Shown as Close on the submitted screen. */
  onClose?: () => void
  className?: string
  testId?: string
}) {
  const { t } = useTranslation()
  const [ownStep, setOwnStep] = useState(0)
  const [answers, setAnswers] = useState<Answers>({})
  const [phase, setPhase] = useState<'filling' | 'submitting' | 'done'>('filling')
  const timer = useRef<number>()
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const total = sections.length
  const step = Math.min(Math.max(controlledStep ?? ownStep, 0), Math.max(total - 1, 0))
  const go = (next: number) => {
    const clamped = Math.min(Math.max(next, 0), Math.max(total - 1, 0))
    setOwnStep(clamped)
    onStepChange?.(clamped)
  }
  const set = (key: string, value: string) => setAnswers((a) => ({ ...a, [key]: value }))
  const section = sections[step]
  const last = step === total - 1

  const submit = () => {
    setPhase('submitting')
    timer.current = window.setTimeout(() => setPhase('done'), 900)
  }
  const restart = () => {
    setAnswers({})
    setPhase('filling')
    go(0)
  }

  return (
    <div className={clsx('rounded-xl border border-line bg-surface shadow-sm', className)} data-testid={testId}>
      {phase === 'done' ? (
        <div className="flex flex-col items-center gap-3 px-8 py-16 text-center" role="status">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success-subtle text-success">
            <CheckCircle2 size={28} aria-hidden />
          </span>
          <h2 className="font-display text-title-2 text-ink">{t('settings.frm.preview.doneTitle')}</h2>
          <p className="max-w-sm text-body text-muted">{t('settings.frm.preview.doneBody')}</p>
          <div className="mt-3 flex gap-2">
            <Button className="rounded-full" onClick={restart}>
              {t('settings.frm.preview.startAgain')}
            </Button>
            {onClose && (
              <Button variant="primary" className="rounded-full" onClick={onClose}>
                {t('settings.common.close')}
              </Button>
            )}
          </div>
        </div>
      ) : !section ? (
        <p className="px-8 py-16 text-center text-body text-muted">{t('settings.frm.preview.noSections')}</p>
      ) : (
        <>
          <div className="px-8 pb-2 pt-8 text-center">
            {badge && <div className="mb-5 flex justify-center">{badge}</div>}
            <p className="text-body text-ink">{t('settings.frm.preview.step', { step: step + 1, total })}</p>
            <h2 className="mt-1 break-words font-display text-title-2 text-ink">{section.title || t('settings.frm.builder.customSection')}</h2>
          </div>
          <div className="divide-y divide-line">
            {section.kind === 'client_details' ? (
              <ClientDetailsFields answers={answers} set={set} prefix={section.id} />
            ) : (
              section.blocks.map((block) => (
                <div key={block.id} className="px-8 py-5">
                  <BlockField block={block} value={answers[block.id] ?? ''} onChange={(v) => set(block.id, v)} />
                </div>
              ))
            )}
            {last && signatureRequired && (
              <div className="px-8 py-5">
                <p className="mb-1 text-body-strong text-ink">{t('settings.frm.preview.signature')}</p>
                <p className="mb-3 text-small text-muted">{t('settings.frm.preview.signAgreement')}</p>
                <SignaturePad value={answers.__signature ?? ''} onChange={(v) => set('__signature', v)} />
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 px-8 pb-8 pt-4">
            <div>
              {step > 0 && (
                <Button className="rounded-full" icon={<ArrowLeft size={16} aria-hidden />} onClick={() => go(step - 1)}>
                  {t('settings.frm.preview.previous')}
                </Button>
              )}
            </div>
            {last ? (
              <Button variant="primary" size="lg" className="rounded-full px-6" loading={phase === 'submitting'} onClick={submit} data-testid="form-preview-submit">
                {t('settings.frm.preview.submit')}
              </Button>
            ) : (
              <Button variant="primary" size="lg" className="rounded-full px-6" onClick={() => go(step + 1)} data-testid="form-preview-next">
                {t('settings.frm.preview.next')}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** "Personal Information": First name, Last name, Mobile number (+351), Address. */
export function ClientDetailsFields({ answers, set, prefix, readOnly }: { answers?: Answers; set?: (key: string, value: string) => void; prefix: string; readOnly?: boolean }) {
  const { t } = useTranslation()
  const value = (k: string) => answers?.[`${prefix}:${k}`] ?? ''
  const change = (k: string) => (e: { target: { value: string } }) => set?.(`${prefix}:${k}`, e.target.value)
  const common = readOnly ? { readOnly: true, tabIndex: -1, 'aria-readonly': true } : {}
  return (
    <>
      <div className="px-8 py-5">
        <Field label={t('settings.frm.preview.firstName')}>{(id) => <TextInput id={id} value={value('firstName')} onChange={change('firstName')} autoComplete="given-name" {...common} />}</Field>
      </div>
      <div className="px-8 py-5">
        <Field label={t('settings.frm.preview.lastName')}>{(id) => <TextInput id={id} value={value('lastName')} onChange={change('lastName')} autoComplete="family-name" {...common} />}</Field>
      </div>
      <div className="px-8 py-5">
        <Field label={t('settings.frm.preview.mobile')}>
          {(id) => (
            <div className="flex gap-2.5">
              <Select
                aria-label={t('settings.frm.preview.countryCode')}
                className="w-[118px] shrink-0"
                options={COUNTRY_CODES}
                value={value('code') || '+351'}
                onChange={change('code')}
                disabled={readOnly}
                tabIndex={readOnly ? -1 : undefined}
              />
              <TextInput id={id} type="tel" inputMode="tel" value={value('phone')} onChange={change('phone')} autoComplete="tel-national" className="flex-1" {...common} />
            </div>
          )}
        </Field>
      </div>
      <div className="px-8 py-5">
        <Field label={t('settings.frm.preview.address')}>{(id) => <TextArea id={id} value={value('address')} onChange={change('address')} autoComplete="street-address" className="min-h-[120px]" {...common} />}</Field>
      </div>
    </>
  )
}

/** One question rendered as a real input. */
export function BlockField({ block, value, onChange, readOnly }: { block: FormBlock; value: string; onChange?: (v: string) => void; readOnly?: boolean }) {
  const { t } = useTranslation()
  const label = block.label || t(`settings.frm.blocks.${block.type}.name`)
  const common = readOnly ? { readOnly: true, tabIndex: -1 } : {}
  switch (block.type) {
    case 'paragraph':
      return <p className="whitespace-pre-line break-words text-body-lg text-ink">{label}</p>
    case 'yes_no':
      return (
        <fieldset>
          <legend className="mb-3 break-words text-body-strong text-ink">{label}</legend>
          <div className="flex gap-3">
            {(['yes', 'no'] as const).map((opt) => {
              const text = t(`settings.common.${opt}`)
              const checked = value === text
              return (
                <label
                  key={opt}
                  className={clsx(
                    'flex h-11 min-w-[110px] cursor-pointer items-center gap-2.5 rounded-md border px-4 text-body transition-colors focus-within:ring-2 focus-within:ring-primary/40',
                    checked ? 'border-primary bg-primary-subtle/50 text-ink' : 'border-line-strong text-ink hover:bg-sunken',
                    readOnly && 'pointer-events-none',
                  )}
                >
                  <input type="radio" name={`yn-${block.id}`} checked={checked} onChange={() => onChange?.(text)} className="h-4 w-4 accent-[rgb(var(--primary))]" tabIndex={readOnly ? -1 : undefined} />
                  {text}
                </label>
              )
            })}
          </div>
        </fieldset>
      )
    case 'short_text':
      return <Field label={<span className="break-words">{label}</span>}>{(id) => <TextInput id={id} value={value} onChange={(e) => onChange?.(e.target.value)} placeholder={t('settings.frm.preview.answerPlaceholder')} {...common} />}</Field>
    case 'long_text':
      return <Field label={<span className="break-words">{label}</span>}>{(id) => <TextArea id={id} value={value} onChange={(e) => onChange?.(e.target.value)} placeholder={t('settings.frm.preview.answerPlaceholder')} {...common} />}</Field>
    case 'checkbox':
      return (
        <label className={clsx('flex cursor-pointer items-start gap-3', readOnly && 'pointer-events-none')}>
          <input type="checkbox" checked={value === 'true'} onChange={(e) => onChange?.(e.target.checked ? 'true' : '')} className="mt-0.5 h-5 w-5 shrink-0 accent-[rgb(var(--primary))]" tabIndex={readOnly ? -1 : undefined} />
          <span className="break-words text-body text-ink">{label}</span>
        </label>
      )
    case 'signature':
      return (
        <div>
          <p className="mb-3 break-words text-body-strong text-ink">{label}</p>
          <SignaturePad value={value} onChange={(v) => onChange?.(v)} readOnly={readOnly} />
        </div>
      )
  }
}

/** Draw-with-pointer signature pad; the drawing is kept as a data URL. */
export function SignaturePad({ value, onChange, readOnly }: { value: string; onChange: (dataUrl: string) => void; readOnly?: boolean }) {
  const { t } = useTranslation()
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const initial = useRef(value)
  const [hasInk, setHasInk] = useState(Boolean(value))

  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const ratio = window.devicePixelRatio || 1
    const rect = c.getBoundingClientRect()
    c.width = Math.max(1, rect.width * ratio)
    c.height = Math.max(1, rect.height * ratio)
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = getComputedStyle(c).color
    if (initial.current) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height)
      img.src = initial.current
    }
  }, [])

  const point = (e: PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  const down = (e: PointerEvent<HTMLCanvasElement>) => {
    if (readOnly) return
    const ctx = e.currentTarget.getContext('2d')
    if (!ctx) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    drawing.current = true
    const p = point(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(p.x + 0.1, p.y + 0.1)
    ctx.stroke()
  }
  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = e.currentTarget.getContext('2d')
    if (!ctx) return
    const p = point(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }
  const up = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    drawing.current = false
    setHasInk(true)
    onChange(e.currentTarget.toDataURL('image/png'))
  }
  const clear = () => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height)
    setHasInk(false)
    onChange('')
  }

  return (
    <div>
      <div className="relative h-36 overflow-hidden rounded-md border border-dashed border-line-strong bg-sunken/40">
        {!hasInk && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-body text-subtle">{t('settings.frm.preview.signHere')}</span>}
        <span className="pointer-events-none absolute bottom-6 left-6 right-6 border-b border-line-strong" aria-hidden />
        <canvas
          ref={canvas}
          role="img"
          aria-label={t('settings.frm.preview.signaturePad')}
          className={clsx('absolute inset-0 h-full w-full touch-none text-ink', readOnly ? 'cursor-default' : 'cursor-crosshair')}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={up}
        />
      </div>
      {!readOnly && (
        <div className="mt-2 flex justify-end">
          <Button variant="ghost" size="sm" icon={<Eraser size={14} aria-hidden />} onClick={clear} disabled={!hasInk}>
            {t('settings.frm.preview.clear')}
          </Button>
        </div>
      )}
    </div>
  )
}

/** Round ← / → buttons beside the preview card (builder step 2). */
export function SideArrow({ dir, label, onClick, disabled }: { dir: 'prev' | 'next'; label: string; onClick: () => void; disabled?: boolean }) {
  const Icon = dir === 'prev' ? ArrowLeft : ArrowRight
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="group flex flex-col items-center gap-2 text-body text-muted disabled:opacity-40">
      <span className="flex h-11 w-11 items-center justify-center rounded-full border border-line-strong bg-surface text-ink group-hover:bg-sunken group-disabled:group-hover:bg-surface">
        <Icon size={18} aria-hidden />
      </span>
      {label}
    </button>
  )
}

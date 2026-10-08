import clsx from 'clsx'
import { Plus, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Chip, Switch, TextInput } from '@/components/ui'
import { useDb } from '@/store/db'

/** Innoweb Payments is active (db.addOns slug 'payments'): terminal, online and card-on-file features are available. */
export function usePaymentsActive(): boolean {
  return useDb((s) => s.addOns.some((a) => a.slug === 'payments' && a.status !== 'inactive'))
}

/** Green "On" / grey "Off" chip shown next to toggle card titles. */
export function OnOffChip({ on }: { on: boolean }) {
  const { t } = useTranslation()
  return <Chip tone={on ? 'success' : 'neutral'}>{on ? t('settings.common.on') : t('settings.common.off')}</Chip>
}

/** White card used inside full-screen edit forms. */
export function FormCard({ children, className, title, description }: { children?: ReactNode; className?: string; title?: ReactNode; description?: ReactNode }) {
  return (
    <section className={clsx('card p-6 sm:p-8', className)}>
      {title && <h2 className="font-display text-title-2 text-ink">{title}</h2>}
      {description && <p className="mt-1 text-body text-muted">{description}</p>}
      {children && <div className={clsx(title || description ? 'mt-6' : '')}>{children}</div>}
    </section>
  )
}

/** "Gift cards [On]  — Sell and redeem …" card with a switch on the right. */
export function ToggleCard({ title, description, checked, onChange, children, testId }: { title: ReactNode; description?: ReactNode; checked: boolean; onChange: (v: boolean) => void; children?: ReactNode; testId?: string }) {
  return (
    <section className="card p-6 sm:p-8" data-testid={testId}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-title-2 text-ink">{title}</h2>
            <OnOffChip on={checked} />
          </div>
          {description && <p className="mt-1 text-body text-muted">{description}</p>}
        </div>
        <div className="pt-1.5">
          <Switch checked={checked} onChange={onChange} />
        </div>
      </div>
      {children && <div className="mt-6">{children}</div>}
    </section>
  )
}

/** One switch row: label, hint (or Learn more) and a switch on the right. */
export function SwitchRow({ label, hint, checked, onChange, disabled, testId }: { label: ReactNode; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; testId?: string }) {
  return (
    <div className="flex items-start justify-between gap-6 py-3" data-testid={testId}>
      <div className={clsx('min-w-0', disabled && 'opacity-60')}>
        <p className="text-body text-ink">{label}</p>
        {hint && <div className="mt-0.5 text-small text-muted">{hint}</div>}
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  )
}

export type ValueDraft = { key: string; value: string }

let keySeed = 0
/** Stable row keys for editable value lists. */
export const valueRows = (values: number[]): ValueDraft[] => values.map((v) => ({ key: `v${keySeed++}`, value: String(v) }))
export const newValueRow = (value = ''): ValueDraft => ({ key: `v${keySeed++}`, value })

/**
 * Editable list of numbers ("Tip value 10 %" rows, "€ 25" gift card values),
 * each with a delete button, plus an "Add a value" button.
 */
export function ValueRowsEditor({
  rows,
  onChange,
  prefix,
  suffix,
  label,
  addLabel,
  deleteLabel,
  errors,
  max,
  min = 1,
  step = '1',
  testId,
}: {
  rows: ValueDraft[]
  onChange: (rows: ValueDraft[]) => void
  prefix?: string
  suffix?: string
  label?: ReactNode
  addLabel: string
  deleteLabel: string
  errors: Record<string, string>
  /** Maximum number of rows. */
  max: number
  /** Minimum number of rows. */
  min?: number
  step?: string
  testId?: string
}) {
  return (
    <div data-testid={testId}>
      {label && <p className="mb-1.5 text-body-strong text-ink">{label}</p>}
      <ul className="flex flex-col gap-4">
        {rows.map((row, i) => (
          <li key={row.key}>
            <div className="flex items-center gap-3">
              <TextInput
                className="flex-1"
                type="number"
                inputMode="decimal"
                step={step}
                min={0}
                prefix={prefix}
                suffix={suffix}
                value={row.value}
                invalid={Boolean(errors[row.key])}
                aria-label={`${typeof label === 'string' ? label : ''} ${i + 1}`.trim()}
                onChange={(e) => onChange(rows.map((r) => (r.key === row.key ? { ...r, value: e.target.value } : r)))}
              />
              <button
                type="button"
                className="icon-btn h-10 w-10 shrink-0"
                aria-label={deleteLabel}
                title={deleteLabel}
                disabled={rows.length <= min}
                onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
              >
                <Trash2 size={18} aria-hidden />
              </button>
            </div>
            {errors[row.key] && <p className="mt-1.5 text-small text-danger">{errors[row.key]}</p>}
          </li>
        ))}
      </ul>
      {rows.length < max && (
        <Button className="mt-4 rounded-full" icon={<Plus size={16} aria-hidden />} onClick={() => onChange([...rows, newValueRow()])}>
          {addLabel}
        </Button>
      )}
    </div>
  )
}

/** Divider used between groups inside cards. */
export const Rule = () => <hr className="my-5 border-line" />

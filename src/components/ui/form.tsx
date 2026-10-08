import clsx from 'clsx'
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

interface FieldProps {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  optional?: boolean
  counter?: { value: number; max: number }
  children: (id: string) => ReactNode
  className?: string
}

/** Label + control + hint/error, with ids wired for accessibility. */
export function Field({ label, hint, error, optional, counter, children, className }: FieldProps) {
  const id = useId()
  return (
    <div className={className}>
      {(label || counter) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          {label && (
            <label htmlFor={id} className="text-body-strong text-ink">
              {label}
              {optional && <span className="font-normal text-muted"> (Optional)</span>}
            </label>
          )}
          {counter && (
            <span className="text-caption text-muted">
              {counter.value}/{counter.max}
            </span>
          )}
        </div>
      )}
      {children(id)}
      {error ? <p className="mt-1.5 text-small text-danger">{error}</p> : hint ? <p className="mt-1.5 text-small text-muted">{hint}</p> : null}
    </div>
  )
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { prefix?: ReactNode; suffix?: ReactNode; invalid?: boolean }>(function TextInput(
  { prefix, suffix, invalid, className, ...rest },
  ref,
) {
  if (!prefix && !suffix) return <input ref={ref} aria-invalid={invalid} className={clsx('input', invalid && 'border-danger', className)} {...rest} />
  return (
    <div className={clsx('flex h-11 items-center rounded-sm border border-line-strong bg-surface focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30', invalid && 'border-danger', className)}>
      {prefix && <span className="pl-3 text-body text-muted">{prefix}</span>}
      <input ref={ref} aria-invalid={invalid} className="h-full min-w-0 flex-1 bg-transparent px-3 text-body text-ink outline-none placeholder:text-subtle" {...rest} />
      {suffix && <span className="pr-3 text-body text-muted">{suffix}</span>}
    </div>
  )
})

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function TextArea({ className, invalid, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid}
      className={clsx('min-h-[96px] w-full rounded-sm border border-line-strong bg-surface px-3 py-2.5 text-body text-ink placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30', invalid && 'border-danger', className)}
      {...rest}
    />
  )
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string; disabled?: boolean }[] | string[]; placeholder?: string }>(
  function Select({ options, placeholder, className, ...rest }, ref) {
    return (
      <select ref={ref} className={clsx('input appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%23586A68' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...rest}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => {
          const opt = typeof o === 'string' ? { value: o, label: o } : o
          return (
            <option key={opt.value} value={opt.value} disabled={'disabled' in opt ? opt.disabled : undefined}>
              {opt.label}
            </option>
          )
        })}
      </select>
    )
  },
)

export function Checkbox({ label, hint, checked, onChange, disabled, className }: { label: ReactNode; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; className?: string }) {
  const id = useId()
  return (
    <div className={clsx('flex items-start gap-3', className)}>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded-xs accent-[rgb(var(--primary))] disabled:cursor-not-allowed" />
      <label htmlFor={id} className={clsx('cursor-pointer', disabled && 'opacity-60')}>
        <span className="block text-body text-ink">{label}</span>
        {hint && <span className="block text-small text-muted">{hint}</span>}
      </label>
    </div>
  )
}

export function Switch({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  const id = useId()
  const button = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx('relative h-6 w-11 shrink-0 rounded-full transition-colors duration-fast disabled:opacity-50', checked ? 'bg-primary' : 'bg-line-strong')}
    >
      <span className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-fast', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
    </button>
  )
  if (!label) return button
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-body-strong text-ink">{label}</span>
        {hint && <span className="block text-small text-muted">{hint}</span>}
      </label>
      {button}
    </div>
  )
}

/** Radio list or card group. */
export function RadioGroup<T extends string>({ value, onChange, options, variant = 'list', name }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; hint?: ReactNode; disabled?: boolean }[]; variant?: 'list' | 'cards'; name?: string }) {
  const groupName = useId()
  return (
    <div role="radiogroup" className={clsx(variant === 'cards' ? 'grid gap-3' : 'flex flex-col gap-2.5')}>
      {options.map((o) => (
        <label
          key={o.value}
          className={clsx(
            'flex cursor-pointer items-start gap-3',
            variant === 'cards' && 'rounded-lg border p-4 transition-colors',
            variant === 'cards' && (value === o.value ? 'border-primary bg-primary-subtle/40 ring-1 ring-primary' : 'border-line hover:border-line-strong'),
            o.disabled && 'cursor-not-allowed opacity-50',
          )}
        >
          <input type="radio" name={name ?? groupName} checked={value === o.value} disabled={o.disabled} onChange={() => onChange(o.value)} className="mt-0.5 h-5 w-5 shrink-0 accent-[rgb(var(--primary))]" />
          <span className="min-w-0">
            <span className="block text-body-strong text-ink">{o.label}</span>
            {o.hint && <span className="block text-small text-muted">{o.hint}</span>}
          </span>
        </label>
      ))}
    </div>
  )
}

/** Euro amount input that keeps a numeric value. */
export function MoneyInput({ value, onChange, ...rest }: { value: number | ''; onChange: (v: number | '') => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <TextInput
      prefix="€"
      inputMode="decimal"
      type="number"
      step="0.01"
      min={0}
      value={value}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      {...rest}
    />
  )
}

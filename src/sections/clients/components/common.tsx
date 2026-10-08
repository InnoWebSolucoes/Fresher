import clsx from 'clsx'
import { Check, ChevronDown, ChevronUp, Info, Star } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Client } from '@/types'
import { Select } from '@/components/ui'
import { useClientAvatars } from '../lib/avatars'
import { COUNTRY_CODES, SWATCHES, swatchFor } from '../lib/constants'

/** Round client avatar: uploaded photo, otherwise the initial(s) on a soft teal circle. */
export function ClientAvatar({ client, size = 40, initials = false, className }: { client: Pick<Client, 'id' | 'firstName' | 'lastName'>; size?: number; initials?: boolean; className?: string }) {
  const photo = useClientAvatars((s) => s.photos[client.id])
  if (photo) return <img src={photo} alt="" className={clsx('shrink-0 rounded-full object-cover', className)} style={{ width: size, height: size }} />
  const text = initials ? `${client.firstName[0] ?? ''}${client.lastName[0] ?? ''}` : (client.firstName[0] ?? client.lastName[0] ?? '?')
  return (
    <span
      aria-hidden
      className={clsx('inline-flex shrink-0 select-none items-center justify-center rounded-full bg-primary-subtle font-semibold text-primary', className)}
      style={{ width: size, height: size, fontSize: Math.max(12, Math.round(size * 0.36)) }}
    >
      {text.toUpperCase()}
    </span>
  )
}

export function Stars({ value, size = 14, className }: { value: number; size?: number; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-0.5', className)} aria-label={`${value} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} aria-hidden className={n <= Math.round(value) ? 'fill-accent text-accent' : 'text-line-strong'} />
      ))}
    </span>
  )
}

/** 5 → 1 star distribution bars. */
export function StarBars({ counts, className }: { counts: Record<number, number>; className?: string }) {
  const total = Object.values(counts).reduce((s, n) => s + n, 0)
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      {[5, 4, 3, 2, 1].map((n) => (
        <div key={n} className="flex items-center gap-3 text-small text-muted">
          <span className="w-3 text-right tabular">{n}</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
            <span className="block h-full rounded-full bg-accent" style={{ width: total ? `${((counts[n] ?? 0) / total) * 100}%` : '0%' }} />
          </span>
          <span className="w-8 text-right tabular text-ink">{counts[n] ?? 0}</span>
        </div>
      ))}
    </div>
  )
}

export function BadgeChip({ name, colorKey, className }: { name: string; colorKey: string; className?: string }) {
  const s = swatchFor(colorKey)
  return (
    <span className={clsx('chip whitespace-nowrap font-semibold', className)} style={{ background: s.color, color: s.text }}>
      {name}
    </span>
  )
}

export function Swatches({ value, onChange, label }: { value: string; onChange: (key: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-[repeat(11,minmax(0,1fr))] gap-2.5">
      {SWATCHES.map((s) => (
        <button
          key={s.key}
          type="button"
          role="radio"
          aria-checked={value === s.key}
          aria-label={s.label}
          title={s.label}
          onClick={() => onChange(s.key)}
          className={clsx('flex h-9 w-9 items-center justify-center rounded-full transition-transform hover:scale-105', value === s.key && 'ring-2 ring-primary ring-offset-2 ring-offset-surface')}
          style={{ background: s.color }}
        >
          {value === s.key && <Check size={16} style={{ color: s.text }} aria-hidden />}
        </button>
      ))}
    </div>
  )
}

export function InfoTip({ text }: { text: string }) {
  return (
    <span title={text} aria-label={text} className="inline-flex text-subtle">
      <Info size={16} aria-hidden />
    </span>
  )
}

/** Accordion group used by the filter drawers. */
export function FilterGroup({ icon, title, count, open, onToggle, onClear, action, children }: { icon: ReactNode; title: string; count?: number; open: boolean; onToggle?: () => void; onClear?: () => void; action?: ReactNode; children?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="border-b border-line">
      <div className="flex items-center gap-3 py-4">
        <span className="text-ink">{icon}</span>
        <button type="button" onClick={onToggle} disabled={!onToggle} aria-expanded={onToggle ? open : undefined} className="flex flex-1 items-center gap-2 text-left text-body-lg font-semibold text-ink disabled:cursor-default">
          {title}
          {count ? <span className="chip h-5 bg-primary px-1.5 text-caption text-on-primary">{count}</span> : null}
        </button>
        {count && onClear ? (
          <button type="button" onClick={onClear} className="text-small font-semibold text-primary hover:underline">
            {t('clients.common.clear')}
          </button>
        ) : null}
        {action}
        {onToggle && (
          <button type="button" onClick={onToggle} aria-label={title} className="icon-btn h-8 w-8">
            {open ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
          </button>
        )}
      </div>
      {open && children && <div className="pb-4">{children}</div>}
    </div>
  )
}

/** Single-choice list with a check mark (filter drawers). */
export function OptionList<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" className="flex flex-col">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className="flex h-11 items-center justify-between rounded-md px-2 text-left text-body text-ink hover:bg-sunken"
        >
          {o.label}
          {value === o.value && <Check size={18} className="text-primary" aria-hidden />}
        </button>
      ))}
    </div>
  )
}

/** Multi-choice checkbox list (filter drawers). */
export function CheckList({ options, value, onChange }: { options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-col gap-1">
      {options.map((o) => (
        <label key={o.value} className="flex h-10 cursor-pointer items-center gap-3 rounded-md px-2 text-body text-ink hover:bg-sunken">
          <input
            type="checkbox"
            checked={value.includes(o.value)}
            onChange={(e) => onChange(e.target.checked ? [...value, o.value] : value.filter((v) => v !== o.value))}
            className="h-4 w-4 accent-[rgb(var(--primary))]"
          />
          {o.label}
        </label>
      ))}
    </div>
  )
}

/** Country code + number, as in the reference ("+351" select and "e.g. +1 234 567 8901"). */
export function PhoneField({ id, code, number, onCode, onNumber, invalid }: { id?: string; code: string; number: string; onCode: (v: string) => void; onNumber: (v: string) => void; invalid?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="flex gap-2">
      <Select aria-label={t('clients.form.countryCode')} value={code} onChange={(e) => onCode(e.target.value)} options={COUNTRY_CODES} className="w-28 shrink-0" />
      <input id={id} type="tel" inputMode="tel" value={number} onChange={(e) => onNumber(e.target.value)} placeholder={t('clients.form.phonePlaceholder')} aria-invalid={invalid} className={clsx('input', invalid && 'border-danger')} />
    </div>
  )
}

/** Grey "Learn more"-style inline link button. */
export function LinkButton({ children, onClick, className }: { children: ReactNode; onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={clsx('font-semibold text-primary underline-offset-2 hover:underline', className)}>
      {children}
    </button>
  )
}

/** Round icon tile used by segment cards and reward types. */
export function IconTile({ children, tone = 'primary', className }: { children: ReactNode; tone?: 'primary' | 'accent' | 'success' | 'neutral'; className?: string }) {
  const tones = { primary: 'bg-primary text-on-primary', accent: 'bg-accent text-on-accent', success: 'bg-success-subtle text-success', neutral: 'bg-sunken text-ink' }
  return <span className={clsx('inline-flex shrink-0 items-center justify-center rounded-full', tones[tone], className)}>{children}</span>
}

import clsx from 'clsx'
import {
  Activity,
  Armchair,
  Bath,
  Dog,
  Droplet,
  Dumbbell,
  Eye,
  Hand,
  HandHeart,
  LayoutGrid,
  MapPin,
  Minus,
  PenTool,
  Plus,
  Scissors,
  Sparkles,
  Stethoscope,
  Sun,
  Syringe,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Checkbox, Field, Select, TextInput, TextArea } from '@/components/ui'
import { toMinutes } from '@/lib/time'
import { WEEKDAYS } from '@/api/settings'
import type { Address, OpeningHours, TimeRange, Weekday } from '@/types'

// ─── Business types ────────────────────────────────────────────────────────

export const BUSINESS_TYPES: { name: string; icon: LucideIcon }[] = [
  { name: 'Hair Salon', icon: Scissors },
  { name: 'Nails', icon: Hand },
  { name: 'Eyebrows & Lashes', icon: Eye },
  { name: 'Beauty Salon', icon: Sparkles },
  { name: 'Medspa', icon: Syringe },
  { name: 'Barber', icon: Armchair },
  { name: 'Massage', icon: HandHeart },
  { name: 'Spa & sauna', icon: Bath },
  { name: 'Waxing Salon', icon: Droplet },
  { name: 'Tattooing & piercing', icon: PenTool },
  { name: 'Tanning Studio', icon: Sun },
  { name: 'Fitness & recovery', icon: Dumbbell },
  { name: 'Physical therapy', icon: Activity },
  { name: 'Health practice', icon: Stethoscope },
  { name: 'Pet grooming', icon: Dog },
  { name: 'Other', icon: LayoutGrid },
]

/** Checkbox tiles: the first selected is tagged Primary, later ones are numbered; max 4. */
export function BusinessTypeTiles({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { t } = useTranslation()
  const toggle = (name: string) => {
    if (value.includes(name)) onChange(value.filter((v) => v !== name))
    else if (value.length < 4) onChange([...value, name])
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" role="group" aria-label={t('settings.biz.types.title')}>
      {BUSINESS_TYPES.map(({ name, icon: Icon }) => {
        const index = value.indexOf(name)
        const selected = index !== -1
        const full = !selected && value.length >= 4
        return (
          <button
            key={name}
            type="button"
            aria-pressed={selected}
            disabled={full}
            onClick={() => toggle(name)}
            className={clsx(
              'relative flex h-[116px] flex-col justify-between rounded-lg border bg-surface p-5 text-left transition-colors',
              selected ? 'border-primary ring-1 ring-primary' : 'border-line hover:border-line-strong',
              full && 'cursor-not-allowed opacity-50',
            )}
          >
            <Icon size={26} className={selected ? 'text-primary' : 'text-ink'} aria-hidden />
            <span className="text-body-strong text-ink">{name}</span>
            {selected && (
              <span className="absolute right-3 top-3 rounded-full bg-primary px-2.5 py-0.5 text-caption text-on-primary">
                {index === 0 ? t('settings.biz.types.primary') : index + 1}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ─── Opening hours ─────────────────────────────────────────────────────────

export const TIME_OPTIONS: string[] = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`).concat('23:59')

export function dayName(t: (k: string) => string, day: Weekday): string {
  return t(`settings.biz.days.${day}`)
}

/** "10:00 – 19:00" or "10:00 – 13:00, 14:00 – 19:00". */
export function rangesLabel(ranges: TimeRange[]): string {
  return ranges.map((r) => `${r.start} – ${r.end}`).join(', ')
}

/** Problems in an opening-hours draft, keyed by weekday. */
export function openingHoursErrors(hours: OpeningHours, t: (k: string) => string): Partial<Record<Weekday, string>> {
  const errors: Partial<Record<Weekday, string>> = {}
  WEEKDAYS.forEach((d) => {
    const day = hours[d]
    if (!day.open) return
    if (!day.ranges.length) errors[d] = t('settings.biz.hours.errorRange')
    const sorted = [...day.ranges].sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
    sorted.forEach((r, i) => {
      if (toMinutes(r.end) <= toMinutes(r.start)) errors[d] = t('settings.biz.hours.errorEnd')
      else if (i > 0 && toMinutes(r.start) < toMinutes(sorted[i - 1].end)) errors[d] = t('settings.biz.hours.errorOverlap')
    })
  })
  return errors
}

export function OpeningHoursEditor({ value, onChange, errors = {} }: { value: OpeningHours; onChange: (v: OpeningHours) => void; errors?: Partial<Record<Weekday, string>> }) {
  const { t } = useTranslation()
  const setDay = (d: Weekday, day: OpeningHours[Weekday]) => onChange({ ...value, [d]: day })
  return (
    <div className="flex flex-col divide-y divide-line">
      {WEEKDAYS.map((d) => {
        const day = value[d]
        return (
          <div key={d} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start" data-testid={`hours-day-${d}`}>
            <div className="w-48 shrink-0 pt-2">
              <Checkbox
                checked={day.open}
                onChange={(open) => setDay(d, { open, ranges: open && !day.ranges.length ? [{ start: '10:00', end: '19:00' }] : day.ranges })}
                label={dayName(t, d)}
                hint={day.open ? <span className="text-success">{t('settings.biz.hours.open')}</span> : t('settings.biz.hours.closed')}
              />
            </div>
            {day.open && (
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                {day.ranges.map((r, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Select
                      aria-label={t('settings.biz.hours.start')}
                      className="w-32"
                      value={r.start}
                      options={TIME_OPTIONS}
                      onChange={(e) => setDay(d, { ...day, ranges: day.ranges.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)) })}
                    />
                    <span className="text-body text-muted">{t('settings.biz.hours.to')}</span>
                    <Select
                      aria-label={t('settings.biz.hours.end')}
                      className="w-32"
                      value={r.end}
                      options={TIME_OPTIONS}
                      onChange={(e) => setDay(d, { ...day, ranges: day.ranges.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)) })}
                    />
                    {i === 0 ? (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={t('settings.biz.hours.addRange')}
                        title={t('settings.biz.hours.addRange')}
                        onClick={() => {
                          const last = day.ranges[day.ranges.length - 1]
                          const start = last ? Math.min(toMinutes(last.end) + 60, 22 * 60) : 600
                          const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
                          setDay(d, { ...day, ranges: [...day.ranges, { start: fmt(start), end: fmt(Math.min(start + 120, 23 * 60 + 45)) }] })
                        }}
                      >
                        <Plus size={18} aria-hidden />
                      </button>
                    ) : (
                      <button type="button" className="icon-btn" aria-label={t('settings.biz.hours.removeRange')} title={t('settings.biz.hours.removeRange')} onClick={() => setDay(d, { ...day, ranges: day.ranges.filter((_, j) => j !== i) })}>
                        <Trash2 size={18} aria-hidden />
                      </button>
                    )}
                  </div>
                ))}
                {errors[d] && <p className="text-small text-danger">{errors[d]}</p>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Address ───────────────────────────────────────────────────────────────

export function formatAddress(address: Address): string {
  return [address.line2, address.line1, address.city, [address.postcode, address.district].filter(Boolean).join(' '), address.country].filter(Boolean).join(', ')
}

export interface AddressDraft extends Address {
  directions?: string
}

export function addressErrors(a: AddressDraft, t: (k: string) => string): Partial<Record<keyof AddressDraft, string>> {
  const e: Partial<Record<keyof AddressDraft, string>> = {}
  if (!a.line1.trim()) e.line1 = t('settings.common.required')
  if (!a.city.trim()) e.city = t('settings.common.required')
  if (!a.postcode.trim()) e.postcode = t('settings.common.required')
  else if (a.country === 'Portugal' && !/^\d{4}-\d{3}$/.test(a.postcode.trim())) e.postcode = t('settings.biz.address.postcodeInvalid')
  return e
}

export function AddressFields({ value, onChange, errors = {}, showDirections = true }: { value: AddressDraft; onChange: (v: AddressDraft) => void; errors?: Partial<Record<keyof AddressDraft, string>>; showDirections?: boolean }) {
  const { t } = useTranslation()
  const [directionsOpen, setDirectionsOpen] = useState(Boolean(value.directions))
  const set = (patch: Partial<AddressDraft>) => onChange({ ...value, ...patch })
  const text = (key: 'line1' | 'line2' | 'district' | 'city' | 'region' | 'postcode', label: string, placeholder?: string) => (
    <Field label={label} error={errors[key]}>
      {(id) => <TextInput id={id} value={value[key] ?? ''} placeholder={placeholder} invalid={Boolean(errors[key])} onChange={(e) => set({ [key]: e.target.value })} />}
    </Field>
  )
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {text('line1', t('settings.biz.address.address'), t('settings.biz.address.addressPlaceholder'))}
      {text('line2', t('settings.biz.address.apt'))}
      {text('district', t('settings.biz.address.district'))}
      {text('city', t('settings.biz.address.city'))}
      {text('region', t('settings.biz.address.region'))}
      {text('postcode', t('settings.biz.address.postcode'), '4000-000')}
      <Field label={t('settings.biz.address.country')}>
        {(id) => <Select id={id} value={value.country} options={['Portugal', 'Spain', 'France', 'United Kingdom', 'Ireland']} onChange={(e) => set({ country: e.target.value })} />}
      </Field>
      {showDirections && (
        <div>
          <p className="mb-1.5 text-body-strong text-ink">{t('settings.biz.address.directions')}</p>
          {directionsOpen ? (
            <TextArea aria-label={t('settings.biz.address.directions')} value={value.directions ?? ''} maxLength={500} placeholder={t('settings.biz.address.directionsPlaceholder')} onChange={(e) => set({ directions: e.target.value })} />
          ) : (
            <button type="button" className="inline-flex h-11 items-center gap-1.5 text-body-strong text-primary hover:underline" onClick={() => setDirectionsOpen(true)}>
              <Plus size={16} aria-hidden />
              {t('settings.common.add')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export interface MapView {
  x: number
  y: number
  zoom: number
}

export const DEFAULT_MAP: MapView = { x: 0, y: 0, zoom: 3 }

/**
 * Original stylised map (no third-party tiles): streets, a river and parks
 * drawn in SVG. The pin stays centred; drag the map or zoom to adjust it.
 */
export function MapPlaceholder({ label, view = DEFAULT_MAP, onChange, height = 260 }: { label: string; view?: MapView; onChange?: (v: MapView) => void; height?: number }) {
  const { t } = useTranslation()
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)
  const scale = 0.6 + view.zoom * 0.2
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!onChange) return
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
  }
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || !onChange) return
    onChange({ ...view, x: Math.max(-160, Math.min(160, drag.current.vx + (e.clientX - drag.current.x))), y: Math.max(-120, Math.min(120, drag.current.vy + (e.clientY - drag.current.y))) })
  }
  const end = () => {
    drag.current = null
  }
  return (
    <div
      className={clsx('relative overflow-hidden rounded-lg border border-line bg-[#EEF3F1] dark:bg-[#1F2A28]', onChange && 'cursor-grab active:cursor-grabbing')}
      style={{ height }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={end}
      onPointerCancel={end}
      role="img"
      aria-label={t('settings.biz.address.mapLabel', { name: label })}
    >
      <svg className="absolute left-1/2 top-1/2 h-[520px] w-[900px] select-none" style={{ transform: `translate(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px)) scale(${scale})` }} viewBox="0 0 900 520" aria-hidden>
        <rect width="900" height="520" fill="currentColor" className="text-[#EEF3F1] dark:text-[#1F2A28]" />
        <path d="M-20 400 C 150 360, 260 470, 420 430 S 700 330, 920 380" stroke="#A9CFE3" strokeWidth="38" fill="none" />
        <rect x="90" y="70" width="140" height="90" rx="18" fill="#CFE8D2" />
        <rect x="620" y="60" width="110" height="130" rx="20" fill="#CFE8D2" />
        <circle cx="520" cy="250" r="46" fill="#CFE8D2" />
        {[60, 160, 250, 330].map((y) => (
          <line key={y} x1="0" y1={y} x2="900" y2={y + 20} stroke="#FFFFFF" strokeWidth={y === 250 ? 14 : 8} />
        ))}
        {[120, 300, 450, 600, 780].map((x) => (
          <line key={x} x1={x} y1="0" x2={x - 30} y2="520" stroke="#FFFFFF" strokeWidth={x === 450 ? 14 : 8} />
        ))}
        <line x1="0" y1="500" x2="900" y2="40" stroke="#F4D58D" strokeWidth="10" />
      </svg>
      <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-full flex-col items-center">
        <span className="mb-1 whitespace-nowrap rounded-md bg-surface px-2.5 py-1 text-small text-ink shadow-sm">{label}</span>
        <MapPin size={34} className="fill-primary text-on-primary drop-shadow" aria-hidden />
      </div>
      {onChange && (
        <div className="absolute bottom-3 right-3 flex flex-col overflow-hidden rounded-md border border-line bg-surface shadow-sm" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" className="flex h-9 w-9 items-center justify-center hover:bg-sunken disabled:opacity-40" aria-label={t('settings.biz.address.zoomIn')} disabled={view.zoom >= 6} onClick={() => onChange({ ...view, zoom: view.zoom + 1 })}>
            <Plus size={16} aria-hidden />
          </button>
          <button type="button" className="flex h-9 w-9 items-center justify-center border-t border-line hover:bg-sunken disabled:opacity-40" aria-label={t('settings.biz.address.zoomOut')} disabled={view.zoom <= 0} onClick={() => onChange({ ...view, zoom: view.zoom - 1 })}>
            <Minus size={16} aria-hidden />
          </button>
        </div>
      )}
    </div>
  )
}

/** Small helper to render a phone input with the +351 prefix. */
export function PhoneInput({ id, value, onChange, invalid }: { id: string; value: string; onChange: (v: string) => void; invalid?: boolean }) {
  return <TextInput id={id} prefix="+351" inputMode="tel" value={value.replace(/^\+351\s?/, '')} invalid={invalid} onChange={(e) => onChange(e.target.value)} />
}

export const phoneWithPrefix = (v: string) => (v.trim() ? `+351 ${v.replace(/^\+351\s?/, '').trim()}` : '')

export function validPhone(v: string): boolean {
  const digits = v.replace(/^\+351/, '').replace(/[\s-]/g, '')
  return /^\d{9}$/.test(digits)
}

export const validEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())


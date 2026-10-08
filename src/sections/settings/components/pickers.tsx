import clsx from 'clsx'
import {
  Armchair,
  Bath,
  Bed,
  CalendarCheck,
  Check,
  CheckCheck,
  Coffee,
  DoorOpen,
  Dumbbell,
  EyeOff,
  Flame,
  Flag,
  Hand,
  Heart,
  Lamp,
  Monitor,
  Play,
  Scissors,
  Smile,
  Sparkles,
  Star,
  Sun,
  Timer,
  Waves,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDismiss } from '@/lib/useDismiss'
import { PALETTE, PALETTE_ORDER } from '@/styles/palette'
import type { PaletteColor } from '@/types'

/** The 18 calendar colour swatches (resources, statuses, tags). */
export function ColorSwatches({ value, onChange, label }: { value: PaletteColor; onChange: (c: PaletteColor) => void; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2.5">
      {PALETTE_ORDER.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={PALETTE[c].label}
          title={PALETTE[c].label}
          onClick={() => onChange(c)}
          className={clsx('flex h-9 w-9 items-center justify-center rounded-full ring-offset-2 ring-offset-raised transition-shadow', value === c ? 'ring-2 ring-ink' : 'hover:ring-2 hover:ring-line-strong')}
          style={{ background: PALETTE[c].edge }}
        >
          {value === c && <Check size={16} className="text-white" aria-hidden />}
        </button>
      ))}
    </div>
  )
}

const EMOJIS = ['🥪', '📚', '📆', '☕', '🍽️', '🚗', '🏥', '🧘', '💼', '📞', '🧹', '🛒', '🎓', '✈️', '🏋️', '💤', '🧾', '🎉', '🩺', '🚬', '🍕', '🧴', '💇', '💅']

/** "Choose emoji" button with a small grid popover. */
export function EmojiPicker({ value, onChange }: { value: string; onChange: (e: string) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss([ref], open, () => setOpen(false))
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={t('settings.common.chooseEmoji')} aria-expanded={open} className="flex h-11 w-11 items-center justify-center rounded-sm border border-line-strong bg-surface text-title-3 hover:bg-sunken">
        {value || '🙂'}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-[90] mt-1 grid w-[248px] grid-cols-6 gap-1 rounded-lg border border-line bg-raised p-2 shadow-md">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                onChange(e)
                setOpen(false)
              }}
              className={clsx('flex h-9 w-9 items-center justify-center rounded-md text-title-3 hover:bg-sunken', value === e && 'bg-primary-subtle')}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Icons available for statuses and resource types (stored by key). */
export const ICONS: Record<string, LucideIcon> = {
  calendar: CalendarCheck,
  check: Check,
  'check-check': CheckCheck,
  'door-open': DoorOpen,
  door: DoorOpen,
  play: Play,
  x: X,
  'eye-off': EyeOff,
  star: Star,
  heart: Heart,
  flag: Flag,
  timer: Timer,
  sparkles: Sparkles,
  smile: Smile,
  coffee: Coffee,
  zap: Zap,
  flame: Flame,
  hand: Hand,
  scissors: Scissors,
  armchair: Armchair,
  bed: Bed,
  bath: Bath,
  waves: Waves,
  sun: Sun,
  lamp: Lamp,
  monitor: Monitor,
  dumbbell: Dumbbell,
  wrench: Wrench,
}

export function IconFor({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  const Icon = ICONS[name] ?? Sparkles
  return <Icon size={size} className={className} aria-hidden />
}

/** "Select icon" button with a popover grid of icons. */
export function IconPicker({ value, onChange, keys }: { value: string; onChange: (key: string) => void; keys?: string[] }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss([ref], open, () => setOpen(false))
  const list = keys ?? Object.keys(ICONS).filter((k) => k !== 'door')
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={t('settings.common.selectIcon')} aria-expanded={open} className="flex h-11 w-11 items-center justify-center rounded-sm border border-line-strong bg-surface text-ink hover:bg-sunken">
        <IconFor name={value} size={20} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-[90] mt-1 grid w-[256px] grid-cols-6 gap-1 rounded-lg border border-line bg-raised p-2 shadow-md">
          {list.map((k) => (
            <button
              key={k}
              type="button"
              aria-label={k}
              onClick={() => {
                onChange(k)
                setOpen(false)
              }}
              className={clsx('flex h-9 w-9 items-center justify-center rounded-md text-ink hover:bg-sunken', value === k && 'bg-primary-subtle text-primary')}
            >
              <IconFor name={k} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

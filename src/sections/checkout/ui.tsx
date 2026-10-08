import clsx from 'clsx'
import { ArrowLeft, Banknote, CircleDollarSign, CreditCard, Delete, Gift, Keyboard, QrCode, Smartphone, Wallet, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { MenuGroup } from '@/components/ui'
import { getLang } from '@/i18n/language'
import { useDismiss } from '@/lib/useDismiss'
import { money } from '@/lib/format'
import type { PaymentMethod } from '@/types'

/** Big selectable tile (tip amounts, payment methods, categories). */
export function Tile({ icon, label, sub, selected, onClick, disabled, testId, className, align = 'center' }: { icon?: ReactNode; label: ReactNode; sub?: ReactNode; selected?: boolean; onClick?: () => void; disabled?: boolean; testId?: string; className?: string; align?: 'center' | 'left' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      aria-pressed={selected}
      className={clsx(
        'flex min-h-[96px] flex-col justify-center gap-1.5 rounded-lg border bg-surface px-3 py-3 transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-50 md:min-h-[112px] md:px-5 md:py-4',
        align === 'center' ? 'items-center text-center' : 'items-start text-left',
        selected ? 'border-primary ring-2 ring-primary/40' : 'border-line hover:border-line-strong hover:bg-sunken/60',
        className,
      )}
    >
      {icon && <span className="text-primary">{icon}</span>}
      <span className="text-body-lg font-semibold text-ink">{label}</span>
      {sub && <span className="text-body text-muted">{sub}</span>}
    </button>
  )
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back']

/** Number keypad 1–9 . 0 ⌫, also driven by the physical keyboard. */
export function Keypad({ onPress, rounded = true }: { onPress: (key: string) => void; rounded?: boolean }) {
  const { t } = useTranslation()
  // The decimal key types "." either way; Portuguese shows it as ",".
  const shown = (k: string) => (k === '.' && getLang() === 'pt' ? ',' : k)
  const press = useRef(onPress)
  press.current = onPress
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return
      if (/^[0-9]$/.test(e.key)) press.current(e.key)
      else if (e.key === '.' || e.key === ',') press.current('.')
      else if (e.key === 'Backspace') press.current('back')
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onPress(k)}
          aria-label={k === 'back' ? t('checkout.keypad.backspace') : shown(k)}
          className={clsx('flex h-14 items-center justify-center border border-line bg-surface font-display text-title-2 text-ink transition-colors hover:bg-sunken active:bg-sunken', rounded ? 'rounded-full' : 'rounded-md')}
        >
          {k === 'back' ? <Delete size={22} aria-hidden /> : shown(k)}
        </button>
      ))}
    </div>
  )
}

/** Menu that opens upwards (footer ⋮ buttons sit at the bottom of the drawer). */
export function DropMenu({ groups, trigger, label, align = 'left', direction = 'up', width = 260 }: { groups: MenuGroup[]; trigger?: (p: { open: boolean; toggle: () => void }) => ReactNode; label: string; align?: 'left' | 'right'; direction?: 'up' | 'down'; width?: number }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss([ref], open, () => setOpen(false))
  const toggle = () => setOpen((o) => !o)
  return (
    <div ref={ref} className="relative inline-flex">
      {trigger ? (
        trigger({ open, toggle })
      ) : (
        <button type="button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={toggle} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface text-ink hover:bg-sunken">
          <span aria-hidden className="text-[22px] leading-none">⋮</span>
        </button>
      )}
      {open && (
        <div role="menu" style={{ width }} className={clsx('absolute z-[60] rounded-lg border border-line bg-raised p-1.5 shadow-md', direction === 'up' ? 'bottom-full mb-2' : 'top-full mt-1', align === 'left' ? 'left-0' : 'right-0')}>
          {groups.map((group, gi) => (
            <div key={gi} className={clsx(gi > 0 && 'mt-1 border-t border-line pt-1')}>
              {group.heading && <p className="px-3 pb-1 pt-2 text-body-strong text-ink">{group.heading}</p>}
              {group.items.map((item, ii) => (
                <button
                  key={ii}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false)
                    item.onSelect?.()
                  }}
                  className={clsx('flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-body disabled:cursor-not-allowed disabled:opacity-50', item.danger ? 'text-danger hover:bg-danger-subtle' : 'text-ink hover:bg-sunken')}
                >
                  {item.icon && <span className="shrink-0 text-muted">{item.icon}</span>}
                  <span className="min-w-0 flex-1">
                    {item.label}
                    {item.hint && <span className="block text-small text-muted">{item.hint}</span>}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Left icon rail of the sale and gift card drawers (Summary / Notes / Activity); a scrollable tab row on phones. */
export function IconRail<T extends string>({ items, value, onChange, compact, label }: { items: { value: T; label: string; icon: LucideIcon }[]; value: T; onChange: (v: T) => void; compact?: boolean; label: string }) {
  return (
    <nav className={clsx('flex shrink-0 gap-1 overflow-x-auto border-b border-line bg-surface px-2 md:flex-col md:overflow-visible md:border-b-0 md:border-r md:px-0 md:py-6', compact ? 'md:w-[92px] md:pr-2' : 'md:w-[148px] md:pr-3')} aria-label={label}>
      {items.map((item) => {
        const Icon = item.icon
        const active = value === item.value
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            aria-current={active ? 'page' : undefined}
            className={clsx(
              'flex shrink-0 items-center gap-2 whitespace-nowrap border-b-[3px] px-3 py-3 text-body transition-colors md:flex-col md:gap-1.5 md:whitespace-normal md:rounded-r-md md:border-b-0 md:border-l-[3px]',
              compact ? 'md:items-center md:px-2 md:text-center md:text-small' : 'md:items-start md:px-4 md:text-left md:text-body',
              active ? 'border-primary text-primary md:bg-primary-subtle/60' : 'border-transparent text-muted hover:bg-sunken hover:text-ink',
            )}
          >
            <Icon size={20} aria-hidden />
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}

/** Title row for multi-step modals: optional ← Go back. */
export function BackTitle({ onBack, children }: { onBack?: () => void; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <span className="flex items-center gap-3">
      {onBack && (
        <button type="button" onClick={onBack} aria-label={t('checkout.common.goBack')} className="icon-btn -ml-2 h-9 w-9">
          <ArrowLeft size={20} aria-hidden />
        </button>
      )}
      {children}
    </span>
  )
}

/** Gift card artwork (our own gradient, no third-party illustration). */
export function GiftCardArt({ value, business, customCode, code, expires, onCopy, compact }: { value: number; business?: string; customCode?: string; code: string; expires?: string; onCopy?: () => void; compact?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className={clsx('relative overflow-hidden rounded-xl p-6 text-white shadow-md', compact ? 'min-h-[200px]' : 'min-h-[200px] md:min-h-[260px]')} style={{ background: 'linear-gradient(135deg, #0E6E6A 0%, #1F8C84 45%, #2A9CC2 100%)' }}>
      <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10" aria-hidden />
      <div className="absolute -bottom-16 right-16 h-36 w-36 rounded-full bg-[#F4B23E]/25" aria-hidden />
      <p className="relative font-display text-[32px] font-bold leading-10">{money(value)}</p>
      {business && <p className="relative mt-1 text-body-lg">{business}</p>}
      <div className={clsx('relative flex flex-col gap-3', compact ? 'mt-6' : 'mt-8 md:mt-14')}>
        {customCode && (
          <div>
            <p className="text-small text-white/80">{t('checkout.giftCard.customCode')}</p>
            <p className="text-body-lg font-semibold tracking-wide">{customCode}</p>
          </div>
        )}
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-small text-white/80">{t('checkout.giftCard.code')}</p>
            <p className="flex items-center gap-2 text-body-lg font-semibold tracking-wide">
              {code}
              {onCopy && (
                <button type="button" onClick={onCopy} className="rounded-xs px-1 text-small font-medium underline underline-offset-2 hover:bg-white/15">
                  {t('checkout.giftCard.copy')}
                </button>
              )}
            </p>
          </div>
          <div className="text-right">
            <p className="text-small text-white/80">{t('checkout.giftCard.expires')}</p>
            <p className="text-body-lg font-semibold">{expires ?? t('checkout.giftCard.never')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export const METHOD_ICONS: Record<PaymentMethod, LucideIcon> = {
  cash: Banknote,
  other: CircleDollarSign,
  custom: Wallet,
  gift_card: Gift,
  card_terminal: CreditCard,
  self_checkout: Smartphone,
  qr_code: QrCode,
  manual_card: Keyboard,
  deposit: CreditCard,
  online_card: CreditCard,
}

export function MethodIcon({ method, size = 18, className }: { method: PaymentMethod; size?: number; className?: string }) {
  const Icon = METHOD_ICONS[method] ?? CircleDollarSign
  return <Icon size={size} className={clsx('shrink-0 text-primary', className)} aria-hidden />
}

/** Label / value row used in totals blocks. */
export function TotalRow({ label, value, strong, muted, onLabelClick, className }: { label: ReactNode; value: ReactNode; strong?: boolean; muted?: boolean; onLabelClick?: () => void; className?: string }) {
  return (
    <div className={clsx('flex items-center justify-between gap-4', strong ? 'text-body-lg font-semibold text-ink' : muted ? 'text-body text-muted' : 'text-body text-ink', className)}>
      {onLabelClick ? (
        <button type="button" onClick={onLabelClick} className="text-primary hover:underline">
          {label}
        </button>
      ) : (
        <span>{label}</span>
      )}
      <span className="tabular">{value}</span>
    </div>
  )
}

import clsx from 'clsx'
import { Loader2 } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent' | 'link'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: ReactNode
  iconRight?: ReactNode
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-active',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-sunken',
  ghost: 'text-ink hover:bg-sunken',
  danger: 'bg-danger text-white hover:opacity-90',
  accent: 'bg-accent text-on-accent hover:bg-accent-hover',
  link: 'text-primary hover:underline px-0 h-auto',
}

const SIZES = { sm: 'h-8 px-3 text-small', md: 'h-10 px-4 text-body-strong', lg: 'h-12 px-5 text-body-lg font-semibold' }

/** Standard button. `loading` disables it and shows a spinner. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, iconRight, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-50',
        variant !== 'link' && SIZES[size],
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : icon}
      {children}
      {iconRight}
    </button>
  )
})

export function IconButton({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={clsx('icon-btn', className)} {...rest}>
      {children}
    </button>
  )
}

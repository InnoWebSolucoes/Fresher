import { useTranslation } from 'react-i18next'

/** Placeholder wordmark (SPEC §3): to be replaced with the real logo. */
/** `compact`: only the icon on very narrow screens. */
export function Wordmark({ inverted = false, compact = false }: { inverted?: boolean; compact?: boolean }) {
  const { t } = useTranslation()
  return (
    <span className="inline-flex items-center gap-2 select-none" aria-label={t('brand.name')}>
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" className={inverted ? 'fill-on-primary' : 'fill-primary'} />
        <text
          x="7"
          y="22"
          className={inverted ? 'fill-primary' : 'fill-on-primary'}
          style={{ font: '700 15px "Bricolage Grotesque", system-ui, sans-serif' }}
        >
          ib
        </text>
        <circle cx="25" cy="21" r="2.5" className="fill-accent" />
      </svg>
      <span className={`whitespace-nowrap font-display text-[19px] font-bold leading-none tracking-tight ${inverted ? 'text-on-primary' : 'text-ink'} ${compact ? 'hidden min-[400px]:inline' : ''}`}>
        {t('brand.short')}
        <span className={inverted ? 'text-accent' : 'text-primary'}> {t('brand.product')}</span>
      </span>
    </span>
  )
}

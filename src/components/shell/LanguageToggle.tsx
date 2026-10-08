import { useTranslation } from 'react-i18next'
import { LANGS, setLang, useLang } from '@/i18n/language'

/** PT | EN switch. Portuguese is the default; the choice is remembered in this browser. */
export function LanguageToggle({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  const lang = useLang()
  return (
    <div role="group" aria-label={t('language.switchTo')} className={`inline-flex shrink-0 items-center rounded-full border border-line bg-surface p-0.5 ${className}`} data-testid="language-toggle">
      {LANGS.map((code) => (
        <button
          key={code}
          type="button"
          lang={code === 'pt' ? 'pt-PT' : 'en'}
          title={t(`language.${code}`)}
          aria-pressed={lang === code}
          onClick={() => setLang(code)}
          className={`h-7 min-w-[38px] rounded-full px-2.5 text-small font-semibold transition-colors ${lang === code ? 'bg-primary text-on-primary' : 'text-muted hover:text-ink'}`}
          data-testid={`language-${code}`}
        >
          {t(`language.${code}Short`)}
        </button>
      ))}
    </div>
  )
}

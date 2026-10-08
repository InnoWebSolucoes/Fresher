import { Lock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export function ForbiddenPage() {
  const { t } = useTranslation()
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center" data-testid="forbidden">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-subtle text-warning">
        <Lock size={24} aria-hidden />
      </span>
      <h1 className="font-display text-title-2">{t('forbidden.title')}</h1>
      <p className="max-w-sm text-body text-muted">{t('forbidden.body')}</p>
      <Link to="/calendar" className="btn-primary mt-2">
        {t('forbidden.action')}
      </Link>
    </div>
  )
}

import { Compass } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-subtle text-primary">
        <Compass size={26} aria-hidden />
      </span>
      <h1 className="font-display text-title-2">{t('notFound.title')}</h1>
      <p className="max-w-sm text-body text-muted">{t('notFound.body')}</p>
      <Link to="/calendar" className="btn-primary mt-2">
        {t('notFound.action')}
      </Link>
    </div>
  )
}

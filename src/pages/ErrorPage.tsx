import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useRouteError } from 'react-router-dom'

/** Shown if a page throws, so the rest of the demo keeps working. */
export function ErrorPage() {
  const { t } = useTranslation()
  const error = useRouteError() as Error | undefined
  return (
    <div className="flex h-full min-h-screen flex-col items-center justify-center gap-3 bg-canvas px-6 text-center" data-testid="error-page">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-subtle text-danger">
        <AlertTriangle size={24} aria-hidden />
      </span>
      <h1 className="font-display text-title-2">{t('errorPage.title')}</h1>
      <p className="max-w-md text-body text-muted">{error?.message ?? t('errorPage.unknown')}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <button type="button" className="btn-secondary" onClick={() => window.history.back()}>
          {t('errorPage.back')}
        </button>
        <a href={`${import.meta.env.BASE_URL}calendar`} className="btn-primary">
          {t('notFound.action')}
        </a>
      </div>
    </div>
  )
}

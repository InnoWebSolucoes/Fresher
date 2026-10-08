import { FileText, Hammer, Route as RouteIcon, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { PageDef } from '@/app/routeRegistry'
import { PageHeader } from '@/components/ui/PageHeader'

function StubBody({ page }: { page: PageDef }) {
  const { t } = useTranslation()
  return (
    <section className="card max-w-2xl p-6" data-testid="stub-page">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-accent-subtle text-warning">
          <Hammer size={20} aria-hidden />
        </span>
        <h2 className="font-display text-title-3">{t('stub.heading', { phase: page.phase })}</h2>
      </div>
      <p className="text-body text-muted">{t('stub.body', { phase: page.phase })}</p>
      <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
        <dt className="flex items-center gap-2 text-muted">
          <FileText size={16} aria-hidden />
          {t('stub.reference')}
        </dt>
        <dd className="font-mono text-small text-ink">reference/{page.ref}</dd>
        <dt className="flex items-center gap-2 text-muted">
          <RouteIcon size={16} aria-hidden />
          {t('stub.route')}
        </dt>
        <dd className="font-mono text-small text-ink">{page.path}</dd>
      </dl>
    </section>
  )
}

/** Phase 0 stub for every registered page. */
export function StubPage({ page }: { page: PageDef }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const title = t(`pages.${page.id}.title`)
  const subtitle = t(`pages.${page.id}.subtitle`)

  if (page.layout === 'full') {
    return (
      <>
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-line bg-surface px-6">
          <button type="button" className="btn-secondary h-9 px-3" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>
            <X size={16} aria-hidden />
            {t('fullscreen.close')}
          </button>
          <p className="text-small text-muted">{t('stub.phase', { phase: page.phase })}</p>
          <Link to="/" className="sr-only">
            {t('notFound.action')}
          </Link>
        </header>
        <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-6 py-10">
          <PageHeader title={title} subtitle={subtitle} />
          <StubBody page={page} />
        </div>
      </>
    )
  }

  const padded = page.layout === 'shell'
  return (
    <div className={padded ? 'mx-auto max-w-[1120px] px-8 py-8' : ''}>
      <PageHeader title={title} subtitle={subtitle} />
      <StubBody page={page} />
    </div>
  )
}

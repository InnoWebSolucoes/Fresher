import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Wordmark } from '@/components/shell/Wordmark'
import { Toaster } from '@/components/shell/Toaster'

const PREVIEW = [
  { time: '09:30', client: 'Beatriz Sousa', service: 'Corte e brushing', tone: 'bg-info-subtle text-info' },
  { time: '10:45', client: 'Rui Teixeira', service: 'Barba clássica', tone: 'bg-accent-subtle text-warning' },
  { time: '12:00', client: 'Inês Moreira', service: 'Manicure gel', tone: 'bg-success-subtle text-success' },
  { time: '14:15', client: 'Carla Antunes', service: 'Coloração raiz', tone: 'bg-primary-subtle text-primary' },
]

/** Split login screen: form on the left, brand panel on the right. */
export function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="grid min-h-full lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Wordmark />
        <main className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">{children}</main>
      </div>
      <aside className="relative hidden overflow-hidden bg-primary lg:flex lg:flex-col lg:justify-center lg:px-16" aria-hidden="true">
        {/* Abstract calendar grid artwork */}
        <svg className="absolute inset-0 h-full w-full opacity-[0.12]" preserveAspectRatio="none">
          <defs>
            <pattern id="grid" width="64" height="48" patternUnits="userSpaceOnUse">
              <path d="M64 0H0V48" fill="none" stroke="white" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-accent/25 blur-2xl" />
        <div className="relative max-w-md">
          <h2 className="font-display text-[36px] font-bold leading-[44px] text-on-primary">{t('auth.brandPanelTitle')}</h2>
          <p className="mt-4 text-body-lg text-on-primary/80">{t('auth.brandPanelBody')}</p>
          <div className="mt-10 rounded-xl bg-surface p-5 shadow-lg">
            <p className="mb-3 text-caption uppercase tracking-wide text-muted">{t('auth.brandPanelToday')}</p>
            <ul className="flex flex-col gap-2">
              {PREVIEW.map((row) => (
                <li key={row.time} className="flex items-center gap-3 rounded-md border border-line px-3 py-2.5">
                  <span className="tabular w-12 text-body-strong text-ink">{row.time}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-strong text-ink">{row.client}</span>
                    <span className="block truncate text-small text-muted">{row.service}</span>
                  </span>
                  <span className={`chip ${row.tone}`}>●</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>
      <Toaster />
    </div>
  )
}

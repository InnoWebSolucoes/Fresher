import {
  Blocks,
  Building2,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Plug,
  Receipt,
  Smile,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SETTINGS_CATEGORIES } from '@/app/navigation'
import { PageHeader } from '@/components/ui/PageHeader'
import { WORKSPACE_NAME } from '@/mock/workspace'

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  'business-setup': Building2,
  scheduling: CalendarClock,
  sales: Receipt,
  clients: Smile,
  billing: Wallet,
  team: Users,
  forms: ClipboardList,
  payments: CreditCard,
}

const ROW_SECTIONS: { id: string; rows: { key: string; to: string; icon?: LucideIcon }[] }[] = [
  {
    id: 'online',
    rows: [
      { key: 'marketplaceProfile', to: '/online-presence/locations' },
      { key: 'reserveWithGoogle', to: '/online-presence/google-reserve' },
      { key: 'facebookInstagram', to: '/online-presence/facebook-setup' },
      { key: 'productStore', to: '/online-presence/store' },
      { key: 'linkBuilder', to: '/online-presence/buttons-and-links' },
    ],
  },
  {
    id: 'marketing',
    rows: [
      { key: 'blast', to: '/marketing/blast-campaigns/home' },
      { key: 'automations', to: '/marketing/automated-messages' },
      { key: 'deals', to: '/marketing/deals' },
      { key: 'smartPricing', to: '/marketing/peak-pricing' },
      { key: 'sentMessages', to: '/marketing/notifications' },
      { key: 'ratings', to: '/clients/online-reputation' },
    ],
  },
  {
    id: 'other',
    rows: [
      { key: 'addons', to: '/add-ons', icon: Blocks },
      { key: 'integrations', to: '/add-ons#integrations', icon: Plug },
    ],
  },
]

/** Workspace settings landing (reference settings-business-setup.md §0). */
export function SettingsLandingPage() {
  const { t } = useTranslation()
  return (
    <div className="mx-auto max-w-[1120px] px-8 py-8">
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle', { business: WORKSPACE_NAME })} />
      <nav className="mb-6 flex gap-2" aria-label={t('settings.title')}>
        {(['settings', 'online', 'marketing', 'other'] as const).map((tab) => (
          <a key={tab} href={`#${tab}`} className="chip h-9 bg-surface px-4 text-body-strong text-ink ring-1 ring-line hover:bg-sunken">
            {t(`settings.tabs.${tab}`)}
          </a>
        ))}
      </nav>

      <section id="settings" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {SETTINGS_CATEGORIES.map((category) => {
          const Icon = CATEGORY_ICONS[category.id]
          return (
            <Link
              key={category.id}
              to={category.to}
              className="card flex flex-col gap-3 p-5 transition-shadow duration-fast hover:border-primary/40 hover:shadow-sm"
              data-testid={`settings-card-${category.id}`}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-md bg-primary-subtle text-primary">
                <Icon size={22} aria-hidden />
              </span>
              <span>
                <span className="block font-display text-title-3 text-ink">{t(category.title)}</span>
                <span className="mt-1 block text-body text-muted">{t(category.description)}</span>
              </span>
            </Link>
          )
        })}
      </section>

      {ROW_SECTIONS.map((section) => (
        <section key={section.id} id={section.id} className="mt-10">
          <h2 className="mb-3 font-display text-title-3">{t(`settings.tabs.${section.id}`)}</h2>
          <div className="card divide-y divide-line">
            {section.rows.map((row) => {
              const [title, description] = t(`settings.rows.${row.key}`, { returnObjects: true }) as [string, string]
              const Icon = row.icon ?? ChevronRight
              return (
                <Link key={row.key} to={row.to} className="flex items-center gap-4 px-5 py-4 hover:bg-sunken">
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-sunken text-primary">
                    <Icon size={18} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-body-strong text-ink">{title}</span>
                    <span className="block text-body text-muted">{description}</span>
                  </span>
                  <span className="text-body-strong text-primary">{t('settings.view')}</span>
                </Link>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

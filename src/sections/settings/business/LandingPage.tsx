import {
  BarChart3,
  Blocks,
  Building2,
  CalendarClock,
  ClipboardList,
  CreditCard,
  Facebook,
  Link2,
  Megaphone,
  MessageSquareText,
  Percent,
  Plug,
  Receipt,
  Search,
  ShoppingBag,
  Smile,
  Star,
  Store,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SETTINGS_CATEGORIES } from '@/app/navigation'
import { PageHeader } from '@/components/ui'
import { useWorkspace } from '../hooks'

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

const ROW_SECTIONS: { id: string; rows: { key: string; to: string; icon: LucideIcon }[] }[] = [
  {
    id: 'online',
    rows: [
      { key: 'marketplaceProfile', to: '/online-presence/locations', icon: Store },
      { key: 'reserveWithGoogle', to: '/online-presence/google-reserve', icon: Search },
      { key: 'facebookInstagram', to: '/online-presence/facebook-setup', icon: Facebook },
      { key: 'productStore', to: '/online-presence/store', icon: ShoppingBag },
      { key: 'linkBuilder', to: '/online-presence/buttons-and-links', icon: Link2 },
    ],
  },
  {
    id: 'marketing',
    rows: [
      { key: 'blast', to: '/marketing/blast-campaigns/home', icon: Megaphone },
      { key: 'automations', to: '/marketing/automated-messages', icon: Zap },
      { key: 'deals', to: '/marketing/deals', icon: Percent },
      { key: 'smartPricing', to: '/marketing/peak-pricing', icon: BarChart3 },
      { key: 'sentMessages', to: '/marketing/notifications', icon: MessageSquareText },
      { key: 'ratings', to: '/clients/online-reputation', icon: Star },
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

/** Workspace settings landing (settings-business-setup.md §0), named after the live business name. */
export function LandingPage() {
  const { t } = useTranslation()
  const workspace = useWorkspace()
  return (
    <div className="mx-auto max-w-[1120px] px-4 py-5 md:px-8 md:py-8">
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle', { business: workspace?.name ?? '' })} />
      <nav className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 py-0.5 [scrollbar-width:none] md:mx-0 md:mb-6 md:overflow-visible md:px-0 md:py-0" aria-label={t('settings.title')}>
        {(['settings', 'online', 'marketing', 'other'] as const).map((tab) => (
          <a key={tab} href={`#${tab}`} className="chip h-9 shrink-0 whitespace-nowrap bg-surface px-4 text-body-strong text-ink ring-1 ring-line hover:bg-sunken">
            {t(`settings.tabs.${tab}`)}
          </a>
        ))}
      </nav>

      <section id="settings" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={t('settings.tabs.settings')}>
        {SETTINGS_CATEGORIES.map((category) => {
          const Icon = CATEGORY_ICONS[category.id] ?? Building2
          const links = category.groups.flatMap((g) => g.links)
          return (
            <div key={category.id} className="card group relative flex flex-col gap-3 p-5 transition-shadow duration-fast hover:border-primary/40 hover:shadow-sm" data-testid={`settings-card-${category.id}`}>
              <span className="flex h-11 w-11 items-center justify-center rounded-md bg-primary-subtle text-primary">
                <Icon size={22} aria-hidden />
              </span>
              <span>
                <Link to={category.to} className="block font-display text-title-3 text-ink after:absolute after:inset-0 after:rounded-lg after:content-['']">
                  {t(category.title)}
                </Link>
                <span className="mt-1 block text-body text-muted">{t(category.description)}</span>
              </span>
              <ul className="relative z-10 mt-auto flex flex-wrap gap-x-3 gap-y-0 border-t md:gap-y-1 border-line pt-3" aria-label={t('settings.landing.pagesIn', { category: t(category.title) })}>
                {links.map((link) => (
                  <li key={link.to}>
                    <Link to={link.to} className="inline-block py-1 text-small text-muted hover:text-primary hover:underline md:inline md:py-0" data-testid={`settings-link-${link.to.split('/').pop()}`}>
                      {t(link.label)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </section>

      {ROW_SECTIONS.map((section) => (
        <section key={section.id} id={section.id} className="mt-10 scroll-mt-6">
          <h2 className="mb-3 font-display text-title-3">{t(`settings.tabs.${section.id}`)}</h2>
          <div className="card divide-y divide-line">
            {section.rows.map((row) => {
              const [title, description] = t(`settings.rows.${row.key}`, { returnObjects: true }) as [string, string]
              const Icon = row.icon
              return (
                <Link key={row.key} to={row.to} className="flex items-center gap-3 px-4 py-4 hover:bg-sunken md:gap-4 md:px-5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sunken text-primary">
                    <Icon size={18} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-body-strong text-ink">{title}</span>
                    <span className="block text-body text-muted">{description}</span>
                  </span>
                  <span className="shrink-0 text-body-strong text-primary">{t('settings.view')}</span>
                </Link>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

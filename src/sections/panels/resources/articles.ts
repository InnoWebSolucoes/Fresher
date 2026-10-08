/**
 * Help centre articles (original content). Titles, summaries and bodies live
 * in en.json under panels.articles.<slug>; this file holds the search
 * keywords and the page each article relates to.
 */
export interface HelpArticle {
  slug: string
  keywords: string[]
  /** In-app page the article is about ("Open this page"). */
  to?: string
}

export const ARTICLES: HelpArticle[] = [
  { slug: 'manage-shifts', keywords: ['shift', 'shifts', 'schedule', 'scheduled', 'working hours', 'rota', 'repeating'], to: '/team/scheduled-shifts' },
  { slug: 'patch-tests', keywords: ['patch test', 'allergy', 'allergies', 'consultation', 'client profile'], to: '/clients/list' },
  { slug: 'blast-campaigns', keywords: ['blast', 'campaign', 'email marketing', 'sms', 'newsletter', 'audience'], to: '/marketing/blast-campaigns/home' },
  { slug: 'smart-pricing', keywords: ['smart pricing', 'peak', 'dynamic pricing', 'quiet', 'busy', 'price'], to: '/marketing/peak-pricing' },
  { slug: 'add-team-members', keywords: ['team', 'team member', 'staff', 'invite', 'employee', 'add'], to: '/team/team-members' },
  { slug: 'create-appointment', keywords: ['appointment', 'booking', 'calendar', 'reschedule', 'repeat', 'group', 'new appointment'], to: '/calendar' },
  { slug: 'checkout-sale', keywords: ['checkout', 'check out', 'sale', 'payment', 'tip', 'receipt', 'quick sale', 'pay'], to: '/sales/daily-sales' },
  { slug: 'refunds', keywords: ['refund', 'void', 'return', 'cancel sale'], to: '/sales/sales-list' },
  { slug: 'online-booking', keywords: ['online booking', 'book now', 'link builder', 'website', 'button', 'facebook', 'instagram', 'google'], to: '/online-presence/buttons-and-links' },
  { slug: 'marketplace-profile', keywords: ['marketplace', 'profile', 'listing', 'photos', 'amenities', 'online presence'], to: '/online-presence/locations' },
  { slug: 'deposits-policy', keywords: ['deposit', 'cancellation fee', 'no-show', 'no show', 'policy', 'late cancellation'], to: '/setup/payments/payment-policy' },
  { slug: 'gift-cards', keywords: ['gift card', 'voucher', 'redeem', 'gift'], to: '/sales/gift-cards' },
  { slug: 'packages-memberships', keywords: ['package', 'packages', 'membership', 'memberships', 'bundle', 'subscription'], to: '/catalogue/packages' },
  { slug: 'import-clients', keywords: ['import', 'csv', 'clients', 'client list', 'migrate', 'upload'], to: '/clients/list' },
  { slug: 'client-segments', keywords: ['segment', 'segments', 'loyal', 'lapsed', 'groups', 'filter clients'], to: '/clients/segments' },
  { slug: 'automations-reminders', keywords: ['automation', 'automations', 'reminder', 'confirmation', 'automated messages', 'whatsapp', 'messages history'], to: '/marketing/automated-messages' },
  { slug: 'products-stock', keywords: ['product', 'products', 'stock', 'inventory', 'stocktake', 'stock order', 'supplier', 'low stock'], to: '/catalogue/products' },
  { slug: 'register-cash', keywords: ['register', 'cash', 'float', 'drawer', 'cash movement', 'close register'], to: '/sales/register' },
  { slug: 'daily-sales', keywords: ['daily sales', 'transaction summary', 'cash movement', 'end of day', 'payments'], to: '/sales/daily-sales' },
  { slug: 'reports', keywords: ['report', 'reports', 'export', 'analytics', 'insights', 'performance', 'dashboard'], to: '/reports' },
  { slug: 'pay-runs', keywords: ['pay run', 'pay runs', 'wages', 'commission', 'commissions', 'timesheet', 'payroll', 'tips'], to: '/team/payrun/overview' },
  { slug: 'permissions', keywords: ['permission', 'permissions', 'access', 'role', 'security', 'staff access'], to: '/setup/team/permissions' },
  { slug: 'wallet-payouts', keywords: ['wallet', 'payout', 'payouts', 'bank', 'balance', 'fees', 'credits', 'transfer'], to: '/setup/billing/bank-accounts' },
  { slug: 'client-connect', keywords: ['client connect', 'inbox', 'messages', 'message', 'chat', 'two-way', 'conversation'], to: '/connect' },
  { slug: 'waitlist', keywords: ['waitlist', 'waiting list', 'gaps', 'cancellation'], to: '/calendar' },
  { slug: 'billing-plan', keywords: ['billing', 'plan', 'subscription', 'invoice', 'invoices', 'independent', 'team plan', 'message credits'], to: '/setup/billing/subscriptions' },
  { slug: 'account-security', keywords: ['password', 'security', 'login', 'sign out', 'two-factor', 'sessions', 'account'], to: '/user-account/personal-settings/login-security' },
  { slug: 'online-profile', keywords: ['profile', 'portfolio', 'avatar', 'interests', 'social links', 'reviews', 'photo tips'], to: '/user-account/profile' },
  { slug: 'referrals', keywords: ['referral', 'refer', 'earn', '€130', 'credit', 'invite a business'] },
]

export const TOP_ARTICLES = ['manage-shifts', 'patch-tests', 'blast-campaigns', 'smart-pricing', 'add-team-members']

const STOP = new Set(['the', 'a', 'an', 'to', 'your', 'and', 'of', 'in', 'for', 'how', 'with', 'on', 'my', 'i', 'do', 'can', 'is', 'it', 'up', 'set', 'what', 'or', 'by', 'from', 'about', 'more', 'learn'])

export function tokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}€]+/u)
    .filter((w) => w.length > 1 && !STOP.has(w))
}

/** Rank articles for a query. `text(slug)` returns the article's title, summary and body. */
export function searchArticles(query: string, text: (slug: string) => { title: string; summary: string; body: string }): HelpArticle[] {
  const words = tokens(query)
  if (!words.length) return []
  const scored = ARTICLES.map((article) => {
    const { title, summary, body } = text(article.slug)
    const t = title.toLowerCase()
    const s = summary.toLowerCase()
    const b = body.toLowerCase()
    const k = article.keywords.join(' ').toLowerCase()
    let score = 0
    for (const w of words) {
      const stem = w.length > 5 ? w.slice(0, w.length - 2) : w
      if (t.includes(stem)) score += 4
      if (k.includes(stem)) score += 3
      if (s.includes(stem)) score += 2
      if (b.includes(stem)) score += 1
    }
    if (t.includes(query.trim().toLowerCase())) score += 5
    return { article, score }
  })
  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.article)
}

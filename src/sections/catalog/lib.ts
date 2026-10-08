import type { Bundle, ExtraTime, ID, PaletteColor, Product, Service, ServiceVariant } from '@/types'
import { round2 } from '@/lib/format'

/** Pure helpers shared by the catalog pages. */

export const totalExtra = (extra: ExtraTime[]) => extra.reduce((s, e) => s + e.durationMin, 0)
export const serviceTotalDuration = (s: Pick<Service, 'durationMin' | 'extraTime'>) => s.durationMin + totalExtra(s.extraTime)

/** "30m", "1h 30m", "3h" (service list export). */
export function durationShort(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  return `${m}m`
}

export const findService = (services: Service[], id: ID) => services.find((s) => s.id === id)

/** Sum of the included services' prices. */
export const bundleBasePrice = (bundle: Pick<Bundle, 'serviceIds'>, services: Service[]) => round2(bundle.serviceIds.reduce((sum, id) => sum + (findService(services, id)?.price ?? 0), 0))

export function bundlePrice(bundle: Pick<Bundle, 'serviceIds' | 'priceType' | 'price' | 'discountPct'>, services: Service[]): number {
  const base = bundleBasePrice(bundle, services)
  switch (bundle.priceType) {
    case 'custom':
      return bundle.price ?? base
    case 'percentage':
      return round2(base * (1 - (bundle.discountPct ?? 0) / 100))
    case 'free':
      return 0
    default:
      return base
  }
}

export function bundleDuration(bundle: Pick<Bundle, 'serviceIds' | 'schedule'>, services: Service[], extra: Record<ID, ExtraTime[]> = {}): number {
  const durations = bundle.serviceIds.map((id) => {
    const s = findService(services, id)
    if (!s) return 0
    return s.durationMin + totalExtra(extra[id] ?? s.extraTime)
  })
  if (!durations.length) return 0
  return bundle.schedule === 'parallel' ? Math.max(...durations) : durations.reduce((a, b) => a + b, 0)
}

/** Stable 8-digit "Service ID" for exports (reference shows numeric ids). */
export function numericId(id: string): string {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return String(10000000 + (Math.abs(h) % 89999999))
}

export const slugify = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** "ARG-98984": three letters from the brand (or name) and five digits. */
export function generateSku(seed: string): string {
  const letters = (seed.normalize('NFD').replace(/[^A-Za-z]/g, '').slice(0, 3) || 'PRD').toUpperCase().padEnd(3, 'X')
  const digits = String(Math.floor(10000 + Math.random() * 89999))
  return `${letters}-${digits}`
}

export const stockState = (p: Pick<Product, 'stock' | 'lowStockLevel' | 'trackStock'>): 'out' | 'low' | 'ok' => (!p.trackStock ? 'ok' : p.stock <= 0 ? 'out' : p.stock <= p.lowStockLevel ? 'low' : 'ok')

/** Durations offered in selects: 5 min … 12 hr. */
export const DURATIONS: number[] = [
  ...Array.from({ length: 12 }, (_, i) => (i + 1) * 5),
  ...Array.from({ length: 22 }, (_, i) => 75 + i * 15),
  ...Array.from({ length: 13 }, (_, i) => 420 + i * 30),
].filter((v, i, a) => a.indexOf(v) === i && v <= 720)

/** Colours offered for categories (catalog.md §1.2). */
export const CATEGORY_COLORS: PaletteColor[] = ['blue', 'darkBlue', 'jordyBlue', 'indigo', 'lavender', 'purple', 'wisteria', 'pink', 'coral', 'bloodOrange', 'orange', 'amber', 'yellow', 'lime', 'green', 'teal', 'cyan']

export const isPalette = (c: string): c is PaletteColor => CATEGORY_COLORS.includes(c as PaletteColor) || c === 'red'

/** Product measures (catalog.md §4). */
export const MEASURES = ['ml', 'l', 'floz', 'g', 'kg', 'gal', 'oz', 'lb', 'cm', 'ft', 'in', 'whole'] as const

/** Package themes (catalog.md §2): stored name → gradient. */
export const PACKAGE_THEMES: { name: string; key: string; gradient: string }[] = [
  { name: 'Purple Veil', key: 'purpleVeil', gradient: 'linear-gradient(135deg,#5b2bd6 0%,#a24be8 45%,#d14fb8 100%)' },
  { name: 'Blue Rich', key: 'blueRich', gradient: 'linear-gradient(135deg,#0a6cf5 0%,#3b8bff 55%,#7b7fe8 100%)' },
  { name: 'Purple Rich', key: 'purpleRich', gradient: 'linear-gradient(135deg,#9a3fe0 0%,#6f45d8 50%,#e05ad6 100%)' },
  { name: 'Pink Rich', key: 'pinkRich', gradient: 'linear-gradient(135deg,#f0368f 0%,#f2117a 50%,#ff8fc2 100%)' },
  { name: 'Orange Rich', key: 'orangeRich', gradient: 'linear-gradient(135deg,#e2343c 0%,#f2851e 55%,#f3b13a 100%)' },
  { name: 'Green Rich', key: 'greenRich', gradient: 'linear-gradient(135deg,#1aa64a 0%,#7cc520 55%,#d6d71a 100%)' },
  { name: 'Neutral Rich', key: 'neutralRich', gradient: 'linear-gradient(135deg,#8ea2a8 0%,#657b81 50%,#9fb0b4 100%)' },
  { name: 'Green Algae', key: 'greenAlgae', gradient: 'linear-gradient(135deg,#0f8a80 0%,#4fd8b8 50%,#0b5ea8 100%)' },
  { name: 'Sudden Sky', key: 'suddenSky', gradient: 'linear-gradient(135deg,#1534f0 0%,#3f5ff2 50%,#14a6d8 100%)' },
  { name: 'Purple Blood', key: 'purpleBlood', gradient: 'linear-gradient(135deg,#b94ef2 0%,#ee3fd2 50%,#f2163a 100%)' },
  { name: 'Yellow Sunrise', key: 'yellowSunrise', gradient: 'linear-gradient(135deg,#f45bb4 0%,#f56a3a 50%,#fbc21c 100%)' },
  { name: 'Turquoise Rich', key: 'turquoiseRich', gradient: 'linear-gradient(135deg,#6b4cf0 0%,#5a7cf2 45%,#3fd2f2 100%)' },
]

export const themeOf = (name: string | undefined) => PACKAGE_THEMES.find((t) => t.name === name) ?? PACKAGE_THEMES[0]

/**
 * Treatment types offered by the searchable combobox (used to help clients
 * find a service on the marketplace). Data values, grouped by family.
 */
export const TREATMENT_TYPES: { name: string; group: string }[] = [
  ...['Haircut', "Women's haircut", "Men's haircut", 'Kids haircut', 'Fade haircut', 'Buzz cut', 'Fringe trim', 'Blow dry', "Women's blow dry", 'Updo', 'Hair styling', 'Bridal hair', 'Keratin treatment', 'Hair treatment', 'Scalp treatment', 'Hair extensions', 'Perm', 'Hair straightening', 'Wash, haircut, styling & beard trim'].map((name) => ({ name, group: 'Hair' })),
  ...['Hair colouring', 'Root touch up', 'Balayage', 'Highlights', 'Ombre', 'Toner', 'Colour correction', 'Bleach', 'Grey blending'].map((name) => ({ name, group: 'Hair colour' })),
  ...['Beard trim', 'Haircut & beard trim', 'Beard shave', 'Mustache & beard trim', 'Beard grooming', 'Beard coloring', 'Beard shaping', 'Hot towel shave', 'Head shave'].map((name) => ({ name, group: 'Barbering' })),
  ...['Manicure', 'Gel manicure', 'Pedicure', 'Gel pedicure', 'Acrylic nails', 'Nail extensions', 'Nail art', 'Nail polish removal', 'Nail repair', 'French manicure'].map((name) => ({ name, group: 'Nails' })),
  ...['Facial', 'Hydrating facial', 'Anti-ageing facial', 'Deep cleansing facial', 'Chemical peel', 'Microdermabrasion', 'Skin consultation'].map((name) => ({ name, group: 'Skin' })),
  ...['Eyebrow shaping', 'Eyebrow tinting', 'Eyebrow lamination', 'Lash lift', 'Eyelash tinting', 'Eyelash extensions', 'Makeup', 'Bridal makeup'].map((name) => ({ name, group: 'Brows, lashes & makeup' })),
  ...['Leg waxing', 'Bikini waxing', 'Underarm waxing', 'Arm waxing', 'Face waxing', 'Back waxing', 'Threading'].map((name) => ({ name, group: 'Hair removal' })),
  ...['Swedish massage', 'Deep tissue massage', 'Hot stone massage', 'Head massage', 'Back massage', 'Sports massage', 'Aromatherapy massage', 'Couples massage', 'Reflexology', 'Lymphatic drainage'].map((name) => ({ name, group: 'Massage' })),
  ...['Body scrub', 'Body wrap', 'Spa package', 'Sauna', 'Tanning', 'Spray tan'].map((name) => ({ name, group: 'Body & spa' })),
]

/** Simulated "Generate with AI" copy (≈250 characters, warm salon tone). */
export function generateDescription(name: string, categoryName: string | undefined, treatment: string, durationMin: number): string {
  const subject = (treatment || name || 'service').toLowerCase()
  const text = `${name} ${categoryName ?? ''} ${treatment}`.toLowerCase()
  const minutes = durationMin >= 60 ? `${Math.floor(durationMin / 60)} hour${durationMin >= 120 ? 's' : ''}${durationMin % 60 ? ` ${durationMin % 60} minutes` : ''}` : `${durationMin} minutes`
  if (/beard|shave|barber|fade|mustache/.test(text))
    return `Experience a fresh take on your facial hair with our expert ${subject} service. Enjoy a polished look that enhances your style while maintaining the perfect balance between neatness and personal expression. Let us help you achieve the beard of your dreams.`
  if (/colou?r|balayage|highlight|toner|root|bleach/.test(text))
    return `Refresh your look with our ${subject}. Our colour specialists start with a consultation, choose the right shade for your skin tone and lifestyle, and finish with a gloss for shine that lasts. Expect rich, even colour in about ${minutes}.`
  if (/nail|manicure|pedicure|acrylic|gel/.test(text))
    return `Treat your hands and feet to our ${subject}. We shape, tidy cuticles and finish with a flawless, long-lasting polish in the shade you love. Relax in a calm, hygienic space and leave with nails that stay picture-perfect for weeks.`
  if (/massage|reflexology|scrub|spa|body/.test(text))
    return `Unwind completely with our ${subject}. Our therapists tailor the pressure to you, easing tension and leaving body and mind deeply relaxed. Take ${minutes} just for yourself and walk out feeling lighter, calmer and restored.`
  if (/facial|skin|brow|lash|wax|peel/.test(text))
    return `Reveal your best self with our ${subject}. We tailor each step to your skin and features, using gentle, professional products for a clean, natural finish. In just ${minutes} you'll leave feeling fresh, confident and cared for.`
  return `Enjoy our ${subject}, delivered by an experienced stylist who listens first and works with your hair type and routine. Finished with a wash and style, it takes about ${minutes} and leaves you with a look that is easy to keep at home.`
}

export const variantLabel = (service: Pick<Service, 'name'>, variant: ServiceVariant) => `${service.name} - ${variant.name}`

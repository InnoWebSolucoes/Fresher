import type { PaletteColor } from '@/types'

/** Fixed catalogue for the seed: 6 categories, 40 services (SPEC §4). */
export interface ServiceSeed {
  key: string
  name: string
  treatment: string
  price: number
  priceType?: 'fixed' | 'from'
  duration: number
  processing?: number
  variants?: { name: string; price: number; duration: number }[]
  patch?: boolean
  weight: number
  description: string
}

export interface CategorySeed {
  key: string
  name: string
  color: PaletteColor
  description: string
  services: ServiceSeed[]
}

export const CATEGORY_SEED: CategorySeed[] = [
  {
    key: 'hair',
    name: 'Hair & styling',
    color: 'blue',
    description: 'Cuts, blow-dries and styling',
    services: [
      { key: 'womens-cut', name: "Women's haircut", treatment: 'Haircut', price: 38, duration: 60, weight: 9, description: 'Consultation, wash, precision cut and finish.', variants: [ { name: 'Short hair', price: 32, duration: 45 }, { name: 'Long hair', price: 42, duration: 75 } ] },
      { key: 'mens-cut', name: "Men's haircut", treatment: 'Haircut', price: 18, duration: 30, weight: 7, description: 'Scissor or clipper cut with a wash and style.' },
      { key: 'blow-dry', name: 'Blow dry', treatment: 'Blow dry', price: 25, duration: 45, weight: 8, description: 'Smooth, volumised blow dry.' },
      { key: 'wash-blow', name: 'Wash & blow dry', treatment: 'Blow dry', price: 28, duration: 50, weight: 5, description: 'Relaxing wash with a deep-condition rinse and blow dry.' },
      { key: 'updo', name: 'Updo & event styling', treatment: 'Updo', price: 55, duration: 75, weight: 2, description: 'Bridal, party and event hair.' },
      { key: 'kids-cut', name: 'Kids haircut (under 12)', treatment: 'Kids haircut', price: 14, duration: 30, weight: 3, description: 'Quick, friendly cuts for children.' },
      { key: 'keratin', name: 'Keratin smoothing treatment', treatment: 'Keratin treatment', price: 120, priceType: 'from', duration: 150, weight: 1, description: 'Frizz control that lasts up to 3 months.' },
      { key: 'fringe', name: 'Fringe trim', treatment: 'Fringe trim', price: 8, duration: 15, weight: 2, description: 'Quick tidy between cuts.' },
    ],
  },
  {
    key: 'colour',
    name: 'Colour',
    color: 'purple',
    description: 'Colour, highlights and toners',
    services: [
      { key: 'root', name: 'Root touch-up', treatment: 'Root touch up', price: 48, duration: 60, processing: 30, patch: true, weight: 5, description: 'Covers regrowth up to 3 cm.' },
      { key: 'full-colour', name: 'Full head colour', treatment: 'Hair colouring', price: 65, duration: 75, processing: 35, patch: true, weight: 4, description: 'Single-process permanent colour.', variants: [ { name: 'Short hair', price: 58, duration: 60 }, { name: 'Long hair', price: 78, duration: 90 } ] },
      { key: 'balayage', name: 'Balayage', treatment: 'Balayage', price: 110, priceType: 'from', duration: 150, processing: 30, patch: true, weight: 3, description: 'Hand-painted, soft and natural lightening.' },
      { key: 'highlights', name: 'Highlights (half head)', treatment: 'Highlights', price: 75, duration: 90, processing: 30, patch: true, weight: 3, description: 'Foil highlights through the top and sides.' },
      { key: 'toner', name: 'Toner & gloss', treatment: 'Toner', price: 30, duration: 45, weight: 3, description: 'Refresh tone and add shine.' },
      { key: 'correction', name: 'Colour correction', treatment: 'Colour correction', price: 160, priceType: 'from', duration: 240, patch: true, weight: 1, description: 'Consultation required before booking.' },
    ],
  },
  {
    key: 'barber',
    name: 'Barber',
    color: 'amber',
    description: 'Beard and shave services',
    services: [
      { key: 'barber-cut', name: 'Classic barber cut', treatment: 'Haircut', price: 20, duration: 40, weight: 8, description: 'Traditional cut, hot towel finish.' },
      { key: 'skin-fade', name: 'Skin fade', treatment: 'Fade haircut', price: 22, duration: 45, weight: 7, description: 'Sharp fade blended to the skin.' },
      { key: 'beard-trim', name: 'Beard trim', treatment: 'Beard trim', price: 12, duration: 30, weight: 6, description: 'Shape, line-up and beard oil.' },
      { key: 'hot-shave', name: 'Hot towel shave', treatment: 'Beard shave', price: 18, duration: 40, weight: 3, description: 'Straight-razor shave with hot towels.' },
      { key: 'cut-beard', name: 'Cut & beard', treatment: 'Haircut & beard trim', price: 28, duration: 60, weight: 5, description: 'Haircut plus full beard shape.' },
      { key: 'grey-blend', name: 'Grey blending', treatment: 'Hair colouring', price: 18, duration: 30, processing: 10, patch: true, weight: 1, description: 'Subtle grey reduction for hair or beard.' },
    ],
  },
  {
    key: 'nails',
    name: 'Nails',
    color: 'pink',
    description: 'Manicures, pedicures and nail art',
    services: [
      { key: 'manicure', name: 'Manicure', treatment: 'Manicure', price: 18, duration: 40, weight: 6, description: 'Shape, cuticle care and polish.' },
      { key: 'gel-mani', name: 'Gel manicure', treatment: 'Gel manicure', price: 28, duration: 60, weight: 8, description: 'Long-lasting gel polish.' },
      { key: 'pedicure', name: 'Pedicure', treatment: 'Pedicure', price: 25, duration: 50, weight: 4, description: 'Soak, exfoliation and polish.' },
      { key: 'gel-pedi', name: 'Gel pedicure', treatment: 'Gel pedicure', price: 32, duration: 70, weight: 3, description: 'Pedicure finished with gel polish.' },
      { key: 'acrylic', name: 'Acrylic full set', treatment: 'Acrylic nails', price: 40, duration: 90, weight: 3, description: 'Full set of acrylic extensions.' },
      { key: 'gel-removal', name: 'Gel removal', treatment: 'Nail polish removal', price: 8, duration: 20, weight: 2, description: 'Gentle soak-off removal.' },
    ],
  },
  {
    key: 'skin',
    name: 'Skin & face',
    color: 'teal',
    description: 'Facials, brows and lashes',
    services: [
      { key: 'facial', name: 'Classic facial', treatment: 'Facial', price: 50, duration: 60, weight: 4, description: 'Cleanse, exfoliate, extract and mask.' },
      { key: 'hydra-facial', name: 'Hydrating facial', treatment: 'Hydrating facial', price: 65, duration: 75, weight: 3, description: 'Deep hydration for dry or tired skin.' },
      { key: 'brow-shape', name: 'Eyebrow shaping', treatment: 'Eyebrow shaping', price: 10, duration: 20, weight: 5, description: 'Wax and tweeze to shape.' },
      { key: 'brow-tint', name: 'Brow tint', treatment: 'Eyebrow tinting', price: 8, duration: 15, patch: true, weight: 3, description: 'Defines and darkens brows.' },
      { key: 'lash-lift', name: 'Lash lift', treatment: 'Lash lift', price: 38, duration: 45, patch: true, weight: 3, description: 'Curl and lift natural lashes.' },
      { key: 'lash-tint', name: 'Lash tint', treatment: 'Eyelash tinting', price: 12, duration: 20, patch: true, weight: 2, description: 'Darker lashes without mascara.' },
      { key: 'leg-wax', name: 'Full leg wax', treatment: 'Leg waxing', price: 28, duration: 45, weight: 2, description: 'Full leg hot or strip wax.' },
    ],
  },
  {
    key: 'spa',
    name: 'Massage & spa',
    color: 'green',
    description: 'Massages and body treatments',
    services: [
      { key: 'relax-massage', name: 'Relaxing massage', treatment: 'Swedish massage', price: 55, duration: 60, weight: 6, description: 'Full-body Swedish massage.', variants: [ { name: '30 minutes', price: 35, duration: 30 }, { name: '90 minutes', price: 75, duration: 90 } ] },
      { key: 'deep-tissue', name: 'Deep tissue massage', treatment: 'Deep tissue massage', price: 60, duration: 60, weight: 4, description: 'Firm pressure for muscle tension.' },
      { key: 'hot-stone', name: 'Hot stone massage', treatment: 'Hot stone massage', price: 70, duration: 75, weight: 2, description: 'Heated basalt stones and oil.' },
      { key: 'head-massage', name: 'Indian head massage', treatment: 'Head massage', price: 25, duration: 30, weight: 3, description: 'Head, neck and shoulders.' },
      { key: 'reflexology', name: 'Reflexology', treatment: 'Reflexology', price: 40, duration: 45, weight: 2, description: 'Pressure-point foot therapy.' },
      { key: 'body-scrub', name: 'Body scrub', treatment: 'Body scrub', price: 45, duration: 45, weight: 1, description: 'Sea-salt exfoliation and moisturise.' },
      { key: 'couples', name: 'Back, neck & shoulders', treatment: 'Back massage', price: 35, duration: 30, weight: 3, description: 'Targeted upper-body massage.' },
    ],
  },
]

export const PRODUCT_SEED: { name: string; brand: string; category: string; supplier: number; supply: number; retail: number; measure: string; amount: number; stock: number }[] = [
  { name: 'Argan repair shampoo', brand: 'Atlântica', category: 'Hair care', supplier: 0, supply: 6.5, retail: 16.9, measure: 'ml', amount: 300, stock: 24 },
  { name: 'Argan repair conditioner', brand: 'Atlântica', category: 'Hair care', supplier: 0, supply: 6.9, retail: 17.9, measure: 'ml', amount: 300, stock: 18 },
  { name: 'Argan hair oil', brand: 'Atlântica', category: 'Hair care', supplier: 0, supply: 9, retail: 24.5, measure: 'ml', amount: 100, stock: 12 },
  { name: 'Colour protect shampoo', brand: 'Atlântica', category: 'Hair care', supplier: 0, supply: 7.2, retail: 18.5, measure: 'ml', amount: 300, stock: 15 },
  { name: 'Colour protect mask', brand: 'Atlântica', category: 'Hair care', supplier: 0, supply: 8.4, retail: 21.9, measure: 'ml', amount: 200, stock: 4 },
  { name: 'Volume mousse', brand: 'Douro Pro', category: 'Styling', supplier: 0, supply: 5.1, retail: 13.5, measure: 'ml', amount: 250, stock: 20 },
  { name: 'Heat protect spray', brand: 'Douro Pro', category: 'Styling', supplier: 0, supply: 5.8, retail: 15.9, measure: 'ml', amount: 200, stock: 16 },
  { name: 'Matte clay', brand: 'Douro Pro', category: 'Styling', supplier: 1, supply: 6, retail: 16, measure: 'g', amount: 75, stock: 3 },
  { name: 'Sea salt texture spray', brand: 'Douro Pro', category: 'Styling', supplier: 0, supply: 5.5, retail: 14.5, measure: 'ml', amount: 200, stock: 11 },
  { name: 'Flexible hairspray', brand: 'Douro Pro', category: 'Styling', supplier: 0, supply: 4.9, retail: 12.9, measure: 'ml', amount: 400, stock: 22 },
  { name: 'Beard oil cedar', brand: 'Barbearia Norte', category: 'Men', supplier: 1, supply: 7, retail: 19, measure: 'ml', amount: 30, stock: 14 },
  { name: 'Beard balm', brand: 'Barbearia Norte', category: 'Men', supplier: 1, supply: 6.5, retail: 17.5, measure: 'g', amount: 60, stock: 9 },
  { name: 'Shaving cream', brand: 'Barbearia Norte', category: 'Men', supplier: 1, supply: 5, retail: 13, measure: 'ml', amount: 150, stock: 8 },
  { name: 'Aftershave balm', brand: 'Barbearia Norte', category: 'Men', supplier: 1, supply: 6.2, retail: 16.5, measure: 'ml', amount: 100, stock: 2 },
  { name: 'Pomade strong hold', brand: 'Barbearia Norte', category: 'Men', supplier: 1, supply: 5.9, retail: 15.5, measure: 'g', amount: 100, stock: 17 },
  { name: 'Cuticle oil', brand: 'Unha & Arte', category: 'Nails', supplier: 2, supply: 3.2, retail: 9.5, measure: 'ml', amount: 15, stock: 30 },
  { name: 'Strengthening base coat', brand: 'Unha & Arte', category: 'Nails', supplier: 2, supply: 4.1, retail: 11.9, measure: 'ml', amount: 12, stock: 13 },
  { name: 'Quick-dry top coat', brand: 'Unha & Arte', category: 'Nails', supplier: 2, supply: 4.1, retail: 11.9, measure: 'ml', amount: 12, stock: 10 },
  { name: 'Hand cream rose', brand: 'Unha & Arte', category: 'Nails', supplier: 2, supply: 3.8, retail: 10.5, measure: 'ml', amount: 75, stock: 19 },
  { name: 'Nail polish Ribeira red', brand: 'Unha & Arte', category: 'Nails', supplier: 2, supply: 3.5, retail: 9.9, measure: 'ml', amount: 12, stock: 6 },
  { name: 'Gentle cleansing gel', brand: 'Pele Viva', category: 'Skin care', supplier: 2, supply: 8.5, retail: 22, measure: 'ml', amount: 200, stock: 12 },
  { name: 'Hydrating serum', brand: 'Pele Viva', category: 'Skin care', supplier: 2, supply: 14, retail: 36, measure: 'ml', amount: 30, stock: 7 },
  { name: 'Daily moisturiser SPF 30', brand: 'Pele Viva', category: 'Skin care', supplier: 2, supply: 11, retail: 29, measure: 'ml', amount: 50, stock: 9 },
  { name: 'Clay detox mask', brand: 'Pele Viva', category: 'Skin care', supplier: 2, supply: 9, retail: 24, measure: 'ml', amount: 75, stock: 1 },
  { name: 'Eye contour cream', brand: 'Pele Viva', category: 'Skin care', supplier: 2, supply: 12, retail: 31, measure: 'ml', amount: 15, stock: 5 },
  { name: 'Lavender massage oil', brand: 'Pele Viva', category: 'Body', supplier: 2, supply: 7.5, retail: 19.5, measure: 'ml', amount: 100, stock: 14 },
  { name: 'Sea salt body scrub', brand: 'Pele Viva', category: 'Body', supplier: 2, supply: 8, retail: 21, measure: 'g', amount: 250, stock: 8 },
  { name: 'Body lotion fig', brand: 'Pele Viva', category: 'Body', supplier: 2, supply: 6.5, retail: 17, measure: 'ml', amount: 250, stock: 11 },
  { name: 'Wide-tooth comb', brand: 'Douro Pro', category: 'Accessories', supplier: 0, supply: 2, retail: 6.5, measure: 'whole', amount: 1, stock: 25 },
  { name: 'Silk scrunchie set', brand: 'Douro Pro', category: 'Accessories', supplier: 0, supply: 3.5, retail: 12, measure: 'whole', amount: 1, stock: 0 },
]

export const SUPPLIER_SEED = [
  { name: 'Distribuidora Capilar Norte', first: 'Helena', last: 'Matos', email: 'encomendas@capilarnorte.example.com', phone: '+351 222 014 330', street: 'Rua de Cedofeita 211', city: 'Porto', postcode: '4050-179', description: 'Hair care and styling wholesale' },
  { name: 'Barbearia Norte Lda', first: 'Paulo', last: 'Reis', email: 'vendas@barbearianorte.example.com', phone: '+351 223 116 902', street: 'Rua do Almada 87', city: 'Porto', postcode: '4050-036', description: 'Grooming products for barbers' },
  { name: 'Estética Profissional Ibérica', first: 'Carla', last: 'Mendes', email: 'orders@esteticaiberica.example.com', phone: '+351 229 381 447', street: 'Avenida da Boavista 1280', city: 'Porto', postcode: '4100-116', description: 'Nails, skin and spa supplies' },
]

export const REVIEW_TEXTS: Record<number, string[]> = {
  5: [
    'Absolutely loved it. Will be back!',
    'Best haircut I have had in Porto. Friendly team and spotless salon.',
    'So relaxing, I nearly fell asleep. Highly recommend.',
    'Always on time and the result is perfect every visit.',
    'My colour came out exactly as I wanted. Thank you!',
    'Great atmosphere, great coffee, great fade.',
    'Gel nails lasted three weeks without a chip.',
    'Professional, kind and attentive to detail.',
    '',
  ],
  4: ['Very good service, just a short wait at reception.', 'Lovely result, a bit pricey but worth it.', 'Nice experience overall.', ''],
  3: ['Good but not quite what I asked for.', 'Fine, nothing special.'],
  2: ['Started 20 minutes late and felt rushed.'],
  1: ['Appointment was moved without much notice.'],
}

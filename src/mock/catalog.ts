import type { PaletteColor } from '@/types'
import type { Bi } from './text'

/**
 * Fixed catalogue for the seed: 6 categories, 40 services (SPEC §4). Text is
 * kept in both languages ([English, Portuguese]) and resolved with `tx()`
 * when the seed is built.
 */
export interface ServiceSeed {
  key: string
  name: Bi
  treatment: Bi
  price: number
  priceType?: 'fixed' | 'from'
  duration: number
  processing?: number
  variants?: { name: Bi; price: number; duration: number }[]
  patch?: boolean
  weight: number
  description: Bi
}

export interface CategorySeed {
  key: string
  name: Bi
  color: PaletteColor
  description: Bi
  services: ServiceSeed[]
}

const SHORT_HAIR: Bi = ['Short hair', 'Cabelo curto']
const LONG_HAIR: Bi = ['Long hair', 'Cabelo comprido']
const HAIRCUT: Bi = ['Haircut', 'Corte de cabelo']
const BLOW_DRY: Bi = ['Blow dry', 'Brushing']
const HAIR_COLOURING: Bi = ['Hair colouring', 'Coloração']

export const CATEGORY_SEED: CategorySeed[] = [
  {
    key: 'hair',
    name: ['Hair & styling', 'Cabelo e penteados'],
    color: 'blue',
    description: ['Cuts, blow-dries and styling', 'Cortes, brushings e penteados'],
    services: [
      { key: 'womens-cut', name: ["Women's haircut", 'Corte de senhora'], treatment: HAIRCUT, price: 38, duration: 60, weight: 9, description: ['Consultation, wash, precision cut and finish.', 'Consulta, lavagem, corte de precisão e finalização.'], variants: [ { name: SHORT_HAIR, price: 32, duration: 45 }, { name: LONG_HAIR, price: 42, duration: 75 } ] },
      { key: 'mens-cut', name: ["Men's haircut", 'Corte de homem'], treatment: HAIRCUT, price: 18, duration: 30, weight: 7, description: ['Scissor or clipper cut with a wash and style.', 'Corte à tesoura ou à máquina, com lavagem e finalização.'] },
      { key: 'blow-dry', name: BLOW_DRY, treatment: BLOW_DRY, price: 25, duration: 45, weight: 8, description: ['Smooth, volumised blow dry.', 'Brushing liso e com volume.'] },
      { key: 'wash-blow', name: ['Wash & blow dry', 'Lavagem e brushing'], treatment: BLOW_DRY, price: 28, duration: 50, weight: 5, description: ['Relaxing wash with a deep-condition rinse and blow dry.', 'Lavagem relaxante com condicionador nutritivo e brushing.'] },
      { key: 'updo', name: ['Updo & event styling', 'Apanhado e penteado para eventos'], treatment: ['Updo', 'Apanhado'], price: 55, duration: 75, weight: 2, description: ['Bridal, party and event hair.', 'Penteados para noivas, festas e eventos.'] },
      { key: 'kids-cut', name: ['Kids haircut (under 12)', 'Corte de criança (até 12 anos)'], treatment: ['Kids haircut', 'Corte de criança'], price: 14, duration: 30, weight: 3, description: ['Quick, friendly cuts for children.', 'Cortes rápidos e descontraídos para crianças.'] },
      { key: 'keratin', name: ['Keratin smoothing treatment', 'Alisamento com queratina'], treatment: ['Keratin treatment', 'Tratamento de queratina'], price: 120, priceType: 'from', duration: 150, weight: 1, description: ['Frizz control that lasts up to 3 months.', 'Controlo do frizz que dura até 3 meses.'] },
      { key: 'fringe', name: ['Fringe trim', 'Aparar franja'], treatment: ['Fringe trim', 'Aparar franja'], price: 8, duration: 15, weight: 2, description: ['Quick tidy between cuts.', 'Retoque rápido entre cortes.'] },
    ],
  },
  {
    key: 'colour',
    name: ['Colour', 'Coloração'],
    color: 'purple',
    description: ['Colour, highlights and toners', 'Coloração, madeixas e tonalizantes'],
    services: [
      { key: 'root', name: ['Root touch-up', 'Retoque de raiz'], treatment: ['Root touch up', 'Retoque de raiz'], price: 48, duration: 60, processing: 30, patch: true, weight: 5, description: ['Covers regrowth up to 3 cm.', 'Cobre o crescimento da raiz até 3 cm.'] },
      { key: 'full-colour', name: ['Full head colour', 'Coloração completa'], treatment: HAIR_COLOURING, price: 65, duration: 75, processing: 35, patch: true, weight: 4, description: ['Single-process permanent colour.', 'Coloração permanente numa só aplicação.'], variants: [ { name: SHORT_HAIR, price: 58, duration: 60 }, { name: LONG_HAIR, price: 78, duration: 90 } ] },
      { key: 'balayage', name: ['Balayage', 'Balayage'], treatment: ['Balayage', 'Balayage'], price: 110, priceType: 'from', duration: 150, processing: 30, patch: true, weight: 3, description: ['Hand-painted, soft and natural lightening.', 'Aclaramento suave e natural, pintado à mão.'] },
      { key: 'highlights', name: ['Highlights (half head)', 'Madeixas (meia cabeça)'], treatment: ['Highlights', 'Madeixas'], price: 75, duration: 90, processing: 30, patch: true, weight: 3, description: ['Foil highlights through the top and sides.', 'Madeixas em papel de alumínio no topo e nas laterais.'] },
      { key: 'toner', name: ['Toner & gloss', 'Tonalizante e brilho'], treatment: ['Toner', 'Tonalizante'], price: 30, duration: 45, weight: 3, description: ['Refresh tone and add shine.', 'Renova o tom e dá brilho.'] },
      { key: 'correction', name: ['Colour correction', 'Correção de cor'], treatment: ['Colour correction', 'Correção de cor'], price: 160, priceType: 'from', duration: 240, patch: true, weight: 1, description: ['Consultation required before booking.', 'É necessária uma consulta antes da marcação.'] },
    ],
  },
  {
    key: 'barber',
    name: ['Barber', 'Barbearia'],
    color: 'amber',
    description: ['Beard and shave services', 'Serviços de barba e barbear'],
    services: [
      { key: 'barber-cut', name: ['Classic barber cut', 'Corte clássico de barbeiro'], treatment: HAIRCUT, price: 20, duration: 40, weight: 8, description: ['Traditional cut, hot towel finish.', 'Corte tradicional, finalizado com toalha quente.'] },
      { key: 'skin-fade', name: ['Skin fade', 'Skin fade'], treatment: ['Fade haircut', 'Corte fade'], price: 22, duration: 45, weight: 7, description: ['Sharp fade blended to the skin.', 'Fade preciso, esbatido até à pele.'] },
      { key: 'beard-trim', name: ['Beard trim', 'Aparar barba'], treatment: ['Beard trim', 'Aparar barba'], price: 12, duration: 30, weight: 6, description: ['Shape, line-up and beard oil.', 'Modelação, contornos e óleo de barba.'] },
      { key: 'hot-shave', name: ['Hot towel shave', 'Barbear com toalha quente'], treatment: ['Beard shave', 'Barbear'], price: 18, duration: 40, weight: 3, description: ['Straight-razor shave with hot towels.', 'Barbear à navalha com toalhas quentes.'] },
      { key: 'cut-beard', name: ['Cut & beard', 'Corte e barba'], treatment: ['Haircut & beard trim', 'Corte e barba'], price: 28, duration: 60, weight: 5, description: ['Haircut plus full beard shape.', 'Corte de cabelo e modelação completa da barba.'] },
      { key: 'grey-blend', name: ['Grey blending', 'Camuflagem de brancos'], treatment: HAIR_COLOURING, price: 18, duration: 30, processing: 10, patch: true, weight: 1, description: ['Subtle grey reduction for hair or beard.', 'Redução subtil dos brancos no cabelo ou na barba.'] },
    ],
  },
  {
    key: 'nails',
    name: ['Nails', 'Unhas'],
    color: 'pink',
    description: ['Manicures, pedicures and nail art', 'Manicures, pedicures e nail art'],
    services: [
      { key: 'manicure', name: ['Manicure', 'Manicure'], treatment: ['Manicure', 'Manicure'], price: 18, duration: 40, weight: 6, description: ['Shape, cuticle care and polish.', 'Limagem, cuidado das cutículas e verniz.'] },
      { key: 'gel-mani', name: ['Gel manicure', 'Manicure de gel'], treatment: ['Gel manicure', 'Manicure de gel'], price: 28, duration: 60, weight: 8, description: ['Long-lasting gel polish.', 'Verniz de gel de longa duração.'] },
      { key: 'pedicure', name: ['Pedicure', 'Pedicure'], treatment: ['Pedicure', 'Pedicure'], price: 25, duration: 50, weight: 4, description: ['Soak, exfoliation and polish.', 'Imersão, esfoliação e verniz.'] },
      { key: 'gel-pedi', name: ['Gel pedicure', 'Pedicure de gel'], treatment: ['Gel pedicure', 'Pedicure de gel'], price: 32, duration: 70, weight: 3, description: ['Pedicure finished with gel polish.', 'Pedicure finalizada com verniz de gel.'] },
      { key: 'acrylic', name: ['Acrylic full set', 'Alongamento em acrílico'], treatment: ['Acrylic nails', 'Unhas de acrílico'], price: 40, duration: 90, weight: 3, description: ['Full set of acrylic extensions.', 'Aplicação completa de extensões de acrílico.'] },
      { key: 'gel-removal', name: ['Gel removal', 'Remoção de gel'], treatment: ['Nail polish removal', 'Remoção de verniz'], price: 8, duration: 20, weight: 2, description: ['Gentle soak-off removal.', 'Remoção suave por imersão.'] },
    ],
  },
  {
    key: 'skin',
    name: ['Skin & face', 'Pele e rosto'],
    color: 'teal',
    description: ['Facials, brows and lashes', 'Tratamentos faciais, sobrancelhas e pestanas'],
    services: [
      { key: 'facial', name: ['Classic facial', 'Limpeza de pele clássica'], treatment: ['Facial', 'Tratamento facial'], price: 50, duration: 60, weight: 4, description: ['Cleanse, exfoliate, extract and mask.', 'Limpeza, esfoliação, extração e máscara.'] },
      { key: 'hydra-facial', name: ['Hydrating facial', 'Tratamento facial hidratante'], treatment: ['Hydrating facial', 'Tratamento facial hidratante'], price: 65, duration: 75, weight: 3, description: ['Deep hydration for dry or tired skin.', 'Hidratação profunda para pele seca ou cansada.'] },
      { key: 'brow-shape', name: ['Eyebrow shaping', 'Design de sobrancelhas'], treatment: ['Eyebrow shaping', 'Design de sobrancelhas'], price: 10, duration: 20, weight: 5, description: ['Wax and tweeze to shape.', 'Cera e pinça para dar forma.'] },
      { key: 'brow-tint', name: ['Brow tint', 'Coloração de sobrancelhas'], treatment: ['Eyebrow tinting', 'Coloração de sobrancelhas'], price: 8, duration: 15, patch: true, weight: 3, description: ['Defines and darkens brows.', 'Define e escurece as sobrancelhas.'] },
      { key: 'lash-lift', name: ['Lash lift', 'Lifting de pestanas'], treatment: ['Lash lift', 'Lifting de pestanas'], price: 38, duration: 45, patch: true, weight: 3, description: ['Curl and lift natural lashes.', 'Curva e levanta as pestanas naturais.'] },
      { key: 'lash-tint', name: ['Lash tint', 'Coloração de pestanas'], treatment: ['Eyelash tinting', 'Coloração de pestanas'], price: 12, duration: 20, patch: true, weight: 2, description: ['Darker lashes without mascara.', 'Pestanas mais escuras sem máscara.'] },
      { key: 'leg-wax', name: ['Full leg wax', 'Depilação de perna inteira'], treatment: ['Leg waxing', 'Depilação de pernas'], price: 28, duration: 45, weight: 2, description: ['Full leg hot or strip wax.', 'Perna inteira com cera quente ou com bandas.'] },
    ],
  },
  {
    key: 'spa',
    name: ['Massage & spa', 'Massagem e spa'],
    color: 'green',
    description: ['Massages and body treatments', 'Massagens e tratamentos de corpo'],
    services: [
      { key: 'relax-massage', name: ['Relaxing massage', 'Massagem de relaxamento'], treatment: ['Swedish massage', 'Massagem sueca'], price: 55, duration: 60, weight: 6, description: ['Full-body Swedish massage.', 'Massagem sueca de corpo inteiro.'], variants: [ { name: ['30 minutes', '30 minutos'], price: 35, duration: 30 }, { name: ['90 minutes', '90 minutos'], price: 75, duration: 90 } ] },
      { key: 'deep-tissue', name: ['Deep tissue massage', 'Massagem de tecidos profundos'], treatment: ['Deep tissue massage', 'Massagem de tecidos profundos'], price: 60, duration: 60, weight: 4, description: ['Firm pressure for muscle tension.', 'Pressão firme para aliviar a tensão muscular.'] },
      { key: 'hot-stone', name: ['Hot stone massage', 'Massagem com pedras quentes'], treatment: ['Hot stone massage', 'Massagem com pedras quentes'], price: 70, duration: 75, weight: 2, description: ['Heated basalt stones and oil.', 'Pedras de basalto aquecidas e óleo.'] },
      { key: 'head-massage', name: ['Indian head massage', 'Massagem indiana de cabeça'], treatment: ['Head massage', 'Massagem de cabeça'], price: 25, duration: 30, weight: 3, description: ['Head, neck and shoulders.', 'Cabeça, pescoço e ombros.'] },
      { key: 'reflexology', name: ['Reflexology', 'Reflexologia'], treatment: ['Reflexology', 'Reflexologia'], price: 40, duration: 45, weight: 2, description: ['Pressure-point foot therapy.', 'Terapia de pontos de pressão nos pés.'] },
      { key: 'body-scrub', name: ['Body scrub', 'Esfoliação corporal'], treatment: ['Body scrub', 'Esfoliação corporal'], price: 45, duration: 45, weight: 1, description: ['Sea-salt exfoliation and moisturise.', 'Esfoliação com sal marinho e hidratação.'] },
      { key: 'couples', name: ['Back, neck & shoulders', 'Costas, pescoço e ombros'], treatment: ['Back massage', 'Massagem de costas'], price: 35, duration: 30, weight: 3, description: ['Targeted upper-body massage.', 'Massagem localizada na parte superior do corpo.'] },
    ],
  },
]

const HAIR_CARE: Bi = ['Hair care', 'Cuidado capilar']
const STYLING: Bi = ['Styling', 'Finalização']
const MEN: Bi = ['Men', 'Homem']
const NAILS: Bi = ['Nails', 'Unhas']
const SKIN_CARE: Bi = ['Skin care', 'Cuidado de pele']
const BODY: Bi = ['Body', 'Corpo']
const ACCESSORIES: Bi = ['Accessories', 'Acessórios']

/** Products; `category` ids follow the order of the English names (pcat_0…). Brand names are not translated. */
export const PRODUCT_SEED: { name: Bi; brand: string; category: Bi; supplier: number; supply: number; retail: number; measure: string; amount: number; stock: number }[] = [
  { name: ['Argan repair shampoo', 'Champô reparador de argão'], brand: 'Atlântica', category: HAIR_CARE, supplier: 0, supply: 6.5, retail: 16.9, measure: 'ml', amount: 300, stock: 24 },
  { name: ['Argan repair conditioner', 'Condicionador reparador de argão'], brand: 'Atlântica', category: HAIR_CARE, supplier: 0, supply: 6.9, retail: 17.9, measure: 'ml', amount: 300, stock: 18 },
  { name: ['Argan hair oil', 'Óleo capilar de argão'], brand: 'Atlântica', category: HAIR_CARE, supplier: 0, supply: 9, retail: 24.5, measure: 'ml', amount: 100, stock: 12 },
  { name: ['Colour protect shampoo', 'Champô proteção da cor'], brand: 'Atlântica', category: HAIR_CARE, supplier: 0, supply: 7.2, retail: 18.5, measure: 'ml', amount: 300, stock: 15 },
  { name: ['Colour protect mask', 'Máscara proteção da cor'], brand: 'Atlântica', category: HAIR_CARE, supplier: 0, supply: 8.4, retail: 21.9, measure: 'ml', amount: 200, stock: 4 },
  { name: ['Volume mousse', 'Espuma de volume'], brand: 'Douro Pro', category: STYLING, supplier: 0, supply: 5.1, retail: 13.5, measure: 'ml', amount: 250, stock: 20 },
  { name: ['Heat protect spray', 'Spray protetor térmico'], brand: 'Douro Pro', category: STYLING, supplier: 0, supply: 5.8, retail: 15.9, measure: 'ml', amount: 200, stock: 16 },
  { name: ['Matte clay', 'Argila mate'], brand: 'Douro Pro', category: STYLING, supplier: 1, supply: 6, retail: 16, measure: 'g', amount: 75, stock: 3 },
  { name: ['Sea salt texture spray', 'Spray texturizante de sal marinho'], brand: 'Douro Pro', category: STYLING, supplier: 0, supply: 5.5, retail: 14.5, measure: 'ml', amount: 200, stock: 11 },
  { name: ['Flexible hairspray', 'Laca de fixação flexível'], brand: 'Douro Pro', category: STYLING, supplier: 0, supply: 4.9, retail: 12.9, measure: 'ml', amount: 400, stock: 22 },
  { name: ['Beard oil cedar', 'Óleo de barba cedro'], brand: 'Barbearia Norte', category: MEN, supplier: 1, supply: 7, retail: 19, measure: 'ml', amount: 30, stock: 14 },
  { name: ['Beard balm', 'Bálsamo de barba'], brand: 'Barbearia Norte', category: MEN, supplier: 1, supply: 6.5, retail: 17.5, measure: 'g', amount: 60, stock: 9 },
  { name: ['Shaving cream', 'Creme de barbear'], brand: 'Barbearia Norte', category: MEN, supplier: 1, supply: 5, retail: 13, measure: 'ml', amount: 150, stock: 8 },
  { name: ['Aftershave balm', 'Bálsamo pós-barba'], brand: 'Barbearia Norte', category: MEN, supplier: 1, supply: 6.2, retail: 16.5, measure: 'ml', amount: 100, stock: 2 },
  { name: ['Pomade strong hold', 'Pomada fixação forte'], brand: 'Barbearia Norte', category: MEN, supplier: 1, supply: 5.9, retail: 15.5, measure: 'g', amount: 100, stock: 17 },
  { name: ['Cuticle oil', 'Óleo de cutículas'], brand: 'Unha & Arte', category: NAILS, supplier: 2, supply: 3.2, retail: 9.5, measure: 'ml', amount: 15, stock: 30 },
  { name: ['Strengthening base coat', 'Base fortalecedora'], brand: 'Unha & Arte', category: NAILS, supplier: 2, supply: 4.1, retail: 11.9, measure: 'ml', amount: 12, stock: 13 },
  { name: ['Quick-dry top coat', 'Top coat de secagem rápida'], brand: 'Unha & Arte', category: NAILS, supplier: 2, supply: 4.1, retail: 11.9, measure: 'ml', amount: 12, stock: 10 },
  { name: ['Hand cream rose', 'Creme de mãos rosa'], brand: 'Unha & Arte', category: NAILS, supplier: 2, supply: 3.8, retail: 10.5, measure: 'ml', amount: 75, stock: 19 },
  { name: ['Nail polish Ribeira red', 'Verniz vermelho Ribeira'], brand: 'Unha & Arte', category: NAILS, supplier: 2, supply: 3.5, retail: 9.9, measure: 'ml', amount: 12, stock: 6 },
  { name: ['Gentle cleansing gel', 'Gel de limpeza suave'], brand: 'Pele Viva', category: SKIN_CARE, supplier: 2, supply: 8.5, retail: 22, measure: 'ml', amount: 200, stock: 12 },
  { name: ['Hydrating serum', 'Sérum hidratante'], brand: 'Pele Viva', category: SKIN_CARE, supplier: 2, supply: 14, retail: 36, measure: 'ml', amount: 30, stock: 7 },
  { name: ['Daily moisturiser SPF 30', 'Hidratante diário SPF 30'], brand: 'Pele Viva', category: SKIN_CARE, supplier: 2, supply: 11, retail: 29, measure: 'ml', amount: 50, stock: 9 },
  { name: ['Clay detox mask', 'Máscara detox de argila'], brand: 'Pele Viva', category: SKIN_CARE, supplier: 2, supply: 9, retail: 24, measure: 'ml', amount: 75, stock: 1 },
  { name: ['Eye contour cream', 'Creme de contorno de olhos'], brand: 'Pele Viva', category: SKIN_CARE, supplier: 2, supply: 12, retail: 31, measure: 'ml', amount: 15, stock: 5 },
  { name: ['Lavender massage oil', 'Óleo de massagem de lavanda'], brand: 'Pele Viva', category: BODY, supplier: 2, supply: 7.5, retail: 19.5, measure: 'ml', amount: 100, stock: 14 },
  { name: ['Sea salt body scrub', 'Esfoliante corporal de sal marinho'], brand: 'Pele Viva', category: BODY, supplier: 2, supply: 8, retail: 21, measure: 'g', amount: 250, stock: 8 },
  { name: ['Body lotion fig', 'Loção corporal figo'], brand: 'Pele Viva', category: BODY, supplier: 2, supply: 6.5, retail: 17, measure: 'ml', amount: 250, stock: 11 },
  { name: ['Wide-tooth comb', 'Pente de dentes largos'], brand: 'Douro Pro', category: ACCESSORIES, supplier: 0, supply: 2, retail: 6.5, measure: 'whole', amount: 1, stock: 25 },
  { name: ['Silk scrunchie set', 'Conjunto de elásticos de seda'], brand: 'Douro Pro', category: ACCESSORIES, supplier: 0, supply: 3.5, retail: 12, measure: 'whole', amount: 1, stock: 0 },
]

export const SUPPLIER_SEED: { name: string; first: string; last: string; email: string; phone: string; street: string; city: string; postcode: string; description: Bi }[] = [
  { name: 'Distribuidora Capilar Norte', first: 'Helena', last: 'Matos', email: 'encomendas@capilarnorte.example.com', phone: '+351 222 014 330', street: 'Rua de Cedofeita 211', city: 'Porto', postcode: '4050-179', description: ['Hair care and styling wholesale', 'Grossista de cuidado capilar e finalização'] },
  { name: 'Barbearia Norte Lda', first: 'Paulo', last: 'Reis', email: 'vendas@barbearianorte.example.com', phone: '+351 223 116 902', street: 'Rua do Almada 87', city: 'Porto', postcode: '4050-036', description: ['Grooming products for barbers', 'Produtos de barbearia para profissionais'] },
  { name: 'Estética Profissional Ibérica', first: 'Carla', last: 'Mendes', email: 'orders@esteticaiberica.example.com', phone: '+351 229 381 447', street: 'Avenida da Boavista 1280', city: 'Porto', postcode: '4100-116', description: ['Nails, skin and spa supplies', 'Material para unhas, pele e spa'] },
]

/** Review texts per rating. Each language has the same number of entries (the faker sequence picks by index). */
export const REVIEW_TEXTS: Record<number, Bi[]> = {
  5: [
    ['Absolutely loved it. Will be back!', 'Adorei. Vou voltar de certeza!'],
    ['Best haircut I have had in Porto. Friendly team and spotless salon.', 'O melhor corte que já fiz no Porto. Equipa simpática e salão impecável.'],
    ['So relaxing, I nearly fell asleep. Highly recommend.', 'Tão relaxante que quase adormeci. Recomendo muito.'],
    ['Always on time and the result is perfect every visit.', 'Sempre pontuais e o resultado é perfeito em todas as visitas.'],
    ['My colour came out exactly as I wanted. Thank you!', 'A cor ficou exatamente como eu queria. Obrigada!'],
    ['Great atmosphere, great coffee, great fade.', 'Ótimo ambiente, ótimo café, ótimo fade.'],
    ['Gel nails lasted three weeks without a chip.', 'As unhas de gel duraram três semanas sem lascar.'],
    ['Professional, kind and attentive to detail.', 'Profissionais, simpáticos e atentos ao detalhe.'],
    ['', ''],
  ],
  4: [
    ['Very good service, just a short wait at reception.', 'Muito bom serviço, só uma pequena espera na receção.'],
    ['Lovely result, a bit pricey but worth it.', 'Resultado lindo, um pouco caro mas vale a pena.'],
    ['Nice experience overall.', 'No geral, uma boa experiência.'],
    ['', ''],
  ],
  3: [
    ['Good but not quite what I asked for.', 'Bom, mas não foi bem o que pedi.'],
    ['Fine, nothing special.', 'Razoável, nada de especial.'],
  ],
  2: [['Started 20 minutes late and felt rushed.', 'Começou 20 minutos atrasado e foi tudo muito apressado.']],
  1: [['Appointment was moved without much notice.', 'A marcação foi alterada quase sem aviso prévio.']],
}

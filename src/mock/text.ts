import { getLang } from '@/i18n/language'

/**
 * Bilingual seed text. The demo data is written in the language active when
 * `buildSeed` runs (Portuguese by default, English for tests). Ids, prices,
 * dates and the faker sequence never depend on the language.
 */

/** A seed text in both languages: [English, European Portuguese]. */
export type Bi = readonly [en: string, pt: string]

/** True while the seed is built in Portuguese. Read at call time only, never at module load. */
export const isPt = (): boolean => getLang() === 'pt'

/** English or Portuguese, for the language active now. */
export const L = (en: string, pt: string): string => (isPt() ? pt : en)

/** Resolves a bilingual pair for the language active now. */
export const tx = (text: Bi): string => (isPt() ? text[1] : text[0])

/** Lower-cases the first letter (dates in the middle of a Portuguese sentence). */
export const lowerFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1)

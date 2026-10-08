import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '@locales/en.json'
import { SECTION_LOCALES } from '@/app/sectionRegistry'

type Tree = Record<string, unknown>
const isTree = (v: unknown): v is Tree => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Deep merge so a section file can extend a key that also exists in locales/en.json. */
function merge(base: Tree, extra: Tree): Tree {
  const out: Tree = { ...base }
  for (const [key, value] of Object.entries(extra)) out[key] = isTree(value) && isTree(out[key]) ? merge(out[key] as Tree, value) : value
  return out
}

// Section strings live under their section key (e.g. t('clients.list.title')).
void i18n.use(initReactI18next).init({
  resources: { en: { translation: merge(en as Tree, SECTION_LOCALES as Tree) } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
})

export default i18n

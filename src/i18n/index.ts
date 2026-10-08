import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '@locales/en.json'
import pt from '@locales/pt.json'
import { getLang, localeTag, onLangChange, type Lang } from './language'

type Tree = Record<string, unknown>
const isTree = (v: unknown): v is Tree => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Deep merge so a parts file can extend a key that also exists in the main locale file. */
function merge(base: Tree, extra: Tree): Tree {
  const out: Tree = { ...base }
  for (const [key, value] of Object.entries(extra)) out[key] = isTree(value) && isTree(out[key]) ? merge(out[key] as Tree, value) : value
  return out
}

// Extra string files while work is in progress: locales/parts/<name>.en.json and <name>.pt.json.
const PARTS = import.meta.glob<Tree>('/locales/parts/*.json', { eager: true, import: 'default' })
const partsFor = (lang: Lang) =>
  Object.entries(PARTS)
    .filter(([file]) => file.endsWith(`.${lang}.json`))
    .reduce<Tree>((all, [, tree]) => merge(all, tree), {})

/** i18next language code: 'pt-PT' so plural rules are European Portuguese (0 is plural). */
const i18nCode = (lang: Lang) => (lang === 'pt' ? 'pt-PT' : 'en')

function applyDocumentLang(lang: Lang) {
  if (typeof document !== 'undefined') document.documentElement.lang = localeTag(lang)
}

// Section strings live under their section key (e.g. t('clients.list.title')).
// Missing Portuguese strings fall back to English.
void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: merge(en as Tree, partsFor('en')) },
    'pt-PT': { translation: merge(pt as Tree, partsFor('pt')) },
  },
  lng: i18nCode(getLang()),
  fallbackLng: 'en',
  supportedLngs: ['pt-PT', 'en'],
  interpolation: { escapeValue: false },
  returnNull: false,
})
applyDocumentLang(getLang())

onLangChange((lang) => {
  void i18n.changeLanguage(i18nCode(lang))
  applyDocumentLang(lang)
})

export default i18n

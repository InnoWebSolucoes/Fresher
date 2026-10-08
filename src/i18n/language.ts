import { useSyncExternalStore } from 'react'

/** Portuguese (Portugal) is the primary language; English is the secondary one. */
export type Lang = 'pt' | 'en'
export const LANGS: Lang[] = ['pt', 'en']
export const DEFAULT_LANG: Lang = 'pt'

const STORAGE_KEY = 'ib-lang'

function stored(): Lang {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'pt' || value === 'en') return value
  } catch {
    // Storage blocked (private mode): use the default.
  }
  return DEFAULT_LANG
}

let current: Lang = stored()
const listeners = new Set<(lang: Lang) => void>()

export const getLang = (): Lang => current

/** BCP 47 tag for Intl number/date formatting. */
export const localeTag = (lang: Lang = current) => (lang === 'pt' ? 'pt-PT' : 'en-IE')

export function setLang(lang: Lang) {
  if (lang === current) return
  current = lang
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // Not persisted; still switches for this visit.
  }
  listeners.forEach((listener) => listener(lang))
}

export function onLangChange(listener: (lang: Lang) => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/** Current language; re-renders when it changes. */
export function useLang(): Lang {
  return useSyncExternalStore(onLangChange, getLang, getLang)
}
